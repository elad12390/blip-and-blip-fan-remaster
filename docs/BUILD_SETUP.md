# Reproducing the local build

These commands document the existing source and compiler layout. They are instructions for restoring a fresh workspace; they have not been run here as an additional bootstrap. Run them from the project root and skip directories already restored. The modified browser-port sources in `native/src/` and `enhancements/` belong to this project and must remain in place; do not replace them with a fresh upstream copy.

## Prerequisites

- Node.js 22+ and npm. The current host used Node 26.5.1.
- Python 3. The current host's system Python is 3.14.7; extraction was run with the Codex bundled Python 3.12 runtime containing Pillow and numpy.
- Git, curl, tar and xz support.
- Several GiB of free disk space for the compiler, cached SDL/codec ports, original data and outputs.

The JavaScript app and Node tests have no npm dependencies at present. Python extraction needs Pillow and numpy; a separate virtual environment can supply them without altering the host's Python:

```sh
python3 -m venv .venv
.venv/bin/python -m pip install Pillow numpy
```

Use `.venv/bin/python scripts/extract_assets.py` for extraction if using that environment.

## Restore the pinned original data

```sh
mkdir -p vendor downloads tools
git clone https://github.com/benkaraban/blip-blop.git vendor/original-source
git -C vendor/original-source checkout 68a3e6e3f85f2f7bb52314ad8f92821d079a5f97
```

The build reads `vendor/original-source/vc-projects/Blip_n_Blop_3/data/`. `scripts/prepare-data.py` preserves each file's bytes and writes individual file hashes to `web/data-manifest.json`.

The Android port is a research reference, not a dependency of this browser compilation:

```sh
git clone https://github.com/smartties/Blip-Blop-for-Android.git vendor/android-port
git -C vendor/android-port checkout 1104ecd4f7af7f6386df92512c8348fee2903b5f
```

## Restore the downloaded Windows distribution

The source page is <https://www.vins.co.il/download/Blip-and-Blop>. Its linked download endpoint is <https://www.vins.co.il/safe-download/Blip-and-Blop>.

```sh
curl -L --fail https://www.vins.co.il/safe-download/Blip-and-Blop -o downloads/vins-download.html
shasum -a 256 downloads/vins-download.html
```

The expected file is **45,591,754 bytes**, SHA-256:

```text
70924896a6f403b4ab53b58d5a4203bfe6e1f54f3132b1ae71921ce454291b2e
```

This describes the payload already recovered during this project. If the mirror changes its response, do not relabel the new bytes as the verified original. The installer extraction adapter checks this exact hash before parsing it.

The optional full-installer extraction needs the pinned legacy bzip2 codec:

```sh
git clone https://github.com/KokerZhou/NSISExtractor.git tools/NSISExtractor
git -C tools/NSISExtractor checkout 8644b63d79a35bf002ba75f42375a9e4dafbbe74
python3 scripts/extract_vins_installer.py
```

The adapter imports the codec directly and does not need `pefile` or the NSISExtractor CLI installed. Its pure-Python decompression can take several minutes. Reuse a completed, verified stream with `python3 scripts/extract_vins_installer.py --reuse-stream`. This process extracts files and never executes the original Windows program.

## Restore the compiler used on this Mac

The existing workspace uses the **macOS arm64 Emscripten 6.0.10 release bundle** at the following identities:

| Component | Pinned identity |
| --- | --- |
| Emsdk repository | `e566f7bdcc7735f44037911c24b87a58a3c93145` |
| Emscripten release | `6.0.10`, reporting `6.0.10-git` in the bundled version file |
| Release build hash | `666337b525e673e769121856d175f6f52b8ead64` |
| macOS arm64 archive SHA-256 | `084896c728d82e44d7aa54afc4a7bf64031dda83f3a4c47ee3164cece247cd76` |

