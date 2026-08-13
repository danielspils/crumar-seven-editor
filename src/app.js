'use strict';

// App glue: owns UI state (selected bank/patch + view state), injects the panel
// SVG, and asks SevenRenderer for HTML. The ONLY data sources are the sevenAPI
// getters and IPC namespaces — no view code touches a device. The bank region
// derives from the on-disk library's backup patches; nothing renders fixtures.

(function () {
  // Appearance: dark (default) or the antiqued-light theme. Applied before
  // anything renders so there is no flash, and persisted like the other UI
  // state — never patch data.
  const THEME_KEY = 'seven.theme';
  const THEME_FADE_MS = 1050; // a beat longer than the CSS, so nothing is cut off
  let themeFade = null;
  // `fade` only when a person asked for it. On boot the theme must land
  // instantly — fading in from the wrong palette IS the flash we avoid by
  // applying it before anything renders.
  const applyTheme = (name, fade) => {
    const root = document.documentElement;
    const theme = name === 'light' ? 'light' : 'dark';
    if (fade && root.dataset.theme !== theme) {
      // The transition lives on a class rather than on the elements, so it
      // exists only for the moment of the switch and never slows an ordinary
      // hover or re-render.
      root.classList.add('theme-fading');
      clearTimeout(themeFade);
      themeFade = setTimeout(() => root.classList.remove('theme-fading'), THEME_FADE_MS);
    }
    root.dataset.theme = theme;
    localStorage.setItem(THEME_KEY, theme);
    // Keep the divider's switch in step whichever route set the theme.
    for (const b of document.querySelectorAll('[data-theme-set]')) {
      b.setAttribute('aria-pressed', String(b.dataset.themeSet === theme));
    }
  };
  applyTheme(localStorage.getItem(THEME_KEY) || 'dark');
  document.addEventListener('DOMContentLoaded', () =>
    applyTheme(localStorage.getItem(THEME_KEY) || 'dark'));
  document.addEventListener('click', (e) => {
    const pick = e.target.closest('[data-theme-set]');
    if (pick) applyTheme(pick.dataset.themeSet, true);
  });

  // Self-hosted fonts (Archivo for the panel strip, Inter for the UI) — must be
  // registered before any rendering so nothing flashes in a fallback face.
  const fontStyle = document.createElement('style');
  fontStyle.textContent = window.sevenAPI.getFontCss();
  document.head.appendChild(fontStyle);

  // ---- Data -----------------------------------------------------------------
  const schema = window.sevenAPI.getSchema();

  // Sounds the carousel pages through. The CONNECTED unit's own table wherever
  // there is one — a player should page through the instruments their Seven
  // actually has — falling back to the schema's list when nothing is plugged
  // in. Modeled first, then sampled: the same order as the picker's groups, so
  // paging and browsing agree.
  let soundList = [];
  const setSoundList = (table) => {
    const src = (table && table.sounds && table.sounds.length) ? table.sounds : (schema.sounds || []);
    soundList = [...src].sort((a, b) => (a.sampled === b.sampled ? 0 : a.sampled ? 1 : -1));
  };
  setSoundList(null);
  const R = SevenRenderer.createRenderer(schema, SevenDefaults.defaultFor);

  // Banks 1–4 mirror the INSTRUMENT, derived from the latest backup patch per
  // slot (origin bank/preset) — never demo data. The Seven can't be asked
  // what's in its banks (no read-slot opcode), so this view is honest about
  // being "as of the last backup": banksAsOf feeds the region header, and a
  // slot with no backup renders as unknown rather than pretending.
  const emptyBanks = () =>
    Array.from({ length: 4 }, (_, i) => ({ name: String(i + 1), patches: Array(8).fill(null) }));
  let banks = emptyBanks();
  let banksAsOf = null; // newest capture date across the mapped slots

  function rebuildBanks(entries) {
    banks = emptyBanks();
    banksAsOf = null;
    const latest = new Map(); // "bank:preset" -> newest backup entry
    for (const e of entries) {
      if (e.invalid || !e.origin || e.origin.kind !== 'backup') continue;
      const b = e.origin.bank - 1;
      const p = e.origin.preset - 1;
      if (b < 0 || b > 3 || p < 0 || p > 7) continue;
      const k = `${b}:${p}`;
      const prev = latest.get(k);
      if (!prev || String(e.origin.date || '') > String(prev.origin.date || '')) latest.set(k, e);
    }
    for (const [k, e] of latest) {
      const [b, p] = k.split(':').map(Number);
      banks[b].patches[p] = {
        // Backup names embed their slot ("Bank 2 Preset 3 — Reed Piano");
        // inside the bank row that prefix is noise, so strip it — a
        // user-renamed patch shows its rename untouched.
        name: e.name.replace(new RegExp(`^Bank ${b + 1} Preset ${p + 1}\\s*—\\s*`), ''),
        soundName: e.soundName,
        sampled: e.sampled,
        params: e.params,
        file: e.file,
        // Per-slot, not per-region: slots can come from different backup runs,
        // and the row says which one this slot is "as of".
        date: e.origin.date || null,
      };
      if (e.origin.date && (!banksAsOf || e.origin.date > banksAsOf)) banksAsOf = e.origin.date;
    }
  }

  // ---- UI state -------------------------------------------------------------
  // TWO independent selections, held side by side — setlist editing and
  // transfer both need a source and a target selected simultaneously.
  // Selecting in one region never clears the other; `lastTouched` decides
  // which one the detail panel renders.
  let bankIndex = 0; // which bank the list DISPLAYS — navigation, not selection
  let deviceSel = { bank: 0, preset: 0 }; // the Seven boots at preset 1-1
  let lastTouched = 'device'; // 'device' | 'library'

  // Where the sound carousel is parked. null = follow the patch; a number
  // means the user has paged away from it and is browsing.
  let carouselAt = null;
  // The sound the INSTRUMENT says its buffer holds, when that is no longer the
  // one the patch names — after choosing a different instrument in audition
  // mode. The panel must describe what you are hearing, not what the file
  // remembers: the picture, the name, and the engine's own controls all follow
  // the sound, and showing the old one meant editing parameters that belong to
  // an instrument that is no longer playing.
  let liveSound = null;
  // View state only — never written to a patch or the library.
  let showRaw = false;
  let collapsed = {}; // section group -> bool

  // The patch the detail panel renders: whichever region was touched last.
  // libSelected/libToRendererPatch are declared in the library block below;
  // this closure only runs at render time, after the IIFE has initialised.
  const currentPatch = () => {
    if (lastTouched === 'library' && libSelected) return libToRendererPatch(libSelected);
    if (deviceSel) return banks[deviceSel.bank].patches[deviceSel.preset] || null;
    return null;
  };

  // ALL sections start collapsed regardless of switch state — the collapsed
  // header (name, summary, ON/OFF pill) is the resting view for the whole
  // chain. Recomputed whenever the selected patch changes.
  function resetCollapsed() {
    collapsed = {};
    for (const s of R.FX_SECTIONS) collapsed[s.group] = true;
  }

  // Long scrollers fade their bottom edge while there is more below. These two
  // outlive every re-render, so they are watched once.
  window.SevenScrollFade.watch(document.getElementById('detail'));
  window.SevenScrollFade.watch(document.getElementById('sounds-panel'));

  // ---- Undo -----------------------------------------------------------------
  // One stack for the whole app. Each action registers how to put itself back
  // at the moment it happens, which is the only moment the previous state is
  // known for certain. What can't be undone says so rather than pretending
  // (see src/undo.js for the list and why).
  let libData = { patches: [], setlists: [] };
  const undoStack = SevenUndo.createUndoStack();

  // Status messages live in src/toast.js; these are the app's names for them.
  const toast = (text, opts) => SevenToast.show(text, opts);
  const hideToast = () => SevenToast.hide();

  async function runUndo() {
    if (!undoStack.depth) return toast('Nothing to undo');
    try {
      const label = await undoStack.undo();
      toast(`Undid: ${label}`);
    } catch (err) {
      toast(`Couldn’t undo: ${err.message}`);
    }
  }

  // Choosing the sound for ONE preset on the instrument, from the picture in
  // the detail panel. The tiles are the library's own grid — the same artwork
  // and the same order — hosted here because the target is a slot on the
  // Seven rather than a slot in a setlist.
  // The tile grid in a dialog of our own. Sounds come from the CONNECTED
  // unit's table where there is one — ids differ per instrument, so the list a
  // player sees is their instrument's list — and fall back to the schema's
  // when choosing for a file with nothing plugged in.
  async function chooseSound(title, note) {
    const status = await window.sevenAPI.midi.status();
    const live = status.soundTable && status.soundTable.sounds;
    const sounds = (live && live.length) ? live : schema.sounds || [];
    if (!sounds.length) return null;

    const modal = SevenModal.open({
      title,
      bodyHtml:
        `<p class="tx-note tx-fine">${esc(note)}</p>` +
        `<div class="pick-body pick-inline">${SevenLibraryView.renderSoundTiles({ pickSearch: '' }, sounds)}</div>`,
      confirmLabel: 'Cancel',
      cancelLabel: 'Cancel',
      tone: 'is-transfer',
    });
    const name = await new Promise((resolve) => {
      modal.body.addEventListener('click', (e) => {
        const tile = e.target.closest('[data-pick-sound]');
        if (tile) resolve(tile.dataset.pickSound);
      });
      // The dialog's own button is the way out; it resolves nothing.
      modal.action().then(() => resolve(null));
    });
    modal.close();
    if (!name) return null;
    const found = sounds.find((s) => s.name === name);
    return { name, sampled: found ? !!found.sampled : undefined };
  }

  async function pickSoundForSlot(bank, preset) {
    // Bank 1 never reaches here — the picture is not a control on those slots.
    if (!isConnected()) return toast('Connect the Seven to choose a sound for a preset');
    const pickedSound = await chooseSound(
      `Bank ${bank} · Preset ${preset}`,
      'Choosing an instrument sends it to this preset and plays it. Nothing is kept until ' +
      'you hold the button on the Seven.'
    );
    if (!pickedSound) return;
    const chosen = pickedSound.name;

    const started = await window.sevenAPI.transfer.startSlot(bank, preset, `sound:${chosen}`);
    if (!started || !started.started) {
      return SevenModal.confirm({
        title: 'Cannot send that sound',
        body: started && started.error
          ? started.error
          : (started && started.blocked && started.blocked[0] && started.blocked[0].reason) ||
            'That sound could not be sent to this preset.',
        confirmLabel: 'OK',
        tone: 'is-warning',
      });
    }
    transferRunning = true;
    return transferWalk(started.slots, bank);
  }

  // Send ONE patch from the library to one preset. Same walk as a setlist
  // transfer and as the sound picker — the target is chosen here instead of
  // coming from a setlist's position.
  async function sendPatchToSlot(entry) {
    if (!isConnected()) return toast('Connect the Seven to send a patch to it');
    const bank = await SevenModal.choose({
      title: `Send “${entry.name}” to the Seven`,
      body: 'Which bank? Bank 1 is not offered: it holds the factory presets.',
      choices: [{ value: 2, label: 'Bank 2' }, { value: 3, label: 'Bank 3' }, { value: 4, label: 'Bank 4' }],
    });
    if (!bank) return;
    const preset = await SevenModal.choose({
      title: `Bank ${bank} — which preset?`,
      body: 'This preset is replaced, and only once you hold its button on the Seven.',
      choices: Array.from({ length: 8 }, (_, i) => ({ value: i + 1, label: `Preset ${i + 1}` })),
    });
    if (!preset) return;

    const started = await window.sevenAPI.transfer.startSlot(bank, preset, entry.file);
    if (!started || !started.started) {
      return SevenModal.confirm({
        title: 'Cannot send that patch',
        body: (started && started.error) ||
          (started && started.blocked && started.blocked[0] && started.blocked[0].reason) ||
          'That patch could not be sent.',
        confirmLabel: 'OK',
        tone: 'is-warning',
      });
    }
    transferRunning = true;
    return transferWalk(started.slots, bank);
  }

  // Choosing the sound a stored PATCH names. The parameters stay: the Seven
  // keeps engine settings across a sound change (verified on the device), so
  // the file does too. Undoable, like every other library edit.
  async function pickSoundForPatch(file, patchIndex) {
    const chosen = await chooseSound('Choose this patch’s sound',
      'The settings stay as they are — only which instrument the patch names changes.');
    if (!chosen) return;
    const r = await window.sevenAPI.library.saveSound(file, patchIndex, chosen.name, chosen.sampled);
    const was = r && r.previous && r.previous.name;
    if (was) {
      undoStack.push(`sound → ${chosen.name}`, async () => {
        await window.sevenAPI.library.saveSound(file, patchIndex, was, r.previous.sampled);
        await refreshLibrary();
      });
    }
    await refreshLibrary();
    toast(`Sound is now ${chosen.name}`);
  }

  // Selecting a library patch — from a click, or from the arrow keys. One
  // function, because the arrows used to fake a click on the neighbouring row
  // and that raced the list's own re-render: the highlight stopped advancing
  // and the panel showed the patch before last (Daniel, 2026-08-12).
  function selectLibraryEntry(entry, opts = {}) {
    // Independent of the device selection — both stay set, both stay visibly
    // selected; the detail panel follows the last touch.
    libSelected = entry;
    lastTouched = 'library';
    resetCollapsed();
    renderAll();
    // Moving to another patch leaves audition mode, here as in the bank region.
    audition.endSession();
    liveSound = null;
    // Selecting a patch PLAYS it, in the flat list as well as in a setlist.
    // The flat list was treated as a filing cabinet — selecting a row meant
    // "show me this", not "play this" — but that distinction was the app's, not
    // the player's: you click a patch to hear it. preview() collapses rapid
    // selections into one load, so arrowing down a list does not pile up sends.
    audition.preview({ file: entry.file, patchIndex: entry.patchIndex || 0 });
  }

  // Paging the carousel. The index lives here rather than in the renderer,
  // which is a pure view — and it is reset whenever the selection changes, so
  // the carousel goes back to showing what the newly selected patch names.
  const soundIndexOf = (name) => Math.max(0, soundList.findIndex((x) => x.name === name));

  // Paging turns the carousel rather than cutting to the next frame: each face
  // moves one position along — the one you clicked into the middle, the middle
  // one out to its side — and only then does the panel re-render. Without it
  // the pictures simply changed where they stood, which reads as a jump cut
  // rather than a wheel (Daniel, 2026-08-12).
  const TURN_MS = 340;
  const SCAN_MS = 550;         // must match sampled-reveal / sampled-line in index.html
  const LAND_MS = SCAN_MS + 400; // the class outlasts the animation

  // A landing in progress, so it can be picked up again if the panel is
  // re-rendered underneath it. Choosing a sound sends 0x46 and the Seven
  // BROADCASTS the change back; that arrives a moment later, sets liveSound
  // and re-renders — which replaced the element the scan was running on and
  // left the rest of the instrument to simply appear (Daniel, 2026-08-13).
  let sampledLanding = null; // { startedAt, name }

  // A sampled instrument is REVEALED by the scan that crosses it: nothing is
  // there, the line passes, and the instrument exists behind it.
  const SAMPLED_ARRIVAL = 'scan';

  // Where the picture ACTUALLY is inside its box.
  //
  // The art is object-fit: contain, so a wide flat instrument fills the box's
  // width and leaves empty bands above and below, while a tall one fills the
  // height. A scan animated over the BOX therefore spends much of its travel
  // crossing nothing. CSS cannot see a contained image's drawn rect, so it is
  // measured here and handed over as custom properties.
  //
  // Three things this has to get right, and each one broke it once:
  //
  //   LAYOUT PIXELS, NOT SCREEN PIXELS. The hero is transform: scale(1.12)
  //   while the carousel is open, so getBoundingClientRect() returns 143px for
  //   a 128px box. Those numbers then land back in CSS, which applies them
  //   before the transform — a 12% overshoot that made the reveal finish early
  //   and left the last of the instrument to simply appear. offsetWidth /
  //   offsetHeight are layout sizes and ignore transforms.
  //
  //   A DECODED IMAGE. naturalWidth is 0 until the picture is decoded, and a
  //   fresh render can be measured before that happens. Measuring then gives a
  //   fallback span, which is wrong for anything that is not square.
  //
  //   NO SLIVER AT THE END. Sub-pixel rounding can leave a hairline unrevealed,
  //   so the travel finishes a pixel past the bottom edge.
  //
  // Everything is derived from the image's own dimensions, so an instrument
  // added later needs no work here: drop the PNG in, and the scan fits it.
  function measureScanBox(wrap) {
    const img = wrap.querySelector('img');
    if (!img) return false;
    const boxW = img.offsetWidth;
    const boxH = img.offsetHeight;
    const nw = img.naturalWidth;
    const nh = img.naturalHeight;
    if (!nw || !nh || !boxW || !boxH) return false;
    const scale = Math.min(boxW / nw, boxH / nh); // `contain`
    const drawnH = nh * scale;
    const drawnW = nw * scale;
    const set = (k, v) => wrap.style.setProperty(k, v);
    set('--scan-top', `${((boxH - drawnH) / 2).toFixed(2)}px`);
    set('--scan-span', `${(drawnH + 1).toFixed(2)}px`); // +1: no hairline left over
    set('--scan-left', `${((boxW - drawnW) / 2).toFixed(2)}px`);
    set('--scan-w', `${drawnW.toFixed(2)}px`);
    // The instrument's own picture, handed to CSS as a MASK — that is what
    // makes the line follow the silhouette instead of running the full width.
    set('--art-src', `url("${img.src}")`);
    return true;
  }

  // Measure, then start. If the picture has not decoded yet the animation
  // waits for it rather than running against a guess — a few milliseconds
  // later is invisible, a mis-measured scan is not.
  function startSampledArrival(hero, name) {
    const wrap = hero.querySelector('.sound-art.is-sampled');
    const begin = () => {
      if (wrap) {
        sampledLanding = { startedAt: Date.now(), name };
        wrap.style.setProperty('--scan-delay', '0ms');
      }
      hero.classList.add('is-landing', `is-${SAMPLED_ARRIVAL}`);
      setTimeout(() => {
        hero.classList.remove('is-landing', `is-${SAMPLED_ARRIVAL}`);
        sampledLanding = null;
      }, LAND_MS);
    };
    if (!wrap) { begin(); return; }          // modeled: no scan to size
    if (measureScanBox(wrap)) { begin(); return; }
    const img = wrap.querySelector('img');
    if (!img) { begin(); return; }
    const go = () => { measureScanBox(wrap); begin(); };
    if (img.decode) img.decode().then(go, go);
    else img.addEventListener('load', go, { once: true });
  }

  let turning = false;
  // Whether the wheel is open. A STATE rather than a :hover query, because a
  // turn re-renders the faces and fresh nodes are not hovered until the
  // pointer moves — so the carousel shut itself the moment you used it
  // (Daniel, 2026-08-12). It opens when the pointer arrives and closes when it
  // leaves, and it survives everything in between.
  let carouselOpen = false;

  // Opening and staying open are DIFFERENT areas.
  //
  // The wheel used to claim a hit pad 104px to either side, so that a pointer
  // travelling out to a peek did not leave it and shut it. But that pad also
  // reached into the effects column, and coming up past Master Volume or FX1
  // opened the carousel without going near it (Daniel, 2026-08-13).
  //
  // So: it OPENS only when the pointer is over the carousel itself, and it
  // stays open until the pointer leaves a margin around it. Measured against
  // the box rather than hit-tested against an element, because the peeks are
  // drawn outside the box on purpose and an element big enough to cover them
  // is an element big enough to catch passing traffic.
  const OPEN_MARGIN_X = 96; // far enough to reach a peek
  const OPEN_MARGIN_Y = 22;
  let pointerQueued = false;
  document.addEventListener('pointermove', (e) => {
    if (pointerQueued) return;
    pointerQueued = true;
    // One test per frame: this fires on every mouse move.
    requestAnimationFrame(() => {
      pointerQueued = false;
      const car = document.querySelector('[data-carousel]');
      if (!car) { carouselOpen = false; return; }
      const r = car.getBoundingClientRect();
      const x = e.clientX;
      const y = e.clientY;
      const over = x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
      const near = x >= r.left - OPEN_MARGIN_X && x <= r.right + OPEN_MARGIN_X
        && y >= r.top - OPEN_MARGIN_Y && y <= r.bottom + OPEN_MARGIN_Y;
      const want = carouselOpen ? near : over;
      if (want === carouselOpen) return;
      carouselOpen = want;
      car.classList.toggle('is-open', want);
    });
  });
  // Where the wheel is now: liveSound when the instrument is holding something
  // other than what the file names, otherwise the file's own sound. Counting
  // from the FILE swallowed the first turn after a selection — the wheel
  // stepped one place from where it used to be, landing back where it already
  // was (Daniel, 2026-08-12).
  const carouselHome = () => {
    const patch = currentPatch();
    return soundIndexOf((liveSound && liveSound.name) || (patch && patch.soundName));
  };

  // Re-apply an in-flight scan to the freshly rendered face. A NEGATIVE delay
  // is what makes this a continuation rather than a restart: the animation
  // starts already that far through, so the line is where it would have been
  // had nothing interrupted it.
  function resumeSampledArrival() {
    if (!sampledLanding) return;
    const elapsed = Date.now() - sampledLanding.startedAt;
    if (elapsed >= SCAN_MS) { sampledLanding = null; return; }
    const hero = document.querySelector('[data-carousel] .is-hero');
    if (!hero) return;
    // Only if it is still the same instrument — a scan must never be handed
    // to whatever happens to be in the middle now.
    if (hero.dataset.carName !== sampledLanding.name) return;
    const wrap = hero.querySelector('.sound-art.is-sampled');
    if (!wrap || hero.classList.contains('is-landing')) return;
    measureScanBox(wrap);
    wrap.style.setProperty('--scan-delay', `${-elapsed}ms`);
    hero.classList.add('is-landing', `is-${SAMPLED_ARRIVAL}`);
  }

  function turnCarousel(dir) {
    if (turning) return;
    const car = document.querySelector('[data-carousel]');
    const from = carouselAt == null ? carouselHome() : carouselAt;
    if (!car) { carouselAt = from + dir; renderDetail(); return; }
    turning = true;
    // Two classes: one selects the direction, the other doubles the rule's
    // specificity so a pointer resting on the face it just clicked cannot pin
    // it in its hover position while the wheel turns.
    car.classList.add('is-turning', dir > 0 ? 'is-turning-next' : 'is-turning-prev');
    car.classList.add('is-open');
    setTimeout(() => {
      turning = false;
      carouselAt = from + dir;
      renderDetail();
      // The rebuilt faces inherit the open state; without this the wheel
      // vanished under a stationary cursor. They inherit it WITHOUT the waking
      // animation, or every turn would end with the neighbours fading in all
      // over again.
      const fresh = document.querySelector('[data-carousel]');
      if (fresh && carouselOpen) {
        fresh.classList.add('is-open', 'no-anim');
        void fresh.offsetWidth; // settle the open state before animating again
        requestAnimationFrame(() => fresh.classList.remove('no-anim'));
      }
    }, TURN_MS);
  }

  // "Save to Seven?" — the panel hold, explained the way the transfer explains
  // it: the same picture of the panel with the bank LED and the button lit
  // where they will light, and the same short lines under it. The player is
  // looking at the instrument, so "hold THAT one" is a location rather than a
  // sentence (Daniel, 2026-08-13).
  document.addEventListener('click', (e) => {
    if (!e.target.closest('[data-save-to-seven]')) return;
    const bank = deviceSel ? deviceSel.bank + 1 : null;
    const preset = deviceSel ? deviceSel.preset + 1 : null;
    const modal = SevenModal.open({
      title: 'Save a Sound to the Seven',
      bodyHtml:
        // Only draw the panel when we know which button to light. A picture
        // with nothing lit would be decoration, and this one is instructions.
        (bank ? SevenPanelMini.render(bank, preset) : '') +
        '<p class="tx-note">Hold a preset button for 3 seconds.</p>' +
        '<p class="tx-note">The lights will run to confirm the save.</p>' +
        '<p class="tx-note">(the Seven will not save to Bank 1)</p>',
      confirmLabel: 'Got it!',
      cancelLabel: 'Close',
      tone: 'is-transfer',
    });
    // The picture performs the instruction on a loop: the button lights, the
    // hold elapses, the lights run. Stopped when the modal goes, or the timers
    // keep firing at nodes that are no longer on the page.
    const stop = bank ? SevenPanelMini.playSave(modal.body, preset) : null;
    modal.action().then(() => { if (stop) stop(); modal.close(); });
  });

  document.addEventListener('click', (e) => {
    // The Select button under the wheel does what clicking the middle does.
    const sel = e.target.closest('[data-car-select]');
    if (sel) {
      const hero = document.querySelector('[data-carousel] .is-hero');
      if (hero) chosenFromCarousel(hero.dataset.carName);
      return;
    }
    // Clicking a neighbour ADVANCES to it; only the one in the middle is a
    // choice. Reaching past the centre to pick something would make the
    // carousel a row of buttons rather than a wheel you turn.
    const face = e.target.closest('[data-car-name]');
    if (face && face.closest('[data-carousel]')) {
      if (face.classList.contains('is-peek')) {
        turnCarousel(face.classList.contains('is-next') ? 1 : -1);
        return;
      }
      // The hero: this is the choice.
      const carousel = face.closest('[data-carousel]');
      const target = carousel.dataset;
      const name = face.dataset.carName;
      // What the instrument is actually holding — which after a selection is
      // liveSound, not what the patch file still says.
      const patch = currentPatch();
      const loaded = (liveSound && liveSound.name) || (patch && patch.soundName);
      if (name === loaded) return; // already playing this one
      chosenFromCarousel(name);
      return;
    }

    // Clicking away from the wheel puts it back where it was. Turning it is a
    // QUESTION — you spin two places to look at something, decide against it,
    // and there is no cancel button to press; the only exits were choosing
    // one or living with a stranger in the middle. Anywhere else on the page
    // is now the way out, and it rolls back to the instrument that is
    // actually playing rather than the one you were browsing.
    //
    // The pad counts as inside: it is a pseudo-element of the carousel, so a
    // click on the empty space either side of the pictures targets the
    // carousel itself and is not "away" (Daniel, 2026-08-12).
    if (turning) return;
    if (carouselAt === null && !carouselOpen) return;
    if (e.target.closest('[data-carousel]')) return;
    carouselAt = null;
    carouselOpen = false;
    renderDetail();
  });

  // What clicking the centred instrument means depends on what is selected —
  // the same split the picture has always had: a slot on the Seven gets it
  // sent and asks for the hold; a patch on disk has its file rewritten.
  async function chosenFromCarousel(name) {
    // Picking an instrument AUDITIONS it. It never rewrites a file.
    //
    // It used to: with a library patch selected, choosing a sound wrote the new
    // name straight into the patch on disk. That is a reasonable thing to be
    // able to do and a terrible thing to do by accident — five of Daniel's
    // backup records were silently renamed by what he thought was auditioning
    // (2026-08-12). A file is edited by asking to edit it, not by listening.
    if (!isConnected()) return toast('Connect the Seven to try another instrument');
    if (!deviceSel || deviceSel.bank === 0) {
      return toast('Choose a preset in Bank 2, 3 or 4 to try an instrument on it');
    }
    if (!isConnected()) return toast('Connect the Seven to choose a sound for a preset');
    const bank = deviceSel.bank + 1;
    const preset = deviceSel.preset + 1;

    // No walk and no dialog: choosing an instrument drops you into audition
    // mode with it playing. The hold-the-button modal belongs to a TRANSFER,
    // where the app is stepping you through eight presets and needs to know
    // when each one is done. Here you are trying a sound on one preset, and
    // the audition bar already says how to keep it.
    //
    // The runner still does the moving, for one reason: it recalls the target
    // slot before it loads anything. A three-second hold stores to whatever
    // button you press in whatever bank the panel is on, so without that
    // recall the hold could land in a different bank entirely. Started and
    // immediately closed — the walk's UI never appears.
    const started = await window.sevenAPI.transfer.startSlot(bank, preset, `sound:${name}`);
    if (!started || !started.started) {
      return SevenModal.confirm({
        title: 'Cannot send that sound',
        body: (started && started.error) ||
          (started && started.blocked && started.blocked[0] && started.blocked[0].reason) ||
          'That sound could not be sent to this preset.',
        confirmLabel: 'OK',
        tone: 'is-warning',
      });
    }
    const step = await window.sevenAPI.transfer.next(); // recalls the slot, then loads
    await window.sevenAPI.transfer.cancel();            // nothing stored, nothing claimed
    if (!step || step.type === 'transfer-done') return toast('That sound could not be sent');

    carouselAt = null;
    liveSound = soundList.find((x) => x.name === name) || null;
    // Dirty from the moment the instrument differs from what the slot stores —
    // the save instructions belong here, not one parameter edit later.
    const stored = (currentPatch() || {}).soundName;
    // The runner silences the effects chain with the sound; the working copy
    // has to follow, or the panel would show FX the instrument is no longer
    // running. It reports what it sent rather than us keeping a second list.
    audition.beginLive({ dirty: name !== stored, params: step.params });
    renderDetail();
    // Land the choice on the freshly rendered face — the old one is gone.
    const hero = document.querySelector('[data-carousel] .is-hero');
    if (hero) {
      startSampledArrival(hero, name);
    }
  }



  // ---- Arrow keys walk whichever list you last touched --------------------
  // The instrument's own rows recall as you land on them, exactly as clicking
  // does — but a held arrow key repeats, and a recall per repeat would be a
  // burst of Program Changes at the Seven. So the SELECTION moves at once and
  // the recall follows the last one, once you stop.
  let recallTimer = null;
  const RECALL_SETTLE_MS = 320;

  function moveBankSelection(dir) {
    const here = deviceSel && deviceSel.bank === bankIndex ? deviceSel.preset : null;
    const next = here == null ? (dir > 0 ? 0 : 7) : here + dir;
    if (next < 0 || next > 7) return; // stop at the ends: a bank is 8 slots
    deviceSel = { bank: bankIndex, preset: next };
    lastTouched = 'device';
    resetCollapsed();
    renderAll();
    const row = listEl.querySelector(`.patch-row[data-index="${next}"]`);
    if (row) row.scrollIntoView({ block: 'nearest' });
    clearTimeout(recallTimer);
    recallTimer = setTimeout(() => audition.recallOnDevice(next === null ? 0 : deviceSel.bank, next), RECALL_SETTLE_MS);
  }

  function moveLibrarySelection(dir) {
    // The DOM gives the ORDER — grouped and filtered exactly as displayed —
    // and nothing else. The move itself goes through the same function a click
    // does, rather than dispatching a fake click and hoping the re-render has
    // not replaced the node underneath it.
    const rows = [...document.querySelectorAll('#library .lib-row.lib-patch')];
    if (!rows.length) return;
    const at = rows.findIndex((r) => r.classList.contains('selected'));
    const next = rows[at < 0 ? (dir > 0 ? 0 : rows.length - 1) : at + dir];
    if (!next) return;
    const entry = libEntries.find(
      (e) => e.file === next.dataset.file && (e.patchIndex || 0) === (Number(next.dataset.pi) || 0)
    );
    if (!entry) return;
    libView.select(entry);       // the highlight, now, with no round trip
    next.scrollIntoView({ block: 'nearest' });
    selectLibraryEntry(entry, { inSetlist: !!next.closest('.lib-slot') });
  }

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
    // A dialog owns the keyboard while it is up — including the picker, where
    // the arrows belong to the grid.
    if (document.querySelector('.seven-modal-overlay, .pick-overlay')) return;
    e.preventDefault();
    const dir = e.key === 'ArrowDown' ? 1 : -1;
    if (lastTouched === 'library') moveLibrarySelection(dir);
    else moveBankSelection(dir);
  });

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'z' && e.key !== 'Z') return;
    if (!(e.metaKey || e.ctrlKey) || e.shiftKey || e.altKey) return;
    // Inside a text field the platform's own undo is the right one — a rename
    // in progress should undo characters, not the last thing the app did.
    const t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
    e.preventDefault();
    runUndo();
  });

  window.sevenAPI.onViewCommand((msg) => {
    if (msg && msg.type === 'undo') runUndo();
  });

  // Walks the player through a transfer: one preset, one hold, one confirm.
  // Nothing here advances on a timer — only the player can see the panel.
  // The runner recalls each target slot on the instrument before it loads it,
  // so the Seven's own bank and preset LEDs land on the button the modal is
  // pointing at. Those Program Changes come back to us as events; this flag
  // keeps them from being read as the player reaching for the panel.
  let transferRunning = false;
  // Set while a step is waiting: the runner tells us when it has SEEN the hold
  // land on the instrument, and that resolves the same wait the button does.
  let transferStored = null;

  // The preset the walk moves to after `slot`, from the plan the runner already
  // made. Knowing it up front is what lets the picture move the moment the
  // player says they held the button, rather than after the next patch has
  // finished loading.
  function nextTransferSlot(slots, after) {
    for (let i = after + 1; i < slots.length; i++) {
      const a = slots[i].action;
      if (a === 'send' || a === 'send-sound') return slots[i];
    }
    return null;
  }

  // ONE modal for the whole walk. Eight presets is one task, not eight
  // questions, and closing the dialog between them made the app flash at
  // someone standing at the instrument with both hands busy. So the dialog
  // stays and the picture moves: the highlight and the HOLD legend travel to
  // the next button, which is the move the player's own hand is about to make.
  // `slots` is the runner's plan, which already knows the first target — so the
  // dialog can open on it BEFORE the instrument is touched. Loading a patch is
  // a recall plus ~110 verified writes, and doing that behind a closed dialog
  // left a second of nothing happening between "Send to Bank 3" and the walk
  // appearing. Now the walk appears at once, showing the button you are about
  // to hold, with its actions inert until the patch is actually there.
  async function transferWalk(slots, bank) {
    const firstSlot = nextTransferSlot(slots, -1);
    if (!firstSlot) return transferDone(await window.sevenAPI.transfer.next());
    // A picture of the panel rather than a sentence about it: the player is
    // looking at the instrument, and "hold THAT one" is a location, not a
    // fact. The bank LED and the button both light where they will light.
    const modal = SevenModal.open({
      title: 'Transfer',
      bodyHtml:
        '<p class="tx-step-name"></p>' +
        '<p class="tx-step-hear">(you can hear it now)</p>' +
        '<p class="tx-step-where"></p>' +
        SevenPanelMini.render(bank, firstSlot.slot + 1) +
        '<p class="tx-note">Hold for 3 seconds.</p>' +
        // "lights will run" rather than "the button blinks": what the panel
        // actually does at a store has not been captured, and the owner's
        // description is a sequence across the LEDs rather than one of them
        // flashing. Says enough to recognise it, claims nothing precise.
        '<p class="tx-note">Your Seven lights will run indicating the sound is saved.</p>',
      confirmLabel: 'Held it — next',
      denyLabel: 'Stop',
      cancelLabel: 'Stop',
      tone: 'is-transfer',
    });
    const nameEl = modal.body.querySelector('.tx-step-name');
    const whereEl = modal.body.querySelector('.tx-step-where');
    // textContent, not markup: patch names come off disk and the device.
    const showStep = (bank, preset, name) => {
      nameEl.textContent = name || '';
      whereEl.textContent = `Bank ${bank} · Preset ${preset}`;
      SevenPanelMini.setPreset(modal.body, preset);
    };

    // The plan's version of the first step, on screen immediately; the runner's
    // version replaces it the moment the patch has actually landed.
    showStep(bank, firstSlot.slot + 1, firstSlot.name);
    modal.busy(true);
    let step = await window.sevenAPI.transfer.next();
    modal.busy(false);
    if (!step || step.type === 'transfer-done') return await transferDone(step, modal);
    showStep(step.bank, step.preset, step.name);
    // Every exit is `await`ed rather than returned: in an async function the
    // finally below runs the moment a return EXPRESSION is evaluated, which
    // would close the dialog out from under the report being written into it.
    try {
      for (;;) {
        // Two ways forward, and the instrument usually wins: the button, or the
        // Seven telling us the preset changed under the player's hand. Neither
        // is a timer. modal.action() is idempotent, so losing this race and
        // asking again on the next pass reuses the same pending click.
        const seen = new Promise((resolve) => { transferStored = resolve; });
        let byInstrument = false;
        const go = await Promise.race([
          modal.action(),
          seen.then(() => { byInstrument = true; return true; }),
        ]);
        transferStored = null;
        // The instrument answered, so the button's wait is stale. Dropping it
        // is what stops a habitual click landing on the NEXT preset and
        // recording it as held when it never was.
        if (byInstrument) modal.clearPending();
        if (!go) return await transferDone(await window.sevenAPI.transfer.cancel(), modal);
        // Move to the next button first, then load it. The player is already
        // reaching; the picture should be where they are going, not where they
        // were, for the second it takes to send a patch.
        const ahead = nextTransferSlot(slots, step.slot);
        if (ahead) showStep(step.bank, ahead.slot + 1, ahead.name);
        modal.busy(true);
        step = await window.sevenAPI.transfer.confirm();
        modal.busy(false);
        if (!step || step.type === 'transfer-done') return await transferDone(step, modal);
        // Reconcile with what the runner actually did — the plan is a guess
        // about the future and the report is not.
        showStep(step.bank, step.preset, step.name);
      }
    } finally {
      modal.close();
    }
  }

  // The end of the walk, shown IN the walk's own dialog. The report is the last
  // step of the thing you just did, not a new conversation about it — so the
  // panel picture and the step fade out and this fades in, in the same frame.
  async function transferDone(report, modal) {
    transferRunning = false;
    if (!report) return;
    const stored = report.confirmed.length;
    const loose = report.loadedNotConfirmed;
    const bodyHtml =
      (report.error ? `<p class="tx-note tx-alarm">${esc(report.error)}</p>` : '') +
      `<p class="tx-step-name">${stored} of ${report.total} ` +
      `preset${report.total === 1 ? '' : 's'} stored</p>` +
      `<p class="tx-step-where">Bank ${report.bank}</p>` +
      (loose.length
        ? `<p class="tx-note">Preset ${loose.join(', ')} was loaded but you did not confirm the ` +
          'hold, so it is still in the edit buffer rather than saved on the instrument.</p>'
        : '');
    // report.note — "listed as stored because you confirmed the hold" — is
    // deliberately NOT shown. It was written when a hold could only be taken on
    // the player's word; now the walk mostly advances because the instrument
    // broadcast the changed preset, which is evidence rather than a claim. The
    // caveat still holds for a slot advanced by the button, but the distinction
    // costs more to explain than it is worth on screen. It stays on the report
    // object for anything that wants the fine print.
    const title = report.error || report.cancelled ? 'Transfer stopped' : 'Transfer complete';
    const tone = report.error ? 'is-warning is-transfer' : 'is-transfer';

    if (modal) {
      await modal.replace({ title, bodyHtml, confirmLabel: 'Done', tone });
      await modal.action();
    } else {
      // No dialog to reuse (nothing reaches this today; kept so a future caller
      // that reports without a walk still says the same things).
      await SevenModal.confirm({ title, bodyHtml, confirmLabel: 'Done', tone });
    }
    await refreshLibrary();
  }

  // ---- Panel strip (inline SVG so element ids are addressable) -------------
  const panelStrip = document.getElementById('panel-strip');
  panelStrip.innerHTML = window.sevenAPI.getPanelSvg(); // keeps class="readonly"

  // Panel knob → effects section. Navigation only: clicking a knob reveals and
  // highlights the section it controls; it never changes a value. Preset/bank
  // buttons are patch selection and are not part of this mapping.
  const KNOB_TO_SECTION = {
    'knob-volume': 'efx_veq',
    'knob-bass-mid': 'efx_veq',
    'knob-treble-midf': 'efx_veq',
    'knob-reverb': 'efx_rev',
    'knob-fx1': 'efx_fx1',
    'knob-fx2': 'efx_fx2',
    'knob-amp-drive': 'efx_amp',
    'knob-pad': 'efx_pad',
  };
  const SECTION_TO_KNOBS = {};
  for (const [knob, group] of Object.entries(KNOB_TO_SECTION)) {
    (SECTION_TO_KNOBS[group] = SECTION_TO_KNOBS[group] || []).push(knob);
  }
  // Mapped knobs get the nav-knob class: it re-enables pointer events (the
  // strip stays readonly otherwise) and carries the cursor/hover affordance.
  for (const id of Object.keys(KNOB_TO_SECTION)) {
    const el = panelStrip.querySelector(`#${id}`);
    if (el) el.classList.add('nav-knob');
  }

  // Three distinct cues (keep them distinct — docs/DESIGN.md):
  //   amber glow on a knob  = effect is on (patch data; not yet implemented)
  //   accent ring on a knob = its section is expanded (view state, persistent)
  //   brief accent tint     = you just opened this section (transient ~1.2s)

  // Persistent expanded-state rings: a knob wears the accent ring while its
  // section is open. Recomputed from `collapsed`, never from clicks directly.
  function updateKnobRings() {
    for (const [group, knobs] of Object.entries(SECTION_TO_KNOBS)) {
      for (const id of knobs) {
        const el = panelStrip.querySelector(`#${id}`);
        if (el) el.classList.toggle('nav-ring', !collapsed[group]);
      }
    }
  }

  // Transient open-confirmation tint, fading over ~1.2s. Animation-driven;
  // restart cleanly if the section is re-opened mid-fade.
  const tintTimers = {};
  function flashTint(el, group) {
    el.classList.remove('nav-flash');
    void el.offsetWidth; // restart the CSS animation
    el.classList.add('nav-flash');
    clearTimeout(tintTimers[group]);
    tintTimers[group] = setTimeout(() => el.classList.remove('nav-flash'), 1200);
  }

  // Single path for all expand/collapse changes: keeps the `collapsed` map and
  // the DOM class in sync, animates via CSS (no re-render), and applies the
  // open cues. Closing is plain — no highlight.
  function setSectionCollapsed(group, isCollapsed, opts = {}) {
    collapsed[group] = isCollapsed;
    const el = detailEl.querySelector(`.fx-section[data-group="${group}"]`);
    if (el) {
      el.classList.toggle('collapsed', isCollapsed);
      if (!isCollapsed) {
        if (opts.scroll) {
          const dr = detailEl.getBoundingClientRect();
          const er = el.getBoundingClientRect();
          if (er.top < dr.top || er.bottom > dr.bottom) {
            el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
          }
        }
        if (opts.tint !== false) flashTint(el, group);
      }
    }
    updateKnobRings();
  }

  // Knob click TOGGLES its section (even when bypassed). Opening scrolls it
  // into view if needed. Values never change.
  function navToSection(group) {
    setSectionCollapsed(group, !collapsed[group], { scroll: true });
  }

  // BANK acts on mousedown, hardware-like: the bank advances and the LEDs
  // update at press time. The press VISUAL (.bank-pressed inversion) holds for
  // a minimum ~150ms so a quick click reads as intentional rather than a
  // glitch; held longer, it stays until release (window mouseup, so dragging
  // off the button still releases it).
  const BANK_MIN_PRESS_MS = 150;
  let bankPressedAt = 0;
  let bankReleaseTimer = null;
  panelStrip.addEventListener('mousedown', (e) => {
    const hit = e.target.closest('[data-hit="bank"]');
    if (!hit) return;
    const g = hit.closest('g');
    clearTimeout(bankReleaseTimer);
    g.classList.add('bank-pressed');
    bankPressedAt = performance.now();
    // Navigation only — the device selection is untouched until a preset is
    // pressed (mirrors the hardware's pending-bank behaviour loosely).
    bankIndex = (bankIndex + 1) % banks.length;
    renderAll();
  });
  window.addEventListener('mouseup', () => {
    const g = panelStrip.querySelector('g.bank-pressed');
    if (!g) return;
    const held = performance.now() - bankPressedAt;
    const remaining = Math.max(0, BANK_MIN_PRESS_MS - held);
    clearTimeout(bankReleaseTimer);
    bankReleaseTimer = setTimeout(() => g.classList.remove('bank-pressed'), remaining);
  });

  // Panel buttons drive the same state as the tabs/list below; preset buttons
  // select directly.
  panelStrip.addEventListener('click', (e) => {
    const knob = e.target.closest('[id^="knob-"]');
    if (knob && KNOB_TO_SECTION[knob.id]) {
      navToSection(KNOB_TO_SECTION[knob.id]);
      return;
    }
    const preset = e.target.closest('[id^="preset-"]');
    if (preset) {
      const n = Number(preset.id.replace('preset-', ''));
      if (n >= 1 && n <= 8) {
        deviceSel = { bank: bankIndex, preset: n - 1 };
        lastTouched = 'device';
        resetCollapsed();
        renderAll();
      }
    }
  });

  function setLed(id, on) {
    const el = panelStrip.querySelector(`#${id}`);
    if (el) el.classList.toggle('on', on);
  }

  function updatePanelLeds() {
    // Preset LEDs follow the device selection, and only while its bank is
    // the one displayed (same rule as the list rows).
    const sel = deviceSel && deviceSel.bank === bankIndex ? deviceSel.preset : -1;
    for (let b = 1; b <= 4; b++) setLed(`led-bank-${b}`, b - 1 === bankIndex);
    for (let p = 1; p <= 8; p++) setLed(`led-preset-${p}`, p - 1 === sel);
    // Preset button fills follow the LEDs.
    for (let p = 1; p <= 8; p++) {
      const btn = panelStrip.querySelector(`#preset-${p} .btn`);
      if (btn) btn.classList.toggle('on', p - 1 === sel);
    }
  }

  // ---- Library list ---------------------------------------------------------
  const tabsEl = document.getElementById('bank-tabs');
  const listEl = document.getElementById('patch-list');
  const detailEl = document.getElementById('detail');

  // Bank labels match the hardware panel (banks are numbered 1-4). Restore
  // prompts will tell the user which physical button to press.
  const bankLabel = (i) => `Bank ${banks[i].name}`;

  function renderTabs() {
    tabsEl.innerHTML = banks
      .map((b, i) =>
        `<button class="bank-tab${i === bankIndex ? ' active' : ''}" data-bank="${i}" type="button"><span class="bank-tab-label">Bank ${b.name}</span></button>`
      )
      .join('');
  }

  function renderList() {
    // The device selection shows only when its bank is the one displayed —
    // and it shows even while a library patch is ALSO selected (intended).
    // A slot with no backup renders honestly unknown; it is still selectable
    // (the selection is a POSITION on the hardware, not the patch data).
    const bank = banks[bankIndex];
    const sel = deviceSel && deviceSel.bank === bankIndex ? deviceSel.preset : -1;
    listEl.innerHTML = bank.patches
      .map((p, i) =>
        p && i === bankRenaming
          // The input prefills with what the ROW shows, not the stored name.
          // A backup's stored name is "Bank 4 Preset 1 — Tine Piano"; handing
          // that back means deleting a prefix you never saw before you can
          // type. Accepting it unchanged simply drops the prefix — no
          // information is lost, since bank and preset live in `origin`.
          ? `<div class="patch-row selected" data-index="${i}">` +
            `<span class="patch-num">${i + 1}</span>` +
            `<input class="lib-rename-input bank-rename" type="text" spellcheck="false" ` +
            `value="${String(p.name).replace(/"/g, '&quot;')}">` +
            `</div>`
          : p
          ? R.renderPatchRow(p, i, sel)
          : `<button class="patch-row empty-slot${i === sel ? ' selected' : ''}" data-index="${i}" type="button">` +
            `<span class="patch-num">${i + 1}</span>` +
            `<span class="patch-name">Not backed up</span>` +
            `</button>`
      )
      .join('');
  }

  let lastDetailKey = null;
  let lastSaveBar = false; // was the save block showing on the previous render?

  function renderDetail() {
    const patch = currentPatch();
    // A library patch has no bank position — the pos line is omitted. A
    // device patch shows ITS bank/preset (the selection's, not the tab's).
    const pos =
      lastTouched === 'library' && libSelected
        ? {
          // The same picture, the same gesture — but here it changes what the
          // FILE says, not what the instrument holds. No connection needed:
          // this is editing a patch on disk.
          canPickSound: { file: libSelected.file, patchIndex: libSelected.patchIndex || 0 },
          sounds: soundList,
          carouselAt,
        }
        : deviceSel
          ? {
            bankLabel: bankLabel(deviceSel.bank),
            patchNumber: deviceSel.preset + 1,
            // Bank 1 is the factory presets and the app will not write there,
            // so the picture is not a control at all on those slots — it says
            // why on hover instead. A button that opens only to refuse is a
            // dead end dressed as an offer.
            //
            // It IS offered with nothing plugged in, though: that refusal is
            // temporary and actionable ("connect the Seven"), where Bank 1's
            // is permanent. Hiding it there is what made it unfindable.
            canPickSound: deviceSel.bank === 0
              ? null
              : { bank: deviceSel.bank + 1, preset: deviceSel.preset + 1 },
            sounds: soundList,
            carouselAt,
            noPickReason: deviceSel.bank === 0 ? 'Works on banks 2, 3 and 4' : null,
          }
          : {};
    const emptyMsg =
      lastTouched === 'device' && deviceSel
        ? `No backup of Bank ${deviceSel.bank + 1} · Preset ${deviceSel.preset + 1} yet — connect the Seven and click “Back up instrument”.`
        : 'Select a patch';
    // While a patch is live, the panel shows the WORKING copy — the values the
    // instrument currently holds, including edits not yet saved to disk.
    const live = audition.isLive();
    const working = audition.workingParams();
    let shown = live && working ? { ...patch, params: working } : patch;
    // The buffer's own instrument wins while live: name, badge, illustration
    // and — through engineGroupFor — which engine's controls are shown.
    if (live && liveSound && shown) {
      shown = { ...shown, soundName: liveSound.name, sampled: !!liveSound.sampled };
    }
    // Every live edit re-renders this panel, and replacing its contents resets
    // its scroll — so editing a parameter halfway down threw the view back to
    // the top on every change. Hold the position across the swap; a genuine
    // change of patch starts at the top, which is what detailKey tracks.
    const key = `${lastTouched}:${(currentTarget() || {}).file || ''}:${patch && patch.name}`;
    const keepScroll = key === lastDetailKey ? detailEl.scrollTop : 0;
    // The save controls live INSIDE the sound engine column now, under the
    // bank line — above the whole panel they pushed both columns down, which
    // read as the layout breaking rather than something arriving
    // (Daniel, 2026-08-13). Only the parameters move.
    const saveBar = patch ? audition.renderBar(patch, live) : '';
    // The block is always there; what changes is whether it is LIVE. Animate
    // only on the change from quiet to live — every edit re-renders this
    // panel and a fresh node replays its animation, so without this the
    // controls would flare on every drag.
    const nowActive = !!patch && audition.saveIsActive();
    const saveBarNew = nowActive && !lastSaveBar;
    lastSaveBar = nowActive;
    detailEl.innerHTML = patch
      ? R.renderDetail(shown, { showRaw, collapsed, live, saveBar, saveBarNew, ...pos })
      : `<div class="placeholder">${emptyMsg}</div>`;
    detailEl.scrollTop = keepScroll;
    lastDetailKey = key;
    updateKnobRings();
    dressParamSelects(detailEl);
    resumeSampledArrival();
  }

  // Enum rows keep their <select> and gain a picker in front of it.
  //
  // The select is not replaced, only hidden: every listener that matters hangs
  // off it — the live path in audition.js, the not-live path here, undo, and
  // the UI scenarios — all delegating on a `change` event from `.param-select`.
  // Swapping the element would have meant rewriting the live-edit path, which
  // is hardware-verified. Setting the value and firing `change` means none of
  // them can tell the difference, and the OS menu is still gone.
  function dressParamSelects(root) {
    for (const sel of root.querySelectorAll('.param-select')) {
      if (sel.dataset.dressed) continue;
      sel.dataset.dressed = '1';
      const options = [...sel.options].map((o) => ({ value: Number(o.value), label: o.textContent }));
      const pick = SevenPicker.create({
        value: Number(sel.value),
        options,
        label: sel.closest('.param')?.querySelector('.param-label')?.textContent || undefined,
        disabled: sel.disabled,
        onChange: (v) => {
          sel.value = String(v);
          sel.dispatchEvent(new Event('change', { bubbles: true }));
        },
      });
      pick.classList.add('picker-param');
      const wrap = sel.closest('.select-wrap') || sel;
      wrap.classList.add('is-dressed');
      wrap.after(pick);
    }
  }

  // Audition mode and live editing (src/audition.js). It owns the live session;
  // app.js owns the selection it acts on.
  // The connection row is app.js's own element, so this lives here rather than
  // being borrowed from the audition module — which is where it went during
  // the split, leaving "Send to bank…" calling a function that no longer
  // existed. The click threw and nothing happened.
  const isConnected = () => {
    const row = document.getElementById('connection-row');
    return !!row && row.classList.contains('connected');
  };

  // Which patch the detail panel is acting on: the library selection when that
  // was touched last, otherwise the selected bank slot. Both app.js and the
  // audition module work from this one answer.
  function currentTarget() {
    if (lastTouched === 'library' && libSelected) {
      return { file: libSelected.file, patchIndex: libSelected.patchIndex || 0 };
    }
    const p = deviceSel && banks[deviceSel.bank].patches[deviceSel.preset];
    return p && p.file ? { file: p.file, patchIndex: 0 } : null;
  }

  const audition = SevenAudition.create({
    el: detailEl,
    getTarget: currentTarget,
    getPatch: () => currentPatch(),
    // The panel strip goes with it. A live edit re-renders the detail, and the
    // strip was left showing the value before the change — the knobs are part
    // of the same picture of the instrument, not decoration beside it.
    renderDetail: () => { renderDetail(); updateKnobLit(); updateClaviGroup(); },
    refreshLibrary: () => refreshLibrary(),
    getEntries: () => libEntries,
    // Which slot the Seven is on, so a session can put it back when it ends.
    // Referenced by audition.js and MISSING until now, which is why leaving
    // audition mode left you still hearing the sound you were trying out.
    getSlot: () => (deviceSel ? { bank: deviceSel.bank, preset: deviceSel.preset } : null),
    // What the edit buffer is actually PLAYING, which after a trip through the
    // carousel is not what the patch file says. Saving without this wrote the
    // new settings under the old instrument's name.
    getLiveSound: () => liveSound,
    undoStack,
    schema, // for a parameter's display name in the undo label
  });

  const esc = (v) =>
    String(v).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  // Audition: hear the selected patch on the instrument. The bar exists only
  // while connected — offering it otherwise would be a button that can't work.
  // The wording never implies the patch is SAVED: it isn't, and can't be
  // without a three-second panel hold (no store opcode exists).
  // Region header carries the honesty label: this view is what the LAST
  // BACKUP saw, not a live read — the Seven has no read-slot opcode.
  const sevenHead = document.getElementById('seven-head');
  // Shared by the expanded header and the collapsed strip, so the two can
  // never drift or depend on each other's render order.
  function asOfText() {
    const d = banksAsOf ? new Date(banksAsOf) : null;
    if (!d || isNaN(d)) return '';
    return `as of last backup · ${d.toLocaleDateString([], { day: 'numeric', month: 'short' })}`;
  }

  function updateSevenHead() {
    const fmt = (iso) => {
      const d = new Date(iso);
      return isNaN(d) ? '' : d.toLocaleDateString([], { day: 'numeric', month: 'short' });
    };
    sevenHead.innerHTML = banksAsOf
      ? `On the Seven <span class="asof">as of last backup · ${fmt(banksAsOf)}</span>`
      : `On the Seven <span class="asof">not yet backed up</span>`;
  }

  // Lit knob = its effect is ON in the selected patch (amber cap fill + amber
  // outline; the accent EXPANDED ring is a separate cue on the outer ring only
  // — both can show at once). Interim amber scheme; the eventual target is the
  // manual's RGB value-encoding (docs/DESIGN.md).
  const KNOB_LIT_SWITCH = {
    // Master volume has no switch — always lit. Its Local Off state (knob turns
    // BLUE on the hardware; slow push ≥100ms toggles, quick push switches the
    // displayed parameter) is a device-reported cue for when MIDI lands —
    // TODO(device); SysEx visibility unknown (docs/PROJECT-SCOPE.md).
    // veq_byp is EQ *Bypass* — INVERTED: 1 means bypassed, so the EQ knobs are
    // lit when it reads 0.
    'knob-volume': null,
    'knob-bass-mid': { sw: 'veq_byp', invert: true },
    'knob-treble-midf': { sw: 'veq_byp', invert: true },
    'knob-reverb': { sw: 'rev_sw' },
    'knob-fx1': { sw: 'fx1_sw' },
    'knob-fx2': { sw: 'fx2_sw' },
    'knob-amp-drive': { sw: 'amp_sw' },
    'knob-pad': { sw: 'pad_sw' },
  };
  // The value each knob DISPLAYS (its default parameter — the one the
  // hardware shows before any push-toggle). The manual's lighting scheme
  // (DESIGN.md "Knob lighting"): colour encodes value, green at low running
  // to red at high — confirmed live on the Volume knob. The Reverb Decay
  // blue→red and pulsing FX Rate variants apply to the knobs' ALTERNATE
  // parameters, which the strip doesn't render.
  const KNOB_VALUE_PARAM = {
    'knob-volume': 'veq_vol',
    'knob-reverb': 'rev_lv',
    'knob-bass-mid': 'veq_bas',
    'knob-treble-midf': 'veq_trb',
    'knob-fx1': 'fx1_dp',
    'knob-fx2': 'fx2_dp',
    'knob-amp-drive': 'amp_dr',
    'knob-pad': 'pad_lv',
  };
  const KNOB_COLOR_VARS = [
    '--k-glow-fill', '--k-bore-fill', '--k-bore-stroke', '--k-top-stroke',
    '--k-mid-stroke', '--k-skirt-stroke', '--k-rib-stroke', '--k-shadow',
  ];
  // The patch AS SHOWN: the working copy while a session is live, so the panel
  // strip agrees with the parameter rows. The strip used to read the saved
  // patch, so toggling the Synth Pad during an audition lit its section pill
  // and left its knob dark (Daniel, 2026-08-12: "the pad is on, but the knob
  // is not lit").
  function shownPatch() {
    const base = currentPatch();
    if (!base) return base;
    const working = audition.isLive() ? audition.workingParams() : null;
    return working ? { ...base, params: working } : base;
  }

  function updateKnobLit() {
    const patch = shownPatch();
    for (const [id, spec] of Object.entries(KNOB_LIT_SWITCH)) {
      const el = panelStrip.querySelector(`#${id}`);
      if (!el) continue;
      const lit =
        !!patch &&
        (spec === null ||
          (spec.invert ? patch.params[spec.sw] === 0 : patch.params[spec.sw] === 1));
      el.classList.toggle('knob-lit', lit);
      if (!lit) {
        for (const v of KNOB_COLOR_VARS) el.style.removeProperty(v);
        continue;
      }
      // Value → hue: green (120°) at 0 sweeping to red (0°) at max.
      const key = KNOB_VALUE_PARAM[id];
      const max = (schema.parameters.find((p) => p.key === key) || {}).max || 127;
      const value = Math.max(0, Math.min(max, patch.params[key] ?? 0));
      const hue = Math.round(120 * (1 - value / max));
      const c = (l, a) => `hsla(${hue}, 90%, ${l}%, ${a})`;
      el.style.setProperty('--k-glow-fill', c(55, 0.30));
      el.style.setProperty('--k-bore-fill', c(72, 1));
      el.style.setProperty('--k-bore-stroke', c(55, 1));
      el.style.setProperty('--k-top-stroke', c(70, 0.65));
      el.style.setProperty('--k-mid-stroke', c(65, 0.35));
      el.style.setProperty('--k-skirt-stroke', c(65, 0.55));
      el.style.setProperty('--k-rib-stroke', c(70, 0.4));
      el.style.setProperty('--k-shadow', c(55, 0.45));
    }
  }

  // Clavi tabs only act on the modeled Clavi engine. Dim the whole group unless
  // the selected sound resolves to pno_zd6 — resolved from the ENGINE GROUP, not
  // the sound name: "Sampled Clavi Piano" runs the pno_rom sample player and
  // must render inactive.
  function updateClaviGroup() {
    const group = panelStrip.querySelector('#clavi-group');
    if (!group) return;
    const base = shownPatch();
    // liveSound wins: the buffer's instrument decides which engine is playing.
    const patch = base && liveSound && audition.isLive()
      ? { ...base, soundName: liveSound.name, sampled: !!liveSound.sampled }
      : base;
    const active = !!patch && R.engineGroupFor(patch) === 'pno_zd6';
    group.classList.toggle('inactive', !active);
  }

  function renderAll() {
    renderTabs();
    renderList();
    const renameField = listEl.querySelector('.bank-rename');
    if (renameField) { renameField.focus(); renameField.select(); }
    renderDetail();
    updatePanelLeds();
    updateKnobLit();
    updateClaviGroup();
    // Function declaration in the library block below — hoisted, and
    // renderAll only ever runs after the whole IIFE has initialised.
    updateBankStrip();
  }

  tabsEl.addEventListener('click', (e) => {
    const tab = e.target.closest('.bank-tab');
    if (!tab) return;
    // Navigation only — browsing banks never changes either selection.
    bankIndex = Number(tab.dataset.bank);
    renderAll();
  });

  // Same paired-click rename as the library (see library-view.js for why a
  // dblclick listener can't work here).
  let lastSlotClick = { key: null, t: 0 };

  listEl.addEventListener('click', (e) => {
    const row = e.target.closest('.patch-row');
    if (!row) return;
    if (e.target.closest('.patch-name') && banks[bankIndex].patches[Number(row.dataset.index)]) {
      const key = `${bankIndex}:${row.dataset.index}`;
      const now = Date.now();
      if (lastSlotClick.key === key && now - lastSlotClick.t < 450) {
        lastSlotClick = { key: null, t: 0 };
        bankRenaming = Number(row.dataset.index);
        renderAll();
        return;
      }
      lastSlotClick = { key, t: now };
    }
    // A slot's name IS its backup patch's name — the Seven stores none. The
    // pencil therefore renames that library file; both regions then show the
    // new name, because both read the same file.

    deviceSel = { bank: bankIndex, preset: Number(row.dataset.index) };
    carouselAt = null; // a new selection brings the carousel back to its sound
    liveSound = null;
    // No endSession() here: recallOnDevice below closes the old session and
    // opens one on this slot. Ending it first also RESTORED the instrument to
    // the slot we are leaving, one recall before recalling the slot we want —
    // two moves where the player asked for one.
    lastTouched = 'device';
    resetCollapsed();
    renderAll();
    // The Seven already moves the app when you press a preset button; this is
    // the other direction. Only the bank region does it — those rows ARE the
    // instrument's slots, while a library patch is a file with no slot to
    // recall. A recall replaces the edit buffer, so unsaved live edits get a
    // say first.
    audition.recallOnDevice(deviceSel.bank, deviceSel.preset);
  });

  async function commitBankRename(value) {
    const i = bankRenaming;
    bankRenaming = null;
    const patch = banks[bankIndex].patches[i];
    const entry = patch && libEntries.find((x) => x.file === patch.file);
    const name = String(value).trim();
    if (!entry || !name || name === entry.name) { renderAll(); return; }
    await window.sevenAPI.library.rename(entry.file, entry.patchIndex, name);
    await refreshLibrary();
  }

  listEl.addEventListener('keydown', (e) => {
    if (!e.target.classList.contains('bank-rename')) return;
    if (e.key === 'Enter') commitBankRename(e.target.value);
    else if (e.key === 'Escape') { bankRenaming = null; renderAll(); }
  });
  listEl.addEventListener('focusout', (e) => {
    if (e.target.classList.contains('bank-rename') && bankRenaming != null) {
      commitBankRename(e.target.value);
    }
  });

  // Transient inline note next to a device-state control that can't act yet.
  // Clicking a section header toggles it regardless of switch state — values in
  // a bypassed section must stay reachable. The state pill is its own control
  // and must not toggle collapse.
  detailEl.addEventListener('click', (e) => {
    const pill = e.target.closest('.fx-state');
    if (pill) {
      audition.handleStatePill(pill);
      return;
    }
    const head = e.target.closest('.fx-head');
    if (!head || !head.dataset.group) return;
    // Toggle without re-render so the body height animates. Knob rings update
    // as part of setSectionCollapsed (persistent while open; pdl_exp has none).
    setSectionCollapsed(head.dataset.group, !collapsed[head.dataset.group]);
  });

  // Enum dropdowns follow the same honesty rule as the pill: a change never
  // updates local state. Revert to the patch value and say why. Because state
  // never forks, the FX2-mode-conditional sub-parameters (phaser at 1, delay
  // at 3) always read the same patch.params value the select shows.
  detailEl.addEventListener('change', (e) => {
    // A LIVE row is handled above: the change is sent and the value the device
    // echoes is what sticks. This path is only for a row that isn't live, and
    // it used to run for both — reverting the select immediately after the
    // live handler had legitimately changed it.
    const sel = e.target.closest('.param:not(.is-live) .param-select');
    if (!sel) return;
    // TODO(device): when MIDI lands, this becomes:
    //   1. send set-parameter (0x20) for the param behind sel.dataset.key with
    //      Number(sel.value),
    //   2. await the device reply,
    //   3. re-render from the value the DEVICE reports (which also refreshes
    //      any mode-conditional sub-parameters).
    // Not live: put the select back where the patch says it is, and offer the
    // way in. The control reflects device state, so it must not fork.
    const patch = currentPatch();
    if (patch) sel.value = String(patch.params[sel.dataset.key] ?? 0);
    // Chromium keeps :focus-visible on selects after mouse interaction; drop
    // focus so the accent ring doesn't linger as a false selected state.
    sel.blur();
    audition.offerAudition();
  });

  // ---- Library section (on-disk library; data via preload IPC) --------------
  // Collapsible section below the bank rows. Reuses the fx-section disclosure
  // classes; expanded/collapsed persists across launches (view state —
  // localStorage, never patch data). The body is the self-contained
  // SevenLibraryView component: data in, events out.
  const libRoot = document.getElementById('library');
  const libSection = document.getElementById('library-section');
  const libHead = document.getElementById('library-head');
  const libCount = document.getElementById('library-count');
  const libReveal = document.getElementById('library-reveal');
  const bankStrip = document.getElementById('bank-strip');
  const bankStripLabel = document.getElementById('bank-strip-label');
  const splitDivider = document.getElementById('split-divider');
  const LIB_OPEN_KEY = 'seven.libraryOpen';
  const LIB_SPLIT_KEY = 'seven.librarySplit';

  // Library selection: when set, the detail view renders this entry instead of
  // the bank patch. Bank/preset clicks clear it.
  let libSelected = null;
  let libEntries = [];
  let bankRenaming = null; // preset index being renamed in the bank list

  const libToRendererPatch = (entry) => ({
    name: entry.name,
    soundName: entry.soundName,
    sampled: entry.sampled,
    params: entry.params,
  });

  const libView = SevenLibraryView.createLibraryView({
    el: document.getElementById('library-body'),
    on: {
      // Every sound the schema knows (read off the instrument, FW 1.37) —
      // the picker's Instruments tab. Sound-only slots reference these by NAME,
      // never by id: ids are not portable across units (schema soundsNote).
      sounds: schema.sounds,
      select: (entry, opts = {}) => selectLibraryEntry(entry, opts),
      async contextMenu(entry) {
        const action = await window.sevenAPI.library.contextMenu();
        if (!action) return;
        if (action === 'rename') {
          libView.beginRename(entry);
          return;
        }
        if (action === 'send') return sendPatchToSlot(entry);
        if (action === 'duplicate') await window.sevenAPI.library.duplicate(entry.file, entry.patchIndex);
        else if (action === 'trash') {
          await window.sevenAPI.library.trash(entry.file);
          if (libSelected && libSelected.file === entry.file) libSelected = null;
        } else if (action === 'export') {
          await window.sevenAPI.library.export(entry.file, `${entry.name}.sevenlib.json`);
          return; // nothing on disk changed inside the library folder
        }
        await refreshLibrary();
      },
      async rename(entry, newName) {
        const oldName = entry.name;
        const newFile = await window.sevenAPI.library.rename(entry.file, entry.patchIndex, newName);
        // Renaming moves the FILE too, so the undo has to address the new one.
        undoStack.push(`rename to “${newName}”`, async () => {
          await window.sevenAPI.library.rename(newFile, entry.patchIndex, oldName);
          await refreshLibrary();
        });
        if (libSelected && libSelected.file === entry.file) {
          libSelected = { ...libSelected, file: newFile, name: newName };
        }
        await refreshLibrary();
        // The file is renamed too and the list is name-sorted, so the row has
        // moved — follow it, otherwise the rename looks like it was discarded.
        libView.reveal(newFile, entry.patchIndex);
      },
      // ---- setlist editing (every mutation persists via IPC, then re-syncs) --
      async createSetlist(name) {
        await window.sevenAPI.setlists.create(name);
        await refreshLibrary();
        undoStack.push(`new setlist “${name}”`, async () => {
          // Find it by name at undo time: indexes shift as setlists come and go.
          const i = libData.setlists.findIndex((x) => x.name === name);
          if (i >= 0) await window.sevenAPI.setlists.delete(i);
          await refreshLibrary();
        });
      },
      async renameSetlist(index, name) {
        const oldName = (libData.setlists[index] || {}).name;
        await window.sevenAPI.setlists.rename(index, name);
        await refreshLibrary();
        undoStack.push(`rename setlist to “${name}”`, async () => {
          const i = libData.setlists.findIndex((x) => x.name === name);
          if (i >= 0) await window.sevenAPI.setlists.rename(i, oldName);
          await refreshLibrary();
        });
      },
      // Shared by the trash icon and the context menu's Delete — one confirm,
      // one path. Deleting a setlist never touches the patches it references.
      async deleteSetlist(index, name) {
        const prompt = await window.sevenAPI.setlists.deletePrompt(name);
        const ok = await SevenModal.confirm({
          title: prompt.title,
          body: prompt.body,
          confirmLabel: prompt.confirmLabel,
          cancelLabel: 'Cancel',
          tone: 'is-warning',
        });
        if (ok) {
          // Keep the whole thing — a setlist is a name and eight references,
          // so putting it back is exact, not approximate.
          const gone = JSON.parse(JSON.stringify(libData.setlists[index] || { name, slots: [] }));
          await window.sevenAPI.setlists.delete(index);
          await refreshLibrary();
          undoStack.push(`delete setlist “${name}”`, async () => {
            await window.sevenAPI.setlists.create(gone.name);
            await refreshLibrary();
            const i = libData.setlists.findIndex((x) => x.name === gone.name);
            if (i >= 0) {
              for (let slot = 0; slot < gone.slots.length; slot++) {
                if (gone.slots[slot]) await window.sevenAPI.setlists.assign(i, slot, gone.slots[slot]);
              }
            }
            await refreshLibrary();
          });
        }
      },
      // ---- Transfer: a setlist onto a bank ---------------------------------
      // The runner owns the rules; this walks the player through them. Bank 1
      // is absent from the choices AND refused by the runner, so neither this
      // nor any future caller can write over the factory presets.
      async sendSetlist(index, name) {
        if (!isConnected()) {
          toast('Connect the Seven to send a setlist to it');
          return;
        }
        const bank = await SevenModal.choose({
          title: `Send “${name}” to which bank?`,
          body:
            'The patches load one at a time, and you hold that preset button on the Seven for ' +
            'three seconds to keep each one.\n\n' +
            'Bank 1 is not offered: it holds the factory presets.',
          choices: [
            { value: 2, label: 'Bank 2' },
            { value: 3, label: 'Bank 3' },
            { value: 4, label: 'Bank 4' },
          ],
        });
        if (!bank) return;

        // Move the Seven to that bank now, while the decision is still open.
        // The next two dialogs ask whether to replace what is in it — better
        // asked with the instrument sitting on it, playable. A recall replaces
        // the edit buffer, so it is skipped while a live edit is unsaved: the
        // user has not agreed to anything yet, and losing their work at the
        // point of merely picking a bank would be indefensible.
        if (!audition.hasUnsavedEdit()) await window.sevenAPI.transfer.selectBank(bank);
        // Anything below that stops short of starting puts the panel back.
        const release = () => window.sevenAPI.transfer.releaseBank();
        // Whether the run will have to borrow Send PC, so the dialog can say so
        // before it happens rather than after.
        const sendPcOff = (await window.sevenAPI.midi.status()).sendPc === 0;

        const plan = await window.sevenAPI.transfer.preflight(index, bank);
        if (!plan.ok) {
          // A blocked plan is not a failure to hide — it names what this
          // instrument cannot play, which is the whole point of checking.
          await SevenModal.confirm({
            title: plan.error ? 'Cannot send this setlist' : 'This instrument is missing sounds',
            body: plan.error || plan.blocked
              .map((b) => `Slot ${b.slot + 1}${b.name ? ` (${b.name})` : ''}: ${b.reason}`)
              .join('\n\n'),
            confirmLabel: 'OK',
            tone: 'is-warning',
          });
          await release();
          return;
        }

        // The point of no return, in the app's own voice. Built as a movement
        // rather than a sentence — what is going, where it lands — because
        // that is the shape of the thing and a paragraph makes you assemble it
        // yourself. Declining gets a button of its own and the keyboard starts
        // on it: losing presets you never captured is the one mistake here
        // that cannot be undone.
        const go = await SevenModal.confirm({
          title: 'Transfer',
          bodyHtml:
            `<p class="tx-from">${esc(plan.setlist)}</p>` +
            `<p class="tx-count">${plan.willWrite} preset${plan.willWrite === 1 ? '' : 's'}</p>` +
            '<p class="tx-arrow" aria-hidden="true">↓</p>' +
            `<p class="tx-to">Crumar Seven’s Bank ${bank}</p>` +
            '<p class="tx-note">You will manually transfer each sound, replacing the current ' +
            'sounds.</p>' +
            '<p class="tx-note tx-aside">(Backup your current bank tones before they say ' +
            'ciao!)</p>' +
            // Only when we are about to touch a setting that is theirs. Said
            // here rather than after the fact, because borrowing something
            // quietly is the part that would feel like a liberty.
            (sendPcOff
              ? '<p class="tx-note tx-fine">Send PC is off on your Seven. The transfer switches ' +
                'it on so the app can follow along, and switches it back when it’s done.</p>'
              : ''),
          confirmLabel: `Send to Bank ${bank}`,
          // No Cancel button: the X is the way out, and the single red button
          // is then unmistakably the one thing this dialog does. The keyboard
          // still starts on the X rather than on the destructive action.
          cancelLabel: 'Cancel',
          defaultDeny: true,
          tone: 'is-warning is-transfer',
        });
        if (!go) {
          await release();
          return;
        }

        const started = await window.sevenAPI.transfer.start(index, bank, true);
        if (!started || !started.started) {
          await release();
          return;
        }
        // Set before the first step: the runner recalls the slot inside next(),
        // and that Program Change is ours, not the player's.
        transferRunning = true;
        transferWalk(started.slots, bank);
      },
      // Opening a setlist marks it as the most recently used, so it rises to
      // the top of the list. Deliberately not awaited and not re-rendered: the
      // reorder should be waiting for you when you come BACK to the list, not
      // happen under your eyes as you open it.
      openSetlist(index) {
        window.sevenAPI.setlists.touch(index);
      },
      async setlistMenu(index, name) {
        const action = await window.sevenAPI.setlists.contextMenu();
        if (action === 'rename') {
          libView.beginSetlistRename(index);
        } else if (action === 'delete') {
          // Confirm first; deleting a setlist never touches the patches.
          const prompt = await window.sevenAPI.setlists.deletePrompt(name);
        const ok = await SevenModal.confirm({
          title: prompt.title,
          body: prompt.body,
          confirmLabel: prompt.confirmLabel,
          cancelLabel: 'Cancel',
          tone: 'is-warning',
        });
        if (ok) {
            await window.sevenAPI.setlists.delete(index);
            await refreshLibrary();
          }
        }
      },
      async assignSlot(index, slot, file) {
        const prev = ((libData.setlists[index] || {}).slots || [])[slot] || null;
        await window.sevenAPI.setlists.assign(index, slot, file);
        await refreshLibrary();
        undoStack.push(`fill slot ${slot + 1}`, async () => {
          if (prev) await window.sevenAPI.setlists.assign(index, slot, prev);
          else await window.sevenAPI.setlists.clear(index, slot);
          await refreshLibrary();
        });
      },
      async clearSlot(index, slot) {
        const prev = ((libData.setlists[index] || {}).slots || [])[slot] || null;
        await window.sevenAPI.setlists.clear(index, slot);
        await refreshLibrary();
        if (prev) {
          undoStack.push(`clear slot ${slot + 1}`, async () => {
            await window.sevenAPI.setlists.assign(index, slot, prev);
            await refreshLibrary();
          });
        }
      },
      async moveSlot(index, from, to) {
        await window.sevenAPI.setlists.move(index, from, to);
        await refreshLibrary();
        undoStack.push(`move slot ${from + 1} to ${to + 1}`, async () => {
          await window.sevenAPI.setlists.move(index, to, from);
          await refreshLibrary();
        });
      },
    },
  });

  async function refreshLibrary() {
    const data = await window.sevenAPI.library.list();
    libData = data; // last known state — undo steps capture from it
    libEntries = data.patches;
    libView.update(data);
    const n = data.patches.filter((e) => !e.invalid).length;
    libCount.textContent = `— ${n} patch${n === 1 ? '' : 'es'}`;
    // The bank region derives from the same list — one fetch feeds both.
    rebuildBanks(data.patches);
    updateSevenHead();
    // Keep the detail in sync if the selected entry changed on disk.
    if (libSelected) {
      const fresh = data.patches.find(
        (e) => e.file === libSelected.file && e.patchIndex === libSelected.patchIndex
      );
      if (fresh) {
        libSelected = fresh;
        libView.select(fresh);
      } else {
        libSelected = null;
        // The library half of the split selection is gone; the detail panel
        // falls back to the device selection.
        if (lastTouched === 'library') lastTouched = 'device';
      }
    }
    renderAll();
  }

  // The bank summary strip shown while the Library is expanded. It ALWAYS
  // shows the device selection when one exists — regardless of what's
  // selected in the library — and falls back to bank-only when no preset has
  // been selected this session.
  function updateBankStrip() {
    if (deviceSel) {
      const bank = banks[deviceSel.bank];
      const patch = bank.patches[deviceSel.preset];
      bankStripLabel.textContent = `— Bank ${bank.name}${patch ? ` · ${patch.name}` : ''}`;
    } else {
      bankStripLabel.textContent = `— Bank ${banks[bankIndex].name}`;
    }
    // The honesty label rides along, so collapsing the region never hides the
    // fact that this view is only as fresh as the last backup.
    const asof = document.getElementById('bank-strip-asof');
    if (asof) asof.textContent = asOfText();
  }

  // The two regions expand mutually exclusively: opening the Library
  // collapses the bank rows to the strip; re-expanding the banks collapses
  // the Library back to its header. View state, persisted across launches.
  function setLibraryOpen(open, opts = {}) {
    libSection.classList.toggle('collapsed', !open);
    libRoot.classList.toggle('lib-open', open);
    updateBankStrip();
    localStorage.setItem(LIB_OPEN_KEY, open ? '1' : '0');
    // Never open below the fold.
    if (open && opts.scroll !== false) libSection.scrollIntoView({ block: 'nearest' });
  }
  libHead.addEventListener('click', (e) => {
    if (e.target.closest('#library-reveal')) return; // button, not a toggle
    setLibraryOpen(libSection.classList.contains('collapsed'));
  });
  bankStrip.addEventListener('click', () => setLibraryOpen(false));
  libReveal.addEventListener('click', () => window.sevenAPI.library.reveal());

  // Divider drag: sets the Library list height (--lib-split), persisted as a
  // FRACTION of the region rather than pixels. A pixel split saved on a tall
  // window left dead space under the list on a short one and clipped it on a
  // taller one; a fraction scales with whatever window the app opens in.
  let splitFraction = Number(localStorage.getItem(LIB_SPLIT_KEY)) || 0;
  // Migrate the old pixel value: anything >= 1.5 was px, not a fraction.
  if (splitFraction >= 1.5) {
    splitFraction = libRoot.clientHeight ? splitFraction / libRoot.clientHeight : 0;
    if (splitFraction > 0) localStorage.setItem(LIB_SPLIT_KEY, String(splitFraction));
  }
  splitFraction = splitFraction > 0.05 && splitFraction < 0.98 ? splitFraction : 0;

  // No saved split means no cap at all — the list fills what the window gives.
  function applySplit() {
    if (!splitFraction) {
      libRoot.style.removeProperty('--lib-split');
      return;
    }
    const h = Math.max(80, Math.round(libRoot.clientHeight * splitFraction));
    libRoot.style.setProperty('--lib-split', `${h}px`);
  }
  applySplit();
  window.addEventListener('resize', applySplit);
  splitDivider.addEventListener('mousedown', (e) => {
    e.preventDefault();
    const list = document.querySelector('#library-body .lib-list');
    if (!list) return;
    const startY = e.clientY;
    const startH = list.getBoundingClientRect().height;
    const onMove = (ev) => {
      // Dragging down gives the bank region more room, the Library less.
      const h = Math.max(80, Math.round(startH - (ev.clientY - startY)));
      libRoot.style.setProperty('--lib-split', `${h}px`);
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      const h = parseInt(libRoot.style.getPropertyValue('--lib-split'), 10);
      const total = libRoot.clientHeight;
      if (h >= 80 && total) {
        splitFraction = h / total;
        localStorage.setItem(LIB_SPLIT_KEY, String(splitFraction));
      }
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  });

  // Default: banks expanded, Library collapsed; persisted view state wins.
  setLibraryOpen(localStorage.getItem(LIB_OPEN_KEY) === '1', { scroll: false });
  refreshLibrary();

  // ---- View menu commands (main process → here) -----------------------------
  if (window.sevenAPI.onViewCommand) {
    window.sevenAPI.onViewCommand((msg) => {
      if (msg.type === 'theme') {
        applyTheme(msg.value);
      } else if (msg.type === 'showRaw') {
        showRaw = !!msg.value;
        renderDetail();
      } else if (msg.type === 'expandAll') {
        // Animated class toggles; no tint — the open-confirmation cue is for
        // direct opens, not bulk menu actions.
        for (const s of R.FX_SECTIONS) setSectionCollapsed(s.group, false, { tint: false });
      } else if (msg.type === 'collapseAll') {
        for (const s of R.FX_SECTIONS) setSectionCollapsed(s.group, true);
      }
    });
  }

  // ---- Connection row (real MIDI through the preload seam) ------------------
  // The renderer only sees decoded status objects and events; connect() rejects
  // with a user-facing message (probe failure, device missing).
  if (window.sevenAPI.midi) {
    const connRow = document.getElementById('connection-row');
    const connText = document.getElementById('connection-text');
    const connBtn = document.getElementById('conn-button');
    const backupBtn = document.getElementById('backup-button');
    const soundsBtn = document.getElementById('sounds-button');
    const soundsPanel = document.getElementById('sounds-panel');
    let backupRunning = false;

    // Expansion visibility: the connected unit's own sound table. Ids are
    // unit-specific (they shift with installed expansions), which is exactly
    // why the panel shows them next to the names — and why backups reference
    // the table fingerprint shown in the footer.
    const renderSoundsPanel = (table) => {
      const cols = soundsPanel.querySelector('.sounds-cols');
      const foot = soundsPanel.querySelector('.sounds-foot');
      const group = (title, sounds) => {
        const div = document.createElement('div');
        div.className = 'sounds-group';
        const h = document.createElement('h4');
        h.textContent = title;
        div.appendChild(h);
        for (const s of sounds) {
          const row = document.createElement('div');
          row.className = 'sound-row';
          const id = document.createElement('span');
          id.className = 'sound-id';
          id.textContent = s.id;
          const name = document.createElement('span');
          name.textContent = s.name;
          row.append(id, name);
          div.appendChild(row);
        }
        return div;
      };
      cols.replaceChildren(
        group('Modeled', table.sounds.filter((s) => !s.sampled)),
        group('Sampled — GSP-01 expansions', table.sounds.filter((s) => s.sampled))
      );
      const when = new Date(table.readAt);
      foot.textContent =
        `Read from this unit at ${when.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })} · fingerprint ${table.fingerprint} — backups reference this fingerprint so a patch can name a sound another Seven lacks.`;
    };

    const setSoundsOpen = (open) => {
      soundsPanel.hidden = !open;
      soundsBtn.classList.toggle('open', open);
    };
    // ---- Instrument settings (the nine globals) ---------------------------
    // Every slot is shown, because a raw value is worth seeing even when we
    // cannot name it. As of 2026-08-12 every global's name AND every one of its
    // values has been read off the instrument (sweep + nine dropdown
    // photographs, docs/protocol.md), so all nine are real named choices here.
    const settingsBtn = document.getElementById('settings-button');
    const settingsPanel = document.getElementById('settings-panel');
    // The field table comes from the main process WITH the values — one
    // source of truth, sitting beside the wire guard that enforces it, so a
    // label this panel can show is exactly a value the instrument will accept.
    // Nothing here knows what a global means on its own.
    // What counts as "off" — the device's words, so the switch shows its
    // vocabulary rather than ours.
    const OFF_WORDS = new Set(['OFF', 'No']);

    const renderSettings = (g) => {
      const rows = settingsPanel.querySelector('.settings-rows');
      const writable = new Set(g.writable || []);
      const fields = g.fields || [];
      rows.replaceChildren(...g.glb.map((value, index) => {
        const field = fields[index] || { name: `Global ${index}`, labels: {} };
        const canWrite = writable.has(index) && field.complete;
        const row = document.createElement('div');
        row.className = `set-row${canWrite ? '' : ' is-unverified'}`;
        const name = document.createElement('span');
        name.className = 'set-name';
        name.textContent = field.name;
        row.appendChild(name);

        // A two-value field whose LOW value is an off-word gets a switch. The
        // test is on the device's own label, not on the range: Sustain Pol.
        // (N.C./N.O.) and Volume Type (From Preset/Global) are two-valued too,
        // and neither has an off — a switch would invent one and leave you
        // guessing which end "on" meant.
        const isSwitch = canWrite && field.max === 1 && OFF_WORDS.has(field.labels[0]);

        if (isSwitch) {
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'set-toggle';
          btn.setAttribute('aria-pressed', String(value === 1));
          // The instrument's word for the state it is in — "Yes", not our "On".
          btn.textContent = field.labels[value];
          btn.addEventListener('click', async () => {
            btn.disabled = true;
            const r = await window.sevenAPI.midi.setGlobal(index, value === 1 ? 0 : 1);
            btn.disabled = false;
            if (!r.ok) return toast(r.error || 'The Seven refused that change');
            const fresh = await window.sevenAPI.midi.globals();
            if (fresh.ok) renderSettings(fresh);
          });
          row.appendChild(btn);
        } else if (canWrite) {
          const options = [];
          for (let v = 0; v <= field.max; v++) options.push({ value: v, label: field.labels[v] });
          const pick = SevenPicker.create({
            value, options, label: field.name,
            onChange: async (wanted) => {
              pick.disabled = true;
              const r = await window.sevenAPI.midi.setGlobal(index, wanted);
              pick.disabled = false;
              if (!r.ok) {
                toast(r.error || 'The Seven refused that change');
                renderSettings(g); // put the control back to what the device holds
                return;
              }
              // Re-read rather than assume: the panel shows what the instrument
              // reports it now holds, not what we asked for.
              const fresh = await window.sevenAPI.midi.globals();
              if (fresh.ok) renderSettings(fresh);
            },
          });
          row.appendChild(pick);
        } else {
          // A field whose values are not all named stays readable and stays
          // unwritable — the number is still worth seeing.
          const tag = document.createElement('span');
          tag.className = 'set-guess';
          tag.textContent = 'not all values named';
          tag.title = 'Some of this setting\u2019s values have not been read off the ' +
            'instrument, so the app will not write it.';
          name.appendChild(tag);
          const val = document.createElement('span');
          val.className = 'set-value';
          val.textContent = field.labels[value] !== undefined ? field.labels[value] : value;
          row.appendChild(val);
        }

        return row;
      }));
      // Tuning stays, as a row with the settings it belongs to. The prose that
      // used to sit under them explained that instrument settings live on the
      // instrument, which the panel already says by being the instrument's
      // settings (Daniel, 2026-08-12).
      const tuning = document.createElement('div');
      tuning.className = 'set-row';
      const tName = document.createElement('span');
      tName.className = 'set-name';
      tName.textContent = 'Tuning';
      const tVal = document.createElement('span');
      tVal.className = 'set-value';
      tVal.textContent = `${g.tun} Hz`;
      tuning.append(tName, tVal);
      rows.appendChild(tuning);
      const foot = settingsPanel.querySelector('.settings-foot');
      foot.textContent = '';
      foot.hidden = true;
    };

    const setSettingsOpen = async (open) => {
      settingsPanel.hidden = !open;
      settingsBtn.classList.toggle('open', open);
      if (!open) return;
      const g = await window.sevenAPI.midi.globals();
      if (g.ok) return renderSettings(g);
      // These are the INSTRUMENT's settings, so there is nothing to show
      // without one — but the gear stays put and says so, rather than
      // disappearing and leaving you hunting for it.
      settingsPanel.querySelector('.settings-rows').replaceChildren();
      const foot = settingsPanel.querySelector('.settings-foot');
      foot.hidden = false;
      foot.textContent =
        'These are the Seven\u2019s own settings, read from the instrument. Connect it to see them.';
    };
    settingsBtn.addEventListener('click', () => setSettingsOpen(settingsPanel.hidden));
    document.addEventListener('click', (e) => {
      if (!settingsPanel.hidden && !settingsPanel.contains(e.target) &&
          !settingsBtn.contains(e.target)) setSettingsOpen(false);
    });

    soundsBtn.addEventListener('click', () => setSoundsOpen(soundsPanel.hidden));
    document.addEventListener('click', (e) => {
      if (!soundsPanel.hidden && !soundsPanel.contains(e.target) && e.target !== soundsBtn) {
        setSoundsOpen(false);
      }
    });

    const showStatus = (s, error) => {
      connRow.className = s.state === 'connected' ? 'connected'
        : s.state === 'connecting' ? 'connecting'
        : error ? 'failed' : '';
      if (s.state === 'connected') {
        // "Pronto" — ready, and what an Italian says answering the phone:
        // the instrument has just spoken for the first time. Crumar was built
        // in Castelfidardo; this is the one place the app nods to that.
        // Firmware stays visible beside it — every protocol fact in this
        // project is version-gated, so the version is never decoration.
        // The device's firmware STRING is the whole banner — "CRUMAR Seven
        // v.1.37 Build date: Thu May 12 15:43:17 2022" — which repeats the
        // instrument name we just printed. Show the version; the full string
        // is one hover away, and stays verbatim there (Rule 5 in spirit: the
        // raw is never replaced by the tidied view, only summarised).
        const raw = String(s.firmware || '');
        const version = (/v\.?\s*([\d.]+)/i.exec(raw) || [])[1] || raw;
        connText.innerHTML =
          `Pronto · <span class="conn-name">Crumar Seven</span>` +
          `<span class="conn-fw" title="${esc(raw)}">${esc(version)}</span>`;
        connBtn.textContent = 'Disconnect';
        if (s.soundTable) {
          soundsBtn.textContent = `${s.soundTable.sounds.length} sounds`;
          setSoundList(s.soundTable);
          renderSoundsPanel(s.soundTable);
        }
      } else if (s.state === 'connecting') {
        connText.textContent = 'Connecting…';
      } else {
        connText.textContent = error || 'No instrument connected';
        // The failure messages are full sentences and the strip clips them —
        // the tooltip is where the rest of the instruction lives.
        connText.title = error || '';
        connBtn.textContent = 'Connect';
      }
      // After the row's class is updated, so the re-render sees the new state.
      if (s.state !== 'connected') {
        audition.clearLive();
        liveSound = null; // no buffer, nothing for it to describe
        hideToast(); // nothing is in progress once the instrument is gone
      }
      connBtn.disabled = s.state === 'connecting';
      backupBtn.hidden = s.state !== 'connected';
      soundsBtn.hidden = s.state !== 'connected' || !s.soundTable;
      // Always offered: a settings gear that vanishes is a settings gear you
      // go looking for. It is the PANEL that reports there is no instrument.
      if (s.state !== 'connected') {
        backupRunning = false;
        setSoundsOpen(false);
        setSettingsOpen(false);
      }
    };

    const fmtElapsed = (ms) => `${Math.round(ms / 1000)}s`;

    const showBackupDone = (ev) => {
      backupRunning = false;
      backupBtn.textContent = 'Back up instrument';
      connBtn.disabled = false;
      if (!ev.ok) {
        connText.textContent = `Backup ${ev.slots ? `stopped after ${ev.slots}/32` : 'failed'} — ${ev.error || 'aborted'}`;
        return;
      }
      const where = ev.restored
        ? `returned to Bank ${ev.finalBank} · Preset ${ev.finalPreset}`
        : `Bank ${ev.finalBank} · Preset ${ev.finalPreset} is loaded`;
      const counts = `${ev.unchanged} unchanged, ${ev.created} new`;
      connText.textContent = ev.cancelled
        ? `Backup cancelled at ${ev.slots}/32 — ${counts} · ${where}`
        : `Backed up 32/32 in ${fmtElapsed(ev.durationMs)} — ${counts} · ${where}`;
      refreshLibrary();
      // Say it plainly, not only in the connection row. A backup is the thing
      // this app exists for, and it finishing deserves more than a line of
      // status text changing behind you (Daniel, 2026-08-13). Cancelled runs
      // get the same shape with the honest number — they DID save what they
      // reached, and that is worth confirming rather than treating as a
      // failure.
      const n = ev.cancelled ? ev.slots : 32;
      SevenModal.confirm({
        title: ev.cancelled ? 'Backup cancelled' : 'Backup completato!',
        bodyHtml:
          `<p class="bk-sum">${n} preset${n === 1 ? '' : 's'} backed up<br>to your computer</p>` +
          `<p class="bk-time">(${esc(counts)})</p>`,
        confirmLabel: 'Done',
        cancelLabel: 'Close', // the corner X's accessible name, not a button
      });
    };

    backupBtn.addEventListener('click', async () => {
      if (backupRunning) {
        await window.sevenAPI.midi.cancelBackup();
        backupBtn.textContent = 'Cancelling…';
        return;
      }
      // End any live session FIRST, and let its recall land. A backup recalls
      // each slot and reads the edit buffer — so if something is auditioning
      // when the run reaches that slot, the buffer's contents get written down
      // as the preset. That happened on 2026-08-12: Bank 2 Preset 4 was
      // recorded as a bare Clavi Piano while the instrument still held Shapes
      // Clav. The record was wrong, not the Seven, which is the worse failure
      // of the two — a backup that lies is worse than one that refuses.
      if (audition.endSession()) await new Promise((r) => setTimeout(r, 600));
      // Confirm in one of our own modals. The wording comes from the main
      // process, which is the only side that knows whether the panel has told
      // us which preset the Seven is sitting on.
      const plan = await window.sevenAPI.midi.backupPlan();
      if (!plan || !plan.ok) return;
      const go = await SevenModal.confirm({
        title: plan.title,
        bodyHtml: plan.bodyHtml,
        confirmLabel: plan.confirmLabel,
        cancelLabel: 'Cancel',
      });
      if (!go) return;
      const { started } = await window.sevenAPI.midi.backup();
      if (started) {
        backupRunning = true;
        backupBtn.textContent = 'Cancel backup';
        connBtn.disabled = true;
        connText.textContent = 'Backing up… starting';
      }
    });

    connBtn.addEventListener('click', async () => {
      const connected = connRow.classList.contains('connected');
      // Disconnecting BY HAND means "leave it alone" — auto-connect stays off
      // until this session asks again, or the app is relaunched. Anything else
      // would fight the user.
      autoConnectSuspended = connected;
      try {
        if (connected) await window.sevenAPI.midi.disconnect();
        else await window.sevenAPI.midi.connect();
      } catch (err) {
        // Message text comes from the layer (already user-facing).
        showStatus({ state: 'disconnected' }, err.message.replace(/^.*Error: /, ''));
      }
    });

    // ---- Auto-connect ------------------------------------------------------
    // Connecting is not passive: it probes for life, reads the sound table and
    // pins the Send PC global (restoring it on disconnect). So this only fires
    // when a Seven is actually on the bus, never speculatively, and it backs
    // off after a failure until the port comes and goes again — a device that
    // refuses to answer should not be poked every three seconds forever.
    let autoConnectSuspended = false;
    let lastPresence = false;
    let failedWhilePresent = false;

    async function autoConnectTick() {
      if (connRow.classList.contains('connecting')) return;
      const connected = connRow.classList.contains('connected');
      const present = await window.sevenAPI.midi.present();

      // Unplugged while connected. Nothing tells us — MIDI has no hang-up — so
      // the port simply stops existing and the app would otherwise keep saying
      // Pronto to an instrument that left. Drop back to the manual state.
      if (connected && !present) {
        lastPresence = false;
        failedWhilePresent = false;
        try {
          await window.sevenAPI.midi.disconnect();
        } catch { /* already gone; the Send PC marker survives for next launch */ }
        showStatus({ state: 'disconnected' }, 'The Seven was unplugged.');
        return;
      }
      if (connected) return;
      if (autoConnectSuspended) return;
      if (!present) {
        // Unplugged: forget the earlier failure, so replugging tries again.
        lastPresence = false;
        failedWhilePresent = false;
        return;
      }
      const justAppeared = !lastPresence;
      lastPresence = true;
      if (failedWhilePresent && !justAppeared) return;
      try {
        await window.sevenAPI.midi.connect();
      } catch (err) {
        failedWhilePresent = true;
        showStatus({ state: 'disconnected' }, err.message.replace(/^.*Error: /, ''));
      }
    }

    autoConnectTick();
    setInterval(autoConnectTick, 3000);

    window.sevenAPI.midi.onEvent((ev) => {
      if (ev.type === 'status') showStatus(ev, ev.error);
      else if (ev.type === 'backup-progress') {
        connText.textContent =
          `Backing up… ${ev.n}/${ev.total} — Bank ${ev.bank} · Preset ${ev.preset} · ${ev.name} · ${fmtElapsed(ev.elapsedMs)}`;
      } else if (ev.type === 'backup-done') showBackupDone(ev);
      else if (ev.type === 'current-sound') {
        // The device broadcasts this on every sound change. While live it is
        // the buffer telling us what it now holds; otherwise it belongs to a
        // recall, which ends the live session anyway.
        // Ignore it while a load is in flight: the broadcast belongs to the
        // patch being sent, and by the time it arrives the selection may have
        // moved on — which showed the PREVIOUS patch's instrument in the
        // header, one step behind the list (Daniel, 2026-08-12, arrowing
        // through the library).
        if (audition.isLive() && !audition.isBusy()) {
          const found = soundList.find((x) => x.id === ev.soundId);
          const patch = currentPatch();
          if (found && patch && found.name !== patch.soundName) {
            liveSound = found;
            renderDetail();
          } else if (found && patch && found.name === patch.soundName && liveSound) {
            liveSound = null; // back to what the patch names
            renderDetail();
          }
        }
      }
      else if (ev.type === 'transfer-stored') {
        // The instrument's own evidence that the hold landed. It advances the
        // walk exactly where the button would have — one path forward, so the
        // manual answer and the observed one can never disagree.
        if (transferStored) transferStored(ev);
      }
      else if (ev.type === 'panel-cc') {
        audition.onPanelCc(ev.cc);
      } else if (ev.type === 'program-change' && !backupRunning) {
        // A recall replaces the edit buffer wholesale, so anything we were
        // holding there is gone. Say so instead of leaving controls that look
        // live but are editing a different preset.
        // A Program Change while live can mean two opposite things: the user
        // recalled a different preset (the buffer is replaced, edits lost), or
        // the user HELD a preset button to store what they just made (the
        // buffer is intact and the edit is now permanent). Announcing loss for
        // both told people their work was gone at the exact moment they saved
        // it. So ask the instrument instead of guessing.
        // The module decides whether this is the echo of a recall the app
        // sent, or the player reaching for the panel. During a transfer every
        // PC is ours, so the question doesn't arise.
        const ours = transferRunning || audition.onProgramChange(ev);
        // Send PC on: panel recalls are slot-identified, so the bank region
        // follows the hardware — but only when it was the HARDWARE. Following
        // our own echo moved the selection out from under a player browsing
        // the library, and the next arrow key then walked the other list.
        if (!ours) {
          deviceSel = { bank: ev.bank - 1, preset: ev.preset - 1 };
          bankIndex = ev.bank - 1;
          lastTouched = 'device';
          resetCollapsed();
          renderAll();
        }
      }
      // current-sound events also arrive here (recalls without Send PC give
      // sound identity but not the slot — not enough to move the selection).
    });

    window.sevenAPI.midi.status().then((s) => showStatus(s));
  }

  resetCollapsed();
  renderAll();
})();
