// node tools/train-rival.mjs train   or   node tools/train-rival.mjs evaluate
import { writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { World } from '../js/sim/world.js';
import { Rng } from '../js/sim/rng.js';
import { SIM_DT } from '../js/config.js';
import { Bot } from '../js/ai/bot.js';
import { NeuralRival } from '../js/ai/neural-rival.js';
import { HIDDEN, emptyHead, embed, score } from '../js/ai/network.js';
import { INPUTS } from '../js/ai/action-features.js';
import { policy } from '../js/ai/trained-policy.js';
import { DEFAULT_DECK, OPPONENTS } from '../js/data/cards.js';

const decks = [DEFAULT_DECK, ...OPPONENTS.map(o => o.deck)];
const training = decks.slice(0,7);
const heldOut = decks.slice(7);
const rng = new Rng(7381);
const randomRow = length => Array.from({ length }, () => rng.range(-.27,.27));
const fresh = () => ({ hidden: Array.from({length:HIDDEN}, () => randomRow(INPUTS+1)), output: randomRow(HIDDEN) });

function match(seed, deck0, deck1, make) {
  const world = new World({seed,decks:[deck0,deck1]});
  const bots = [0,1].map(team => make(world,team,{seed:seed+team,difficulty:'master'}));
  while (world.phase !== 'ended') {
    for (const bot of bots) bot.update(SIM_DT);
    world.step(SIM_DT);
    world.drainEvents();
  }
  if (bots.some(b => b.warned)) throw Error('Rival decision failed');
  return world.winner;
}

// Pairwise imitation learns features distinguishing the teacher's preferred play
// from another legal play. Subsample waits because thinking is faster than elixir.
function imitate(model) {
  class Student extends NeuralRival {
    think() {
      if (this.world.time - this.lastPlay < .5) return;
      const options = this.choices(), teacher = options.find(o => o.advised);
      const other = rng.pick(options.filter(o => !o.advised));
      if (other && (teacher.index >= 0 || rng.next()<.08)) {
        const a = embed(model,teacher.features), b = embed(model,other.features);
        const rate = .012 / (1+Math.exp(score(model,a)-score(model,b)));
        for (let h=0; h<HIDDEN; h++) {
          const wa = rate*model.output[h]*(1-a[h]**2), wb = rate*model.output[h]*(1-b[h]**2);
          for (let j=0; j<INPUTS; j++) model.hidden[h][j] += wa*teacher.features[j] - wb*other.features[j];
          model.hidden[h][INPUTS] += wa-wb;
          model.output[h] += rate*(a[h]-b[h]);
        }
      }
      if (teacher.index >= 0 && this.world.playCard(this.team,teacher.index,teacher.x,teacher.z)) this.lastPlay=this.world.time;
    }
  }
  for (let i=0; i<32; i++) match(2000+i,rng.pick(training),rng.pick(training),(w,t,o)=>new Student(w,t,{...o,model}));
  // The tactical adviser remains a prior. Leave room for self-play to try alternatives.
  model.output = model.output.map(x => x*.32);
}

// Sample moves from the policy. After the match, reinforce choices that helped
// the learner win relative to the other moves it could have made in that state.
function improve(model) {
  const best = structuredClone(model);
  let bestWins = arena(model,training,4700,21).wins;
  console.log('Imitation validation wins:', bestWins, '/ 42');
  let previous = structuredClone(model);
  for (let epoch=0; epoch<8; epoch++) {
    const batch = emptyHead();
    for (let i=0; i<24; i++) {
      const grad = emptyHead(), side = i%2;
      class Explorer extends NeuralRival {
        think() {
          if (this.world.time-this.lastPlay < .5) return;
          const moves = this.choices();
          if (moves.length === 1) return;
          const hs = moves.map(m => embed(model,m.features));
          const logits = moves.map((m,j) => (m.prior + score(model,hs[j]))/.55);
          const max = Math.max(...logits);
          const weights = logits.map(x => Math.exp(x-max));
          const total = weights.reduce((a,b)=>a+b);
          let draw = rng.next()*total, pick = 0;
          while (pick < moves.length-1 && (draw -= weights[pick])>0) pick++;
          for (let j=0; j<moves.length; j++) {
            const scale = Number(j===pick)-weights[j]/total;
            for (let h=0; h<HIDDEN; h++) grad[h] += scale*hs[j][h];
          }
          const chosen = moves[pick];
          if (chosen.index >= 0 && this.world.playCard(this.team,chosen.index,chosen.x,chosen.z)) this.lastPlay=this.world.time;
        }
      }
      const winner = match(7500+epoch*100+i,rng.pick(training),rng.pick(training),(w,t,o) =>
        t===side ? new Explorer(w,t,{...o,model}) : i%4<2 ? new Bot(w,t,o) : new NeuralRival(w,t,{...o,model:previous}));
      const reward = winner === side ? 1 : winner === 1-side ? -1 : 0;
      for (let h=0;h<HIDDEN;h++) batch[h] += reward * grad[h]/24;
    }
    previous = structuredClone(model);
    model.output = model.output.map((v,h) => v + Math.min(.3,Math.max(-.3,.09*batch[h])));
    const wins = arena(model,training,4700,21).wins;
    console.log('Self-play round',epoch+1,'validation wins:',wins,'/ 42');
    if (wins >= bestWins) { best.output = model.output.slice(); bestWins = wins; }
  }
  return best;
}

function arena(model,pool,seed,pairs,{mixed=false,difficulty='master'}={}) {
  let wins=0, losses=0, draws=0;
  for (let i=0;i<pairs;i++) {
    const deck = pool[i%pool.length];
    const opposingDeck = mixed ? pool[(i+1)%pool.length] : deck;
    for (const neural of [0,1]) {
      const [d0,d1] = neural === 0 ? [deck,opposingDeck] : [opposingDeck,deck];
      const winner=match(seed+i,d0,d1,(w,t,o) => t===neural ? new NeuralRival(w,t,{...o,model}) : new Bot(w,t,{...o,difficulty}));
      if (winner===neural) wins++; else if (winner===1-neural) losses++; else draws++;
    }
  }
  return {wins,losses,draws};
}

// Select a head by actual match results. Recheck the finalists on a second set
// of seeds so an unusually good run in the first tournament carries less weight.
function tournament(fitted) {
  const finalists = [];
  for (let i=0; i<20; i++) {
    const scale = .25 + i%4*.24;
    const model = {...fitted,output:fitted.output.map(v => i===0 ? v : v+rng.range(-scale,scale))};
    const wins = arena(model,training,12000,14).wins;
    finalists.push({model,wins});
    console.log('Tournament entrant',i+1,'wins:',wins,'/ 28');
  }
  const top = finalists.sort((a,b)=>b.wins-a.wins).slice(0,4);
  for (const candidate of top) candidate.wins += arena(candidate.model,training,13000,28).wins;
  return top.sort((a,b)=>b.wins-a.wins)[0].model;
}
function tuneTiming(model) {
  const candidates = [null, {pushAt:5,defendAt:1,adviceBonus:.65},
    {pushAt:7,defendAt:1.2,adviceBonus:.7}, {pushAt:7,defendAt:2,adviceBonus:.6}];
  return candidates.map(tactics => {
    const candidate = {...model,tactics};
    const {wins} = arena(candidate,training,21100,28);
    console.log('Timing validation:',tactics,wins,'/ 56');
    return {candidate,wins};
  }).sort((a,b)=>b.wins-a.wins)[0].candidate;
}
if (['train','tune'].includes(process.argv[2])) {
  let fitted = policy;
  if (process.argv[2] === 'train') {
    const model = fresh();
    imitate(model);
    fitted = tournament(improve(model));
  }
  fitted = tuneTiming(fitted);
  const json = JSON.stringify(fitted, (_,v) => typeof v==='number' ? Number(v.toFixed(7)) : v);
  const checkpoint = createHash('sha256').update(json).digest('hex').slice(0,12);
  await writeFile(new URL('../js/ai/trained-policy.js',import.meta.url),
    '// Generated by node tools/train-rival.mjs train.\nexport const checkpoint = '+JSON.stringify(checkpoint)+';\nexport const policy = '+json+';\n');
} else if (process.argv[2] === 'evaluate') {
  console.log('Neural vs Master, held-out mirror decks:',arena(policy,heldOut,205700,30));
  console.log('Neural vs Master, mixed decks:',arena(policy,decks,206000,30,{mixed:true}));
  console.log('Neural vs Hard, mixed decks:',arena(policy,decks,207000,30,{mixed:true,difficulty:'hard'}));
} else throw Error('Use train, tune or evaluate');
