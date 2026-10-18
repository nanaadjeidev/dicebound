import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Dices, Eraser, Minus, Palette, Plus, Sparkles, Volume2, VolumeX } from 'lucide-react';
import { isValidDice, parseDice, roll } from '@shared/dice.js';
import { DIE_SIDES } from './forge/dice.js';
import { randomSeed } from './forge/physics.js';
import { BACKDROPS, DiceStage, FINISHES, FONTS } from './forge/DiceStage.js';
import { STYLE_PRESETS, loadStyle, natural, physicalDice, saveStyle, withMode } from './forge/pool.js';

const QUICK_DICE = [4, 6, 8, 10, 12, 20, 100];
const ROLL_PRESETS = [
  { label: 'Attack', expr: '1d20+5' },
  { label: 'Ability score', expr: '4d6kh3' },
  { label: 'Fireball', expr: '8d6' },
  { label: 'Sneak Attack', expr: '1d6+3d6' },
  { label: 'Greatsword', expr: '2d6+3' },
  { label: 'Healing potion', expr: '2d4+2' },
  { label: 'Percentile', expr: '1d100' },
];
const cryptoRng = () => crypto.getRandomValues(new Uint32Array(1))[0] / 2 ** 32;

const termText = (t, i) => {
  const sign = t.sign < 0 ? '-' : i ? '+' : '';
  if (t.type === 'flat') return `${sign}${t.value}`;
  return `${sign}${t.count}d${t.sides}${t.keep ? `${t.keep.mode}${t.keep.n}` : ''}`;
};

/** Adds (or with delta −1 removes) one die of `sides`, merging into an existing NdX term. */
function addDie(expr, sides, delta) {
  const terms = parseDice(expr) ?? [];
  let found = false;
  const next = terms.flatMap((t) => {
    if (t.type !== 'dice' || t.sides !== sides || t.keep || t.sign < 0 || found) return [t];
    found = true;
    const count = t.count + delta;
    return count > 0 ? [{ ...t, count }] : [];
  });
  if (!found && delta > 0) {
    const flat = next.findIndex((t) => t.type === 'flat');
    next.splice(flat < 0 ? next.length : flat, 0, { type: 'dice', sign: 1, count: 1, sides });
  }
  return next.map(termText).join('');
}

function setModifier(expr, value) {
  const base = (parseDice(expr) ?? []).filter((t) => t.type !== 'flat').map(termText).join('');
  return value ? `${base}${value > 0 ? '+' : '-'}${Math.abs(value)}` : base;
}

const modifierOf = (expr) => (parseDice(expr) ?? []).filter((t) => t.type === 'flat').reduce((s, t) => s + t.sign * t.value, 0);

function Breakdown({ result }) {
  return (
    <div className="breakdown">
      {result.parts.map((p, i) => (
        <span key={i} className="breakdown__part">
          {i > 0 && <em>{p.sign < 0 ? '−' : '+'}</em>}
          {p.type === 'flat' ? <b>{p.value}</b> : p.rolls.map((r, j) => (
            <span key={j} title={`d${p.sides}`}
              className={`breakdown__die ${p.kept[j] ? '' : 'is-dropped'} ${r === p.sides ? 'is-max' : ''} ${r === 1 ? 'is-min' : ''}`}>
              {r}
            </span>
          ))}
        </span>
      ))}
    </div>
  );
}

