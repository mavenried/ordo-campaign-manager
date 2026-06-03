-- Move tasks directly under campaigns, remove family/template system
ALTER TABLE tasks ADD COLUMN campaign_id UUID REFERENCES campaigns(id) ON DELETE CASCADE;
ALTER TABLE tasks ADD COLUMN description TEXT;

-- Populate campaign_id from existing task_families for any existing tasks
UPDATE tasks t
SET campaign_id = tf.campaign_id
FROM task_families tf
WHERE tf.id = t.family_id;

ALTER TABLE tasks DROP COLUMN IF EXISTS family_id CASCADE;
ALTER TABLE tasks DROP COLUMN IF EXISTS form_data;

CREATE INDEX tasks_campaign_id ON tasks(campaign_id);
