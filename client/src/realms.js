export const REALMS = [
  { key: 'dungeon', name: 'Torchlit Dungeon', blurb: 'Damp stone, flickering torches, something breathing in the dark.' },
  { key: 'forest', name: 'Moonlit Wildwood', blurb: 'Ancient trees, silver light and eyes between the leaves.' },
  { key: 'volcano', name: 'Molten Caldera', blurb: 'Rivers of fire beneath a sky of ash.' },
  { key: 'crypt', name: 'Forgotten Crypt', blurb: 'Cold mist, old bones and restless spirits.' },
  { key: 'tundra', name: 'Frozen Wastes', blurb: 'Howling wind across endless ice.' },
  { key: 'astral', name: 'Astral Sea', blurb: 'Silver void between the planes, lit by distant stars.' },
];
export const REALM_BY_KEY = Object.fromEntries(REALMS.map((r) => [r.key, r]));
