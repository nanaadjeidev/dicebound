import { withBonus } from './dice.js';

export const ABILITIES = ['str', 'dex', 'con', 'int', 'wis', 'cha'];
export const ABILITY_NAMES = {
  str: 'Strength', dex: 'Dexterity', con: 'Constitution',
  int: 'Intelligence', wis: 'Wisdom', cha: 'Charisma',
};

export const mod = (score) => Math.floor((Number(score) - 10) / 2);
export const fmtMod = (n) => (n >= 0 ? `+${n}` : `${n}`);
export const profBonus = (level) => Math.ceil(Math.max(1, Math.min(20, level)) / 4) + 1;

export const SKILLS = [
  { key: 'acrobatics', name: 'Acrobatics', ability: 'dex' },
  { key: 'animal', name: 'Animal Handling', ability: 'wis' },
  { key: 'arcana', name: 'Arcana', ability: 'int' },
  { key: 'athletics', name: 'Athletics', ability: 'str' },
  { key: 'deception', name: 'Deception', ability: 'cha' },
  { key: 'history', name: 'History', ability: 'int' },
  { key: 'insight', name: 'Insight', ability: 'wis' },
  { key: 'intimidation', name: 'Intimidation', ability: 'cha' },
  { key: 'investigation', name: 'Investigation', ability: 'int' },
  { key: 'medicine', name: 'Medicine', ability: 'wis' },
  { key: 'nature', name: 'Nature', ability: 'int' },
  { key: 'perception', name: 'Perception', ability: 'wis' },
  { key: 'performance', name: 'Performance', ability: 'cha' },
  { key: 'persuasion', name: 'Persuasion', ability: 'cha' },
  { key: 'religion', name: 'Religion', ability: 'int' },
  { key: 'sleight', name: 'Sleight of Hand', ability: 'dex' },
  { key: 'stealth', name: 'Stealth', ability: 'dex' },
  { key: 'survival', name: 'Survival', ability: 'wis' },
];

export const RACES = {
  human: { name: 'Human', bonus: { str: 1, dex: 1, con: 1, int: 1, wis: 1, cha: 1 }, speed: 30, traits: 'Versatile and ambitious; +1 to every ability score.' },
  elf: { name: 'High Elf', bonus: { dex: 2, int: 1 }, speed: 30, traits: 'Darkvision 60 ft. Fey Ancestry. Trance. Keen Senses.' },
  'wood-elf': { name: 'Wood Elf', bonus: { dex: 2, wis: 1 }, speed: 35, traits: 'Darkvision 60 ft. Mask of the Wild. Fleet of Foot.' },
  drow: { name: 'Drow', bonus: { dex: 2, cha: 1 }, speed: 30, traits: 'Superior Darkvision 120 ft. Sunlight Sensitivity. Drow Magic.' },
  dwarf: { name: 'Hill Dwarf', bonus: { con: 2, wis: 1 }, speed: 25, traits: 'Darkvision 60 ft. Dwarven Resilience. Dwarven Toughness.' },
  'mountain-dwarf': { name: 'Mountain Dwarf', bonus: { con: 2, str: 2 }, speed: 25, traits: 'Darkvision 60 ft. Dwarven Armor Training. Stonecunning.' },
  halfling: { name: 'Halfling', bonus: { dex: 2, cha: 1 }, speed: 25, traits: 'Lucky. Brave. Halfling Nimbleness.' },
  'half-elf': { name: 'Half-Elf', bonus: { cha: 2, dex: 1, con: 1 }, speed: 30, traits: 'Darkvision 60 ft. Fey Ancestry. Skill Versatility.' },
  'half-orc': { name: 'Half-Orc', bonus: { str: 2, con: 1 }, speed: 30, traits: 'Darkvision 60 ft. Relentless Endurance. Savage Attacks.' },
  tiefling: { name: 'Tiefling', bonus: { cha: 2, int: 1 }, speed: 30, traits: 'Darkvision 60 ft. Hellish Resistance (fire). Infernal Legacy.' },
  dragonborn: { name: 'Dragonborn', bonus: { str: 2, cha: 1 }, speed: 30, traits: 'Draconic Ancestry. Breath Weapon. Damage Resistance.' },
  gnome: { name: 'Gnome', bonus: { int: 2, con: 1 }, speed: 25, traits: 'Darkvision 60 ft. Gnome Cunning. Tinker.' },
};

const cantrip = (dice, level) => {
  const [n, d] = dice.split('d');
  const mult = level >= 17 ? 4 : level >= 11 ? 3 : level >= 5 ? 2 : 1;
  return `${Number(n) * mult}d${d}`;
};

const weapon = (name, ability, damage, damageType, extra = {}) =>
  ({ name, kind: 'attack', ability, proficient: true, bonus: 0, damage, damageType, addMod: true, ...extra });

