use axum::{
    extract::{Path, State},
    Extension, Json,
};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::{error::{AppError, Result}, state::AppState};
use crate::auth::models::AuthClaims;

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

#[derive(Deserialize)]
pub struct UpdateRoleRequest {
    pub role: String,
}

pub async fn update_user_role(
    State(state): State<AppState>,
    Extension(claims): Extension<AuthClaims>,
    Path(user_id): Path<Uuid>,
    Json(req): Json<UpdateRoleRequest>,
) -> Result<Json<UserSummary>> {
    if req.role != "admin" && req.role != "member" {
        return Err(AppError::BadRequest("role must be 'admin' or 'member'".into()));
    }
    if claims.sub == user_id {
        return Err(AppError::BadRequest("cannot change your own role".into()));
    }

    let user = sqlx::query_as::<_, UserSummary>(
        "UPDATE users SET role = $1, updated_at = now() WHERE id = $2
         RETURNING id, name, email, role",
    )
    .bind(&req.role)
    .bind(user_id)
    .fetch_optional(&state.db)
    .await?
    .ok_or(AppError::NotFound)?;

    Ok(Json(user))
}