export default function DiceForge() {
  const mountRef = useRef(null);
  const stageRef = useRef(null);
  const pendingRef = useRef(null);
  const [opts, setOpts] = useState(loadStyle);
  const [tab, setTab] = useState('roll');
  const [formula, setFormula] = useState('1d20');
  const [mode, setMode] = useState('normal');
  const [rolling, setRolling] = useState(false);
  const [result, setResult] = useState(null);
  const [history, setHistory] = useState([]);
  const set = (patch) => setOpts((o) => ({ ...o, ...patch }));
  const clean = formula.replace(/\s+/g, '');
  const valid = !clean || isValidDice(clean);

  const reveal = useCallback((entry) => {
    setRolling(false);
    setResult(entry);
    setHistory((h) => [entry, ...h].slice(0, 20));
  }, []);

  const doRoll = useCallback(() => {
    const stage = stageRef.current;
    const base = clean || `1d${stage.opts.sides}`;
    if (!isValidDice(base)) return;
    const expr = withMode(base, mode);
    const r = roll(expr, { rng: cryptoRng });
    const { dice, offTable } = physicalDice(r);
    const entry = { id: Math.random(), expr, result: r, natural: natural(r), offTable };
    setResult(null);
    if (!dice.length) return reveal(entry);
    pendingRef.current = entry;
    setRolling(true);
    stage.roll({ dice, seed: randomSeed() });
  }, [clean, mode, reveal]);

  useEffect(() => {
    const stage = new DiceStage(mountRef.current, {
      onSettle: () => {
        if (pendingRef.current) reveal(pendingRef.current);
        pendingRef.current = null;
      },
    });
    stageRef.current = stage;
    return () => stage.dispose();
  }, [reveal]);

  // Tapping the die rolls whatever is in the formula bar.
  useEffect(() => { stageRef.current.onTap = doRoll; }, [doRoll]);

  useEffect(() => {
    stageRef.current.setOptions(opts);
    saveStyle(opts);
  }, [opts]);

  // A new shape clears the last result; the die lifts back into view.
  useEffect(() => { setResult(null); setRolling(false); pendingRef.current = null; }, [opts.sides, opts.rounding]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.code !== 'Space' || e.repeat || e.target.closest('input, select, textarea, button')) return;
      e.preventDefault();
      doRoll();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [doRoll]);

  // Advantage only makes sense with exactly one d20 in the formula.
  const d20Count = (parseDice(clean || `1d${opts.sides}`) ?? []).filter((t) => t.type === 'dice' && t.sides === 20).reduce((n, t) => n + t.count, 0);
  const canAdvantage = d20Count === 1;
  useEffect(() => { if (!canAdvantage) setMode('normal'); }, [canAdvantage]);

  const crit = result?.natural === 20;
  const fumble = result?.natural === 1;
  const modifier = modifierOf(clean);

  return (
    <div className="page forge">
      <div className="page__head">
        <div>
          <span className="kicker">The artificer's bench</span>
          <h1 className="page__title">Dice Forge</h1>
        </div>
        <p className="muted forge__hint">Drag the die to turn it. Click it or press Space to roll.</p>
      </div>

      <div className="forge__layout">
        <div className="forge__stage panel">
          <div ref={mountRef} className="forge__canvas" />
          <AnimatePresence>
            {result && (
              <motion.div key={result.id} className={`forge__result ${crit ? 'is-crit' : fumble ? 'is-fumble' : ''}`}
                initial={{ opacity: 0, y: 16, scale: 0.8 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -10 }}>
                <span>{result.expr}</span>
                <strong>{result.result.total}</strong>
                {crit && <em>Natural 20!</em>}
                {fumble && <em>Natural 1…</em>}
                {result.offTable > 0 && <small>+{result.offTable} more dice rolled off the tray</small>}
              </motion.div>
            )}
          </AnimatePresence>
          {history.length > 0 && (
            <ol className="forge__history" aria-label="Recent rolls">
              {history.map((h) => <li key={h.id} title={h.expr}>{h.result.total}</li>)}
            </ol>
          )}
        </div>

        <aside className="forge__controls panel">
          <div className="tabs forge__tabs" role="tablist">
            <button role="tab" aria-selected={tab === 'roll'} className={tab === 'roll' ? 'is-active' : ''} onClick={() => setTab('roll')}><Dices size={15} /> Roll</button>
            <button role="tab" aria-selected={tab === 'style'} className={tab === 'style' ? 'is-active' : ''} onClick={() => setTab('style')}><Palette size={15} /> Style</button>
          </div>

          {tab === 'roll' ? (
            <>
              <label className={`field ${valid ? '' : 'has-error'}`}>
                <span>Formula</span>
                <input className="forge__formula" value={formula} spellCheck={false} placeholder={`1d${opts.sides}`}
                  onChange={(e) => setFormula(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') doRoll(); }} />
                <small className={valid ? 'muted' : 'forge__error'}>{valid ? 'e.g. 2d6+3, 4d6kh3, 1d20+1d4+5' : 'That isn’t a dice formula.'}</small>
              </label>

              <section>
                <span className="field__label">Add dice <small className="forge__aside">right-click removes</small></span>
                <div className="forge__quick">
                  {QUICK_DICE.map((s) => (
                    <button key={s} className="forge__qdie" onClick={() => setFormula((f) => addDie(f, s, 1))}
                      onContextMenu={(e) => { e.preventDefault(); setFormula((f) => addDie(f, s, -1)); }}>
                      d{s}
                    </button>
                  ))}
                  <button className="forge__qdie forge__qdie--clear" onClick={() => setFormula('')} title="Clear" aria-label="Clear formula"><Eraser size={15} /></button>
                </div>
              </section>

              <section className="forge__row2">
                <div>
                  <span className="field__label">Modifier</span>
                  <div className="stepper">
                    <button onClick={() => setFormula((f) => setModifier(f, modifierOf(f) - 1))} aria-label="Decrease modifier"><Minus size={14} /></button>
                    <span>{modifier >= 0 ? `+${modifier}` : modifier}</span>
                    <button onClick={() => setFormula((f) => setModifier(f, modifierOf(f) + 1))} aria-label="Increase modifier"><Plus size={14} /></button>
                  </div>
                </div>
                <div>
                  <span className="field__label">d20</span>
                  <div className="segmented" title={canAdvantage ? '' : 'Needs exactly one d20 in the formula'}>
                    {[['dis', 'Disadv.'], ['normal', 'Normal'], ['adv', 'Advantage']].map(([k, l]) => (
                      <button key={k} className={mode === k ? 'is-active' : ''} disabled={!canAdvantage && k !== 'normal'} onClick={() => setMode(k)}>{l}</button>
                    ))}
                  </div>
                </div>
              </section>

              <section>
                <span className="field__label">Common rolls</span>
                <div className="chips">
                  {ROLL_PRESETS.map((p) => (
                    <button key={p.label} className="chip forge__preset-roll" onClick={() => { setFormula(p.expr); setMode('normal'); }}>
                      {p.label} <small>{p.expr}</small>
                    </button>
                  ))}
                </div>
              </section>

              {result && (
                <section className="forge__breakdown">
                  <span className="field__label">Last roll · {result.expr} = {result.result.total}</span>
                  <Breakdown result={result.result} />
                </section>
              )}

              <button className="btn btn--gold btn--lg forge__roll" disabled={rolling || !valid} onClick={doRoll}>
                <Dices size={20} /> {rolling ? 'Rolling…' : `Roll ${withMode(clean || `1d${opts.sides}`, mode)}`}
              </button>
            </>
          ) : (
            <>
              <section>
                <span className="field__label">Showcase die</span>
                <div className="tabs forge__dice">
                  {DIE_SIDES.map((s) => (
                    <button key={s} className={opts.sides === s ? 'is-active' : ''} onClick={() => set({ sides: s })}>d{s}</button>
                  ))}
                </div>
              </section>

              <section>
                <span className="field__label">Presets</span>
                <div className="chips">
                  {STYLE_PRESETS.map(({ name, ...preset }) => (
                    <button key={name} className="chip forge__preset" style={{ '--accent': preset.body }} onClick={() => set(preset)}>
                      <i style={{ background: `linear-gradient(135deg, ${preset.body} 55%, ${preset.ink} 56%)` }} />
                      {name}
                    </button>
                  ))}
                </div>
              </section>

              <section>
                <span className="field__label">Finish</span>
                <div className="chips">
                  {Object.entries(FINISHES).map(([key, f]) => (
                    <button key={key} className={`chip ${opts.finish === key ? 'is-active' : ''}`} style={{ '--accent': 'var(--gold)' }}
                      onClick={() => set({ finish: key })}>{f.label}</button>
                  ))}
                </div>
              </section>

              <section className="forge__colours">
                <label className="field"><span>Body</span><input type="color" value={opts.body} onChange={(e) => set({ body: e.target.value })} /></label>
                {opts.finish === 'marbled' && (
                  <label className="field"><span>Swirl</span><input type="color" value={opts.swirl} onChange={(e) => set({ swirl: e.target.value })} /></label>
                )}
                <label className="field"><span>Numerals</span><input type="color" value={opts.ink} onChange={(e) => set({ ink: e.target.value })} /></label>
              </section>

              <label className="field">
                <span>Edges</span>
                <input type="range" className="forge__range" min="0" max="1" step="0.01" value={opts.rounding}
                  onChange={(e) => set({ rounding: Number(e.target.value) })} />
                <div className="forge__range-labels"><small>Crisp</small><small>Tumbled</small></div>
              </label>

              <label className="field">
                <span>Numeral style</span>
                <select value={opts.font} onChange={(e) => set({ font: e.target.value })}>
                  {Object.entries(FONTS).map(([key, f]) => <option key={key} value={key}>{f.label}</option>)}
                </select>
              </label>

              <label className="field">
                <span className="forge__glow-label"><Sparkles size={12} /> Numeral glow</span>
                <input type="range" className="forge__range" min="0" max="1" step="0.01" value={opts.glow}
                  onChange={(e) => set({ glow: Number(e.target.value) })} />
                <div className="forge__range-labels"><small>Off</small><small>Blazing</small></div>
              </label>

              <section>
                <span className="field__label">Backdrop</span>
                <div className="chips">
                  {Object.entries(BACKDROPS).map(([key, b]) => (
                    <button key={key} style={{ '--accent': 'var(--gold)' }}
                      className={`chip forge__preset ${opts.felt === b.felt && opts.room === b.room ? 'is-active' : ''}`}
                      onClick={() => set({ felt: b.felt, room: b.room })}>
                      <i style={{ background: `linear-gradient(135deg, ${b.felt} 55%, ${b.room} 56%)` }} />
                      {b.label}
                    </button>
                  ))}
                </div>
                <div className="forge__colours forge__colours--two">
                  <label className="field"><span>Tray</span><input type="color" value={opts.felt} onChange={(e) => set({ felt: e.target.value })} /></label>
                  <label className="field"><span>Room</span><input type="color" value={opts.room} onChange={(e) => set({ room: e.target.value })} /></label>
                </div>
              </section>

              <button className="btn btn--ghost" onClick={() => set({ sound: !opts.sound })}>
                {opts.sound ? <Volume2 size={16} /> : <VolumeX size={16} />} Dice sounds {opts.sound ? 'on' : 'off'}
              </button>
              <p className="muted small">Your style travels with you: other players see these dice when you roll at a table.</p>
            </>
          )}
        </aside>
      </div>
    </div>
  );
}
