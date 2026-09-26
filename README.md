# Blip & Blop — browser adaptation

A browser adaptation of **Blip & Blop: Balls of Steel**, the 2002 LOADED Studio game. It preserves the original campaign data and adds a responsive browser interface, optional lighting, local co-op, and a separate Roguelite progression mode.

**Implementation boundary:** the gameplay engine is a modified port of the published C++ source compiled to WebAssembly. The browser interface, input adapter, save/progression layer and lighting integration are new. This is **not a complete from-scratch or clean-room rewrite** of the game engine. The 12 original level files, enemies, weapons, scripts, cinematics and ending remain source-derived.

The project is in development. A successfully loaded stage is not evidence of a complete start-to-finish playthrough; this README does not claim campaign completion QA, broad mobile compatibility or a public deployment. Recorded validation belongs in the test reports under `docs/` and `artifacts/`.

## Run the prepared project

Requirements: Node.js 22 or newer, npm, Python 3, and a current browser with WebAssembly. WebGL provides enhanced lighting; the renderer falls back to the original image when WebGL is unavailable. No npm package installation is needed for the current dependency-free browser shell and tests.

```sh
cd /Users/eladbenhaim/dev/personal/game-dev/blipblop-remastered
npm run dev
```

Open **http://localhost:8436**. Start the campaign with the launch button; the user gesture also allows browser audio to start. Modern browsers download approximately 51 MiB of compressed game data, plus the engine, and verify the decompressed resources. Verified downloads are cached when browser storage is available. Browsers without the decompression API use the 119 MiB raw fallback. This is a local server address, not a deployed public link.

For another port:

```sh
npm run dev -- --port 8437
```

The development server listens on the machine's network interfaces. A phone on the same network can use `http://<computer-LAN-IP>:8436` when the computer's firewall permits it. Prefer landscape for the touch layout. The server explicitly supplies the WebAssembly MIME type and cross-origin isolation headers. The game cannot be opened reliably through `file://`.

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

Touch uses the left move/aim pad and separate Fire, Jump, Cow and Continue controls. Controls can be shown automatically, always shown or hidden through **Controls**. Original advanced movement remains in the native engine, including repeated-jump acrobatics and double-down platform dropping.

## Build and test

The prepared checkout already contains the local SDK, generated WebAssembly and staged game data. These large generated/vendor directories are excluded from Git; a clean clone needs them restored before it can run.

```sh
# Stage the pinned source data as individual browser files and hash manifest.
python3 scripts/prepare-data.py

# Compile the native engine and material pipeline to web/core/.
bash scripts/build-wasm.sh

# Run progression, score, input and engine-lifecycle tests.
npm test

# Package web/ and a SHA-256 build manifest into artifacts/site/.
npm run build
```

`npm run build` is the **static packaging step**, not the C++ compiler. It requires `web/core/blipblop.js`, `web/core/blipblop.wasm`, the staged data and browser assets to exist first. It enforces a 25 MiB limit per packaged file. It does not deploy anything.

The C++ build uses `scripts/build_wasm.py`, C++17, Emscripten Asyncify, SDL2 and SDL2_mixer. It compiles incrementally with up to eight parallel compiler processes and links the engine bridge plus `enhancements/browser_material.cpp`. Its configured compiler path is `toolchains/emsdk/install/emscripten/em++`, and its configuration file is `toolchains/emsdk/.emscripten`. If the project moves, regenerate that configuration's absolute paths before rebuilding.

See [docs/BUILD_SETUP.md](docs/BUILD_SETUP.md) for exact pinned sources, the local SDK layout and restoration commands. Emscripten's first build can download its SDL/codec ports if they are not already cached; an offline rebuild requires the existing port cache.

## Recover and inspect the original assets

The original Vins installer is preserved at `downloads/vins-download.html`. The historical filename extension is misleading: its bytes are a Windows PE32 NSIS installer. Extraction does not execute it.

```sh
# Requires tools/NSISExtractor at the pinned revision; decodes the legacy installer.
python3 scripts/extract_vins_installer.py

# Python environment must contain Pillow and numpy.
python3 scripts/extract_assets.py
```

The first script produces the original files under `vendor/vins-original/`. The second decodes the published source corpus to browser-readable atlases, maps, WAV audio and JSON in `assets-extracted/`. It supports `--source`, `--output`, and `--only graphics|levels|audio|scripts`. For example, preserve the exact shipped music separately:

```sh
python3 scripts/extract_assets.py --source vendor/vins-original/data --output assets-extracted/vins-original --only audio
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
| `artifacts/site/` | Packaged static site after `npm run build`. |
| `toolchains/emsdk/` | Local compiler/runtime and cached ports. |
| `docs/` | Architecture, scope, provenance, extraction and build notes. |

Architecture: [docs/browser-engine.md](docs/browser-engine.md). Original feature inventory: [docs/original-research.md](docs/original-research.md). Requirements and remaining verification boundaries: [docs/RECREATION.md](docs/RECREATION.md).

## Attribution and provenance

Original game, artwork and campaign: **LOADED Studio, 2002**. The original distribution's complete readme, credits and copyright notice are preserved byte-for-byte in [docs/ORIGINAL_README.txt](docs/ORIGINAL_README.txt).

| Source | Pinned revision / identity |
| --- | --- |
| [User-supplied Vins download](https://www.vins.co.il/download/Blip-and-Blop) | Installer SHA-256 `70924896a6f403b4ab53b58d5a4203bfe6e1f54f3132b1ae71921ce454291b2e` |
| [Published C++ source and modernization fork](https://github.com/benkaraban/blip-blop) | `68a3e6e3f85f2f7bb52314ad8f92821d079a5f97` |
| [SDL Android reference port](https://github.com/smartties/Blip-Blop-for-Android) | `1104ecd4f7af7f6386df92512c8348fee2903b5f` |
| [NSISExtractor legacy codec](https://github.com/KokerZhou/NSISExtractor) | `8644b63d79a35bf002ba75f42375a9e4dafbbe74` |

The original distribution includes a non-commercial copying/distribution notice. The Android reference repository has a GPL-3.0 license file; the published source fork's README states that the authors released the source. These are separate provenance facts. This project does not assert that one repository's license resolves the rights to every original asset, third-party character, music track or derivative distribution. No new blanket license is assigned to the recovered materials here; the original notices and source attributions remain attached.
