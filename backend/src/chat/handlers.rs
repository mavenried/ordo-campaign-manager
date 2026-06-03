use std::convert::Infallible;

use axum::{
    extract::{Path, State},
    response::sse::{Event, KeepAlive, Sse},
    Extension, Json,
};
use chrono::{DateTime, Utc};
use futures::StreamExt;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use uuid::Uuid;

use crate::{
    auth::models::AuthClaims,
    error::{AppError, Result},
    state::AppState,
    wizard::ai::{stream_chat, Message},
};
use super::context::{build_context, build_campaign_context};

#[derive(Serialize, sqlx::FromRow)]
pub struct ChatSession {
    pub id: Uuid,
    pub campaign_id: Option<Uuid>,
    pub created_by: Uuid,
    pub created_at: DateTime<Utc>,
}

#[derive(Serialize, sqlx::FromRow)]
pub struct ChatMessageRow {
    pub id: Uuid,
    pub session_id: Uuid,
    pub role: String,
    pub content: String,
    pub context_refs: Value,
    pub created_at: DateTime<Utc>,
}

#[derive(Deserialize)]
pub struct CreateSession {
    pub campaign_id: Option<Uuid>,
}

#[derive(Deserialize)]
pub struct SendMessage {
    pub content: String,
    pub context_refs: Option<Vec<Value>>,
}

pub async fn list_sessions(
    State(state): State<AppState>,
    Extension(claims): Extension<AuthClaims>,
) -> Result<Json<Vec<ChatSession>>> {
    let sessions = sqlx::query_as::<_, ChatSession>(
        "SELECT id, campaign_id, created_by, created_at FROM chat_sessions
         WHERE created_by = $1 ORDER BY created_at DESC",
    )
    .bind(claims.sub)
    .fetch_all(&state.db)
    .await?;
    Ok(Json(sessions))
}

pub async fn create_session(
    State(state): State<AppState>,
    Extension(claims): Extension<AuthClaims>,
    Json(req): Json<CreateSession>,
) -> Result<Json<ChatSession>> {
    let session = sqlx::query_as::<_, ChatSession>(
        "INSERT INTO chat_sessions (campaign_id, created_by) VALUES ($1, $2)
         RETURNING id, campaign_id, created_by, created_at",
    )
    .bind(req.campaign_id)
    .bind(claims.sub)
    .fetch_one(&state.db)
    .await?;
    Ok(Json(session))
}

pub async fn list_messages(
    State(state): State<AppState>,
    Path(session_id): Path<Uuid>,
) -> Result<Json<Vec<ChatMessageRow>>> {
    let messages = sqlx::query_as::<_, ChatMessageRow>(
        "SELECT id, session_id, role, content, context_refs, created_at
         FROM chat_messages WHERE session_id = $1 ORDER BY created_at ASC",
    )
    .bind(session_id)
    .fetch_all(&state.db)
    .await?;
    Ok(Json(messages))
}

pub async fn send_message(
    State(state): State<AppState>,
    Path(session_id): Path<Uuid>,
    Json(req): Json<SendMessage>,
) -> Result<Sse<impl futures::Stream<Item = std::result::Result<Event, Infallible>>>> {
    let exists = sqlx::query_scalar::<_, bool>(
        "SELECT EXISTS(SELECT 1 FROM chat_sessions WHERE id = $1)",
    )
    .bind(session_id)
    .fetch_one(&state.db)
    .await?;

    if !exists {
        return Err(AppError::NotFound);
    }

    let context_refs = req.context_refs.unwrap_or_default();
    let refs_json = serde_json::to_value(&context_refs).unwrap_or_default();

    // Fetch the session's campaign_id for automatic context
    let campaign_id = sqlx::query_scalar::<_, Option<Uuid>>(
        "SELECT campaign_id FROM chat_sessions WHERE id = $1",
    )
    .bind(session_id)
    .fetch_one(&state.db)
    .await?;

    sqlx::query(
        "INSERT INTO chat_messages (session_id, role, content, context_refs)
         VALUES ($1, 'user', $2, $3)",
    )
    .bind(session_id)
    .bind(&req.content)
    .bind(&refs_json)
    .execute(&state.db)
    .await?;

    let history = sqlx::query_as::<_, (String, String)>(
        "SELECT role, content FROM chat_messages WHERE session_id = $1 ORDER BY created_at ASC",
    )
    .bind(session_id)
    .fetch_all(&state.db)
    .await?;

    let context_str = build_context(&state.db, &context_refs).await;
    let campaign_context = build_campaign_context(&state.db, campaign_id).await;
    let system = format!(
        "You are a helpful project management assistant. Help the user brainstorm, clarify, and \
         ideate about their tasks and projects. Be concise and practical.{campaign_context}{context_str}"
    );

    let messages: Vec<Message> = history
        .into_iter()
        .map(|(role, content)| Message { role, content })
        .collect();

    let ai = state.ai.clone();
    let db = state.db.clone();

    let stream = async_stream::stream! {
        match stream_chat(&ai, &system, &messages).await {
            Ok(mut s) => {
                let mut full = String::new();
                while let Some(chunk) = s.next().await {
                    full.push_str(&chunk);
                    yield Ok(Event::default().data(chunk));
                }
                let _ = sqlx::query(
                    "INSERT INTO chat_messages (session_id, role, content) VALUES ($1, 'assistant', $2)",
                )
                .bind(session_id)
                .bind(full)
                .execute(&db)
                .await;
                yield Ok(Event::default().event("done").data(""));
            }
            Err(e) => {
                yield Ok(Event::default().event("error").data(e.to_string()));
            }
        }
    };

    Ok(Sse::new(stream).keep_alive(KeepAlive::default()))
}

pub async fn delete_session(
    State(state): State<AppState>,
    Extension(claims): Extension<AuthClaims>,
    Path(session_id): Path<Uuid>,
) -> crate::error::Result<axum::Json<serde_json::Value>> {
    let result = sqlx::query(
        "DELETE FROM chat_sessions WHERE id = $1 AND created_by = $2",
    )
    .bind(session_id)
    .bind(claims.sub)
    .execute(&state.db)
    .await?;

    if result.rows_affected() == 0 {
        return Err(crate::error::AppError::NotFound);
    }
    Ok(axum::Json(serde_json::json!({ "deleted": true })))
}
