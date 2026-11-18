CREATE TYPE "public"."analysis_run_status" AS ENUM('queued', 'running', 'succeeded', 'failed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."confidence_level" AS ENUM('high', 'medium', 'low');--> statement-breakpoint
CREATE TYPE "public"."requirement_priority" AS ENUM('urgent', 'high', 'medium', 'low');--> statement-breakpoint
CREATE TYPE "public"."requirement_status" AS ENUM('ai_suggested', 'confirmed', 'needs_clarification', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."requirement_type" AS ENUM('functional', 'non_functional', 'constraint');--> statement-breakpoint
CREATE TABLE "analysis_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"status" "analysis_run_status" DEFAULT 'queued' NOT NULL,
	"prompt_version" text,
	"model" text,
	"prompt_tokens" integer DEFAULT 0 NOT NULL,
	"completion_tokens" integer DEFAULT 0 NOT NULL,
	"cost_usd" double precision DEFAULT 0 NOT NULL,
	"requirements_found" integer DEFAULT 0 NOT NULL,
	"document_count" integer DEFAULT 0 NOT NULL,
	"error_code" text,
	"started_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "analysis_runs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "requirement_sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"requirement_id" uuid NOT NULL,
	"document_id" uuid NOT NULL,
	"segment_id" uuid,
	"page" integer,
	"quote" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "requirement_sources" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "requirements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"run_id" uuid,
	"number" integer NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"type" "requirement_type" NOT NULL,
	"priority" "requirement_priority" NOT NULL,
	"status" "requirement_status" DEFAULT 'ai_suggested' NOT NULL,
	"edited_by_user" boolean DEFAULT false NOT NULL,
	"confidence" "confidence_level" NOT NULL,
	"ai_comment" text DEFAULT '' NOT NULL,
	"source_unverified" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "requirements" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "analysis_runs" ADD CONSTRAINT "analysis_runs_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analysis_runs" ADD CONSTRAINT "analysis_runs_started_by_profiles_id_fk" FOREIGN KEY ("started_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requirement_sources" ADD CONSTRAINT "requirement_sources_requirement_id_requirements_id_fk" FOREIGN KEY ("requirement_id") REFERENCES "public"."requirements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requirement_sources" ADD CONSTRAINT "requirement_sources_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requirement_sources" ADD CONSTRAINT "requirement_sources_segment_id_document_segments_id_fk" FOREIGN KEY ("segment_id") REFERENCES "public"."document_segments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requirements" ADD CONSTRAINT "requirements_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requirements" ADD CONSTRAINT "requirements_run_id_analysis_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."analysis_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "analysis_runs_project_id_idx" ON "analysis_runs" USING btree ("project_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "analysis_runs_one_active_per_project" ON "analysis_runs" USING btree ("project_id") WHERE "analysis_runs"."status" in ('queued', 'running');--> statement-breakpoint
CREATE INDEX "requirement_sources_requirement_id_idx" ON "requirement_sources" USING btree ("requirement_id");--> statement-breakpoint
CREATE UNIQUE INDEX "requirements_project_number_uq" ON "requirements" USING btree ("project_id","number");--> statement-breakpoint
CREATE INDEX "requirements_project_status_idx" ON "requirements" USING btree ("project_id","status");