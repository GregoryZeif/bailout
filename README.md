# Monopoly 2026: Pay Bibi Edition

A satirical, real-time multiplayer property-trading party game for 2–6 players. Games take about 25–45 minutes and run in desktop and mobile browsers, in **English and Russian**.

Unaffordable housing, student debt, inflation, predatory credit, bureaucratic absurdity and political favoritism are all part of the rules. They aren't just jokes on the cards.

> Satire. All names, people and events are fictional or parodied. No real money is involved.
> "Monopoly" is a trademark of Hasbro. Before any public or commercial deployment, rename the game. The title lives in one place, `app.title` in `src/shared/i18n/*.ts`.

---

## Quick start

Requires **Node 22.12+**. Older Node 22 releases crash when loading `better-sqlite3`.

```bash
npm install
npm run dev          # server on :3001 + Vite client on :5173 (proxied)
```

Open http://localhost:5173 in two different browsers, or in a normal and a private window. Create a room in one, then join it from the other with the 5-letter code or the invite link. Playing alone? Click **+ Add bot** in the lobby.

### Production

```bash
npm run build        # builds client to dist/client and server to dist-server
npm start            # one Node process serves the API, WebSocket and static client
```

| Env var | Default | Purpose |
|---|---|---|
| `PORT` | `3001` | HTTP/WebSocket port |
| `DATA_DIR` | `./data` | SQLite database location (`monopoly.db`) |

Health check: `GET /api/health`.

### Deploying (for example, a Hostinger Node.js web app)

1. Push the repo, or upload it without `node_modules`.
2. Build command: `npm ci && npm run build`. Start command: `npm start`.
3. Set `PORT` if the host assigns one. Point `DATA_DIR` at persistent storage so games survive redeploys.
4. Use a single instance. Room state lives in memory and is saved to SQLite after every change, so don't run several replicas behind a load balancer without sticky sessions plus a shared store.
5. The reverse proxy must allow WebSocket upgrades on `/socket.io/`. If it doesn't, Socket.IO falls back to long-polling.

### Quality checks

```bash
npm run check        # typecheck + eslint + all tests
npm test             # vitest: engine, cards, i18n, full-game simulation, server integration
npm run e2e          # browser playthrough (needs a running server: npm run build && npm start)
```

The E2E script needs Playwright: `npm i -D playwright && npx playwright install chromium`. It drives a desktop host and a mobile guest (Russian UI) through these steps:

- lobby, then game start
- about 200 turns, including auctions, cards, inflation, jail, citizenship tests and debt
- a page refresh, which must restore the game
- property, portfolio and trade screens
- forfeit, then the victory leaderboard

It saves screenshots to `e2e/screenshots/` and fails if the browser console reports any errors.

---

## Architecture

```
src/
  shared/            pure TypeScript, used by server, client and tests
    types.ts         players, properties, cards, trades, debts, actions, game state
    board.ts         the 40-space board, every economy constant (RULES), config defaults and bounds
    cards.ts         62 event cards: effects + EN/RU text (central data file)
    inflation.ts     round-start inflation events
    quiz.ts          citizenship test questions (text only)
    quizAnswers.ts   correct answers: imported only by the engine, never bundled to the client
    rules.ts         pure calculations: rent, credit limit, taxes, wealth, validation helpers
    engine.ts        authoritative rules engine: applyAction() and tick()
    view.ts          per-player state projection + socket protocol types
    i18n/            en.ts, ru.ts and translate()
  server/
    app.ts           Express + Socket.IO: sessions, rooms, idempotent actions, timers, persistence
    db.ts            SQLite (better-sqlite3): sessions (hashed tokens) and room snapshots
    bot.ts           computer-player policy (server-only: it reads quiz answers)
    index.ts         entry point, graceful shutdown
  client/            React + Vite
    store.ts         socket connection, reconnection, action sending with retry-safe ids
    i18n.ts          translation hook, log rendering in the viewer's language
    sound.ts         synthesized WebAudio effects (no assets)
    components/      Menu, Lobby, Board, Center (actions/auction/debt/jail), overlays, panels, modals
tests/               vitest suites
e2e/                 Playwright playthrough
```

**Server-authoritative.** Clients send *intents* such as `{type: 'buy'}`. The server looks up the player from the session token and applies the action on a **clone** of the room state with the engine. It commits and broadcasts only if no rule was broken. Clients never send amounts they could inflate. Prices, rent, dice and card effects are all computed on the server.

**Atomicity and duplicates.**
- Node handles each socket message to completion. Every room action (clone → apply → commit) runs synchronously, so two actions can never interleave. This rules out double-spending races.
- Each action carries a client-generated `actionId`. The server records recent ids per room, so a network retry is acknowledged without being applied twice.

**Persistence and recovery.**
- After every change, the room is saved to SQLite.
- The identity token is stored hashed and lives in the browser's `localStorage`. That's only a convenience; the database is the source of truth.
- Refreshing or reconnecting re-attaches you to the same seat.
- On a server restart, rooms are reloaded and all players get a fresh reconnection grace period.

**Disconnection policy (host-configurable).**
- Within the grace period (default 60 s), a disconnected player keeps full turn time.
- After that, their turns run on autopilot with an 8-second timer. Autopilot only rolls, declines purchases, ends turns, and liquidates assets if a debt is due.
- After the forfeit timeout (default 10 min, `0` = never), they forfeit.
- If the host disconnects, hosting passes to another connected player.

**Testability.** The engine takes `now` and `rng` as parameters, so tests are fully deterministic. That covers seeded simulations as well as tests that script exact dice rolls.

---

## Rooms, bots and settings

