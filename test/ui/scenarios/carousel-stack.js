// @env SEVEN_NO_DEVICE=1
//
// THE STACK DRAWS INSIDE ITS OWN CELL. Daniel's brief: "Measure that the
// stack's painted bounds stay inside .engine-stage at both pane widths, and
// that no control beside it is covered. That test is the point of the
// change."
//
// IT IS THE POINT BECAUSE IT IS THE CLAIM THE DELETIONS REST ON. The wheel
// drew its neighbours OUTSIDE the stage, and everything removed with it —
// the clearance bar swept per window width, the document-level pointermove
// test, the media query that hid the peeks below 1031px and took the only
// way of turning the wheel with them — existed to manage faces that escaped.
// If the stack escapes too, those deletions were wrong and the bugs come
// back by another route.
//
// THE PAINTED BOUNDS, NOT THE LAYOUT BOX. Every card is `width: 100%` of the
// cell and then TRANSFORMED — translated off-centre and scaled down — so its
// layout box says nothing about where it is drawn. getBoundingClientRect()
// reports the transformed box, which is the one the eye sees, and that is
// what is compared.
//
// IT RUNS OFFLINE SINCE 18 Nov 2026, and the reason is worth knowing.
// Until that day the carousel required a connection — `view.canPickSound &&
// view.connected` — so this scenario could not run at all without a Seven,
// and reported "no carousel on screen" rather than measuring anything.
// Daniel's change: the stack renders offline too, as a BROWSER rather than a
// control. The geometry is the same geometry either way, so the measurement
// below is now reachable on every desk.
//
// WHAT IS DIFFERENT OFFLINE IS CHECKED AT THE END, separately: the cards
// wear the unverified fade, Select is not offered, and the heading does not
// rename itself as the stack turns. Those are the offline rules, and they
// matter more than the geometry — a control that appears to act and silently
// does nothing is worse than one that is absent.
//
// ---- THE FIVE SCENARIOS THIS ONE REPLACES ------------------------------
//
// Deleted 18 Nov 2026, each of them a guard on machinery that no longer
// exists. Listed because a deleted file cannot be told from one that was
// never written, and somebody will ask what covered this before:
//
//   carousel-peeks.js        the three things that had to stay true of the
//                            wheel: the hero's centre does not move on wake,
//                            both peeks are REACHABLE (not merely laid out —
//                            getBoundingClientRect reports a box whether or
//                            not a pixel is painted, so it pressed at the
//                            peek's centre and asked what answered), and a
//                            click on Save patch reaches Save patch.
//   carousel-narrow.js       the 1032 band, where the spread dropped to 44%.
//   carousel-no-peek.js      the 1000 band, where no spread worked and the
//                            peeks were hidden entirely.
//   carousel-ceiling.js      a PROBE that swept the spread at a fixed width
//                            to derive the clearance ceiling, after b8f78ee
//                            moved Save patch and left the old threshold
//                            4.99px too generous.
//   modal-blocks-carousel.js that a pointer event over the carousel with a
//                            dialog up did not open it.
//
// THE LAST ONE IS THE ONE WORTH UNDERSTANDING, because its lesson outlives
// its subject. The bug was NOT clicks falling through the backdrop —
// measured, elementFromPoint at the carousel's centre returned the dialog's
// own button, and the backdrop was correct at z-index 60. The bug was that
// the carousel never asked: it decided by comparing clientX/clientY against
// a rect, on `document`, and a coordinate test bound to the document is
// invisible to everything painted over it. z-index and pointer-events
// cannot reach that. The stack has no such test — it has no hover state at
// all — so the property is gone rather than defended.
//
// WHAT THIS FILE KEEPS FROM THEM: the press test. The two checks below that
// ask `document.elementFromPoint` what answers at a control's centre are
// carousel-peeks.js's sharpest idea, applied to every interactive element in
// the pane rather than to Save patch alone.
(async () => {
  const px = (n) => Math.round(n * 10) / 10;
  const box = (el) => (el ? el.getBoundingClientRect() : null);

  await ui.selectTab('patches');
  await ui.sleep(800);
  const row = ui.$('#library .lib-row.lib-patch');
  if (!row) { ui.check(false, 'there is a patch to select'); return; }
  ui.click(row, 'the first patch');
  await ui.sleep(1400);

  const report = async (label) => {
    const stage = ui.$('#detail .engine-stage');
    const car = ui.$('#detail [data-carousel]');
    ui.note('');
    ui.note(`################  ${label}  ################`);
    if (!stage || !car) {
      ui.note('  no carousel on screen — this patch has fewer than two sounds?');
      return null;
    }
    const s = box(stage);
    ui.note(`  .engine-stage  x ${px(s.left)}..${px(s.right)}`
      + ` y ${px(s.top)}..${px(s.bottom)}  (${px(s.width)}x${px(s.height)})`);

    // ---- EVERY CARD, AND WHETHER IT ESCAPES ---------------------------
    const cards = ui.$$('#detail [data-carousel] .car-face');
    ui.note(`  cards: ${cards.length}`);
    ui.note('  WHICH         x range            y range          out by');
    const escapes = [];
    for (const c of cards) {
      const b = box(c);
      const cls = [...c.classList].find((k) => k.startsWith('is-')) || '?';
      const cs = getComputedStyle(c);
      // AN INVISIBLE CARD CANNOT COVER ANYTHING. is-waiting is parked off to
      // the left at opacity 0 on purpose — it is where a backward step comes
      // FROM — so it is measured and reported but not held to the bound.
      const visible = Number(cs.opacity) > 0.01;
      const out = Math.max(
        s.left - b.left, b.right - s.right, s.top - b.top, b.bottom - s.bottom, 0
      );
      ui.note(`    ${cls.padEnd(12)}${String(px(b.left)).padStart(7)}..`
        + `${String(px(b.right)).padEnd(8)}${String(px(b.top)).padStart(7)}..`
        + `${String(px(b.bottom)).padEnd(8)}  ${px(out)}`
        + (visible ? '' : '   (opacity 0 — parked)'));
      if (visible && out > 0.5) escapes.push(`${cls} by ${px(out)}px`);
    }
    ui.check(escapes.length === 0,
      escapes.length ? `${label}: cards painted outside .engine-stage: ${escapes.join(', ')}`
        : `${label}: every visible card stays inside .engine-stage`);

    // ---- AND NOTHING BESIDE IT IS COVERED ------------------------------
    //
    // THE SAME QUESTION THE OLD SCENARIOS ASKED OF THE PEEKS, asked of every
    // interactive thing in the detail pane rather than of Save patch alone.
    // Save patch was the tightest control and the one the ceiling was swept
    // against, but "the tightest one is clear" is not "nothing is covered",
    // and a stack that drew wrong could land anywhere.
    const controls = ui.$$('#detail button, #detail a, #detail input, #detail select')
      .filter((el) => !el.closest('[data-carousel]'))
      .filter((el) => { const b = box(el); return b.width > 0 && b.height > 0; });
    ui.note(`  interactive controls beside the stack: ${controls.length}`);
    const covered = [];
    for (const el of controls) {
      const b = box(el);
      for (const c of cards) {
        if (Number(getComputedStyle(c).opacity) <= 0.01) continue;
        const cb = box(c);
        const overlapX = Math.min(b.right, cb.right) - Math.max(b.left, cb.left);
        const overlapY = Math.min(b.bottom, cb.bottom) - Math.max(b.top, cb.top);
        if (overlapX > 0.5 && overlapY > 0.5) {
          const name = (el.textContent || el.id || el.className || '?').trim().slice(0, 24);
          covered.push(`"${name}" by ${[...c.classList].find((k) => k.startsWith('is-'))}`
            + ` (${px(overlapX)}x${px(overlapY)}px)`);
        }
      }
    }
    ui.check(covered.length === 0,
      covered.length ? `${label}: a card overlaps ${covered.join('; ')}`
        : `${label}: no control beside the stack is covered`);

    // ---- AND NOTHING COULD TAKE A CLICK ANYWAY -------------------------
  //
  // A NOTE ON THE SECOND WIDTH, measured rather than assumed: squeezing
  // #library to 360px moves the LIST (pane-geometry.js shows row 1 going
  // 264.3 -> 300) but leaves .engine-stage at exactly 632..794. The detail
  // column does not follow the library pane's width, so the two passes
  // below measure the same geometry twice. That is reported rather than
  // dressed up as two conditions — the brief asked for both widths, and
  // what both widths actually produce is one answer.
    //
    // BOXES ARE THE WRONG QUESTION ON THEIR OWN. An overlap only matters if
    // the thing on top can take the press, so this asks the browser directly
    // what is at each control's centre — the check that would have caught
    // the wheel's peek-on-Save-patch without any arithmetic.
    const stolen = [];
    for (const el of controls) {
      const b = box(el);
      const cx = b.left + b.width / 2;
      const cy = b.top + b.height / 2;
      if (cx < 0 || cy < 0 || cx > window.innerWidth || cy > window.innerHeight) continue;
      const hit = document.elementFromPoint(cx, cy);
      if (hit && hit.closest('[data-carousel] .car-face')) {
        stolen.push((el.textContent || el.id || '?').trim().slice(0, 24));
      }
    }
    ui.check(stolen.length === 0,
      stolen.length ? `${label}: a card takes the press at the centre of ${stolen.join(', ')}`
        : `${label}: every control answers its own press`);

    return { stage: s, cards: cards.length };
  };

  await report('DEFAULT WIDTH');

  // THE SECOND WIDTH. The pane is what the brief names, and squeezing it is
  // what moves the detail column — the stage's own width follows.
  const pane = ui.$('#library');
  const original = pane ? pane.style.width : '';
  if (pane) {
    pane.style.width = '360px';
    await ui.sleep(600);
    await report('PANE SQUEEZED TO 360px');
    pane.style.width = original;
    await ui.sleep(300);
  }

  // ---- THE CAPTION'S TYPE, WHEN THERE IS ONE ---------------------------
  //
  // ABSENT AT REST SINCE 18 Nov, so this reports rather than asserting its
  // presence — the presence rules are checked where the stack has been
  // turned, further down. What is still worth pinning HERE is the type:
  // whenever it does appear it wears .fresh, the freshness line's own rule.
  ui.note('');
  const count = ui.$('#detail .car-count');
  ui.note(`caption at rest: ${count ? `"${(count.textContent || '').trim()}"` : '(none)'}`);
  if (count) {
    const t = (count.textContent || '').trim();
    const cs = getComputedStyle(count);
    const fresh = ui.$('#bank-asof') || ui.$('#bank1-note');
    ui.note(`counter: "${t}" · ${cs.fontSize}/${cs.fontWeight} · ${cs.letterSpacing}`
      + ` · ${cs.textTransform} · ${cs.color}`);
    ui.check(/^\d+ of \d+$/.test(t), `it reads "n of m" (${t})`);
    // SAME TYPE AS THE FRESHNESS LINE, asked of both rather than compared
    // against copied values: they share the .fresh rule, so this is checking
    // that the class is actually on it.
    if (fresh) {
      const f = getComputedStyle(fresh);
      ui.note(`freshness line: ${f.fontSize}/${f.fontWeight} · ${f.letterSpacing}`
        + ` · ${f.textTransform} · ${f.color}`);
      for (const k of ['fontSize', 'fontWeight', 'letterSpacing', 'textTransform', 'color']) {
        ui.check(cs[k] === f[k], `  ${k}: ${cs[k]} === ${f[k]}`);
      }
    }
    const b = box(count);
    const stage = box(ui.$('#detail .engine-stage'));
    if (stage) {
      ui.note(`counter box y ${px(b.top)}..${px(b.bottom)}`
        + ` against a stage ending at ${px(stage.bottom)}`);
    }
  }

  // ---- THE CHEVRONS ARE THE ONLY HIT TARGETS ----------------------------
  ui.note('');
  const steps = ui.$$('#detail [data-car-step]');
  ui.note(`chevrons: ${steps.length}`);
  ui.check(steps.length === 2, 'both chevrons are present at this width');
  for (const s of steps) {
    const b = box(s);
    const stage = box(ui.$('#detail .engine-stage'));
    const cs = getComputedStyle(s);
    ui.note(`  ${s.className} ${px(b.width)}x${px(b.height)} at x${px(b.left)}`
      + ` · display ${cs.display}`);
    ui.check(cs.display !== 'none', 'it is shown — it is the control now');
    if (stage) {
      ui.check(b.left >= stage.left - 0.5 && b.right <= stage.right + 0.5,
        `and it sits inside the stage (${px(b.left)}..${px(b.right)}`
        + ` in ${px(stage.left)}..${px(stage.right)})`);
    }
    // The press lands on the button itself, not on a card over it.
    const hit = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
    ui.check(!!hit && !!hit.closest('[data-car-step]'),
      `a press at its centre reaches it (hit <${hit ? hit.tagName.toLowerCase() : 'none'}>)`);
  }

  // ---- TURNING WORKS, PICKING DOES NOT ----------------------------------
  //
  // THE OFFLINE CONTRACT, and the half most worth defending. Nothing can be
  // sent with no instrument attached, so no card may read as chosen: no
  // Select, no selection state, no heading renaming itself as though the
  // engine had switched. The chevrons move the stack and that is all.
  ui.note('');
  const connected = !!ui.$('#connection-row.connected');
  ui.note(`connected: ${connected}`);
  const car = ui.$('#detail [data-carousel]');
  const heading = ui.$('#detail .engine-sound');
  const headBefore = heading ? (heading.textContent || '').trim() : null;
  // KEYED ON THE FRONT CARD, NOT ON THE CAPTION. This read the caption
  // first and skipped the whole block when it was absent — which since
  // 18 Nov is the RESTING state, by design, so the turning test silently
  // stopped running and the scenario still went green. A guard on a thing
  // that is sometimes absent is a guard that sometimes deletes the test.
  ui.note(`caption at rest: ${ui.$('#detail .car-count') ? 'present' : '(none)'}`);
  // A CAPTION ONLY WHILE IT IS NEEDED (rule 3): nothing under the stack
  // while the front card IS the loaded sound, because the header already
  // names it and a second copy is noise.
  ui.check(!ui.$('#detail .car-count'),
    'at rest there is no caption — the header already names the sound');
  const frontBefore = (ui.$('#detail .is-front') || {}).dataset;
  const next = ui.$('#detail [data-car-step="1"]');
  if (next && frontBefore) {
    ui.click(next, 'the next chevron');
    await ui.sleep(900);
    const capEl = ui.$('#detail .car-count');
    const after = capEl ? (capEl.textContent || '').trim() : null;
    const frontAfter = (ui.$('#detail .is-front') || {}).dataset;
    ui.note(`caption after a step: ${after === null ? '(none)' : `"${after}"`}`);
    ui.note(`front ${frontBefore ? frontBefore.carName : '?'}`
      + ` -> ${frontAfter ? frontAfter.carName : '?'}`);
    ui.check(!!frontAfter && frontBefore.carName !== frontAfter.carName,
      'a step puts a different instrument in front');
    // THE CAPTION APPEARS AND CARRIES BOTH FACTS — which instrument you are
    // looking at, and how far along the list you have come.
    ui.check(!!after, 'and the caption appears the moment the front card differs');
    if (after && frontAfter) {
      ui.check(after.startsWith(frontAfter.carName), `it names the front card ("${after}")`);
      ui.check(/·\s*\d+ of \d+$/.test(after), `and ends with the count ("${after}")`);
      const dot = ui.$('#detail .car-count-dot');
      ui.check(!!dot, 'the dot is its own span, so it can be dimmer');
      if (dot) {
        ui.note(`  the dot's opacity: ${getComputedStyle(dot).opacity}`);
        ui.check(Number(getComputedStyle(dot).opacity) < 1,
          'and it is dimmer than either side');
      }
    }

    if (!connected) {
      // NOTHING CAN BE PICKED. `moved` is true the moment the stack turns,
      // so without the offline clause the card WOULD become live — and every
      // press would be a refusal. This is the one that matters most.
      //
      // IT ASSERTED `!ui.$('#detail [data-car-select]')` UNTIL 18 NOV 2026 AND
      // COULD NOT FAIL. [data-car-select] was the side-peek wheel's Select
      // button; the depth stack deleted it, so nothing in the app renders that
      // selector in ANY state. The check stayed green by asking after an
      // element that no longer exists anywhere — a deleted test wearing the
      // shape of a passing one, and it reported green through the 18 Nov
      // device pass while covering nothing.
      //
      // SO IT ASKS THE MECHANISM THAT IS ACTUALLY LOAD-BEARING. The card is
      // the control now, and what withholds it offline is one CSS rule:
      //
      //   .engine-carousel.has-moved:not(.is-unverified) .is-front {
      //     pointer-events: auto; cursor: pointer; }
      //
      // Offline the stack carries .is-unverified, the selector does not match,
      // and the card inherits pointer-events: none from .car-face. That is the
      // whole offline guarantee, it is a VALUE rather than an absence, and it
      // goes red the moment someone widens that selector.
      const offFront = ui.$('#detail .car-face.is-front');
      // MEASURED ONLY IF IT IS THERE AND ATTACHED. getComputedStyle on a
      // detached node returns empty strings, and `'' !== 'auto'` would have
      // passed this check on nothing at all — the same false green as the
      // selector it replaces.
      if (ui.check(!!offFront && !!offFront.isConnected,
        'offline: the front card is on screen to be asked about')) {
        const pe = getComputedStyle(offFront).pointerEvents;
        ui.note(`offline: the turned stack's front card has pointer-events: ${pe || 'DETACHED'}`);
        ui.check(pe === 'none',
          `offline: a turned stack's front card takes no clicks (${pe || 'DETACHED'})`);
        ui.check(!ui.$('#detail .car-load'),
          'offline: and no Load chip offers the press');
      }
      // NO SELECTION STATE on any card.
      const chosen = ui.$$('#detail .car-face')
        .filter((c) => /selected|is-chosen|is-live/.test(c.className));
      ui.check(chosen.length === 0,
        `offline: no card reads as chosen (${chosen.length})`);
      // AND THE HEADING DID NOT RENAME ITSELF. Turning must not say the
      // engine became something — `candidate` means "not playing it YET",
      // which is a claim about an instrument that is not there.
      const headAfter = ui.$('#detail .engine-sound');
      const headNow = headAfter ? (headAfter.textContent || '').trim() : null;
      ui.note(`heading "${headBefore}" -> "${headNow}"`);
      ui.check(headNow === headBefore,
        `offline: the heading still names the patch's own sound ("${headNow}")`);
      ui.check(!headAfter || !headAfter.classList.contains('is-candidate'),
        'and nothing is marked as a candidate');
    }
  }

  // ---- BARE AT REST, A STACK ON HOVER -----------------------------------
  //
  // Daniel, 18 Nov 2026: at rest the panel is a picture of the sound you are
  // on, not a control. No cards behind the front one, chevrons at ~22%. On
  // hover the two behind fade and slide into their offsets and the chevrons
  // come up.
  //
  // :hover CANNOT BE SYNTHESISED from the renderer — a dispatched mouseover
  // does not make it match — so the hovered state is produced the way
  // row-hover-geometry.js produces it: by finding the app's OWN hover rules
  // in the CSSOM and applying their declarations inline. That measures the
  // declarations the stylesheet carries, not that the browser matches the
  // selector to a real pointer; the latter is what the click test below
  // covers, since a click does use real hit-testing.
  ui.note('');
  ui.note('=== REST vs HOVER ===');
  // A rounded rect, local to this file. row-hover-geometry.js has one of its
  // own; a scenario is a standalone script and shares nothing.
  const r4 = (el) => {
    const b = box(el);
    return { l: px(b.left), r: px(b.right), t: px(b.top), h: px(b.height) };
  };
  const sheetRules = [];
  for (const sheet of document.styleSheets) {
    let list;
    try { list = sheet.cssRules; } catch { continue; }
    const walk = (set) => {
      for (const r of set) {
        if (r.selectorText) sheetRules.push(r);
        if (r.cssRules && r.cssRules.length) walk(r.cssRules);
      }
    };
    walk(list);
  }
  const hoverCss = (needle) => sheetRules
    .filter((r) => /:hover/.test(r.selectorText) && r.selectorText.includes(needle))
    .map((r) => r.style.cssText).join(';');

  const readState = (label) => {
    const stage = ui.$('#detail .engine-stage');
    const out = { label, cards: {}, steps: [], caption: null, stage: null };
    if (stage) out.stage = r4(stage);
    for (const cls of ['is-front', 'is-next', 'is-after']) {
      const el = ui.$(`#detail .${cls}`);
      if (el) out.cards[cls] = { ...r4(el), op: getComputedStyle(el).opacity };
    }
    for (const s of ui.$$('#detail [data-car-step]')) {
      out.steps.push({ ...r4(s), op: getComputedStyle(s).opacity });
    }
    const cap = ui.$('#detail .car-count');
    out.caption = cap ? { text: (cap.textContent || '').trim(), ...r4(cap) } : null;
    const p = ui.$('#detail .params .param');
    out.firstParam = p ? r4(p).t : null;
    ui.note(`  ${label}`);
    for (const [k, v] of Object.entries(out.cards)) {
      ui.note(`    ${k.padEnd(9)} opacity ${v.op.padEnd(5)} x ${v.l}..${v.r}`);
    }
    ui.note(`    chevrons  opacity ${out.steps.map((s) => s.op).join(', ') || '—'}`);
    ui.note(`    caption   ${out.caption ? `"${out.caption.text}"` : '(none)'}`);
    ui.note(`    first param row y ${out.firstParam}`);
    return out;
  };

  const rest = readState('AT REST');
  // THE CARDS BEHIND ARE NOT DRAWN. opacity 0 is the whole of rule 1 — they
  // keep their boxes so there is somewhere to slide from.
  ui.check(rest.cards['is-next'] && Number(rest.cards['is-next'].op) === 0,
    `at rest the next card is not drawn (opacity ${rest.cards['is-next']
      ? rest.cards['is-next'].op : '—'})`);
  ui.check(rest.cards['is-after'] && Number(rest.cards['is-after'].op) === 0,
    `nor the one after it (opacity ${rest.cards['is-after']
      ? rest.cards['is-after'].op : '—'})`);
  ui.check(rest.steps.length === 2 && rest.steps.every((s) => Math.abs(Number(s.op) - 0.22) < 0.03),
    `and the chevrons rest at about 22% (${rest.steps.map((s) => s.op).join(', ')})`);

  // APPLY THE CAROUSEL'S OWN HOVER DECLARATIONS.
  const carEl = ui.$('#detail [data-carousel]');
  const applied = [];
  for (const cls of ['is-next', 'is-after']) {
    const el = ui.$(`#detail .${cls}`);
    const css = hoverCss(`.${cls}`);
    if (el && css) { applied.push([el, el.getAttribute('style') || '']); el.style.cssText += `;${css}`; }
  }
  for (const s of ui.$$('#detail [data-car-step]')) {
    const css = hoverCss('.car-step');
    if (css) { applied.push([s, s.getAttribute('style') || '']); s.style.cssText += `;${css}`; }
  }
  await ui.sleep(420);
  const hover = readState('HOVERED');
  for (const [el, prev] of applied.reverse()) {
    if (prev) el.setAttribute('style', prev); else el.removeAttribute('style');
  }
  await ui.sleep(320);

  ui.check(hover.cards['is-next'] && Number(hover.cards['is-next'].op) > 0.2,
    `hovered, the next card is drawn (${hover.cards['is-next']
      ? hover.cards['is-next'].op : '—'})`);
  ui.check(hover.cards['is-next'] && hover.cards['is-next'].l !== rest.cards['is-next'].l,
    'and it has slid out of the front card\'s position');

  // ---- ONLY THE CAPTION CHANGES -----------------------------------------
  //
  // THE PARAMETERS MUST NOT MOVE WHILE YOU TURN, which is the measurement
  // Daniel asked for. The stage is a fixed box and the chip sits ON the
  // card, so hovering and turning should both leave everything below alone.
  ui.note('');
  ui.check(rest.firstParam === hover.firstParam,
    `the parameters do not move on hover (${rest.firstParam} / ${hover.firstParam})`);
  if (rest.stage && hover.stage) {
    ui.check(rest.stage.h === hover.stage.h && rest.stage.t === hover.stage.t,
      `nor does the stage (${rest.stage.t}..${rest.stage.t + rest.stage.h}`
      + ` / ${hover.stage.t}..${hover.stage.t + hover.stage.h})`);
  }

  // ---- OFFLINE IT CLAIMS NOTHING ----------------------------------------
  //
  // RE-QUERIED, AND AFTER THE TURN HAS SETTLED. `car` was captured before
  // the step above, and a step re-renders the detail pane — so that node is
  // DETACHED by now. getComputedStyle on a detached element returns empty
  // strings, and `Number('') < 1` is `0 < 1`, which is TRUE: the fade check
  // passed on a node that was not on screen, for a reason that had nothing
  // to do with the fade. The classList check passed legitimately (classes
  // survive detachment), which is what made it look fine.
  //
  // The sleep is past TURN_MS as well, or the classes read back with
  // `is-turning` still on them and the cards are measured mid-flight.
  await ui.sleep(700);
  const live = ui.$('#detail [data-carousel]');
  if (!connected && live) {
    ui.note('');
    const cs = getComputedStyle(live);
    ui.note(`the stack's own opacity: ${cs.opacity} · classes "${live.className}"`);
    ui.check(live.classList.contains('is-unverified'),
      'offline: the stack is marked unverified');
    ui.check(cs.opacity !== '' && Number(cs.opacity) < 1,
      `and faded, as the stale bank rows are (${cs.opacity || 'DETACHED — no value'})`);
    // THE DEPTH SURVIVES THE FADE. The container's opacity multiplies each
    // card's own, so the front must still be clearly ahead of the next —
    // setting the fade per card would flatten all three to one value.
    const frontCard = ui.$('#detail .is-front');
    const nextCard = ui.$('#detail .is-next');
    if (frontCard && nextCard) {
      const fo = Number(getComputedStyle(frontCard).opacity);
      const no = Number(getComputedStyle(nextCard).opacity);
      ui.note(`front card ${fo} · next card ${no} (each before the container's fade)`);
      ui.check(fo > no, `the stack still reads as depth (${fo} > ${no})`);
    }
    // AND THE COUNTER STAYS. It is the only thing telling you where you are
    // offline, now that the heading does not follow the stack.
    // THE CAPTION IS THE COUNTER NOW, and it is conditional. This asserted
    // `^\d+ of \d+$` unconditionally, which was right under the earlier
    // brief ("the counter stays — it is the only thing telling you where
    // you are") and is contradicted by rule 3 of the later one: nothing
    // under the stack while the front card IS the loaded sound.
    //
    // THE OFFLINE CLAIM SURVIVES IN THE FORM THAT STILL MATTERS: once the
    // stack has been turned — which is the state this block is in — the
    // caption is there and carries the count, because offline that is still
    // the only thing saying where you are.
    const c = ui.$('#detail .car-count');
    const txt = c ? (c.textContent || '').trim() : '';
    ui.check(!!c && /\d+ of \d+$/.test(txt),
      `offline: a turned stack still says where you are ("${txt}")`);
  }
})()
