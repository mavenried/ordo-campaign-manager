use std::convert::Infallible;

use axum::{
    extract::{Path, State},
    response::sse::{Event, KeepAlive, Sse},
    Extension, Json,
};
use chrono::Local;
use futures::StreamExt;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use uuid::Uuid;

use crate::{
    auth::models::AuthClaims,
    error::{AppError, Result},
    state::AppState,
    wizard::ai::{complete, stream_chat, Message},
};

#[derive(Deserialize)]
pub struct StartWizard {
    pub campaign_id: Uuid,
    pub campaign_name: String,
}

#[derive(Deserialize)]
pub struct WizardMessage {
    pub content: String,
}

#[derive(Serialize, Deserialize)]
pub struct GeneratedTask {
    pub title: String,
    pub description: Option<String>,
    pub due_days_from_now: Option<i64>,
    pub depends_on_titles: Option<Vec<String>>,
}

#[derive(Serialize)]
pub struct GenerateResult {
    pub tasks_created: usize,
}

fn campaign_system_prompt(campaign_name: &str) -> String {
    format!(
        "You are a project management expert helping plan the campaign '{campaign_name}'. \
         Your goal is to understand the campaign's objectives, scope, timeline, and requirements \
         through focused questions — one at a time. Ask about: goals, target audience, timeline, \
         budget constraints, team size, key deliverables, and any dependencies or blockers.\n\n\
         After 4-6 exchanges when you have a clear picture, tell the user: \
         'I have enough information to generate your task breakdown. Click **Generate Tasks** when ready.'\n\n\
         Be concise and conversational."
    )
}

fn generate_prompt(campaign_name: &str) -> String {
    format!(
        "Based on our conversation about the campaign '{campaign_name}', \
         generate a comprehensive, realistic task breakdown.\n\n\
         Return ONLY valid JSON — no explanation, no markdown, no code fences:\n\
         {{\n  \"tasks\": [\n    {{\n      \"title\": \"Task title\",\n      \
         \"description\": \"What needs to be done and why\",\n      \
         \"due_days_from_now\": 14,\n      \
         \"depends_on_titles\": [\"Exact title of prerequisite task\"]\n    }}\n  ]\n}}\n\n\
         Rules:\n\
         - Include ALL tasks needed to execute this campaign end-to-end\n\
         - depends_on_titles must be exact titles of other tasks in the list\n\
         - due_days_from_now: realistic estimates (7=one week, 14=two weeks, 30=one month)\n\
         - Order tasks chronologically\n\
         - Leave depends_on_titles empty [] if no prerequisites"
    )
}

pub async fn start_wizard(
    State(state): State<AppState>,
    Extension(claims): Extension<AuthClaims>,
    Json(req): Json<StartWizard>,
) -> Result<Json<Value>> {
    let system = campaign_system_prompt(&req.campaign_name);
    let opening = vec![Message {
        role: "user".into(),
        content: format!("I want to plan the campaign '{}'. Help me figure out what tasks we need.", req.campaign_name),
    }];

    let first_message = complete(&state.ai, &system, &opening)
        .await
        .map_err(|_| AppError::Internal)?;

    let messages_json = json!([
        { "role": "user", "content": opening[0].content },
        { "role": "assistant", "content": first_message },
    ]);

    let session_id: Uuid = sqlx::query_scalar(
        "INSERT INTO wizard_sessions (family_name, campaign_id, created_by, messages)
         VALUES ($1, $2, $3, $4) RETURNING id",
    )
    .bind(&req.campaign_name)
    .bind(req.campaign_id)
    .bind(claims.sub)
    .bind(&messages_json)
    .fetch_one(&state.db)
    .await?;

    Ok(Json(json!({ "session_id": session_id, "message": first_message })))
}

