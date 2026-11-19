import test from 'node:test';
import assert from 'node:assert/strict';
import { CARDS, CARD_BY_ID, DEFAULT_DECK, normalizeDeck, isValidDeck, cardFitsSlot, specialKind } from '../js/data/cards.js';
import { replaceInDeck, swapSlots, filterAndSort, FILTERS } from '../js/ui/format.js';
import { loadState, saveState } from '../js/game/store.js';
import { World } from '../js/sim/world.js';

function deckWith(...ids) {
  return normalizeDeck([...ids,...DEFAULT_DECK.filter(id=>!ids.some(other=>CARD_BY_ID[other].family===CARD_BY_ID[id].family))].slice(0,8));
}
function play(w,id) {
  const p=w.players[0];p.hand[0]=id;p.aether=10;
  assert.equal(w.playCard(0,0,5,6),true);
}

test('every special card has exactly its two legal slots; regular cards fit all eight',()=>{
  for(const c of CARDS) {
    const expected=specialKind(c)==='evolution'?[0,2]:specialKind(c)==='hero'?[1,2]:[0,1,2,3,4,5,6,7];
    assert.deepEqual(Array.from({length:8},(_,i)=>i).filter(i=>cardFitsSlot(c.id,i)),expected,c.id);
    assert.ok(isValidDeck(deckWith(c.id)),c.id);
  }
  assert.equal(cardFitsSlot('missing',0),false);
  assert.equal(cardFitsSlot('cannoneer',0),false);
});
test('deck swaps resolve forms at both ends and keep Champions in eligible slots',()=>{
  const swapped=replaceInDeck(DEFAULT_DECK,3,'knight-evolution');
  assert.equal(swapped[3],'warden');assert.equal(swapped[0],'musketeer-evolution');
  assert.equal(replaceInDeck([...DEFAULT_DECK],0,'archer-queen'),null);
  const deck=deckWith('knight-evolution','archer-queen','archers-evolution');
  assert.equal(deck[0],'knight-evolution');assert.equal(deck[1],'archer-queen');assert.equal(deck[2],'archers-evolution');
  const regular=swapSlots(deck,0,3);
  assert.equal(regular[3],'warden');assert.equal(regular[0],'giant-evolution');
  assert.equal(swapSlots(deck,0,1),null);
  assert.ok(isValidDeck(swapSlots(deck,0,2)));
  assert.deepEqual(replaceInDeck(deck,3,'warden'),regular);
  assert.equal(swapSlots(deck,1,3),null);
});
test('the collection lists each family once and filters on available forms',()=>{
  assert.equal(filterAndSort().length,123);
  for(const filter of FILTERS){
    const matches=filterAndSort(CARDS,filter);
    assert.equal(new Set(matches.map(c=>c.family)).size,matches.length);
  }
  for(const filter of ['all','hero','evolution']){
    assert.deepEqual(filterAndSort(CARDS,filter,'cost-asc','musketeer').filter(c=>c.family==='musketeer').map(c=>c.id),['longshot']);
  }
});
test('Wild switches between a Hero and Evolution while retaining eight unique families',()=>{
  const deck=deckWith('knight-evolution','archer-queen','musketeer-evolution');
  const next=replaceInDeck(deck,2,'longshot','hero');
  assert.ok(isValidDeck(next));assert.equal(next[2],'musketeer-hero');
  assert.equal(new Set(next.map(id=>CARD_BY_ID[id].family)).size,8);
  assert.equal(normalizeDeck(next)[2],'musketeer-hero');
  assert.deepEqual(replaceInDeck(next,2,'longshot','evolution'),deck);
  assert.equal(replaceInDeck(next,0,'musketeer-hero')[0],'musketeer-evolution');
});
test('old saves migrate and overflow forms become regular without duplicate families',()=>{
  const old=['knight-hero','archers-evolution','giant-evolution','musketeer-hero','breaker','mites','comet','shardstorm'];
  const deck=normalizeDeck(old);
  assert.ok(isValidDeck(deck));assert.equal(deck[0],'archers-evolution');assert.equal(deck[1],'knight-hero');assert.equal(deck[2],'giant-evolution');
  assert.ok(deck.includes('longshot'));assert.deepEqual(normalizeDeck(deck),deck);
  const champions=CARDS.filter(c=>c.rarity==='champion').map(c=>c.id);
  const migrated=normalizeDeck(champions);
  assert.ok(isValidDeck(migrated));assert.equal(migrated.filter(id=>CARD_BY_ID[id].rarity==='champion').length,2);
  assert.deepEqual(normalizeDeck(['bad']),[...DEFAULT_DECK]);
});
test('save and reload preserve slot order, tower troop, trophies and settings',()=>{
  const original=globalThis.localStorage;
  let saved=JSON.stringify({deck:['knight-hero',...DEFAULT_DECK.slice(1)],trophies:321,difficulty:'hard',towerTroop:'royal-chef',settings:{sfx:false,music:false,quality:'low'}});
  globalThis.localStorage={getItem:()=>saved,setItem:(_key,value)=>{saved=value;}};
  try {
    const state=loadState();assert.ok(isValidDeck(state.deck));assert.equal(state.deck[1],'knight-hero');
    saveState(state);assert.deepEqual(loadState(),state);assert.equal(state.trophies,321);assert.equal(state.settings.sfx,false);
  } finally { if(original===undefined)delete globalThis.localStorage;else globalThis.localStorage=original; }
});
test('simulation rejects a special card not equipped in a compatible slot',()=>{
  const w=new World();w.players[0].hand[0]='zap-evolution';w.players[0].aether=10;
  assert.equal(w.canPlay(0,0,5,6).reason,'slot');assert.equal(w.playCard(0,0,5,6),false);
  assert.equal(w.players[0].aether,10);assert.deepEqual(w.players[0].cycles,{});
});
test('Evo and Wild cycles are independent, reset after evolving, and survive a failed play',()=>{
  const w=new World({decks:[deckWith('knight-evolution','archers-evolution')]});
  const p=w.players[0],a=CARD_BY_ID['knight-evolution'],b=CARD_BY_ID['archers-evolution'];
  p.hand[0]=a.id;p.aether=0;assert.equal(w.playCard(0,0,5,6),false);assert.equal(p.cycles[a.id],undefined);
  for(let i=0;i<a.cycles;i++) {
    p.hand[0]=a.id;
    assert.equal(w.canPlay(0,0,5,6).deployment.id,a.baseId);
    play(w,a.id);
  }
  assert.equal(w.entities.filter(e=>e.type===a.unit).length,0);
  play(w,b.id);assert.equal(p.cycles[b.id],1);
  p.hand[0]=a.id;assert.equal(w.canPlay(0,0,5,6).deployment.id,a.id);
  play(w,a.id);assert.ok(w.entities.some(e=>e.type===a.unit));assert.equal(p.cycles[a.id],0);assert.equal(p.cycles[b.id],1);
});
test('Mirror copies a regular body without consuming the Evolution cycle or copying Hero abilities',()=>{
  const w=new World({decks:[deckWith('knight-evolution','musketeer-hero','mirror')]});
  play(w,'knight-evolution');const cycles=w.players[0].cycles['knight-evolution'];
  play(w,'mirror');assert.equal(w.players[0].cycles['knight-evolution'],cycles);
  assert.equal(w.entities.filter(e=>e.type==='warden').length,2);
  play(w,'musketeer-hero');play(w,'mirror');assert.equal(w.entities.filter(e=>e.type==='musketeer-hero').length,1);
  assert.equal(w.entities.filter(e=>e.type==='longshot').length,1);
});
test('two ability cards have independent costs, charges and deployment resets',()=>{
  const w=new World({decks:[deckWith('knight-hero','archer-queen')]});
  const knight=w.addEntity('knight-hero',0,4,6,{cardId:'knight-hero'});
  const queen=w.addEntity('archer-queen',0,-4,6,{cardId:'archer-queen'});
  w.players[0].aether=10;assert.equal(w.abilities(0).length,2);
  assert.equal(w.activateAbility(1,knight.id),false);
  assert.ok(w.activateAbility(0,knight.id));assert.equal(w.abilities(0).find(a=>a.id===queen.id).remaining,1);
  queen.frozen=2;assert.equal(w.abilities(0).find(a=>a.id===queen.id).ready,false);assert.equal(w.activateAbility(0,queen.id),false);
  queen.frozen=0;assert.ok(w.activateAbility(0,queen.id));assert.equal(w.activateAbility(0,queen.id),false);
  knight.alive=false;w.time+=1;const fresh=w.addEntity('knight-hero',0,4,6,{cardId:'knight-hero'});
  assert.equal(w.abilities(0).find(a=>a.id===fresh.id).remaining,1);
  w.phase='ended';assert.equal(w.abilities(0).some(a=>a.ready),false);
});
