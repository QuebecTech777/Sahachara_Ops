-- Remove all bypass logic: enforce unconditional immutability on refund_ledger_entries
CREATE OR REPLACE FUNCTION prevent_refund_ledger_mutation()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'IMMUTABLE_RECORD: RefundLedgerEntry records are strictly immutable and cannot be updated or deleted.';
END;
$$ LANGUAGE plpgsql;

-- Ensure trigger is active and unconditionally attached
DROP TRIGGER IF EXISTS trg_prevent_refund_ledger_mutation ON refund_ledger_entries;
CREATE TRIGGER trg_prevent_refund_ledger_mutation
BEFORE UPDATE OR DELETE ON refund_ledger_entries
FOR EACH ROW
EXECUTE FUNCTION prevent_refund_ledger_mutation();

