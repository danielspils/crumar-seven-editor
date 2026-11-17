// A PROBE, NOT A GUARD. It measures the setlist slot row and prints it, so
// the choice between "reserve a column for the controls" and "make
// .patch-sound yield on hover" is made from the real geometry rather than
// from reading the stylesheet.
//
// WHAT IS SUSPECTED. `.lib-slot` is `grid-template-columns: 24px 1fr auto
// auto` carrying SIX children, and `.slot-controls` is `position: absolute`
// — so it takes no grid cell at all and only FIVE items are placed. That
// leaves .patch-sound to wrap onto a second row, and the absolutely
// positioned controls to paint over whatever is at the right-hand end.
//
// Measured at several pane widths, because the row wraps and a layout that
// only misbehaves when something is long is the one that reaches a user.
(async () => {
  const px = (n) => Math.round(n * 10) / 10;
  const box = (el) => (el ? el.getBoundingClientRect() : null);

  await ui.selectTab('setlists');
  const ok = await ui.waitFor(() => ui.$$('.lib-setlist-row').length > 0,
    { timeout: 8000, what: 'the setlist list' }).then(() => true).catch(() => false);
  if (!ok) { ui.note('no setlists in this library'); return; }
  // THE FIRST SETLIST IS NOT NECESSARILY THE INTERESTING ONE. The row under
  // test is a MISSING-file slot, and most setlists have none — so walk them
  // until one turns up rather than measuring eight empty rows and reporting
  // "clear".
  const lists = ui.$$('.lib-setlist-row');
  ui.note(`setlists: ${lists.length}`);
  // A FIXED SETTLE, NOT A waitFor ON `.lib-slot`. The previous setlist's rows
  // are still on screen when the next click lands, so a wait for "slots
  // exist" returns instantly and measures the setlist BEFORE this one. That
  // cost a wrong answer once already in fx-chain-hangover.js.
  // OPENING A SETLIST REPLACES THE LIST, so the rows have to be re-queried
  // and the view walked BACK between them. Without the back step, setlists 2
  // and 3 are simply "not on screen" and the walk silently measures only the
  // first one — which is how this probe reported "no setlist with any
  // content" in a library that has missing-file rows in it.
  const goBack = async () => {
    const back = ui.$('.lib-back');
    if (!back) return false;
    ui.click(back, 'back to the setlist list');
    await ui.sleep(600);
    return true;
  };

  let best = null;
  const count = lists.length;
  for (let i = 0; i < count; i += 1) {
    const rows = ui.$$('.lib-setlist-row');
    if (!rows[i]) { ui.note(`  setlist ${i + 1}: not reachable`); continue; }
    ui.click(rows[i], `setlist ${i + 1}`);
    await ui.sleep(700);
    const here = ui.$$('.lib-slot');
    const m = here.filter((s) => s.classList.contains('lib-slot-missing')).length;
    const p = here.filter((s) => s.classList.contains('lib-slot-patch')).length;
    ui.note(`  setlist ${i + 1}: ${p} patch · ${m} missing · ${here.length} slots`);
    if (m > 0) { best = i; break; }
    if (p > 0 && best === null) best = i;   // a populated one, as a fallback
    await goBack();
  }
  if (best === null) { ui.note('no setlist with a patch or a missing file in it'); return; }
  if (!ui.$$('.lib-slot').length) {
    const rows = ui.$$('.lib-setlist-row');
    if (rows[best]) { ui.click(rows[best], `setlist ${best + 1} (the subject)`); }
    await ui.sleep(800);
  }

  const slots = ui.$$('.lib-slot');
  ui.note(`slot rows: ${slots.length}`);
  for (const s of slots.slice(0, 10)) {
    ui.note(`  [${s.className}] "${(s.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 44)}"`);
  }
  const missing = slots.filter((s) => s.classList.contains('lib-slot-missing'));
  const patches = slots.filter((s) => s.classList.contains('lib-slot-patch'));
  const empties = slots.filter((s) => s.classList.contains('lib-slot-empty'));
  ui.note(`  patch ${patches.length} · missing ${missing.length} · empty ${empties.length}`);

  const describe = (row, label) => {
    const r = box(row);
    const cs = getComputedStyle(row);
    ui.note(`${label}: ${px(r.width)}x${px(r.height)} · columns "${cs.gridTemplateColumns}"`);
    for (const child of [...row.children]) {
      const c = box(child);
      const name = String(child.className).split(/\s+/)[0] || child.tagName;
      const ccs = getComputedStyle(child);
      ui.note(`    ${name.padEnd(16)} x${px(c.left)}..${px(c.right)}`
        + ` y${px(c.top)}..${px(c.bottom)} w${px(c.width)}`
        + ` · ${ccs.position}${ccs.position === 'absolute' ? ' (NO GRID CELL)' : ''}`
        + ` · "${(child.textContent || '').trim().slice(0, 28)}"`);
    }
  };

  if (patches[0]) describe(patches[0], 'a PATCH row');
  if (missing[0]) describe(missing[0], 'a MISSING row');
  if (empties[0]) describe(empties[0], 'an EMPTY row');

  // ---- THE OCCLUSION, WHICH IS THE POINT --------------------------------
  //
  // The controls are revealed on hover, and :hover cannot be driven by a
  // synthetic event — so the hover state is forced by setting opacity
  // inline, which is what the rule does. Their POSITION does not depend on
  // being visible, so this measures the real overlap.
  const probe = (row, label) => {
    const controls = row.querySelector('.slot-controls');
    const sound = row.querySelector('.patch-sound');
    const text = row.querySelector('.patch-name, .slot-text');
    if (!controls) { ui.note(`${label}: no controls`); return; }
    controls.style.opacity = '1';
    const cr = box(controls);
    for (const [name, el] of [['patch-sound', sound], ['name/text', text]]) {
      if (!el) continue;
      const r = box(el);
      if (!r.width) { ui.note(`  ${label} ${name}: no box`); continue; }
      const over = !(cr.right <= r.left || cr.left >= r.right
        || cr.bottom <= r.top || cr.top >= r.bottom);
      ui.note(`  ${label}: controls x${px(cr.left)}..${px(cr.right)}`
        + ` vs ${name} x${px(r.left)}..${px(r.right)}`
        + ` — ${over ? 'OVERLAP' : 'clear'}`);
      if (over) {
        // What a press at the TEXT's own middle actually hits.
        const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        ui.note(`    a point in the middle of ${name} hits`
          + ` <${hit ? hit.tagName.toLowerCase() : 'nothing'}`
          + ` class="${hit ? hit.className : ''}">`);
      }
    }
    controls.style.opacity = '';
  };

  if (patches[0]) probe(patches[0], 'PATCH');
  if (missing[0]) probe(missing[0], 'MISSING');

  // ---- AND THE MISSING ROW'S TEXT ---------------------------------------
  if (missing[0]) {
    const t = missing[0].querySelector('.slot-text');
    const tag = missing[0].querySelector('.sound-tag');
    ui.note(`MISSING row text:  "${t ? t.textContent : ''}"`);
    ui.note(`  row title:       "${missing[0].getAttribute('title') || ''}"`);
    ui.note(`  sound tag:       "${tag ? tag.textContent : '(none)'}"`
      + ` title="${tag ? tag.getAttribute('title') : ''}"`);
  }

  // ---- AT A FEW PANE WIDTHS ---------------------------------------------
  //
  // The window cannot be resized from here, but the LIST pane can: squeezing
  // it is what a narrower window would do to this row, and unlike a media
  // query there is none involved, so the squeeze is faithful.
  const subject = missing[0] || patches[0] || slots[0];
  if (!subject) { ui.note('no slot row to squeeze'); return; }
  const pane = ui.$('#library') || subject.closest('.lib-list') || subject.parentElement;
  const original = pane.style.width;
  for (const w of [640, 520, 420, 340]) {
    pane.style.width = `${w}px`;
    await ui.sleep(120);
    const row = ui.$$('.lib-slot').find((s) => s.className === subject.className) || subject;
    const r = box(row);
    const controls = row.querySelector('.slot-controls');
    const sound = row.querySelector('.patch-sound');
    if (!controls) { ui.note(`pane ${w}px → no controls on this row`); continue; }
    const cr = box(controls);
    const sr = sound ? box(sound) : { width: 0, left: 0, right: 0, top: 0, bottom: 0 };
    const over = sr.width > 0 && !(cr.right <= sr.left || cr.left >= sr.right
      || cr.bottom <= sr.top || cr.top >= sr.bottom);
    ui.note(`pane ${w}px → row ${px(r.width)}x${px(r.height)}`
      + ` · controls x${px(cr.left)}..${px(cr.right)} w${px(cr.width)}`
      + ` · patch-sound w${px(sr.width)}`
      + ` · ${over ? 'OVERLAP' : 'clear'}`);
  }
  // ---- THE ASSERTIONS ---------------------------------------------------
  //
  // The same shape engine-column-narrow.js uses: elementFromPoint over the
  // controls and over the row's own content, counting what it skipped so an
  // off-screen run cannot pass by testing nothing.
  const vh = document.documentElement.clientHeight;
  const onScreen = (r) => r.top >= 0 && r.bottom <= vh && r.left >= 0 && r.right <= vw0;
  const vw0 = document.documentElement.clientWidth;
  const rows = ui.$$('.lib-slot');
  let checked = 0;
  let skipped = 0;
  const blocked = [];
  for (const row of rows) {
    const controls = row.querySelector('.slot-controls');
    if (controls) controls.style.opacity = '1';
    for (const sel of ['.patch-name', '.slot-text', '.patch-sound', '.lib-origin']) {
      const el = row.querySelector(sel);
      if (!el) continue;
      const r = box(el);
      if (!r.width || !r.height) continue;
      if (!onScreen(r)) { skipped += 1; continue; }
      checked += 1;
      for (const frac of [0.25, 0.5, 0.75]) {
        const hit = document.elementFromPoint(r.left + r.width * frac, r.top + r.height / 2);
        const reaches = !!hit && (hit === el || el.contains(hit) || hit.contains(el));
        if (!reaches) {
          blocked.push(`${sel} at ${Math.round(frac * 100)}% is covered by`
            + ` <${hit ? hit.tagName.toLowerCase() : 'nothing'}`
            + ` class="${hit ? hit.className : ''}">`);
        }
      }
    }
    if (controls) controls.style.opacity = '';
  }
  ui.note(`content spans tested: ${checked} (${skipped} scrolled out of view)`);
  ui.check(checked > 0, 'there was row content in view to test');
  for (const line of blocked) ui.note(`  ${line}`);
  ui.check(blocked.length === 0,
    `the revealed controls cover no row content`
    + (blocked.length ? ` — ${blocked.length} covered: ${blocked[0]}` : ''));

  // ---- THE MISSING ROW SAYS IT ONCE -------------------------------------
  const miss = ui.$('.lib-slot-missing');
  if (miss) {
    const t = miss.querySelector('.slot-text');
    const shown = (t ? t.textContent : '').trim();
    const title = miss.getAttribute('title') || '';
    ui.note(`shown: "${shown}"`);
    ui.note(`title: "${title}"`);
    ui.check(!/\.sevenlib\.json/.test(shown),
      `the extension is not in the displayed text ("${shown}")`);
    ui.check(/\.sevenlib\.json/.test(title),
      `but the full filename is on the row's title ("${title}")`);
    ui.check(!miss.querySelector('.sound-tag'),
      'and the (missing) badge is gone — the row says it once');

    // MIDDLE TRUNCATION, EXERCISED. At these widths the text fits, so the
    // mechanism is never tested by simply looking at it. Squeeze until the
    // head has to clip and check the TAIL survives: end-truncation would
    // render shapes-clav-3-2 and shapes-clav-4-2 identically, which is the
    // whole reason this is not `text-overflow` alone.
    const head = miss.querySelector('.tm-head');
    const tail = miss.querySelector('.tm-tail');
    if (head && tail) {
      pane.style.width = '250px';
      await ui.sleep(200);
      const hr = box(head);
      const tr = box(tail);
      const sr = box(miss.querySelector('.slot-text'));
      ui.note(`squeezed: head w${px(hr.width)} (scroll ${head.scrollWidth}),`
        + ` tail w${px(tr.width)} x${px(tr.left)}..${px(tr.right)},`
        + ` text box ends ${px(sr.right)}`);
      ui.check(head.scrollWidth > hr.width + 1,
        `the head is clipped when there is not room (${head.scrollWidth} into ${px(hr.width)})`);
      ui.check(tr.width > 0 && tr.right <= sr.right + 1,
        `and the TAIL is still drawn — "${tail.textContent}" — so two files`
        + ' sharing a prefix stay distinguishable');
      pane.style.width = original;
      await ui.sleep(150);
    }
  }

  pane.style.width = original;
  await ui.sleep(150);
})()