export const CLASSES = {
  barbarian: {
    name: 'Barbarian', hitDie: 12, primary: 'str', saves: ['str', 'con'], icon: 'barbarian', color: '#dc2626', ac: 14,
    blurb: 'A fierce warrior of primal rage.', skills: ['athletics', 'intimidation', 'survival'],
    actions: (lv) => [
      weapon('Greataxe', 'str', '1d12', 'slashing'),
      weapon('Raging Greataxe', 'str', `1d12+${lv >= 16 ? 4 : lv >= 9 ? 3 : 2}`, 'slashing', { desc: 'Greataxe swing while raging, adding rage damage.', uses: lv >= 6 ? 4 : lv >= 3 ? 3 : 2 }),
      weapon('Handaxe (thrown)', 'str', '1d6', 'slashing', { range: '20/60 ft.' }),
    ],
  },
  bard: {
    name: 'Bard', hitDie: 8, primary: 'cha', saves: ['dex', 'cha'], icon: 'lyre', color: '#d946ef', ac: 13,
    blurb: 'An inspiring magician whose power echoes the music of creation.', skills: ['performance', 'persuasion', 'deception'],
    actions: (lv) => [
      weapon('Rapier', 'dex', '1d8', 'piercing'),
      { name: 'Vicious Mockery', kind: 'save', ability: 'cha', save: 'wis', damage: cantrip('1d4', lv), damageType: 'psychic', halfOnSave: false },
      { name: 'Dissonant Whispers', kind: 'save', ability: 'cha', save: 'wis', damage: '3d6', damageType: 'psychic', halfOnSave: true, uses: 2 },
      { name: 'Healing Word', kind: 'heal', ability: 'cha', damage: '1d4', addMod: true, uses: 3 },
    ],
  },
  cleric: {
    name: 'Cleric', hitDie: 8, primary: 'wis', saves: ['wis', 'cha'], icon: 'holy-symbol', color: '#facc15', ac: 18,
    blurb: 'A priestly champion who wields divine magic.', skills: ['religion', 'medicine', 'insight'],
    actions: (lv) => [
      weapon('Mace', 'str', '1d6', 'bludgeoning'),
      { name: 'Sacred Flame', kind: 'save', ability: 'wis', save: 'dex', damage: cantrip('1d8', lv), damageType: 'radiant', halfOnSave: false },
      { name: 'Guiding Bolt', kind: 'attack', ability: 'wis', proficient: true, damage: '4d6', damageType: 'radiant', uses: 2 },
      { name: 'Cure Wounds', kind: 'heal', ability: 'wis', damage: '1d8', addMod: true, uses: 3 },
      ...(lv >= 5 ? [{ name: 'Spirit Guardians', kind: 'save', ability: 'wis', save: 'wis', damage: '3d8', damageType: 'radiant', halfOnSave: true, uses: 2 }] : []),
    ],
  },
  druid: {
    name: 'Druid', hitDie: 8, primary: 'wis', saves: ['int', 'wis'], icon: 'oak-leaf', color: '#22c55e', ac: 14,
    blurb: 'A priest of the Old Faith, wielding the powers of nature.', skills: ['nature', 'animal', 'survival'],
    actions: (lv) => [
      weapon('Quarterstaff', 'str', '1d6', 'bludgeoning'),
      { name: 'Produce Flame', kind: 'attack', ability: 'wis', proficient: true, damage: cantrip('1d8', lv), damageType: 'fire' },
      { name: 'Thunderwave', kind: 'save', ability: 'wis', save: 'con', damage: '2d8', damageType: 'thunder', halfOnSave: true, uses: 2 },
      { name: 'Healing Word', kind: 'heal', ability: 'wis', damage: '1d4', addMod: true, uses: 3 },
    ],
  },
  fighter: {
    name: 'Fighter', hitDie: 10, primary: 'str', saves: ['str', 'con'], icon: 'crossed-swords', color: '#94a3b8', ac: 18,
    blurb: 'A master of martial combat, skilled with many weapons.', skills: ['athletics', 'perception', 'intimidation'],
    actions: () => [
      weapon('Longsword', 'str', '1d8', 'slashing'),
      weapon('Longbow', 'dex', '1d8', 'piercing', { range: '150/600 ft.' }),
      { name: 'Second Wind', kind: 'heal', ability: 'none', damage: '1d10', addMod: false, uses: 1, self: true },
    ],
  },
  monk: {
    name: 'Monk', hitDie: 8, primary: 'dex', saves: ['str', 'dex'], icon: 'fist', color: '#0ea5e9', ac: 16,
    blurb: 'A master of martial arts, harnessing the power of the body.', skills: ['acrobatics', 'stealth', 'insight'],
    actions: (lv) => {
      const die = lv >= 17 ? 'd10' : lv >= 11 ? 'd8' : lv >= 5 ? 'd6' : 'd4';
      return [
        weapon('Unarmed Strike', 'dex', `1${die}`, 'bludgeoning'),
        weapon('Shortsword', 'dex', '1d6', 'piercing'),
        weapon('Flurry of Blows', 'dex', `2${die}`, 'bludgeoning', { uses: Math.max(1, Math.floor(lv / 2)) }),
      ];
    },
  },
  paladin: {
    name: 'Paladin', hitDie: 10, primary: 'str', saves: ['wis', 'cha'], icon: 'templar-shield', color: '#f59e0b', ac: 18,
    blurb: 'A holy warrior bound to a sacred oath.', skills: ['athletics', 'religion', 'persuasion'],
    actions: (lv) => [
      weapon('Longsword', 'str', '1d8', 'slashing'),
      weapon('Divine Smite', 'str', '1d8+2d8', 'slashing + radiant', { uses: lv >= 5 ? 4 : 2 }),
      { name: 'Lay on Hands', kind: 'heal', ability: 'none', damage: String(lv * 5), addMod: false, uses: 1 },
    ],
  },
  ranger: {
    name: 'Ranger', hitDie: 10, primary: 'dex', saves: ['str', 'dex'], icon: 'high-shot', color: '#16a34a', ac: 15,
    blurb: 'A warrior who combats threats on the edges of civilisation.', skills: ['survival', 'stealth', 'perception'],
    actions: () => [
      weapon('Longbow', 'dex', '1d8', 'piercing', { range: '150/600 ft.' }),
      weapon("Hunter's Mark Shot", 'dex', '1d8+1d6', 'piercing', { uses: 2, range: '150/600 ft.' }),
      weapon('Shortsword', 'dex', '1d6', 'piercing'),
    ],
  },
  rogue: {
    name: 'Rogue', hitDie: 8, primary: 'dex', saves: ['dex', 'int'], icon: 'plain-dagger', color: '#a3a3a3', ac: 14,
    blurb: 'A scoundrel who uses stealth and trickery.', skills: ['stealth', 'sleight', 'acrobatics', 'deception'],
    actions: (lv) => [
      weapon('Rapier', 'dex', '1d8', 'piercing'),
      weapon('Sneak Attack', 'dex', `1d6+${Math.ceil(lv / 2)}d6`, 'piercing', { desc: 'Rapier strike with Sneak Attack dice.', uses: 3 }),
      weapon('Shortbow', 'dex', '1d6', 'piercing', { range: '80/320 ft.' }),
    ],
  },
  sorcerer: {
    name: 'Sorcerer', hitDie: 6, primary: 'cha', saves: ['con', 'cha'], icon: 'fire-ray', color: '#f97316', ac: 13,
    blurb: 'A spellcaster with inborn magic from a gift or bloodline.', skills: ['arcana', 'persuasion', 'intimidation'],
    actions: (lv) => [
      { name: 'Fire Bolt', kind: 'attack', ability: 'cha', proficient: true, damage: cantrip('1d10', lv), damageType: 'fire' },
      { name: 'Chromatic Orb', kind: 'attack', ability: 'cha', proficient: true, damage: '3d8', damageType: 'lightning', uses: 2 },
      { name: lv >= 5 ? 'Fireball' : 'Burning Hands', kind: 'save', ability: 'cha', save: 'dex', damage: lv >= 5 ? '8d6' : '3d6', damageType: 'fire', halfOnSave: true, uses: 2 },
    ],
  },
  warlock: {
    name: 'Warlock', hitDie: 8, primary: 'cha', saves: ['wis', 'cha'], icon: 'warlock-hood', color: '#7c3aed', ac: 13,
    blurb: 'A wielder of magic derived from a bargain with an extraplanar entity.', skills: ['arcana', 'deception', 'intimidation'],
    actions: (lv) => [
      { name: 'Eldritch Blast', kind: 'attack', ability: 'cha', proficient: true, damage: cantrip('1d10', lv), damageType: 'force', addMod: lv >= 2 },
      { name: 'Hellish Rebuke', kind: 'save', ability: 'cha', save: 'dex', damage: lv >= 5 ? '4d10' : '2d10', damageType: 'fire', halfOnSave: true, uses: 2 },
      weapon('Pact Blade', 'cha', '1d8', 'slashing'),
    ],
  },
  wizard: {
    name: 'Wizard', hitDie: 6, primary: 'int', saves: ['int', 'wis'], icon: 'pointy-hat', color: '#3b82f6', ac: 12,
    blurb: 'A scholarly magic-user capable of manipulating reality.', skills: ['arcana', 'history', 'investigation'],
    actions: (lv) => [
      { name: 'Fire Bolt', kind: 'attack', ability: 'int', proficient: true, damage: cantrip('1d10', lv), damageType: 'fire' },
      { name: 'Ray of Frost', kind: 'attack', ability: 'int', proficient: true, damage: cantrip('1d8', lv), damageType: 'cold' },
      { name: 'Magic Missile', kind: 'auto', ability: 'none', damage: '3d4+3', damageType: 'force', uses: 3, desc: 'Three glowing darts that never miss.' },
      ...(lv >= 5 ? [{ name: 'Fireball', kind: 'save', ability: 'int', save: 'dex', damage: '8d6', damageType: 'fire', halfOnSave: true, uses: 2 }] : []),
    ],
  },
};

