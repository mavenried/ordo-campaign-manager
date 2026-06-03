use axum::{
    extract::{Path, State},
    Json,
};
use serde_json::json;
use uuid::Uuid;

use crate::{error::{AppError, Result}, state::AppState};
use super::models::{CreateFamily, TaskFamily, UpdateFamily};

pub async fn list_families(
    State(state): State<AppState>,
    Path(campaign_id): Path<Uuid>,
) -> Result<Json<Vec<TaskFamily>>> {
    let families = sqlx::query_as::<_, TaskFamily>(
        "SELECT * FROM task_families WHERE campaign_id = $1 ORDER BY created_at ASC",
    )
    .bind(campaign_id)
    .fetch_all(&state.db)
    .await?;
    Ok(Json(families))
}

pub async fn create_family(
    State(state): State<AppState>,
    Path(campaign_id): Path<Uuid>,
    Json(req): Json<CreateFamily>,
) -> Result<Json<TaskFamily>> {
    let schema = req.template_schema.unwrap_or_else(|| json!({"fields": []}));
    let color = req.color.unwrap_or_else(|| "#6366f1".to_string());

    let family = sqlx::query_as::<_, TaskFamily>(
        "INSERT INTO task_families (campaign_id, name, description, color, template_schema)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING *",
    )
    .bind(campaign_id)
    .bind(&req.name)
    .bind(&req.description)
    .bind(&color)
    .bind(&schema)
    .fetch_one(&state.db)
    .await?;
    Ok(Json(family))
}

pub async fn get_family(
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
) -> Result<Json<TaskFamily>> {
    let family = sqlx::query_as::<_, TaskFamily>(
        "SELECT * FROM task_families WHERE id = $1",
    )
    .bind(id)
    .fetch_optional(&state.db)
    .await?
    .ok_or(AppError::NotFound)?;
    Ok(Json(family))
}

pub async fn update_family(
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
    Json(req): Json<UpdateFamily>,
) -> Result<Json<TaskFamily>> {
    let family = sqlx::query_as::<_, TaskFamily>(
        "UPDATE task_families
         SET name            = COALESCE($1, name),
             description     = COALESCE($2, description),
             color           = COALESCE($3, color),
             template_schema = COALESCE($4, template_schema),
             updated_at      = now()
         WHERE id = $5
         RETURNING *",
    )
    .bind(req.name)
    .bind(req.description)
    .bind(req.color)
    .bind(req.template_schema)
    .bind(id)
    .fetch_optional(&state.db)
    .await?
    .ok_or(AppError::NotFound)?;
    Ok(Json(family))
}

pub async fn delete_family(
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
) -> Result<Json<serde_json::Value>> {
    let result = sqlx::query("DELETE FROM task_families WHERE id = $1")
        .bind(id)
        .execute(&state.db)
        .await?;
    if result.rows_affected() == 0 {
        return Err(AppError::NotFound);
    }
    Ok(Json(json!({ "deleted": true })))
}
