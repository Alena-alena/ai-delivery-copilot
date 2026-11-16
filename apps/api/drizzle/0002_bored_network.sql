CREATE TABLE "document_segments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"document_id" uuid NOT NULL,
	"index" integer NOT NULL,
	"page" integer,
	"text" text NOT NULL,
	"token_count" integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE "document_segments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "document_segments" ADD CONSTRAINT "document_segments_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "document_segments_document_id_index_uq" ON "document_segments" USING btree ("document_id","index");