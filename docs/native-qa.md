# Native QA build

Run `scripts/build-wasm.sh --qa` to build `web/core-qa/blipblop.js` and `.wasm` with `BB_QA=1`. The ordinary build remains in `web/core/` and does not export these functions. Keep `web/core-qa/` out of production deployments.

The QA build uses the same original engine and game data. Load its script with `Module.locateFile = name => 'core-qa/' + name`; populate its FS and start it through the regular bridge exactly as production.

All player indexes below are zero-based. Run the controls after state `inGame` becomes true. Pausing before manipulating diagnostic state makes observations deterministic; unpause for simulation-dependent assertions.

| Export | Behavior |
| --- | --- |
| `_bb_qa_weapon(player, id)` | Select 0 M16, 1 shotgun, 2 submachine gun, 3 flamethrower, 4 laser. For 1–4, invokes the original pickup's `estPris` method after clearing priority suppression. Returns selected weapon ID. |
| `_bb_qa_health(player, hp, lives)` | Set diagnostic health/life preconditions. Returns HP. |
| `_bb_qa_hit_player(player, damage)` | Clears temporary invincibility and invokes original `Couille::estTouche`. Returns HP. |
| `_bb_qa_die(player)` | Sets one remaining life, clears invincibility and applies lethal damage through the original player-damage method. Death animation and campaign defeat still run normally. In co-op, invoke for both players to test game over. |
| `_bb_qa_finish_level()` | Sets the same level-complete flag as the original F9 cheat. Original transition, scoring, briefing and ending code executes normally. This tests transitions; it does not prove bosses can be defeated. |
| `_bb_qa_cows(player, count)` | Sets cow inventory and readies its original cooldown for input-driven firing. |
| `_bb_qa_pickup_health(player, barrel)` | Applies an original beer pickup (`0`) or barrel (`1`) and returns resulting HP. |
| `_bb_qa_damage(weapon, hits)` | Passes real original projectile classes through `Ennemi::estTouche` against a surviving diagnostic enemy, returning actual HP lost. IDs 0–4 match weapons above; 5 is a cow. Shotgun is initialized as a fresh pellet; flamethrower is initialized to 12 base damage. Player score is restored after the probe. |
| `_bb_qa_state_json()` | UTF-8 JSON with active player projectile count, cow projectile count, enemy count, player states, second player's weapon/ammo, game flags and SDL audio/music diagnostics. |

`audioContext` is 3 running, 2 suspended, 1 closed, or 0 unavailable. `audioOpen`, `musicPlaying`, `musicPaused` and `soundChannelsPlaying` come from SDL_mixer. These prove native audio initialization/state, not that a human heard sound.

Examples of meaningful assertions:

- In Original mode, setting upgrade ranks to five leaves `_bb_qa_damage(0, 10)` at 400. In Roguelite with rank five, it returns 600.
- After picking each original weapon, hold fire via `_bb_set_input(1 << 4)` and observe projectile activity/ammunition changing; release input afterward.
- With armor rank three in Roguelite, a barrel restores HP to eight and beer caps at eight. Original caps at five regardless of saved upgrade ranks.
- Complete stage 1 through the QA flag; inspect the ensuing briefing and stage 3 checkpoint. Clearly record that victory was forced for this transition test.
- Kill the last-life player through actual damage, observe original death animation, then exactly one `onDeath` callback.
- Start part 21, force completion, and advance the actual ending sequence using Confirm to test `onComplete`. Do not call the callback directly.
