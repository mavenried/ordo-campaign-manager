use chrono::{DateTime, NaiveDate, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Serialize, sqlx::FromRow)]
pub struct Task {
    pub id: Uuid,
    pub campaign_id: Option<Uuid>,
    pub title: String,
    pub description: Option<String>,
    pub status: String,
    pub start_date: Option<NaiveDate>,
    pub due_date: Option<NaiveDate>,
    pub created_by: Option<Uuid>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Serialize)]
pub struct TaskWithExtras {
    #[serde(flatten)]
    pub task: Task,
    pub assignee_ids: Vec<Uuid>,
    pub depends_on: Vec<Uuid>,
    pub blocked_by_incomplete: bool,
}

#[derive(Deserialize)]
pub struct CreateTask {
    pub title: String,
    pub description: Option<String>,
    pub start_date: Option<NaiveDate>,
    pub due_date: Option<NaiveDate>,
    pub assignee_ids: Option<Vec<Uuid>>,
    pub depends_on: Option<Vec<Uuid>>,
}

#[derive(Deserialize)]
pub struct UpdateTask {
    pub title: Option<String>,
    pub description: Option<String>,
    pub status: Option<String>,
    pub start_date: Option<NaiveDate>,
    pub due_date: Option<NaiveDate>,
}

#[derive(Deserialize)]
pub struct AddAssignee {
    pub user_id: Uuid,
}

#[derive(Deserialize)]
pub struct AddDependency {
    pub depends_on: Uuid,
}

#[derive(Serialize, sqlx::FromRow)]
pub struct AssignedTask {
    pub id: Uuid,
    pub campaign_id: Option<Uuid>,
    pub campaign_name: String,
    pub title: String,
    pub description: Option<String>,
    pub status: String,
    pub due_date: Option<chrono::NaiveDate>,
    pub depends_on: serde_json::Value,
    pub assignee_ids: serde_json::Value,
}
