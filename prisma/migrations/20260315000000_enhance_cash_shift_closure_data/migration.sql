-- AlterTable
ALTER TABLE "CashShift" ADD COLUMN     "incomePlin" DECIMAL(10,2) NOT NULL DEFAULT 0,
ADD COLUMN     "incomeYape" DECIMAL(10,2) NOT NULL DEFAULT 0,
ADD COLUMN     "observations" TEXT,
ADD COLUMN     "reportedCardAmount" DECIMAL(10,2),
ADD COLUMN     "reportedCashAmount" DECIMAL(10,2),
ADD COLUMN     "reportedPlinAmount" DECIMAL(10,2),
ADD COLUMN     "reportedTransferAmount" DECIMAL(10,2),
ADD COLUMN     "reportedYapeAmount" DECIMAL(10,2);
