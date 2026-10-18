// Encounter difficulty, 5th Edition style (DMG ch. 3): per-character XP thresholds, and a multiplier
// for fighting several monsters at once that shifts with party size.

// Easy, medium, hard, deadly thresholds per character, levels 1–20.
const THRESHOLDS = [
  [25, 50, 75, 100], [50, 100, 150, 200], [75, 150, 225, 400], [125, 250, 375, 500], [250, 500, 750, 1100],
  [300, 600, 900, 1400], [350, 750, 1100, 1700], [450, 900, 1400, 2100], [550, 1100, 1600, 2400], [600, 1200, 1900, 2800],
  [800, 1600, 2400, 3600], [1000, 2000, 3000, 4500], [1100, 2200, 3400, 5100], [1250, 2500, 3800, 5700], [1400, 2800, 4300, 6400],
  [1600, 3200, 4800, 7200], [2000, 3900, 5900, 8800], [2100, 4200, 6300, 9500], [2400, 4900, 7300, 10900], [2800, 5700, 8500, 12700],
];
export const DIFFICULTIES = ['easy', 'medium', 'hard', 'deadly'];
const STEPS = [0.5, 1, 1.5, 2, 2.5, 3, 4];

const clampLevel = (l) => Math.max(1, Math.min(20, Math.round(Number(l) || 1)));

/** Party thresholds: `party` is a list of character levels, or { level, size }. */
export function partyThresholds(party) {
  const levels = Array.isArray(party) ? party : Array.from({ length: Math.max(1, party.size || 4) }, () => party.level);
  const sums = [0, 0, 0, 0];
  for (const l of levels) THRESHOLDS[clampLevel(l) - 1].forEach((v, i) => { sums[i] += v; });
  return { easy: sums[0], medium: sums[1], hard: sums[2], deadly: sums[3], size: levels.length };
}

export function multiplier(monsterCount, partySize = 4) {
  if (monsterCount <= 0) return 0;
  let step = monsterCount === 1 ? 1 : monsterCount === 2 ? 2 : monsterCount <= 6 ? 3 : monsterCount <= 10 ? 4 : monsterCount <= 14 ? 5 : 6;
  if (partySize < 3) step += 1;
  else if (partySize >= 6) step -= 1;
  return STEPS[Math.max(0, Math.min(STEPS.length - 1, step))];
}

/** `groups` is [{ xp, count }]. */
export function encounterXp(groups, partySize = 4) {
  const count = groups.reduce((n, g) => n + (g.count ?? 1), 0);
  const base = groups.reduce((s, g) => s + (g.xp ?? 0) * (g.count ?? 1), 0);
  const mult = multiplier(count, partySize);
  return { base, adjusted: Math.round(base * mult), multiplier: mult, count };
}

export function difficultyOf(adjusted, thresholds) {
  if (adjusted <= 0) return 'none';
  if (adjusted >= thresholds.deadly) return 'deadly';
  if (adjusted >= thresholds.hard) return 'hard';
  if (adjusted >= thresholds.medium) return 'medium';
  if (adjusted >= thresholds.easy) return 'easy';
  return 'trivial';
}

/** Everything a planner needs to show: XP, multiplier, difficulty and XP each hero earns. */
export function rateEncounter(groups, party) {
  const thresholds = partyThresholds(party);
  const xp = encounterXp(groups, thresholds.size);
  return { ...xp, thresholds, difficulty: difficultyOf(xp.adjusted, thresholds), perCharacter: Math.floor(xp.base / thresholds.size) };
}
