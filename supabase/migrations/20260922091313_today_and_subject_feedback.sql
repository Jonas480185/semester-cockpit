-- Additive only: existing plans, dates, topic states and originals are preserved.
ALTER TABLE semester.topics
  ADD COLUMN position integer NOT NULL DEFAULT 0 CHECK (position >= 0),
  ADD COLUMN "plannedStart" text,
  ADD COLUMN "plannedEnd" text,
  ADD CONSTRAINT topic_window_valid CHECK ("plannedEnd" IS NULL OR ("plannedStart" IS NOT NULL AND "plannedEnd" >= "plannedStart"));
ALTER TABLE semester.tasks
  ADD COLUMN goal text NOT NULL DEFAULT '',
  ADD COLUMN instructions text NOT NULL DEFAULT '';
ALTER TABLE semester.sessions
  ADD COLUMN "taskId" text,
  ADD COLUMN assistance text NOT NULL DEFAULT 'unbekannt' CHECK (assistance IN ('unbekannt', 'selbstständig', 'mit Hilfe')),
  ADD COLUMN difficulty text NOT NULL DEFAULT '',
  ADD COLUMN "nextStep" text NOT NULL DEFAULT '',
  ADD COLUMN "recordedAt" text NOT NULL DEFAULT '',
  ADD CONSTRAINT session_task_fk FOREIGN KEY ("ownerId", "taskId") REFERENCES semester.tasks ("ownerId", id) DEFERRABLE INITIALLY DEFERRED;
CREATE INDEX idx_sessions_task ON semester.sessions ("ownerId", "taskId");
ALTER TABLE semester.plans
  ADD COLUMN "moduleId" text,
  ADD CONSTRAINT plan_module_fk FOREIGN KEY ("ownerId", "moduleId") REFERENCES semester.modules ("ownerId", id) DEFERRABLE INITIALLY DEFERRED;
CREATE INDEX idx_plans_module ON semester.plans ("ownerId", "moduleId");
ALTER TABLE semester.audit ADD COLUMN reason text NOT NULL DEFAULT '';
-- Existing RLS and private schema grants are unchanged.
