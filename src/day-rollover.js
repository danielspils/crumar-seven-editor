'use strict';

// A callback at every local midnight, for labels that describe AGE.
//
// "as of last backup · today" is true when it renders and false a few hours
// later. Both places that print it render on a LIBRARY REFRESH, and nothing
// refreshes the library because a clock ticked — so an app left open overnight
// went on saying "today" about yesterday's backup.
//
// THE RE-ARM COMES FIRST, BEFORE THE CALLBACK.
//
// It used to come last, and that made one throw permanent: any exception in the
// render — a null element mid-teardown, a bad date, anything — ended day
// tracking for the rest of the session, silently, which is the exact failure
// this exists to prevent. Not try/finally: unconditional beats depending on
// getting the finally right, and the ordering is impossible to misread.
//
// The callback's exception is NOT swallowed. It propagates to the host so it
// reaches the console like any other renderer error; the only thing guaranteed
// here is that the next tick is already scheduled by the time it does.
//
// Pure, with the clock and the timer injected, so `npm test` can prove that
// property against a callback that throws every single time — which is not
// something a test can do to a closure inside app.js, and not something anyone
// would wait until midnight to observe.

// 00:00:30 rather than 00:00:00. Timers fire on or a hair after their deadline,
// and a callback that lands at 23:59:59.998 recomputes "today" as the old day
// and then arms a second timer 2ms later. Half a minute of slack costs nothing
// — the label is measured in days.
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.SevenDayRollover = api;
})(typeof window !== 'undefined' ? window : null, function () {

const SLACK_MS = 30000;

function msUntilNextMidnight(now) {
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0, 0);
  // Local midnight via the date constructor, NOT now + 86400000: a DST boundary
  // makes the day 23 or 25 hours long, and adding a fixed day drifts an hour
  // either side of the date change twice a year.
  return (next.getTime() - now.getTime()) + SLACK_MS;
}

// onRollover: called once per local midnight.
// Returns a stop(), for a host that tears down without discarding the context.
// Nothing in the app calls it today — closing the window destroys the renderer
// and the pending timer with it — but a module that can only ever be started is
// a leak waiting for the first caller that needs two of them.
function startDayRollover({
  onRollover,
  now = () => new Date(),
  setTimer = setTimeout,
  clearTimer = clearTimeout,
}) {
  let handle = null;
  let stopped = false;

  const arm = () => {
    if (stopped) return;
    handle = setTimer(() => {
      handle = null;
      arm();          // FIRST. See above.
      onRollover();
    }, msUntilNextMidnight(now()));
  };

  arm();
  return {
    stop() {
      stopped = true;
      if (handle !== null) clearTimer(handle);
      handle = null;
    },
  };
}

return { startDayRollover, msUntilNextMidnight, SLACK_MS };
});
