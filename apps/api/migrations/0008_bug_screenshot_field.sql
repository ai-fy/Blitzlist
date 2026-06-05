-- Add a `screenshot` attachment field to the system bugs template.
--
-- BL-021 follow-on: now that files exist as a workspace primitive, the bug
-- template ships with a slot for a reproduction screenshot. The value is a
-- file_id (uuid) referencing the files table; the card renderer scans
-- fields_json for attachment-typed fields and renders the bytes inline.
--
-- Idempotent: only appends the field if it's not already present.

UPDATE templates
SET
  fields_schema_json = json_insert(
    fields_schema_json,
    '$[#]',
    json('{"key":"screenshot","type":"attachment","label":"Screenshot","description":"Optional image illustrating the defect."}')
  ),
  updated_at = unixepoch()
WHERE slug = 'bugs'
  AND is_system = 1
  AND NOT EXISTS (
    SELECT 1
    FROM json_each(templates.fields_schema_json) e
    WHERE json_extract(e.value, '$.key') = 'screenshot'
  );
