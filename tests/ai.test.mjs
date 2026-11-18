// Opponent AI: full bot-vs-bot matches must run cleanly, stronger profiles must win more,
// and the bot must stay cheap per simulation step.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../js/sim/world.js';
import { Bot } from '../js/ai/bot.js';
import { OPPONENTS, DEFAULT_DECK } from '../js/data/cards.js';
import { SIM_DT } from '../js/config.js';

const DECKS = [DEFAULT_DECK, ...OPPONENTS.map((o) => o.deck)];

function match(seed, d0, d1, deck0, deck1) {
  const w = new World({ seed, decks: [deck0, deck1] });
  const bots = [new Bot(w, 0, { difficulty: d0, seed }), new Bot(w, 1, { difficulty: d1, seed: seed + 1 })];
  let botMs = 0, calls = 0, plays = [0, 0];
  const orig = w.playCard.bind(w);
  w.playCard = (team, i, x, z) => { const ok = orig(team, i, x, z); if (ok) plays[team]++; return ok; };
  let leak = [0, 0], maxLeak = [0, 0];
  for (let step = 0; step < 30 * 400 && w.phase !== 'ended'; step++) {
    const t0 = performance.now();
    bots[0].update(SIM_DT); bots[1].update(SIM_DT);
    botMs += performance.now() - t0; calls += 2;
    w.step(SIM_DT);
    for (let k = 0; k < 2; k++) {
      leak[k] = w.players[k].aether >= 9.99 ? leak[k] + SIM_DT : 0;
      maxLeak[k] = Math.max(maxLeak[k], leak[k]);
    }
  }
  return { w, botMs: botMs / calls, plays, maxLeak };
}

test('bot-vs-bot matches run to the end with every deck', () => {
  for (let i = 0; i < 14; i++) {
    const d = ['easy', 'normal', 'hard'];
    const r = match(100 + i, d[i % 3], d[(i + 1) % 3], DECKS[i % DECKS.length], DECKS[(i + 3) % DECKS.length]);
    assert.equal(r.w.phase, 'ended', `match ${i} ended`);
    assert.ok(r.plays[0] > 5 && r.plays[1] > 5, `both bots played cards (${r.plays})`);
  }
});

test('hard beats easy in most mirror matches', () => {
  let hard = 0, easy = 0;
  for (let i = 0; i < 16; i++) {
    const deck = DECKS[i % DECKS.length];
    const hardFirst = i % 2 === 0;
    const r = match(500 + i, hardFirst ? 'hard' : 'easy', hardFirst ? 'easy' : 'hard', deck, deck);
    const hardTeam = hardFirst ? 0 : 1;
    if (r.w.winner === hardTeam) hard++; else if (r.w.winner === 1 - hardTeam) easy++;
  }
  console.log(`hard ${hard} – easy ${easy}`);
  assert.ok(hard > easy * 2, `hard should dominate (hard ${hard}, easy ${easy})`);
});

test('the bot is cheap and does not sit on full aether', () => {
  const r = match(42, 'normal', 'hard', DEFAULT_DECK, OPPONENTS[0].deck);
  console.log(`bot update ${r.botMs.toFixed(4)} ms, longest leak ${r.maxLeak.map((v) => v.toFixed(1))} s`);
  assert.ok(r.botMs < 0.05, `average Bot.update ${r.botMs} ms`);
  assert.ok(r.maxLeak[0] < 4 && r.maxLeak[1] < 4, `leak ${r.maxLeak}`);
});

test('the bot answers a lone Colossus walking at its spire', () => {
  const w = new World({ seed: 9, decks: [DEFAULT_DECK, OPPONENTS[3].deck] });
  const bot = new Bot(w, 1, { difficulty: 'normal', seed: 9 });
  w.players[1].aether = 10;
  w.players[0].aether = 10;
  const hand = w.players[0].hand;
  let idx = hand.indexOf('colossus');
  if (idx < 0) { hand[0] = 'colossus'; idx = 0; }
  assert.ok(w.playCard(0, idx, -5, 3));
  let answered = false;
  const before = w.players[1].hand.join();
  for (let step = 0; step < 30 * 9; step++) {
    bot.update(SIM_DT);
    w.step(SIM_DT);
    if (w.players[1].hand.join() !== before) { answered = true; break; }
  }
  assert.ok(answered, 'bot played a card in response');
});
