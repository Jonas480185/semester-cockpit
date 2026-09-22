SET search_path TO semester, pg_catalog;
ALTER TABLE modules ADD COLUMN "learningNotes" text NOT NULL DEFAULT '' CHECK (length("learningNotes") <= 5000);
CREATE TABLE materials (
  "ownerId" text NOT NULL,
  id text NOT NULL,
  "moduleId" text NOT NULL,
  title text NOT NULL CHECK (length(title) BETWEEN 1 AND 300),
  "documentType" text NOT NULL CHECK ("documentType" IN ('Vorlesung/Skript','Übung','Lösung','Altklausur','Sonstiges')),
  semester text NOT NULL DEFAULT '' CHECK (length(semester) <= 80),
  description text NOT NULL DEFAULT '' CHECK (length(description) <= 1000),
  "relatedMaterialId" text,
  "fileName" text NOT NULL,
  "mimeType" text NOT NULL DEFAULT 'application/pdf' CHECK ("mimeType" = 'application/pdf'),
  size integer NOT NULL CHECK (size BETWEEN 5 AND 20971520),
  "objectPath" text NOT NULL UNIQUE,
  sha256 text,
  state text NOT NULL DEFAULT 'pending' CHECK (state IN ('pending','ready')),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  "createdAt" text NOT NULL,
  "updatedAt" text NOT NULL,
  PRIMARY KEY ("ownerId",id),
  FOREIGN KEY ("ownerId","moduleId") REFERENCES modules("ownerId",id) DEFERRABLE INITIALLY DEFERRED,
  FOREIGN KEY ("ownerId","relatedMaterialId") REFERENCES materials("ownerId",id) DEFERRABLE INITIALLY DEFERRED,
  CHECK ("relatedMaterialId" IS NULL OR "relatedMaterialId" <> id),
  CHECK ((state='pending' AND sha256 IS NULL) OR (state='ready' AND sha256 ~ '^[a-f0-9]{64}$'))
);
CREATE INDEX idx_materials_module_type ON materials ("ownerId","moduleId","documentType",state);
CREATE INDEX idx_materials_related ON materials ("ownerId","relatedMaterialId");
ALTER TABLE materials ENABLE ROW LEVEL SECURITY;
CREATE POLICY owner_access ON materials TO authenticated USING ((SELECT auth.uid())::text="ownerId") WITH CHECK ((SELECT auth.uid())::text="ownerId");
REVOKE ALL ON materials FROM PUBLIC,anon,authenticated;
ALTER TABLE tasks ADD COLUMN "sourceMaterialId" text;
ALTER TABLE tasks ADD COLUMN "sourcePageStart" integer CHECK ("sourcePageStart" BETWEEN 1 AND 100000);
ALTER TABLE tasks ADD COLUMN "sourcePageEnd" integer CHECK ("sourcePageEnd" BETWEEN 1 AND 100000);
ALTER TABLE tasks ADD COLUMN "sourceExercise" text NOT NULL DEFAULT '' CHECK (length("sourceExercise") <= 120);
ALTER TABLE tasks ADD CONSTRAINT tasks_material_fk FOREIGN KEY ("ownerId","sourceMaterialId") REFERENCES materials("ownerId",id) DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE tasks ADD CONSTRAINT tasks_source_valid CHECK (("sourceMaterialId" IS NOT NULL OR ("sourcePageStart" IS NULL AND "sourcePageEnd" IS NULL AND "sourceExercise"='')) AND ("sourcePageEnd" IS NULL OR ("sourcePageStart" IS NOT NULL AND "sourcePageEnd">="sourcePageStart")));
CREATE INDEX idx_tasks_material ON tasks ("ownerId","sourceMaterialId");
RESET search_path;
