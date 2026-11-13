-- AlterTable
ALTER TABLE "hospital_tariffs" ADD COLUMN     "currency" TEXT NOT NULL DEFAULT 'INR',
ADD COLUMN     "department" TEXT DEFAULT 'Hospital Operations',
ADD COLUMN     "durationMinutes" INTEGER,
ADD COLUMN     "effectiveFrom" TIMESTAMP(3),
ADD COLUMN     "effectiveUntil" TIMESTAMP(3),
ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "notes" TEXT,
ADD COLUMN     "serviceType" TEXT DEFAULT 'General',
ADD COLUMN     "updatedById" TEXT;

-- CreateTable
CREATE TABLE "rate_histories" (
    "id" TEXT NOT NULL,
    "tariffId" TEXT NOT NULL,
    "previousRate" DOUBLE PRECISION,
    "newRate" DOUBLE PRECISION,
    "isZeroPrice" BOOLEAN NOT NULL DEFAULT false,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "effectiveFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "effectiveUntil" TIMESTAMP(3),
    "changedById" TEXT,
    "changedByName" TEXT NOT NULL,
    "changeReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rate_histories_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "rate_histories" ADD CONSTRAINT "rate_histories_tariffId_fkey" FOREIGN KEY ("tariffId") REFERENCES "hospital_tariffs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

