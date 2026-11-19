// Persistent player state (localStorage). Everything is validated on load so a stale or
// hand-edited save can never break the game.
import { DEFAULT_DECK, normalizeDeck } from '../data/cards.js';

const KEY = 'crown-clash-desktop.v1';
const QUALITIES = ['low', 'medium', 'high'];
const DIFFICULTIES = ['easy', 'normal', 'hard'];

/** Pick a sensible graphics preset for this device the first time the game runs. */
export function defaultQuality() {
  try {
    const coarse = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
    const mem = navigator.deviceMemory || 8;
    const cores = navigator.hardwareConcurrency || 8;
    if (coarse && (mem <= 3 || cores <= 4)) return 'low';
    if (coarse) return 'medium';
  } catch { /* fall through */ }
  return 'high';
}

export function loadState() {
  const state = {
    deck: [...DEFAULT_DECK],
    towerTroop: 'tower-princess',
    trophies: 0,
    difficulty: 'normal',
    settings: { quality: defaultQuality(), sfx: true, music: true },
    firstRun: true,
    record: { wins: 0, losses: 0, draws: 0 },
  };
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (raw && typeof raw === 'object') {
      if (['tower-princess','cannoneer','dagger-duchess','royal-chef'].includes(raw.towerTroop)) state.towerTroop=raw.towerTroop;
      state.deck = normalizeDeck(raw.deck);
      if (Number.isFinite(raw.trophies)) state.trophies = Math.max(0, Math.round(raw.trophies));
      if (DIFFICULTIES.includes(raw.difficulty)) state.difficulty = raw.difficulty;
      if (raw.settings && typeof raw.settings === 'object') {
        if (QUALITIES.includes(raw.settings.quality)) state.settings.quality = raw.settings.quality;
        if (typeof raw.settings.sfx === 'boolean') state.settings.sfx = raw.settings.sfx;
        if (typeof raw.settings.music === 'boolean') state.settings.music = raw.settings.music;
      }
      if (raw.firstRun === false) state.firstRun = false;
      if (raw.record && typeof raw.record === 'object') {
        for (const k of ['wins', 'losses', 'draws']) {
          if (Number.isFinite(raw.record[k])) state.record[k] = Math.max(0, Math.round(raw.record[k]));
        }
      }
    }
  } catch { /* corrupted or unavailable storage: use defaults */ }
  return state;
}

export function saveState(state) {
  try {
    localStorage.setItem(KEY, JSON.stringify({
      deck: state.deck,
      towerTroop: state.towerTroop,
      trophies: state.trophies,
      difficulty: state.difficulty,
      settings: state.settings,
      firstRun: state.firstRun,
      record: state.record,
    }));
  } catch { /* private mode / quota: playing without persistence is fine */ }
}
