# Browser validation — 26 September 2026

The browser build contains the complete source-derived campaign. This report distinguishes observed behavior from implementation coverage. The engine is a WebAssembly source port, not a clean-room rewrite.

## Observed in a real Chromium browser

Testing used Playwriter with headless Chrome on this Apple Silicon Mac, the production engine, and a separate diagnostic engine where stated. The diagnostic engine uses the same simulation and resources but exposes explicit test controls. It is excluded from packaging and publication.

| Check | Observed result |
| --- | --- |
| Original assets | Exact installer recovered and statically disassembled. All 4,031 decoded image/font frames validated against atlas crops. All 12 level collision/platform grids and 1,343 events decoded. |
| Campaign loading | Every playable campaign part reached `inGame: true`: 1, 3, 5, 7, 9, 10, 12, 13, 15, 17, 19 and 21. Introductory dialogue was skipped through the original input path for stage-load tests. |
| Ordinary gameplay | Keyboard movement, jumping, scrolling, aiming, firing, enemy kills and score increases observed in the first stage. |
| Weapons | Diagnostic original pickups selected all five weapons. Live firing created projectiles and reduced ammunition for shotgun, submachine gun, flamethrower and laser. M16 firing and cow projectiles also observed. |
| Damage isolation | Ten real projectile hits in Original mode caused `[400,400,750,120,200,500]` damage for M16, shotgun pellet, submachine gun, flame, laser and cow probes. With firepower rank five in Roguelite, results were exactly 1.5 times those amounts. Saved upgrades did not change Original HP or damage. |
| Game over | Last-life lethal damage passed through the actual player death animation and native defeat callback into the browser overlay. Original awarded no shards or Roguelite death count. |
| Roguelite economy | Four diagnostic deaths earned 3, 6, 9 then 12 shards. Buying armor through the actual workshop spent 12 and the checkpoint restart had 6/6 HP. An upgraded barrel pickup capped HP at eight with armor rank three. |
| Save and cache reload | Reloading the page and clicking Continue restored stage 1 and the purchased six-HP cap. The warm launch made zero resource-file network requests. |
| Stage transition | A diagnostic victory flag passed through the normal results/briefing path from part 1 to a saved part-3 checkpoint. |
| Ending | Diagnostic final-stage victory passed through the original ending, original credits, final scoring and the completion callback. Roguelite checkpoint cleared and the completion reward was paid. This did not test defeating the final boss through ordinary combat. |
| Interrupted ending | Returning to title during an ending and starting Original left prior shards and settled-run counts unchanged; no old completion overlay appeared and Original HP remained five. |
| Co-op keyboard | P1 moved from x=66 to x=130 while P2 stayed at x=147. Then P2 moved to x=213 independently. Both native players remained alive. |
| Touch | Chrome touch emulation sent simultaneous joystick and fire contacts. Native position and firing state changed together; touch cancellation released firing. |
| Layout | Desktop 1280×900, portrait 390×844 and landscape 844×390 inspected. Portrait controls sit below the playfield; landscape controls use the side space. |
| Fullscreen | Entered fullscreen, paused and resumed using controls inside the fullscreen element, and exited fullscreen successfully. |
| Visual modes | Original, enhanced and depth rendering captured and inspected. The depth view is a separate composed grayscale height surface. |
| Audio | Native audio device and browser AudioContext ran; music and effect channels were active during gameplay. The original game-over cue was verified playing beneath the paused death overlay after fixing two padded MP3 files. This is a runtime-state check, not human listening validation. |
| Credit controls | A further ending test used Continue to skip credits after the one-second guard and reached completion in 7.9 seconds. No input still allows all original credits to scroll. |

Screenshots and machine-readable observations are in `artifacts/qa/`, including `stage-loads.json` and `native-browser-tests.json`. These files are generated local evidence and are not part of the production site.

## Automated checks

`npm test` passes 62 tests covering mode isolation, save validation, exactly-once rewards, upgrade caps, separate high-score boards, keyboard and two-gamepad routing, focus loss, modal/pause behavior, runtime failure/retry, stale asynchronous initialization, gzip decoding, SHA verification, cache corruption, raw-resource fallback, touch ownership and cancellation, simultaneous controls, preferences, secondary-finger HUD actions, viewport measurements, retained-frame recovery and release cache versioning.

