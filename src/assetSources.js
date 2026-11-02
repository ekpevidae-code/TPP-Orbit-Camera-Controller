const CHARACTER_ASSET_BASE = 'https://raw.githubusercontent.com/kblood/CharacterCreator/master/output';

const ASSETS = [
  {
    id: 'environmentMapTexture',
    type: 'cubeMap',
    path: [
      '/assets/textures/environmentMap/px.png',
      '/assets/textures/environmentMap/nx.png',
      '/assets/textures/environmentMap/py.png',
      '/assets/textures/environmentMap/ny.png',
      '/assets/textures/environmentMap/pz.png',
      '/assets/textures/environmentMap/nz.png',
    ],
  },
  // CC0 MakeHuman-derived character export with a 53-bone humanoid rig
  // and named idle/walk/run/jump animations. Clothing and hair use the same rig.
  { id: 'playerModel', type: 'gltfModel', path: `${CHARACTER_ASSET_BASE}/base_body_anim.glb` },
  { id: 'playerShirt', type: 'gltfModel', path: `${CHARACTER_ASSET_BASE}/clothing_tshirt.glb` },
  { id: 'playerJeans', type: 'gltfModel', path: `${CHARACTER_ASSET_BASE}/clothing_jeans.glb` },
  { id: 'playerShoes', type: 'gltfModel', path: `${CHARACTER_ASSET_BASE}/clothing_shoes.glb` },
  { id: 'playerHair', type: 'gltfModel', path: `${CHARACTER_ASSET_BASE}/hair_short02.glb` },
];

export default ASSETS;
