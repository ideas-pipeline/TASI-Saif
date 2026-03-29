DO $$ BEGIN
  CREATE TYPE "idea_status" AS ENUM ('inbox', 'approved', 'in_execution', 'archived');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS "ideas" (
  "id" text PRIMARY KEY NOT NULL,
  "title" text NOT NULL,
  "summary" text NOT NULL,
  "source_url" text,
  "source_name" text,
  "status" "idea_status" DEFAULT 'inbox' NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