Extraction additionally validates original byte lengths/hashes, all atlas crops, all level grids and all deterministic gzip companions. Native production and diagnostic builds compile successfully. Production has no diagnostic exports, and packaging excludes `core-qa`.

## Responsive controls and camera revision

- The actual native gameplay frame was exercised at 240, 320, 390, 640, 853, 1280, 1720 and 2560 pixels wide with a 480-unit vertical world scale. Native pitch matched width × 4. Paused resizing preserved player world position, health, lives and authored encounter offset.
- All 12 playable campaign parts were opened with the new render camera at narrow and wide sizes. Boss arena framing and a left-facing laser were additionally inspected. These are stage-entry and rendering checks, not completed combat playthroughs.
- CSS layout bounds were measured at 320×568, 360×640, 390×844, 430×932, 568×320, 667×375, 844×390, 932×430, 768×1024, 1024×768, 1440×900 and 2560×1080. HUD and visible controls stayed inside the viewport. Uniform frame-fit rounding left at most approximately one physical pixel of unused space in this matrix.
- Real Chromium touch dispatch exercised moving and firing together, adding Jump, and cancellation. A second finger toggled Auto fire while the first continued holding movement; position continued advancing and native firing became active. This specifically checks the browser behavior that does not synthesize a normal click for secondary contacts.
- Extra-large, left-handed controls were inspected at 320×568. Co-op HUD inventory and controls were checked at 320×568, 390×844, 568×320 and 844×390.
- Fullscreen entry, pause, opening and closing Controls & display, resume, and exiting fullscreen worked in the 844×390 layout. The settings dialog stayed inside the visible screen and remained reachable in fullscreen.

Evidence: `artifacts/responsive/layout-matrix.json`, its layout screenshots, and `artifacts/qa/responsive-native-stages.json` / `responsive-native-resize.json`.

## Water corruption and graphics recovery

The water pass previously used overlapping RGBA self-blits, allowing modified pixels to feed back into the same operation. It now copies color and depth from one immutable snapshot each per frame, applies the original two-row sine shifts with independent row pitches, and fills newly exposed edges. The old depth implementation also allocated a full-frame snapshot for every strip; that repeated work is removed from the water path.

- The native diagnostic regression checks every color and depth pixel against a coordinate-pattern source at eight widths, repeated resize sequences and four wave phases: 56 frames, zero color/depth/padding failures. Color alpha varies among 0, 127 and 255 to verify raw translation rather than blending.
- Snorks I ran for 737 frames and Snorks II for 841 frames with movement, shooting, jumping and live width changes `640 → 390 → 1280 → 240 → 2560 → 640`. The original weather triggers confirmed that water distortion was active. Narrow and wide screenshots from both stages showed intact scenery, sprites, bubbles and projectiles. These short stress runs are not complete stage playthroughs.
- A separate production-engine Snorks I smoke test ran 182 frames at 390×480 and verified diagnostic exports were absent.
- The paused phone-size matrix was repeated after fixing a blank frame caused by canvas backing-size changes. The renderer now re-presents retained GPU textures and owns a color/depth copy for context restoration, without dereferencing an old native pointer.
- A standalone real-browser probe supplied one native frame, zeroed its original memory, changed DPR to two, explicitly invoked the resize path and forced WebGL context loss/restoration. Exact center pixels survived every step with zero WebGL errors and no second native frame. Canvas 2D fallback passed the same retained-frame resize check. CDP's DPR-only override did not deliver a media-query change event in this headless run, so this probe validates redraw/recovery rather than operating-system DPR event delivery.

Evidence: `artifacts/qa/water-coordinate-regression.json`, `water-browser-stress.json`, `water-production-smoke.json`, water-stage screenshots, and `artifacts/responsive/renderer-recovery.json`.

## Remaining validation limits

- A complete unassisted start-to-finish campaign playthrough has not been performed. Stage entry and forced victory tests do not prove every boss can be defeated or every late-stage encounter is free of progress blockers.
- Physical iPhone/iPad/Android devices, Safari, Firefox and physical gamepads have not been tested. Responsive Chrome layout and touch emulation are narrower evidence.
- Extracted relief maps estimate depth from artwork brightness and silhouettes. They are not authored physical geometry or newly painted high-resolution artwork.
- Saves are browser-local, with manual export/import; there is no cloud synchronization.
- Deployment status and audience must be checked separately. A local preview or build is not evidence of a published site.
