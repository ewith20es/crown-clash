// Refresh only the 50 public PNG portraits used by this local game.
// Index downloaded from https://api.github.com/repos/RoyaleAPI/cr-api-assets/contents/cards
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { CARD_ART } from '../js/data/royale-art.js';
const root = new URL('../assets/royale-cards/', import.meta.url);
const index = JSON.parse(await readFile(new URL('./card-assets-index.json', import.meta.url), 'utf8'));
await mkdir(root, { recursive: true });
const names = [...new Set(Object.values(CARD_ART))];
const manifest = [];
let next = 0;
async function worker() {
  while (next < names.length) {
    const slug = names[next++];
    const entry = index.find(e => e.name === `${slug}.png`);
    const extra = {ronin:'https://www.royaletools.com/cards/ronin-v1.png','minion-giant':'https://www.royaletools.com/cards/minion-giant-v2.png'}[slug];
    if (!extra && !entry?.download_url?.startsWith('https://raw.githubusercontent.com/RoyaleAPI/cr-api-assets/')) throw new Error(`Unverified image URL: ${slug}`);
    let data;
    try {data = await readFile(new URL(`${slug}.png`,root));} catch {
      const response=await fetch(extra || entry.download_url);
      if(!response.ok)throw new Error(`${slug}: HTTP ${response.status}`);
      data=Buffer.from(await response.arrayBuffer());
    }
    if (data.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') throw new Error(`Not a PNG: ${slug}`);
    await writeFile(new URL(`${slug}.png`, root), data);
    manifest.push({ slug, source: extra || entry.download_url, gitBlob: entry?.sha || null, sha256: createHash('sha256').update(data).digest('hex'), bytes: data.length, width: data.readUInt32BE(16), height: data.readUInt32BE(20) });
  }
}
await Promise.all(Array.from({ length: 5 }, worker));
manifest.sort((a, b) => a.slug.localeCompare(b.slug));
await writeFile(new URL('manifest.json', root), JSON.stringify({ retrieved: '2026-11-17', repository: 'https://github.com/RoyaleAPI/cr-api-assets', portraits: manifest }, null, 2) + '\n');
console.log(`Saved ${manifest.length} verified PNG portraits (${manifest.reduce((s, a) => s + a.bytes, 0)} bytes).`);
