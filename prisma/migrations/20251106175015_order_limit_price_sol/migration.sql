-- AlterTable
ALTER TABLE "orders" DROP COLUMN "limit_price_usd",
ADD COLUMN     "limit_price_sol" DECIMAL(30,18);

