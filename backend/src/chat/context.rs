use serde_json::Value;
use sqlx::{PgPool, Row};
use uuid::Uuid;

pub async fn build_campaign_context(db: &PgPool, campaign_id: Option<Uuid>) -> String {
    let Some(id) = campaign_id else { return String::new() };

    let campaign = sqlx::query(
        "SELECT name, description FROM campaigns WHERE id = $1",
    )
    .bind(id)
    .fetch_one(db)
    .await;

    let Ok(campaign_row) = campaign else { return String::new() };
    let name: String = campaign_row.try_get("name").unwrap_or_default();
    let description: String = campaign_row.try_get::<Option<String>, _>("description")
        .unwrap_or_default()
        .unwrap_or_default();

    let tasks = sqlx::query(
        "SELECT t.title, t.description, t.status::TEXT as status, t.due_date,
                STRING_AGG(u.name, ', ') as assignees
         FROM tasks t
         LEFT JOIN task_assignees ta ON ta.task_id = t.id
         LEFT JOIN users u ON u.id = ta.user_id
         WHERE t.campaign_id = $1
         GROUP BY t.id, t.title, t.description, t.status, t.due_date
         ORDER BY t.created_at ASC",
    )
    .bind(id)
    .fetch_all(db)
    .await
    .unwrap_or_default();

    let mut lines = vec![
        format!("\n\nCampaign: {name}"),
    ];
    if !description.is_empty() {
        lines.push(format!("Description: {description}"));
    }
    if !tasks.is_empty() {
        lines.push("Tasks:".to_string());
        for t in &tasks {
            let title: String = t.try_get("title").unwrap_or_default();
            let status: String = t.try_get("status").unwrap_or_default();
            let desc: String = t.try_get::<Option<String>, _>("description")
                .unwrap_or_default().unwrap_or_default();
            let assignees: String = t.try_get::<Option<String>, _>("assignees")
                .unwrap_or_default().unwrap_or_default();
            let due: String = t.try_get::<Option<String>, _>("due_date")
                .unwrap_or_default().unwrap_or_default();

            let mut parts = vec![format!("- [{status}] {title}")];
            if !desc.is_empty() { parts.push(format!("  {desc}")); }
            if !assignees.is_empty() { parts.push(format!("  Assigned to: {assignees}")); }
            if !due.is_empty() { parts.push(format!("  Due: {due}")); }
            lines.push(parts.join("\n"));
        }
    }

    lines.join("\n")
}

pub async fn build_context(db: &PgPool, context_refs: &[Value]) -> String {
    let mut parts: Vec<String> = Vec::new();

    for r in context_refs {
        let kind = r["type"].as_str().unwrap_or("");
        let id_str = r["id"].as_str().unwrap_or("");
        let Ok(id) = id_str.parse::<Uuid>() else { continue };

        match kind {
            "task" => {
                if let Ok(row) = sqlx::query(
                    "SELECT t.title, t.status::TEXT as status, t.form_data, f.name as family_name
                     FROM tasks t JOIN task_families f ON f.id = t.family_id
                     WHERE t.id = $1",
                )
                .bind(id)
                .fetch_one(db)
                .await
                {
                    let title: String = row.try_get("title").unwrap_or_default();
                    let status: String = row.try_get("status").unwrap_or_default();
                    let family_name: String = row.try_get("family_name").unwrap_or_default();
                    let form_data: Value = row.try_get("form_data").unwrap_or_default();
                    parts.push(format!(
                        "[Task: {title}] Family: {family_name} | Status: {status} | Data: {form_data}"
                    ));
                }
            }
            "family" => {
                if let Ok(row) = sqlx::query(
                    "SELECT name, description FROM task_families WHERE id = $1",
                )
                .bind(id)
                .fetch_one(db)
                .await
                {
                    let name: String = row.try_get("name").unwrap_or_default();
                    let description: String = row.try_get("description").unwrap_or_default();
                    parts.push(format!("[Family: {name}] {description}"));
                }
            }
            _ => {}
        }
    }

    if parts.is_empty() {
        String::new()
    } else {
        format!("\n\nContext provided by user:\n{}", parts.join("\n"))
    }
}
