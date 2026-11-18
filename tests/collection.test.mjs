import test from 'node:test';
import assert from 'node:assert/strict';
import { CARDS, CARD_BY_ID, TOWER_CARDS, UNITS, DEFAULT_DECK, isValidDeck } from '../js/data/cards.js';
import { COLLECTION_SOURCE } from '../js/data/collection-source.js';
import { World } from '../js/sim/world.js';
import { number } from '../js/data/collection.js';
import { filterAndSort, replaceInDeck } from '../js/ui/format.js';
import { CARD_ART } from '../js/data/royale-art.js';
import { readFileSync } from 'node:fs';

function world(){const w=new World();for(const e of w.entities)e.stunned=9999;return w;}
function play(w,id,x=5,z=5){w.players[0].hand[0]=id;w.players[0].aether=10;assert.equal(w.playCard(0,0,x,z),true);}
function run(w,t){for(let i=0;i<Math.ceil(t*30);i++)w.step();}

test('complete reference roster, portraits, filters and family-safe saved decks',()=>{
  assert.equal(CARDS.filter(c=>c.variant==='base').length,123);
  assert.equal(filterAndSort(CARDS,'evolution').length,45);
  assert.equal(filterAndSort(CARDS,'hero').length,18);
  assert.equal(filterAndSort(CARDS,'champion').length,8);
  assert.equal(TOWER_CARDS.length,4);
  for(const c of [...CARDS,...TOWER_CARDS]){
    assert.ok(COLLECTION_SOURCE.some(r=>r.slug===c.family));
    const png=readFileSync(new URL(`../assets/royale-cards/${CARD_ART[c.id]}.png`,import.meta.url));
    assert.equal(png.subarray(0,8).toString('hex'),'89504e470d0a1a0a');
    if(c.unit){const hp=c.referenceStats?.[0]?.stats.Hitpoints;if(hp)assert.equal(UNITS[c.unit].hp,number(hp),c.name);}
  }
  const deck=replaceInDeck([...DEFAULT_DECK],0,'knight-hero');
  assert.ok(isValidDeck(deck));assert.equal(deck[0],'knight-hero');
  assert.equal(isValidDeck(['warden','knight-hero',...DEFAULT_DECK.slice(2)]),false);
  assert.equal(isValidDeck(['cannoneer',...DEFAULT_DECK.slice(1)]),false);
});

for(const c of CARDS.filter(c=>c.variant==='evolution'&&c.unit))test(`${c.name} cycles into the evolved body`,()=>{
  const w=world();
  for(let i=0;i<=c.cycles;i++){
    play(w,c.id);
    if(UNITS[c.unit].deployAnywhere)run(w,.1);
    const type=i<c.cycles?CARD_BY_ID[c.baseId].unit:c.unit;
    assert.ok(w.entities.some(e=>e.type===type),type);
    for(const e of w.entities.filter(e=>e.kind!=='tower'))w._kill(e);
    w._cleanup();w.time+=1;
  }
  assert.equal(w.players[0].cycles[c.id],0);
});

for(const c of CARDS.filter(c=>c.ability))test(`${c.name} ability spends elixir and respects charges`,()=>{
  const w=world(), type=c.unit||c.spell.unit;
  const e=w.addEntity(type,0,4,5,{cardId:c.id});
  w.addEntity('colossus',1,4,3);w.players[0].aether=10;
  assert.equal(w.activateAbility(1,e.id),false);
  assert.equal(w.activateAbility(0,e.id),true);
  assert.equal(w.players[0].aether,10-c.ability.cost);
  assert.equal(w.activateAbility(0,e.id),false);
  run(w,8);
  for(const v of w.entities)assert.ok(Number.isFinite(v.hp)&&Number.isFinite(v.x)&&Number.isFinite(v.z));
});

