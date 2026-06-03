use axum::{
    extract::{Path, State},
    Extension, Json,
};
use uuid::Uuid;

use crate::{auth::models::AuthClaims, error::{AppError, Result}, state::AppState};
use super::models::{Campaign, CreateCampaign, UpdateCampaign};

pub async fn list_campaigns(State(state): State<AppState>) -> Result<Json<Vec<Campaign>>> {
    let campaigns = sqlx::query_as::<_, Campaign>(
        "SELECT * FROM campaigns ORDER BY created_at DESC",
    )
    .fetch_all(&state.db)
    .await?;
    Ok(Json(campaigns))
}

pub async fn create_campaign(
    State(state): State<AppState>,
    Extension(claims): Extension<AuthClaims>,
    Json(req): Json<CreateCampaign>,
) -> Result<Json<Campaign>> {
    let campaign = sqlx::query_as::<_, Campaign>(
        "INSERT INTO campaigns (name, description, created_by) VALUES ($1, $2, $3)
         RETURNING *",
    )
    .bind(&req.name)
    .bind(&req.description)
    .bind(claims.sub)
    .fetch_one(&state.db)
    .await?;
    Ok(Json(campaign))
}

pub async fn get_campaign(
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
) -> Result<Json<Campaign>> {
    let campaign = sqlx::query_as::<_, Campaign>("SELECT * FROM campaigns WHERE id = $1")
        .bind(id)
        .fetch_optional(&state.db)
        .await?
        .ok_or(AppError::NotFound)?;
    Ok(Json(campaign))
}

pub async fn update_campaign(
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
    Json(req): Json<UpdateCampaign>,
) -> Result<Json<Campaign>> {
    let campaign = sqlx::query_as::<_, Campaign>(
        "UPDATE campaigns
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
    Ok(Json(campaign))
}

pub async fn delete_campaign(
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
) -> Result<Json<serde_json::Value>> {
    let result = sqlx::query("DELETE FROM campaigns WHERE id = $1")
        .bind(id)
        .execute(&state.db)
        .await?;
    if result.rows_affected() == 0 {
        return Err(AppError::NotFound);
    }
    Ok(Json(serde_json::json!({ "deleted": true })))
}
