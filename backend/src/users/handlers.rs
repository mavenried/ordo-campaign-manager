use axum::{extract::State, Json};
use serde::Serialize;
use uuid::Uuid;

use crate::{error::Result, state::AppState};

#[derive(Serialize, sqlx::FromRow)]
pub struct UserSummary {
    pub id: Uuid,
    pub name: String,
    pub email: String,
    pub role: String,
}

pub async fn list_users(State(state): State<AppState>) -> Result<Json<Vec<UserSummary>>> {
    let users = sqlx::query_as::<_, UserSummary>(
        "SELECT id, name, email, role FROM users ORDER BY name ASC",
    )
    .fetch_all(&state.db)
    .await?;

    Ok(Json(users))
}
