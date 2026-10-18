// Shape and sanitise the documents that clients send. Used by the server before storing
// anything, and by the client to create blank sheets.
import { ABILITIES, CLASSES, RACES, SKILLS, autoMaxHp, starterActions } from './rules.js';
import { isValidDice } from './dice.js';

const str = (v, max = 120, fallback = '') => (typeof v === 'string' ? v.slice(0, max) : fallback);
const int = (v, min, max, fallback) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : fallback;
};
const oneOf = (v, list, fallback) => (list.includes(v) ? v : fallback);
const KINDS = ['attack', 'save', 'heal', 'auto', 'special'];
const ABILITY_OR_NONE = [...ABILITIES, 'none'];
const imageUrl = (v) => {
  const s = str(v, 600);
  return /^(https?:\/\/|\/img\/)/i.test(s) ? s : '';
};

function abilities(input, fallback = 10) {
  return Object.fromEntries(ABILITIES.map((a) => [a, int(input?.[a], 1, 30, fallback)]));
}

function action(a, i, { monster = false } = {}) {
  const kind = oneOf(a?.kind, KINDS, 'attack');
  const damage = isValidDice(a?.damage) ? str(a.damage, 60) : '';
  const out = {
    id: str(a?.id, 20) || `a${i}`,
    name: str(a?.name, 60, 'Attack') || 'Attack',
    kind: kind !== 'special' && !damage ? 'special' : kind,
    damage,
    damageType: str(a?.damageType, 40),
    desc: str(a?.desc, 2000),
    range: str(a?.range, 40),
  };
  if (a?.uses) out.uses = int(a.uses, 1, 20, 1);
  if (a?.self) out.self = true;
  if (monster) {
    if (out.kind === 'attack') out.toHit = int(a?.toHit, -5, 30, 0);
    if (out.kind === 'save') {
      out.dc = int(a?.dc, 1, 35, 10);
      out.save = oneOf(a?.save, ABILITIES, 'dex');
      out.halfOnSave = !!a?.halfOnSave;
    }
    if (a?.recharge) out.recharge = int(a.recharge, 2, 6, 5);
  } else {
    out.ability = oneOf(a?.ability, ABILITY_OR_NONE, 'str');
    out.proficient = a?.proficient !== false;
    out.addMod = !!a?.addMod;
    out.bonus = int(a?.bonus, -10, 10, 0);
    if (out.kind === 'save') {
      out.save = oneOf(a?.save, ABILITIES, 'dex');
      out.halfOnSave = !!a?.halfOnSave;
    }
  }
  return out;
}

export function newCharacter(overrides = {}) {
  const base = {
    name: '', race: 'human', class: 'fighter', level: 1, background: 'Soldier',
    alignment: 'Neutral Good', image: '', abilities: { str: 15, dex: 13, con: 14, int: 10, wis: 12, cha: 8 },
    ac: CLASSES.fighter.ac, speed: RACES.human.speed, skills: [...CLASSES.fighter.skills],
    autoHp: true, potions: 3, notes: '', equipment: '', traits: '', ...overrides,
  };
  base.actions = overrides.actions ?? starterActions(base.class, base.level);
  base.maxHp = overrides.maxHp ?? autoMaxHp(base);
  base.hp = overrides.hp ?? base.maxHp;
  return base;
}

export function normalizeCharacter(input = {}) {
  const c = {
    name: str(input.name, 60).trim() || 'Nameless Hero',
    race: oneOf(input.race, Object.keys(RACES), 'human'),
    class: oneOf(input.class, Object.keys(CLASSES), 'fighter'),
    level: int(input.level, 1, 20, 1),
    background: str(input.background, 40),
    alignment: str(input.alignment, 40),
    image: imageUrl(input.image),
    abilities: abilities(input.abilities),
    ac: int(input.ac, 1, 30, 10),
    speed: int(input.speed, 0, 120, 30),
    skills: (Array.isArray(input.skills) ? input.skills : []).filter((k) => SKILLS.some((s) => s.key === k)),
    autoHp: input.autoHp !== false,
    potions: int(input.potions, 0, 20, 3),
    notes: str(input.notes, 5000),
    equipment: str(input.equipment, 3000),
    traits: str(input.traits, 3000),
    actions: (Array.isArray(input.actions) ? input.actions : []).slice(0, 16).map((a, i) => action(a, i)),
  };
  c.maxHp = c.autoHp ? autoMaxHp(c) : int(input.maxHp, 1, 999, autoMaxHp(c));
  c.hp = int(input.hp, 0, c.maxHp, c.maxHp);
  return c;
}

