// Imports the full D&D 5e SRD bestiary from https://www.dnd5eapi.co into the app's
// monster format (shared/bestiary.json) and downloads every monster's artwork into
// client/public/img/monsters. Run with: node scripts/import-srd.mjs [--cache <dir>]
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const API = 'https://www.dnd5eapi.co';
const OUT_JSON = path.join(ROOT, 'shared/bestiary.json');
const IMG_DIR = path.join(ROOT, 'client/public/img/monsters');
const cacheArg = process.argv.indexOf('--cache');
const CACHE = cacheArg > -1 ? process.argv[cacheArg + 1] : null;

const WORDS = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6 };
// Hand-tuned crops for SRD art with stray lettering baked into the image.
const CROPS = { goblin: { left: 84, top: 166, width: 330, height: 330 } };
const TYPE_ICON = {
  aberration: 'eye', beast: 'paw', celestial: 'sun', construct: 'cog', dragon: 'dragon',
  elemental: 'flame', fey: 'leaf', fiend: 'horns', giant: 'mountain', humanoid: 'user',
  monstrosity: 'claw', ooze: 'droplet', plant: 'sprout', undead: 'skull', swarm: 'bug',
};
const TYPE_COLOR = {
  aberration: '#8b5cf6', beast: '#a16207', celestial: '#facc15', construct: '#64748b', dragon: '#dc2626',
  elemental: '#f97316', fey: '#22c55e', fiend: '#be123c', giant: '#78716c', humanoid: '#0ea5e9',
  monstrosity: '#b45309', ooze: '#65a30d', plant: '#15803d', undead: '#a3a3a3', swarm: '#57534e',
};

async function getJson(url, cacheName) {
  if (CACHE && cacheName) {
    try { return JSON.parse(await fs.readFile(path.join(CACHE, cacheName), 'utf8')); } catch {}
  }
  for (let attempt = 0; ; attempt++) {
    try {
      const res = await fetch(API + url);
      if (!res.ok) throw new Error(`${res.status} ${url}`);
      return await res.json();
    } catch (err) {
      if (attempt >= 3) throw err;
      await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
    }
  }
}

async function pool(items, size, fn) {
  const out = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: size }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i], i);
    }
  }));
  return out;
}

// Collapses SRD damage entries (including "choose one of" options) into one dice expression.
function damageOf(entries = []) {
  const parts = [];
  for (const d of entries) {
    const pick = d.damage_dice ? d : d.from?.options?.[0];
    if (pick?.damage_dice) parts.push({ dice: pick.damage_dice.replace(/\s+/g, ''), type: pick.damage_type?.name ?? '' });
  }
  if (!parts.length) return { damage: '', damageType: '' };
  return {
    damage: parts.map((p) => p.dice).join('+').replace(/\+-/g, '-'),
    damageType: [...new Set(parts.map((p) => p.type.toLowerCase()).filter(Boolean))].join(' + '),
  };
}

function convertAction(a) {
  const { damage, damageType } = damageOf(a.damage);
  const action = { name: a.name, desc: a.desc ?? '', kind: 'special' };
  if (typeof a.attack_bonus === 'number' && damage) {
    Object.assign(action, { kind: 'attack', toHit: a.attack_bonus, damage, damageType });
  } else if (a.dc && damage) {
    Object.assign(action, {
      kind: 'save', save: a.dc.dc_type.index, dc: a.dc.dc_value, damage, damageType,
      halfOnSave: a.dc.success_type === 'half',
    });
  }
  if (a.usage?.type === 'recharge on roll') action.recharge = a.usage.min_value;
  else if (a.usage?.type === 'per day') action.uses = a.usage.times;
  else if (a.usage?.type === 'recharge after rest') action.uses = 1;
  return action;
}

function attacksPerTurn(m) {
  const multi = m.actions?.find((a) => a.name === 'Multiattack');
  if (!multi) return 1;
  const listed = (multi.actions ?? [])
    .filter((x) => x.type === 'melee' || x.type === 'ranged')
    .reduce((sum, x) => sum + (Number(x.count) || 1), 0);
  if (listed > 0) return Math.min(listed, 6);
  const match = /makes (\w+)/i.exec(multi.desc ?? '');
  return Math.min(WORDS[match?.[1]?.toLowerCase()] ?? 2, 6);
}

