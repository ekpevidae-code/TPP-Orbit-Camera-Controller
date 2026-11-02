# Game Technical Audit — 2026-11-02

## Scope
Reviewed the current `main` branch of `ekpevidae-code/TPP-Orbit-Camera-Controller`, including the Vite entry point, Three.js game loop, renderer, asset loader, world systems, player, vehicle, city streaming, and deployment configuration.

## What this project is today
- A client-side browser game built with Three.js 0.177 and Vite 7.
- Vercel serves the built static website. It is not a dedicated game server and does not provide GPU rendering for the player.
- There is no login/authentication implementation, database, multiplayer server, API backend, or cloud simulation service in this repository.
- `src/Game/Systems/PhysicsSystem.class.js` is currently only a stub; movement and collisions are custom JavaScript.
- The main game loop runs camera, world systems, renderer, and UI synchronously on the browser animation frame.

## Findings that can contribute to stalls
1. **Asset startup dependency:** five GLB files are loaded from `raw.githubusercontent.com` (body, hair, shirt, jeans, shoes), plus six environment cube-map images. Game initialization waits for the Three.js LoadingManager to report completion. A slow or blocked remote asset can hold up startup.
2. **Large application bundle:** the last recorded Vercel build produced a 1,009.39 kB minified main JavaScript chunk (267.92 kB gzip). The build warns that the chunk exceeds 500 kB.
3. **Synchronous city construction:** procedural city districts are generated on the main browser thread. The latest city change batches box geometry into InstancedMesh and generates at most one district per frame, but each district still performs CPU work and creates other meshes.
4. **Per-frame work:** player, vehicle, traffic, pedestrians, police, combat, lighting, camera, UI, and rendering are updated on the same main thread. There is no worker-based simulation.
5. **Character animation cost:** the body and up to four separate clothing/hair rigs each have an AnimationMixer updated every frame.
6. **Mobile graphics cost:** the earlier mobile renderer still used real-time shadow maps and a 1.25 pixel-ratio cap. The new mobile profile disables shadow maps and caps pixel ratio at 0.9 to establish a much lighter baseline.

## Diagnostic instrumentation added
Touch devices now display a small live diagnostics panel with:
- FPS
- Three.js draw calls and triangles
- Geometry and texture counts
- JavaScript heap size when the browser exposes it
- Shadow-map status

The panel also displays JavaScript errors, unhandled asynchronous errors, and WebGL context-loss events. This is intended to distinguish CPU/JavaScript stalls, graphics overload, and context loss. Some Android browsers do not expose JS heap size.

## Next engineering steps
1. Collect the live diagnostics while the game is running and at the moment it freezes.
2. Add asset timeouts/fallbacks and move remote character assets to versioned, locally hosted files after confirming their licenses and sizes.
3. Split the main bundle and lazy-load optional game systems.
4. Move city generation off the critical frame path or use prebuilt, optimized city chunks; add distance-based detail and geometry budgets.
5. Reduce animation mixers and unnecessary per-frame allocations.
6. Decide whether to continue with Three.js or deliberately port to Godot 4. Do not mix engines or paste unrelated game projects together.
7. Add accounts, save data, multiplayer, or cloud simulation only when a real backend is designed and needed.

## Engine and cloud decision
- Three.js is appropriate for a browser-playable prototype, but this project's current main-thread and asset-loading design needs profiling before adding features.
- Godot 4 is a serious open-source alternative. Its official documentation distinguishes the Mobile renderer for newer mobile hardware and Compatibility renderer for older mobile/web targets. A Godot port would be a rewrite of gameplay systems, not a drop-in backend patch.
- Cloud streaming can render a game on a separate GPU machine and stream video to a phone, but it requires an actual GPU host, video encoding, network bandwidth, and a streaming client. Vercel static hosting alone cannot do this. Sunshine/Moonlight is an open-source self-hosted example, but requires a capable host computer.
- No paid cloud GPU has been provisioned. Do not represent cloud gaming as active or free until a real host is available.

## Validation status
The recent Vercel deployment reached READY, which verifies the website build/deployment pipeline only. It does not prove the game runs smoothly on a physical Android phone. Runtime diagnosis still requires the on-device metrics.
