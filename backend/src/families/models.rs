use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use uuid::Uuid;

#[derive(Serialize, sqlx::FromRow)]
pub struct TaskFamily {
    pub id: Uuid,
    pub campaign_id: Uuid,
    pub name: String,
    pub description: Option<String>,
    pub color: String,
    pub template_schema: Value,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Deserialize)]
pub struct CreateFamily {
    pub name: String,
    pub description: Option<String>,
    pub color: Option<String>,
    pub template_schema: Option<Value>,
}

#[derive(Deserialize)]
pub struct UpdateFamily {
    pub name: Option<String>,
    pub description: Option<String>,
    pub color: Option<String>,
    pub template_schema: Option<Value>,
}
