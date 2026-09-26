# Browser engine architecture

`native/src` is an isolated copy of the modern SDL2 version of Loaded Studio's original C++ game, retrieved in `vendor/original-source`. Vendor sources remain unchanged. The campaign runner, level loader, 12 stage layouts, all enemy and boss classes, weapon rules, scripted events, cinematics, sounds and music remain in that engine. It is a source port, not a clean-room reimplementation.

Emscripten compiles the whole engine to `web/core/blipblop.js` and `blipblop.wasm`. Asyncify suspends the original nested blocking loops at input and display boundaries, so they can run in a browser. Source remains available for rebuilding via `scripts/build-wasm.sh` after the local SDK is installed.

The browser creates `window.Module` with `noInitialRun: true`, populates the Emscripten filesystem with all original `data/` files, configures a run and invokes `callMain([])` once. That main function initializes the original resource banks and loops over queued run requests. No original gameplay is implemented in JavaScript.

## Public bridge

- `_bb_start(mode, player, part)`: queue a campaign from part 0 or a checkpoint part (0–21). Mode 0 = original, 1 = roguelite; player 0 = Blip, 1 = Blop.
- `_bb_set_players(count)`: 1 or 2 local players.
- `_bb_set_input(mask)` and `_bb_set_input2(mask)`: bits 0 left, 1 right, 2 up, 3 down, 4 fire, 5 jump, 6 cow, 7 confirm, 8 escape.
- `_bb_pause(0|1)`: suspend simulation and audio without leaving the campaign.
- `_bb_set_upgrades(armor, firepower, supply)`: integer ranks; effects are gated on roguelite mode.
- `_bb_volume(0..128)`: music and sound volume.
- `_bb_state_json()`: UTF-8 JSON string with run/phase flags, part, character, screen coordinates, HP, lives, weapon, ammo, cows, score, current stage kills, scroll offset, completion and game-over state.

Callbacks: `Module.onFrame(pointer, width, height, pitch, materialPointer)`, `Module.onCheckpoint(JSON)`, `Module.onDeath(JSON)`, `Module.onComplete(JSON)`.

Checkpoints store the stage boundary, not a snapshot of arbitrary in-flight enemies. Loading one restarts that stage. Roguelite armor adds one maximum HP per rank and updates health pickups/respawns. Firepower distributes an extra 10% damage per rank with an integer remainder accumulator, so one-damage bullets do not accidentally double in strength. Supply grants one extra cow per rank at each stage. Original mode applies none of these modifiers.

## Correctness fixes made while porting

- Browser pause yields without advancing fixed-step gameplay; long scheduling gaps have bounded catch-up.
- The co-op second player's animation initialization mistakenly touched player 1; it now initializes player 2.
- SDL_mixer wrapper now honors sound/music loop flags, allocates the original channel count, and frees its stream wrappers.
- All original MP3, Ogg and tracker music formats are linked into the browser build.
- Browser menus replace operating-system fullscreen and keyboard-only high-score entry. The original campaign briefings, cinematics and ending remain.

The browser Continue/Enter control can skip the ending credits after a one-second initial guard. Without that input, the original credits scroll to completion. Interrupted runs cannot emit a completion reward after a replacement run has been queued.

The modern defeat overlay retains the original `gameover.zik` MP3 cue. Only that music resumes after the overlay pauses gameplay; the simulation remains paused.

`gameover.zik` and `tambour.zik` are MP3 files with a 417-byte zero prefix, not tracker modules. Their original bytes remain intact; the SDL adapter decodes a trimmed memory view explicitly as MP3. Decode failures now propagate, and stopping an inactive music bank cannot halt another bank's active stream.
