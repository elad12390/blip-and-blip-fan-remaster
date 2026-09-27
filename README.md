# Blip & Blop — Fan Remaster

**An unofficial fan game and browser remaster of _Blip & Blop: Balls of Steel_ (LOADED Studio, 2002), with modern controls, GPU rendering, and new ways to play.**

## [▶ Play in your browser](https://blip-and-blop.vercel.app)

Blip & Blop is a chaotic, cartoon run-and-gun platformer: run, jump, aim and shoot through waves of enemies, collect weapons, unleash cow bombs, and take on bosses. Play solo or team up locally with a second player. Expect the original game's over-the-top violence and parody characters.

This is a fan-made tribute, not an official release or a project affiliated with LOADED Studio. The original creators deserve the credit for the game, characters, artwork, music and campaign; this project brings that foundation to modern browsers and builds improvements around it.

### Why this project exists

This fan remaster was also an experiment in building and improving a real game with **Claude Opus 5.5**. In the project creator's words: **“It really outdid itself.”** The experiment spans browser adaptation, UI, rendering, gameplay fixes, debugging tools and testing—not just a demo screen.

### What's improved

- **Play without installing:** the campaign runs in your browser using WebAssembly.
- **GPU rendering:** WebGL2 sprite rendering, optional enhanced lighting and a CPU fallback.
- **A game-style interface:** canvas menus, original artwork, character portraits and an in-game HUD.
- **Responsive play:** an adaptive camera and separate portrait/landscape touch layouts.
- **Your choice of controls:** keyboard, remappable gamepad buttons, touch controls and local two-player co-op.
- **Gentler difficulty options:** adjusted damage, enemy numbers and generator crowd limits, plus fixes for stalled encounters and missing spawns.
- **Optional Roguelite progression:** persistent upgrades, shards and stage checkpoints alongside Classic mode.
- **Speedrun tools:** a timer, automatic stage splits, personal bests and gold segments, separated by mode, difficulty and player count.
- **Debugging and practice:** an in-game console with cheats, entity inspection, stage warps, fast-forward and experimental autoplay.

Progress and records are saved locally in your browser. There is no online leaderboard or account requirement.

**Implementation boundary:** the gameplay engine is a modified port of the published C++ source compiled to WebAssembly. The browser interface, input adapter, save/progression layer and lighting integration are new. This is **not a complete from-scratch or clean-room rewrite** of the game engine. The 12 original level files, enemies, weapons, scripts, cinematics and ending remain source-derived.

## Speedrunning

Open **High Scores → SPEEDRUN → TIMER** to show the clock. Stage splits compare against your personal best; gold highlights mark your fastest segments. The completion screen shows your final time, and the Speedrun tab lists local records and sum of best segments.

The timer excludes pauses and the initial download, but includes dialogue, briefings and cutscenes. Cheats, debug-console use, stage warps and checkpoint continuations make a run **unranked**. Records are local personal records, not externally verified competitive submissions.

## Development status

The game is playable at the link above and still being improved. A player has completed the campaign with cheats; automated campaign runs cover much of the game but still struggle with Lara's weight puzzle. A full unassisted, ranked speedrun to the ending has not been verified end to end. Some story screens retain the original fixed composition.

Automated tests cover browser-state logic, progression, controls, rendering integration and speedrun timing. Browser QA captures and research notes live under `docs/` and local `artifacts/`; historical reports describe the version tested, not necessarily today's build.

## Run the prepared project

Requirements: Bun, Python 3 via uv, and a current browser with WebAssembly. WebGL2 enables the GPU renderer; a CPU renderer is available as fallback. The browser shell has no runtime package dependencies. **A fresh clone also needs the original data and compiled engine:** follow [Build setup](docs/BUILD_SETUP.md) first.

```sh
# From the repository root, after restoring the data and engine:
uv run scripts/serve.py
```

Open **http://localhost:8436**. Start the campaign from the title menu; the user gesture also allows browser audio to start. Modern browsers download approximately 51 MiB of compressed game data, plus the engine, and verify the decompressed resources. Verified downloads are cached when browser storage is available. Browsers without the decompression API use the 119 MiB raw fallback.

For another port:

```sh
uv run scripts/serve.py --port 8437
```

The development server listens on the machine's network interfaces. A phone on the same network can use `http://<computer-LAN-IP>:8436` when the computer's firewall permits it. Portrait uses a separate control dock; landscape places controls over the lower corners of the playfield. Gameplay adapts its camera width to the available screen instead of stretching a fixed 4:3 picture. The server explicitly supplies the WebAssembly MIME type and cross-origin isolation headers. The game cannot be opened reliably through `file://`.

## Modes and saves

