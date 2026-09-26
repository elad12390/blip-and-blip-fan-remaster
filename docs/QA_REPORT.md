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

`npm test` passes 35 tests covering mode isolation, save validation, exactly-once rewards, upgrade caps, separate high-score boards, keyboard and two-gamepad routing, focus loss, modal/pause behavior, runtime failure/retry, stale asynchronous initialization, gzip decoding, SHA verification, cache corruption and raw-resource fallback.

Extraction additionally validates original byte lengths/hashes, all atlas crops, all level grids and all deterministic gzip companions. Native production and diagnostic builds compile successfully. Production has no diagnostic exports, and packaging excludes `core-qa`.

## Remaining validation limits

- A complete unassisted start-to-finish campaign playthrough has not been performed. Stage entry and forced victory tests do not prove every boss can be defeated or every late-stage encounter is free of progress blockers.
- Physical iPhone/iPad/Android devices, Safari, Firefox and physical gamepads have not been tested. Responsive Chrome layout and touch emulation are narrower evidence.
- Extracted relief maps estimate depth from artwork brightness and silhouettes. They are not authored physical geometry or newly painted high-resolution artwork.
- Saves are browser-local, with manual export/import; there is no cloud synchronization.
- Deployment status and audience must be checked separately. A local preview or build is not evidence of a published site.
