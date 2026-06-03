ALTER TABLE projects RENAME TO campaigns;
ALTER TABLE task_families RENAME COLUMN project_id TO campaign_id;
ALTER TABLE wizard_sessions RENAME COLUMN project_id TO campaign_id;
ALTER TABLE chat_sessions RENAME COLUMN project_id TO campaign_id;
