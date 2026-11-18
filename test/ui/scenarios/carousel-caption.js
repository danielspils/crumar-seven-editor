// @env SEVEN_NO_DEVICE=1
//
// THE CAPTION AND THE CHEVRONS MUST NOT TOUCH THE INSTRUMENT.
//
// Daniel reported the caption drawn ACROSS the vibraphone, in three lines.
// Two separate faults with one symptom, and the brief asks which is which
// before anything is changed — so this measures first and the numbers are
// the deliverable.
//
// THE PAINTED BOUNDS, NOT THE ELEMENT BOX. The drawings are fitted with
// `object-fit: contain`, so an <img> element's rect is the BOX it was given
// and the ink inside it is letterboxed within that — usually smaller, and
// centred. Comparing the caption against the element's rect would report an
// overlap that the eye never sees, or miss one it does. The contained rect
// is computed from naturalWidth/naturalHeight the way the browser computes
// it, and that is what gets compared.
//
// IF `object-fit` IS NOT IN FORCE the computation says so rather than
// quietly assuming: a later `height: auto` on the same element makes the
// image size itself from its own aspect ratio and OVERFLOW the box, which
// is a different fault with the same appearance.
(async () => {
  const px = (n) => Math.round(n * 10) / 10;
  const box = (el) => (el ? el.getBoundingClientRect() : null);

  // WHERE THE INK ACTUALLY IS inside a fitted image.
  const paintedRect = (img) => {
    const b = box(img);
    if (!b || !b.width || !b.height) return null;
    const fit = getComputedStyle(img).objectFit;
    const nw = img.naturalWidth || 0;
    const nh = img.naturalHeight || 0;
    if (fit !== 'contain' || !nw || !nh) {
      // Not letterboxed: the element's own box IS the ink's box.
      return { ...b, fitted: false, fit };
    }
    const scale = Math.min(b.width / nw, b.height / nh);
    const w = nw * scale;
    const h = nh * scale;
    return {
      left: b.left + (b.width - w) / 2,
      right: b.left + (b.width + w) / 2,
      top: b.top + (b.height - h) / 2,
      bottom: b.top + (b.height + h) / 2,
      width: w,
      height: h,
      fitted: true,
      fit,
    };
  };

  const overlap = (a, b) => {
    if (!a || !b) return null;
    const x = Math.min(a.right, b.right) - Math.max(a.left, b.left);
    const y = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
    return (x > 0.5 && y > 0.5) ? { x: px(x), y: px(y) } : null;
  };

  await ui.selectTab('patches');
  await ui.sleep(800);
  const row = ui.$('#library .lib-row.lib-patch');
  if (!row) { ui.check(false, 'a patch to select'); return; }
  ui.click(row, 'a patch');
  await ui.sleep(1400);

  // THE CAPTION ONLY EXISTS ONCE THE FRONT CARD DIFFERS, so the stack has to
  // be stepped before there is anything to measure. That is also the state
  // the screenshot was taken in.
  const step = ui.$('#detail [data-car-step="1"]');
  if (!step) { ui.check(false, 'a chevron to step with'); return; }
  ui.click(step, 'the next chevron');
  await ui.sleep(1100);

  const look = async (label) => {
    ui.note('');
    ui.note(`################  ${label}  ################`);
    const car = ui.$('#detail [data-carousel]');
    const front = ui.$('#detail .car-face.is-front');
    const img = front ? front.querySelector('img, svg') : null;
    const cap = ui.$('#detail .car-count');
    const steps = ui.$$('#detail [data-car-step]');
    if (!car || !front) { ui.note('  no stack on screen'); return null; }

    const cb = box(car);
    const fb = box(front);
    const ink = img ? paintedRect(img) : null;
    ui.note(`  the carousel box   y ${px(cb.top)}..${px(cb.bottom)} (${px(cb.height)} tall)`
      + ` x ${px(cb.left)}..${px(cb.right)}`);
    ui.note(`  the front card     y ${px(fb.top)}..${px(fb.bottom)} (${px(fb.height)})`);
    if (img) {
      const ib = box(img);
      ui.note(`  the <img> element  y ${px(ib.top)}..${px(ib.bottom)} (${px(ib.height)})`
        + ` · object-fit ${getComputedStyle(img).objectFit}`
        + ` · height ${getComputedStyle(img).height}`
        + ` · natural ${img.naturalWidth || '?'}x${img.naturalHeight || '?'}`);
      // THE CAUSE, stated from the numbers rather than from the stylesheet.
      if (ib.height > cb.height + 1) {
        ui.note(`  >> THE ART OVERFLOWS ITS BOX by ${px(ib.height - cb.height)}px:`
          + ' the stack\'s box is SHORTER than the art inside it.');
      } else {
        ui.note('  >> the art is inside its box; any overlap is the caption\'s'
          + ' own position, not the box being short.');
      }
    }
    if (ink) {
      ui.note(`  the PAINTED ink    y ${px(ink.top)}..${px(ink.bottom)} (${px(ink.height)})`
        + ` x ${px(ink.left)}..${px(ink.right)}`
        + (ink.fitted ? '  (letterboxed by object-fit: contain)'
          : `  (not letterboxed — object-fit ${ink.fit})`));
    }
    if (cap) {
      const pb = box(cap);
      const cs = getComputedStyle(cap);
      ui.note(`  the caption        y ${px(pb.top)}..${px(pb.bottom)} (${px(pb.height)})`
        + ` x ${px(pb.left)}..${px(pb.right)} (${px(pb.width)} wide)`);
      ui.note(`    "${(cap.textContent || '').trim()}"`
        + ` · position ${cs.position} · white-space ${cs.whiteSpace}`);
      // ONE LINE. Three is what was reported; the width it is given is the
      // reason, and the check is on the rendered height rather than on the
      // width it was given.
      const lh = parseFloat(cs.lineHeight) || 14;
      const lines = Math.round(pb.height / lh);
      ui.note(`    line-height ${cs.lineHeight} -> about ${lines} line(s)`);
      ui.check(lines <= 1, `the caption is ONE line (${lines}, ${px(pb.height)}px tall)`);
      // NOTHING TRUNCATES at the panel's width. If it does, that is to be
      // reported rather than worked around by shortening the count.
      const cut = cap.scrollWidth > cap.clientWidth + 1;
      ui.note(`    wants ${cap.scrollWidth}px, has ${cap.clientWidth}px`
        + (cut ? '  <- TRUNCATING' : ''));
      ui.check(!cut,
        `nothing truncates at this width (wants ${cap.scrollWidth}, has ${cap.clientWidth})`);
      ui.check(/ of /.test(cap.textContent || ''), 'it still says "of"');

      // THE INTERSECTION. This is the bug and the thing to prove gone.
      const hit = overlap(pb, ink);
      ui.note(`    against the art: ${hit ? `OVERLAPS by ${hit.x}x${hit.y}px` : 'clear'}`);
      ui.check(!hit,
        hit ? `the caption is drawn across the instrument (${hit.x}x${hit.y}px)`
          : 'the caption does not touch the instrument');
    } else {
      ui.check(false, 'there is a caption to measure — the stack was stepped');
    }

    // THE CHEVRONS, same question.
    ui.note(`  chevrons: ${steps.length}`);
    for (const s of steps) {
      const sb = box(s);
      const hit = overlap(sb, ink);
      ui.note(`    ${s.className.replace('car-step ', '')}`
        + ` x ${px(sb.left)}..${px(sb.right)} · ${hit ? `OVERLAPS ${hit.x}x${hit.y}` : 'clear of the art'}`
        + ` · opacity ${getComputedStyle(s).opacity}`);
      ui.check(!hit,
        hit ? `a chevron sits over the instrument (${hit.x}x${hit.y}px)`
          : 'the chevron is clear of the instrument');
    }
    return { cap: cap ? box(cap) : null, ink };
  };

  await look('DEFAULT WIDTH');

  // ---- THE LONGEST PAIR IN THE SCHEMA, FORCED --------------------------
  //
  // THE OFFLINE LIST IS NOT THE WORST CASE. Daniel's screenshot was taken
  // on a connected instrument with expansions installed, where the names
  // are longer than this build's schema offers — "Sampled Vibraphone · 16
  // of 24" against the "Vibraphone · 7 of 24" available here. A scenario
  // that only measures what happens to be on screen would report the bug
  // absent and be right about nothing.
  //
  // So the caption's text is replaced with the longest pair the schema can
  // produce and the same measurements are taken. Nothing else is touched:
  // this is the real element, the real rules, and the real width.
  const LONGEST = 'Venice Upright U1 Felt · 18 of 24';
  const capEl = ui.$('#detail .car-count');
  if (capEl) {
    const was = capEl.innerHTML;
    capEl.textContent = LONGEST;
    await ui.sleep(320);
    ui.note('');
    ui.note(`################  FORCED: "${LONGEST}"  ################`);
    const cs = getComputedStyle(capEl);
    const pb = box(capEl);
    const front = ui.$('#detail .car-face.is-front');
    const img = front ? front.querySelector('img, svg') : null;
    const ink = img ? paintedRect(img) : null;
    const lh = parseFloat(cs.lineHeight) || 14;
    const lines = Math.round(pb.height / lh);
    ui.note(`  caption y ${px(pb.top)}..${px(pb.bottom)} (${px(pb.height)})`
      + ` x ${px(pb.left)}..${px(pb.right)} (${px(pb.width)} wide)`);
    ui.note(`  white-space ${cs.whiteSpace} · about ${lines} line(s)`
      + ` · wants ${capEl.scrollWidth}px in ${capEl.clientWidth}px`);
    const hit = overlap(pb, ink);
    ui.note(`  against the art: ${hit ? `OVERLAPS ${hit.x}x${hit.y}px` : 'clear'}`);
    ui.check(lines <= 1, `the longest pair is ONE line (${lines})`);
    ui.check(!hit, hit
      ? `the longest pair is drawn across the instrument (${hit.x}x${hit.y}px)`
      : 'and does not touch the instrument');
    ui.check(capEl.scrollWidth <= capEl.clientWidth + 1,
      `and does not truncate (wants ${capEl.scrollWidth}, has ${capEl.clientWidth})`);
    // AND IT STAYS INSIDE THE PANEL. A nowrap caption centred on the stack
    // grows both ways; the stack is not the panel's centre, so the right
    // side runs out first.
    const col = box(ui.$('#detail .engine-head-text'));
    if (col) {
      ui.note(`  the panel column x ${px(col.left)}..${px(col.right)}`);
      ui.check(pb.left >= col.left - 0.5 && pb.right <= col.right + 0.5,
        `it stays inside the panel (${px(pb.left)}..${px(pb.right)}`
        + ` in ${px(col.left)}..${px(col.right)})`);
    }
    capEl.innerHTML = was;
    await ui.sleep(220);
  }

  // THE DETAIL PANE, NOT THE LIBRARY ONE.
  //
  // This narrowed #library and then measured the caption and the art, both of
  // which live in #detail — so it made the pane under test WIDER and reported
  // "PANE SQUEEZED TO 360px" above numbers identical to the default block.
  // The caption overlap this scenario exists to catch is a NARROW-pane
  // failure, so the block was covering the one direction that cannot produce
  // it. ui.squeeze proves the width moved; see its comment in harness.js.
  const restore = await ui.squeeze(ui.$('#detail'), 360, { what: 'the detail pane' });
  await look('THE DETAIL PANE SQUEEZED TO 360px');
  await restore();
})()
