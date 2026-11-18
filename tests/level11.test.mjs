import test from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../js/sim/world.js';
import { SIM_DT } from '../js/config.js';
import { CARDS, CARD_BY_ID, UNITS, cardStats } from '../js/data/cards.js';

function world() {
  const w = new World({ seed: 2026 });
  for (const e of w.entities) e.stunned = 1e9;
  return w;
}
function run(w, seconds) { for (let i = 0; i < Math.ceil(seconds / SIM_DT); i++) w.step(); }
function cast(w, id, x, z) {
  w.players[0].hand[0] = id; w.players[0].aether = 10;
  assert.equal(w.playCard(0, 0, x, z), true);
}
function target(w, type, x = 3, z = -4) {
  const e = w.addEntity(type, 1, x, z); e.stunned = 1e9; return e;
}

test('186 unique real cards expose level 11 stats, including every spawned unit', () => {
  assert.equal(CARDS.length, 186);
  assert.equal(new Set(CARDS.map(c => c.name)).size, 186);
  for (const c of CARDS) {
    assert.equal(c.level, 11);
    assert.ok(cardStats(c).some(r => r.label === 'Level' && r.value === '11'));
    if (c.unit) assert.ok(UNITS[c.unit]);
  }
  for (const u of Object.values(UNITS)) {
    assert.equal(u.level, 11);
    assert.ok(Number.isInteger(u.hp) && u.hp > 0);
    assert.ok(Number.isInteger(u.dmg) && u.dmg >= 0);
  }
});

test('both teams start with level 11 Princess and King towers', () => {
  const w = world();
  for (const team of [0, 1]) {
    assert.equal(w.towers[team].left.hp, 3052);
    assert.equal(w.towers[team].right.hp, 3052);
    assert.equal(w.towers[team].citadel.hp, 4824);
    assert.equal(w.towers[team].left.def.dmg, 109);
    assert.equal(w.towers[team].citadel.def.dmg, 109);
  }
});

test('Fireball kills Ice Wizard exactly and leaves Musketeer at 33 HP', () => {
  const w = world(), ice = target(w, 'frostsnail', 2, -4), musk = target(w, 'longshot', 4, -4);
  cast(w, 'comet', 3, -4); run(w, 1.6);
  assert.equal(ice.hp, 0); assert.equal(musk.hp, 33);
});

test('Zap kills Skeletons and Bats but leaves Goblins at 10 HP', () => {
  const w = world(), sk = target(w, 'mite', 2, -4), bat = target(w, 'bat', 3, -4), gob = target(w, 'goblin', 4, -4);
  cast(w, 'jolt', 3, -4); run(w, .3);
  assert.equal(sk.hp, 0); assert.equal(bat.hp, 0); assert.equal(gob.hp, 10);
});

test('Arrows kill Archers while Guards absorb all three waves in their shield', () => {
  const w = world(), archer = target(w, 'scout', 2, -4), guard = target(w, 'prismguard', 4, -4);
  cast(w, 'shardstorm', 3, -4); run(w, 1.6);
  assert.equal(archer.hp, 0); assert.equal(guard.shield, 0); assert.equal(guard.hp, 81);
});

for (const [id, expected] of [['comet', 159], ['shardstorm', 75], ['stasis', 38], ['jolt', 48], ['overclock', 46], ['blight', 168], ['maelstrom', 26], ['skyfork', 265], ['rockslide', 35]]) {
  test(`level 11 ${CARD_BY_ID[id].name} applies exact Crown Tower damage: ${expected}`, () => {
    const w = world(), tower = w.towers[1].right;
    cast(w, id, tower.x, tower.z);
    run(w, 10);
    assert.equal(tower.maxHp - tower.hp, expected);
  });
}

test('Freeze and Rage deal their full troop damage once', () => {
  for (const [id, damage] of [['stasis', 148], ['overclock', 179]]) {
    const w = world(), knight = target(w, 'warden');
    cast(w, id, knight.x, knight.z); run(w, 6);
    assert.equal(knight.maxHp - knight.hp, damage);
  }
});

test('Tornado deals one 84-damage pulse and cannot kill a Spear Goblin', () => {
  const w = world(), gob = target(w, 'speargoblin');
  cast(w, 'maelstrom', 3, -4); run(w, 2);
  assert.equal(gob.hp, 49);
});

test('Executioner axe deals 179 on each leg to ground and air', () => {
  const w = world(), exe = w.addEntity('sage', 0, 0, 8);
  exe.stunned = 1e9;
  const ground = target(w, 'colossus', 0, 5), air = target(w, 'stormray', .2, 4.8);
  w._landBlow(exe, ground, 1, false); run(w, 2.1);
  assert.equal(ground.maxHp - ground.hp, 358);
  assert.equal(air.maxHp - air.hp, 358);
});

test('Electro Spirit chains to nine distinct targets then dies', () => {
  const w = world(), spirit = w.addEntity('sparkwisp', 0, 0, -4);
  spirit.stunned = 1e9;
  const foes = Array.from({ length: 10 }, (_, i) => target(w, 'warden', i % 5 * .7, -5 - Math.floor(i / 5)));
  w._landBlow(spirit, foes[0], 1, true);
  assert.equal(foes.filter(e => e.maxHp - e.hp === 99).length, 9);
  assert.equal(spirit.alive, false);
});

test('Battle Healer heals on attacks, including herself, and not while idle', () => {
  const w = world(), healer = w.addEntity('bloomtender', 0, 0, 8), ally = w.addEntity('warden', 0, 1, 8);
  healer.stunned = 1e9; ally.stunned = 1e9;
  healer.hp -= 300; ally.hp -= 300;
  run(w, 3); assert.equal(healer.maxHp - healer.hp, 300); assert.equal(ally.maxHp - ally.hp, 300);
  const foe = target(w, 'colossus', 0, 7);
  w._landBlow(healer, foe, 1, true);
  assert.equal(healer.maxHp - healer.hp, 198); assert.equal(ally.maxHp - ally.hp, 198);
  assert.equal(foe.maxHp - foe.hp, 268);
});

test('Golem splits into two level 11 Golemites and Goblin Barrel spawns three Goblins', () => {
  const w = world(), golem = target(w, 'podstrider');
  w._damage(golem, golem.hp, 0, 'test'); run(w, .1);
  const children = w.entities.filter(e => e.type === 'sproutling');
  assert.equal(children.length, 2);
  assert.ok(children.every(e => e.hp === 1039 && e.def.dmg === 84));
  cast(w, 'seedpod', -5, -5); run(w, 1.3);
  const goblins = w.entities.filter(e => e.type === 'goblin');
  assert.equal(goblins.length, 3);
  assert.ok(goblins.every(e => e.hp === 202 && e.def.dmg === 125));
});
