-- The application owns this private schema; it is not exposed through PostgREST.
CREATE SCHEMA semester;
REVOKE ALL ON SCHEMA semester FROM PUBLIC, anon, authenticated;
SET search_path TO semester, pg_catalog;

CREATE TABLE "workspaces" (
	"ownerId" text PRIMARY KEY NOT NULL,
	"revision" integer DEFAULT 0 NOT NULL,
	"createdAt" text NOT NULL,
	CONSTRAINT "revision_nonnegative" CHECK("workspaces"."revision" >= 0)
);

CREATE TABLE "modules" (
	"id" text NOT NULL,
	"ownerId" text NOT NULL,
	"updatedAt" text NOT NULL,
	"title" text NOT NULL,
	"code" text NOT NULL,
	"color" text NOT NULL,
	"credits" integer NOT NULL,
	"examDate" text NOT NULL,
	"target" integer NOT NULL,
	PRIMARY KEY("ownerId", "id")
);

CREATE TABLE "topics" (
	"id" text NOT NULL,
	"ownerId" text NOT NULL,
	"updatedAt" text NOT NULL,
	"moduleId" text NOT NULL,
	"title" text NOT NULL,
	"status" text NOT NULL,
	"priority" integer NOT NULL,
	"relevance" integer NOT NULL,
	"lastPracticed" text,
	PRIMARY KEY("ownerId", "id"),
	FOREIGN KEY ("ownerId","moduleId") REFERENCES "modules"("ownerId","id") ON UPDATE no action ON DELETE no action DEFERRABLE INITIALLY DEFERRED
);

CREATE TABLE "tasks" (
	"id" text NOT NULL,
	"ownerId" text NOT NULL,
	"updatedAt" text NOT NULL,
	"topicId" text NOT NULL,
	"title" text NOT NULL,
	"date" text NOT NULL,
	"time" text NOT NULL,
	"minutes" integer NOT NULL,
	"status" text NOT NULL,
	"kind" text NOT NULL,
	"priority" integer NOT NULL,
	PRIMARY KEY("ownerId", "id"),
	FOREIGN KEY ("ownerId","topicId") REFERENCES "topics"("ownerId","id") ON UPDATE no action ON DELETE no action DEFERRABLE INITIALLY DEFERRED
);

CREATE TABLE "tests" (
	"id" text NOT NULL,
	"ownerId" text NOT NULL,
	"updatedAt" text NOT NULL,
	"topicId" text NOT NULL,
	"date" text NOT NULL,
	"score" integer NOT NULL,
	"independent" integer NOT NULL,
	"notes" text NOT NULL,
	PRIMARY KEY("ownerId", "id"),
	FOREIGN KEY ("ownerId","topicId") REFERENCES "topics"("ownerId","id") ON UPDATE no action ON DELETE no action DEFERRABLE INITIALLY DEFERRED
);

CREATE TABLE "gaps" (
	"id" text NOT NULL,
	"ownerId" text NOT NULL,
	"updatedAt" text NOT NULL,
	"topicId" text NOT NULL,
	"description" text NOT NULL,
	"status" text NOT NULL,
	"date" text NOT NULL,
	PRIMARY KEY("ownerId", "id"),
	FOREIGN KEY ("ownerId","topicId") REFERENCES "topics"("ownerId","id") ON UPDATE no action ON DELETE no action DEFERRABLE INITIALLY DEFERRED
);

CREATE TABLE "sessions" (
	"id" text NOT NULL,
	"ownerId" text NOT NULL,
	"updatedAt" text NOT NULL,
	"topicId" text NOT NULL,
	"date" text NOT NULL,
	"minutes" integer NOT NULL,
	"notes" text NOT NULL,
	PRIMARY KEY("ownerId", "id"),
	FOREIGN KEY ("ownerId","topicId") REFERENCES "topics"("ownerId","id") ON UPDATE no action ON DELETE no action DEFERRABLE INITIALLY DEFERRED
);