pub async fn wizard_message(
    State(state): State<AppState>,
    Path(session_id): Path<Uuid>,
    Json(req): Json<WizardMessage>,
) -> Result<Sse<impl futures::Stream<Item = std::result::Result<Event, Infallible>>>> {
    use sqlx::Row;
    let row = sqlx::query("SELECT family_name, messages, finalized FROM wizard_sessions WHERE id = $1")
        .bind(session_id)
        .fetch_optional(&state.db)
        .await?
        .ok_or(AppError::NotFound)?;

    if row.try_get::<bool, _>("finalized").unwrap_or(false) {
        return Err(AppError::BadRequest("session already finalized".into()));
    }

    let campaign_name: String = row.try_get("family_name").unwrap_or_default();
    let messages_val: Value = row.try_get("messages").unwrap_or_else(|_| json!([]));
    let mut messages: Vec<Message> = serde_json::from_value(messages_val).unwrap_or_default();
    messages.push(Message { role: "user".into(), content: req.content.clone() });

    let system = campaign_system_prompt(&campaign_name);
    let ai = state.ai.clone();
    let db = state.db.clone();
    let msgs_for_stream = messages.clone();

    let stream = async_stream::stream! {
        match stream_chat(&ai, &system, &msgs_for_stream).await {
            Ok(mut s) => {
                let mut full = String::new();
                while let Some(chunk) = s.next().await {
                    full.push_str(&chunk);
                    yield Ok(Event::default().data(chunk));
                }
                let mut updated = msgs_for_stream.clone();
                updated.push(Message { role: "assistant".into(), content: full });
                let msgs_json = serde_json::to_value(&updated).unwrap_or_default();
                let _ = sqlx::query("UPDATE wizard_sessions SET messages = $1 WHERE id = $2")
                    .bind(msgs_json).bind(session_id).execute(&db).await;
                yield Ok(Event::default().event("done").data(""));
            }
            Err(e) => {
                yield Ok(Event::default().event("error").data(e.to_string()));
            }
        }
    };

    Ok(Sse::new(stream).keep_alive(KeepAlive::default()))
}

pub async fn generate_tasks(
    State(state): State<AppState>,
    Path(session_id): Path<Uuid>,
) -> Result<Json<GenerateResult>> {
    use sqlx::Row;
    let row = sqlx::query("SELECT family_name, campaign_id, messages FROM wizard_sessions WHERE id = $1")
        .bind(session_id)
        .fetch_optional(&state.db)
        .await?
        .ok_or(AppError::NotFound)?;

    let campaign_name: String = row.try_get("family_name").unwrap_or_default();
    let campaign_id: Option<Uuid> = row.try_get("campaign_id").ok().flatten();
    let campaign_id = campaign_id.ok_or(AppError::BadRequest("no campaign_id on session".into()))?;

    let messages_val: Value = row.try_get("messages").unwrap_or_else(|_| json!([]));
    let mut messages: Vec<Message> = serde_json::from_value(messages_val).unwrap_or_default();
    messages.push(Message {
        role: "user".into(),
        content: "Please generate the full task breakdown now.".into(),
    });

    let raw = complete(&state.ai, &generate_prompt(&campaign_name), &messages)
        .await
        .map_err(|_| AppError::Internal)?;

    let cleaned = raw.trim()
        .trim_start_matches("```json").trim_start_matches("```")
        .trim_end_matches("```").trim();

    let parsed: Value = serde_json::from_str(cleaned)
        .map_err(|_| AppError::BadRequest("AI returned invalid JSON".into()))?;

    let tasks: Vec<GeneratedTask> = serde_json::from_value(parsed["tasks"].clone())
        .map_err(|_| AppError::BadRequest("Invalid task list format".into()))?;

    let today = Local::now().date_naive();
    let mut created_ids: Vec<(String, Uuid)> = Vec::new();

    // First pass: create all tasks (without dependencies)
    for t in &tasks {
        let due_date = t.due_days_from_now.map(|d| today + chrono::Duration::days(d));
        let id: Uuid = sqlx::query_scalar(
            "INSERT INTO tasks (campaign_id, title, description, due_date)
             VALUES ($1, $2, $3, $4) RETURNING id",
        )
        .bind(campaign_id)
        .bind(&t.title)
        .bind(&t.description)
        .bind(due_date)
        .fetch_one(&state.db)
        .await?;
        created_ids.push((t.title.clone(), id));
    }

    // Second pass: wire dependencies by title matching
    for t in &tasks {
        if let Some(deps) = &t.depends_on_titles {
            let task_id = created_ids.iter().find(|(title, _)| title == &t.title).map(|(_, id)| *id);
            if let Some(task_id) = task_id {
                for dep_title in deps {
                    if let Some((_, dep_id)) = created_ids.iter().find(|(title, _)| title == dep_title) {
                        sqlx::query(
                            "INSERT INTO task_dependencies (task_id, depends_on) VALUES ($1, $2) ON CONFLICT DO NOTHING",
                        )
                        .bind(task_id).bind(dep_id).execute(&state.db).await?;
                    }
                }
            }
        }
    }

    sqlx::query("UPDATE wizard_sessions SET finalized = true WHERE id = $1")
        .bind(session_id).execute(&state.db).await?;

    Ok(Json(GenerateResult { tasks_created: created_ids.len() }))
}
