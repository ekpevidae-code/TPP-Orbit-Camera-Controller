# Third-party character assets

The starter protagonist's original Link model is no longer used by the player asset configuration.

The replacement human body, hair, T-shirt, jeans, shoes and animation GLB files are loaded from the generated output directory of:

- Project: https://github.com/kblood/CharacterCreator
- Source project code license: GPL-3.0-or-later (the game does not import or bundle that generator code).
- Generated output assets: CC0-1.0, as stated in that project's README and asset-license manifest.
- Character rig: MakeHuman-derived 53-bone game-engine humanoid skeleton.
- Animation clips included in the body GLB: idle, walk, run, walk_back, strafe_left, strafe_right, jump, fall and land.
- Runtime asset host: https://raw.githubusercontent.com/kblood/CharacterCreator/master/output/

The generated CC0 assets may be used and modified commercially without attribution. The external repository is credited here for provenance. The game loads the model files directly; no GTA/Rockstar code or assets are used.
