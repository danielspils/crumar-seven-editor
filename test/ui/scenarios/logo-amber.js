// @env SEVEN_NO_DEVICE=1
//
// THE SEVEN LOGO IS AMBER, IN BOTH THEMES, AND SO IS EVERYTHING DRAWN FROM IT.
//
// Daniel, 17 Nov 2026: --logo #E0A23C in dark and in light. It had been the
// panel green — #7f9c78 dark, #1f6b3d light — and was the ONE element in the
// app allowed to change value by theme. One value now serves both, so that
// exception is documented but no longer exercised.
//
// WHY A SCENARIO AND NOT A GLANCE. The logo is inlined SVG using
// currentColor, lit only while the Seven tab is selected, and five boot-glow
// properties are color-mix()ed from --logo. A hand-typed hex in one of those
// would look right in one theme and wrong in the other — which is exactly the
// chevron that spent weeks invisible (DESIGN.md, "Both palettes, always").
// Reading the COMPUTED colour off the real element is the only way to know
// the value reached the ink.
//
// It reports the numbers and asserts the ones that are decisions.
(async () => {
  const AMBER = 'rgb(224, 162, 60)';          // #E0A23C
  const hex = (rgb) => {
    const m = /(\d+),\s*(\d+),\s*(\d+)/.exec(rgb || '');
    return m ? '#' + [1, 2, 3].map((i) => Number(m[i]).toString(16).padStart(2, '0'))
      .join('').toUpperCase() : rgb;
  };
  const prop = (n) => getComputedStyle(document.documentElement)
    .getPropertyValue(n).trim();
  // HUE AND LIGHTNESS FROM AN rgb() STRING. The ramp's claim is about hue
  // (both ends amber) and lightness (one darker than the other), and those
  // are not readable from a hex by eye — #4A3A24 and #3a4a3e are a similar
  // darkness and 100 degrees apart.
  // The palette stores hexes; getComputedStyle hands back rgb() for an
  // element's colour. hsl() wants one shape, so hexes are converted first.
  const hexToRgb = (h) => {
    const s = h.replace('#', '');
    const n = s.length === 3 ? s.split('').map((c) => c + c).join('') : s;
    return `rgb(${parseInt(n.slice(0, 2), 16)}, ${parseInt(n.slice(2, 4), 16)},`
      + ` ${parseInt(n.slice(4, 6), 16)})`;
  };
  const hsl = (rgb) => {
    const m = /(\d+),\s*(\d+),\s*(\d+)/.exec(rgb || '');
    if (!m) return null;
    const [r, g, b] = [1, 2, 3].map((i) => Number(m[i]) / 255);
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const d = max - min;
    let h = 0;
    if (d) {
      if (max === r) h = 60 * (((g - b) / d) % 6);
      else if (max === g) h = 60 * ((b - r) / d + 2);
      else h = 60 * ((r - g) / d + 4);
    }
    if (h < 0) h += 360;
    return { h, s: max ? (d / max) * 100 : 0, l: ((max + min) / 2) * 100 };
  };

  const look = async (theme) => {
    // THE APP'S OWN SWITCH, not a media query override: data-theme is what
    // the app sets, and the palettes are keyed on it.
    document.documentElement.setAttribute('data-theme', theme);
    await ui.sleep(400);
    // LIT MEANS THE SEVEN TAB IS SELECTED. .top-logo is --logo-off otherwise,
    // so measuring on another tab would read the UNLIT value and pass or
    // fail for the wrong reason.
    await ui.selectTab('seven');
    await ui.sleep(500);

    const logo = ui.$('#top-tabs .top-logo') || ui.$('.top-logo');
    const svg = logo ? logo.querySelector('svg') : null;
    const painted = svg ? (svg.querySelector('[fill], path, g') || svg) : null;

    ui.note('');
    ui.note(`=== ${theme.toUpperCase()} ===`);
    ui.note(`  --logo      ${prop('--logo')}`);
    ui.note(`  --logo-off  ${prop('--logo-off')}`);
    ui.note(`  --amber     ${prop('--amber')}`);
    if (!logo) { ui.check(false, `${theme}: the logo is on screen`); return null; }

    const lit = getComputedStyle(logo).color;
    // Read here rather than beside the unlit measurement further down: the
    // halo check below needs it, and a `const` in the temporal dead zone
    // throws rather than reading undefined.
    const litH = hsl(lit);
    ui.note(`  .top-logo color  ${lit}  = ${hex(lit)}`);
    if (painted) {
      const pc = getComputedStyle(painted).color;
      const fill = painted.getAttribute && painted.getAttribute('fill');
      ui.note(`  the ink inside   ${pc} = ${hex(pc)} · fill attr ${fill || '(none)'}`);
      // THE INK, NOT JUST THE BUTTON. The artwork is inlined so it can
      // inherit currentColor; a hardcoded fill in the SVG would ignore the
      // palette entirely and this is where that shows.
      ui.check(!fill || /currentColor/i.test(fill),
        `${theme}: the artwork takes currentColor, not a baked fill (${fill})`);
    }

    // THE DECISION: lit is amber, in this theme.
    ui.check(lit === AMBER,
      `${theme}: the lit logo is #E0A23C (got ${hex(lit)})`);

    // AND THE GLOWS FOLLOW IT. They are color-mix(in srgb, var(--logo) N%,
    // transparent), so a literal creeping into one of them is invisible
    // until the palette moves — which is the whole reason they were written
    // as a mix.
    //
    // CHECKED AGAINST WHAT --logo-glow COMPUTES TO, which took three tries.
    // getPropertyValue returns the COMPUTED value, so looking for the text
    // `var(--logo-glow)` fails on all five while every one is correct — the
    // substitution has already happened. Looking for the lit element's
    // `rgb(224, 162, 60)` fails too: var() substitutes the custom property's
    // own TOKENS, so the mix reads `color-mix(in srgb, #E0A23C 50%,
    // transparent)` with the hex, and only an element's `color` resolves to
    // rgb(). And it is --logo-GLOW, not --logo: since 17 Nov the halo has
    // its own token, equal to --logo in dark and a dark amber in light.
    const glows = ['--boot-glow-1', '--boot-glow-2', '--boot-glow-3',
      '--boot-glow-lit', '--boot-glow-wide'];
    const glowToken = prop('--logo-glow');
    ui.note(`  --logo-glow ${glowToken}`);
    ui.note(`  the resting halo: ${prop('--boot-glow-lit')}`);
    ui.note(`              wide: ${prop('--boot-glow-wide')}`);
    const stale = glows.filter((g) => !prop(g).toLowerCase()
      .includes(glowToken.toLowerCase()));
    ui.check(stale.length === 0,
      stale.length ? `${theme}: these do not carry --logo-glow (${glowToken}):`
        + ` ${stale.join(', ')}` : `${theme}: all ${glows.length} boot glows`
        + ` mix from --logo-glow (${glowToken})`);
    // THE HALO IS THE LOGO'S COLOUR IN DARK AND DARKER THAN IT IN LIGHT.
    // A glow is light spilling off a lit sign: on a dark panel that is the
    // sign's own colour, on a pale one there is nothing for a pale halo to
    // be brighter than, so it has to read as ink bleeding — which is darker.
    const glowH = hsl(glowToken.startsWith('#') ? hexToRgb(glowToken) : glowToken);
    if (glowH && litH) {
      ui.note(`  halo hue ${Math.round(glowH.h)}° · lightness`
        + ` ${Math.round(glowH.l)}% vs the sign's ${Math.round(litH.l)}%`);
      ui.check(Math.abs(glowH.h - litH.h) <= 12,
        `${theme}: the halo is the sign's own hue`
        + ` (${Math.round(glowH.h)}° vs ${Math.round(litH.h)}°)`);
      if (theme === 'dark') {
        ui.check(glowToken === prop('--logo'),
          `dark: the halo IS the logo colour (${glowToken})`);
      } else {
        ui.check(glowH.l < litH.l,
          `light: the halo is DARKER than the sign (${Math.round(glowH.l)}%`
          + ` vs ${Math.round(litH.l)}%) — a pale halo on a pale panel is`
          + ' invisible');
      }
    }

    // THE UNLIT SIGN, AND THE ONE PROPERTY THE RAMP TURNS ON.
    //
    // Daniel, 17 Nov: "the warm-up ramps brightness instead of shifting
    // hue". The three boot rungs are color-mix between --logo-off and --logo
    // in the keyframes, so if the two ends are different HUES the filament
    // rotates colour on its way up — which it did while --logo-off was still
    // the green family. Same hue, different value, is a lamp coming on.
    //
    // ASSERTED IN HUE DEGREES, not by comparing hexes: "both are amber" is
    // the claim, and two ambers of different brightness must pass. Lightness
    // is expected to differ — that IS the ramp — so only hue is checked.
    await ui.selectTab('patches');
    await ui.sleep(450);
    const unlitEl = ui.$('#top-tabs .top-logo') || ui.$('.top-logo');
    const unlit = unlitEl ? getComputedStyle(unlitEl).color : null;
    ui.note(`  UNLIT (another tab selected) ${unlit} = ${hex(unlit)}`);
    const offH = hsl(unlit);
    if (litH && offH) {
      const apart = Math.round(Math.abs(litH.h - offH.h) * 10) / 10;
      ui.note(`  hue  lit ${Math.round(litH.h)}° · unlit ${Math.round(offH.h)}°`
        + ` — ${apart}° apart`);
      ui.note(`  lightness  lit ${Math.round(litH.l)}% · unlit`
        + ` ${Math.round(offH.l)}% — the ramp`);
      ui.check(apart <= 12,
        `${theme}: the ramp's two ends share a hue (${apart}° apart, lit`
        + ` ${Math.round(litH.h)}° / unlit ${Math.round(offH.h)}°)`);
      // THE DIRECTION IS PER THEME, and assuming otherwise was wrong here
      // first time round. In DARK the sign lights UP: unlit is darker and the
      // ramp brightens. In LIGHT there is nothing to glow, so the warm-up is
      // carried by the INK DARKENING from --logo-off towards --logo — the
      // light palette's own comment says so. So unlit is the LIGHTER one on
      // paper, and an assertion that unlit is always darker fails on a
      // correct palette.
      const brightens = theme === 'dark';
      const moved = Math.round(Math.abs(litH.l - offH.l));
      ui.check(brightens ? offH.l < litH.l : offH.l > litH.l,
        `${theme}: the ramp runs the right way — unlit ${Math.round(offH.l)}%`
        + ` ${brightens ? '→ brightens to' : '→ darkens to'}`
        + ` ${Math.round(litH.l)}% (${moved} points)`);
      ui.check(moved >= 5,
        `${theme}: and it moves enough to read as a change (${moved} points)`);
    }
    await ui.selectTab('seven');
    await ui.sleep(400);
    return { lit, unlit, off: prop('--logo-off'), amber: prop('--amber'),
      litH, offH };
  };

  const dark = await look('dark');
  const light = await look('light');

  // ---- THE SAME VALUE IN BOTH, which is the part that is new -------------
  ui.note('');
  if (dark && light) {
    ui.check(dark.lit === light.lit,
      `one value serves both themes (${hex(dark.lit)} / ${hex(light.lit)})`);
    // AND THE ACTIVE-STATE MARKER, which was the "nearby amber" this note
    // used to report as an unevenness. Daniel merged them on 18 Nov 2026, so
    // the claim is now the opposite one and it is CHECKED rather than noted:
    // in dark, var(--amber) IS the logo's lit value.
    ui.note(`--amber is ${dark.amber} dark / ${light.amber} light;`
      + ` the logo is ${hex(dark.lit)} in both.`);
    ui.check(dark.amber.toLowerCase() === hex(dark.lit).toLowerCase(),
      `in dark the active marker IS the logo's amber (${dark.amber}`
      + ` vs ${hex(dark.lit)})`);
    // LIGHT TAKES THE HUE AND NOT THE VALUE, deliberately: #E0A23C measures
    // 1.65:1 on light --bg-panel, and a 2px marker at 1.65:1 is no marker. So
    // the test is hue, the way the ramp test below is — comparing hexes would
    // demand a value that cannot be used.
    // The same instrument the ramp check uses: hexes through hexToRgb into
    // hsl(), because "same hue, different lightness" is not readable from two
    // hexes by eye.
    const markerHsl = hsl(hexToRgb(light.amber));
    const litHsl = hsl(hexToRgb(hex(light.lit)));
    if (markerHsl && litHsl) {
      const d = Math.abs(markerHsl.h - litHsl.h);
      const apart = Math.round(Math.min(d, 360 - d) * 10) / 10;
      // hsl() returns lightness ALREADY as a percentage, the way the ramp
      // notes above print it. Multiplying by 100 again read "3588%".
      ui.note(`  light: the marker is ${light.amber} (hue ${Math.round(markerHsl.h)}°,`
        + ` lightness ${Math.round(markerHsl.l)}%) against the logo's`
        + ` ${Math.round(litHsl.h)}° / ${Math.round(litHsl.l)}% — ${apart}° apart`);
      ui.check(apart <= 6,
        `and in light it is the same HUE (${apart}° apart)`);
      // THE SAME VALUE, NOT MERELY THE SAME HUE (Daniel, 18 Nov 2026, from
      // the rendered app). This asserted the marker was DARKER than the sign,
      // "which is what buys the contrast" — true of #9e6c19, which shipped
      // for about an hour and read as a different, duller gold beside the
      // script. Daniel compared them on screen and chose the script's own
      // colour, so the claim is now the stronger one.
      //
      // THE CONTRAST COST IS DELIBERATE and recorded here so a future reader
      // does not "fix" it: #E0A23C is 1.65:1 on light --bg-panel, under the
      // 3:1 WCAG asks of a non-text marker. The decision was made with that
      // number in hand.
      ui.check(light.amber.toLowerCase() === hex(light.lit).toLowerCase(),
        `in light the active marker IS the script's colour too (${light.amber}`
        + ` vs ${hex(light.lit)})`);
    }
    // AND THE RAMP, BOTH THEMES, with what it replaced. The first amber pass
    // left --logo-off in the green family and this is where that showed:
    // dark was ~98° from the lit colour, so the filament rotated green to
    // amber on the way up. Light was already within a few degrees, which is
    // why its new value moved least.
    ui.note(`  --logo-off: ${dark.off} dark / ${light.off} light`);
    ui.note('  was #3a4a3e dark (~135°, about 98° from the lit amber — a hue'
      + ' rotation) and #b3a994 light (~41°, already within a few degrees).');
  }

  // Leave the window as it was found.
  document.documentElement.removeAttribute('data-theme');
  await ui.sleep(200);
})()
