# Open-world game systems and backend wiring

## Backend project
- Supabase project: tpp-open-world-game-backend
- Project reference: jgoygfnlvgognltxtfyf
- Region: eu-west-1 (Ireland)
- Edge Function: game-session (JWT verification enabled)

## Connected game architecture
- The browser game owns per-frame movement, camera, animation, collisions, traffic and police simulation.
- Supabase owns durable identity, cloud checkpoint, wallet, inventory, vehicle ownership, mission progress, item/vehicle catalogues and transaction history.
- The game session controller signs players in, bootstraps a player profile and starter kit, restores checkpoint position/vehicle/ammunition, loads owned-vehicle and mission records, and saves checkpoints periodically.
- The first-drive mission reads its target and reward from mission_definitions; completion updates the mission, wallet, and ledger in one transaction.
- World ammo pickups call the inventory transaction and update the live reserve-ammo HUD only after the server confirms the item quantity.
- No per-frame movement or physics data is sent to the database.

## Relational model
- auth.users → player_profiles, player_saves, player_wallets, player_stats, player_inventory, player_vehicles, player_missions, wallet_transactions, game_action_receipts
- item_definitions → player_inventory.item_code
- vehicle_definitions → player_vehicles.vehicle_code
- mission_definitions → player_missions.mission_code
- wallet_transactions records each money change and has a unique per-player event key.
- game_action_receipts provides idempotency keys so retried pickups or mission actions do not apply twice.

## Server-authoritative transactions
The Edge Function validates the Supabase Auth token and derives the player ID from the verified user, never from request JSON. It calls restricted Postgres functions for:
- Inventory pickup (game_add_inventory_item)
- Mission start (game_start_mission)
- Mission completion and reward payout (game_complete_mission)

Mission completion changes mission status, updates the wallet and writes the wallet ledger in one database transaction. The functions are executable only by service_role; the browser cannot call them directly.

## Client integration
- Account panel: sign in / create account / sign out
- Guest play remains available
- Cloud state is restored on successful sign-in
- Cloud checkpoint is saved every 45 seconds while connected, plus a manual save control
- Save payload rejects protected economy, health and ownership fields

## Verification status
- Database schema: created and inspected
- Foreign keys: verified in database metadata
- Row Level Security: enabled on all game tables
- Security advisor: no remaining security findings after deny policy added for action receipts
- Edge Function: deployed; latest version 5, JWT verification enabled
- Game source: client adapter and session controller committed
- Automated production build workflow: production build passed on the latest code commit (e97e741)
- SQL transaction smoke test passed: mission completion paid $250, marked the mission complete, wrote one ledger entry, and a repeated pickup action did not double-add ammo. Runtime sign-in, cloud restore/save, pickup collection and mission payout still need a real test account and phone run

## Not a high-frequency multiplayer server
This is a persistent-player backend, not a dedicated authoritative 3D simulation server. A shared real-time open world needs a separate game server with client prediction/interpolation, server authority and replication. Supabase should not receive character or vehicle transforms every frame.
