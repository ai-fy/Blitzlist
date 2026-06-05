-- Mark the canonical state field as `open: true` on every template.
--
-- Open single_select fields accept values outside their declared options;
-- the tool/web layer is responsible for recording novel values somewhere
-- visible (lists.meta_json.extra_state_options for state).
--
-- This lets users introduce new workflow states without first editing the
-- template — drag a card to a new kanban swimlane, or set_state to a value
-- the template never declared, and it just works.
--
-- Idempotent: only rewrites rows that have a state field which isn't
-- already marked open.

UPDATE templates
SET
  fields_schema_json = (
    SELECT json_group_array(
      CASE
        WHEN json_extract(value, '$.key') = 'state'
             AND json_extract(value, '$.type') = 'single_select'
        THEN json_set(value, '$.open', json('true'))
        ELSE json(value)
      END
    )
    FROM json_each(templates.fields_schema_json)
  ),
  updated_at = unixepoch()
WHERE EXISTS (
  SELECT 1
  FROM json_each(templates.fields_schema_json) e
  WHERE json_extract(e.value, '$.key') = 'state'
    AND json_extract(e.value, '$.type') = 'single_select'
    AND json_extract(e.value, '$.open') IS NULL
);
