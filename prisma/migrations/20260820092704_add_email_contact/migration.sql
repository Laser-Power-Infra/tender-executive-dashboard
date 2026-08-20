/*
  Warnings:

  - Made the column `currentStatus` on table `tender_merged` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "SupplyHistory" ADD COLUMN     "contactNo" TEXT,
ADD COLUMN     "email" TEXT,
ADD COLUMN     "itemSchedule" TEXT;

-- AlterTable
ALTER TABLE "tender_merged" ADD COLUMN     "expectedRaDate" TEXT,
ADD COLUMN     "reverseAuctionAutomationStatus" TEXT,
ALTER COLUMN "currentStatus" SET NOT NULL,
ALTER COLUMN "currentStatus" SET DEFAULT 'NOT EVALUATED';
