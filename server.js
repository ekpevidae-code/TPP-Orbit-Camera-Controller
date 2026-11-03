import 'dotenv/config';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { Prisma, PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';

const prisma = new PrismaClient();
const app = express();
const PORT = Number(process.env.PORT || 4000);
const JWT_SECRET = process.env.JWT_SECRET;
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
if (!JWT_SECRET || JWT_SECRET.length < 32) throw new Error('JWT_SECRET must contain at least 32 characters');

app.disable('x-powered-by');
app.use(helmet());
app.use(cors({ origin: (process.env.CORS_ORIGIN || 'http://localhost:5173').split(',').map(x => x.trim()), credentials: false }));
app.use(express.json({ limit: '32kb' }));
app.use('/api', rateLimit({ windowMs: 60_000, limit: 120, standardHeaders: 'draft-8', legacyHeaders: false }));
app.use('/api/auth', rateLimit({ windowMs: 15 * 60_000, limit: 20, standardHeaders: 'draft-8', legacyHeaders: false }));

const asyncRoute = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const emailSchema = z.string().trim().email().max(254).transform(v => v.toLowerCase());
const registerSchema = z.object({ email: emailSchema, username: z.string().trim().min(3).max(24).regex(/^[a-zA-Z0-9_]+$/), password: z.string().min(10).max(72) });
const loginSchema = z.object({ email: emailSchema, password: z.string().min(1).max(72) });
const tokenFor = user => jwt.sign({ sub: user.id, email: user.email }, JWT_SECRET, { algorithm: 'HS256', expiresIn: '2h', issuer: 'velocity-run-api', audience: 'velocity-run-client' });

function requireAuth(req, res, next) {
  const header = req.get('authorization') || '';
  if (!header.startsWith('Bearer ')) return res.status(401).json({ error: 'Authentication required' });
  try {
    const claims = jwt.verify(header.slice(7), JWT_SECRET, { algorithms: ['HS256'], issuer: 'velocity-run-api', audience: 'velocity-run-client' });
    req.userId = claims.sub;
    next();
  } catch { res.status(401).json({ error: 'Invalid or expired access token' }); }
}

async function serializable(work) {
  for (let attempt = 0; attempt < 4; attempt++) {
    try { return await prisma.$transaction(work, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 5000, timeout: 10000 }); }
    catch (error) { if (error.code !== 'P2034' || attempt === 3) throw error; }
  }
}

const upgradeSchema = z.object({
  playerCarId: z.string().min(1).max(64),
  stat: z.enum(['topSpeed', 'acceleration', 'handling', 'nitro']),
  idempotencyKey: z.string().uuid().optional()
});
const purchaseSchema = z.object({ carModelId: z.string().min(1).max(64), idempotencyKey: z.string().uuid().optional() });
const statFields = { topSpeed: 'topSpeedLevel', acceleration: 'accelerationLevel', handling: 'handlingLevel', nitro: 'nitroLevel' };
const upgradeBaseCost = { topSpeed: 1800, acceleration: 1600, handling: 1400, nitro: 1700 };
const upgradeCost = (stat, currentLevel) => Math.round(upgradeBaseCost[stat] * (1 + currentLevel * 0.72));

app.get('/health', asyncRoute(async (_req, res) => {
  await prisma.$queryRaw`SELECT 1`;
  res.json({ status: 'ok', service: 'velocity-run-api', database: 'connected' });
}));

app.post('/api/auth/register', asyncRoute(async (req, res) => {
  const input = registerSchema.parse(req.body);
  const passwordHash = await bcrypt.hash(input.password, 12);
  const user = await prisma.user.create({
    data: { email: input.email, username: input.username, passwordHash, wallet: { create: { credits: 25000 } } },
    select: { id: true, email: true, username: true, createdAt: true }
  });
  res.status(201).json({ user, accessToken: tokenFor(user), tokenType: 'Bearer', expiresIn: 7200 });
}));

app.post('/api/auth/login', asyncRoute(async (req, res) => {
  const input = loginSchema.parse(req.body);
  const user = await prisma.user.findUnique({ where: { email: input.email } });
  if (!user || !(await bcrypt.compare(input.password, user.passwordHash))) return res.status(401).json({ error: 'Invalid email or password' });
  res.json({ user: { id: user.id, email: user.email, username: user.username }, accessToken: tokenFor(user), tokenType: 'Bearer', expiresIn: 7200 });
}));

