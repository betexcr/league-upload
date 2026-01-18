-- CreateEnum
CREATE TYPE "DocumentStatus" AS ENUM ('ACTIVE', 'SIGNED');

-- AlterTable
ALTER TABLE "Document" ADD COLUMN "status" "DocumentStatus" NOT NULL DEFAULT 'ACTIVE';
ALTER TABLE "Document" ADD COLUMN "signedAt" TIMESTAMP(3);
ALTER TABLE "Document" ADD COLUMN "signedById" TEXT;
