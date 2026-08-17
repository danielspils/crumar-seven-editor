"""Writes build/icon.svg and build/icon-small.svg.

Everything circular comes out of assets/seven-panel.svg rather than being
redrawn: the #knob-glass encoder with its own gradients, lit green by the
app's updateKnobLit() values at hue 120, and #pwr-icon at the offset the
dashboard uses everywhere — knob + (28, 48) panel units, which puts it
outside the skirt at the lower right.

The lettering is the panel's own label face: Archivo Narrow bold italic with
.05em tracking, the setting REVERB and every other section title uses,
converted to outlines so neither file references a font. SEVEN sits where
REVERB sits, closer to the knob; "11" stands in the power symbol's slot.

TWO DRAWINGS, because one does not survive the range. At 32px the lettering
turns to grey noise and at 16px it is gone entirely, leaving something worse
than nothing — so the small drawing throws the words away and gives the whole
tile to the lit knob, which is the one part that still reads at 16px. Both
come from this file, so they cannot drift apart.

Glyph outlines live in tools/icon-glyphs.json, generated once from Archivo
Narrow bold italic (SIL OFL). Regenerating them needs the TTF; the JSON is
checked in so building the icons needs nothing but this script.
"""
import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
svg = open(os.path.join(ROOT, 'assets', 'seven-panel.svg')).read()
glyphs = json.load(open(os.path.join(ROOT, 'tools', 'icon-glyphs.json')))


def grab(pattern):
    m = re.search(pattern, svg, re.S)
    if not m:
        sys.exit(f'not found in seven-panel.svg: {pattern}')
    return m.group(0)


knob = grab(r'<g id="knob-glass">.*?\n    </g>')
kg_body = grab(r'<radialGradient id="kg-body".*?</radialGradient>')
kg_top = grab(r'<radialGradient id="kg-top".*?</radialGradient>')
pwr = grab(r'<g id="pwr-icon".*?</g>')

# app.js updateKnobLit(): hue = 120 * (1 - value/max), so 120 is a knob at
# rest — lit green. These are its eight custom properties, unaltered.
c = lambda l, a: f'hsla(120, 90%, {l}%, {a})'
LIT = {
    '--k-glow-fill': c(55, 0.30), '--k-bore-fill': c(72, 1),
    '--k-bore-stroke': c(55, 1), '--k-top-stroke': c(70, 0.65),
    '--k-mid-stroke': c(65, 0.35), '--k-skirt-stroke': c(65, 0.55),
    '--k-rib-stroke': c(70, 0.4), '--k-shadow': c(55, 0.45),
}
LIT_CSS = ' '.join(f'{k}: {v};' for k, v in LIT.items())

SIZE = 1024
KNOB_R = 36.0                  # panel units
PWR_DX, PWR_DY = 28.0, 48.0    # the dashboard's own offset for #pwr-icon


def fit(g, target_w):
    x1, y1, x2, y2 = g['bbox']
    return target_w / (x2 - x1), (x1 + x2) / 2, (y1 + y2) / 2


def place(g, target_w, cx, cy):
    s, mx, my = fit(g, target_w)
    return f'translate({cx - mx * s:.2f} {cy - my * s:.2f}) scale({s:.5f})'


def defs(ks):
    return f'''    {kg_body}
    {kg_top}
    <radialGradient id="lamp" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0" stop-color="hsl(120, 90%, 55%)" stop-opacity="0.42"/>
      <stop offset="0.55" stop-color="hsl(120, 90%, 50%)" stop-opacity="0.14"/>
      <stop offset="1" stop-color="hsl(120, 90%, 45%)" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#343437"/>
      <stop offset="1" stop-color="#232326"/>
    </linearGradient>
    <!-- The app's own lit-knob shadow, at 6px against a 72px knob, kept in
         proportion here. NO DOUBLE HYPHENS IN THIS COMMENT, and none in any
         other: the custom property it refers to cannot be named here, because
         a double hyphen inside an XML comment is illegal and the whole file
         is then rejected by anything parsing it strictly. Rendering the SVG
         inside a page hid it (HTML parsing is lenient); drawing it through an
         Image, which is how the icons are rasterised, failed with nothing but
         "svg failed to decode". -->
    <filter id="litglow" x="-60%" y="-60%" width="220%" height="220%">
      <feDropShadow dx="0" dy="0" stdDeviation="{6 * ks / 6:.1f}"
                    flood-color="hsl(120, 90%, 55%)" flood-opacity="0.45"/>
    </filter>
    <clipPath id="body"><rect width="{SIZE}" height="{SIZE}" rx="180"/></clipPath>'''