app.get('/api/garage', requireAuth, asyncRoute(async (req, res) => {
  const [wallet, cars, catalog] = await Promise.all([
    prisma.wallet.findUnique({ where: { userId: req.userId }, select: { credits: true, version: true } }),
    prisma.playerCar.findMany({ where: { userId: req.userId }, include: { carModel: true }, orderBy: [{ isSelected: 'desc' }, { purchasedAt: 'asc' }] }),
    prisma.carModel.findMany({ where: { enabled: true }, orderBy: [{ class: 'asc' }, { price: 'asc' }] })
  ]);
  res.json({ wallet, cars, catalog });
}));

app.post('/api/garage/purchase', requireAuth, asyncRoute(async (req, res) => {
  const input = purchaseSchema.parse(req.body);
  const key = input.idempotencyKey || randomUUID();
  const result = await serializable(async tx => {
    const prior = await tx.economyLedger.findUnique({ where: { userId_idempotencyKey: { userId: req.userId, idempotencyKey: key } } });
    if (prior) {
      const owned = await tx.playerCar.findFirst({ where: { userId: req.userId, carModelId: input.carModelId }, include: { carModel: true } });
      if (!owned || prior.kind !== 'PURCHASE') throw Object.assign(new Error('Idempotency key was already used for another operation'), { status: 409 });
      return { playerCar: owned, balance: prior.balanceAfter, replayed: true };
    }
    const model = await tx.carModel.findUnique({ where: { id: input.carModelId } });
    if (!model || !model.enabled) throw Object.assign(new Error('Car model not found'), { status: 404 });
    const existing = await tx.playerCar.findUnique({ where: { userId_carModelId: { userId: req.userId, carModelId: model.id } } });
    if (existing) throw Object.assign(new Error('Car already owned'), { status: 409 });
    const debit = await tx.wallet.updateMany({ where: { userId: req.userId, credits: { gte: model.price } }, data: { credits: { decrement: model.price }, version: { increment: 1 } } });
    if (debit.count !== 1) throw Object.assign(new Error('Insufficient credits'), { status: 409 });
    const wallet = await tx.wallet.findUniqueOrThrow({ where: { userId: req.userId } });
    const playerCar = await tx.playerCar.create({ data: { userId: req.userId, carModelId: model.id }, include: { carModel: true } });
    await tx.economyLedger.create({ data: { userId: req.userId, kind: 'PURCHASE', amount: -model.price, balanceAfter: wallet.credits, idempotencyKey: key, metadata: { carModelId: model.id } } });
    return { playerCar, balance: wallet.credits, replayed: false };
  });
  res.status(result.replayed ? 200 : 201).json(result);
}));

