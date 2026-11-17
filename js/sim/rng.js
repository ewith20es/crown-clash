// Seeded pseudo-random generator (mulberry32). Deterministic in Node and in every browser.

export class Rng {
  constructor(seed = 1) {
    let s = Number(seed);
    if (!Number.isFinite(s)) s = 1;
    // Fold fractional / large seeds into 32 bits so any number gives a usable state.
    this.state = (Math.floor(s) ^ Math.floor((s % 1) * 0x7fffffff)) >>> 0;
    if (this.state === 0) this.state = 0x9e3779b9;
  }

  /** Uniform float in [0, 1). */
  next() {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Uniform float in [a, b). */
  range(a, b) { return a + (b - a) * this.next(); }

  /** Uniform integer in [0, n). */
  int(n) { return n > 0 ? Math.floor(this.next() * n) : 0; }

  /** Random element of arr (undefined for an empty array). */
  pick(arr) { return arr && arr.length ? arr[this.int(arr.length)] : undefined; }

  /** Fisher–Yates shuffle in place; returns the same array. */
  shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = this.int(i + 1);
      const t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
  }
}
