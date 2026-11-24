CREATE TYPE "public"."finding_status" AS ENUM('open', 'resolved', 'dismissed');--> statement-breakpoint
CREATE TYPE "public"."gap_severity" AS ENUM('high', 'medium', 'low');--> statement-breakpoint
CREATE TYPE "public"."gap_type" AS ENUM('missing_information', 'missing_requirement', 'unclear_wording');--> statement-breakpoint
CREATE TABLE "gaps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"run_id" uuid,
	"number" integer NOT NULL,
	"type" "gap_type" NOT NULL,
	"severity" "gap_severity" NOT NULL,
	"text" text NOT NULL,
	"question" text NOT NULL,
	"requirement_numbers" integer[] DEFAULT '{}'::integer[] NOT NULL,
	"status" "finding_status" DEFAULT 'open' NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "gaps" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "analysis_runs" ADD COLUMN "gaps_found" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "analysis_runs" ADD COLUMN "step" text;--> statement-breakpoint
ALTER TABLE "gaps" ADD CONSTRAINT "gaps_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gaps" ADD CONSTRAINT "gaps_run_id_analysis_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."analysis_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "gaps_project_number_uq" ON "gaps" USING btree ("project_id","number");--> statement-breakpoint
CREATE INDEX "gaps_project_status_idx" ON "gaps" USING btree ("project_id","status");