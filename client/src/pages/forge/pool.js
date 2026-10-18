// Turning dice expressions and their results into physical dice, and the player's saved dice style.
// Kept free of three.js and the physics engine so the battle table can use it without loading them.
import { parseDice } from '@shared/dice.js';

export const DIE_SIDES = [4, 6, 8, 10, 12, 20];
export const MAX_PHYSICAL_DICE = 8;

export const STYLE_KEY = 'dicebound.forge';
export const DEFAULT_STYLE = {
  sides: 20, finish: 'marbled', body: '#5c0f12', swirl: '#14090a', ink: '#f3d38f', rounding: 0.45, font: 'royal', glow: 0,
  felt: '#1c3a2b', room: '#0d0a08', sound: true, // the Emerald felt backdrop
};

export const STYLE_PRESETS = [
  { name: 'Bloodstone', finish: 'marbled', body: '#5c0f12', swirl: '#14090a', ink: '#f3d38f', font: 'royal', glow: 0 },
  { name: "Dragon's Hoard", finish: 'metal', body: '#d4a85a', swirl: '#d4a85a', ink: '#2a1a0a', font: 'royal', glow: 0 },
  { name: 'Frostbite', finish: 'glass', body: '#8fdcff', swirl: '#8fdcff', ink: '#ffffff', font: 'modern', glow: 0.7 },
  { name: 'Amethyst', finish: 'gem', body: '#9b6bff', swirl: '#9b6bff', ink: '#f4ecff', font: 'scholar', glow: 0.6 },
  { name: 'Moonpearl', finish: 'pearl', body: '#ebe6f3', swirl: '#ebe6f3', ink: '#3b2f5c', font: 'scholar', glow: 0 },
  { name: 'Witchwood', finish: 'marbled', body: '#1f3b22', swirl: '#a2d36a', ink: '#f0e6d2', font: 'artificer', glow: 0 },
  { name: 'Obsidian', finish: 'resin', body: '#141114', swirl: '#141114', ink: '#e8643c', font: 'modern', glow: 1 },
];

export function loadStyle() {
  try {
    const saved = { ...DEFAULT_STYLE, ...JSON.parse(localStorage.getItem(STYLE_KEY)) };
    return { ...saved, glow: Number(saved.glow) || 0 }; // glow used to be an on/off checkbox
  } catch {
    return DEFAULT_STYLE;
  }
}

export function saveStyle(style) {
  try { localStorage.setItem(STYLE_KEY, JSON.stringify(style)); } catch { /* private mode */ }
}

/** Only what other players need to draw your dice. */
export const shareableStyle = ({ finish, body, swirl, ink, rounding, font, glow }) => ({ finish, body, swirl, ink, rounding, font, glow });

/** Advantage/disadvantage turn a lone d20 into 2d20 keep highest/lowest. */
export function withMode(expr, mode) {
  if (mode === 'normal') return expr;
  const terms = parseDice(expr);
  const d20s = terms?.filter((t) => t.type === 'dice' && t.sides === 20) ?? [];
  if (d20s.length !== 1 || d20s[0].count !== 1 || d20s[0].keep) return expr;
  return expr.replace(/(^|[+-])1?d20(?![0-9])/i, `$12d20${mode === 'adv' ? 'kh1' : 'kl1'}`);
}

export const isPhysical = (sides) => DIE_SIDES.includes(sides) || sides === 100;

/**
 * Physical dice for a rolled expression (shared/dice.js `roll` result). A d100 is the classic
 * pair of a tens die (00–90) and a units d10. Pools beyond the tray's capacity roll the rest
 * off-table; their numbers still count.
 */
export function physicalDice(result) {
  const dice = [];
  for (const part of result.parts) {
    if (part.type !== 'dice' || !isPhysical(part.sides)) continue;
    part.rolls.forEach((value, i) => {
      const dropped = !part.kept[i];
      if (part.sides !== 100) {
        dice.push({ sides: part.sides, value, dropped });
        return;
      }
      const tens = Math.floor((value % 100) / 10), units = value % 10;
      dice.push({ sides: 10, variant: 'tens', value: tens || 10, label: tens ? `${tens}0` : '00', dropped });
      dice.push({ sides: 10, value: units || 10, label: String(units), dropped });
    });
  }
  return { dice: dice.slice(0, MAX_PHYSICAL_DICE), offTable: Math.max(0, dice.length - MAX_PHYSICAL_DICE) };
}

/** Natural 20 / natural 1 on a d20 roll, counting only the kept die. */
export function natural(result) {
  const part = result.parts.find((p) => p.type === 'dice' && p.sides === 20);
  if (!part) return null;
  return part.rolls.find((_, i) => part.kept[i]) ?? null;
}
