-- WhatsApp number for notifications. Nullable: existing users have none until an admin sets it.
ALTER TABLE "users" ADD COLUMN "mobile" TEXT;
