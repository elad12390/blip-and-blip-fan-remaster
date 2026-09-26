# Recovered original assets

`scripts/extract_assets.py` is a reproducible, offline decoder of the original game's data formats. It reads the original published source-data directory, never executes the Windows installer, and emits browser-readable assets under `assets-extracted/`.

The completed extraction contains:

| Asset type | Recovered |
| --- | ---: |
| Graphics banks | 56 |
| Sprite/background images | 3,755 |
| Bitmap fonts | 8 |
| Font glyphs | 276 |
| Complete level files | 12 |
| Level events | 1,343 |
| Sound banks | 9 |
| WAV sound effects | 175 |
| Music files | 18 |
| Campaign, dialogue, cinematic, localization and music-bank scripts | 23 |
| Original source-data bytes inventoried | 124,429,122 |

These counts describe recovered data, not a claim that every gameplay path has been tested.

## Reproduce

Python 3, Pillow and numpy are required. From the project root:

```sh
python3 scripts/extract_assets.py
```

On the current Codex host, the bundled runtime already contains Pillow and numpy:

```sh
/Users/eladbenhaim/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3 scripts/extract_assets.py
```

`--source PATH`, `--output PATH`, and `--only graphics|levels|audio|scripts` are available. A partial run writes a separate `manifest-<category>.json`; a full run writes `manifest.json`. All original data files are inventoried with their sizes and SHA-256 hashes, and each atlas records the originating bank hash and decoded RGBA frame hashes.

## Output format

`graphics/<bank>/atlas.json` contains the original numeric frame IDs, image dimensions, hotspot coordinates, atlas-page coordinates, LGX version, source-byte offsets and decoded image hashes. Each page has `atlas-N.png`, `height-N.png`, and `normal-N.png`. Font banks use `font-<name>` and omit material maps.

For example, the player banks are `graphics/blip/atlas.json` and `graphics/blop/atlas.json`, each containing 149 frames. The first forest background bank is `graphics/snufdec1/atlas.json`.

The color images preserve the original pixels and color-key transparency. The decoder follows `picture_bank.cpp`, `lgx_packer.cpp` and `lgx_packer.h`: LGX version 0 is RGB565; version 1 is RGB555 with repeated-color runs. The integer color scaling matches the engine. Atlases are deterministically shelf-packed with one-pixel gutters; sprite positions remain tied to their original hotspots.

The height and normal maps are **inferred material maps, not recovered 3D geometry**. Their deterministic construction combines an eight-pixel inward alpha-silhouette bevel with blurred luminance, then calculates surface normals. They provide a starting point for lighting; pixel brightness alone cannot recover the physical depth of a painted background. No original color textures are overwritten.

`audio/<bank>/NNN.wav` stores the original embedded RIFF/WAVE bytes without recompression. `bank.json` preserves the original effect index and buffer count. `music/` copies music without recompression. The source corpus has **18 files: 14 Ogg and 4 MP3**. `gameover.zik` and `tambour.zik` are MP3 files with 417 leading zero bytes, not tracker modules. The decoder validates MPEG version, Layer III, bitrate index, sample-rate index and emphasis after the padding; it also understands ID3 tags. Source `.zik` files are identified by content, not assumed to be one codec. Each music entry records its detected format and leading-zero count, and the manifest totals include format counts.

`scripts/` contains UTF-8 copies and line-numbered command JSON for cinematics, dialogues and music-bank files, plus localization JSON. Raw source originals remain in `vendor/original-source/`.

## Exact level data

Each `levels/<name>.json` preserves:

- Seven original resource-bank references and the 640-pixel screen sequence.
- Both player starting positions and all victory flag/value conditions.
- Eight pixel-resolution platform lanes, losslessly encoded as `[startX, length, y]`; `65535` means absent.
- Opaque and blood collision grids at eight-pixel resolution, preserving all 60 rows.
- Every 60-byte `FICEVENT`, including original numeric fields, union aliases, activation coordinate, file name, flags, generator timing and source offset.
- Up to three unused trailing bytes, retained as hex rather than silently discarded.

