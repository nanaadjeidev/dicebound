// Ready-made adventurers anyone can bring to a battle or recruit into their own roster.
import { CLASSES } from './rules.js';
import { newCharacter, normalizeCharacter } from './schema.js';

const ARRAYS = {
  barbarian: [15, 13, 14, 8, 12, 10], bard: [8, 14, 13, 10, 12, 15], cleric: [14, 10, 13, 8, 15, 12],
  druid: [10, 13, 14, 12, 15, 8], fighter: [15, 13, 14, 10, 12, 8], monk: [10, 15, 13, 8, 14, 12],
  paladin: [15, 10, 13, 8, 12, 14], ranger: [10, 15, 13, 8, 14, 12], rogue: [8, 15, 13, 12, 10, 14],
  sorcerer: [8, 13, 14, 10, 12, 15], warlock: [8, 13, 14, 12, 10, 15], wizard: [8, 13, 14, 15, 12, 10],
};

function hero(id, name, race, cls, level, image, extra = {}) {
  const [str, dex, con, int, wis, cha] = ARRAYS[cls];
  const abilities = { str, dex, con, int, wis, cha };
  const primary = CLASSES[cls].primary;
  // Ability Score Improvements at levels 4, 8, 12 go into the class's main ability.
  abilities[primary] = Math.min(20, abilities[primary] + 2 * [4, 8, 12].filter((l) => level >= l).length);
  const base = newCharacter({
    name, race, class: cls, level, image: `/img/monsters/${image}.webp`,
    abilities, ac: CLASSES[cls].ac, skills: CLASSES[cls].skills, ...extra,
  });
  return { id: `hero-${id}`, premade: true, ...normalizeCharacter(base) };
}

