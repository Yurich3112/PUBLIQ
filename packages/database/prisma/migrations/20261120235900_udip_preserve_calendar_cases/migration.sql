-- A database deployed from main may already have the calendar's udip_case.
-- Keep its rows and foreign keys while the original workflow migrations run.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_attribute
        WHERE attrelid = to_regclass('udip_case')
          AND attname = 'case_number' AND NOT attisdropped
    ) THEN
        ALTER TABLE "udip_case" RENAME TO "udip_case_before_workflow";
        ALTER TABLE "udip_case_before_workflow" RENAME CONSTRAINT "udip_case_pkey" TO "udip_case_before_workflow_pkey";
    END IF;
END
$$;
