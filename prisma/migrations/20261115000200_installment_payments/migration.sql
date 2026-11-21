BEGIN;

-- CreateTable
CREATE TABLE "InstallmentPayment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "enrollmentId" TEXT NOT NULL,
    "installmentIds" TEXT NOT NULL DEFAULT '[]',
    "amount" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "gateway" TEXT NOT NULL DEFAULT '',
    "refId" TEXT,
    "attemptCode" TEXT NOT NULL,
    "cardPan" TEXT,
    "paidAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "InstallmentPayment_enrollmentId_fkey" FOREIGN KEY ("enrollmentId") REFERENCES "Enrollment" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "InstallmentPayment_attemptCode_key" ON "InstallmentPayment"("attemptCode");

-- CreateIndex
CREATE INDEX "InstallmentPayment_enrollmentId_idx" ON "InstallmentPayment"("enrollmentId");

-- CreateIndex
CREATE INDEX "InstallmentPayment_status_idx" ON "InstallmentPayment"("status");

-- CreateIndex
CREATE INDEX "InstallmentPayment_attemptCode_idx" ON "InstallmentPayment"("attemptCode");

COMMIT;
