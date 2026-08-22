// @env SEVEN_NO_DEVICE=1
//
// EVERY TEXT STYLE IN THE SOUNDS MODAL MEETS WCAG AA, in both themes.
//
// The reported symptom was one link in default browser blue — 1.67:1 on the
// dark panel. Fixing it exposed that the text UNDER it was no better: .exp-note
// at 2.44:1 dark and 2.78:1 light, and the same for .exp-sub, .exp-id and
// .exp-size, all drawing from --text-dim.
//
// Measured here rather than computed from the stylesheet, because what matters
// is what an element RESOLVES to — token, cascade, theme and all.
//
// AA is 4.5:1 for normal text and 3:1 for large (>=24px, or >=18.66px bold).
// This checks the modal only. The rest of the app has never been audited and
// that audit is deliberately post-launch (CLAUDE.md) — but nothing should be
// able to walk this one surface backwards without the suite saying so.
(async () => {
  const lum = (c) => {
    const [r, g, b] = c.map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const rgb = (s) => (s.match(/\d+(\.\d+)?/g) || []).slice(0, 3).map(Number);
  const ratio = (f, b) => {
    const a = lum(rgb(f)); const c = lum(rgb(b));
    return (Math.max(a, c) + 0.05) / (Math.min(a, c) + 0.05);
  };
  // The nearest ancestor that actually paints something: a transparent element
  // sits on whatever is behind it, and that is what the eye compares against.
  const bgOf = (el) => {
    let n = el;
    while (n && n !== document.documentElement) {
      const c = getComputedStyle(n).backgroundColor;
      if (c && !/rgba\(0, 0, 0, 0\)|transparent/.test(c)) return c;
      n = n.parentElement;
    }
    return getComputedStyle(document.body).backgroundColor;
  };

  const host = document.createElement('div');
  host.innerHTML = '<span class="badge badge-warn">warn</span>';
  document.body.appendChild(host);

  for (const theme of ['dark', 'light']) {
    document.documentElement.dataset.theme = theme;
    await ui.sleep(300);
    ui.click(host.firstElementChild, `open the Sounds modal (${theme})`);
    const opened = await ui.waitFor(() => !!ui.$('.seven-modal.is-expansions'),
      { timeout: 4000, what: `the Sounds modal in ${theme}` });
    ui.check(opened, `the modal opens in ${theme}`);
    if (!opened) return;

    const modal = ui.$('.seven-modal.is-expansions');
    const failures = [];
    let checked = 0;
    for (const el of modal.querySelectorAll('*')) {
      const text = (el.textContent || '').trim();
      if (!text || el.children.length) continue;          // leaf text only
      const cs = getComputedStyle(el);
      if (cs.visibility === 'hidden' || cs.display === 'none') continue;
      const size = parseFloat(cs.fontSize);
      const bold = (parseInt(cs.fontWeight, 10) || 400) >= 700;
      const need = (size >= 24 || (size >= 18.66 && bold)) ? 3 : 4.5;
      const r = ratio(cs.color, bgOf(el));
      checked += 1;
      if (r < need) failures.push(`${(el.className || el.tagName)} ${Math.round(size)}px ${r.toFixed(2)}:1 (needs ${need})`);
    }
    ui.note(`${theme}: ${checked} text nodes checked, ${failures.length} below AA`);
    for (const f of failures) ui.note(`   FAIL ${f}`);
    ui.check(failures.length === 0, `every text style in the Sounds modal meets AA in ${theme}`);

    const close = modal.querySelector('.seven-modal-cancel, .seven-modal-ok');
    if (close) { ui.click(close, 'close'); await ui.sleep(400); }
  }
  host.remove();
  document.documentElement.dataset.theme = 'dark';
})()
