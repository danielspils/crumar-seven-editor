# Instrument illustration brief

For generating the seven instrument pictures used by the patch picker's
Instruments tab. Written for an image model (Gemini, or any other), kept in the
repo so the set can be regenerated consistently later — a second batch made
from memory will not match the first.

**Why an image model and not SVG:** hand-written SVG from a language model tops
out at competent flat vector. These need to look like the instrument, and an
image model is the tool that does that. The trade is that the result is raster,
so it cannot recolour itself per theme — which is why transparency and a
mid-tone palette matter below.

## The set that shipped (2026-08-12)

Eight photoreal illustrations, **generated with Gemini by the project's author**
— so they are ours to ship in a public MIT repo, which stock or clipart would
not have been. Three-quarter view, not the straight-on elevation this brief
originally specified: the set agrees with itself, which matters more than
agreeing with a spec written before the set existed.

`tine`, `reed`, `clavi`, `cp70`, `dx7`, `grand` (the modeled Acoustic Piano),
`venice` (the sampled Venice family, the same grand in brown so the two read as
related but distinct), `upright`.

Two traps this set walked into, both worth avoiding next time:

- **Export with real transparency, not a screenshot of the preview.** The first
  batch had the transparency checkerboard baked into the pixels — every pixel
  opaque, the grey squares painted in — which renders as a grey rectangle
  behind the instrument. `tools/strip-checker.js` recovers such a file (border
  flood fill, feathered rim), but only when the checker is light grey; a
  black-and-white checker cannot be cut away automatically, because the
  drawings are outlined in black.
- **One instrument alone in frame.** A neighbouring keyboard wandered into one
  generation and was erased with white rather than deleted, leaving an opaque
  band that was invisible on the light theme and obvious on the dark one.

Sizes: 512px on the long edge, which covers every use at 2x — the picker tile
(158px) and the sound engine header (128px).

---

## The style block — paste this with every request

> Flat vector illustration of a musical keyboard instrument, front elevation
> (straight-on, no perspective, no rotation). Clean geometric shapes, subtle
> flat shading, thin dark outlines. Muted realistic colours. The whole
> instrument fits within the frame with a small even margin, centred, standing
> on its own stand or legs where it has them.
>
> Transparent background. No background scene, no floor, no shadow cast onto a
> surface. No text, no logos, no brand names, no maker's badges, no model
> numbers anywhere on the instrument — leave those surfaces blank.
>
> Square image, 640 x 640.

Generate the **tine electric piano first**. Once one is right, attach it to each
following request with: *"Match this exact style, angle, line weight, level of
detail and colour treatment."* Consistency across the set matters more than any
single picture — a set that drifts in angle or detail looks worse than seven
plainer drawings that agree with each other.

## The seven instruments

Described by what they are, never by maker or model. That keeps badges out of
the result and keeps the files clean to ship.

| File | Ask for |
|---|---|
| `tine.png` | A 1970s electric piano with a wedge-shaped black case, a brushed metal control rail across the front with four round knobs at the left end, a thin red pinstripe under the rail, a 73-note keybed, and a chrome tubular stand with splayed legs and cross-braces. |
| `reed.png` | A 1960s–70s reed electric piano with a rounded moulded body in muted red, an oval speaker grille at each end of the front panel, a shorter keybed set between them, and thin black splayed legs. |
| `clavi.png` | A long, low, shallow black keyboard instrument with wooden end cheeks, a bank of small coloured rocker switches at the left of the front panel, a full keybed, and thin tapered legs. |
| `cp70.png` | An electric grand piano cut down for the stage: a rectangular keybed case with metal road-case corner brackets, a trapezoidal harp section rising behind the keys, and a chrome tubular stand with cross-braces. |
| `dx7.png` | An early-1980s digital synthesiser: a flat, very shallow charcoal slab, a small green LCD display at the left, a grid of small turquoise membrane buttons across the panel, pitch and modulation wheels at the far left, and a full keybed. |
| `upright.png` | An upright acoustic piano seen from the front: tall wooden cabinet, closed fallboard, keybed shelf projecting at the front, two pedals below on a lyre, plain panelling above. |
| `grand.png` | An acoustic grand piano with the lid raised on its prop stick, the curved rim visible, three legs, and a pedal lyre beneath the keybed. |

## Checks before a file is accepted

1. **No text anywhere.** Zoom in on the control rail, the fallboard and the
   lid. Models add brand names back even when told not to — one generation came
   back with a real model designation on the panel. Illegible squiggle standing
   in for a name plate is fine and reads as detail; a readable model name is
   not.
2. **Transparent background**, not white. A white rectangle will show as a
   patch against the dark theme.
3. **Same angle as the anchor.** Straight-on. One tilted instrument in a row
   of seven is what the eye lands on.
4. **Mid-tone, not near-black.** These sit on a near-black panel in dark mode
   and on antiqued paper in light. Something almost black disappears against
   one of them.
5. **Legible at 158 pixels wide**, which is the size in the app. Shrink it and
   look: if the keys turn into grey mush, ask for a shorter keybed with fewer,
   larger keys rather than a realistic 73.

## Delivering them

Save as PNG, roughly 320–640px wide, named exactly as the table above, into
`assets/instruments/`. The picker maps a sound to a picture by name, so nothing
else needs changing.

The vibraphone, the rack synth module, and the sampled sets that were never a
physical machine keep their line-art marks — there is no instrument to
photograph for a "Venice Grand Breeze", and inventing one would be a picture of
nothing.
