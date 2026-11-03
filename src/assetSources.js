const CHARACTER_ASSET_BASE = 'https://raw.githubusercontent.com/kblood/CharacterCreator/master/output';

// Load only the essential character model during startup. Optional outfit and
// environment assets are deliberately excluded from the critical path on mobile.
const ASSETS = [
  { id: 'playerModel', type: 'gltfModel', path: `${CHARACTER_ASSET_BASE}/base_body_anim.glb` },
];

export default ASSETS;
