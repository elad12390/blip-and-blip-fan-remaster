# Blip & Blop: primary-source inventory and port fidelity notes

Research checkpoint, 26 September 2026. Source facts below are verified from local clones; descriptive English world titles are editorial labels unless explicitly identified otherwise. This is not a claim that every level has been played through.

## Sources

- User-supplied Windows download page: https://www.vins.co.il/download/Blip-and-Blop
- Published original C++ source/modernization fork: https://github.com/benkaraban/blip-blop . README says the original authors released their 2002 game source years later. Local: `vendor/original-source/`.
- SDL Android port, GPL-3.0 repository: https://github.com/smartties/Blip-Blop-for-Android . README attributes the original to LOADED Studio and port to Martin JULES. Local: `vendor/android-port/`.
- Authoritative campaign list: https://github.com/benkaraban/blip-blop/blob/master/vc-projects/Blip_n_Blop_3/data/bb.lst (local path verified; repository default branch should be checked before presenting deep links externally).

## Exact campaign sequence

The original `data/bb.lst` lists 12 playable level files and 10 briefing images, grouped by seven main briefings. Preserve their order and the two bonus levels. Seven worlds is a useful UI grouping, not proof of seven canonical English titles.

|Order|Group label|Exact level|Level type|Preceding briefing|
|---|---|---|---|---|
|1|Smurf world, part 1|snuf1.lvl|FIRST|brief1.gfx|
|2|Smurf world, part 2|snuf2.lvl|LAST|brief1_1.gfx|
|3|Dork bonus|dork.lvl|BONUS|brief2.gfx|
|4|Care Bear world, part 1|bisous1.lvl|FIRST|brief3.gfx|
|5|Care Bear world, part 2|bisous2.lvl|INTER|brief3_1.gfx|
|6|Care Bear world, part 3|bisous3.lvl|LAST|none|
|7|Snork world, part 1|snorkniv.lvl|FIRST|brief4.gfx|
|8|Snork world, part 2|snorkniv2.lvl|LAST|none|
|9|Lemmings bonus|lem.lvl|BONUS|brief5.gfx|
|10|Video game world|video.lvl|COMPLETE|brief6.gfx|
|11|Video game bosses|videoboss.lvl|COMPLETE|brief6_1.gfx|
|12|Final boss|finalboss.lvl|END|brief7.gfx|

Type constants in `jni/src/game.h`: BONUS=0 FIRST=1 INTER=2 LAST=3 COMPLETE=4 END=5. These change gameplay: FIRST/COMPLETE/BONUS/END reset weapon/health and statistics; INTER/LAST preserve them. Bonus stages temporarily use one life, restore the pre-stage life totals, cannot cause a campaign loss, and have a time limit. Do not implement them as ordinary combat stages.

After the final playable level, `Game::jouePartie` plays `end.cin` with `end.gfx`, credits music, `theend.gfx`, and credits. The complete campaign must include these sequences. The first level starts with no cow bombs; one is granted after the first completed playable level. Later stage completion does not automatically refill it through that same code.

## Weapons and player mechanics

Weapon IDs are exact from `couille.h`: 0 M16 (default), 1 FUSIL (shotgun), 2 PM (machine gun/submachine gun), 3 LF (flamethrower), 4 LASER. Cow bomb is a separate special action, not a sixth interchangeable gun. `M16`, `Shotgun`, `Machine gun`, `Flamethrower`, `Laser`, `Cow bomb` are safe descriptive UI labels; PM expands to French pistolet-mitrailleur.

|Weapon|Pickup ammo|Maximum via repeated pickups|Cadence value in original tick units|
|---|---:|---:|---:|
|M16|Unlimited default|n/a|10|
|Shotgun|20|40|45|
|PM|200|400|5|
|Laser|750|1500|1|
|Flamethrower|1000|2000|1|

Verified in `bonus_fusil.h`, `bonus_pm.h`, `bonus_laser.h`, `bonus_lf.h`, `couille.cpp`. These are engine tick values, not milliseconds. Gun pickups replace the equipped weapon, with some protections: shotgun/PM pickups are refused while laser/flamethrower has at least 100 ammo. Non-M16 weapons consume ammo and fall back to the default gun.

Players begin with five lives and five health (`couille.cpp`). Both Blip and Blop are supported. The original has two-player co-op (`Game::jouePartie(nbj,idj)` constructs and separately controls player2). There are 18 directional sprite/aim constants. Perfect performance grants a superweapon at the next reset stage: Blip gets laser, Blop flamethrower; in Snork levels flamethrower is disabled (`okLanceFlame=false`), so laser is substituted. Preserve intentional underwater weapon rules.