app.post('/api/garage/upgrade', requireAuth, asyncRoute(async (req, res) => {
  const input = upgradeSchema.parse(req.body);
  const key = input.idempotencyKey || randomUUID();
  const result = await serializable(async tx => {
    const prior = await tx.economyLedger.findUnique({ where: { userId_idempotencyKey: { userId: req.userId, idempotencyKey: key } } });
    if (prior) {
      if (prior.kind !== 'UPGRADE' || prior.metadata?.playerCarId !== input.playerCarId || prior.metadata?.stat !== input.stat) throw Object.assign(new Error('Idempotency key was already used for another operation'), { status: 409 });
      const playerCar = await tx.playerCar.findFirst({ where: { id: input.playerCarId, userId: req.userId }, include: { carModel: true } });
      return { playerCar, balance: prior.balanceAfter, replayed: true };
    }
    const car = await tx.playerCar.findFirst({ where: { id: input.playerCarId, userId: req.userId }, include: { carModel: true } });
    if (!car) throw Object.assign(new Error('Owned car not found'), { status: 404 });
    const field = statFields[input.stat];
    const level = car[field];
    if (level >= 10) throw Object.assign(new Error('This upgrade is already at maximum level'), { status: 409 });
    const cost = upgradeCost(input.stat, level);
    const debit = await tx.wallet.updateMany({ where: { userId: req.userId, credits: { gte: cost } }, data: { credits: { decrement: cost }, version: { increment: 1 } } });
    if (debit.count !== 1) throw Object.assign(new Error('Insufficient credits'), { status: 409 });
    const changed = await tx.playerCar.updateMany({ where: { id: car.id, userId: req.userId, [field]: level, version: car.version }, data: { [field]: { increment: 1 }, version: { increment: 1 } } });
    if (changed.count !== 1) throw Object.assign(new Error('Car changed during upgrade; retry the request'), { status: 409 });
    const [wallet, playerCar] = await Promise.all([
      tx.wallet.findUniqueOrThrow({ where: { userId: req.userId } }),
      tx.playerCar.findUniqueOrThrow({ where: { id: car.id }, include: { carModel: true } })
    ]);
    await tx.economyLedger.create({ data: { userId: req.userId, kind: 'UPGRADE', amount: -cost, balanceAfter: wallet.credits, idempotencyKey: key, metadata: { playerCarId: car.id, stat: input.stat, previousLevel: level, resultingLevel: level + 1, cost } } });
    return { playerCar, balance: wallet.credits, cost, replayed: false };
  });
  res.json(result);
}));

app.post('/api/garage/select', requireAuth, asyncRoute(async (req, res) => {
  const input = z.object({ playerCarId: z.string().min(1) }).parse(req.body);
  const selected = await serializable(async tx => {
    const owned = await tx.playerCar.findFirst({ where: { id: input.playerCarId, userId: req.userId } });
    if (!owned) throw Object.assign(new Error('Owned car not found'), { status: 404 });
    await tx.playerCar.updateMany({ where: { userId: req.userId, isSelected: true }, data: { isSelected: false } });
    return tx.playerCar.update({ where: { id: owned.id }, data: { isSelected: true, version: { increment: 1 } }, include: { carModel: true } });
  });
  res.json({ playerCar: selected });
}));

app.post('/api/races/results', requireAuth, asyncRoute(async (req, res) => {
  const input = z.object({ trackId: z.string().min(1).max(64), carModelId: z.string().min(1).max(64), finishPosition: z.number().int().min(1).max(6), durationMs: z.number().int().min(1000).max(3_600_000), distanceMeters: z.number().int().min(1).max(1_000_000), driftScore: z.number().int().min(0).max(100_000_000) }).parse(req.body);
  const reward = Math.max(100, Math.round(1800 / input.finishPosition + Math.min(input.driftScore, 50000) * 0.025));
  const result = await serializable(async tx => {
    const owned = await tx.playerCar.findFirst({ where: { userId: req.userId, carModelId: input.carModelId } });
    if (!owned) throw Object.assign(new Error('Race car is not owned by this account'), { status: 403 });
    const race = await tx.raceResult.create({ data: { ...input, userId: req.userId, rewardCredits: reward } });
    const wallet = await tx.wallet.update({ where: { userId: req.userId }, data: { credits: { increment: reward }, version: { increment: 1 } } });
    await tx.economyLedger.create({ data: { userId: req.userId, kind: 'RACE_REWARD', amount: reward, balanceAfter: wallet.credits, idempotencyKey: randomUUID(), metadata: { raceResultId: race.id } } });
    return { race, wallet };
  });
  res.status(201).json(result);
}));

app.use((err, _req, res, _next) => {
  if (err instanceof z.ZodError) return res.status(400).json({ error: 'Invalid request', details: err.issues.map(x => ({ path: x.path.join('.'), message: x.message })) });
  if (err.code === 'P2002') return res.status(409).json({ error: 'A record with that unique value already exists' });
  const status = Number(err.status) || 500;
  if (status >= 500) console.error(err);
  res.status(status).json({ error: status >= 500 ? 'Internal server error' : err.message });
});

const server = app.listen(PORT, () => console.log(`Velocity Run API listening on :${PORT}`));
async function shutdown(signal) {
  console.log(`${signal}: shutting down API`);
  server.close(async () => { await prisma.$disconnect(); process.exit(0); });
  setTimeout(() => process.exit(1), 10000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