CREATE TABLE "reviews" (
	"id" text NOT NULL,
	"ownerId" text NOT NULL,
	"updatedAt" text NOT NULL,
	"topicId" text NOT NULL,
	"date" text NOT NULL,
	"status" text NOT NULL,
	"interval" integer NOT NULL,
	PRIMARY KEY("ownerId", "id"),
	FOREIGN KEY ("ownerId","topicId") REFERENCES "topics"("ownerId","id") ON UPDATE no action ON DELETE no action DEFERRABLE INITIALLY DEFERRED
);

CREATE TABLE "deadlines" (
	"id" text NOT NULL,
	"ownerId" text NOT NULL,
	"updatedAt" text NOT NULL,
	"moduleId" text NOT NULL,
	"title" text NOT NULL,
	"date" text NOT NULL,
	"kind" text NOT NULL,
	PRIMARY KEY("ownerId", "id"),
	FOREIGN KEY ("ownerId","moduleId") REFERENCES "modules"("ownerId","id") ON UPDATE no action ON DELETE no action DEFERRABLE INITIALLY DEFERRED
);

CREATE TABLE "plans" (
	"id" text NOT NULL,
	"ownerId" text NOT NULL,
	"updatedAt" text NOT NULL,
	"startDate" text NOT NULL,
	"endDate" text NOT NULL,
	"title" text NOT NULL,
	"notes" text NOT NULL,
	"targetMinutes" integer NOT NULL,
	PRIMARY KEY("ownerId", "id")
);

CREATE TABLE "history" (
	"id" text NOT NULL,
	"ownerId" text NOT NULL,
	"updatedAt" text NOT NULL,
	"topicId" text NOT NULL,
	"date" text NOT NULL,
	"status" text NOT NULL,
	"source" text NOT NULL,
	PRIMARY KEY("ownerId", "id"),
	FOREIGN KEY ("ownerId","topicId") REFERENCES "topics"("ownerId","id") ON UPDATE no action ON DELETE no action DEFERRABLE INITIALLY DEFERRED
);

CREATE TABLE "audit" (
	"id" text PRIMARY KEY NOT NULL,
	"ownerId" text NOT NULL,
	"date" text NOT NULL,
	"actor" text NOT NULL,
	"entity" text NOT NULL,
	"entityId" text NOT NULL,
	"action" text NOT NULL,
	"before" text,
	"after" text,
	"revision" integer NOT NULL
);

CREATE TABLE "tokens" (
	"id" text PRIMARY KEY NOT NULL,
	"ownerId" text NOT NULL,
	"name" text NOT NULL,
	"hash" text NOT NULL,
	"scope" text NOT NULL,
	"createdAt" text NOT NULL,
	"expiresAt" text NOT NULL,
	"revoked" integer DEFAULT 0 NOT NULL
);

CREATE TABLE "requests" (
	"ownerId" text NOT NULL,
	"key" text NOT NULL,
	"hash" text NOT NULL,
	"response" text NOT NULL,
	PRIMARY KEY("ownerId", "key")
);

CREATE TABLE oauth_grants ("ownerId" text NOT NULL, client_id text NOT NULL, scope text NOT NULL CHECK(scope IN ('read','read-write')), revoked integer NOT NULL DEFAULT 0 CHECK(revoked IN (0,1)), "updatedAt" text NOT NULL, PRIMARY KEY("ownerId",client_id));

