-- BL-009: executor field for items.
--
-- `executor` says who/what is *currently doing* the work on an item.
-- Orthogonal to `assignee_id` (which is the accountable human).
--
-- Format (free text, validated at the tool layer):
--   human:<user_id>        e.g. "human:usr-malte"
--   agent:claude           the canonical Claude executor
--   agent:<name>           any other named agent
--   self                   the workspace owner / current actor
--   contractor:<label>     freeform external party
--   NULL                   no executor assigned yet
--
-- Index supports the `list_items({ executor: ... })` filter.

ALTER TABLE items ADD COLUMN executor TEXT;

CREATE INDEX idx_items_executor
  ON items (workspace_id, executor)
  WHERE executor IS NOT NULL;
