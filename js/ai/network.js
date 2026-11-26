// Small tanh network. Offline training fits both layers. Live games fine-tune a bounded
// output layer so a small or unusual set of players cannot erase the starting policy.
import { checkpoint } from './trained-policy.js';

export const HIDDEN = 12;
export const MODEL_VERSION = 'crown-policy-1-' + checkpoint;
export const MAX_AGE = 7 * 86400_000;
export const validUpdate = g => Array.isArray(g) && g.length === HIDDEN &&
  g.every(n => Number.isInteger(n) && Math.abs(n) <= 100);
export const validReport = r => r?.version === MODEL_VERSION && typeof r.id === 'string' &&
  /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(r.id) && Number.isSafeInteger(r.time) && validUpdate(r.gradient);
export const emptyHead = () => Array(HIDDEN).fill(0);
export const isHead = head => Array.isArray(head) && head.length === HIDDEN &&
  head.every(v => Number.isFinite(v) && Math.abs(v) <= 0.45);

export function embed(model, features) {
  return model.hidden.map(row => {
    let sum = row[features.length];
    for (let i = 0; i < features.length; i++) sum += row[i] * features[i];
    return Math.tanh(sum);
  });
}

export function score(model, hidden, head) {
  let sum = 0;
  for (let i = 0; i < HIDDEN; i++) sum += (model.output[i] + (head?.[i] || 0)) * hidden[i];
  return sum;
}

export function applyGradient(head, update) {
  return head.map((v, i) => Math.max(-.45, Math.min(.45, .992 * v + .14 * update[i])));
}
