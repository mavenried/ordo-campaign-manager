use axum::{
    extract::{Path, State},
    Extension, Json,
};
use serde_json::json;
use uuid::Uuid;

use crate::{auth::models::AuthClaims, error::{AppError, Result}, state::AppState};
use super::models::{AddAssignee, AddDependency, AssignedTask, CreateTask, Task, TaskWithExtras, UpdateTask};

async fn load_extras(db: &sqlx::PgPool, task: Task) -> Result<TaskWithExtras> {
    let assignee_ids: Vec<Uuid> = sqlx::query_scalar(
        "SELECT user_id FROM task_assignees WHERE task_id = $1",
    )
    .bind(task.id)
    .fetch_all(db)
    .await?;

    let depends_on: Vec<Uuid> = sqlx::query_scalar(
        "SELECT depends_on FROM task_dependencies WHERE task_id = $1",
    )
    .bind(task.id)
    .fetch_all(db)
    .await?;

    let blocked_by_incomplete = if depends_on.is_empty() {
        false
    } else {
        let count: i64 = sqlx::query_scalar(
            "SELECT COUNT(*) FROM tasks WHERE id = ANY($1) AND status != 'done'",
        )
        .bind(&depends_on)
        .fetch_one(db)
        .await?;
        count > 0
    };

    Ok(TaskWithExtras { task, assignee_ids, depends_on, blocked_by_incomplete })
}

pub async fn list_tasks(
    State(state): State<AppState>,
    Path(campaign_id): Path<Uuid>,
) -> Result<Json<Vec<TaskWithExtras>>> {
    let tasks = sqlx::query_as::<_, Task>(
        "SELECT id, campaign_id, title, description, status::TEXT as status,
                start_date, due_date, created_by, created_at, updated_at
         FROM tasks WHERE campaign_id = $1 ORDER BY due_date ASC NULLS LAST, created_at ASC",
    )
    .bind(campaign_id)
    .fetch_all(&state.db)
    .await?;

    let mut result = Vec::with_capacity(tasks.len());
    for task in tasks {
        result.push(load_extras(&state.db, task).await?);
    }
    Ok(Json(result))
}

pub async fn create_task(
    State(state): State<AppState>,
    Extension(claims): Extension<AuthClaims>,
    Path(campaign_id): Path<Uuid>,
    Json(req): Json<CreateTask>,
) -> Result<Json<TaskWithExtras>> {
    let task = sqlx::query_as::<_, Task>(
        "INSERT INTO tasks (campaign_id, title, description, start_date, due_date, created_by)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id, campaign_id, title, description, status::TEXT as status,
                   start_date, due_date, created_by, created_at, updated_at",
    )
    .bind(campaign_id)
    .bind(&req.title)
    .bind(&req.description)
    .bind(req.start_date)
    .bind(req.due_date)
    .bind(claims.sub)
    .fetch_one(&state.db)
    .await?;

    if let Some(ids) = &req.assignee_ids {
        for uid in ids {
            sqlx::query(
                "INSERT INTO task_assignees (task_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
            )
            .bind(task.id).bind(uid).execute(&state.db).await?;
        }
    }
    if let Some(deps) = &req.depends_on {
        for dep in deps {
            sqlx::query(
                "INSERT INTO task_dependencies (task_id, depends_on) VALUES ($1, $2) ON CONFLICT DO NOTHING",
            )
            .bind(task.id).bind(dep).execute(&state.db).await?;
        }
    }

    load_extras(&state.db, task).await.map(Json)
}

pub async fn get_task(
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
) -> Result<Json<TaskWithExtras>> {
    let task = sqlx::query_as::<_, Task>(
        "SELECT id, campaign_id, title, description, status::TEXT as status,
                start_date, due_date, created_by, created_at, updated_at
         FROM tasks WHERE id = $1",
    )
    .bind(id)
    .fetch_optional(&state.db)
    .await?
    .ok_or(AppError::NotFound)?;

    load_extras(&state.db, task).await.map(Json)
}

