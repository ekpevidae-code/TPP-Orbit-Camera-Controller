# Game backend foundation

This repository now has a separate Supabase backend for the open-world game.

## Project
- Supabase project: `tpp-open-world-game-backend`
- Region: `eu-west-1` (Ireland)
- API URL: `https://jgoygfnlvgognltxtfyf.supabase.co`
- Edge Function: `/functions/v1/game-session`

## Client configuration
Copy `.env.example` to `.env` for local development. The publishable key is intended for client use; never put a service-role key in the browser or commit it to GitHub.

## Current database systems
- Player profiles
- Three-slot-ready cloud save structure (slot 1 currently used by the session endpoint)
- Player wallet
- Player inventory
- Player-owned vehicles
- Mission definitions
- Per-player mission progress

All tables have Row Level Security enabled. Players can read only their own private game data. Wallet, inventory, vehicle ownership, and mission progress are not writable directly by the browser.

## Edge Function actions
All requests require a valid Supabase Auth access token.
- `bootstrap`: create the player's profile, wallet, and initial save row.
- `load`: load profile, save, wallet, inventory, vehicles, and mission progress.
- `save`: save a bounded JSON checkpoint. Economy and ownership fields are rejected.

## Important gameplay architecture
Do not send per-frame movement, camera, physics, vehicle simulation, or collision updates to Supabase. Keep those systems inside the Three.js game loop. Use the backend for sign-in, cloud saves, mission state, inventory, wallet, and durable player progression. A true shared multiplayer world needs a dedicated authoritative real-time game server; Supabase Realtime is not a substitute for a high-frequency physics server.

## Not yet complete
The backend project, schema, security policies, and session Edge Function are deployed. The game client adapter is committed, but the account UI, automatic sign-in/bootstrap, live save/load wiring to the actual player/world state, economy/mission command validation, and a full build/runtime test still need implementation. Do not describe the game as fully online or multiplayer-ready yet.
