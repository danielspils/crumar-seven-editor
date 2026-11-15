// BOTH PEEK FACES STAY INSIDE THE ENGINE COLUMN, SYMMETRICALLY.
//
// The peeks ARE the control — clicking one brings it to the middle — so a peek
// off the end of the column is a control you cannot reach. Daniel reported it
// as "the right-hand neighbour is off screen and the left one is cut by the
// column edge", and the measurement agreed: the next peek had 28px of its
// 138px inside, 20%.
//
// THE CAUSE WAS NOT THE SPREAD, IT WAS WHERE THE WHEEL SAT. The stage is flush
// against the column's RIGHT edge — the resting design is text left, instrument
// right (fc940cd) — so a symmetric spread around the stage puts one neighbour
// over the meta text, which is allowed, and the other past the column edge,
// which is not. With the hero at scale 1.12 there are only 93.5px between the
// stage's centre and the column edge against a 104.7px half-width, so no spread
// narrow enough to fit on the right is visible at all: it sits behind the hero.
// The wheel has to centre on the COLUMN while it is awake, and then the spread
// has to fit the room that gives it.
//
// WHAT THIS PINS, and why each one is here:
//   - both peeks fully inside the column, at the default width AND at a narrow
//     one. A spread tuned at one width that fails at another is the same bug.
//   - symmetry, measured as the two gaps to the column edges rather than
//     trusted from the CSS being a mirror image.
//   - the centre is NOT shrunk to make room. That was the one fix explicitly
//     ruled out, and it is the cheap way to make everything else pass.
(async () => {
  if (!(await ui.requireDevice())) return { skipped: 'no instrument attached' };
  const px = (n) => Math.round(n * 10) / 10;

  await ui.selectTab('seven');
  await ui.sleep(800);
  const rows = ui.$$('#patch-list .patch-row');
  if (!rows.length) { ui.note('no bank rows on screen'); return; }
  rows[0].dispatchEvent(new MouseEvent('click', { bubbles: true }));
  await ui.sleep(2200);

  // window.resizeTo is ignored in Electron's renderer (CLAUDE.md), so the
  // narrow case is reached by constraining the pane the columns live in —
  // which is what a narrower window does to them.
  const main = ui.$('#main') || document.body;

  const look = async (label, width) => {
    if (width) {
      main.style.width = `${width}px`;
      main.style.maxWidth = `${width}px`;
      await ui.sleep(500);
    }
    const car = ui.$('#detail .engine-carousel');
    if (!car) { ui.check(false, `${label}: there is a carousel on screen`); return; }
    // no-anim so the faces are measured where they land, not mid-transition.
    car.classList.add('is-open', 'no-anim');
    await ui.sleep(320);

    const col = ui.$('#detail .col-engine').getBoundingClientRect();
    const stage = ui.$('#detail .engine-stage').getBoundingClientRect();
    ui.note(`--- ${label} ---`);
    ui.note(`   column x${px(col.left)}..${px(col.right)} w${px(col.width)} · stage w${px(stage.width)}`);

    const faces = {};
    for (const f of ui.$$('#detail .car-face')) {
      const cls = f.className;
      const key = /is-hero/.test(cls) ? 'hero'
        : (/is-peek/.test(cls) && /is-prev/.test(cls)) ? 'prev'
          : (/is-peek/.test(cls) && /is-next/.test(cls)) ? 'next' : null;
      if (!key) continue;
      const r = f.getBoundingClientRect();
      faces[key] = r;
      const inside = r.left >= col.left - 1 && r.right <= col.right + 1;
      const vis = Math.max(0, Math.min(r.right, col.right) - Math.max(r.left, col.left));
      ui.note(`   ${key.padEnd(5)} x${px(r.left)}..${px(r.right)}`
        + `  ${Math.round(vis / r.width * 100)}% in column  ${inside ? 'INSIDE' : 'ESCAPES'}`);
      if (key !== 'hero') {
        ui.check(inside, `${label}: the ${key} peek is fully inside the engine column`);
      }
    }

    if (faces.prev && faces.next) {
      const gapL = faces.prev.left - col.left;
      const gapR = col.right - faces.next.right;
      ui.note(`   gaps: left ${px(gapL)}px · right ${px(gapR)}px`);
      ui.check(Math.abs(gapL - gapR) <= 2,
        `${label}: the two peeks sit symmetrically (${px(gapL)} vs ${px(gapR)})`);
      // AND THEY ARE ACTUALLY VISIBLE, not merely inside. A spread small enough
      // to hide both peeks behind the hero would satisfy every check above.
      const heroR = faces.hero;
      if (heroR) {
        const leftShowing = heroR.left - faces.prev.left;
        const rightShowing = faces.next.right - heroR.right;
        ui.note(`   showing beyond the hero: left ${px(leftShowing)}px · right ${px(rightShowing)}px`);
        ui.check(leftShowing > 20 && rightShowing > 20,
          `${label}: each peek shows a usable amount of itself (${px(leftShowing)} / ${px(rightShowing)})`);
      }
    }

    if (faces.hero) {
      // NOT SHRUNK. scale(1.12) of the stage is what the hero is at rest when
      // open; anything less means the centre paid for the peeks.
      const expected = stage.width * 1.12;
      ui.note(`   hero w${px(faces.hero.width)} · stage*1.12 = ${px(expected)}`);
      ui.check(Math.abs(faces.hero.width - expected) <= 2,
        `${label}: the centre image is full size, not shrunk to make room`);
    }

    car.classList.remove('is-open', 'no-anim');
    await ui.sleep(200);
  };

  await look(`DEFAULT (viewport ${document.documentElement.clientWidth}px)`, null);
  await look('NARROW (#main 980px)', 980);

  main.style.width = '';
  main.style.maxWidth = '';
})()
