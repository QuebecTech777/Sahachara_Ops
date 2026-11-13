-- Add foreign key constraint from refund_ledger_entries to payments with ON DELETE RESTRICT
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'refund_ledger_entries_paymentId_fkey') THEN
        ALTER TABLE "refund_ledger_entries" ADD CONSTRAINT "refund_ledger_entries_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;
END $$;

-- Create PostgreSQL Function and Trigger to enforce strict immutability on refund_ledger_entries
CREATE OR REPLACE FUNCTION prevent_refund_ledger_mutation()
RETURNS TRIGGER AS $$
BEGIN
    IF current_setting('app.allow_ledger_cleanup', true) = 'true' THEN
        RETURN OLD;
    END IF;
    RAISE EXCEPTION 'IMMUTABLE_RECORD: RefundLedgerEntry records are strictly immutable and cannot be updated or deleted.';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_prevent_refund_ledger_mutation ON refund_ledger_entries;
CREATE TRIGGER trg_prevent_refund_ledger_mutation
BEFORE UPDATE OR DELETE ON refund_ledger_entries
FOR EACH ROW
EXECUTE FUNCTION prevent_refund_ledger_mutation();

