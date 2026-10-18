import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { describe } from '../../components/DiceTray.jsx';
import { DEFAULT_STYLE, loadStyle, natural, physicalDice } from '../forge/pool.js';

/**
 * Plays shared table rolls as real 3D dice over the battlefield, one throw at a time, in the
 * roller's own dice style. Values come from the server; everyone sees the same tumble.
 */
export default function DiceOverlay({ rolls, onDone }) {
  const mountRef = useRef(null);
  const stageRef = useRef(null);
  const [ready, setReady] = useState(false);
  const [current, setCurrent] = useState(null);
  const [settled, setSettled] = useState(false);
  const next = rolls[0] ?? null;

  // three.js only loads the first time someone rolls.
  useEffect(() => {
    if (!next || stageRef.current) return undefined;
    let cancelled = false;
    import('../forge/DiceStage.js').then(({ DiceStage }) => {
      if (cancelled || !mountRef.current) return;
      stageRef.current = new DiceStage(mountRef.current, { overlay: true });
      setReady(true);
    });
    return () => { cancelled = true; };
  }, [next]);

  useEffect(() => () => stageRef.current?.dispose(), []);

  useEffect(() => {
    const stage = stageRef.current;
    if (!next || !ready || current?.key === next.key) return undefined;
    const { dice } = physicalDice({ parts: next.parts });
    setCurrent(next);
    setSettled(!dice.length);
    if (!dice.length) {
      const t = setTimeout(() => onDone(next.key), 2600);
      return () => clearTimeout(t);
    }
    stage.setOptions({ ...DEFAULT_STYLE, ...next.style, sound: loadStyle().sound });
    stage.snapLook();
    stage.onSettle = () => setSettled(true);
    stage.onDone = () => onDone(next.key);
    stage.roll({ dice, seed: next.seed });
    return undefined;
  }, [next, ready, current, onDone]);

  const nat = current ? natural({ parts: current.parts }) : null;
  return (
    <div className={`dice-overlay ${next ? 'is-active' : ''}`} aria-live="polite">
      <div ref={mountRef} className="dice-overlay__canvas" />
      <AnimatePresence>
        {current && settled && rolls[0]?.key === current.key && (
          <motion.div key={current.key} className={`dice-overlay__caption ${nat === 20 ? 'is-crit' : nat === 1 ? 'is-fumble' : ''}`}
            initial={{ opacity: 0, y: 14, scale: 0.9 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -8 }}>
            <span style={{ color: current.color }}>{current.author}</span>
            <small>{current.label || current.expr}</small>
            <strong>{current.total}</strong>
            <em>{describe({ parts: current.parts, total: current.total })}</em>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
