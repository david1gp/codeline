DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'session' AND column_name = 'watched'
  ) AND NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'session' AND column_name = 'pinned'
  ) THEN
    ALTER TABLE "session" RENAME COLUMN "watched" TO "pinned";
  END IF;
END $$;
