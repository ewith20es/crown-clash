// Opponent AI: full bot-vs-bot matches must run cleanly, stronger profiles must win more,
// and the bot must stay cheap per simulation step.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../js/sim/world.js';
import { Bot } from '../js/ai/bot.js';
import { OPPONENTS, DEFAULT_DECK, CARD_BY_ID, COLLECTION_CARDS } from '../js/data/cards.js';
import { DIFFICULTIES, PROFILES } from '../js/ai/profiles.js';
import { loadState, saveState } from '../js/game/store.js';
import { SIM_DT } from '../js/config.js';

const DECKS = [DEFAULT_DECK, ...OPPONENTS.map((o) => o.deck)];

function scenario(difficulty, team, cards, elixir) {
  const families = cards.map(id => CARD_BY_ID[id].family);
  const filler = COLLECTION_CARDS.filter(c => !families.includes(c.family)).slice(0,4).map(c => c.id);
  const deck = [...filler,...cards];
  const w = new World({seed: 23, decks: [deck,deck]});
  const p = w.players[team];
  p.hand = [...cards];
  [p.next, ...p.queue] = p.deck.slice(0,4);
  p.aether = elixir;
  const bot = new Bot(w,team,{difficulty,seed: 17});
  return { w, bot, decide() {
    bot.perceive();
    w.time += 3; // let newly spotted enemies pass the reaction delay
    bot.update(3);
    assert.ok(!bot.warned);
    return w.drainEvents().find(e => e.type === 'cardPlayed');
  }};
}

test('every rival difficulty survives a save and starts the corresponding bot', () => {
  let saved = null;
  const previous = Object.getOwnPropertyDescriptor(globalThis,'localStorage');
  Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{
    getItem: () => saved, setItem: (_,value) => { saved = value; }
  }});
  try {
    for (const difficulty of DIFFICULTIES) {
      saveState({...loadState(),difficulty});
      const state = loadState();
      assert.equal(state.difficulty,difficulty);
      assert.equal(new Bot(new World(),1,state).p,PROFILES[difficulty]);
    }
  } finally {
    if (previous) Object.defineProperty(globalThis,'localStorage',previous);
    else delete globalThis.localStorage;
  }
});

test('ground defenders leave an incoming Balloon needing anti-air', () => {
  for (const team of [0,1]) {
    const s = team ? -1 : 1;
    const {w,decide} = scenario('hard', team, ['longshot','breaker','warden','colossus'], 4);
    w.addEntity('thunderhead',1-team,5,s*4);
    w.addEntity('breaker',team,4,s*6);
    w.addEntity('warden',team,6,s*6);
    const play = decide();
    assert.equal(play?.cardId,'longshot');
    assert.ok(play.x > 0 && play.z*s > 4);
  }
});

test('Expert pressures the opposite bridge after a backline commitment', () => {
  for (const team of [0,1]) for (const lane of [-1,1]) {
    const s = team ? -1 : 1;
    const {w,decide} = scenario('expert',team,['wall-breakers','warden','bats','comet'],5);
    w.players[1-team].aether = 1;
    w.addEntity('colossus',1-team,lane*5,-s*12);
    const play = decide();
    assert.deepEqual([play?.cardId,play?.x,play?.z],['wall-breakers',-lane*5,s*2]);
  }
});

test('Expert puts a tank in front of a surviving Musketeer at the bridge', () => {
  const {w,decide} = scenario('expert',0,['colossus','bats','comet','shardstorm'],5);
  const defender = w.addEntity('longshot',0,-5,4);
  defender.hp *= .6;
  const play = decide();
  assert.deepEqual([play?.cardId,play?.x,play?.z],['colossus',-5,2]);
});

test('Master saves Freeze for a tower under attack', () => {
  for (const attacking of [false,true]) {
    const {w,decide} = scenario('master',0,['stasis','comet','shardstorm','overclock'],4);
    const tower = w.towers[1].right;
    if (attacking) {
      const giant = w.addEntity('colossus',0,tower.x,tower.z+2);
      giant.targetId = tower.id;
      giant.state = 'attack';
    }
    const play = decide();
    assert.equal(play?.cardId,attacking ? 'stasis' : undefined);
    if (attacking) assert.ok(Math.hypot(tower.x-play.x,tower.z-play.z)<1);
  }
});

test('Master budgets both spells to finish a tower and accounts for the first in flight', () => {
  const {w,bot,decide} = scenario('master',0,['rocket','comet','warden','colossus'],10);
  w.towers[1].left.hp = 480;
  assert.equal(decide()?.cardId,'rocket');
  bot.lastPlay = -10;
  bot.think();
  assert.equal(w.drainEvents().find(e => e.type === 'cardPlayed')?.cardId,'comet');
  assert.equal(w.players[0].aether,0);
  for (let i=0;i<60;i++) w.step(SIM_DT);
  assert.equal(w.towers[1].left.alive,false);
});

test('Master aims Fireball to hit a defender and Princess Tower with the same cast', () => {
  const {w,decide} = scenario('master',0,['comet','warden','colossus','breaker'],4);
  const tower = w.towers[1].right;
  const defender = w.addEntity('longshot',1,tower.x,tower.z+4.5);
  const play = decide();
  assert.equal(play?.cardId,'comet');
  const r = CARD_BY_ID.comet.spell.radius;
  for (const target of [tower,defender]) assert.ok(Math.hypot(play.x-target.x,play.z-target.z) <= r + target.radius);
});

test('Master takes a winning spell shot under pressure in overtime', () => {
  const {w,decide} = scenario('master',0,['comet','breaker','longshot','colossus'],4);
  w.phase = 'overtime';
  w.towers[1].right.hp = 145;
  w.addEntity('colossus',1,-5,6);
  const play = decide();
  assert.equal(play?.cardId,'comet');
  assert.ok(play.x > 0 && play.z < 0);
});

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
    const d = DIFFICULTIES;
    const r = match(100 + i, d[i % d.length], d[(i + 1) % d.length], DECKS[i % DECKS.length], DECKS[(i + 3) % DECKS.length]);
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
