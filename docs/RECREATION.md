# Blip & Blop browser recreation

## Product requirements

- Play the complete original campaign from beginning through the ending and credits.
- Preserve all original level layouts, event scripts, enemies, bosses, weapons, pickups, audio and cinematics.
- Offer Original mode with the original gameplay rules and no persistent upgrades.
- Offer a separate Roguelite mode with stage checkpoints, local saves, death rewards and permanent upgrades.
- Make visual enhancements independent of the gameplay mode: original pixels, enhanced lighting, or a depth inspection view.
- Support desktop keyboard, touch controls and gamepads; preserve local co-op.
- Work in `/Users/eladbenhaim/dev/personal/game-dev/blipblop-remastered`.

## Implementation

The original published source is the behavior reference. A browser-native presentation layer owns loading, responsive menus, input, WebGL lighting, accessibility and save management. The source-derived WebAssembly engine preserves the complete campaign simulation. This approach reuses the original engine; it is not a clean-room rewrite of every gameplay system.

The native material pipeline derives relief from each surface's pixel luminance and alpha silhouette, then composites the resulting height surfaces through the same drawing operations as the original artwork. The WebGL renderer derives surface normals, applies directional lighting and player-local light, and adds a restrained bright-pixel glow. The maps are inferred relief, not original 3D geometry.

## Mode boundary

Original mode never reads persistent upgrades into the simulation and never writes Roguelite checkpoints or awards shards. Visual settings, input mapping and browser presentation are shared.

Roguelite saves are local to the current browser origin. Stage checkpoints restart the recorded stage; they are not arbitrary mid-frame save states. Save import/export provides device-independent backup. A unique run identifier prevents duplicate death rewards on repeated callbacks or reloads.

## Verification required before calling the recreation complete

1. Extraction inventory validates all resource lengths and stage/event records.
2. Browser build starts and plays real game data with original music and sound.
3. Movement, eight-way aim, jumping, each weapon, pickups, damage, death, bosses, scripted triggers and stage transitions work.
4. All 12 level files load; campaign sequence and ending/credits stay intact.
5. A complete unassisted campaign playthrough confirms there are no progress blockers. Stage-load smoke tests alone do not establish this.
6. Roguelite checkpoint reload, reward settlement, upgrade purchases and actual effects work; Original mode remains unaffected.
7. Touch multi-input, cancel/release, focus-loss pause, portrait/landscape layout and desktop/gamepad input behave correctly.
8. Original/enhanced/depth rendering is visually checked, including scene transitions and large boss sprites.
9. A published URL is only called deployed after a successful deployment response and a browser smoke test of that URL.

No item in this list is an implied completed check. See the test report for observed results.
