// @env SEVEN_NO_DEVICE=1
//
// WHAT A ROW LOOKS LIKE UNDER THE POINTER, MEASURED IN BOTH STATES.
//
// Item 3 is one rule for three row types: the description right-justified,
// hidden on hover so the controls take its place, and the row NOT REFLOWING
// between the two states. Only a measurement can say whether that last part
// holds, and it is the part most likely to be wrong — a control appearing in
// a laid-out cell changes the cell's width, and every column after it moves.
//
// :HOVER CANNOT BE SYNTHESISED FROM THE RENDERER. A dispatched mouseover does
// not make :hover match, there is no hover helper in the harness, and
// webContents.sendInputEvent lives in the main process. So the hover state is
// produced by finding the app's OWN hover rules in the CSSOM by selector text
// and applying their declarations inline.
//
// That is a real limitation and it is worth being plain about what it does and
// does not prove. It measures the DECLARATIONS the stylesheet actually carries
// — delete the rule and the lookup finds nothing and this fails — but it does
// not prove the browser matches that selector to a real pointer. A selector
// typo would pass here. The gesture itself is covered by the scenarios that
// click these controls.
//
// It reports rather than asserts, except for the reflow check, which is the
// one thing item 3 promises that a number can settle.
(async () => {
  const px = (n) => Math.round(n * 10) / 10;
  const box = (el) => el.getBoundingClientRect();
  const r4 = (el) => {
    const b = box(el);
    return { l: px(b.left), r: px(b.right), t: px(b.top), w: px(b.width), h: px(b.height) };
  };

  // ---- THE APP'S OWN HOVER RULES, READ RATHER THAN RETYPED ---------------
  const rules = [];
  for (const sheet of document.styleSheets) {
    let list;
    try { list = sheet.cssRules; } catch { continue; }   // a cross-origin sheet
    // SELECTOR FIRST, THEN RECURSE. `if (rule.cssRules) continue` read as
    // "this is a grouping rule" and is no longer true: since CSS Nesting a
    // CSSStyleRule carries its own (usually empty) cssRules, so that branch
    // swallowed EVERY style rule and this read 0 of them.
    const walk = (set) => {
      for (const rule of set) {
        if (rule.selectorText) rules.push(rule);
        if (rule.cssRules && rule.cssRules.length) walk(rule.cssRules);
      }
    };
    walk(list);
  }
  ui.note(`style rules read: ${rules.length}`);

  // Every rule whose selector mentions hover AND the element we are asking
  // about. Applied as inline style, which outranks a stylesheet rule, so the
  // hovered appearance is reproduced from the app's own declarations.
  const hoverDecls = (needle) => {
    const out = [];
    for (const rule of rules) {
      if (!/:hover|:focus-within/.test(rule.selectorText)) continue;
      if (!rule.selectorText.includes(needle)) continue;
      out.push({ sel: rule.selectorText, css: rule.style.cssText });
    }
    return out;
  };

  const applied = [];
  const applyHover = (el, needle) => {
    const decls = hoverDecls(needle);
    for (const d of decls) {
      applied.push({ el, prev: el.getAttribute('style') || '' });
      el.style.cssText = `${el.style.cssText};${d.css}`;
    }
    return decls;
  };
  const undoHover = () => {
    for (const a of applied.reverse()) {
      if (a.prev) a.el.setAttribute('style', a.prev); else a.el.removeAttribute('style');
    }
    applied.length = 0;
  };

  // ---- ONE ROW TYPE, BOTH STATES ----------------------------------------
  //
  // descSel is the DESCRIPTION — the cell item 3 right-justifies and hides.
  // ctrlSel are the controls, which may be siblings of the row (the library
  // rows position them over the right edge) or a cell inside it (a slot row
  // lays them out in column 5). Both shapes are measured the same way.
  const look = async (label, rowSel, descSel, ctrlSel, hoverOn) => {
    const row = ui.$(rowSel);
    if (!row) { ui.note(`${label}: no row on screen — not measured`); return null; }
    const desc = row.querySelector(descSel)
      || (row.parentElement ? row.parentElement.querySelector(descSel) : null);
    const host = hoverOn === 'wrap' ? (row.closest('.lib-row-wrap') || row) : row;
    const ctrls = [...host.querySelectorAll(ctrlSel)];

    const before = {
      row: r4(row),
      desc: desc ? r4(desc) : null,
      align: desc ? getComputedStyle(desc).textAlign : null,
      descOpacity: desc ? getComputedStyle(desc).opacity : null,
      ctrls: ctrls.map(r4),
      name: row.querySelector('.patch-name') ? r4(row.querySelector('.patch-name')) : null,
    };

    // HOVER, from the app's own rules. Both the control's reveal rule and the
    // description's hide rule are looked for; a missing one is reported by
    // name rather than silently leaving the state unchanged.
    // THE NEEDLE COMES FROM EACH CONTROL'S OWN CLASS. Taking it from the
    // first selector in the list applied .patch-send's reveal rule to the
    // delete button too and never looked for .patch-delete's at all, which
    // read as "the delete control has no hover rule".
    const hits = [];
    for (const c of ctrls) {
      const own = [...c.classList].map((k) => `.${k}`)
        .filter((k) => rules.some((r) => /:hover|:focus-within/.test(r.selectorText)
          && r.selectorText.includes(k)));
      for (const needle of (own.length ? own : [ctrlSel.split(',')[0].trim()])) {
        hits.push(...applyHover(c, needle));
      }
    }
    if (desc) hits.push(...applyHover(desc, descSel.split(',')[0].trim()));

    // PAST THE TRANSITION BEFORE READING. opacity is transitioned .12s, and
    // getComputedStyle during a transition returns the IN-FLIGHT value — so
    // measuring immediately after setting the inline style read 1, and the
    // hide looked as though it had not fired at all.
    await ui.sleep(260);
    const after = {
      row: r4(row),
      desc: desc ? r4(desc) : null,
      descOpacity: desc ? getComputedStyle(desc).opacity : null,
      ctrls: ctrls.map(r4),
      name: row.querySelector('.patch-name') ? r4(row.querySelector('.patch-name')) : null,
    };
    undoHover();

    // DOES A CONTROL SIT ON TOP OF THE DESCRIPTION'S TEXT? Boxes, not pixels:
    // an overlap of boxes is what makes a control land on a word.
    const overlaps = before.desc
      ? after.ctrls.filter((c) => c.l < before.desc.r && c.r > before.desc.l).length
      : 0;

    ui.note('');
    ui.note(`=== ${label} ===`);
    ui.note(`  rules found: ${hits.length ? hits.map((h) => h.sel).join('  |  ') : 'NONE'}`);
    ui.note(`  row            h ${String(before.row.h).padStart(6)} -> ${after.row.h}`);
    if (before.desc) {
      ui.note(`  description    x ${before.desc.l}..${before.desc.r}`
        + ` w ${before.desc.w} · text-align ${before.align}`
        + ` · opacity ${before.descOpacity} -> ${after.descOpacity}`);
    } else {
      ui.note('  description    (none found)');
    }
    if (before.name) {
      ui.note(`  name cell      x ${before.name.l}..${before.name.r}`
        + ` -> ${after.name.l}..${after.name.r}`);
    }
    ui.note(`  controls (${ctrls.length})`);
    for (let i = 0; i < ctrls.length; i += 1) {
      ui.note(`    ${i + 1}  x ${before.ctrls[i].l}..${before.ctrls[i].r}`
        + ` w ${before.ctrls[i].w} -> x ${after.ctrls[i].l}..${after.ctrls[i].r}`
        + ` w ${after.ctrls[i].w}`);
    }
    const span = after.ctrls.length
      ? px(Math.max(...after.ctrls.map((c) => c.r)) - Math.min(...after.ctrls.map((c) => c.l)))
      : 0;
    ui.note(`  CONTROL SET SPANS ${span}px hovered`);
    ui.note(`  controls overlapping the description's box: ${overlaps} of ${ctrls.length}`);

    // THE REFLOW CHECK. Nothing to the LEFT of the controls may move between
    // the two states: that is what "the row must not reflow" means, and it is
    // the half a reader notices immediately.
    const moved = [];
    if (before.row.h !== after.row.h) moved.push(`row height ${before.row.h} -> ${after.row.h}`);
    if (before.name && (before.name.l !== after.name.l || before.name.r !== after.name.r)) {
      moved.push(`name cell ${before.name.l}..${before.name.r}`
        + ` -> ${after.name.l}..${after.name.r}`);
    }
    if (before.desc && before.desc.l !== after.desc.l) {
      moved.push(`description left ${before.desc.l} -> ${after.desc.l}`);
    }
    ui.check(moved.length === 0,
      moved.length ? `${label} REFLOWS on hover: ${moved.join('; ')}`
        : `${label} does not reflow on hover`);

    // ---- THE WORST ROW IN THE LIST, not row 1 -------------------------
    //
    // THIS IS THE NUMBER THE FLOOR COMES FROM. The controls are anchored to
    // the row's right edge and do not move with the description, so the row
    // at risk is the one with the SHORTEST sound name: its description's
    // auto-sized column is narrowest, and the control reaches furthest left.
    // Row 1 is not that row, and sizing from row 1 is how the first attempt
    // reserved 138px for a collision that was not happening.
    //
    // Measured per row as the gap between the NAME cell's right edge and the
    // leftmost control's left edge. Negative means a control lands on a name.
    const rowsOf = [...document.querySelectorAll(rowSel)];
    let worst = null;
    for (const r of rowsOf) {
      const b = box(r);
      if (!b.width || !b.height) continue;
      const nm = r.querySelector('.patch-name');
      const d = r.querySelector(descSel);
      const h = hoverOn === 'wrap' ? (r.closest('.lib-row-wrap') || r) : r;
      const cs = [...h.querySelectorAll(ctrlSel)].map(box).filter((c) => c.width);
      if (!nm || !cs.length) continue;
      const gap = px(Math.min(...cs.map((c) => c.left)) - box(nm).right);
      if (!worst || gap < worst.gap) {
        worst = { gap, name: (nm.textContent || '').trim(), desc: d ? px(box(d).width) : null };
      }
    }
    if (worst) {
      ui.note(`  WORST ROW of ${rowsOf.length}: gap name->control ${worst.gap}px`
        + ` · its description ${worst.desc}px · "${worst.name}"`);
    }
    return { before, after, span, overlaps, worst };
  };

  // ---- ALL THREE ROW TYPES, ONCE PER PANE WIDTH -------------------------
  const sweep = async (widthLabel) => {
    ui.note('');
    ui.note(`################  ${widthLabel}  ################`);

    // PATCHES: the widest set, because it is the only type with two controls.
    await ui.selectTab('patches');
    await ui.sleep(700);
    const patches = await look('PATCHES (two controls)', '#library .lib-row.lib-patch',
      '.lib-origin', '.patch-send, .patch-delete', 'wrap');

    // INSIDE A BACKUP RUN: one control, the record being read-only.
    await ui.selectTab('backups');
    await ui.sleep(800);
    const run = ui.$('.lib-setlist[data-backup]');
    let backups = null;
    if (run) {
      ui.click(run, 'the newest backup run');
      await ui.sleep(900);
      backups = await look('BACKUPS, inside a run (one control)', '#library .lib-row.lib-patch',
        '.lib-origin', '.patch-send, .patch-delete', 'wrap');
      const back = ui.$('.lib-back');
      if (back) { ui.click(back, 'back'); await ui.sleep(500); }
    } else {
      ui.note('no backup runs in this library — the run rows were not measured');
    }

    // A SETLIST'S SLOTS: controls in a laid-out cell, not over the row.
    await ui.selectTab('setlists');
    await ui.sleep(700);
    let slots = null;
    const lists = ui.$$('.lib-setlist-row').length;
    for (let i = 0; i < lists; i += 1) {
      const here = ui.$$('.lib-setlist-row')[i];
      if (!here) break;
      ui.click(here, `setlist ${i + 1}`);
      await ui.sleep(700);
      // A FILLED slot, not any slot. The first setlist here is eight empties,
      // and `.lib-slot` matches those — so the loop stopped at a view with no
      // sound name and no patch row to measure, and reported it as "none on
      // screen" when the next setlist had plenty.
      if (ui.$$('.lib-slot-patch').length) {
        // .patch-sound, NOT .lib-origin, and the names are the wrong way round
        // from the library rows: on a slot row .patch-sound is the SOUND on
        // line 1 beside the controls, while .lib-origin is the meta line
        // underneath ("Bank 2 · Preset 4 · 14 Nov"). On a .lib-row it is
        // .lib-origin that holds the sound. Same content, opposite class.
        slots = await look('SETLIST SLOTS', '#library .lib-slot-patch',
          '.patch-sound', '.slot-controls > *', 'row');
        break;
      }
      const back = ui.$('.lib-back');
      if (back) { ui.click(back, 'back'); await ui.sleep(500); }
    }
    if (!slots) ui.note('no setlist with slots on screen — the slot rows were not measured');

    const seen = [['Patches', patches], ['Backups', backups], ['Slots', slots]]
      .filter(([, v]) => v);
    ui.note('');
    ui.note(`CONTROL-SET SPANS: ${seen.map(([k, v]) => `${k} ${v.span}`).join(' · ')}`);

    // THE ONE NUMBER THE FLOOR IS SET FROM, and the assertion it exists for.
    const worsts = seen.filter(([, v]) => v.worst);
    ui.note(`WORST name->control GAP BY TYPE: ${worsts
      .map(([k, v]) => `${k} ${v.worst.gap}`).join(' · ')}`);
    for (const [k, v] of worsts) {
      ui.check(v.worst.gap >= 0,
        `${widthLabel} · ${k}: the hovered controls stay clear of every name`
        + ` (worst gap ${v.worst.gap}px, on "${v.worst.name}")`);
    }
    return seen.length;
  };

  const floor = getComputedStyle(document.documentElement)
    .getPropertyValue('--row-desc-min').trim();
  ui.note(`--row-desc-min is ${floor}`);

  const wide = await sweep('DEFAULT WIDTH');

  // ---- AND SQUEEZED, which is where a floor in px can go wrong ----------
  //
  // A min-width does not shrink. So the pane getting narrower cannot take
  // space from the description any more — it takes it from the NAME, and the
  // question is whether the name still has any. The gap assertions run again
  // at 360px for exactly that reason.
  const pane = ui.$('#library');
  const original = pane ? pane.style.width : '';
  //
  // 250px IS IN THE LIST BECAUSE IT IS THE WIDTH THAT BROKE. The floor was
  // first put on the slot rows too, and at 250px their 1fr name column
  // collapsed to zero — slot-row-measure.js squeezes to exactly that and
  // failed on a middle-truncated name with no tail left to draw. A pass at
  // the default width would never have shown it.
  if (pane) {
    for (const w of ['360px', '250px']) {
      pane.style.width = w;
      await ui.sleep(500);
      await sweep(`PANE SQUEEZED TO ${w}`);
    }
    pane.style.width = original;
    await ui.sleep(250);
  }

  ui.check(wide > 0, 'at least one row type was measured');
})()
