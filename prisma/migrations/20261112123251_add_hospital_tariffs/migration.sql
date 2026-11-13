-- CreateTable
CREATE TABLE "hospital_tariffs" (
    "id" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "serviceCode" TEXT NOT NULL,
    "serviceName" TEXT NOT NULL,
    "rate" DOUBLE PRECISION,
    "isZeroPricePermitted" BOOLEAN NOT NULL DEFAULT false,
    "unit" TEXT NOT NULL DEFAULT 'day',
    "description" TEXT,
    "updatedBy" TEXT DEFAULT 'Hospital Administration',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "hospital_tariffs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "hospital_tariffs_serviceCode_key" ON "hospital_tariffs"("serviceCode");