CREATE INDEX "idx_audit_owner_date" ON "audit" ("ownerId","date");
CREATE INDEX "idx_history_date" ON "history" ("ownerId","date");
CREATE INDEX "idx_reviews_date" ON "reviews" ("ownerId","date");
CREATE INDEX "idx_sessions_date" ON "sessions" ("ownerId","date");
CREATE INDEX "idx_tasks_date" ON "tasks" ("ownerId","date");
CREATE INDEX "idx_tests_topic" ON "tests" ("ownerId","topicId","date");
CREATE UNIQUE INDEX "tokens_hash_unique" ON "tokens" ("hash");
CREATE INDEX "idx_tokens_owner" ON "tokens" ("ownerId");
CREATE INDEX "idx_topics_module" ON "topics" ("ownerId","moduleId");
ALTER TABLE "workspaces" ENABLE ROW LEVEL SECURITY;
CREATE POLICY owner_access ON "workspaces" TO authenticated USING ((SELECT auth.uid())::text = "ownerId") WITH CHECK ((SELECT auth.uid())::text = "ownerId");
ALTER TABLE "modules" ENABLE ROW LEVEL SECURITY;
CREATE POLICY owner_access ON "modules" TO authenticated USING ((SELECT auth.uid())::text = "ownerId") WITH CHECK ((SELECT auth.uid())::text = "ownerId");
ALTER TABLE "topics" ENABLE ROW LEVEL SECURITY;
CREATE POLICY owner_access ON "topics" TO authenticated USING ((SELECT auth.uid())::text = "ownerId") WITH CHECK ((SELECT auth.uid())::text = "ownerId");
ALTER TABLE "tasks" ENABLE ROW LEVEL SECURITY;
CREATE POLICY owner_access ON "tasks" TO authenticated USING ((SELECT auth.uid())::text = "ownerId") WITH CHECK ((SELECT auth.uid())::text = "ownerId");
ALTER TABLE "tests" ENABLE ROW LEVEL SECURITY;
CREATE POLICY owner_access ON "tests" TO authenticated USING ((SELECT auth.uid())::text = "ownerId") WITH CHECK ((SELECT auth.uid())::text = "ownerId");
ALTER TABLE "gaps" ENABLE ROW LEVEL SECURITY;
CREATE POLICY owner_access ON "gaps" TO authenticated USING ((SELECT auth.uid())::text = "ownerId") WITH CHECK ((SELECT auth.uid())::text = "ownerId");
ALTER TABLE "sessions" ENABLE ROW LEVEL SECURITY;
CREATE POLICY owner_access ON "sessions" TO authenticated USING ((SELECT auth.uid())::text = "ownerId") WITH CHECK ((SELECT auth.uid())::text = "ownerId");
ALTER TABLE "reviews" ENABLE ROW LEVEL SECURITY;
CREATE POLICY owner_access ON "reviews" TO authenticated USING ((SELECT auth.uid())::text = "ownerId") WITH CHECK ((SELECT auth.uid())::text = "ownerId");
ALTER TABLE "deadlines" ENABLE ROW LEVEL SECURITY;
CREATE POLICY owner_access ON "deadlines" TO authenticated USING ((SELECT auth.uid())::text = "ownerId") WITH CHECK ((SELECT auth.uid())::text = "ownerId");
ALTER TABLE "plans" ENABLE ROW LEVEL SECURITY;
CREATE POLICY owner_access ON "plans" TO authenticated USING ((SELECT auth.uid())::text = "ownerId") WITH CHECK ((SELECT auth.uid())::text = "ownerId");
ALTER TABLE "history" ENABLE ROW LEVEL SECURITY;
CREATE POLICY owner_access ON "history" TO authenticated USING ((SELECT auth.uid())::text = "ownerId") WITH CHECK ((SELECT auth.uid())::text = "ownerId");
ALTER TABLE "audit" ENABLE ROW LEVEL SECURITY;
CREATE POLICY owner_access ON "audit" TO authenticated USING ((SELECT auth.uid())::text = "ownerId") WITH CHECK ((SELECT auth.uid())::text = "ownerId");
ALTER TABLE "tokens" ENABLE ROW LEVEL SECURITY;
CREATE POLICY owner_access ON "tokens" TO authenticated USING ((SELECT auth.uid())::text = "ownerId") WITH CHECK ((SELECT auth.uid())::text = "ownerId");
ALTER TABLE "requests" ENABLE ROW LEVEL SECURITY;
CREATE POLICY owner_access ON "requests" TO authenticated USING ((SELECT auth.uid())::text = "ownerId") WITH CHECK ((SELECT auth.uid())::text = "ownerId");
ALTER TABLE "oauth_grants" ENABLE ROW LEVEL SECURITY;
CREATE POLICY owner_access ON "oauth_grants" TO authenticated USING ((SELECT auth.uid())::text = "ownerId") WITH CHECK ((SELECT auth.uid())::text = "ownerId");
REVOKE ALL ON ALL TABLES IN SCHEMA semester FROM PUBLIC, anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA semester REVOKE ALL ON TABLES FROM PUBLIC, anon, authenticated;
RESET search_path;
