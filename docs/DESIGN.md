# Design notes

UI principles for the editor. Add to this file as they accumulate.

## Visual vocabulary

One meaning per treatment — don't reuse these for anything else:

- **Underline** = selection (bank tabs: text-width amber underline + raised
  background; the library's selected patch uses the red left-edge marker).
- **Lighter background bar** = section header (also the hover state that says
  the row is clickable).
- **Chevron** = collapsible; it rotates as the section opens.
- **Filled pill** = active (ON, green tint); **outlined pill** = inactive (OFF).
- **Muted text** = value at its default; **primary text** = value differs.
  Binary parameters (schema max = 1) are **excluded from at-default muting**
  and render as non-interactive ON/OFF pills (the header pill component) at
  full contrast: the `min(64, max)` heuristic in `src/defaults.js` calls 1 the
  "default" for a max=1 parameter, which made an engaged switch look untouched
  (e.g. Filter Soft/Medium ON but muted). This is a symptom of the defaults
  heuristic — revisit once real factory defaults are captured from the device.
- **Dimmed section/group** = bypassed (driven by the switch param only — never
  inferred from a value being zero), or inapplicable (clavi group when the
  Clavi engine isn't selected).
- **Tonal inversion on a preset button** = selected: the face's two tones swap
  (inset panel goes lighter, face goes near-black) and the LED lights. The
  physical preset buttons are black plastic with an LED — the face doesn't
  illuminate — so the subtle inversion is a **closer rendering of the real
  button** than the old red fill, which wrongly implied an illuminated face.
  The panel strip aims to render the hardware faithfully rather than
  substitute its own signalling. The BANK button never inverts: a bank is
  always current, so there is no selection for it to indicate — its four LEDs
  carry which bank is active.

## Type ladder

Five sizes, all of them already in use before they were written down here. A
new surface picks from this list rather than inventing a size — 11px and 14px
crept in that way and read as "off" without anyone being able to say why.

| Size | Weight | Treatment | What it is |
|---|---|---|---|
| 17px | 700 | — | The name of the thing this view is about: the engine's sound name, the source and destination of a transfer. One per view. |
| 15px | 700 | — | Dialog titles, where the title IS the subject. |
| 13px | 400 | — | Body copy. The document default (`body { font: 13px/1.45 }`). |
| 12px | 700 | uppercase, `.12em` tracking, dim | **Region header.** "ON THE SEVEN", "SOUND ENGINE", "TRANSFER". Labels the thing below it and stays out of the way. |
| 10px | 700 | uppercase, `.05–.1em` tracking, dim | Micro-labels: badges, chips, counts, the AUDITION MODE chip. |

### CAPS MEAN "LABEL, NOT CONTROL" (Daniel, 2026-11-15)

Read the two uppercase rows above again: every one of their examples is
something you read, not something you click. SOUND ENGINE, EFFECTS CHAIN, ON
THE SEVEN, AS OF LAST BACKUP, the effects cards' own headings — none of them
is clickable. That was true by habit before it was a rule, and it is a rule
now:

**Uppercase with tracking marks a label. A control never wears it.**

The bank tabs were the one place it broke. BANK 1 / BANK 2 / BANK 3 / BANK 4
were 12/700 uppercase at `.12em` — the region-header treatment exactly — on
four buttons that navigate. They are sentence case now, 12/600, no tracking:
"Bank 1". A step smaller than the word tabs above them, and the same KIND of
thing, because both rows are navigation and should look like each other.

What this rule does NOT touch:

- **The amber underline** on the selected tab. Selection is the underline's
  job in this app and has nothing to do with case.
- **The lock on Bank 1.** It is a note about the bank, not a label treatment.
- **The panel artwork.** `assets/seven-panel.svg` is a picture of a physical
  instrument whose legends are silkscreened in caps. It is not type in this
  ladder and never answers to it — see "What is NOT themed".

The tell, when deciding: if the thing can be clicked, it is not a label, and
caps would be saying something false about it.

**A header never competes with what it introduces.** The transfer modal first
set "Transfer" at 15/700 — the same size as the setlist name beneath it — and
read as two titles arguing. Region-header treatment fixed it: the label went
small and dim, and the two names it introduces went to 17. Same rule the main
window already follows, where "SOUND ENGINE" sits quietly above a 17px sound
name.

## Colour system

Colours are BORROWED FROM THE INSTRUMENT, never invented. The panel artwork is
drawn from photographs of the Seven, so its palette is the instrument's own —
and anything the app needs a colour for should come from there rather than
from a designer's preference.

| Role | Variable | Source | Used for |
|---|---|---|---|
| Action | `--action` | the panel's DEPTH/RATE legend green (`#7f9c78` dark, `#1f6b3d` light) | anything that DOES something, as a FILL or a MARK: a filled button, a 1px border, a focus ring, a 2px underline |
| Action, as words | `--action-text` | the same legend, damped (`#a9c3a1` dark; identical to `--action` in light) | the LABEL of an action — a button's text, a link, a name going green on hover |
| Destructive | `--accent` | panel LED red, warmed for the dark palette (`#b5584a` / `#b8362b`) | the selected-row edge, and any confirm that destroys something |
| Navigation | `--amber` | **the Seven script's own amber**, `#E0A23C`, in both themes | which tab or segment is selected, focus rings, an open rename field |

> **The light marker is a deliberate contrast exception.** `#E0A23C` measures
> 1.88:1 on `--bg`, 1.65:1 on `--bg-panel` and **1.53:1 on `--page`** — which
> is the WORST ground and the one that binds, since the mark is darker than
> every light ground. All three are under the 3:1 WCAG asks of a non-text
> marker. `#9e6c19` — the same hue at 3.37:1 on `--bg-panel` — was built and
> shipped for an hour first; beside the script it read as a different, duller
> gold. Daniel compared both in the running app and chose the sign's own
> colour, so the underline and the sign read as one thing. If it reads weak at
> 2px the answer is 3px, not a darker colour.
>
> **RE-OFFERED WITH FULL NUMBERS ON 18 Nov 2026 AND DECLINED AGAIN** — the
> underline at today's value beside `#936925` (3.36:1 on the worst ground,
> same hue, Δ0.0 from the logo), on all three grounds, tabs and bank tabs
> together. *"today looks great."* The exception is therefore made twice, with
> the second one knowing what `--page` does. Full table and the declined
> candidates: "THE AMBER VALUES, WITH THE NUMBERS ATTACHED" below.
| Modeled | `--modeled` | panel blue legend | the Modeled badge, outlined |
| Sampled | `--sampled` | panel green legend, darker | the Sampled badge, outlined |

Two rules keep those from colliding:

**A drawing brings its own colours; only line art is tinted.** The instrument
illustrations are photoreal raster and are left alone — the tile tints its
BACKGROUND with the family colour instead, so a Venice Grand and an Acoustic
Piano are told apart by the wash behind them and by their own artwork. The
48x32 line-art marks (vibraphone, rack module, the sample sets with no physical
instrument) still use `currentColor` and take the tint, because a symbol has no
palette of its own to protect.

**Filled means action; outlined means state.** A filled green button does
something when pressed. An outlined green badge is a label. The Sampled badge
and a green button are never read as the same kind of thing, because one is a
filled control and the other is an outline.

**Shape says what a thing is: squared presses, pill labels.** Every action —
buttons in the connection row, in modals, the carousel's Select — is a 5px
squared rectangle. Every pill is state: the Modeled/Sampled badges, the ON/OFF
chips, the Settings toggles. One radius each, so the two never blur.

**Not every action needs a button, though.** Saving sits in a column of 12px
labels, and a filled button there was the loudest thing on the panel for
something you do occasionally. A control earns chrome by how often it is
reached for, not by how important it sounds.

**That was taken too far once, and the correction is the rule now.** Saving was
drawn as bare green text, and Daniel took it for leftover UI on his own app
(2026-08-21) — fairly, since everything else here that writes to disk wears a
border. `#save-live-btn` has had a 1px outline since, which is the lightest
chrome that still reads as a control. So the column is 12px labels with ONE
outlined button in it, not two text actions: "Send to Seven" is not in this
column at all any more (it moved to the row and the transfer dialog, where the
destination is named — `audition.js`, "NO 'Send to Seven' HERE, in any
context"). This paragraph described the 2026-08-21 state for three months after
it stopped being true.

**Amber is for where you ARE, not for what to press.** The active bank tab, the
active segment, a focus ring, a field being edited. It was doing double duty as
the action colour, which is why the audition buttons read as louder than
anything else on screen (Daniel, 2026-08-11: "pretty out there").

**Full chroma for marks, damped for text.** The source these colours are
borrowed from is 3mm LEDs and printed legends a few millimetres tall. At word
scale the same hue is many times the ink, so a value that is right for a mark is
wrong for a sentence. A MARK keeps the panel's own value — the 3px selected-row
edge, a 2px tab underline, a lit LED — because those are the size an LED
actually is. Anything set as WORDS takes a damped variant, and the damped hues
are tuned to one brightness so that none of them jumps out of a row of the
others.

Without it a list design read as neon rather than as an instrument — Daniel,
2026-11-14: "These light colors are a bit wild and neon-y." The palette was not
at fault. Three of these hues were being set on whole words at 12px bold at
once, which is three LEDs' worth of colour enlarged a hundredfold.

The palette defines exactly one damped chroma variant today, `--warn`; every
other damped tone in it is neutral (`--text-muted`, `--text-dim`). A hue that
needs to appear as words therefore needs its damped variant added in both
palettes before it can, which `test/css-hazards.test.js` already enforces.

Two collisions it exposed, both now fixed, and both against rules this file
already states:

- **Amber was doing warning duty as well as locating.** The "Not installed"
  badge was amber — a claim about a problem, wearing the colour that means
  "where you are". It uses `--warn` (`#d9a13b` / `#7d5a10`), which the palette
  had all along. This is a second collision on the same colour as the action
  one above, which is the argument for keeping the one-meaning rule literally.
- **The active tab stated its selection twice**, as an amber underline AND
  amber text. Underline already means selection in the vocabulary above, so the
  colour was restating what the shape had said. The word is plain now, and the
  underline carries it alone.

### The dark palette is WARM (approved 2026-11-15)

Dark mode was neutral near-black and is now a warm charcoal. Daniel's
values, and every dark colour comes from them rather than from a hex typed
into a rule:

| Role | Token | Dark |
|---|---|---|
| Page — deepest, behind artwork | `--page` | `#1c1a17` |
| Panel and lists | `--bg` | `#23211e` |
| Raised: selected row, modal body, hover | `--bg-panel`, `--bg-raised` | `#2d2a26` |
| Borders and row dividers | `--line` | `#3d3934` |
| Primary text | `--text` | `#e6dfd2` |
| Secondary text | `--text-muted`, `--text-dim` | `#9d9484` |
| Navigation / the logo | `--amber`, `--logo` | `#E0A23C` — one value, since 18 Nov 2026 |
| Destructive | `--accent` | `#b5584a`, with `--accent-ink` `#f6ece2` on a fill |
| Action / ON / Sampled | `--action`, `--sampled` | `#7f9c78` |
| ON pill | `--pill-on-*` | text `#a9c3a1`, border `#56704f`, fill `#2f3a2b` |
| Outlined amber pill | `--pill-amber-border` | `#7d6a45` |
| Modeled | `--modeled` | `#8fa8c4`, muted steel blue |
| Sampled | `--sampled` | `#7f9c78` |

**TEXT ON A RED FILL IS WARM PAPER, NOT NEAR-BLACK** (`--accent-ink`). Black
on this red is harder to read than the old one, which is the kind of thing a
palette change quietly breaks.

**The first warm pass read as brown.** The surfaces above are the second
set: #24211d / #2d2a25 / #38342e / #4a443c were lighter and browner, and
muted text on the raised one measured 4.12:1 — under the 4.5 the project
enforces for body text, which `sounds-modal-contrast` caught as 24 failing
nodes. Darkening the surfaces fixed it without touching a single ink:
muted on raised is 4.76:1 now.

**Two text tiers collapsed in dark.** `--text-muted` and `--text-dim` were
distinct greys and are both `#9d9484` now, because the elements the palette
names — row numbers, "Empty", inactive tabs — span both. Worth splitting if
the flattening shows.

### Both palettes, always

Every variable is defined in BOTH `:root` (dark) and `:root[data-theme="light"]`,
and `test/css-hazards.test.js` fails the build if one is missing. A colour that
exists in one theme is invisible in the other until someone switches, which is
exactly how the dropdown chevron stayed unreadable in light mode for weeks.

The same test forbids a hardcoded colour inside a `data:` URI outside the
palettes: an SVG in a data URI cannot inherit `currentColor`, so its stroke has
to be written in — safe only where each theme supplies its own.

### What is NOT themed

The panel strip and its controls (the Clavinet-style tabs, the knobs, the
pressed caps) keep their physical colours in both themes. They are a picture of
a machine that does not change colour when the room lights do.

### The one exception: the logo is a lit sign

**A picture of a machine holds its colours; a lit sign does not.** The rule
above is about rendering an object under different room lights. A sign that
emits is a different object: in the dark you see the emission, in daylight you
see the material it is made of. So the Seven's logo script — alone among the
things borrowed from the hardware — may take a different value per theme, and
should.

- **Dark:** the panel green, glowing — a halo in its own hue.
- **Light:** forest `#1f6b3d`, with a soft same-hue spill. More SATURATED than
  the ground rather than brighter, because a lit sign in daylight spills its own
  colour onto the surface instead of haloing white.

The first version lit it in dark mode only and stated "chosen" with flat ink in
light, on the grounds that a neon halo on paper is a lie. The halo is the lie;
being lit is not. Daniel pushed back (2026-11-14) and that is the correction —
a sign that is on reads as on under any light, or the thing it is imitating is
not a sign.

The colour was picked from six candidates all sourced from the panel drawing
(the LOCAL OFF chip's magenta, the LED red, the panel's teal, the unlit ochre
legend, plain ink), so it is borrowed like everything else here.

**Watch:** forest is also `--action` in light, both descended from the
DEPTH/RATE legend, so the shared hue is honest rather than a coincidence — and a
31px script in a corner is not confusable with a 12px label in a foot. If a
third thing wants this green, split them then.

**And it is allowed exactly once.** The logo lights because it IS the machine;
it states "selected" in the instrument's own language instead of the app's. A
second element that starts glowing takes the meaning away from this one.

**THE EXCEPTION IS THE GLOW, NOT THE HUE** (Daniel, 18 Nov 2026). Since the
active-state marker became the logo's amber — `--amber` and `--logo` are one
value in dark — it is worth being exact about what the licence covers. What
the logo alone does is **bloom**: `--logo-glow`, a same-hue spill that widens
and weakens. The tab underlines wear the colour flat, with no halo, and that
is why they do not spend this. Anything that starts to glow does.

**A note on `--amber`'s name.** It was doing five jobs: the active-state
marker (tabs, bank tabs, `.seg-btn`), focus rings, the field being edited,
locating marks (`.mp-bracket`, `.reach-arrow`, drop targets) and warnings
(`.tx-alarm-soft`, `.param-value.range-reversed`). This change narrowed its
*meaning* toward the first without touching the others, so the token's name no
longer describes most of its users. ~~Splitting them into named tokens is a
later cleanup, deliberately not done in that pass.~~ **THE SPLIT HAPPENED, in
`52c599d` (18 Nov 2026), and it arrived as a red rather than as tidying** —
`modal-panel-choose` failed with the bracket at 1.65:1. Locating marks moved
to `--mark-amber`; the other four jobs stayed. See the table below.

### THE AMBER VALUES, WITH THE NUMBERS ATTACHED (settled 18 Nov 2026)

**This table exists because a contrast decision and a looks decision were made
in different places and never met.** `#9e6c19` was chosen at 3.37:1 over
`#a7721b` at 3.06 *explicitly because 3:1 is a floor and not a target* — and a
later "use the Seven's script colour" change, approved from a screenshot, took
the same mark to 1.88:1 with nobody re-measuring. Neither decision was wrong on
its own terms. The numbers now live beside the values so the next screenshot
approval has them in hand.

| token | dark | light | jobs |
|---|---|---|---|
| `--amber` | `#E0A23C` | `#E0A23C` | the active-state marker only — tab and bank-tab underlines, `.seg-btn`, the field being edited |
| `--mark-amber` | `#c9a25e` | `#8a5d00` | everything that is FUNCTION: locating marks, the four focus rings, the reversed-range readout, `.tx-alarm-soft` |

**THE SPLIT IS TASTE VERSUS FUNCTION, not two kinds of mark.** `--amber` keeps
the jobs Daniel judged by eye and approved twice; `--mark-amber` takes the ones
where being seen is the whole point. A focus ring nobody can see is a keyboard
user stuck, and that is not an aesthetic question (Daniel, 18 Nov 2026).

**Measured in the running app, both themes**, by
`test/ui/scenarios/amber-jobs-contrast.js` — against the ground each element
actually sits on, found by walking ancestors for the first non-transparent
background rather than naming one by hand:

| | light | dark | bar |
|---|---|---|---|
| focus ring · search / param select | 4.26:1 | 5.99:1 | 3:1 |
| focus ring · library folder | 4.84:1 | 6.74:1 | 3:1 |
| focus ring · fx state | 4.88:1 | 5.00:1 | 3:1 |
| reversed-range readout (TEXT) | 5.29:1 | 5.99:1 | 4.5:1 |

All six were 1.88:1 or worse in light before the move.

**`.tx-alarm-soft` IS NOT IN THAT TABLE** — it lives inside a modal that the
scenario does not open, so it is not measured. It uses the same token on the
same dialog ground as the readout, so it is expected to land near 5:1, but
**expected is not measured** and the scenario says "not measured in this
state" rather than quietly leaving it out.

**Measured contrast, light theme, against all three grounds.** `--page` is the
WORST ground and the one that binds: these marks are darker than the paper, so
the darkest ground gives the least contrast. Gating on `--bg` is backwards, and
it is what hid this — `#a7721b` reads 3.06:1 on `--bg-panel` and **2.84:1 on
`--page`**, so the rejected candidate would have failed the real test too.

| | `--bg` | `--bg-panel` | `--page` | bar |
|---|---|---|---|---|
| `--amber` `#E0A23C` | 1.88:1 | 1.65:1 | **1.53:1** | 3:1 marks, 4.5:1 text |
| `--mark-amber` `#8a5d00` | 4.84:1 | 4.26:1 | **3.95:1** | 3:1 |

Dark theme is not in question: `--amber` is 7.19:1 on `--bg` there.

**`--amber` IS BELOW ITS BAR IN LIGHT, KNOWINGLY, AND THAT IS DANIEL'S CALL
(18 Nov 2026).** He was shown the underline at today's value beside a candidate
in the identical hue, on all three grounds, and chose today's: *"today looks
great."* So the active-state marker, the focus rings, the field being edited
and the reversed-range warning all sit under the WCAG figures in the light
theme. **Recorded rather than quietly carried**, because the next person to
measure this will otherwise think they have found a bug.

**What was measured and declined, so nobody re-derives it.** Both are the
Seven's exact hue, 37.3°, Δ0.0 from the logo:

- `#936925` — 4.12 / 3.62 / **3.36:1**. Clears the 3:1 bar on the worst ground
  with the same headroom as the 3.37 that was approved in the first place.
- `#78561e` — 5.61 / 4.93 / **4.57:1**. The only thing at this hue that clears
  **4.5:1** on `--page`, which is the bar for the reversed-range readout
  because that one is TEXT. **No single value in this hue serves all four jobs**
  without taking the underline considerably darker than what was approved.

The comparison Daniel judged is `out/amber-underline-compare.html`.

The mock at `out/lists-design.html` implements this — a same-hue spill at low
alpha, widening and weakening, so the sign reads as more saturated than the
paper rather than brighter than it.

### THE EXPRESSION PEDAL: A READING ON ITS OWN BAR, AND A MODEL ON THE ROW IT DRIVES

Added 18 Nov 2026, and **a sixth job for `--amber`** — the note above lists
five. Both are amber because both are the same pedal.

| where | what is drawn | what it means |
|---|---|---|
| the pedal's own Range bar | `.pedal-pos`, a **solid** 2px line | the pedal's position, **read** from CC 11 |
| the row the pedal drives | the row's own **fill**, hatched | where that probably puts it, **computed** |

**THE DRIVEN ROW GETS NO NEW SYMBOL** (Daniel's call). The row already has two
marks that mean the right things — **the fill is how much there is, the circle
is where the value is set** — so the pedal drives the fill and the circle keeps
the stored value. The first attempt drew a dotted line *beside* an unchanged
fill, which put three marks on a 6px bar to say two things.

**THE CIRCLE BECOMES PERMANENT ON A DRIVEN ROW, and that is load-bearing.**
`.param-bar-knob` is `opacity: 0` until the bar is hovered. With the fill now
showing the pedal, the circle is the only thing left saying what the patch
holds — so an invisible one would leave the estimate as the only number on the
row. Reassigning the pedal moves this: the new destination row gains the class,
the old one reverts to hover-only with its fill back at the stored value.

**TEXTURE CARRIES THE UNCERTAINTY.** A solid fill is the most authoritative
thing on the row and this number was never read off the instrument, so while
the pedal owns the fill it is **hatched** in the pedal's amber. The app cannot
read what the instrument is applying — the destination parameter is not
modulated and CC 11 carries the raw position — so the amount is arithmetic
resting on an assumed linear mapping that cannot be checked from this side of
the cable (docs/DEVICE.md says what would verify it). A reader who cannot tell
a reading from a model will quote the estimate as a measurement, which is the
failure this project has recorded three times under other names.

**Why texture and not a second colour.** A different hue would say *a different
thing*; what differs is only **how well it is known**.

**AN INERT ROW STILL SHOWS THE PEDAL.** A row in a switched-off section is
already dimmed and already carries an inert marker with its reason, so hiding
the pedal's fill there would state the same fact a second time — invisibly, and
in a way that reads as the feature being broken rather than as the section
being off. It did exactly that for Amp Drive (Daniel, 18 Nov 2026: *"No
workie"*). The fill answers **where the pedal is, mapped through its range**;
whether anything downstream is listening is a different question, and the row
answers that one itself.

For Amp Drive the second question now has a measured answer — with the amp
simulator off the pedal genuinely does nothing to the sound (docs/DEVICE.md,
by ear, 18 Nov 2026) — and the drawing is unchanged by that. **Two true
statements, carried by two different marks**: the dimming says the parameter is
inert, the fill says where the pedal is. Folding them into one would lose the
second, which is what the gate did.

**THE ROW'S NUMBER NEVER MOVES.** It is the stored value. The pedal modulates;
it does not edit. A number that followed the pedal would make Save patch write
a value the patch never held.

## Parameter rendering taxonomy

How a parameter renders is decided from **schema data** (`max`, `values`,
`bipolar`, `pairMax`) — never from hardcoded key lists:

| Shape | Schema signature | Examples |
|---|---|---|
| Continuous bar | max > 15 | most 0–127 params |
| Centre-origin bar | `bipolar: true` (centre = neutral, per manual) | Hammer Offset, Stretch Tuning, Lid Position, String Detuning |
| ON/OFF rocker tab | max = 1, no values | the four Clavi filters |
| Two-way choice rocker tab | max = 1 + two values | Pickup A\|B, C\|D, Decay Type |
| Labelled enum dropdown | values, max > 1 | fx1_md, fx2_md, pha_st, amp_mo, exp_fn |
| Numbered selector | 2 ≤ max ≤ 15, no values | rho_tp, dx7_tp ("9 of 9") |
| Range pair | `pairMax` on the min param | exp_mn + exp_mx |

Rocker tabs draw as Clavinet-D6 hardware, rotated to horizontal: cream caps in
a dark recessed frame (consecutive tab rows fuse into one frame, as on the
instrument), the pressed side lower and darker, the raised side catching the
highlight. Toggles carry one label and read pressed = on. Choices carry both
labels and tip toward the active side — neither side is "off". Not the green
status pills; that vocabulary stays with section headers. Value→side mapping
(0 = first/left) is assumed, unverified (docs/PROJECT-SCOPE.md).

**Display order follows the hardware where the hardware has an order**: the
Clavi rows render BRILLIANT, TREBLE, MEDIUM, SOFT, C/D, A/B like the
instrument's tabs and our panel legends (the reverse of schema ID order).
Everything else keeps schema order. Display only — patch serialization stays
keyed by schema key.

Semantics carried by the renderer:

- **veq_byp is EQ *Bypass* — inverted**: 1 means bypassed, i.e. EQ OFF. The
  section pill, section dimming, and the two EQ knobs' lit state all read
  through the inversion.
- **Inert parameters say so** instead of pretending to apply: rom_p05 Piano
  Harp dims unless the loaded sample is a piano; the Expression Pedal section
  dims with an explanation while FX1 runs Pedal Wha-Wha (the wha takes
  priority over the pedal assignment, per the manual).
- **All four Clavi filters at 0 = no sound** from the instrument — surfaced as
  a warning banner on the patch, not left as a silent state.
- The range pair renders as one track with both handles; **min above max
  reverses the pedal action** (manual) and shows an amber min→max readout.

All of these controls are non-interactive for now.

## Navigation and collapse

- Effect sections **start collapsed** — the header row (chevron, name, summary,
  pill) is the chain's resting view. Clicking a knob on the strip or a section
  header **toggles** the section.
- **Clicking a knob navigates only. It never changes a value.**
- Opening scrolls the section into view if needed and briefly tints it;
  closing gets no highlight. Expand/collapse is view state — never written to
  patch data.

## Effects section order

Section order follows the manufacturer's manual (chapter 20). Crumar does not
document the Seven's actual audio signal path anywhere; the routing is unknown.

Related, from the same manual: the PAD is documented as a virtual analog synth
that plays on top of any piano sound — a parallel layer, not an insert effect.
The phaser and delay parameter groups are documented as sub-sections of FX2,
which is how the UI already nests them (phaser at mode 1, delay at mode 3).

## Device state is device-reported — never optimistic

Controls that represent instrument state (the section ON/OFF pills, and later
knobs, LEDs, and anything else mirroring the hardware) always render **what the
device reports, never what the user clicked**.

The interaction contract is:

1. click → send the write (e.g. set-parameter `0x20` for a switch ID),
2. await the device's reply,
3. render the control from the value in the reply.

Optimistic UI is wrong here: a write can fail, and a pill showing "on" while the
reverb is actually off is worse than a pill that didn't move. When no instrument
is connected, a control explains ("No instrument connected.") instead of
pretending — it never flips to reflect local UI state.

## Three knob/section cues — keep them distinct

- **Lit knob** = its effect is **on** (patch data). Interim scheme: amber cap
  fill (#ffd9a0) + amber outline (#ff9d2e) + darkened pointer. The eventual
  target is the RGB value-encoding scheme below.
- **Accent ring on a knob** = its section is **expanded** (view state,
  persistent while open). Outer ring ONLY — never the face — so it stays
  distinct from the lit cue; both can apply to one knob at once.

  The outer ring appears ONLY on the focused knob (plus a dimmer hover ring
  for discoverability); at rest a knob is just its face and pointer. This is a
  **deliberate departure from the instrument**, which has a visible ring around
  every knob — fidelity traded for a legible focus state, since a static ring,
  the focus ring, and hover all competed for the same annulus.
- **Brief accent tint on a section** = you **just opened** it (transient,
  fades ~1.2s).

Never reuse one of these colours/treatments for another meaning — and the
library's selected-patch red edge marker is a fourth, unrelated cue that stays
in the list only. Closing a section gets no highlight at all.

## Panel says RATE, parameter list says Speed — both correct

The instrument's silkscreen prints **RATE** on both FX sections, but the device
reports the `fx1_sp`/`fx2_sp` parameter label as **"Speed"** (a documented
firmware-vs-silkscreen discrepancy — see protocol.md "Findings that contradict
the manual"). The panel strip renders the silkscreen; the effects-chain rows
render the device label. Do not "fix" either to match the other.

## Volume knob — Local Off state (blue)

On the instrument, a **slow push** on the volume knob (held at least **100ms**)
toggles **Local Off** — the keyboard stops playing the internal engine but keeps
sending MIDI out — and the knob turns **blue**. It does not go dark, and it is
not a mute. A **quick push** (pushed and released immediately) switches which
parameter the knob is displaying; that quick/slow distinction applies to the
panel knobs generally (slow toggles the effect on/off, quick switches the
displayed parameter).

Whether Local Off is readable or settable over SysEx is unknown (see
docs/PROJECT-SCOPE.md, open questions). Until resolved, the strip's `led-volume`
renders lit (Local On); when it lands, it follows the device-reported rule above
like every other device-state control.

## Deferred fidelity

- **TODO — BANK button pending state.** On the instrument, pressing BANK does
  not switch bank immediately: the bank LED starts **blinking** and the
  instrument waits. The bank is only committed when a preset button is pressed
  **within three seconds**; if nothing is pressed, the previous bank is
  restored and the LED stops blinking. Our panel currently advances the bank
  immediately on press. Model the real pending behaviour once the app is
  actually recalling presets on the instrument — until then the mismatch would
  mislead about what the hardware is doing.

## Knob lighting — eventual target (RGB, value-encoding)

The hardware knobs are RGB and encode **value**, not just on/off (manual, FW
1.2, Sep 2020): colour runs **green at low values toward red at high values**,
and knobs turn off entirely at some values. Exceptions: **Reverb Decay** uses
**blue→red**, and **FX1/FX2 Rate** show a **pulsing blue that blinks in sync
with the effect's LFO**.

**Implemented** for the knobs' default displayed parameters: `updateKnobLit`
maps value→hue (green 120° at 0 sweeping to red 0° at max) onto the glass
knobs' glow material; switch-off/bypassed knobs stay dark, matching the
"off entirely" behaviour. The two exceptions belong to push-toggled ALTERNATE
parameters (Decay, Rate) that the strip doesn't render — implement blue→red
and the LFO-synced pulse if alternate knob views ever land.

## Planned

*(This section was created for the note below; the Library-tab note it was
meant to sit under does not exist in this file yet.)*

**LIBRARY STRUCTURE — leaning, not decided.** The patch is the atom; a bank is
a view. Storing bank-shaped collections as the primitive creates awkward
cases: a patch captured without a slot, gaps in a partial setlist, wanting 3
patches out of 8.

Proposed instead: the Library is a flat pool of patches, sortable and
taggable, with a separate lightweight "setlist" concept — a name plus an
ordered list of up to 8 patch references. Setlists are what get pushed to a
bank. A patch may belong to several setlists or none. ("Setlist", not
"bank": the word bank belongs to the hardware's four banks, and the core
transfer action must read "push setlist to bank", never "push bank to
bank".)

This matches the two real uses: collecting is flat (patches accumulate over
time with no slots involved), transferring is bank-shaped (filling 8 slots on
a specific unit).

The .sevenlib.json format already supports either — patches is a flat array
and `origin` is optional history, not location. Setlists live in an
additive manifest (setlists.json), no format break.

**DECIDE AFTER the first real backup and transfer against hardware.** The
workflow will make the answer obvious, and guessing now risks building the
wrong primitive.
