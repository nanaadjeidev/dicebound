// Seeded dungeon generator. The same seed, theme, size and party always produce the same dungeon,
// so a seed can be shared like a map reference. Output is plain JSON: a character grid plus rooms
// (with read-aloud text, encounters, treasure and traps), doors, features, hooks and a wandering
// monster table, ready for the DM's room key and for the battle map.
import { crToNumber } from './rules.js';
import { difficultyOf, encounterXp, partyThresholds } from './encounters.js';

// ── Randomness ────────────────────────────────────────────────────────────────
export function hashSeed(str) {
  let h = 0x811c9dc5;
  for (const ch of String(str)) {
    h ^= ch.codePointAt(0);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function makeRng(seed) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  next.int = (lo, hi) => lo + Math.floor(next() * (hi - lo + 1));
  next.pick = (list) => list[Math.floor(next() * list.length)];
  next.chance = (p) => next() < p;
  next.shuffle = (list) => {
    const out = [...list];
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(next() * (i + 1));
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  };
  return next;
}

const SEED_WORDS = ['ember', 'raven', 'thorn', 'gloam', 'rune', 'ash', 'wyrm', 'mire', 'frost', 'iron', 'bone', 'moth', 'veil', 'cinder', 'brine', 'hollow'];
export function randomSeedWord(rand = Math.random) {
  const w = () => SEED_WORDS[Math.floor(rand() * SEED_WORDS.length)];
  return `${w()}-${w()}-${Math.floor(rand() * 900) + 100}`;
}

// ── Content ───────────────────────────────────────────────────────────────────
export const SIZES = {
  small: { label: 'Small', w: 36, h: 26, rooms: [6, 8], maxRoom: [8, 7] },
  medium: { label: 'Medium', w: 48, h: 34, rooms: [10, 13], maxRoom: [10, 8] },
  large: { label: 'Large', w: 60, h: 42, rooms: [15, 19], maxRoom: [11, 9] },
};

export const THEMES = {
  crypt: {
    label: 'Haunted Crypt', blurb: 'Bone-lined halls where the dead do not rest.',
    types: ['undead'], allies: ['swarm', 'fiend', 'construct', 'ooze'], doors: 0.9, round: 0.15,
    places: ['Crypt', 'Tomb', 'Catacombs', 'Ossuary', 'Barrow'], adjs: ['Weeping', 'Forgotten', 'Silent', 'Hollow', 'Ashen', 'Sunken'],
    senses: ['The air is cold and tastes of grave dust.', 'Somewhere, water drips onto stone with maddening patience.', 'A faint smell of myrrh lingers beneath the rot.', 'Your torchlight seems to shrink, as if the dark were leaning in.'],
    entrance: { kind: 'Sealed Entrance', decor: ['statue', 'statue'], text: ['A great stone door, its seal long broken, opens onto steps worn smooth by mourners’ feet.', 'Two hooded statues flank the stair, their faces chiselled away.'] },
    lair: { kind: 'Tomb of the Forgotten King', decor: ['coffin', 'brazier', 'brazier', 'pillar', 'pillar'], text: ['A vaulted tomb rises around a black sarcophagus carved with a crowned skeleton.', 'Cold blue flames burn in iron braziers that no living hand has tended for centuries.'] },
    rooms: [
      { kind: 'Ossuary', decor: ['rubble'], text: ['Skulls are stacked floor to ceiling in neat, grinning rows.', 'Niches in every wall hold bones bundled in rotting linen.'] },
      { kind: 'Burial Vault', decor: ['coffin', 'coffin', 'coffin'], text: ['Stone coffins line the walls, several lids shifted aside.', 'Names have been scratched out of every epitaph.'] },
      { kind: 'Embalming Chamber', decor: ['table', 'table'], text: ['Slanted stone tables are stained dark, with gutters cut into their edges.', 'Clay jars of dried herbs and resin crowd a crumbling shelf.'] },
      { kind: 'Chapel of Rest', decor: ['altar', 'pillar', 'pillar'], text: ['Pews of rotted wood face an altar draped in a tattered shroud.', 'A mural of a pale ferryman watches from above the altar.'] },
      { kind: 'Collapsed Gallery', decor: ['rubble', 'rubble', 'rubble'], text: ['Part of the ceiling has fallen in, burying half the gallery under rubble.', 'Bones jut from the debris at unpleasant angles.'] },
      { kind: 'Hall of Guardians', decor: ['statue', 'statue', 'pillar', 'pillar'], text: ['Armoured statues stand to attention along both walls, swords lowered.', 'One pedestal is empty.'] },
      { kind: 'Mourners’ Antechamber', decor: ['brazier'], text: ['Faded tapestries show a funeral procession winding into the earth.', 'A cold brazier holds the ash of offerings.'] },
    ],
  },
  cavern: {
    label: 'Twisting Caverns', blurb: 'Natural caves, dripping and alive with hungry things.',
    types: ['beast', 'monstrosity'], allies: ['ooze', 'aberration', 'swarm', 'plant'], doors: 0, round: 0, cave: true,
    places: ['Caverns', 'Grotto', 'Warrens', 'Deeps', 'Hollows'], adjs: ['Dripping', 'Echoing', 'Glimmering', 'Black', 'Howling', 'Drowned'],
    senses: ['Water trickles somewhere ahead, loud in the stillness.', 'The air is damp and smells of wet stone and musk.', 'Pale fungus glows faintly along the walls.', 'A cold draught suggests another way out, somewhere.'],
    entrance: { kind: 'Cave Mouth', decor: ['rubble'], text: ['Daylight fades behind you as the cave mouth narrows into the hill.', 'Claw marks score the rock at shoulder height.'] },
    lair: { kind: 'The Great Den', decor: ['pool', 'rubble', 'rubble'], text: ['The passage opens into a vast cavern, its ceiling lost in darkness.', 'Gnawed bones and glittering debris are heaped around a dark, still pool.'] },
    rooms: [
      { kind: 'Fungus Grotto', decor: ['fungus', 'fungus'], text: ['Giant mushrooms crowd the chamber, their caps glowing violet.', 'Spores drift lazily in your light.'] },
      { kind: 'Underground Pool', decor: ['pool'], text: ['A black pool fills much of this cave, its surface utterly still.', 'Something pale moves beneath the water, then is gone.'] },
      { kind: 'Crystal Hollow', decor: ['crystal', 'crystal'], text: ['Quartz crystals as long as spears jut from the walls, scattering your light.', 'They ring faintly when touched.'] },
      { kind: 'Collapsed Tunnel', decor: ['rubble', 'rubble'], text: ['A rockfall has half-choked this cave.', 'Fresh scrapes on the stones show something squeezes through here often.'] },
      { kind: 'Bone Midden', decor: ['rubble'], text: ['The floor crunches with animal bones and the odd rusted buckle.', 'The stench is overwhelming.'] },
      { kind: 'Echoing Chasm', decor: ['chasm'], text: ['A crack in the floor plunges into darkness; a stone dropped in never seems to land.', 'A narrow ledge skirts its edge.'] },
      { kind: 'Stalagmite Forest', decor: ['pillar', 'pillar', 'pillar'], text: ['Stalagmites rise like the teeth of some great beast.', 'Water drips from their tips in slow, endless rhythm.'] },
    ],
  },
  stronghold: {
    label: 'Bandit Stronghold', blurb: 'A ruined keep held by brigands and their bought muscle.',
    types: ['humanoid'], allies: ['beast', 'giant', 'construct', 'monstrosity'], doors: 0.95, round: 0.05,
    places: ['Keep', 'Hold', 'Bastion', 'Redoubt', 'Watch'], adjs: ['Broken', 'Red', 'Iron', 'Grey', 'Crow’s', 'Last'],
    senses: ['Somewhere above, a dog barks and is cursed into silence.', 'The air smells of woodsmoke, sweat and cheap ale.', 'Laughter echoes faintly from deeper inside.', 'Fresh mud on the flagstones shows heavy traffic.'],
    entrance: { kind: 'Gatehouse', decor: ['brazier'], text: ['A portcullis, rusted half-open, guards a passage through the old wall.', 'Murder holes stare down from the ceiling.'] },
    lair: { kind: 'Warlord’s Hall', decor: ['throne', 'table', 'brazier', 'brazier'], text: ['Stolen banners hang from the rafters of this great hall.', 'A crude throne of lashed shields sits on a dais above a long feasting table.'] },
    rooms: [
      { kind: 'Barracks', decor: ['bed', 'bed', 'bed'], text: ['Straw pallets and bedrolls are scattered across the floor.', 'Dice and copper coins lie abandoned beside a guttering candle.'] },
      { kind: 'Armoury', decor: ['rack', 'rack'], text: ['Weapon racks line the walls, mostly emptied.', 'A grindstone stands beside a barrel of rusty arrowheads.'] },
      { kind: 'Mess Hall', decor: ['table', 'table'], text: ['Long tables are littered with bowls of congealed stew.', 'A cauldron hangs over a dying fire.'] },
      { kind: 'Prison Cells', decor: ['cage', 'cage'], text: ['Iron-barred cells line one wall.', 'Someone has scratched tally marks, hundreds of them, into the stone.'] },
      { kind: 'Storeroom', decor: ['crate', 'crate', 'crate'], text: ['Crates and sacks stamped with merchant marks are piled to the ceiling.', 'Most have been pried open.'] },
      { kind: 'Kennels', decor: ['cage'], text: ['The reek of wet dog hits you before anything else.', 'Chewed bones and heavy chains are strewn across the straw.'] },
      { kind: 'Lookout Post', decor: ['table'], text: ['Arrow slits look out over the approach road.', 'A crude map pinned to the wall marks caravan routes in red.'] },
    ],
  },
  sewer: {
    label: 'Flooded Undercity', blurb: 'Sluices and drains beneath a sleeping city.',
    types: ['ooze', 'swarm', 'beast'], allies: ['humanoid', 'aberration', 'monstrosity', 'undead'], doors: 0.6, round: 0.1,
    places: ['Undercity', 'Sluices', 'Cisterns', 'Drains', 'Culverts'], adjs: ['Rotting', 'Drowned', 'Old', 'Lower', 'Weeping', 'Black'],
    senses: ['The stench is thick enough to taste.', 'Dark water gurgles in channels underfoot.', 'Rats squeal and scatter beyond your light.', 'Far above, the muffled toll of a city bell.'],
    entrance: { kind: 'Storm Drain', decor: ['pool'], text: ['Rusted rungs descend from a grate into a brick tunnel slick with slime.', 'Runoff pours down from the street in a steady stream.'] },
    lair: { kind: 'The Great Cistern', decor: ['pool', 'pool', 'pillar', 'pillar'], text: ['A vaulted cistern stretches away, its pillars standing in black water.', 'Something large has made a nest of refuse on a raised platform.'] },
    rooms: [
      { kind: 'Overflow Chamber', decor: ['pool'], text: ['Water churns into a deep sump in the middle of the floor.', 'Debris from the city above has collected in a stinking drift.'] },
      { kind: 'Smugglers’ Cache', decor: ['crate', 'crate'], text: ['Waxed crates are stacked on a dry ledge.', 'A lantern hook and fresh boot prints show recent visitors.'] },
      { kind: 'Collapsed Culvert', decor: ['rubble', 'rubble'], text: ['The brick vault has caved in, letting a thin shaft of daylight through.', 'Roots dangle from above like grasping fingers.'] },
      { kind: 'Sluice Gate Room', decor: ['wheel'], text: ['A massive iron wheel controls a sluice gate, frozen by rust.', 'The water level marks on the wall reach shoulder height.'] },
      { kind: 'Forgotten Shrine', decor: ['altar'], text: ['A tiny shrine to a forgotten river god sits in an alcove.', 'Fresh flowers lie on it, which is troubling.'] },
      { kind: 'Rat Warren', decor: ['rubble'], text: ['Holes riddle the walls and the floor seethes with movement.', 'Gnawed scraps of cloth and bone are everywhere.'] },
    ],
  },
  temple: {
    label: 'Cultist Temple', blurb: 'A buried sanctum where a cult whispers to dark powers.',
    types: ['humanoid', 'fiend'], allies: ['undead', 'aberration', 'construct'], doors: 0.9, round: 0.3,
    places: ['Temple', 'Sanctum', 'Fane', 'Sepulchre', 'Cloister'], adjs: ['Whispering', 'Crimson', 'Veiled', 'Eclipsed', 'Nameless', 'Shattered'],
    senses: ['A low chant rises and falls somewhere in the walls.', 'Incense cannot quite mask the smell of old blood.', 'Strange sigils on the floor seem to shift when you look away.', 'The candles here burn with a faint green flame.'],
    entrance: { kind: 'Profane Narthex', decor: ['statue', 'statue'], text: ['Defaced holy symbols have been painted over with a sprawling, many-eyed sigil.', 'Robed statues bow towards the inner doors.'] },
    lair: { kind: 'Altar of the Devourer', decor: ['altar', 'pillar', 'pillar', 'pillar', 'pillar', 'brazier'], text: ['A circular sanctum surrounds a black altar beneath a domed ceiling painted with stars that are wrong.', 'Something on the altar is still twitching.'] },
    rooms: [
      { kind: 'Scriptorium', decor: ['table', 'shelf'], text: ['Desks are piled with half-copied scrolls in a crabbed, unfamiliar script.', 'One page has been written in what looks like blood.'] },
      { kind: 'Acolyte Cells', decor: ['bed', 'bed'], text: ['Bare cells hold thin mattresses and nothing else.', 'Each door is scratched with the same symbol.'] },
      { kind: 'Ritual Circle', decor: ['brazier', 'brazier'], text: ['A summoning circle of silver inlay dominates the floor, one segment deliberately broken.', 'The air hums faintly.'] },
      { kind: 'Reliquary', decor: ['altar', 'statue'], text: ['Glass cases hold blackened fingers, teeth and a single eye that seems to follow you.', 'Most cases are smashed and empty.'] },
      { kind: 'Hall of Penance', decor: ['pillar', 'pillar', 'cage'], text: ['Chains hang from the ceiling, some still with manacles attached.', 'The floor is worn into grooves where penitents knelt.'] },
      { kind: 'Vestry', decor: ['shelf', 'table'], text: ['Black robes hang in neat rows.', 'Masks of beaten copper, each with too many eyeholes, rest on a shelf.'] },
    ],
  },
  lair: {
    label: 'Volcanic Lair', blurb: 'Lava-lit tunnels leading to something ancient and hungry.',
    types: ['elemental', 'dragon'], allies: ['fiend', 'giant', 'monstrosity', 'humanoid'], doors: 0.15, round: 0.2, cave: true,
    places: ['Lair', 'Forge', 'Maw', 'Furnace', 'Caldera'], adjs: ['Burning', 'Smouldering', 'Obsidian', 'Molten', 'Scorched', 'Cinder'],
    senses: ['Heat rolls off the walls in waves.', 'The air reeks of sulphur and hot iron.', 'A deep rumble shudders through the rock beneath your feet.', 'Ash drifts down like grey snow.'],
    entrance: { kind: 'Smoking Vent', decor: ['rubble'], text: ['A fissure in the mountainside exhales hot, stinking air.', 'The rock around it is glassy and black.'] },
    lair: { kind: 'The Hoard Chamber', decor: ['lava', 'hoard', 'pillar'], text: ['A cathedral of black stone glows red from a river of lava.', 'Mountains of coin and treasure glitter around a great sleeping shape.'] },
    rooms: [
      { kind: 'Lava Channel', decor: ['lava'], text: ['A river of molten rock cuts across the cave, crossed by a crumbling bridge of basalt.', 'Your skin prickles in the heat.'] },
      { kind: 'Obsidian Gallery', decor: ['crystal', 'crystal'], text: ['Walls of volcanic glass reflect your torch a hundred times.', 'Shards crunch underfoot.'] },
      { kind: 'Kobold Warrens', decor: ['bed', 'crate'], text: ['Tiny tunnels honeycomb the walls, and crude fetishes hang from strings.', 'Someone has painted a dragon in soot, very badly.'] },
      { kind: 'Steam Vents', decor: ['pool'], text: ['Scalding steam bursts from cracks in the floor at irregular intervals.', 'Bones around the vents have been cooked white.'] },
      { kind: 'Ancient Forge', decor: ['anvil', 'brazier'], text: ['An anvil the size of a cart sits beside a forge fed by lava.', 'Half-finished weapons of giant size lie scattered about.'] },
      { kind: 'Scorched Antechamber', decor: ['rubble', 'statue'], text: ['Scorch marks radiate from the centre of the room like a terrible sunburst.', 'A blackened shield lies melted into the floor.'] },
    ],
  },
  fey: {
    label: 'Overgrown Ruin', blurb: 'A moss-choked palace half-swallowed by the Feywild.',
    types: ['fey', 'plant', 'beast'], allies: ['monstrosity', 'celestial', 'elemental', 'humanoid'], doors: 0.5, round: 0.45,
    places: ['Hollow', 'Bower', 'Palace', 'Gardens', 'Court'], adjs: ['Thorned', 'Twilight', 'Gilded', 'Laughing', 'Moonlit', 'Withered'],
    senses: ['Faint music drifts from nowhere at all.', 'The air smells of honeysuckle and something sharper beneath.', 'Fireflies drift in patterns that look almost like words.', 'Time feels slippery here; your shadow lags a moment behind you.'],
    entrance: { kind: 'Thorn Gate', decor: ['tree'], text: ['An archway of living thorns parts as you approach, then closes behind you.', 'Tiny bells hang from the briars, though there is no wind.'] },
    lair: { kind: 'Throne of the Briar Queen', decor: ['throne', 'tree', 'tree', 'pool'], text: ['A throne grown from a single ancient oak sits beside a moonlit pool.', 'Flowers turn their faces to watch you.'] },
    rooms: [
      { kind: 'Sunken Garden', decor: ['tree', 'tree', 'pool'], text: ['Flowering trees grow from cracks in the marble floor.', 'Petals fall endlessly, though the branches never thin.'] },
      { kind: 'Hall of Mirrors', decor: ['statue', 'statue'], text: ['Silvered mirrors line the walls, reflecting a room full of revellers who are not there.', 'One reflection waves.'] },
      { kind: 'Banquet Hall', decor: ['table', 'table'], text: ['A feast is laid out, fresh and steaming, for guests long gone.', 'Eating here is surely a terrible idea.'] },
      { kind: 'Mushroom Ring', decor: ['fungus', 'fungus'], text: ['A perfect ring of red-capped mushrooms circles the room.', 'The grass inside it is a slightly different green.'] },
      { kind: 'Moonwell', decor: ['pool'], text: ['A silver pool reflects a full moon, though there is a stone ceiling above.', 'Whispers rise from the water if you lean close.'] },
      { kind: 'Overgrown Library', decor: ['shelf', 'tree'], text: ['Ivy has burst the shelves, scattering books written in a looping, luminous script.', 'A moth the size of a hand rests on an open page.'] },
    ],
  },
};

const DECOR_FALLBACK = ['rubble', 'pillar'];

const TRAPS = [
  { name: 'Poison needle', trigger: 'picking the lock or opening the lid', save: 'Con', effect: 'poison damage, and the target is poisoned for 1 hour on a failed save' },
  { name: 'Collapsing ceiling', trigger: 'a tripwire across the floor', save: 'Dex', effect: 'bludgeoning damage as the ceiling comes down, half on a success' },
  { name: 'Hidden pit', trigger: 'a false floor that gives way', save: 'Dex', effect: 'bludgeoning damage from a fall into a 10-foot pit lined with spikes' },
  { name: 'Poison darts', trigger: 'a pressure plate', save: 'Dex', effect: 'poison damage from darts fired from holes in the walls' },
  { name: 'Fire-breathing statue', trigger: 'stepping onto the tiles before a statue', save: 'Dex', effect: 'fire damage in a 15-foot cone, half on a success' },
  { name: 'Glyph of warding', trigger: 'passing the doorway without speaking the password', save: 'Dex', effect: 'thunder damage in a 20-foot sphere, half on a success' },
  { name: 'Scything blade', trigger: 'a loose flagstone', save: 'Dex', effect: 'slashing damage from a blade that sweeps out of the wall' },
  { name: 'Rolling sphere', trigger: 'lifting the treasure from its pedestal', save: 'Dex', effect: 'bludgeoning damage as a stone sphere thunders down the room' },
  { name: 'Sleep gas', trigger: 'opening the door', save: 'Con', effect: 'no damage, but the target falls unconscious for 10 minutes on a failed save', noDamage: true },
];

// Treasure by tier: levels 1–4, 5–10, 11–16, 17–20.
const tierOf = (level) => (level <= 4 ? 0 : level <= 10 ? 1 : level <= 16 ? 2 : 3);
const TRAP_DAMAGE = [['2d10', '4d10'], ['4d10', '10d10'], ['10d10', '18d10'], ['10d10', '24d10']];
const GEMS = [
  [10, ['azurite', 'banded agate', 'blue quartz', 'hematite', 'moss agate', 'tiger eye']],
  [50, ['bloodstone', 'carnelian', 'moonstone', 'onyx', 'star rose quartz', 'zircon']],
  [100, ['amber', 'amethyst', 'coral', 'jade', 'pearl', 'spinel']],
  [500, ['alexandrite', 'aquamarine', 'black pearl', 'blue spinel', 'peridot', 'topaz']],
  [1000, ['black opal', 'blue sapphire', 'emerald', 'fire opal', 'star ruby', 'yellow sapphire']],
  [5000, ['black sapphire', 'diamond', 'jacinth', 'ruby']],
];
const ART = ['a silver ewer', 'a carved bone statuette', 'a gold bracelet', 'an embroidered silk handkerchief', 'a jewelled dagger', 'a painted wooden mask', 'a gold locket with a portrait inside', 'a brass mug with jade inlay', 'a silver-plated holy symbol'];
const ITEMS = [
  ['potion of healing', 'potion of climbing', 'spell scroll (1st level)', 'spell scroll (cantrip)', 'potion of animal friendship', 'driftglobe', '+1 ammunition (10)', 'bag of holding', 'goggles of night', 'rope of climbing', 'cloak of protection', 'wand of magic missiles'],
  ['potion of greater healing', 'potion of fire breath', 'spell scroll (3rd level)', '+1 weapon', '+1 shield', 'boots of elvenkind', 'cloak of elvenkind', 'immovable rod', 'wand of web', 'ring of protection', 'bracers of defence', 'flame tongue'],
  ['potion of superior healing', 'spell scroll (6th level)', '+2 weapon', '+2 armour', 'staff of fire', 'ring of spell storing', 'cloak of displacement', 'wand of fireballs', 'belt of hill giant strength', 'amulet of health'],
  ['potion of supreme healing', 'spell scroll (9th level)', '+3 weapon', 'ring of regeneration', 'staff of power', 'holy avenger', 'belt of storm giant strength', 'cloak of invisibility', 'ring of three wishes'],
];
const COINS = [[['2d6', 10, 'gp'], ['3d6', 10, 'sp']], [['4d6', 10, 'gp'], ['2d6', 10, 'pp']], [['4d6', 100, 'gp'], ['5d6', 10, 'pp']], [['12d6', 100, 'gp'], ['8d6', 100, 'pp']]];

const TACTICS = [
  'lurks in the shadows, waiting for stragglers', 'stands guard and raises the alarm at the first sign of intruders',
  'is feeding and is easily distracted', 'squabbles with its kin over a scrap of loot', 'lies in ambush behind the door',
  'is asleep, but sleeps lightly', 'patrols between here and the next chamber', 'fights to the death to protect this place',
  'flees to warn the others if badly hurt', 'can be bargained with, if the price is right',
];

const NAME_A = ['Vel', 'Mor', 'Ash', 'Kar', 'Sel', 'Thal', 'Ur', 'Zan', 'Ori', 'Bal', 'Ner', 'Cael', 'Dru', 'Ys'];
const NAME_B = ['oth', 'ira', 'gar', 'ane', 'umar', 'eth', 'ion', 'ax', 'esh', 'or', 'yn', 'ava', 'ek', 'is'];

const HOOKS = [
  (d, r) => `A frightened shepherd swears ${r.pick(['their sister', 'a whole patrol', 'the village priest', 'a travelling bard'])} vanished near ${d.name} three nights ago.`,
  (d, r) => `A scholar named ${d.npc(r)} will pay 200 gp for a rubbing of the inscription in ${d.lairName}.`,
  (d, r) => `Rumours say ${d.npc(r)}, a notorious ${r.pick(['thief', 'necromancer', 'deserter', 'heretic'])}, fled into ${d.name} with a stolen relic.`,
  (d, r) => `The town’s ${r.pick(['well water has turned black', 'livestock are dying', 'children dream the same nightmare'])}, and every trail of it leads to ${d.name}.`,
  (d) => `An old map shows a fortune hidden in ${d.lairName}, deep within ${d.name}.`,
  (d, r) => `${d.npc(r)}, a dying adventurer, begs you to recover their companion’s ${r.pick(['sword', 'holy symbol', 'spellbook', 'ashes'])} from ${d.name}.`,
];

// ── Geometry ──────────────────────────────────────────────────────────────────
const ROCK = '#', FLOOR = '.', CORRIDOR = ',';

/** "spy" → "spies", "wolf" → "wolves", "bandit captain" → "bandit captains". */
function plural(name) {
  const lower = name.toLowerCase();
  if (/(man)$/.test(lower)) return lower.replace(/man$/, 'men');
  if (/[^aeiou]y$/.test(lower)) return lower.replace(/y$/, 'ies');
  if (/(s|x|ch|sh)$/.test(lower)) return `${lower}es`;
  if (/(wolf|elf|dwarf)$/.test(lower)) return lower.replace(/f$/, 'ves');
  return `${lower}s`;
}

/**
 * Generates a dungeon. `monsters` is the bestiary index ([{ id, name, type, cr, xp, size }]) used to
 * stock encounters; without it, rooms are left unstocked.
 */
export function generateDungeon({ seed = randomSeedWord(), theme = 'crypt', size = 'medium', level = 3, party = 4, monsters = [] } = {}) {
  const T = THEMES[theme] ?? THEMES.crypt;
  const S = SIZES[size] ?? SIZES.medium;
  level = Math.max(1, Math.min(20, Math.round(level)));
  party = Math.max(1, Math.min(8, Math.round(party)));
  const r = makeRng(hashSeed(`${seed}|${theme}|${size}`));
  const W = S.w, H = S.h;
  const grid = new Array(W * H).fill(ROCK);
  const owner = new Int16Array(W * H).fill(-1);
  const at = (x, y) => y * W + x;
  const inBounds = (x, y) => x > 0 && y > 0 && x < W - 1 && y < H - 1;

  // Rooms: random placement with a margin so walls never touch.
  const rooms = [];
  const target = r.int(S.rooms[0], S.rooms[1]);
  for (let attempt = 0; attempt < 600 && rooms.length < target; attempt++) {
    const big = r.chance(0.2);
    const w = r.int(4, S.maxRoom[0] + (big ? 3 : 0) + (T.cave ? 2 : 0));
    const h = r.int(4, S.maxRoom[1] + (big ? 2 : 0) + (T.cave ? 2 : 0));
    const x = r.int(2, W - w - 2), y = r.int(2, H - h - 2);
    if (rooms.some((o) => x < o.x + o.w + 3 && o.x < x + w + 3 && y < o.y + o.h + 3 && o.y < y + h + 3)) continue;
    const shape = T.cave ? 'cave' : r.chance(T.round) && w >= 5 && h >= 5 ? 'round' : 'rect';
    rooms.push({ x, y, w, h, shape });
  }

  rooms.forEach((room, id) => {
    const cx = room.x + room.w / 2, cy = room.y + room.h / 2;
    // Caves get a lumpy outline from a few random harmonics around the ellipse.
    const waves = Array.from({ length: 3 }, (_, k) => ({ f: k + 2, a: r() * 0.18, p: r() * Math.PI * 2 }));
    for (let y = room.y; y < room.y + room.h; y++) {
      for (let x = room.x; x < room.x + room.w; x++) {
        const dx = (x + 0.5 - cx) / (room.w / 2), dy = (y + 0.5 - cy) / (room.h / 2);
        let inside = true;
        if (room.shape === 'round') inside = dx * dx + dy * dy <= 1.05;
        else if (room.shape === 'cave') {
          const angle = Math.atan2(dy, dx);
          const edge = 0.9 + waves.reduce((s, wv) => s + wv.a * Math.sin(wv.f * angle + wv.p), 0);
          inside = Math.hypot(dx, dy) <= edge;
        }
        if (inside) {
          grid[at(x, y)] = FLOOR;
          owner[at(x, y)] = id;
        }
      }
    }
  });

  const centre = (room) => [Math.floor(room.x + room.w / 2), Math.floor(room.y + room.h / 2)];

  // Connections: a minimum spanning tree, then a few extra links so the map has loops.
  const dist = (a, b) => {
    const [ax, ay] = centre(a), [bx, by] = centre(b);
    return Math.hypot(ax - bx, ay - by);
  };
  const edges = [];
  const linked = new Set([0]);
  while (linked.size < rooms.length) {
    let best = null;
    for (const i of linked) {
      for (let j = 0; j < rooms.length; j++) {
        if (linked.has(j)) continue;
        const d = dist(rooms[i], rooms[j]);
        if (!best || d < best.d) best = { a: i, b: j, d };
      }
    }
    linked.add(best.b);
    edges.push({ a: best.a, b: best.b, extra: false });
  }
  const hasEdge = (a, b) => edges.some((e) => (e.a === a && e.b === b) || (e.a === b && e.b === a));
  rooms.forEach((room, i) => {
    if (!r.chance(T.cave ? 0.3 : 0.22)) return;
    const near = rooms.map((o, j) => ({ j, d: dist(room, o) })).filter(({ j }) => j !== i && !hasEdge(i, j)).sort((p, q) => p.d - q.d)[0];
    if (near && near.d < W * 0.45) edges.push({ a: i, b: near.j, extra: true });
  });

  // Corridors: A* that prefers straight runs, reuses existing passages and keeps clear of rooms
  // it isn't connecting, so passages don't scrape along other rooms' walls.
  const pathOwner = new Int16Array(W * H).fill(-1);
  const besideOther = (x, y, ends) => [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]].some(([dx, dy]) => {
    const o = owner[at(x + dx, y + dy)];
    return o >= 0 && !ends.has(o);
  });
  edges.forEach((edge, ei) => {
    const [sx, sy] = centre(rooms[edge.a]), [tx, ty] = centre(rooms[edge.b]);
    const ends = new Set([edge.a, edge.b]);
    const cost = (x, y) => {
      const o = owner[at(x, y)];
      if (ends.has(o)) return 0.3;
      if (o >= 0) return 25;
      if (besideOther(x, y, ends)) return 12;
      const base = grid[at(x, y)] === CORRIDOR ? 0.6 : 1;
      return T.cave ? base + r() * 1.2 : base;
    };
    const open = new Map([[at(sx, sy), { x: sx, y: sy, g: 0, f: 0, dir: -1, prev: null }]]);
    const closed = new Map();
    let found = null;
    while (open.size) {
      let cur = null;
      for (const n of open.values()) if (!cur || n.f < cur.f) cur = n;
      open.delete(at(cur.x, cur.y));
      closed.set(at(cur.x, cur.y), cur);
      if (cur.x === tx && cur.y === ty) { found = cur; break; }
      [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([dx, dy], dir) => {
        const nx = cur.x + dx, ny = cur.y + dy;
        if (!inBounds(nx, ny) || closed.has(at(nx, ny))) return;
        const g = cur.g + cost(nx, ny) + (cur.dir >= 0 && cur.dir !== dir ? 0.6 : 0);
        const prior = open.get(at(nx, ny));
        if (prior && prior.g <= g) return;
        open.set(at(nx, ny), { x: nx, y: ny, g, f: g + Math.abs(tx - nx) + Math.abs(ty - ny), dir, prev: cur });
      });
    }
    for (let n = found; n; n = n.prev) {
      const i = at(n.x, n.y);
      if (owner[i] >= 0) continue;
      if (grid[i] === ROCK) grid[i] = CORRIDOR;
      if (pathOwner[i] < 0) pathOwner[i] = ei;
    }
  });

  // Doors: a passage cell touching a room, with rock on both sides across the opening.
  const doors = [];
  const doorAt = new Set();
  for (let y = 1; y < H - 1; y++) {
    for (let x = 1; x < W - 1; x++) {
      if (grid[at(x, y)] !== CORRIDOR) continue;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const room = owner[at(x + dx, y + dy)];
        if (room < 0) continue;
        const sideA = grid[at(x + dy, y + dx)], sideB = grid[at(x - dy, y - dx)];
        if (sideA !== ROCK || sideB !== ROCK || doorAt.has(at(x, y))) continue;
        doorAt.add(at(x, y));
        const edge = edges[pathOwner[at(x, y)]];
        let kind = 'arch';
        if (r.chance(T.doors)) {
          kind = edge?.extra && r.chance(0.5) ? 'secret'
            : r.chance(0.14) ? 'locked' : theme === 'stronghold' && r.chance(0.15) ? 'portcullis' : 'door';
        }
        doors.push({ x, y, dir: dx !== 0 ? 'v' : 'h', kind, room });
      }
    }
  }

  // Entrance: the room nearest the bottom edge, where the party arrives. Rooms are numbered in
  // the order the party would reach them; the lair is the room furthest from the entrance.
  const entrance = rooms.reduce((best, room, i) => (room.y + room.h > rooms[best].y + rooms[best].h ? i : best), 0);
  const adjacency = rooms.map(() => []);
  for (const e of edges) { adjacency[e.a].push(e.b); adjacency[e.b].push(e.a); }
  const hops = new Array(rooms.length).fill(Infinity);
  const order = [entrance];
  hops[entrance] = 0;
  for (let i = 0; i < order.length; i++) {
    const neighbours = adjacency[order[i]].filter((j) => hops[j] === Infinity).sort((a, b) => dist(rooms[order[i]], rooms[a]) - dist(rooms[order[i]], rooms[b]));
    for (const j of neighbours) { hops[j] = hops[order[i]] + 1; order.push(j); }
  }
  // The lair favours depth, then size: a boss deserves a big room.
  const lairScore = (i) => (i === entrance ? -Infinity : hops[i] + (rooms[i].w * rooms[i].h) / 30);
  const lair = rooms.reduce((best, _, i) => (lairScore(i) > lairScore(best) ? i : best), entrance === 0 ? 1 : 0);

  // ── Stocking ────────────────────────────────────────────────────────────────
  const thresholds = partyThresholds({ level, size: party });
  const tier = tierOf(level);
  const pool = (types) => monsters.filter((m) => types.includes(m.type) && m.xp > 0);
  const themed = pool(T.types);
  const allies = pool(T.allies);
  const anyMonster = monsters.filter((m) => m.xp > 0);
  const roll = (expr) => {
    const [n, s] = expr.split('d').map(Number);
    let t = 0;
    for (let i = 0; i < n; i++) t += r.int(1, s);
    return t;
  };

  function buildEncounter(difficulty, { boss = false } = {}) {
    const budget = { easy: thresholds.easy, medium: thresholds.medium, hard: thresholds.hard, deadly: thresholds.deadly * 1.1 }[difficulty];
    const maxCr = boss ? level + 4 : level + 1;
    const choose = (list) => list.filter((m) => crToNumber(m.cr) <= maxCr);
    const leads = choose(themed).length ? choose(themed) : choose(anyMonster);
    const helpers = [...choose(themed), ...choose(allies)];
    if (!leads.length) return null;
    let best = null;
    for (let attempt = 0; attempt < 40; attempt++) {
      const fitting = leads.filter((m) => m.xp * (boss ? 1 : 1.5) <= budget * 1.15);
      const lead = r.pick(fitting.length ? fitting : [...leads].sort((a, b) => a.xp - b.xp).slice(0, 3));
      const groups = [{ m: lead, count: 1 }];
      const score = () => encounterXp(groups.map((g) => ({ xp: g.m.xp, count: g.count })), party).adjusted;
      for (let n = 1; n < 8 && score() < budget * 0.85; n++) {
        const extra = r.chance(0.6) || !helpers.length ? r.pick(groups) : null;
        if (extra) extra.count++;
        else {
          const minions = helpers.filter((m) => m.xp <= lead.xp && !groups.some((g) => g.m.id === m.id));
          if (!minions.length) { groups[0].count++; continue; }
          groups.push({ m: r.pick(minions), count: 1 });
        }
        if (score() > budget * 1.25) {
          const last = groups[groups.length - 1];
          if (last.count > 1) last.count--; else groups.pop();
          break;
        }
      }
      const diff = Math.abs(score() - budget);
      if (!best || diff < best.diff) best = { groups: groups.map((g) => ({ ...g })), diff };
    }
    const groups = best.groups;
    const xp = encounterXp(groups.map((g) => ({ xp: g.m.xp, count: g.count })), party);
    const leadName = groups[0].count > 1 ? `pack of ${plural(groups[0].m.name)}` : groups[0].m.name;
    return {
      monsters: groups.map((g) => ({ id: g.m.id, name: g.m.name, cr: g.m.cr, xp: g.m.xp, count: g.count })),
      xp: xp.base, adjustedXp: xp.adjusted, difficulty: difficultyOf(xp.adjusted, thresholds),
      tactics: `The ${leadName} ${boss ? 'is the master of this place and ' : ''}${r.pick(TACTICS)}.`,
    };
  }

  const coins = () => COINS[tier].map(([dice, mult, unit]) => `${roll(dice) * mult} ${unit}`);
  const gem = (count) => {
    const [value, names] = GEMS[Math.min(GEMS.length - 1, tier + r.int(0, 2))];
    return `${count} ${count > 1 ? 'gems' : 'gem'} (${r.pick(names)}) worth ${value} gp${count > 1 ? ' each' : ''}`;
  };
  const art = () => `${r.pick(ART)} worth ${[25, 250, 750, 2500][tier]} gp`;
  const item = (bump = 0) => r.pick(ITEMS[Math.min(3, tier + bump)]);

  function treasureFor(kind) {
    if (kind === 'hoard') return [...coins().map((c) => c.replace(/^(\d+)/, (n) => String(Number(n) * 4))), gem(r.int(2, 5)), art(), art(), item(), item(), r.chance(0.6) ? item(1) : item()];
    if (kind === 'cache') return [r.chance(0.5) ? gem(1) : art(), item()];
    return [coins()[0], ...(r.chance(0.4) ? [gem(r.int(1, 3))] : []), ...(r.chance(0.3) ? [item()] : [])];
  }

  function trapFor() {
    const t = r.pick(TRAPS);
    const deadly = r.chance(0.35);
    return {
      name: t.name, trigger: t.trigger, save: t.save,
      dc: deadly ? r.int(15, 17) : r.int(11, 14), detect: r.int(12, 16),
      damage: t.noDamage ? null : TRAP_DAMAGE[tier][deadly ? 1 : 0],
      effect: t.effect, severity: deadly ? 'dangerous' : 'setback',
    };
  }

  const kinds = r.shuffle(T.rooms);
  let kindIndex = 0;
  const dungeonName = `The ${r.pick(T.adjs)} ${r.pick(T.places)} of ${r.pick(NAME_A)}${r.pick(NAME_B)}`;
  const features = [];
  const roomsOut = rooms.map((room, i) => ({ ...room, id: i }));

  for (const [n, i] of order.entries()) {
    const room = roomsOut[i];
    const def = i === entrance ? T.entrance : i === lair ? T.lair : kinds[kindIndex++ % kinds.length];
    room.n = n + 1;
    room.kind = def.kind;
    room.role = i === entrance ? 'entrance' : i === lair ? 'lair' : 'room';
    const sizeWord = room.role === 'lair' ? 'great' : room.w * room.h > 70 ? 'vast' : room.w * room.h > 36 ? 'wide' : 'cramped';
    const shapeWord = room.shape === 'round' ? 'circular chamber' : room.shape === 'cave' ? 'cave' : 'chamber';
    room.readAloud = [`You enter a ${sizeWord} ${shapeWord}.`, ...def.text, r.pick(T.senses)].join(' ');

    let difficulty = null;
    if (room.role === 'lair') difficulty = r.chance(0.5) ? 'hard' : 'deadly';
    else if (room.role === 'entrance') difficulty = r.chance(0.4) ? 'easy' : null;
    else difficulty = r.pick([null, null, null, 'easy', 'easy', 'medium', 'medium', 'medium', 'hard']);
    room.encounter = difficulty ? buildEncounter(difficulty, { boss: room.role === 'lair' }) : null;

    room.trap = !room.encounter && room.role === 'room' && r.chance(0.35) ? trapFor() : null;
    room.treasure = room.role === 'lair' ? treasureFor('hoard')
      : room.encounter && r.chance(0.55) ? treasureFor('carried')
        : !room.encounter && r.chance(0.25) ? treasureFor('cache') : [];
    room.notes = '';

    // Furniture on free interior cells away from the walls, so nothing blocks a doorway.
    const free = [];
    for (let y = room.y + 1; y < room.y + room.h - 1; y++) {
      for (let x = room.x + 1; x < room.x + room.w - 1; x++) {
        if (owner[at(x, y)] !== i) continue;
        if ([[1, 0], [-1, 0], [0, 1], [0, -1]].every(([dx, dy]) => grid[at(x + dx, y + dy)] === FLOOR)) free.push([x, y]);
      }
    }
    const spots = r.shuffle(free);
    const decor = def.decor?.length ? def.decor : DECOR_FALLBACK;
    for (const type of decor) {
      const spot = spots.pop();
      if (spot) features.push({ x: spot[0], y: spot[1], type, room: i });
    }
    const place = (type, extra = {}) => {
      const spot = spots.pop();
      if (spot) features.push({ x: spot[0], y: spot[1], type, room: i, ...extra });
    };
    if (room.role === 'entrance') place('stairs-up');
    if (room.role === 'lair') place('stairs-down');
    if (room.treasure.length) place('chest');
    if (room.trap) place('trap', { hidden: true });
  }

  // A couple of traps in the passages too.
  const passages = [];
  for (let i = 0; i < grid.length; i++) if (grid[i] === CORRIDOR && !doorAt.has(i)) passages.push(i);
  const corridorTraps = [];
  for (const i of r.shuffle(passages).slice(0, rooms.length > 10 ? 2 : 1)) {
    const trap = trapFor();
    features.push({ x: i % W, y: Math.floor(i / W), type: 'trap', room: null, hidden: true, trap });
    corridorTraps.push(trap);
  }

  const npc = (rr) => `${rr.pick(NAME_A)}${rr.pick(NAME_B)}`;
  const lairRoom = roomsOut[lair];
  const hookContext = { name: dungeonName.replace(/^The /, 'the '), lairName: `the ${lairRoom.kind.replace(/^The /, '')}`, npc };
  const hooks = r.shuffle(HOOKS).slice(0, 3).map((h) => h(hookContext, r));
  const wandering = Array.from({ length: 6 }, (_, k) => {
    if (k >= 4) return { roll: k + 1, text: r.pick(['Distant footsteps, then silence.', 'A sudden draught snuffs out a torch.', 'A scream echoes from somewhere far off.', 'The ground trembles; dust sifts from above.']) };
    const enc = buildEncounter(k < 2 ? 'easy' : 'medium');
    return { roll: k + 1, text: enc ? enc.monsters.map((m) => `${m.count} × ${m.name}`).join(', ') : 'Nothing stirs.', encounter: enc };
  });

  return {
    version: 1, seed: String(seed), theme, size, level, party, name: dungeonName,
    width: W, height: H, cells: grid.join(''),
    rooms: roomsOut.sort((a, b) => a.n - b.n),
    doors, features, hooks, wandering, corridorTraps,
    createdWith: { theme, size, level, party },
  };
}

/** Which room a cell belongs to, using room bounds (rooms never overlap). */
export function roomAt(dungeon, x, y) {
  if (dungeon.cells[y * dungeon.width + x] !== FLOOR) return null;
  return dungeon.rooms.find((rm) => x >= rm.x && x < rm.x + rm.w && y >= rm.y && y < rm.y + rm.h) ?? null;
}

export const CELL = { ROCK, FLOOR, CORRIDOR };
