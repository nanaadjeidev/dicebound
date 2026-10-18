// Dice expressions: "1d20+5", "2d6 + 1d4 - 1", "4d6kh3", "2d20kl1".
const TERM = /([+-]?)(?:(\d*)d(\d+)(?:(kh|kl)(\d+))?|(\d+))/giy;

export function parseDice(expr) {
  const src = String(expr ?? '').replace(/\s+/g, '').toLowerCase();
  if (!src || src.length > 80) return null;
  const terms = [];
  TERM.lastIndex = 0;
  while (TERM.lastIndex < src.length) {
    const start = TERM.lastIndex;
    const m = TERM.exec(src);
    if (!m || m.index !== start || m[0] === '' || m[0] === '+' || m[0] === '-') return null;
    if (terms.length && !m[1]) return null;
    const sign = m[1] === '-' ? -1 : 1;
    if (m[6] !== undefined) {
      terms.push({ type: 'flat', sign, value: Number(m[6]) });
    } else {
      const count = m[2] === '' ? 1 : Number(m[2]);
      const sides = Number(m[3]);
      if (count < 1 || count > 100 || sides < 1 || sides > 1000) return null;
      const keep = m[4] ? { mode: m[4], n: Math.min(Number(m[5]), count) } : null;
      terms.push({ type: 'dice', sign, count, sides, keep });
    }
  }
  return terms.length ? terms : null;
}

export function isValidDice(expr) {
  return parseDice(expr) !== null;
}

export const rollDie = (sides, rng = Math.random) => 1 + Math.floor(rng() * sides);

/** Rolls an expression. With `crit`, every dice term rolls twice as many dice (5e critical hits). */
export function roll(expr, { crit = false, rng = Math.random } = {}) {
  const terms = parseDice(expr);
  if (!terms) throw new Error(`Invalid dice expression "${expr}"`);
  let total = 0;
  const parts = terms.map((t) => {
    if (t.type === 'flat') {
      total += t.sign * t.value;
      return { ...t, subtotal: t.sign * t.value };
    }
    const count = crit ? t.count * 2 : t.count;
    const rolls = Array.from({ length: count }, () => rollDie(t.sides, rng));
    let kept = rolls.map(() => true);
    if (t.keep) {
      const order = rolls.map((v, i) => [v, i]).sort((a, b) => (t.keep.mode === 'kh' ? b[0] - a[0] : a[0] - b[0]));
      const keepIdx = new Set(order.slice(0, t.keep.n).map(([, i]) => i));
      kept = rolls.map((_, i) => keepIdx.has(i));
    }
    const subtotal = t.sign * rolls.reduce((s, v, i) => s + (kept[i] ? v : 0), 0);
    total += subtotal;
    return { type: 'dice', sign: t.sign, sides: t.sides, rolls, kept, subtotal };
  });
  return { expr: String(expr).replace(/\s+/g, ''), total, parts, crit };
}

/** A d20 test with advantage ("adv"), disadvantage ("dis") or neither. */
export function rollD20(mode = 'normal', rng = Math.random) {
  const a = rollDie(20, rng);
  if (mode !== 'adv' && mode !== 'dis') return { rolls: [a], natural: a, mode: 'normal' };
  const b = rollDie(20, rng);
  return { rolls: [a, b], natural: mode === 'adv' ? Math.max(a, b) : Math.min(a, b), mode };
}

/** "2d6+3" -> "2d6+3", ("1d8", 3) -> "1d8+3", ("1d8", -1) -> "1d8-1" */
export function withBonus(expr, bonus) {
  if (!bonus) return expr;
  return `${expr}${bonus > 0 ? '+' : '-'}${Math.abs(bonus)}`;
}

/** Average result, used for display ("13 (2d8+4)"). */
export function average(expr) {
  const terms = parseDice(expr);
  if (!terms) return 0;
  return Math.floor(terms.reduce((s, t) => {
    if (t.type === 'flat') return s + t.sign * t.value;
    const n = t.keep ? t.keep.n : t.count;
    return s + t.sign * n * (t.sides + 1) / 2;
  }, 0));
}
