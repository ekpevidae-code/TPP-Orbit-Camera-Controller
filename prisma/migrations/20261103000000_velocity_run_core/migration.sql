CREATE TYPE "CarClass" AS ENUM ('D', 'C', 'B', 'A', 'S');
CREATE TYPE "LedgerKind" AS ENUM ('PURCHASE', 'UPGRADE', 'RACE_REWARD', 'ADMIN_ADJUSTMENT');

CREATE TABLE "User" (
  "id" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "username" TEXT NOT NULL,
  "passwordHash" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");
CREATE INDEX "User_createdAt_idx" ON "User"("createdAt");

CREATE TABLE "Wallet" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "credits" INTEGER NOT NULL DEFAULT 25000,
  "version" INTEGER NOT NULL DEFAULT 0,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Wallet_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Wallet_credits_nonnegative" CHECK ("credits" >= 0)
);
CREATE UNIQUE INDEX "Wallet_userId_key" ON "Wallet"("userId");

CREATE TABLE "CarModel" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "class" "CarClass" NOT NULL,
  "price" INTEGER NOT NULL,
  "topSpeed" DOUBLE PRECISION NOT NULL,
  "acceleration" DOUBLE PRECISION NOT NULL,
  "handling" DOUBLE PRECISION NOT NULL,
  "nitroCapacity" DOUBLE PRECISION NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CarModel_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CarModel_price_nonnegative" CHECK ("price" >= 0)
);
CREATE INDEX "CarModel_class_enabled_idx" ON "CarModel"("class", "enabled");

CREATE TABLE "PlayerCar" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "carModelId" TEXT NOT NULL,
  "purchasedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "isSelected" BOOLEAN NOT NULL DEFAULT false,
  "topSpeedLevel" INTEGER NOT NULL DEFAULT 0,
  "accelerationLevel" INTEGER NOT NULL DEFAULT 0,
  "handlingLevel" INTEGER NOT NULL DEFAULT 0,
  "nitroLevel" INTEGER NOT NULL DEFAULT 0,
  "version" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "PlayerCar_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PlayerCar_topSpeedLevel_range" CHECK ("topSpeedLevel" BETWEEN 0 AND 10),
  CONSTRAINT "PlayerCar_accelerationLevel_range" CHECK ("accelerationLevel" BETWEEN 0 AND 10),
  CONSTRAINT "PlayerCar_handlingLevel_range" CHECK ("handlingLevel" BETWEEN 0 AND 10),
  CONSTRAINT "PlayerCar_nitroLevel_range" CHECK ("nitroLevel" BETWEEN 0 AND 10)
);
CREATE UNIQUE INDEX "PlayerCar_userId_carModelId_key" ON "PlayerCar"("userId", "carModelId");
CREATE INDEX "PlayerCar_userId_isSelected_idx" ON "PlayerCar"("userId", "isSelected");

CREATE TABLE "RaceResult" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "trackId" TEXT NOT NULL,
  "carModelId" TEXT NOT NULL,
  "finishPosition" INTEGER NOT NULL,
  "durationMs" INTEGER NOT NULL,
  "distanceMeters" INTEGER NOT NULL,
  "driftScore" INTEGER NOT NULL DEFAULT 0,
  "rewardCredits" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RaceResult_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "RaceResult_finishPosition_positive" CHECK ("finishPosition" >= 1),
  CONSTRAINT "RaceResult_duration_positive" CHECK ("durationMs" > 0)
);
CREATE INDEX "RaceResult_userId_createdAt_idx" ON "RaceResult"("userId", "createdAt");
CREATE INDEX "RaceResult_trackId_finishPosition_durationMs_idx" ON "RaceResult"("trackId", "finishPosition", "durationMs");

CREATE TABLE "EconomyLedger" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "kind" "LedgerKind" NOT NULL,
  "amount" INTEGER NOT NULL,
  "balanceAfter" INTEGER NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EconomyLedger_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "EconomyLedger_nonzero_amount" CHECK ("amount" <> 0),
  CONSTRAINT "EconomyLedger_balance_nonnegative" CHECK ("balanceAfter" >= 0)
);
CREATE UNIQUE INDEX "EconomyLedger_userId_idempotencyKey_key" ON "EconomyLedger"("userId", "idempotencyKey");
CREATE INDEX "EconomyLedger_userId_createdAt_idx" ON "EconomyLedger"("userId", "createdAt");

ALTER TABLE "Wallet" ADD CONSTRAINT "Wallet_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PlayerCar" ADD CONSTRAINT "PlayerCar_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PlayerCar" ADD CONSTRAINT "PlayerCar_carModelId_fkey" FOREIGN KEY ("carModelId") REFERENCES "CarModel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RaceResult" ADD CONSTRAINT "RaceResult_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EconomyLedger" ADD CONSTRAINT "EconomyLedger_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