export const ALIGNMENTS = [
  'Lawful Good', 'Neutral Good', 'Chaotic Good', 'Lawful Neutral', 'True Neutral',
  'Chaotic Neutral', 'Lawful Evil', 'Neutral Evil', 'Chaotic Evil',
];
export const BACKGROUNDS = [
  'Acolyte', 'Charlatan', 'Criminal', 'Entertainer', 'Folk Hero', 'Guild Artisan', 'Hermit',
  'Noble', 'Outlander', 'Sage', 'Sailor', 'Soldier', 'Urchin',
];
export const CONDITIONS = [
  'Blessed', 'Blinded', 'Charmed', 'Frightened', 'Grappled', 'Hasted', 'Invisible',
  'Paralysed', 'Poisoned', 'Prone', 'Restrained', 'Stunned',
];

export function finalAbilities(c) {
  const bonus = RACES[c.race]?.bonus ?? {};
  return Object.fromEntries(ABILITIES.map((a) => [a, Math.min(30, (c.abilities?.[a] ?? 10) + (bonus[a] ?? 0))]));
}

export function autoMaxHp(c) {
  const cls = CLASSES[c.class];
  const con = mod(finalAbilities(c).con);
  const die = cls?.hitDie ?? 8;
  const lv = c.level ?? 1;
  return Math.max(1, die + con + (lv - 1) * (die / 2 + 1 + con));
}

