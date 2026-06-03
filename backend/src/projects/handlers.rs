use axum::{
    extract::{Path, State},
    Extension, Json,
};
use uuid::Uuid;

use crate::{auth::models::AuthClaims, error::{AppError, Result}, state::AppState};
use super::models::{CreateProject, Project, UpdateProject};

pub async fn list_projects(State(state): State<AppState>) -> Result<Json<Vec<Project>>> {
    let projects = sqlx::query_as::<_, Project>(
        "SELECT * FROM projects ORDER BY created_at DESC",
    )
    .fetch_all(&state.db)
    .await?;
    Ok(Json(projects))
}

pub async fn create_project(
    State(state): State<AppState>,
    Extension(claims): Extension<AuthClaims>,
    Json(req): Json<CreateProject>,
) -> Result<Json<Project>> {
    let project = sqlx::query_as::<_, Project>(
        "INSERT INTO projects (name, description, created_by) VALUES ($1, $2, $3)
         RETURNING *",
    )
    .bind(&req.name)
    .bind(&req.description)
    .bind(claims.sub)
    .fetch_one(&state.db)
    .await?;
    Ok(Json(project))
}

pub async fn get_project(
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
) -> Result<Json<Project>> {
    let project = sqlx::query_as::<_, Project>("SELECT * FROM projects WHERE id = $1")
        .bind(id)
        .fetch_optional(&state.db)
        .await?
        .ok_or(AppError::NotFound)?;
    Ok(Json(project))
}

pub async fn update_project(
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
    Json(req): Json<UpdateProject>,
) -> Result<Json<Project>> {
    let project = sqlx::query_as::<_, Project>(
        "UPDATE projects
         SET name = COALESCE($1, name),
             description = COALESCE($2, description),
             updated_at = now()
         WHERE id = $3
         RETURNING *",
    )
    .bind(req.name)
    .bind(req.description)
    .bind(id)
    .fetch_optional(&state.db)
    .await?
    .ok_or(AppError::NotFound)?;
    Ok(Json(project))
}

pub async fn delete_project(
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
) -> Result<Json<serde_json::Value>> {
    let result = sqlx::query("DELETE FROM projects WHERE id = $1")
        .bind(id)
        .execute(&state.db)
        .await?;
    if result.rows_affected() == 0 {
        return Err(AppError::NotFound);
    }
    Ok(Json(serde_json::json!({ "deleted": true })))
}
