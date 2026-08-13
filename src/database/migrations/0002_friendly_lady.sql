ALTER TABLE "message" RENAME COLUMN "idempotency_key" TO "client_request_id";--> statement-breakpoint
ALTER TABLE "message" DROP CONSTRAINT "message_session_idempotency_unique";--> statement-breakpoint
ALTER TABLE "message" ADD CONSTRAINT "message_session_client_request_unique" UNIQUE("session_id","client_request_id");--> statement-breakpoint
ALTER TABLE "message" ADD CONSTRAINT "message_role_allowed" CHECK ("message"."role" IN ('user', 'assistant'));