test('mixed groups preserve Goblin/Spear Goblin, Rascal and Monster bodies',()=>{
  const w=world();play(w,'goblin-gang');
  assert.equal(w.entities.filter(e=>e.type==='goblin-gang'&&e.hp===202).length,3);
  assert.equal(w.entities.filter(e=>e.type==='speargoblin'&&e.hp===133).length,3);
  play(w,'rascals');assert.equal(w.entities.filter(e=>e.def.name==='Rascal Girl'&&e.hp===261).length,2);
  play(w,'goblinstein');assert.ok(w.entities.some(e=>e.def.name==='Monster'&&e.hp===2240));
});

test('Clone copies only friendly troops, at one HP, with no usable ability',()=>{
  const w=world();w.addEntity('archer-queen',0,4,5);w.addEntity('warden',1,4,5);
  play(w,'clone',4,5);run(w,.6);
  const clones=w.entities.filter(e=>e.isClone);
  assert.equal(clones.length,1);assert.equal(clones[0].hp,1);assert.equal(clones[0].team,0);assert.equal(clones[0].def.ability,null);
});

test('Mirror requires a previous card, charges one extra, and respects troop deployment territory',()=>{
  const w=world();w.players[0].hand[0]='mirror';assert.equal(w.canPlay(0,0,5,5).reason,'mirror');
  play(w,'warden');w.players[0].hand[0]='mirror';w.players[0].aether=3;
  assert.equal(w.canPlay(0,0,5,-10).ok,false);
  w.players[0].aether=4;const r=w.canPlay(0,0,5,-10);assert.ok(r.z>0);
  assert.ok(w.playCard(0,0,5,-10));assert.equal(w.players[0].aether,0);
  assert.equal(w.entities.filter(e=>e.type==='warden').length,2);
});

test('Graveyard summons twelve Skeletons over time and Barrel releases its Barbarian',()=>{
  const w=world();play(w,'graveyard',0,5);run(w,1);assert.ok(w.entities.filter(e=>e.type==='mite').length<12);
  run(w,9);assert.equal(w.entities.filter(e=>e.type==='mite').length,12);
  play(w,'barbarian-barrel');run(w,2);assert.ok(w.entities.some(e=>e.type==='barbarian'));
});

test('Earthquake excludes flying enemies and uses separate building damage',()=>{
  const w=world(), ground=w.addEntity('colossus',1,0,5), air=w.addEntity('stormray',1,0,5), building=w.addEntity('sentry',1,0,5);
  for(const e of [ground,air,building])e.stunned=9999;
  play(w,'earthquake',0,5);run(w,3.6);
  assert.equal(ground.hp,ground.maxHp-243);assert.equal(air.hp,air.maxHp);assert.equal(building.hp,building.maxHp-849);
});

test('Royal Delivery stays on its own side and selected tower health/damage reaches the battle',()=>{
  const w=new World({towerTroops:['cannoneer','dagger-duchess']});
  assert.equal(w.towers[0].left.hp,2616);assert.equal(w.towers[0].left.def.dmg,320);
  assert.equal(w.towers[1].left.hp,2768);assert.equal(w.towers[1].left.def.dmg,107);
  w.players[0].hand[0]='royal-delivery';w.players[0].aether=10;assert.ok(w.canPlay(0,0,5,-10).z>0);
});

test('Knight Hero taunts and shields; Goblin Hero has one activation per deployment',()=>{
  const w=world(),e=w.addEntity('knight-hero',0,4,5,{cardId:'knight-hero'}),t=w.addEntity('warden',1,4,2);
  w.players[0].aether=10;assert.ok(w.activateAbility(0,e.id));assert.equal(e.shield,512);assert.equal(t.tauntId,e.id);
  play(w,'goblins-hero');run(w,1.1);
  const a=w.abilities(0).filter(a=>a.name==='Goblins Hero');assert.equal(a.length,1);
  w.players[0].aether=10;assert.ok(w.activateAbility(0,a[0].id));
  assert.equal(w.abilities(0).find(a=>a.name==='Goblins Hero').remaining,0);
});
