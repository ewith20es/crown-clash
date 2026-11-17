// Shared look constants for the stage (lights, fog) and the arena (sky, island, props).
import * as THREE from 'three';

/** Half extents of the island's flat top (a little larger than the 18 × 30 arena). */
export const ISLAND = Object.freeze({ HW: 11.25, HL: 17.75, CORNER: 3.0 });

/** Visible half-width of the aether channel (the stone coping covers the rest of |z| < 1). */
export const RIFT_WATER_HALF = 0.92;
export const RIFT_WATER_Y = -0.35;

/** Direction the sunlight comes FROM (upper left-front: −x, +y, +z). */
export const SUN_DIR = new THREE.Vector3(-0.5, 0.72, 0.48).normalize();
/** Where the sun disc is painted in the sky: same azimuth, low golden-hour elevation. */
export const SKY_SUN_DIR = new THREE.Vector3(-0.5, 0.2, 0.48).normalize();

export const SKY = Object.freeze({
  zenith: 0x23468f,
  mid: 0x6d9ad6,
  horizon: 0xffc794,
  below: 0xe0b0a4,
  sun: 0xffcf86,
  cloudLit: 0xffe6d0,
  cloudShade: 0xc2a3c6,
});

export const LIGHT = Object.freeze({
  sun: 0xffe2b6,
  sunIntensity: 2.7,
  hemiSky: 0xcfe2ff,
  hemiGround: 0x7d6a4a,
  hemiIntensity: 1.1,
  fill: 0x8fb6ff,
  fillIntensity: 0.55,
  envIntensity: 0.55,
});

export const AETHER = Object.freeze({
  deep: 0x0b3f86,
  mid: 0x2ad8ff,
  bright: 0xb8fbff,
});

export function linearColor(hex, out = new THREE.Color()) {
  return out.setHex(hex);
}
