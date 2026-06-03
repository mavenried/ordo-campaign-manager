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
        "You are a project management expert helping plan the campaign '{campaign_name}'.\n\
         Your goal is to understand the campaign through focused questions — one at a time.\n\n\
         Cover these areas:\n\
         1. Campaign goals and KPIs\n\
         2. Target audience and key markets\n\
         3. Timeline and launch date\n\
         4. Online activities: website updates, app, paid ads, SEO/SEM, social media\n\
         5. Offline activities: on-ground events, media kit, print, PR\n\
         6. Key milestones and approval gates\n\
         7. Email marketing needs\n\
         8. Budget constraints and team size\n\n\
         After 4-6 exchanges when you have a clear picture, say:\n\
         'I have enough information to generate your task breakdown. Click **Generate Tasks** when ready.'\n\n\
         Be concise and conversational."
    )
}

fn generate_prompt(campaign_name: &str) -> String {
    format!(
        "Based on our conversation, generate a comprehensive task breakdown for '{campaign_name}'.\n\n\
         MANDATORY: Every campaign MUST include all 5 categories below, each structured as a \
         parent task with nested sub-tasks (2-3 levels deep). Use depends_on_titles to create \
         the parent-child hierarchy.\n\n\
         REQUIRED CATEGORIES:\n\
         1. ONLINE — parent: \"Online Campaign\"\n\
            Sub-tasks: Website/landing page, App content, Paid ads (Google/Meta/etc), \
            SEO/SEM, Social media content calendar, Digital creatives\n\
         2. OFFLINE — parent: \"Offline Campaign\"\n\
            Sub-tasks: On-ground activations, Media kit, Print/OOH materials, \
            PR & press outreach, Events/roadshows, Vendor coordination\n\
         3. MILESTONES — parent: \"Campaign Milestones\"\n\
            Sub-tasks: Kickoff meeting, Brief sign-off, Creative review, \
            Stakeholder approval, Soft launch, Full launch, Mid-campaign check\n\
         4. EMAILERS — parent: \"Email Marketing\"\n\
            Sub-tasks: Audience segmentation, Pre-launch teaser email, \
            Launch announcement, Follow-up sequence, Re-engagement email\n\
         5. POST CAMPAIGN ANALYSIS — parent: \"Post Campaign Analysis\"\n\
            Sub-tasks: Online metrics collection, Offline results compilation, \
            ROI & budget reconciliation, Learnings report, Final presentation\n\n\
         Return ONLY valid JSON — no explanation, no markdown, no code fences:\n\
         {{\"tasks\":[{{\"title\":\"...\",\"description\":\"...\",\"due_days_from_now\":14,\"depends_on_titles\":[\"...\"]}},{{\"title\":\"...\",\"description\":\"...\",\"due_days_from_now\":7,\"depends_on_titles\":[]}}]}}\n\n\
         Rules:\n\
         - Each category parent has depends_on_titles: []\n\
         - Each direct sub-task depends on its category parent title\n\
         - Deeper sub-tasks depend on their immediate parent task title\n\
         - depends_on_titles must be exact titles of other tasks in the list\n\
         - due_days_from_now: realistic based on discussed timeline (0=now, 7=1wk, 30=1mo, 60=2mo)\n\
         - Milestones and Post Campaign Analysis bookend the timeline\n\
         - Include all campaign-specific tasks gleaned from our conversation"
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
