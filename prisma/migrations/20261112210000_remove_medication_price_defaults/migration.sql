-- AlterTable: Remove hardcoded default price and make unitPrice nullable
ALTER TABLE "medication_stock" ALTER COLUMN "unitPrice" DROP NOT NULL,
ALTER COLUMN "unitPrice" DROP DEFAULT;

-- Data Sanitization: Clear any unapproved default prices to NULL
UPDATE "medication_stock" SET "unitPrice" = NULL WHERE "unitPrice" = 250.00;

