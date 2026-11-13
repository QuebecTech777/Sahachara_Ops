-- AlterTable: Make therapy room bufferMinutes nullable with no default
ALTER TABLE "therapy_rooms" ALTER COLUMN "bufferMinutes" DROP NOT NULL,
ALTER COLUMN "bufferMinutes" DROP DEFAULT;