export const HEROES = [
  hero('aldric', 'Ser Aldric Vane', 'human', 'paladin', 5, 'knight', { background: 'Noble', alignment: 'Lawful Good', notes: 'Knight of the Silver Gauntlet, sworn to hunt the dragon that burned his home.' }),
  hero('corwyn', 'Archmage Corwyn Ashgrave', 'human', 'wizard', 9, 'archmage', { background: 'Sage', alignment: 'True Neutral', notes: 'Keeper of the Ashgrave Tower, whose storms are written in his spellbook.' }),
  hero('eldon', 'Master Eldon Greythorne', 'human', 'wizard', 5, 'mage', { background: 'Sage', alignment: 'Neutral Good', notes: 'Retired lecturer of the Arcane College who never quite retired.' }),
  hero('vex', 'Vex Nightshade', 'tiefling', 'rogue', 6, 'assassin', { background: 'Criminal', alignment: 'Chaotic Neutral', notes: 'Never seen arriving, only leaving.' }),
  hero('kael', 'Kael Duskhollow', 'half-elf', 'ranger', 4, 'scout', { background: 'Outlander', alignment: 'Neutral Good', notes: 'Tracks anything that walks, flies or crawls through the Duskwood.' }),
  hero('brakka', 'Brakka Stonefist', 'half-orc', 'barbarian', 5, 'berserker', { background: 'Outlander', alignment: 'Chaotic Good', notes: 'His rage is legendary; his cooking, less so.' }),
  hero('edmund', 'Brother Edmund', 'human', 'cleric', 5, 'priest', { background: 'Acolyte', alignment: 'Lawful Good', notes: 'High priest of the Dawnfather, healer of the poor quarter.' }),
  hero('maren', 'Sister Maren', 'human', 'cleric', 2, 'acolyte', { background: 'Acolyte', alignment: 'Neutral Good', notes: 'A novice whose prayers are answered more loudly than expected.' }),
  hero('oakheart', 'Oakheart the Elder', 'wood-elf', 'druid', 6, 'druid', { background: 'Hermit', alignment: 'True Neutral', notes: 'Has spoken with the same oak tree for three hundred years.' }),
  hero('grimgar', 'Grimgar Ironbeard', 'mountain-dwarf', 'fighter', 5, 'duergar', { background: 'Soldier', alignment: 'Lawful Neutral', notes: 'Veteran of the Deep Wars. Distrusts anything without a beard.' }),
  hero('lucius', 'Lucius Varro', 'human', 'fighter', 6, 'gladiator', { background: 'Entertainer', alignment: 'Chaotic Good', notes: 'Undefeated champion of the Crimson Arena.' }),
  hero('hollis', 'Sergeant Hollis', 'human', 'fighter', 2, 'guard', { background: 'Soldier', alignment: 'Lawful Good', notes: 'Twenty years on the city watch and not a single day off.' }),
  hero('pyraxis', 'Pyraxis Emberscale', 'dragonborn', 'paladin', 7, 'half-red-dragon-veteran', { background: 'Soldier', alignment: 'Lawful Neutral', notes: 'Bears the flame of the red wyrm in his blood and his blade.' }),
  hero('percival', 'Lord Percival Ashford', 'human', 'bard', 5, 'noble', { background: 'Noble', alignment: 'Chaotic Good', notes: 'Patron of the arts, scandal of the court.' }),
  hero('shade', 'Shade', 'elf', 'rogue', 3, 'spy', { background: 'Charlatan', alignment: 'Neutral', notes: 'Real name unknown. Possibly unknowable.' }),
  hero('knuckles', 'Roderick "Knuckles" Brann', 'human', 'monk', 4, 'thug', { background: 'Urchin', alignment: 'Chaotic Good', notes: 'Learned the Way of the Open Hand in the back alleys of Saltmarsh.' }),
  hero('zuri', 'Zuri of the Sunfire', 'human', 'barbarian', 6, 'tribal-warrior', { background: 'Outlander', alignment: 'Chaotic Neutral', notes: 'Chosen of the Sunfire tribe, carrier of the burning spear.' }),
  hero('garrick', 'Commander Garrick Holt', 'human', 'fighter', 9, 'veteran', { background: 'Soldier', alignment: 'Lawful Good', notes: 'Held the Pass of Teeth for nine days with forty men.' }),
  hero('malachar', 'Malachar the Hollow', 'tiefling', 'warlock', 6, 'cult-fanatic', { background: 'Acolyte', alignment: 'Chaotic Evil', notes: 'Owes his soul to something with too many eyes.' }),
  hero('seraphine', 'Seraphine Vael', 'human', 'warlock', 3, 'cultist', { background: 'Sage', alignment: 'Neutral', notes: 'Found a book that read her back.' }),
  hero('nib', 'Nib Tinkerfoot', 'gnome', 'wizard', 4, 'deep-gnome-svirfneblin', { background: 'Guild Artisan', alignment: 'Neutral Good', notes: 'Illusionist, inventor and part-time explosives enthusiast.' }),
  hero('ilvara', 'Ilvara Shadowveil', 'drow', 'sorcerer', 5, 'drow', { background: 'Noble', alignment: 'Chaotic Neutral', notes: 'Exiled daughter of House Shadowveil, wielder of wild shadowflame.' }),
  hero('rook', 'Rook Underbough', 'halfling', 'rogue', 2, 'bandit', { background: 'Urchin', alignment: 'Chaotic Good', notes: 'Steals from the rich, gives to the Rook.' }),
  hero('jory', 'Captain Jory Blackwake', 'human', 'rogue', 7, 'bandit-captain', { background: 'Sailor', alignment: 'Chaotic Neutral', notes: 'Captain of the Gull’s Revenge. Wanted in six ports.' }),
  hero('bjorn', 'Bjorn Ursakin', 'human', 'druid', 7, 'werebear-human', { background: 'Hermit', alignment: 'Neutral Good', notes: 'Guardian of the northern woods. Prefers bear form on weekends.' }),
  hero('rajan', 'Rajan Tigerclaw', 'human', 'monk', 6, 'weretiger-human', { background: 'Hermit', alignment: 'Lawful Neutral', notes: 'Moves like a tiger. Possibly is one.' }),
  hero('fenric', 'Fenric Greymane', 'half-orc', 'ranger', 5, 'werewolf-human', { background: 'Outlander', alignment: 'Chaotic Neutral', notes: 'Hunts by moonlight, alone, always.' }),
  hero('tobias', 'Old Tobias Fenn', 'human', 'fighter', 1, 'commoner', { background: 'Folk Hero', alignment: 'Neutral Good', notes: 'A farmer who picked up a pitchfork when the goblins came, and never put it down.' }),
  hero('silas', 'Silas Crook', 'halfling', 'warlock', 4, 'wererat-human', { background: 'Criminal', alignment: 'Neutral Evil', notes: 'Patron: the Rat King beneath the city.' }),
  hero('hrothgar', 'Hrothgar Tusk', 'half-orc', 'fighter', 4, 'wereboar-human', { background: 'Folk Hero', alignment: 'Chaotic Good', notes: 'Charges first, asks questions never.' }),
];

export const HERO_BY_ID = new Map(HEROES.map((h) => [h.id, h]));