export function attacksPerTurn(c) {
  const lv = c.level ?? 1;
  if (c.class === 'fighter') return lv >= 20 ? 4 : lv >= 11 ? 3 : lv >= 5 ? 2 : 1;
  if (['barbarian', 'paladin', 'ranger', 'monk'].includes(c.class)) return lv >= 5 ? 2 : 1;
  return 1;
}

export function starterActions(cls, level) {
  return (CLASSES[cls]?.actions(level) ?? []).map((a, i) => ({ id: `a${i}`, ...a }));
}

export function saveBonuses(c) {
  const abil = finalAbilities(c);
  const pb = profBonus(c.level);
  const profs = CLASSES[c.class]?.saves ?? [];
  return Object.fromEntries(ABILITIES.map((a) => [a, mod(abil[a]) + (profs.includes(a) ? pb : 0)]));
}

export function skillBonus(c, skill) {
  const abil = finalAbilities(c);
  return mod(abil[skill.ability]) + (c.skills?.includes(skill.key) ? profBonus(c.level) : 0);
}

/** Turns a character's editable actions into the concrete numbers used in combat. */
export function resolveAction(c, a) {
  const abil = finalAbilities(c);
  const pb = profBonus(c.level);
  const m = a.ability && a.ability !== 'none' ? mod(abil[a.ability]) : 0;
  const bonus = Number(a.bonus) || 0;
  const out = {
    name: a.name, kind: a.kind, desc: a.desc ?? '', damageType: a.damageType ?? '',
    range: a.range ?? '', uses: a.uses || undefined, self: !!a.self,
  };
  if (a.kind === 'attack') {
    out.toHit = m + (a.proficient ? pb : 0) + bonus;
    out.damage = withBonus(a.damage, (a.addMod ? m : 0) + bonus);
  } else if (a.kind === 'save') {
    out.dc = 8 + pb + m + bonus;
    out.save = a.save;
    out.halfOnSave = !!a.halfOnSave;
    out.damage = withBonus(a.damage, a.addMod ? m : 0);
  } else {
    out.damage = withBonus(a.damage, (a.addMod ? m : 0) + bonus);
  }
  return out;
}

export function resolveCharacterActions(c) {
  return (c.actions ?? []).filter((a) => a.damage).map((a) => resolveAction(c, a));
}

export function characterSubtitle(c) {
  return `Level ${c.level} ${RACES[c.race]?.name ?? c.race} ${CLASSES[c.class]?.name ?? c.class}`;
}

export function crToNumber(cr) {
  if (typeof cr === 'number') return cr;
  if (String(cr).includes('/')) {
    const [a, b] = String(cr).split('/');
    return Number(a) / Number(b);
  }
  return Number(cr) || 0;
}
