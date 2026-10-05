-- Additive timetable schema: existing learning records and materials remain unchanged.
CREATE TABLE semester."timetableEvents" (
  "ownerId" text NOT NULL,
  id text NOT NULL,
  "moduleId" text NOT NULL,
  "updatedAt" text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('Vorlesung', 'Übung')),
  date text NOT NULL CHECK (date ~ '^\d{4}-\d{2}-\d{2}$'),
  time text NOT NULL CHECK (time ~ '^([01]\d|2[0-3]):[0-5]\d$'),
  minutes integer NOT NULL CHECK (minutes BETWEEN 1 AND 720),
  location text NOT NULL DEFAULT '' CHECK (length(location) <= 200),
  "intervalWeeks" integer NOT NULL DEFAULT 0 CHECK ("intervalWeeks" IN (0, 1, 2)),
  until text,
  exceptions jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(exceptions) = 'array' AND jsonb_array_length(exceptions) <= 200),
  PRIMARY KEY ("ownerId", id),
  FOREIGN KEY ("ownerId", "moduleId") REFERENCES semester.modules ("ownerId", id) DEFERRABLE INITIALLY DEFERRED,
  CHECK (("intervalWeeks" = 0 AND until IS NULL AND exceptions = '[]'::jsonb) OR ("intervalWeeks" > 0 AND until IS NOT NULL AND until >= date))
);
CREATE INDEX idx_timetable_module ON semester."timetableEvents" ("ownerId", "moduleId");
ALTER TABLE semester."timetableEvents" ENABLE ROW LEVEL SECURITY;
CREATE POLICY owner_access ON semester."timetableEvents" TO authenticated
  USING ((SELECT auth.uid())::text = "ownerId")
  WITH CHECK ((SELECT auth.uid())::text = "ownerId");
REVOKE ALL ON semester."timetableEvents" FROM PUBLIC, anon, authenticated;
-- Rollback: turn COCKPIT_TIMETABLE_ENABLED off and retain this table/data.
-- No destructive down migration is required or provided.