| Option | Behavior |
| --- | --- |
| Original | Original campaign rules and weapons; no persistent upgrades, Roguelite rewards or checkpoint resume. |
| Roguelite | Automatic stage-boundary checkpoints, local saves, shards earned when a run ends, and persistent health/damage/cow-bomb upgrades. |
| Original pixels | Original artwork without the lighting pass. |
| Enhanced lighting | Inferred surface relief, directional light, player-local light and restrained glow. |
| Depth view | Inspection of the inferred height surface. |

Visual settings are independent of the gameplay mode. Height/normal maps are derived from pixel luminance and sprite silhouettes; they are **not recovered 3D geometry or newly hand-painted high-resolution art**.

Checkpoints restart the recorded stage. They do not restore every live enemy, projectile or exact mid-frame position. Saves, settings and high scores use the current browser's local storage under `blip-blop.browser.v1`; changing the origin, browser or device creates a separate store. **Credits & preservation notes → Export progress / Import progress** provides backup transfer.

Original and Roguelite have separate local high-score boards. They use native score totals. Checkpoint-resumed runs are unranked, so replaying a later stage cannot compete as a fresh full-campaign run.

## Controls

| Action | Solo keyboard | Co-op P1 | Co-op P2 | Standard gamepad |
| --- | --- | --- | --- | --- |
| Move / aim | Arrows or WASD | WASD | Arrows | Left stick / D-pad |
| Fire | J, Z or left Ctrl | F | J | X / right trigger |
| Jump | Space, K, X or left Alt | G | K | A |
| Cow bomb | L, C or left Shift | H | L | B |
| Continue briefing/dialogue | Enter | Enter | Shared Enter | A or X |
| Pause / resume | Escape or P | Escape or P | Escape or P | Start |

In two-player mode, browser gamepad slot 0 controls P1 and slot 1 controls P2. Either controller can confirm briefings or pause. Controller slots stay assigned if the other controller disconnects. Button names above use the standard Xbox-style layout; labels on other controllers may differ.

Touch uses a floating move/aim stick and separate Fire, Jump and Cow controls. Hold movement and Fire together, then tap Jump with another finger. Continue appears for dialogue and cinematics. **Controls & display** offers a fixed or floating stick, comfortable or extra-large buttons, left- or right-handed placement, touch visibility, optional Auto fire, lighting and reduced motion. Auto fire is off by default and pauses with the game. Preferences persist on this browser. Original advanced movement remains in the native engine, including repeated-jump acrobatics and double-down platform dropping.

The canvas HUD displays health, lives, weapon/ammunition, score, cow bombs and active encounter countdowns, including the second player's inventory in co-op. The original cinematics retain their authored composition within the responsive display.