```sh
mkdir -p toolchains
git clone https://github.com/emscripten-core/emsdk.git toolchains/emsdk
git -C toolchains/emsdk checkout e566f7bdcc7735f44037911c24b87a58a3c93145
mkdir -p toolchains/emsdk/downloads
curl -L --fail https://storage.googleapis.com/webassembly/emscripten-releases-builds/mac/666337b525e673e769121856d175f6f52b8ead64/wasm-binaries-arm64.tar.xz -o toolchains/emsdk/downloads/wasm-binaries-arm64.tar.xz
shasum -a 256 toolchains/emsdk/downloads/wasm-binaries-arm64.tar.xz
tar -xf toolchains/emsdk/downloads/wasm-binaries-arm64.tar.xz -C toolchains/emsdk
```

The archive contains `install/`, which matches the build script's expected `toolchains/emsdk/install/emscripten/em++` path. Check the archive hash above before extraction.

Generate the local configuration with the current workspace and Node paths:

```sh
python3 - <<'PY'
from pathlib import Path
import shutil
root = Path.cwd().resolve()
sdk = root / 'toolchains' / 'emsdk'
node = shutil.which('node')
if node is None:
    raise SystemExit('Node.js must be installed and on PATH')
(sdk / '.emscripten').write_text(
    f'LLVM_ROOT = {str(sdk / "install/bin")!r}\n'
    f'BINARYEN_ROOT = {str(sdk / "install")!r}\n'
    f'NODE_JS = {[node]!r}\n'
)
PY
```

These compiler commands target the verified Apple Silicon setup. On other architectures, use the matching official Emscripten bundle and adapt the local compiler path/configuration; do not try to run the arm64 macOS binaries on Linux, Windows or Intel macOS. A cross-platform automatic bootstrap has not been added or validated.

Emscripten downloads SDL2, SDL2_mixer and enabled codec ports when its cache lacks them. The current workspace contains these caches; a restored SDK may require network access during the first compilation. The pinned compiler does not make the generated output independently reproducible unless the same port sources and cache versions are also retained.

## Compile, stage and package

```sh
mkdir -p web/core
python3 scripts/prepare-data.py
bash scripts/build-wasm.sh
npm test
npm run build
```

Outputs:

- `web/core/blipblop.js` and `web/core/blipblop.wasm`: compiled engine.
- `web/data/` and `web/data-manifest.json`: all individual source resources with hashes.
- `build/objects/`: incremental C++ object files.
- `artifacts/site/`: static web package.
- `artifacts/site/build-manifest.json`: packaged paths, sizes and SHA-256 hashes.

Serve the development tree with `npm run dev`. To inspect the packaged tree locally, `python3 -m http.server 8437 --directory artifacts/site` serves it on port 8437; a production host should supply `.wasm` as `application/wasm` and preserve the paths used by `index.html`, `core/` and `data/`. Packaging and a local HTTP response do not establish deployment or full gameplay correctness.

## Recreate extraction and static analysis

```sh
.venv/bin/python scripts/extract_assets.py
.venv/bin/python scripts/extract_assets.py --source vendor/vins-original/data --output assets-extracted/vins-original --only audio
.venv/bin/python scripts/extract_assets.py --source vendor/vins-original/data --output assets-extracted/vins-original --only scripts
```

On the current Mac, `/usr/bin/objdump` is Apple's LLVM tool and recognizes PE32/i386:

```sh
mkdir -p artifacts/disassembly
/usr/bin/objdump -p vendor/vins-original/BlipBlop.exe > artifacts/disassembly/BlipBlop-pe.txt
/usr/bin/objdump -d vendor/vins-original/BlipBlop.exe > artifacts/disassembly/BlipBlop-x86.asm
strings -n 5 vendor/vins-original/BlipBlop.exe > artifacts/disassembly/BlipBlop-strings.txt
```

The `.asm` output is static linear disassembly, not a decompiler reconstruction. The original published C++ source remains the primary behavioral reference. Asset structures and completed validation are documented in [ASSET_EXTRACTION.md](ASSET_EXTRACTION.md).