function crLabel(cr) {
  return cr === 0.125 ? '1/8' : cr === 0.25 ? '1/4' : cr === 0.5 ? '1/2' : String(cr);
}

function convert(m) {
  const type = m.type.toLowerCase().startsWith('swarm') ? 'swarm' : m.type.toLowerCase();
  const saves = {};
  const skills = [];
  for (const p of m.proficiencies ?? []) {
    const name = p.proficiency.name;
    if (name.startsWith('Saving Throw: ')) saves[name.slice(14).toLowerCase()] = p.value;
    else if (name.startsWith('Skill: ')) skills.push(`${name.slice(7)} +${p.value}`);
  }
  const speed = Object.entries(m.speed ?? {})
    .filter(([, v]) => typeof v === 'string')
    .map(([k, v]) => (k === 'walk' ? v : `${k} ${v}`)).join(', ');
  const senses = Object.entries(m.senses ?? {})
    .map(([k, v]) => `${k.replace(/_/g, ' ')} ${v}`).join(', ');
  const ac = m.armor_class?.[0] ?? { value: 10 };
  const actions = (m.actions ?? []).filter((a) => a.name !== 'Multiattack').map(convertAction);
  const multi = m.actions?.find((a) => a.name === 'Multiattack');

  return {
    id: `srd-${m.index}`,
    builtin: true,
    name: m.name,
    size: m.size,
    type,
    subtype: m.subtype ?? '',
    alignment: m.alignment ?? '',
    ac: ac.value,
    acNote: ac.armor?.map((x) => x.name).join(', ') || (ac.type !== 'dex' ? ac.type : ''),
    hp: m.hit_points,
    hitDice: m.hit_points_roll || m.hit_dice,
    speed,
    abilities: {
      str: m.strength, dex: m.dexterity, con: m.constitution,
      int: m.intelligence, wis: m.wisdom, cha: m.charisma,
    },
    saves,
    skills: skills.join(', '),
    resistances: (m.damage_resistances ?? []).join(', '),
    immunities: [...(m.damage_immunities ?? []), ...(m.condition_immunities ?? []).map((c) => c.name.toLowerCase())].join(', '),
    vulnerabilities: (m.damage_vulnerabilities ?? []).join(', '),
    senses,
    languages: m.languages || '—',
    cr: crLabel(m.challenge_rating),
    xp: m.xp,
    traits: (m.special_abilities ?? []).map((t) => ({ name: t.name, desc: t.desc })),
    multiattack: multi?.desc ?? '',
    attacksPerTurn: attacksPerTurn(m),
    actions,
    legendary: (m.legendary_actions ?? []).map((l) => ({ name: l.name, desc: l.desc })),
    image: m.image ? `/img/monsters/${m.index}.webp` : '',
    icon: TYPE_ICON[type] ?? 'claw',
    color: TYPE_COLOR[type] ?? '#b45309',
  };
}

const list = await getJson('/api/2014/monsters');
console.log(`Fetching ${list.count} monsters…`);
const raw = await pool(list.results, 12, (r) => getJson(r.url, `${r.index}.json`));
const monsters = raw.map(convert).sort((a, b) => a.name.localeCompare(b.name));
await fs.writeFile(OUT_JSON, JSON.stringify(monsters));
console.log(`Wrote ${monsters.length} monsters to ${path.relative(ROOT, OUT_JSON)}`);

await fs.mkdir(IMG_DIR, { recursive: true });
let downloaded = 0;
await pool(raw.filter((m) => m.image), 12, async (m) => {
  const file = path.join(IMG_DIR, `${m.index}.webp`);
  try { await fs.access(file); return; } catch {}
  const cached = CACHE && path.join(CACHE, 'img', `${m.index}.png`);
  let png = cached && (await fs.readFile(cached).catch(() => null));
  if (!png) {
    const res = await fetch(API + m.image);
    if (!res.ok) return console.warn(`  no image for ${m.index} (${res.status})`);
    png = Buffer.from(await res.arrayBuffer());
  }
  // Source art is 512px PNG (~1.6 MB); 384px WebP keeps it crisp at token size for ~3% of the weight.
  let img = sharp(png);
  if (CROPS[m.index]) img = img.extract(CROPS[m.index]);
  await img.resize(384, 384, { fit: 'cover' }).webp({ quality: 78 }).toFile(file);
  downloaded++;
});
console.log(`Downloaded ${downloaded} new images to ${path.relative(ROOT, IMG_DIR)}`);
