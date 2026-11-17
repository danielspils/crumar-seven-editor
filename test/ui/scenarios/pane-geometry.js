// @env SEVEN_NO_DEVICE=1
//
// THE LEFT PANE, MEASURED: one header height, one gutter, one row rhythm.
//
// It is ONE PANE, so switching tabs should change the ROWS and nothing else.
// Item 9 is that vertically — row 1 at the same y on all four tabs — and
// item 1 is that horizontally, every row type on --list-gutter.
//
// This reports rather than asserts, except that it looked at anything. The
// numbers are the deliverable: a table of every row type at two pane widths,
// plus row 1's y on each tab, which is the one number item 9 turns on.
//
// OFFLINE, because the Seven tab's rows render from the library either way
// and an instrument would only add a connect wait.
(async () => {
  const px = (n) => Math.round(n * 10) / 10;
  const box = (el) => (el ? el.getBoundingClientRect() : null);
  const left = (el) => (el ? px(box(el).left) : null);

  // The band above the rows on each tab, whatever builds it. Measured from
  // the pane's own top to the first row, so it does not depend on knowing
  // which element each tab uses.
  const TABS = ['seven', 'patches', 'setlists', 'backups'];
  const ROW_SELECTOR = '#patch-list .patch-row, #library .lib-row, #library .lib-slot';

  const snapshot = async (label) => {
    ui.note(`=== ${label} · viewport ${document.documentElement.clientWidth}px ===`);
    const out = {};
    for (const tab of TABS) {
      await ui.selectTab(tab);
      await ui.sleep(700);
      const pane = ui.$('#library') || ui.$('#left-pane');
      // THE FIRST VISIBLE ROW, not the first in the DOM. The Seven tab's
      // #patch-list stays in the document on every tab, so a plain query
      // returned ITS first row on Patches, Setlists and Backups — a detached
      // -looking box of 0x0 at y 0, which read as "row 1 is at the top" on
      // three of the four tabs and made the spread meaningless.
      const first = ui.$$(ROW_SELECTOR).find((r) => {
        const b = r.getBoundingClientRect();
        return b.height > 0 && b.width > 0;
      });
      const paneTop = pane ? px(box(pane).top) : null;
      const rowTop = first ? px(box(first).top) : null;
      const rowH = first ? px(box(first).height) : null;
      const cls = first ? String(first.className).split(/\s+/).slice(0, 2).join(' ') : '(none)';
      // What sits above the rows, named, so a difference can be traced.
      const bandBits = [];
      for (const sel of ['#bank-tabs', '.lib-bar', '.lib-search', '.lib-bar-detail',
        '.lib-setlist-head', '.lib-unknown-sounds']) {
        const el = ui.$(`#library ${sel}`) || ui.$(sel);
        if (el && box(el).height > 0) bandBits.push(`${sel} ${px(box(el).height)}`);
      }
      out[tab] = { paneTop, rowTop, rowH, cls, band: rowTop != null && paneTop != null
        ? px(rowTop - paneTop) : null };
      ui.note(`${tab.padEnd(9)} row1 y ${String(rowTop).padStart(7)}`
        + ` · band ${String(out[tab].band).padStart(6)}`
        + ` · row h ${String(rowH).padStart(5)}`
        + ` · ${cls}`);
      ui.note(`          above the rows: ${bandBits.join(' | ') || '(nothing)'}`);
    }
    const ys = TABS.map((t) => out[t].rowTop).filter((v) => v != null);
    const spread = ys.length ? px(Math.max(...ys) - Math.min(...ys)) : null;
    ui.note(`ROW 1 y SPREAD ACROSS THE FOUR TABS: ${spread}px`);
    return out;
  };

  const wide = await snapshot('DEFAULT WIDTH');

  // ---- EVERY ROW TYPE'S LEFT INSET AND HEIGHT ---------------------------
  //
  // The gutter is about the INK, not the row box: every row spans the pane,
  // so its box is always 0. What a reader sees as the left edge is the first
  // painted thing inside it.
  const rowTypes = async () => {
    const seen = [];
    // THE INK, not the box. A row spans the pane, so its own left is always
    // the pane's. Where a row has a first painted CHILD (a number, a name)
    // that child is the edge; where it is bare text — a group heading, the
    // footer button, an empty state — a Range over its contents is, because
    // an element's rect starts at its border and the text starts after the
    // padding, which is the number the gutter is about.
    const inkLeft = (row, inkSel) => {
      const child = inkSel ? row.querySelector(inkSel) : null;
      if (child) return left(child);
      const range = document.createRange();
      range.selectNodeContents(row);
      const r = range.getBoundingClientRect();
      return r.width || r.height ? px(r.left) : left(row);
    };
    // A SELECTOR THAT MATCHES NOTHING SAYS SO. Two of these were asked for on
    // the strength of a CSS rule existing, and .lib-group-title turned out to
    // render only inside the picker modal — which is a finding, and would have
    // been a silently missing table line.
    const look = (sel, inkSel, where) => {
      if (!ui.$$(sel).some((r) => box(r).width && box(r).height)) {
        seen.push({ type: sel.replace('#library ', ''), where, inset: null,
          padL: null, padR: null, height: null });
        return;
      }
      for (const row of ui.$$(sel)) {
        const r = box(row);
        if (!r.width || !r.height) continue;
        seen.push({
          type: String(row.className).split(/\s+/).filter((c) => !/selected|active/.test(c))
            .slice(0, 2).join(' '),
          where,
          inset: inkLeft(row, inkSel),
          // The rule's own two paddings, so the table can say whether the
          // right edge still reads with the left on the gutter.
          padL: px(parseFloat(getComputedStyle(row).paddingLeft)),
          padR: px(parseFloat(getComputedStyle(row).paddingRight)),
          height: px(r.height),
        });
        break;                       // one of each type is enough
      }
    };
    await ui.selectTab('seven');
    await ui.sleep(600);
    look('#patch-list .patch-row', '.patch-num', 'Seven');
    await ui.selectTab('patches');
    await ui.sleep(600);
    look('#library .lib-row', '.patch-num, .patch-name', 'Patches');
    // NOT A ROW, but it sits IN the list with rows under it, so its left edge
    // is read against theirs and belongs in the same table.
    look('#library .lib-group-title', null, 'Patches group head');
    look('#library .lib-empty', null, 'Patches empty state');
    await ui.selectTab('backups');
    await ui.sleep(700);
    look('#library .lib-row', '.patch-num, .patch-name', 'Backups (runs)');
    const run = ui.$('.lib-setlist[data-backup]');
    if (run) {
      ui.click(run, 'a backup run');
      await ui.sleep(800);
      look('#library .lib-row', '.patch-num, .patch-name', 'Backups (inside)');
      const back = ui.$('.lib-back');
      if (back) { ui.click(back, 'back'); await ui.sleep(500); }
    }
    await ui.selectTab('setlists');
    await ui.sleep(700);
    look('#library .lib-row', '.patch-num, .patch-name', 'Setlists (list)');
    look('#library .lib-setlist-row .lib-setlist', '.patch-num, .patch-name',
      'Setlists (inner btn)');
    look('#library .lib-new-setlist', null, 'Setlists footer');
    const count = ui.$$('.lib-setlist').length;
    for (let i = 0; i < count; i += 1) {
      const btn = ui.$$('.lib-setlist')[i];
      if (!btn) break;
      ui.click(btn, `setlist ${i + 1}`);
      await ui.sleep(650);
      if (ui.$$('.lib-slot').length) { look('#library .lib-slot', '.slot-num', 'Setlist slots'); break; }
      const back = ui.$('.lib-back');
      if (back) { ui.click(back, 'back'); await ui.sleep(500); }
    }
    return seen;
  };

  const table = (types, label) => {
    ui.note('');
    ui.note(`--- ${label} ---`);
    ui.note('ROW TYPE                where                 inset   padL   padR  height');
    for (const t of types) {
      ui.note(`  ${t.type.padEnd(22)}${t.where.padEnd(20)}`
        + `${String(t.inset).padStart(6)}${String(t.padL).padStart(7)}`
        + `${String(t.padR).padStart(7)}${String(t.height).padStart(8)}`);
    }
  };
  const types = await rowTypes();
  table(types, 'DEFAULT WIDTH');

  // ---- AND AT A NARROWER PANE -------------------------------------------
  const pane = ui.$('#library');
  const original = pane ? pane.style.width : '';
  if (pane) { pane.style.width = '360px'; await ui.sleep(400); }
  ui.note('');
  await snapshot('PANE SQUEEZED TO 360px');
  // THE SECOND WIDTH IS THE POINT of measuring twice: a gutter written as a
  // fixed number must not move with the pane, and a gutter that came out of
  // something elastic (a flex cell, a percentage) would.
  if (pane) table(await rowTypes(), 'PANE SQUEEZED TO 360px');
  if (pane) { pane.style.width = original; await ui.sleep(250); }

  ui.check(Object.keys(wide).length === 4, 'all four tabs were measured');
})()
