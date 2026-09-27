# Remaster plan

Approved direction (27 Sep 2026): the whole game becomes one responsive, full-screen game app. The HTML shell is replaced by an in-game UI themed with the original Blip & Blop art (concept renders: `artifacts/concept/out/`). The CPU software renderer is replaced by a GPU renderer with shader effects. The fixed 640-pixel encounter window is replaced by a play area that matches the screen.

Every phase below is required delivery; none is optional polish.

## A. GPU renderer

- Native gameplay frames stop blitting pixels. `SDL::Surface` blits and fills that target the frame are recorded into a compact command list (source surface id, source rect, destination, fill colour, effect commands).
- The browser packs every source surface into texture-array atlas pages once, then re-uploads only dirty rectangles of dynamic surfaces (the blood/decal scroll ring, snapshots).
- Water distortion, lighting/relief, dimming, flashes, fades and the results-screen halftone become shader passes. Relief maps are computed once per sprite at upload instead of per blit per frame.
- Frames that still need CPU pixels (cinematics, results snapshot) use the existing full-frame upload path until phase D migrates them.

## B. Modern play area and camera

- A runtime play-window width replaces the authored 640 constant in scroll, player walls, enemy turn/despawn bounds, projectile culling and event triggers. Right-edge-aligned event triggering keeps spawns just off-screen at every width.
- Camera zoom keeps heroes readable on phones, with vertical tracking; locked boss arenas keep their authored 640 width and the camera frames them.
- Presentation is driven by `requestAnimationFrame` with interpolation between fixed simulation steps.

## C. Themed in-game UI

- A canvas UI layer replaces all HTML: title/main menu, hero and mode select, workshop, scores, settings, pause, death, completion, loading/errors, HUD and touch controls, keyboard/gamepad navigation.

## D. Responsive story screens

- Briefings, dialogue, results and cinematics presented responsively (dialogue drawn by the UI layer; authored 640x480 art framed with themed backdrops, never stretched).

## E. Verification

- All 12 playable stages, every boss, touch/keyboard/gamepad/co-op, phone portrait/landscape, tablet, desktop, ultrawide; performance measurements before/after; automated tests for every pure module.
