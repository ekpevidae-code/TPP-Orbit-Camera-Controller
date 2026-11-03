# Velocity Run backend foundation

This folder is deliberately isolated from the Vite frontend so the existing playable game continues to deploy on Vercel without requiring database credentials.

## Current foundation

- Node.js 20+ and strict TypeScript
- Express health endpoints
- Socket.IO WebSocket server with the Redis adapter
- PostgreSQL data model through Prisma
- Persistent users, wallets, garage cars, refresh-session records, economy ledger and race-result records

## Local setup

1. Install Node.js 20 or newer.
2. Copy `.env.example` to `.env` and set real PostgreSQL and Redis connection strings.
3. From this folder run `npm install`.
4. Run `npm run db:generate`.
5. Create the first migration with `npx prisma migrate dev --name init`.
6. Start the API with `npm run dev`.

The health endpoints are `/health/live` and `/health/ready`.

## Important deployment boundary

The Vercel project currently deploys the browser game only. This backend is not yet deployed or connected to the live game. It requires a reachable PostgreSQL database and Redis service, secrets, migrations, authentication, matchmaking and an authoritative race simulation before it can safely handle player accounts or rewards.

Do not put production credentials in GitHub. Do not use client-submitted balances, vehicle stats, race positions or finish times as authoritative data.
