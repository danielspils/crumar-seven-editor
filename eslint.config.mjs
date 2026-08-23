// ONE RULE: no-undef. Everything else is off, deliberately.
//
// Four undefined-reference bugs shipped in a single day — renderBanks(),
// sendToSeven, answer, maybeOfferSendPc — all in renderer files with no unit
// coverage, all invisible to `node --check` (which parses but does not
// resolve) and to both suites. Three were found by Daniel clicking around; the
// fourth by a linter in under a minute.
//
// So this buys ONE guarantee: a name that does not exist gets caught before it
// ships. Not formatting, not unused variables, not prefer-const. If a rule
// would make somebody change code that already works, it is not welcome here —
// a linter that reformats is a linter people turn off.
//
// WHAT IT DOES NOT CATCH, and this matters as much as what it does: a function
// that exists and is never CALLED. That was the Notes strip — a complete,
// working, tested capability with no consumer for ten days — and no-undef is
// blind to it by construction. The greppable check for that is still manual:
//
//     grep -c "sevenAPI\.<name>" src/*.js       # 0 means nobody is using it
//
// GLOBALS ARE ENUMERATED, NOT SUPPRESSED. A one-off run produced five false
// positives (`self`, `CSS`, `AbortSignal`) purely because a throwaway config
// omitted them. Listing them here is the difference between a tool people
// trust and one they learn to skim past.

// The app's own cross-file globals. These are real: each renderer module
// assigns itself onto `window`, and index.html loads them as separate script
// tags, so every file legitimately sees the others.
const SEVEN = [
  'SevenAudition', 'SevenDayRollover', 'SevenDefaults', 'SevenDrift',
  'SevenExpansions', 'SevenKeyRange', 'SevenLibraryView', 'SevenModal', 'SevenModalPanel',
  'SevenOtsFreshness', 'SevenPicker', 'SevenRenderer',
  'SevenScrollFade', 'SevenSendChoice', 'SevenSendPcPrompt', 'SevenSoundArt',
  'SevenStorageLabel', 'SevenToast', 'SevenTransferSummary', 'SevenUndo',
];

const BROWSER = [
  'window', 'document', 'self', 'navigator', 'location', 'console', 'CSS',
  'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval',
  'requestAnimationFrame', 'cancelAnimationFrame', 'performance', 'fetch',
  'URL', 'URLSearchParams', 'Blob', 'File', 'FileReader', 'Image', 'Audio',
  'Event', 'CustomEvent', 'KeyboardEvent', 'MouseEvent', 'DragEvent',
  'PointerEvent', 'getComputedStyle', 'localStorage', 'sessionStorage',
  'DOMParser', 'XMLSerializer', 'crypto', 'structuredClone', 'queueMicrotask',
  'AbortController', 'AbortSignal', 'MutationObserver', 'ResizeObserver',
  'IntersectionObserver', 'HTMLElement', 'Element', 'Node', 'NodeFilter',
  'DataTransfer', 'FontFace', 'matchMedia', 'alert', 'innerWidth', 'innerHeight',
];

const NODE = [
  'require', 'module', 'exports', 'process', '__dirname', '__filename',
  'Buffer', 'global', 'setImmediate', 'clearImmediate', 'TextEncoder',
  'TextDecoder', 'AbortController', 'AbortSignal', 'URL', 'URLSearchParams',
  'console', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval',
  'queueMicrotask', 'structuredClone', 'performance', 'fetch', 'crypto',
];

const as = (names) => Object.fromEntries(names.map((n) => [n, 'readonly']));
const base = {
  linterOptions: { reportUnusedDisableDirectives: false },
  rules: { 'no-undef': 'error' },
};

export default [
  // ---- Renderer: browser globals, plus the app's own shared ones -----------
  //
  // These are loaded as <script> tags and share one global scope, so a name
  // defined in one really is visible in another.
  {
    ...base,
    files: ['src/**/*.js'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'script',
      globals: { ...as(BROWSER), ...as(SEVEN) },
    },
  },

  // ---- Main process and pure modules: Node globals -------------------------
  //
  // Named explicitly rather than by exclusion, so adding a file to the app does
  // not silently grant it the wrong set.
  {
    ...base,
    files: [
      'src/main.js', 'src/preload.js', 'src/seven-midi.js', 'src/library-store.js',
      'src/backup-runner.js', 'src/transfer-runner.js', 'src/patch-sender.js',
      'src/ipc-result.js', 'src/notes-feed.js', 'src/notes-seen.js',
      'src/instrument-report.js', 'src/param-compat.js', 'src/globals-cleanup.js',
      'src/demo-cleanup.js', 'src/donations.js', 'src/mailto.js',
      'src/setlist-text.js', 'src/format/*.js',
      'tools/**/*.js', 'scripts/**/*.js', 'fixtures/**/*.js',
    ],
    languageOptions: { ecmaVersion: 2023, sourceType: 'script', globals: as(NODE) },
  },

  // ---- UMD modules: BOTH, and here is why ----------------------------------
  //
  // Each of these ends in the same wrapper:
  //
  //     if (typeof module !== 'undefined' && module.exports) module.exports = api;
  //     if (root) root.SevenThing = api;
  //
  // …because they are loaded as a <script> in the renderer AND require()d by
  // `npm test`. One file, two runtimes, on purpose — that is what lets a pure
  // module be unit-tested at all, which is the whole reason drift.js,
  // send-choice.js and the rest exist. So both sets are granted, and only to
  // these files.
  {
    ...base,
    files: [
      'src/day-rollover.js', 'src/drift.js', 'src/expansions.js', 'src/modal-panel.js',
      'src/ots-freshness.js', 'src/send-choice.js', 'src/send-pc-prompt.js',
      'src/storage-label.js', 'src/transfer-summary.js', 'src/library-view.js', 'src/renderer.js',
      'src/defaults.js', 'src/sound-art.js',
    ],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'script',
      globals: { ...as(BROWSER), ...as(NODE), ...as(SEVEN) },
    },
  },

  // ---- Unit tests: Node -----------------------------------------------------
  {
    ...base,
    files: ['test/*.test.js'],
    languageOptions: { ecmaVersion: 2023, sourceType: 'script', globals: as(NODE) },
  },

  // ---- The harness and the scenarios: the RENDERER ---------------------------
  //
  // Both are evaluated INSIDE the running app — main.js reads harness.js off
  // disk and injects it into the page (SEVEN_UI_TEST), where it assigns
  // window.ui, and each scenario is evaluated after it. Neither is ever
  // require()d, so neither sees Node globals.
  {
    ...base,
    files: ['test/ui/harness.js', 'test/ui/preview.js', 'test/ui/scenarios/*.js'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'script',
      globals: { ...as(BROWSER), ...as(SEVEN), ui: 'readonly' },
    },
  },

  // ---- The runner: Node. It SPAWNS the app; it does not live inside it. -----
  {
    ...base,
    files: ['test/ui/run.js'],
    languageOptions: { ecmaVersion: 2023, sourceType: 'script', globals: as(NODE) },
  },
];