def knob_stack(cx, cy, r, ks):
    """Lamp, panel, knob — in that order, which is the order that matters.

    Every layer of #knob-glass is translucent: on the instrument it sits on
    #2b2b2d, and that darkness showing through is what makes it read as metal.
    Over the lamp alone the whole knob turns into a flat green disc.
    """
    return f'''    <circle cx="{cx:.0f}" cy="{cy:.0f}" r="{r * 1.7:.0f}" fill="url(#lamp)"/>
    <circle cx="{cx:.0f}" cy="{cy:.0f}" r="{r * 1.01:.0f}" fill="#2b2b2d"/>
    <g transform="translate({cx:.1f} {cy:.1f}) scale({ks:.4f})" filter="url(#litglow)">
      {knob}
    </g>'''


def full():
    """The drawing for 128px and up."""
    r = 265.0
    ks = r / KNOB_R
    cx, cy = SIZE / 2 - 40, 520.0

    seven_w = r * 2 * 1.02
    s_scale = fit(glyphs['seven'], seven_w)[0]
    seven_h = (glyphs['seven']['bbox'][3] - glyphs['seven']['bbox'][1]) * s_scale
    # On the panel REVERB's baseline sits 23 units above the knob's top edge.
    # SEVEN closes that to 9 — the "closer to the knob" part.
    seven_cy = cy - r - 9 * ks - seven_h / 2
    seven_t = place(glyphs['seven'], seven_w, SIZE / 2, seven_cy)
    # The numerals take #pwr-icon's slot. Bigger than the symbol they replace
    # — they are the point of the name — but not so big they argue with the
    # knob (Daniel, 2026-08-16).
    eleven_t = place(glyphs['eleven'], 21 * ks, cx + PWR_DX * ks, cy + PWR_DY * ks)

    return f'''<svg xmlns="http://www.w3.org/2000/svg" width="{SIZE}" height="{SIZE}"
     viewBox="0 0 {SIZE} {SIZE}" style="{LIT_CSS}">
  <title>This Seven Goes to Eleven</title>
  <defs>
{defs(ks)}
  </defs>
  <g clip-path="url(#body)">
    <rect width="{SIZE}" height="{SIZE}" fill="url(#bg)"/>
{knob_stack(cx, cy, r, ks)}
    <!-- SEVEN, set exactly as the panel sets REVERB. -->
    <path transform="{seven_t}" fill="#e8e8ea" d="{glyphs['seven']['d']}"/>
    <!-- "11" where #pwr-icon goes, at the dashboard's own offset. -->
    <path transform="{eleven_t}" fill="#e8e8ea" d="{glyphs['eleven']['d']}"/>
  </g>
</svg>
'''


def small():
    """The drawing for 64px and below: the knob, and nothing to lose."""
    r = 400.0
    ks = r / KNOB_R
    cx = cy = SIZE / 2
    return f'''<svg xmlns="http://www.w3.org/2000/svg" width="{SIZE}" height="{SIZE}"
     viewBox="0 0 {SIZE} {SIZE}" style="{LIT_CSS}">
  <title>This Seven Goes to Eleven</title>
  <defs>
{defs(ks)}
  </defs>
  <g clip-path="url(#body)">
    <rect width="{SIZE}" height="{SIZE}" fill="url(#bg)"/>
{knob_stack(cx, cy, r, ks)}
  </g>
</svg>
'''


for name, body in (('icon.svg', full()), ('icon-small.svg', small())):
    path = os.path.join(ROOT, 'build', name)
    open(path, 'w').write(body)
    print(f'build/{name}  {len(body)} bytes')