Open the debug console with **Backquote (`)**, **Select + Start**, or **About → Console**. Console use makes a speedrun unranked; mutating cheats also exclude normal progression rewards and scores.

## Build and test

The prepared checkout already contains the local SDK, generated WebAssembly and staged game data. These large generated/vendor directories are excluded from Git; a clean clone needs them restored before it can run.

```sh
# Stage the pinned source data as individual browser files and hash manifest.
uv run scripts/prepare-data.py

# Compile the native engine and material pipeline to web/core/.
uv run scripts/build_wasm.py

# Run progression, score, input and engine-lifecycle tests.
bun run test

# Package web/ and a SHA-256 build manifest into artifacts/site/.
bun run build
```

`bun run build` is the **static packaging step**, not the C++ compiler. It requires `web/core/blipblop.js`, `web/core/blipblop.wasm`, the staged data and browser assets to exist first. It enforces a 25 MiB limit per packaged file and stamps CSS, JavaScript, native engine and data-manifest requests with a content-derived release revision. Verified original resources retain their SHA-based cache keys across releases. It does not deploy anything.

The C++ build uses `scripts/build_wasm.py`, C++17, Emscripten Asyncify, SDL2 and SDL2_mixer. It compiles incrementally with up to eight parallel compiler processes and links the engine bridge plus `enhancements/browser_material.cpp`. Its configured compiler path is `toolchains/emsdk/install/emscripten/em++`, and its configuration file is `toolchains/emsdk/.emscripten`. If the project moves, regenerate that configuration's absolute paths before rebuilding.

See [docs/BUILD_SETUP.md](docs/BUILD_SETUP.md) for exact pinned sources, the local SDK layout and restoration commands. Emscripten's first build can download its SDL/codec ports if they are not already cached; an offline rebuild requires the existing port cache.

## Recover and inspect the original assets

The original Vins installer is preserved at `downloads/vins-download.html`. The historical filename extension is misleading: its bytes are a Windows PE32 NSIS installer. Extraction does not execute it.

```sh
# Requires tools/NSISExtractor at the pinned revision; decodes the legacy installer.
uv run scripts/extract_vins_installer.py

# Python environment must contain Pillow and numpy.
uv run --with Pillow --with numpy scripts/extract_assets.py
```

The first script produces the original files under `vendor/vins-original/`. The second decodes the published source corpus to browser-readable atlases, maps, WAV audio and JSON in `assets-extracted/`. It supports `--source`, `--output`, and `--only graphics|levels|audio|scripts`. For example, preserve the exact shipped music separately:

```sh
uv run --with Pillow --with numpy scripts/extract_assets.py --source vendor/vins-original/data --output assets-extracted/vins-original --only audio
```

Recovered inventory: **3,755 images in 56 graphics banks; 276 glyphs across 8 fonts; 12 levels with 1,343 events; 175 WAV sound effects; 18 source-corpus music files; and 23 campaign/dialogue/cinematic/localization/music-bank scripts.** Source music consists of **14 Ogg and 4 MP3** files. The exact Windows installer has **16 music files: 13 MP3, 2 Ogg and 1 WAV**; the published source corpus adds two additional MP3 files and transcodes several original tracks. `gameover.zik` and `tambour.zik` are MP3 with leading zero padding, not MOD/tracker music. Extraction preserves every raw music byte and names outputs by their verified contents.

All shipped GFX, font and SFX banks match the published source byte-for-byte. Level geometry also matches; two source levels merely append an unused byte. Most remaining differences are MP3-to-Ogg conversion, text line endings and path separators. See [docs/ASSET_EXTRACTION.md](docs/ASSET_EXTRACTION.md) for binary formats, validation, hashes and static executable disassembly.

## Project map

| Path | Purpose |
| --- | --- |
| `web/` | Browser UI, input, rendering, persistence, generated engine and staged assets. |
| `native/src/` | Modified C++ source port and browser bridge. |
| `enhancements/` | Native material-map generation and compositing. |
| `scripts/` | Development server, data staging, WebAssembly build, extraction and static packaging. |
| `tests/` | Node tests for browser-state logic and progression/high scores. |
| `vendor/original-source/` | Unmodified pinned published C++ source and data. |
| `vendor/android-port/` | Pinned comparison/reference port. |
| `vendor/vins-original/` | Exact extracted Windows distribution and extraction manifest. |
| `downloads/` | Original downloaded installer and tool archives. |
| `assets-extracted/` | PNG atlases, inferred height/normal maps, metadata, audio and level JSON. |
| `artifacts/disassembly/` | Original game/installer PE reports, strings, x86 disassembly and hashes. |
| `artifacts/site/` | Packaged static site after `bun run build`. |
| `toolchains/emsdk/` | Local compiler/runtime and cached ports. |
| `docs/` | Architecture, scope, provenance, extraction and build notes. |

Architecture: [docs/browser-engine.md](docs/browser-engine.md). Original feature inventory: [docs/original-research.md](docs/original-research.md). Requirements and remaining verification boundaries: [docs/RECREATION.md](docs/RECREATION.md).

## Feedback and contributions

Found a stuck encounter, a control problem or a visual glitch? [Open an issue](https://github.com/elad12390/blip-and-blip-fan-remaster/issues) with your browser/device, game mode, difficulty, stage, and steps to reproduce. Screenshots or short clips help; mention whether cheats or a checkpoint were used.

Contributions are welcome. Include the behavior you want to improve, how you tested it, and preserve the original game's credits and source notices. See the build guide above before making engine changes.

## Attribution and provenance

Original game, artwork and campaign: **LOADED Studio, 2002**. The original distribution's complete readme, credits and copyright notice are preserved byte-for-byte in [docs/ORIGINAL_README.txt](docs/ORIGINAL_README.txt).

| Source | Pinned revision / identity |
| --- | --- |
| [User-supplied Vins download](https://www.vins.co.il/download/Blip-and-Blop) | Installer SHA-256 `70924896a6f403b4ab53b58d5a4203bfe6e1f54f3132b1ae71921ce454291b2e` |
| [Published C++ source and modernization fork](https://github.com/benkaraban/blip-blop) | `68a3e6e3f85f2f7bb52314ad8f92821d079a5f97` |
| [SDL Android reference port](https://github.com/smartties/Blip-Blop-for-Android) | `1104ecd4f7af7f6386df92512c8348fee2903b5f` |
| [NSISExtractor legacy codec](https://github.com/KokerZhou/NSISExtractor) | `8644b63d79a35bf002ba75f42375a9e4dafbbe74` |

The original distribution includes a non-commercial copying/distribution notice. The Android reference repository has a GPL-3.0 license file; the published source fork's README states that the authors released the source. These are separate provenance facts. This project does not assert that one repository's license resolves the rights to every original asset, third-party character, music track or derivative distribution. No new blanket license is assigned to the recovered materials here; the original notices and source attributions remain attached.