Player code also implements jumping, falling/air steering, recoil, roll/somersault state, double-down platform dropping, hit invulnerability, death/respawn, weapon weight affecting movement, vehicle lock states, cow bomb invulnerability, score, kill count and perfect-stage tracking. These should be retained through the existing core, not guessed from superficial screenshots.

## Enemy and boss coverage

The source contains distinct AI classes, projectile types, gore/animation states and scripted flags, not a generic enemy template. Confirmed families by source filenames include:

- Smurfs: basic, farmer, wild, strong, glutton, chilly, lazy, joker, stork, Smurfette, Grand Smurf.
- Care Bears (`bisou`): auto, boom, heart, sky/rainbow, star, cloud, zombie, shaman, Jedi, SIB.
- Snorks: base variants, mage, governor, hyporider, Snork in Black and Snork in Black boss.
- Lemmings; Pac-Man and Pac-Man car; Yoshi and Yoshi DCA; Pikachu and hero variant; Bulbasaur and hero variant; flame/Charmander family; COM family; Rayman and detached head; Lara; princess and guards; Sonic, Tails and Knuckles; Mario, Mario hologram, Luigi.

Names above are code-family translations, not a verified enemy-to-level spawn map. Exact spawn composition and boss order must come from parsed `.lvl` event streams, not this filename list. `EnnemiMario` has 50,000 HP and numerous distinct horizontal/vertical/cross/constant/seeking/rain fireball attacks. Omitting these in favor of a generic boss would not be faithful. Princess is 3,700 HP and has scripted escort/guard/event behavior; it must not automatically be classified as an ordinary hostile boss solely because its class is Ennemi.

## Critical Android regressions to avoid

1. **Co-op disabled at menu despite preserved engine support.** In Android `menu_main.cpp`, pressing the second-player option returns RET_CONTINUE and displays a downloads milestone message. The engine still has `jouePartie(2, selectPlayer())`; browser UI must call working co-op directly rather than copy this gate.
2. **Android menus are touch-first replacements with unreachable old keyboard code.** `MenuGame::update` handles touch then unconditionally returns before the original keyboard path; options UI is TODO/commented out. Replace menu/input plumbing.
3. **Projectile aiming changes.** Original `tir_bbm16.cpp` and `tir_bbpm.cpp` update position with discrete `dx_tirbb_*[dir]` / `dy_tirbb_*[dir]` tables; Android replaces this with `update_tir(..., angle)`. Flamethrower movement also uses `angle`. Android `couille.cpp` sets `t->angle = in.angle` only on the final `t` emitted by a trigger, which is especially suspicious for paired flame emissions. Classic mode should use original movement tables; modern free aiming can be a separate deliberate behavior.
4. **Android health/lives did not show a broad rebalance in inspected player files.** Both constructors use five lives/five health. Most enemy-file differences inspected are ownership/list modernization, not HP changes. This is a narrow diff finding, not an exhaustive proof that all game balance is byte-identical.
5. **Platform-specific waiting and input loops.** End sequence includes an Android touch-up loop; pause/options/character selection have touch assumptions. Ensure keyboard, pointer and touch can all exit/advance scenes and reach credits.

## Music container verification

The `.zik` suffix is a game-resource name, not a codec. Offline extraction and FFprobe checks identify 18 music files in the published source corpus: 14 Ogg and 4 MP3. The exact Vins distribution has 16: 13 MP3, 2 Ogg and 1 RIFF/WAVE. `gameover.zik` and `tambour.zik` each begin with 417 zero bytes before a valid MPEG Layer III frame; both are MP3, not MOD/tracker modules. The original `hard.zik` is WAV, while `suspens.zik` and `vidboss.zik` are Ogg. Preserve the original bytes and detect the actual container rather than selecting the tracker decoder for an unfamiliar leading signature.

## Faithfulness boundary

Classic mode should preserve the ordered level streams, enemy AI, collisions, weapons/ammo, score/bonus rules, original checkpoint-free campaign behavior and co-op. Modern mode can add checkpoints, persistent saves and earned upgrades while keeping them isolated from classic balance. The user explicitly requests a recreation from scratch: compiling the released engine to WebAssembly is a source port and must be described honestly if it is the implementation chosen. A new browser shell and lighting renderer do not alone make the core a from-scratch recreation.

## Still unverified

- Canonical English level titles, exact per-stage boss sequence and every secret require briefing/text extraction and level-event analysis.
- Every level, boss, ending and co-op path still requires real browser play-through QA.
- No conclusion has been reached here about asset licensing beyond the Android repository GPL file; source code being available does not by itself prove a separate grant for every third-party character asset.
