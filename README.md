# Velocity Run

A mobile-first Three.js arcade racer built with Vite and Vanilla JavaScript.

## Current architecture

- **Game client:** Vite + Vanilla JavaScript + Three.js, deployed as a static Vercel site.
- **Identity:** Supabase Auth email/password sessions.
- **Database:** Supabase PostgreSQL project `tpp-open-world-game-backend` (Free organization, region `eu-west-1`, project ref `jgoygfnlvgognltxtfyf`).
- **Game backend:** authenticated PostgreSQL RPC functions. Each purchase and upgrade is a single database transaction with row locks, ownership checks, balance checks and idempotency receipts.
- **Security:** RLS is enabled on racing tables. The browser only receives the Supabase publishable key. Service-role and database credentials are never included in frontend code.
- **No landscape lock:** the game adapts to the current viewport, including portrait mobile screens. Three.js updates the camera aspect and renderer size when the viewport changes.

The existing open-world game tables in Supabase are preserved. Velocity Run uses its own `race_*` tables and functions.

## Supabase racing data

- `race_car_models`: seeded D, C, B, A and S class catalogue.
- `race_player_cars`: player-owned cars and four upgrade levels, with a unique ownership constraint and at most one selected car per player.
- `race_economy_ledger`: append-only credit debits and adjustments.
- `race_action_receipts`: idempotency keys and replayable mutation responses.
- `race_results`: race records. Client-submitted results remain unverified and do not grant rewards.

The first garage request creates the player's racing profile if needed, a 25,000-credit starting wallet if no wallet exists, and the free Falcon GT starter car.

### Authenticated RPC endpoints

- `race_get_garage()`
- `race_purchase_car(p_car_model_id, p_action_key)`
- `race_upgrade_car(p_player_car_id, p_stat, p_action_key)`
- `race_select_car(p_player_car_id)`
- `race_record_result(...)`

The purchase RPC locks the player's wallet before debiting and creating ownership. The upgrade RPC locks the owned car and wallet, calculates the price on the server, and updates the selected stat. Repeated requests with the same action key return the original response rather than charging twice.

## Local development

Copy `.env.example` to `.env.local` and set:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY` (the Supabase publishable key; it is intended for browser use with RLS)

Then run:

```sh
npm install
npm run dev
```

The Vercel project has both variables configured for Production, Preview and Development. A new deployment is required after changing build environment variables.

If Supabase email confirmation is enabled, a new player must confirm the email address before signing in. The account form returns to the current game URL after confirmation.

## Database migrations

The racing migrations are checked into `supabase/migrations/` and have been applied to the existing Supabase project:

1. `20261103221454_velocity_run_racing_garage.sql`
2. `20261103221522_race_economy_idempotency_and_indexes.sql`
3. `20261103221600_race_selected_car_transaction_lock.sql`

The Supabase project also contains earlier open-world-game migrations that are not recreated by these racing-only files.

## Important competitive-integrity boundary

Race results submitted by the browser are marked `verified = false`, and the database awards no race credits. Do not use these client-submitted records for competitive leaderboards or rewards. Those features require authoritative race sessions and server-side simulation/anti-cheat validation.

## Legacy backend files

`server.js`, the Prisma schema and Dockerfile are retained from the earlier standalone Node API experiment. The current Vite racing client does not call that API. Supabase Auth and the database RPC functions above are the active account and garage backend.
