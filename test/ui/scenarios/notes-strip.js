// THE NOTES STRIP — the test that would have caught the bug that prompted it.
//
// The main process has answered `notes:latest` since 2026-08-10. Nothing in
// the renderer ever called it, so the strip could not appear for anyone, and
// because a missing strip is ALSO its normal state, ten days went by with no
// sign (Daniel, 2026-08-20). Every failure of this feature looks exactly like
// its idle state; that is precisely why it needs a test rather than a glance.
//
// @env SEVEN_RESET_NOTES=1
//
// IT ARRANGES ITS OWN PRECONDITION, with the line above. This scenario
// DISMISSES the post it tests — the half of the feature most worth asserting,
// since a dismissal that isn't recorded means the strip returns forever — and
// dismissal is permanent. So it destroyed the state it needs, passed exactly
// once, and every run after that failed with "already dismissed · run with
// SEVEN_RESET_NOTES=1". Correct, loud, and useless: CI will never read that and
// re-run, and neither will a person in a hurry.
//
// The runner reads the @env line and launches with it (test/ui/run.js). The
// declaration is in the source, so what state this test assumes is visible to
// anyone reading it rather than living in somebody's shell history.
//
// SEVEN_NOTES_DEBUG is REFUSED by the runner, not merely discouraged: it
// suspends the seen check this scenario ends by asserting, so declaring it
// would leave a green test asserting nothing.
//
// It goes to the LIVE feed on purpose. A stubbed feed would prove the renderer
// can draw a line from an object it was handed, which was never in doubt — the
// things that actually break are the feed's shape, the site prefix check, and
// whether anything calls the handler at all. Offline it says so and skips
// rather than failing, the way the hardware scenarios do.
(async () => {
  const strip = () => ui.$('#notes-strip');
  const openBtn = () => ui.$('#notes-strip-open');
  const visible = () => !!strip() && !strip().hidden && !!strip().offsetParent;

  // The renderer asks once at launch, so by the time a scenario runs the answer
  // has usually landed. Give the fetch its own budget rather than a fixed sleep.
  const shown = await ui.waitFor(() => visible(), { timeout: 9000, what: 'the Notes strip' });

  if (!shown) {
    // Distinguish "the feature is broken" from "there was nothing to show".
    // Only the main process knows which, and it logs the reason — so ask it
    // the same question and report what came back.
    const latest = await window.sevenAPI.notes.latest();
    // OFFLINE IS THE ONLY EXCUSE. Every other decline — a 404, a shape that no
    // longer matches, a link the prefix check rejects — is this feature being
    // broken, and must fail rather than skip. Skipping on all of them would
    // rebuild the exact property that hid the original bug: a green run that
    // means nothing (Daniel, 2026-08-20).
    if (latest && !latest.ok && /^feed unreachable/.test(latest.reason || '')) {
      ui.note(`skipped: no network — ${latest.reason}`);
      return;
    }
    if (!latest || !latest.ok) {
      ui.check(false, `the feed gave nothing to show — ${(latest && latest.reason) || 'no reason given'}`);
      return;
    }
    if (latest.seen) {
      // With @env SEVEN_RESET_NOTES=1 the state is cleared at launch, so this
      // is no longer "you forgot a flag" — it means the reset did not happen,
      // and the scenario is about to assert nothing. Still a failure, and now
      // a failure about the harness rather than an instruction to the reader.
      ui.check(false,
        'the post is already dismissed despite the declared reset — is @env being applied?');
      return;
    }
    // The feed WAS good and the post WAS unseen, and still no strip. That is
    // the bug this scenario exists for: nothing consumed the answer.
    ui.check(false,
      `the feed offered "${latest.title}" and nothing rendered — is the renderer half wired up?`);
    return;
  }

  ui.check(true, 'the strip is on screen');

  // ── the copy ────────────────────────────────────────────────────────────
  const text = openBtn().textContent.trim();
  ui.check(/^New in Notes — /.test(text), `it reads "New in Notes — <title>": ${text}`);

  // A TITLE IS THE WHOLE STRIP. "New in Notes —" pointing at nothing is the
  // degraded case the handler now refuses outright, so it must never render.
  const title = text.replace(/^New in Notes — /, '').trim();
  ui.check(title.length > 0, `the title is not empty: ${JSON.stringify(title)}`);

  // …and it is the feed's actual newest entry, not a placeholder.
  const latest = await window.sevenAPI.notes.latest();
  ui.check(latest.ok && title === latest.title,
    `the strip names the feed's newest post (strip: ${JSON.stringify(title)}, feed: ${JSON.stringify(latest.title)})`);
  ui.check(String(latest.url).startsWith('https://thissevengoestoeleven.com/'),
    `the link points at the site: ${latest.url}`);

  // ── dismissal ───────────────────────────────────────────────────────────
  ui.click(ui.$('#notes-strip-close'), 'the dismiss button');
  await ui.sleep(400);
  ui.check(!visible(), 'dismissing hides it');

  // And it stays dismissed: the main process should now consider it seen, which
  // is what stops it returning on the next launch.
  const after = await window.sevenAPI.notes.latest();
  ui.check(after.ok && after.seen === true,
    'the dismissal was recorded, so the next launch stays quiet '
    + '(if this is the only failure, check SEVEN_NOTES_DEBUG is not set — it '
    + 'deliberately bypasses the seen check this asserts)');
})()
