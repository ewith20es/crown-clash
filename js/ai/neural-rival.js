import { Bot } from './bot.js';
import { CARD_BY_ID } from '../data/cards.js';
import { CARD_INFO } from './cardinfo.js';
import { readBoard, actionFeatures } from './action-features.js';
import { embed, score } from './network.js';
import { policy } from './trained-policy.js';
import { MATCH, clamp } from '../config.js';

export class NeuralRival extends Bot {
  constructor(world, team, options = {}) {
    super(world, team, { ...options, difficulty: 'neural' });
    this.model = options.model ?? policy;
    if (this.model.tactics) {
      const { pushAt, defendAt } = this.model.tactics;
      this.p = { ...this.p, pushAt, defendAt, think: [.22,.32] };
    }
    this.head = options.head;
    this.estimatedElixir = MATCH.AETHER_START;
    this.spent = 0;
    this.lastEstimate = 0;
  }

  opponentAether() {
    const w = this.world, spent = w.stats[this.foe].aetherSpent;
    const gain = (w.time-this.lastEstimate)/MATCH.AETHER_PERIOD * (w.phase === 'regular' ? 1 : 2);
    this.estimatedElixir = clamp(Math.min(10,this.estimatedElixir+gain) - (spent-this.spent),0,10);
    this.lastEstimate = w.time;
    this.spent = spent;
    return this.estimatedElixir;
  }

  // Master proposes one tactical move (or wait) without changing the world.
  play(index, x, z) {
    const move = this.world.canPlay(this.team, index, x, z);
    if (move.ok) this.advice = { index, x: move.x, z: move.z };
    return move.ok;
  }

  choices() {
    const w = this.world, team = this.team, me = w.players[team];
    this.advice = null;
    super.think();
    const board = readBoard(w, team);
    const choices = new Map();
    const add = (index, x, z, prior = 0, advised = false) => {
      const move = w.canPlay(team, index, x, z);
      if (!move.ok) return;
      const key = [index, move.x, move.z].join('/');
      const old = choices.get(key);
      if (old) { old.prior = Math.max(old.prior, prior); old.advised ||= advised; return; }
      const features = actionFeatures(board, move.deployment, w.cardCost(team, move.card), move.x, move.z);
      choices.set(key, { index, x: move.x, z: move.z, prior, advised, features });
    };
    choices.set('wait', { index: -1, prior: me.aether >= 9.8 ? -4 : this.advice ? -.6 : .5,
      advised: !this.advice, features: actionFeatures(board) });
    if (this.advice) {
      const {index,x,z} = this.advice;
      add(index,x,z,1.05,true);
    }
    for (const i of this.affordable(me.hand, me.aether)) {
      const card = CARD_BY_ID[me.hand[i]];
      const info = CARD_INFO[card.family === 'mirror' && me.lastCard ? me.lastCard : card.id];
      const spell = info.spell;
      if (spell && !spell.ownSide && (spell.damage > 0 || spell.dps > 0)) {
        const aim = this.bestSpellTarget(info);
        if (aim && aim.value >= info.cost) add(i,aim.x,aim.z,.55 + Math.min(2,(aim.value-info.cost)*.6));
      }
      for (let lane = 0; lane < 2; lane++) {
        const side = lane ? 1 : -1, l = board.lanes[lane];
        const tower = w.towers[this.foe][side < 0 ? 'left' : 'right'];
        const target = tower.alive ? tower : w.towers[this.foe].citadel;
        const ahead = this.attackPos(info, side, true);
        const pressure = l.push + board.lanes[1-lane].back - l.back + (1-l.enemy)*.45;
        if (info.spell) {
          const s = info.spell;
          const damage = (s.crownDamage ?? (s.damage || 0)*(s.towerMult || 0))*(s.waves || 1);
          if (!s.ownSide && damage > 0) {
            const finish = damage >= target.hp;
            add(i,target.x,target.z,finish ? 12 : -.9 + Math.min(1.6, damage/target.hp) + .4*board.late);
          } else if (s.kind === 'graveyard') add(i,target.x,target.z,l.push - .25);
          continue;
        }
        if (this.lanes[lane].front) {
          const pos = this.defensePos(info, this.lanes[lane], side);
          add(i,pos.x,pos.z,-.7 + Math.min(1.6,l.threat)*.55 + this.defenseScore(info,this.lanes[lane])*.18);
        }
        add(i,ahead.x,ahead.z, -.45 + pressure + (info.siege || info.anywhere ? .55 : 0)
          + board.elixir*.45 - (info.building && !info.bombard ? .9 : 0));
        const back = this.attackPos(info,side,false);
        add(i,back.x,back.z,-.65 + (info.tank ? .5 : 0) + l.push*.25);
      }
    }
    const moves = [...choices.values()];
    if (this.model.tactics) moves.find(move => move.advised).prior += this.model.tactics.adviceBonus;
    return moves;
  }

  think() {
    if (this.world.time - this.lastPlay < .5) return;
    const options = this.choices();
    let best, highest = -Infinity;
    for (const o of options) {
      const value = o.prior + score(this.model, embed(this.model, o.features), this.head);
      if (value > highest) { best = o; highest = value; }
    }
    if (best.index >= 0 && this.world.playCard(this.team,best.index,best.x,best.z)) this.lastPlay = this.world.time;
  }
}

export function createRival(world, team, options) {
  return options.difficulty === 'neural' ? new NeuralRival(world,team,options) : new Bot(world,team,options);
}