- **Private rooms** are joined by code or invite link. **Public rooms** are also listed under *Open public rooms* on the main menu while they wait in the lobby with a free seat and their host online. The host can switch between the two in the lobby.
- **Bots:** the host adds or removes bots in the lobby; they are always ready and count toward the 2–6 players. The server plays them one paced move at a time (`botDelayMs`, default 1.1 s): they buy when they can keep a cash reserve, bid up to about 90% of a property's worth, upgrade complete sets, use jail cards or the citizenship test, liquidate sensibly in debt, and accept only trades clearly in their favor. Bots never become host, and a lobby with only bots left is deleted.
- **Settings:** the lobby shows three one-tap choices: game length, turn timer and starting money. **Advanced settings** reveals every configurable value.

## Game rules (as implemented)

### Money
- Everyone starts with **$1,500**. Properties cost **$2,000–$12,000**, so your first purchase is a credit decision.
- **Passing or landing on Start (Debt Collection):** collect the **$2,000 salary** (inflation-adjusted by exactly 0%), then pay **$200 in student loans**.
- **Predatory Credit Line:** borrow in $100 steps, up to $2,000 plus 50% of the value of your unmortgaged property. Interest (5% per turn, which inflation can raise) is charged at the start of each of your turns. Repay at any time.
- **Cash never goes negative.** If you can't pay, an explicit **debt** is recorded. You must then raise cash by:
  - selling renovations
  - mortgaging property
  - borrowing
  - selling property to other players for cash
  - or declaring bankruptcy

  The game waits for the debtor for up to 60 s. When that runs out, assets are sold off automatically in this order: renovations, then mortgages, then credit. If that still isn't enough, the debtor goes bankrupt.
- **Bankruptcy to a player:** renovations are sold back to the bank at half price. Then all cash, property (mortgages stay in place) and Get Out of Court cards go to the creditor.
- **Bankruptcy to the bank:** properties return to the bank and are **auctioned** one by one. Either way, the bankrupt player's loan is written off.

### Property
- Land on an unowned property: **buy** it, or **decline** and it goes to a timed **auction** open to all solvent players. Each bid adds at least $100, and every bid extends the timer to at least 6 s. Properties priced $8,000 or more also carry a **10% luxury tax**.
- **Rent:** 10% of the price. Owning the full color group **doubles** it. Upgrades multiply the base rent: Luxury Renovation ×3/×7/×12/×17, then **Billionaire Compound** ×24. Infrastructure: $500/$1,000/$2,000/$4,000 depending on how many you own. Utilities: dice × 100, or × 250 if you own both. Mortgaged properties collect no rent.
- **Renovations** require the full group with nothing mortgaged. You must build and sell evenly across the group, and only on your own turn. Each costs 50% of the price, adjusted for inflation; selling one refunds half its base cost.
- **Mortgage** for 50% of the price; redeem for 55%. You must sell the group's renovations first.

### Taxes and the bailout
- **Property Ownership Tax:** $150 + $100 per property + $50 per renovation.
- **Emergency Government Spending:** $500.
- Both scale with inflation.
- Half of all taxes, fines and card payments go into the **Government Bailout** fund. Whoever lands on that space collects the whole fund.

### Inflation
- From round 3 on, each round has a 35% chance (configurable) of an inflation event: rent +25%, groceries for everyone, interest rates doubling, fees +10% ("salary adjusted by exactly 0%"), or prices +10%.
- Every multiplier is capped (rent ×2.5, fees ×2.5, prices ×2, interest 20%), so the game stays winnable.

### Immigration Court (jail)
- Three ways in: the Go to Court space, a card, or rolling three doubles in a row.
- On each turn in court, pick one:
  - pay **$1,000**
  - use a **Get Out of Court** card
  - take the **Citizenship Test**: 3 random absurd questions, all must be right. Failing costs a re-application fee and ends your turn.
  - try to **roll 13+ on 2d6**. It never works, but it's free.
- You're **guaranteed release** after 3 turns. You still collect rent while in court.

### Turns
1. Optional actions before rolling (manage assets, trade, chat)
2. Roll
3. Move
4. Resolve the space (rent, tax, card, purchase or auction, jail)
5. Optional actions after rolling
6. End turn

Doubles give another roll; three doubles in a row sends you to court. Each step has a timer, and when it runs out the default safe action is taken.

### Trades and alliances
- **Trades:** any mix of cash, properties (only from groups with no renovations) and cards, at any time.
  - Both sides are re-validated at the moment of acceptance.
  - Offers expire (60 s by default) and can be withdrawn.
  - You can answer with a **counteroffer**. Accepting asks for confirmation.
  - While you're in debt, you can only sell property for cash. You can't gift assets away to escape a creditor.
- **Alliances:** nonbinding. Allies pay each other 20% less rent for 3 rounds. **Betrayal** is announced to everyone.

### End of game
- The **last solvent player** wins.
- With a time limit (default **45 minutes**, or set it to 0 to play until one player is left), the game ends at the first stable moment after time runs out. The winner has the highest **net worth**: cash + property + renovations − mortgages − loans. The end screen shows the full breakdown.

---

## Extending

- **New card:** add an entry to `CARDS` in `src/shared/cards.ts`.
  - Use the existing effect types (pay, collect, move, jail, per-asset fees, transfers, economy shifts, loans, inheritance, choices).
  - Put `{amount}`-style placeholders in the EN and RU text; they're filled from the effect values.
  - `tests/cards.test.ts` automatically checks that the placeholders match, that both languages exist, and that the card applies through the engine.
- **New language:** add `src/shared/i18n/xx.ts` with the same keys (a test enforces key parity), add the language to `Lang` and `LANGS`, and add card, quiz and inflation text.
- **Balance:** every number lives in `RULES` and `DEFAULT_CONFIG` in `src/shared/board.ts`. `tests/simulation.test.ts` plays bot games, which is a quick way to check the effect of a change.