pub async fn update_task(
    State(state): State<AppState>,
    Extension(claims): Extension<AuthClaims>,
    Path(id): Path<Uuid>,
    Json(req): Json<UpdateTask>,
) -> Result<Json<Task>> {
    if claims.role != "admin" {
        let is_assigned = sqlx::query_scalar::<_, bool>(
            "SELECT EXISTS(SELECT 1 FROM task_assignees WHERE task_id = $1 AND user_id = $2)",
        )
        .bind(id).bind(claims.sub).fetch_one(&state.db).await?;
        if !is_assigned { return Err(AppError::Unauthorized); }
    }

    let task = sqlx::query_as::<_, Task>(
        "UPDATE tasks
         SET title       = COALESCE($1, title),
             description = COALESCE($2, description),
             status      = COALESCE($3::task_status, status),
             start_date  = COALESCE($4, start_date),
             due_date    = COALESCE($5, due_date),
             updated_at  = now()
         WHERE id = $6
         RETURNING id, campaign_id, title, description, status::TEXT as status,
                   start_date, due_date, created_by, created_at, updated_at",
    )
    .bind(req.title).bind(req.description).bind(req.status)
    .bind(req.start_date).bind(req.due_date).bind(id)
    .fetch_optional(&state.db).await?.ok_or(AppError::NotFound)?;
    Ok(Json(task))
}

pub async fn delete_task(
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
) -> Result<Json<serde_json::Value>> {
    let r = sqlx::query("DELETE FROM tasks WHERE id = $1").bind(id).execute(&state.db).await?;
    if r.rows_affected() == 0 { return Err(AppError::NotFound); }
    Ok(Json(json!({ "deleted": true })))
}

pub async fn add_assignee(
    State(state): State<AppState>,
    Path(task_id): Path<Uuid>,
    Json(req): Json<AddAssignee>,
) -> Result<Json<serde_json::Value>> {
    sqlx::query(
        "INSERT INTO task_assignees (task_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
    )
    .bind(task_id).bind(req.user_id).execute(&state.db).await?;
    Ok(Json(json!({ "assigned": true })))
}

pub async fn remove_assignee(
    State(state): State<AppState>,
    Path((task_id, user_id)): Path<(Uuid, Uuid)>,
) -> Result<Json<serde_json::Value>> {
    sqlx::query("DELETE FROM task_assignees WHERE task_id = $1 AND user_id = $2")
        .bind(task_id).bind(user_id).execute(&state.db).await?;
    Ok(Json(json!({ "removed": true })))
}

pub async fn add_dependency(
    State(state): State<AppState>,
    Path(task_id): Path<Uuid>,
    Json(req): Json<AddDependency>,
) -> Result<Json<serde_json::Value>> {
    sqlx::query(
        "INSERT INTO task_dependencies (task_id, depends_on) VALUES ($1, $2) ON CONFLICT DO NOTHING",
    )
    .bind(task_id).bind(req.depends_on).execute(&state.db).await?;
    Ok(Json(json!({ "added": true })))
}

pub async fn remove_dependency(
    State(state): State<AppState>,
    Path((task_id, dep_id)): Path<(Uuid, Uuid)>,
) -> Result<Json<serde_json::Value>> {
    sqlx::query("DELETE FROM task_dependencies WHERE task_id = $1 AND depends_on = $2")
        .bind(task_id).bind(dep_id).execute(&state.db).await?;
    Ok(Json(json!({ "removed": true })))
}

const ASSIGNED_TASKS_QUERY: &str = "
    SELECT
        t.id, t.campaign_id, c.name AS campaign_name,
        t.title, t.description, t.status::TEXT AS status, t.due_date,
        COALESCE((SELECT json_agg(td.depends_on) FROM task_dependencies td WHERE td.task_id = t.id), '[]') AS depends_on,
        COALESCE((SELECT json_agg(ta2.user_id) FROM task_assignees ta2 WHERE ta2.task_id = t.id), '[]') AS assignee_ids
    FROM tasks t
    JOIN campaigns c ON c.id = t.campaign_id
    JOIN task_assignees ta ON ta.task_id = t.id
    WHERE ta.user_id = $1
    ORDER BY t.due_date ASC NULLS LAST, c.name ASC, t.created_at ASC";

pub async fn my_tasks(
    State(state): State<AppState>,
    Extension(claims): Extension<AuthClaims>,
) -> Result<Json<Vec<AssignedTask>>> {
    let tasks = sqlx::query_as::<_, AssignedTask>(ASSIGNED_TASKS_QUERY)
        .bind(claims.sub)
        .fetch_all(&state.db)
        .await?;
    Ok(Json(tasks))
}

pub async fn user_tasks(
    State(state): State<AppState>,
    Path(user_id): Path<Uuid>,
) -> Result<Json<Vec<AssignedTask>>> {
    let tasks = sqlx::query_as::<_, AssignedTask>(ASSIGNED_TASKS_QUERY)
        .bind(user_id)
        .fetch_all(&state.db)
        .await?;
    Ok(Json(tasks))
}
