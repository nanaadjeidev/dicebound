import { createContext, useCallback, useContext, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { roll as rollDice } from '@shared/dice.js';
import GameIcon from './GameIcon.jsx';

const DiceContext = createContext(null);
export const useDice = () => useContext(DiceContext);

/** Local, private rolls (character sheet checks and the like). Table rolls go through the server. */
export function DiceProvider({ children }) {
  const [current, setCurrent] = useState(null);
  const roll = useCallback((label, expr) => {
    const result = rollDice(expr);
    const first = result.parts.find((p) => p.type === 'dice');
    const natural = first?.sides === 20 ? first.rolls[0] : null;
    const id = Math.random();
    setCurrent({ id, label, result, natural });
    setTimeout(() => setCurrent((c) => (c?.id === id ? null : c)), 3800);
    return result;
  }, []);
  return (
    <DiceContext.Provider value={{ roll }}>
      {children}
      <AnimatePresence>
        {current && (
          <motion.button key={current.id} className={`dice-toast ${current.natural === 20 ? 'is-crit' : current.natural === 1 ? 'is-fumble' : ''}`}
            onClick={() => setCurrent(null)}
            initial={{ opacity: 0, y: 40, rotate: -8 }} animate={{ opacity: 1, y: 0, rotate: 0 }} exit={{ opacity: 0, y: 20 }}>
            <motion.div className="dice-toast__die" initial={{ rotate: -540, scale: 0.4 }} animate={{ rotate: 0, scale: 1 }} transition={{ type: 'spring', damping: 12, stiffness: 120 }}>
              <GameIcon name="d20" size={46} />
              <span>{current.result.total}</span>
            </motion.div>
            <div className="dice-toast__text">
              <strong>{current.label}</strong>
              <span>{describe(current.result)}</span>
              {current.natural === 20 && <em>Natural 20!</em>}
              {current.natural === 1 && <em>Natural 1…</em>}
            </div>
          </motion.button>
        )}
      </AnimatePresence>
    </DiceContext.Provider>
  );
}

export function describe(result) {
  return result.parts.map((p, i) => {
    const sign = p.sign < 0 ? ' − ' : i ? ' + ' : '';
    if (p.type === 'flat') return `${sign}${p.value}`;
    return `${sign}[${p.rolls.map((r, j) => (p.kept[j] ? r : `~${r}~`)).join(', ')}]`;
  }).join('') + ` = ${result.total}`;
}
