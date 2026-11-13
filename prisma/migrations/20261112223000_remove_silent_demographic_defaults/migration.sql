-- AlterTable: Remove silent demographic assumptions and unrequested defaults
ALTER TABLE "patients" ALTER COLUMN "admissionStatus" DROP DEFAULT;
ALTER TABLE "patients" ALTER COLUMN "admissionStatus" DROP NOT NULL;
ALTER TABLE "patients" ALTER COLUMN "preferredLanguage" DROP DEFAULT;
ALTER TABLE "patients" ALTER COLUMN "communicationPreference" DROP DEFAULT;
ALTER TABLE "patients" ALTER COLUMN "country" DROP DEFAULT;

