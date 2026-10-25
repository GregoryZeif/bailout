const { chromium, devices } = require('playwright');
// Two-browser playthrough: desktop host + mobile guest (Russian UI).
// Usage: npm run build && npm start   (in another shell)  then  npm run e2e
const fs = require('fs');
const OUT = process.argv[2] || 'e2e/screenshots';
const BASE = process.env.BASE_URL || 'http://localhost:3001';
fs.mkdirSync(OUT, { recursive: true });
(async () => {
  const browser = await chromium.launch();
  const ctxA = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const ctxB = await browser.newContext({ ...devices['iPhone 13'] });
  const a = await ctxA.newPage(); const b = await ctxB.newPage();
  const errors = [];
  for (const [n, p] of [['A', a], ['B', b]]) {
    p.on('console', (m) => m.type() === 'error' && errors.push(`${n}: ${m.text()}`));
    p.on('pageerror', (e) => errors.push(`${n} pageerror: ${e.message}`));
  }
  await a.goto(BASE);
  await a.fill('input[maxlength="20"]', 'Alice');
  await a.screenshot({ path: `${OUT}/01-menu.png` });
  await a.click('button.primary.big');
  await a.waitForSelector('[data-testid=room-code]');
  const code = (await a.textContent('[data-testid=room-code]')).trim();
  await b.goto(BASE);
  await b.click('.seg button:has-text("RU")');
  await b.fill('input[maxlength="20"]', 'Борис');
  await b.fill('.join-row input', code);
  await b.click('.join-row button');
  await b.waitForSelector('[data-testid=ready]');
  await b.click('[data-testid=ready]');
  await a.waitForTimeout(400);
  await a.screenshot({ path: `${OUT}/02-lobby.png` });
  await b.screenshot({ path: `${OUT}/02-lobby-mobile.png`, fullPage: true });
  await a.click('[data-testid=start]');
  await a.waitForSelector('.board');
  await b.waitForSelector('.board');
  const pages = { A: a, B: b };
  const seenShots = new Set();
  for (let step = 0; step < 220; step++) {
    for (const [n, p] of Object.entries(pages)) for (const [sel, name] of [['.quiz-modal .quiz-opt', 'quiz'], ['.debt-box', 'debt'], ['.card-modal', 'card'], ['.jail-box', 'jail'], ['.auction-box', 'auction'], ['.inflation', 'inflation']]) {
      if (!seenShots.has(name+n) && await p.$(sel)) { seenShots.add(name+n); await p.screenshot({ path: `${OUT}/s-${name}-${n}.png` }); }
    }
    let acted = false;
    for (const [n, p] of Object.entries(pages)) {
      // dismiss info modals
      const closeBtn = await p.$('.card-modal .modal-head .icon-btn, .quiz-modal .modal-head .icon-btn, .modal-head .icon-btn');
      if (closeBtn) { await closeBtn.click().catch(() => {}); }
      for (const sel of ['[data-testid=roll]', '[data-testid=buy]:not([disabled])', '[data-testid=decline]', '.auction-box .ghost.small', '[data-testid=settle]:not([disabled])', '.card-modal .btn-col button', '[data-testid=quiz]', '.quiz-opt', '[data-testid=end-turn]']) {
        const el = await p.$(sel);
        if (el && await el.isVisible()) {
          await el.click().catch(() => {});
          acted = true;
          await p.waitForTimeout(450);
          break;
        }
      }
      if (step === 6 && n === 'A') await p.screenshot({ path: `${OUT}/03-game-desktop.png` });
      if (step === 6 && n === 'B') await p.screenshot({ path: `${OUT}/03-game-mobile.png`, fullPage: true });
    }
    if (!acted) await a.waitForTimeout(500);
  }
  await a.screenshot({ path: `${OUT}/04-game-desktop-later.png` });
  await b.screenshot({ path: `${OUT}/04-game-mobile-later.png` });
  // refresh B and ensure the game is restored
  await b.reload();
  await b.waitForSelector('.board', { timeout: 8000 });
  console.log('refresh restored board: ok');
  // open portfolio & trade modal on A
  await a.click('[data-testid=portfolio]');
  await a.waitForTimeout(300);
  await a.screenshot({ path: `${OUT}/05-portfolio.png` });
  await a.keyboard.press('Escape');
  await a.click('.player-actions .ghost.small');
  await a.waitForTimeout(300);
  await a.screenshot({ path: `${OUT}/06-trade.png` });
  await a.keyboard.press('Escape');
  await a.click('.tile[data-space="39"]');
  await a.waitForTimeout(300);
  await a.screenshot({ path: `${OUT}/07-property.png` });
  await a.keyboard.press('Escape');
  // forfeit from A's menu -> B should see the end screen leaderboard
  await a.click('button[aria-label="Menu"]');
  await a.click('.modal .danger');
  await a.click('.confirm-inline .danger');
  await b.waitForSelector('[data-testid=leaderboard]', { timeout: 8000 });
  await b.screenshot({ path: `${OUT}/08-end-mobile.png` });
  await a.waitForTimeout(500);
  await a.screenshot({ path: `${OUT}/08-end-desktop.png` });
  console.log('victory screen: ok');
  const log = await b.$$eval('.log-list li', (els) => els.slice(0, 5).map((e) => e.textContent));
  console.log('B log (ru):', log);
  console.log('ERRORS', JSON.stringify(errors));
  if (errors.length) process.exitCode = 1;
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
