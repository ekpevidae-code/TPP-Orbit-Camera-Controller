# Velocity Run — game client and API

## Architecture

- The Vite/Three.js client is deployed as a static site on Vercel.
- `server.js` is a separate, persistent Node.js API process. Do not deploy it as a long-running process inside a Vercel static build.
- PostgreSQL stores accounts, wallets, the D/C/B/A/S car catalogue, owned cars, upgrades, race records, and an immutable-style economy ledger.
- Prisma runs all purchase and upgrade mutations in serializable transactions. Wallet debits are conditional and owned cars have a unique `(userId, carModelId)` key.
- The browser never receives database credentials. It sends a short-lived JWT access token to the API.

## Required environment

Copy `.env.example` to `.env` on the API host and set real values:

- `DATABASE_URL`: PostgreSQL connection string.
- `JWT_SECRET`: at least 32 random characters; keep it private.
- `CORS_ORIGIN`: exact Vercel frontend origin(s), comma-separated.
- `PORT`: API listening port.

Set `VITE_API_URL` in the Vercel project build environment to the public HTTPS origin of the API. Rebuild the frontend after changing it.

## Initialize PostgreSQL

Use Node.js 20 or newer:

```sh
npm install
npx prisma generate
npx prisma db push
npm run db:seed
```

`db:push` creates/updates the schema directly from `prisma/schema.prisma`. For a team production workflow, generate and review Prisma migrations in a controlled development database before using `prisma migrate deploy`.

## Run locally

Terminal 1 (API):

```sh
npm run api
```

Terminal 2 (game client):

```sh
npm run dev
```

The API health check is `GET /health`. The client uses `VITE_API_URL`; set it to `http://localhost:4000` for local development.

## API endpoints

- `POST /api/auth/register` — create account and starter wallet.
- `POST /api/auth/login` — issue a two-hour bearer token.
- `GET /api/garage` — return wallet, owned cars, and enabled catalogue.
- `POST /api/garage/purchase` — purchase a catalogue car; supports `Idempotency-Key`.
- `POST /api/garage/upgrade` — upgrade one stat for an owned car; supports `Idempotency-Key`.
- `POST /api/garage/select` — select an owned car.
- `POST /api/races/results` — store a race record for an owned car.

The race result endpoint currently records client-submitted race data and must not be used as a trusted competitive leaderboard or reward authority until server-authoritative race sessions and anti-cheat validation are deployed.

## Container deployment

A Dockerfile is included for a persistent API host. Build the image from the repository root, configure the required environment variables, and run the database initialization commands once before sending traffic:

```sh
docker build -t velocity-run-api .
docker run -p 4000:4000 --env-file .env velocity-run-api
```

Before the first API start, run `npx prisma db push` and `npm run db:seed` from the same image/container with the database environment configured. Keep the API service running separately from the Vercel static frontend.

## Important deployment boundary

The repository contains the complete API source and database schema, but the API is not live until a PostgreSQL database and a persistent Node.js host are configured with the environment variables above. The current Vercel deployment serves the game frontend only. No database credentials or hosted database were present in the connected project, so none have been fabricated or committed.