export function newMonster(overrides = {}) {
  return {
    name: '', size: 'Medium', type: 'monstrosity', subtype: '', alignment: 'unaligned',
    ac: 13, acNote: 'natural armor', hp: 30, hitDice: '4d8+12', speed: '30 ft.',
    abilities: { str: 14, dex: 12, con: 16, int: 6, wis: 10, cha: 7 },
    saves: {}, skills: '', resistances: '', immunities: '', vulnerabilities: '',
    senses: 'darkvision 60 ft., passive Perception 10', languages: '—', cr: '1', xp: 200,
    traits: [], multiattack: '', attacksPerTurn: 1, legendary: [], image: '', icon: 'claw', color: '#b45309',
    actions: [{ id: 'a0', name: 'Claw', kind: 'attack', toHit: 4, damage: '2d6+2', damageType: 'slashing', desc: '', range: '' }],
    ...overrides,
  };
}

const named = (list, max = 12) =>
  (Array.isArray(list) ? list : []).slice(0, max).map((t) => ({ name: str(t?.name, 60), desc: str(t?.desc, 2000) }))
    .filter((t) => t.name || t.desc);

export function normalizeMonster(input = {}) {
  return {
    name: str(input.name, 60).trim() || 'Unnamed Horror',
    size: oneOf(input.size, ['Tiny', 'Small', 'Medium', 'Large', 'Huge', 'Gargantuan'], 'Medium'),
    type: str(input.type, 30) || 'monstrosity',
    subtype: str(input.subtype, 40),
    alignment: str(input.alignment, 40),
    ac: int(input.ac, 1, 30, 10),
    acNote: str(input.acNote, 60),
    hp: int(input.hp, 1, 999, 10),
    hitDice: isValidDice(input.hitDice) ? str(input.hitDice, 30) : '',
    speed: str(input.speed, 80),
    abilities: abilities(input.abilities),
    saves: Object.fromEntries(Object.entries(input.saves ?? {}).filter(([k]) => ABILITIES.includes(k)).map(([k, v]) => [k, int(v, -5, 20, 0)])),
    skills: str(input.skills, 200),
    resistances: str(input.resistances, 200),
    immunities: str(input.immunities, 200),
    vulnerabilities: str(input.vulnerabilities, 200),
    senses: str(input.senses, 200),
    languages: str(input.languages, 200),
    cr: str(String(input.cr ?? '1'), 6) || '1',
    xp: int(input.xp, 0, 200000, 0),
    traits: named(input.traits),
    multiattack: str(input.multiattack, 600),
    attacksPerTurn: int(input.attacksPerTurn, 1, 6, 1),
    actions: (Array.isArray(input.actions) ? input.actions : []).slice(0, 16).map((a, i) => action(a, i, { monster: true })),
    legendary: named(input.legendary, 6),
    image: imageUrl(input.image),
    icon: str(input.icon, 20) || 'claw',
    color: /^#[0-9a-f]{6}$/i.test(input.color) ? input.color : '#b45309',
  };
}

// ── DM planning ───────────────────────────────────────────────────────────────
const id = (v, i) => str(v, 24) || `i${i}`;
const list = (v, max, fn) => (Array.isArray(v) ? v : []).slice(0, max).map(fn);
const encounterMonsters = (v) => list(v, 20, (m) => ({
  id: str(m?.id, 80), name: str(m?.name, 60), cr: str(String(m?.cr ?? ''), 6), xp: int(m?.xp, 0, 200000, 0), count: int(m?.count, 1, 30, 1),
})).filter((m) => m.id);

export function newCampaign(overrides = {}) {
  return normalizeCampaign({ name: 'A New Adventure', partyLevel: 1, partySize: 4, ...overrides });
}

export function normalizeCampaign(input = {}) {
  return {
    name: str(input.name, 80).trim() || 'Untitled Campaign',
    tagline: str(input.tagline, 160),
    setting: str(input.setting, 8000),
    partyLevel: int(input.partyLevel, 1, 20, 1),
    partySize: int(input.partySize, 1, 8, 4),
    image: imageUrl(input.image),
    notes: str(input.notes, 20000),
    sessions: list(input.sessions, 100, (s, i) => ({
      id: id(s?.id, i), title: str(s?.title, 100) || `Session ${i + 1}`, date: str(s?.date, 20),
      status: oneOf(s?.status, ['planned', 'played'], 'planned'), prep: str(s?.prep, 8000), recap: str(s?.recap, 8000),
    })),
    npcs: list(input.npcs, 200, (n, i) => ({
      id: id(n?.id, i), name: str(n?.name, 80) || 'Unnamed', role: str(n?.role, 80),
      attitude: oneOf(n?.attitude, ['friendly', 'neutral', 'hostile', 'unknown'], 'unknown'),
      description: str(n?.description, 4000), secret: str(n?.secret, 4000), image: imageUrl(n?.image),
    })),
    locations: list(input.locations, 200, (l, i) => ({
      id: id(l?.id, i), name: str(l?.name, 80) || 'Unnamed place', region: str(l?.region, 80),
      description: str(l?.description, 4000), secret: str(l?.secret, 4000),
    })),
    quests: list(input.quests, 200, (q, i) => ({
      id: id(q?.id, i), title: str(q?.title, 100) || 'Untitled quest', giver: str(q?.giver, 80), reward: str(q?.reward, 200),
      status: oneOf(q?.status, ['open', 'active', 'done', 'failed'], 'open'), description: str(q?.description, 4000),
    })),
    encounters: list(input.encounters, 100, (e, i) => ({
      id: id(e?.id, i), name: str(e?.name, 80) || 'Encounter', notes: str(e?.notes, 4000), monsters: encounterMonsters(e?.monsters),
    })),
    dungeonIds: list(input.dungeonIds, 50, (d) => str(d, 40)).filter(Boolean),
  };
}

