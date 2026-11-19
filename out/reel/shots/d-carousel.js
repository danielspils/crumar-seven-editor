// SHOT D — THE CARD STACK, turned both ways.
//
// The depth stack is the thing this rig exists for: its transition is 0.3s,
// which at 15fps is four frames and reads as teleporting. Under SLOWMO it is
// 1.2s of real capture played back at 60fps, so the cards actually travel.
//
// BOTH DIRECTIONS, because they are not mirrors. Forward sends the front card
// 90% of a card-width out to +40% while the next one shifts 14%; backward
// brings a card in along that SAME corridor — one value, changed 18 Nov, so a
// card returns from exactly where it leaves — onto a front card that barely
// moves. They cross on the way back and they separate on the way out.
//
// OFFLINE IT MARKS ITSELF UNVERIFIED, which is correct and is left alone:
// with no instrument the app will not claim a sound is installed, and the
// faded cards are the app being honest rather than a defect in the shot.
(async () => {
  await ui.selectTab('patches');
  await ui.openLibrary();
  await ui.sleep(380);
  const row = ui.$('#library .lib-row.lib-patch, #library [data-file]');
  if (row) { ui.click(row, 'a patch'); await ui.sleep(900); }

  const car = ui.$('#detail .engine-carousel');
  if (!car) return { shot: 'd-carousel', error: 'no stack on screen' };
  car.scrollIntoView({ block: 'center' });
  await ui.sleep(320);

  // HOVER OPENS THE STACK. At rest it is bare — the two cards behind sit at
  // opacity 0 and the chevrons at 22% — so without this the shot would be of
  // a single card with nothing behind it. A turn opens it too, but the
  // opening itself is worth seeing first.
  const stage = ui.$('#detail .engine-stage') || car;
  console.log('[reel-arm]');   // setup done — start capturing here
  await ui.sleep(180);
  stage.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
  stage.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
  await ui.sleep(320);

  const step = (dir) => ui.$(`#detail .engine-carousel .is-step-${dir}`);
  const turns = [];
  for (const dir of ['next', 'next', 'next', 'prev', 'prev']) {
    const b = step(dir);
    if (!b) continue;
    const front = ui.$('#detail .engine-carousel .car-face.is-front');
    turns.push(front ? front.getAttribute('data-car-name') : null);
    ui.click(b, `turning ${dir}`);
    await ui.sleep(340);
  }

  await ui.sleep(200);
  return { shot: 'd-carousel', fromCards: turns };
})()
