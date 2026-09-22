-- Modules may be created before the examination schedule is known.
ALTER TABLE semester.modules ALTER COLUMN "examDate" DROP NOT NULL;