const DOOR_KINDS = ['door', 'locked', 'secret', 'arch', 'portcullis'];
const FEATURE_TYPES = ['stairs-up', 'stairs-down', 'trap', 'chest', 'pillar', 'statue', 'altar', 'coffin', 'table', 'rubble', 'brazier',
  'pool', 'fungus', 'crystal', 'chasm', 'throne', 'bed', 'rack', 'cage', 'crate', 'wheel', 'shelf', 'lava', 'hoard', 'anvil', 'tree'];

function trap(t) {
  if (!t || typeof t !== 'object') return null;
  return {
    name: str(t.name, 60), trigger: str(t.trigger, 200), save: str(t.save, 10), dc: int(t.dc, 1, 30, 12), detect: int(t.detect, 1, 30, 12),
    damage: isValidDice(t.damage) ? str(t.damage, 20) : null, effect: str(t.effect, 400), severity: oneOf(t.severity, ['setback', 'dangerous', 'deadly'], 'setback'),
  };
}

export function normalizeDungeon(input = {}) {
  const width = int(input.width, 8, 80, 48);
  const height = int(input.height, 8, 60, 34);
  const cells = typeof input.cells === 'string' && input.cells.length === width * height && /^[#.,]+$/.test(input.cells)
    ? input.cells : '#'.repeat(width * height);
  const inside = (o) => o.x >= 0 && o.y >= 0 && o.x < width && o.y < height;
  return {
    version: 1,
    name: str(input.name, 100).trim() || 'Nameless Dungeon',
    seed: str(input.seed, 60), theme: str(input.theme, 20) || 'crypt', size: str(input.size, 10) || 'medium',
    level: int(input.level, 1, 20, 1), party: int(input.party, 1, 8, 4),
    width, height, cells,
    rooms: list(input.rooms, 60, (r, i) => ({
      id: int(r?.id, 0, 999, i), n: int(r?.n, 1, 999, i + 1),
      x: int(r?.x, 0, width - 1, 0), y: int(r?.y, 0, height - 1, 0), w: int(r?.w, 1, width, 1), h: int(r?.h, 1, height, 1),
      shape: oneOf(r?.shape, ['rect', 'round', 'cave'], 'rect'), role: oneOf(r?.role, ['entrance', 'lair', 'room'], 'room'),
      kind: str(r?.kind, 80) || 'Chamber', readAloud: str(r?.readAloud, 4000), notes: str(r?.notes, 4000),
      encounter: r?.encounter?.monsters?.length ? {
        monsters: encounterMonsters(r.encounter.monsters), xp: int(r.encounter.xp, 0, 1e6, 0), adjustedXp: int(r.encounter.adjustedXp, 0, 1e7, 0),
        difficulty: str(r.encounter.difficulty, 12), tactics: str(r.encounter.tactics, 400),
      } : null,
      treasure: list(r?.treasure, 20, (t) => str(t, 200)).filter(Boolean),
      trap: trap(r?.trap),
    })),
    doors: list(input.doors, 400, (d) => ({ x: int(d?.x, 0, width - 1, 0), y: int(d?.y, 0, height - 1, 0), dir: oneOf(d?.dir, ['h', 'v'], 'h'), kind: oneOf(d?.kind, DOOR_KINDS, 'door') })).filter(inside),
    features: list(input.features, 600, (f) => ({
      x: int(f?.x, 0, width - 1, 0), y: int(f?.y, 0, height - 1, 0), type: oneOf(f?.type, FEATURE_TYPES, 'rubble'),
      ...(f?.hidden ? { hidden: true } : {}), ...(f?.trap ? { trap: trap(f.trap) } : {}),
    })).filter(inside),
    hooks: list(input.hooks, 10, (h) => str(h, 400)).filter(Boolean),
    wandering: list(input.wandering, 12, (w, i) => ({ roll: int(w?.roll, 1, 20, i + 1), text: str(w?.text, 300) })),
    notes: str(input.notes, 8000),
  };
}