| Level | Screens | Width | Events |
| --- | ---: | ---: | ---: |
| snuf1 | 13 | 8,320 | 161 |
| snuf2 | 13 | 8,320 | 175 |
| bisous1 | 9 | 5,760 | 112 |
| bisous2 | 9 | 5,760 | 69 |
| bisous3 | 13 | 8,320 | 86 |
| snorkniv | 14 | 8,960 | 119 |
| snorkniv2 | 10 | 6,400 | 109 |
| dork | 5 | 3,200 | 94 |
| video | 18 | 11,520 | 274 |
| videoboss | 4 | 2,560 | 33 |
| lem | 4 | 2,560 | 55 |
| finalboss | 4 | 2,560 | 56 |

## Downloaded Windows installer

The exact Vins download is preserved at `downloads/vins-download.html`; despite its local extension it is a 45,591,754-byte Windows PE32 NSIS installer. Its SHA-256 is `70924896a6f403b4ab53b58d5a4203bfe6e1f54f3132b1ae71921ce454291b2e`.

The installer has an x86 PE stub linked with version 6.0, a timestamp of 2002-02-07 04:31:06 UTC, and a legacy NSIS stream starting at byte 35,840. Current 7-Zip 26.03 recognizes the PE structure but rejects this legacy NSIS stream. Static installer sections/imports/disassembly can still be examined independently. This limitation does not prevent recovery from the complete published source-data corpus.

The legacy stream was subsequently decoded directly with a pure-Python modified-bzip2 decoder and a format-specific adapter, `scripts/extract_vins_installer.py`. The original game executable is recovered at `vendor/vins-original/BlipBlop.exe`: 331,776 bytes, SHA-256 `0d107aa1359825bf0cdb48ca0e4682a0ed96304078f15a6b0cbbdf7c675ffc08`.

`artifacts/disassembly/BlipBlop-x86.asm` contains the static x86 disassembly; `BlipBlop-pe.txt` lists the PE sections and imports; `BlipBlop-strings.txt` contains printable strings; and `manifest.json` hashes those outputs. Equivalent installer-stub reports use the `vins-installer-` prefix. The game imports DirectDraw, DirectInput, WinMM and FMOD, with entry RVA `0x39534`. No original Windows executable was run. Linear disassembly is not a claim of recovered high-level source; the separately available C++ source supplies that behavior reference.

The exact-installer adapter requires `tools/NSISExtractor` at commit `8644b63d79a35bf002ba75f42375a9e4dafbbe74`, from <https://github.com/KokerZhou/NSISExtractor>. It imports only the codec and does not require the optional PE parser. Run `python3 scripts/extract_vins_installer.py` to decode and extract, or add `--reuse-stream` once the full decoded stream is available. It deliberately checks the installer SHA-256 before accepting the verified historical header layout.

The completed installer extraction recovered 128 file records (122,506,524 bytes) and wrote `vendor/vins-original/extraction-manifest.json`. Comparing its 124 data-file records with the published source corpus found 85 byte-identical and 39 changed files. **All 56 graphics banks, all 8 fonts, and all 9 sound banks are byte-identical.** Ten levels are byte-identical; the remaining two source levels only append one unused byte. The source port converted most MP3 music to Ogg, normalized text line endings and path separators, and filled a previously blank menu label with “TOGGLE FULLSCREEN.” No dialogue content differences were found after line-ending normalization.

To preserve the exact original soundtracks and text alongside the port versions, `assets-extracted/vins-original/music/` contains the **16 original music files: 13 MP3, 2 Ogg and 1 WAV**, using extensions matching their contents. The original `hard.zik` is RIFF/WAVE; `suspens.zik` and `vidboss.zik` are Ogg. `assets-extracted/vins-original/scripts/` contains the original 23 text assets. Original embedded WAV sound effects are also decoded under that directory. Graphics and level geometry do not need a second duplicate atlas set because of the verified comparisons above. All 34 source/original music output records were compared byte-for-byte against their raw inputs, and FFprobe independently agreed with every detected container format.

## Validation

The decoder enforces LGX signatures, dimensions, bit depth, exact decompressed pixel counts, image-bank end positions, RIFF/WAVE signatures, level-event structure sizes, bounded trailing bytes and complete font tables. Every bank and level completed these structural checks. All 4,031 emitted sprite/background/glyph frames were then cropped back out of their atlases and their SHA-256 hashes matched the decoded RGBA bytes. All eight platform lanes and both collision grids in each of the 12 level files were checked for exact width coverage. The emitted Blip atlas was inspected visually and its transparent palette pixels were checked numerically. These checks establish successful data decoding; final browser rendering and campaign playthrough are separate verification tasks.
