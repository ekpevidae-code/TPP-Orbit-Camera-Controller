import {
  Currency,
  LedgerReason,
  Prisma,
  PrismaClient
} from "@prisma/client";

export type UpgradeStat = "acceleration" | "topSpeed" | "handling" | "nitro";

export interface UpgradeRequest {
  userId: string;
  ownedCarId: string;
  stat: UpgradeStat;
  idempotencyKey: string;
}

export interface UpgradeResult {
  ownedCarId: string;
  stat: UpgradeStat;
  newLevel: number;
  charged: string;
  currency: Currency;
  balanceAfter: string;
}

interface UpgradePolicy {
  currency: Currency;
  baseCost: bigint;
  growthNumerator: bigint;
  growthDenominator: bigint;
  maxLevel: number;
  version: number;
}

const POLICIES: Record<UpgradeStat, UpgradePolicy> = {
  acceleration: { currency: Currency.CREDITS, baseCost: 1_000n, growthNumerator: 145n, growthDenominator: 100n, maxLevel: 10, version: 1 },
  topSpeed: { currency: Currency.CREDITS, baseCost: 1_200n, growthNumerator: 150n, growthDenominator: 100n, maxLevel: 10, version: 1 },
  handling: { currency: Currency.CREDITS, baseCost: 900n, growthNumerator: 140n, growthDenominator: 100n, maxLevel: 10, version: 1 },
  nitro: { currency: Currency.CREDITS, baseCost: 1_100n, growthNumerator: 145n, growthDenominator: 100n, maxLevel: 10, version: 1 }
};

const MAX_RETRIES = 3;

function ceilDivide(numerator: bigint, denominator: bigint): bigint {
  return (numerator + denominator - 1n) / denominator;
}

function priceFor(policy: UpgradePolicy, currentLevel: number): bigint {
  if (!Number.isInteger(currentLevel) || currentLevel < 0 || currentLevel >= policy.maxLevel) {
    throw new Error("MAX_LEVEL_REACHED");
  }
  const power = BigInt(currentLevel);
  const numerator = policy.baseCost * policy.growthNumerator ** power;
  const denominator = policy.growthDenominator ** power;
  return ceilDivide(numerator, denominator);
}

function prismaCode(error: unknown, code: string): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === code;
}

function replayResult(
  entry: { amount: bigint; currency: Currency; reason: LedgerReason; balanceAfter: bigint; referenceId: string | null; metadata: Prisma.JsonValue },
  request: UpgradeRequest
): UpgradeResult {
  const metadata = entry.metadata;
  if (
    entry.reason !== LedgerReason.CAR_UPGRADE ||
    entry.referenceId !== request.ownedCarId ||
    !metadata ||
    typeof metadata !== "object" ||
    Array.isArray(metadata)
  ) {
    throw new Error("IDEMPOTENCY_KEY_CONFLICT");
  }
  const record = metadata as Prisma.JsonObject;
  if (record.stat !== request.stat || typeof record.newLevel !== "number") {
    throw new Error("IDEMPOTENCY_KEY_CONFLICT");
  }
  return {
    ownedCarId: request.ownedCarId,
    stat: request.stat,
    newLevel: record.newLevel,
    charged: (-entry.amount).toString(),
    currency: entry.currency,
    balanceAfter: entry.balanceAfter.toString()
  };
}

export class UpgradeService {
  constructor(private readonly prisma: PrismaClient) {}

  async upgrade(request: UpgradeRequest): Promise<UpgradeResult> {
    this.validate(request);
    const policy = POLICIES[request.stat];

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
      try {
        return await this.prisma.$transaction(async tx => {
          const previous = await tx.ledgerEntry.findUnique({
            where: {
              userId_idempotencyKey: {
                userId: request.userId,
                idempotencyKey: request.idempotencyKey
              }
            }
          });
          if (previous) return replayResult(previous, request);

          const car = await tx.ownedCar.findFirst({
            where: { id: request.ownedCarId, userId: request.userId },
            select: { id: true, acceleration: true, topSpeed: true, handling: true, nitro: true }
          });
          if (!car) throw new Error("CAR_NOT_FOUND");

          const currentLevel = car[request.stat];
          if (currentLevel >= policy.maxLevel) throw new Error("MAX_LEVEL_REACHED");
          const cost = priceFor(policy, currentLevel);

          const wallet = await tx.wallet.findUnique({ where: { userId: request.userId } });
          if (!wallet) throw new Error("WALLET_NOT_FOUND");
          const balance = policy.currency === Currency.CREDITS ? wallet.credits : wallet.tokens;
          if (balance < cost) throw new Error("INSUFFICIENT_FUNDS");
          const nextBalance = balance - cost;

          const walletUpdate = policy.currency === Currency.CREDITS
            ? await tx.wallet.updateMany({
                where: { userId: request.userId, version: wallet.version, credits: { gte: cost } },
                data: { credits: { decrement: cost }, version: { increment: 1 } }
              })
            : await tx.wallet.updateMany({
                where: { userId: request.userId, version: wallet.version, tokens: { gte: cost } },
                data: { tokens: { decrement: cost }, version: { increment: 1 } }
              });
          if (walletUpdate.count !== 1) throw new Error("WALLET_CONFLICT");

          const updatedCar = await tx.ownedCar.update({
            where: { id: car.id },
            data: { [request.stat]: { increment: 1 } },
            select: { id: true, acceleration: true, topSpeed: true, handling: true, nitro: true }
          });
          const newLevel = updatedCar[request.stat];

          await tx.ledgerEntry.create({
            data: {
              userId: request.userId,
              currency: policy.currency,
              amount: -cost,
              reason: LedgerReason.CAR_UPGRADE,
              idempotencyKey: request.idempotencyKey,
              referenceId: car.id,
              balanceAfter: nextBalance,
              metadata: { stat: request.stat, newLevel, policyVersion: policy.version }
            }
          });

          return {
            ownedCarId: car.id,
            stat: request.stat,
            newLevel,
            charged: cost.toString(),
            currency: policy.currency,
            balanceAfter: nextBalance.toString()
          };
        }, {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
          maxWait: 5_000,
          timeout: 10_000
        });
      } catch (error) {
        if (prismaCode(error, "P2034") && attempt < MAX_RETRIES) continue;
        if (prismaCode(error, "P2002")) {
          const existing = await this.prisma.ledgerEntry.findUnique({
            where: {
              userId_idempotencyKey: {
                userId: request.userId,
                idempotencyKey: request.idempotencyKey
              }
            }
          });
          if (existing) return replayResult(existing, request);
        }
        throw error;
      }
    }
    throw new Error("UPGRADE_RETRY_EXHAUSTED");
  }

  private validate(request: UpgradeRequest): void {
    if (!request.userId || !request.ownedCarId) throw new Error("INVALID_REQUEST");
    if (!Object.hasOwn(POLICIES, request.stat)) throw new Error("INVALID_UPGRADE_STAT");
    if (
      typeof request.idempotencyKey !== "string" ||
      request.idempotencyKey.length < 16 ||
      request.idempotencyKey.length > 128 ||
      !/^[A-Za-z0-9_-]+$/.test(request.idempotencyKey)
    ) throw new Error("INVALID_IDEMPOTENCY_KEY");
  }
}
