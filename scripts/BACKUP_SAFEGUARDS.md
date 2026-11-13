# Backup Safeguards — Sahachara Ops

## ⚠️ HISTORICAL PRE-CLEANUP BACKUP

**File:** `scripts/backup_sahachara_ops_db_pre_cleanup.sql`

**Classification:** HISTORICAL ARCHIVE — FOR FORENSIC REFERENCE ONLY

---

### What This Backup Contains

This SQL dump was captured from `sahachara_ops_db` **before** the November 2026 database cleanup.

It contains:

- **Deprecated fabricated tariffs** — Invented bed rates, accommodation charges and other placeholder amounts that were never approved by hospital administration.
- **The `BED-GEN` tariff pre-populated with a ₹1,250 test rate** — this was a test fixture used during early verification and was never an authorised hospital tariff.
- **A `medication_stock.unitPrice` column with `DEFAULT 250.00`** — this default was an unapproved placeholder and has since been removed (see migration `20261112210000_remove_medication_price_defaults`).
- **Possibly other placeholder operational data** created during development.

---

### NEVER Restore This Backup Over Production

> [!CAUTION]
> **NEVER** restore `backup_sahachara_ops_db_pre_cleanup.sql` over the live `sahachara_ops_db` production database.
>
> Doing so would:
> - Reintroduce fabricated, unapproved tariff rates into the billing system.
> - Reintroduce a `DEFAULT 250.00` on `medication_stock.unitPrice`, violating the zero-fabricated-price policy.
> - Corrupt the production schema by rolling back all post-cleanup migrations.

---

### Safe Restore Procedure (If Required)

If you need to inspect this historical state for audit or forensic purposes, **always restore to an isolated database**, never to production or test:

```bash
# 1. Create a temporary isolated database
createdb sahachara_ops_forensic_$(date +%Y%m%d)

# 2. Restore the dump into the isolated database ONLY
psql postgresql://highflyer@localhost:5432/sahachara_ops_forensic_$(date +%Y%m%d) \
  < scripts/backup_sahachara_ops_db_pre_cleanup.sql

# 3. Inspect the restored database
psql postgresql://highflyer@localhost:5432/sahachara_ops_forensic_$(date +%Y%m%d)

# 4. Drop the forensic database when done — do NOT leave it running
dropdb sahachara_ops_forensic_$(date +%Y%m%d)
```

---

### Production Database Safety Checks

Before running any database script, verify the connection is **not** pointing to production:

```bash
# Check the target database name before any operation
psql "$DATABASE_URL" -c "SELECT current_database();"
```

The application enforces production isolation in all test scripts:
- `scripts/verify-implementation.ts` — connects exclusively to `sahachara_ops_test_db`
- `scripts/verify-rbac.ts` — connects exclusively to `sahachara_ops_test_db`
- Both scripts verify `production database remained UNTOUCHED` after every test run

---

### Authorised Production Database

| Property | Value |
|----------|-------|
| Database name | `sahachara_ops_db` |
| All tariff rates | `NULL` (unconfigured — requires SUPER_ADMIN configuration) |
| Medication unit prices | `NULL` (unconfigured — requires SUPER_ADMIN or PHARMACIST configuration) |
| Test data | Zero — no fixtures, no fabricated amounts |
| Invoices | Zero (clean slate) |
| Medication stock | Zero rows (no fabricated inventory) |

---

### Applied Migrations (Post-Cleanup)

All migrations have been applied to both `sahachara_ops_db` and `sahachara_ops_test_db`:

| Migration | Description |
|-----------|-------------|
| `0_init` | Initial schema |
| `20261112123251_add_hospital_tariffs` | Hospital tariff catalogue |
| `20261112133000_remove_digital_signatures` | Removed all PKI/digital signature fields |
| `20261112191500_add_service_rate_management` | Service & Rate Management module |
| `20261112200000_monetary_precision_decimal` | All monetary fields migrated to DECIMAL(12,2) |
| `20261112210000_remove_medication_price_defaults` | Removed unapproved DEFAULT 250.00 from medication_stock.unitPrice |

---

*Last updated: 2026-11-12*

