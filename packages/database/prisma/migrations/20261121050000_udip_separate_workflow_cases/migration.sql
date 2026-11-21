-- Move the workflow table without rewriting rows or changing foreign key targets.
DO $$
BEGIN
    ALTER TABLE "udip_case" RENAME TO "udip_workflow_case";
    ALTER TABLE "udip_workflow_case" RENAME CONSTRAINT "udip_case_pkey" TO "udip_workflow_case_pkey";
    ALTER TABLE "udip_workflow_case" RENAME CONSTRAINT "udip_case_dates_check" TO "udip_workflow_case_dates_check";
    ALTER TABLE "udip_workflow_case" RENAME CONSTRAINT "udip_case_owner_uuid_fkey" TO "udip_workflow_case_owner_uuid_fkey";
    ALTER TABLE "udip_workflow_case" RENAME CONSTRAINT "udip_case_sent_by_uuid_fkey" TO "udip_workflow_case_sent_by_uuid_fkey";
    ALTER TABLE "udip_workflow_case" RENAME CONSTRAINT "udip_case_sent_redaction_uuid_fkey" TO "udip_workflow_case_sent_redaction_uuid_fkey";

    ALTER INDEX "udip_case_signature_key" RENAME TO "udip_workflow_case_signature_key";
    ALTER INDEX "udip_case_owner_uuid_client_request_id_key" RENAME TO "udip_workflow_case_owner_uuid_client_request_id_key";
    ALTER INDEX "udip_case_year_received_date_uuid_idx" RENAME TO "udip_workflow_case_year_received_date_uuid_idx";
    ALTER INDEX "udip_case_owner_uuid_year_received_date_uuid_idx" RENAME TO "udip_workflow_case_owner_uuid_year_received_date_uuid_idx";
    ALTER INDEX "udip_case_sent_redaction_uuid_key" RENAME TO "udip_workflow_case_sent_redaction_uuid_key";

    -- If the calendar table already existed, restore its original name.
    -- Otherwise the later calendar migration will create it.
    IF to_regclass('udip_case_before_workflow') IS NOT NULL THEN
        ALTER TABLE "udip_case_before_workflow" RENAME TO "udip_case";
        ALTER TABLE "udip_case" RENAME CONSTRAINT "udip_case_before_workflow_pkey" TO "udip_case_pkey";
    END IF;
END
$$;
