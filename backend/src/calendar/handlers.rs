use axum::{extract::State, Json};
use chrono::NaiveDate;
use serde::Serialize;
use uuid::Uuid;

use crate::{error::Result, state::AppState};

#[derive(Serialize, sqlx::FromRow)]
pub struct CalendarTask {
    pub id: Uuid,
    pub title: String,
    pub status: String,
    pub start_date: Option<NaiveDate>,
    pub due_date: Option<NaiveDate>,
    pub campaign_id: Option<Uuid>,
    pub campaign_name: String,
}

pub async fn get_calendar(State(state): State<AppState>) -> Result<Json<Vec<CalendarTask>>> {
    let tasks = sqlx::query_as::<_, CalendarTask>(
        "SELECT
            t.id,
            t.title,
            t.status::TEXT AS status,
            t.start_date,
            t.due_date,
            t.campaign_id,
            c.name AS campaign_name
         FROM tasks t
         JOIN campaigns c ON c.id = t.campaign_id
         WHERE t.start_date IS NOT NULL OR t.due_date IS NOT NULL
         ORDER BY COALESCE(t.start_date, t.due_date) ASC",
    )
    .fetch_all(&state.db)
    .await?;

    Ok(Json(tasks))
}
