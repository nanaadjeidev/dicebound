import { AnimatePresence, motion } from 'framer-motion';
import GameIcon from '../../components/GameIcon.jsx';

function Die({ value, tone }) {
  return (
    <motion.div className={`big-die big-die--${tone}`}
      initial={{ rotate: -720, scale: 0.2, y: -40 }} animate={{ rotate: 0, scale: 1, y: 0 }}
      transition={{ type: 'spring', damping: 11, stiffness: 110 }}>
      <GameIcon name="d20" size={110} />
      <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.4 }}>{value}</motion.span>
    </motion.div>
  );
}

export default function FxOverlay({ fx, room }) {
  const name = (id) => room?.combatants.find((c) => c.id === id)?.name ?? '???';
  return (
    <AnimatePresence>
      {fx && (
        <motion.div key={fx.key} className={`fx-overlay fx-overlay--${fx.type}`}
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, transition: { duration: 0.2 } }}>
          {(fx.type === 'attack' || fx.type === 'save' || fx.type === 'auto') && <ActionFx fx={fx} name={name} />}
          {fx.type === 'initiative' && (
            <div className="fx-initiative">
              <motion.h2 initial={{ scale: 1.6, opacity: 0, letterSpacing: '0.6em' }} animate={{ scale: 1, opacity: 1, letterSpacing: '0.18em' }}>
                Roll for Initiative
              </motion.h2>
              <ol>
                {[...fx.rolls].sort((a, b) => b.total - a.total).map((r, i) => (
                  <motion.li key={r.id} initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.3 + i * 0.08 }}>
                    <span>{r.name}</span><strong>{r.total}</strong>
                  </motion.li>
                ))}
              </ol>
            </div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function ActionFx({ fx, name }) {
  let verdict;
  let tone;
  if (fx.type === 'attack') {
    verdict = fx.crit ? 'Critical hit!' : fx.natural === 1 ? 'Fumble!' : fx.hit ? 'Hit!' : 'Miss';
    tone = fx.crit ? 'crit' : fx.hit ? 'hit' : 'miss';
  } else if (fx.type === 'save') {
    verdict = fx.saved ? `${name(fx.targetId)} resists!` : 'Save failed!';
    tone = fx.saved ? 'miss' : 'hit';
  } else {
    verdict = 'Never misses';
    tone = 'hit';
  }
  return (
    <div className="fx-action">
      <p className="fx-action__who">
        <strong>{name(fx.actorId)}</strong> · {fx.action} → <strong>{name(fx.targetId)}</strong>
      </p>
      {fx.type !== 'auto' && <Die value={fx.natural} tone={tone} />}
      {fx.type === 'auto' && (
        <motion.div className="fx-missiles" initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}>
          <GameIcon name="wizard-staff" size={90} />
        </motion.div>
      )}
      <motion.div className="fx-action__math" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.45 }}>
        {fx.type === 'attack' && <>{fx.total} vs AC {fx.ac}{fx.mode !== 'normal' && <em> ({fx.mode === 'adv' ? 'advantage' : 'disadvantage'}: {fx.d20.join(' / ')})</em>}</>}
        {fx.type === 'save' && <>{fx.save?.toUpperCase()} save {fx.total} vs DC {fx.dc}</>}
      </motion.div>
      <motion.div className={`fx-verdict fx-verdict--${tone}`}
        initial={{ opacity: 0, scale: 2.2 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.6, type: 'spring', damping: 12 }}>
        {verdict}
        {fx.amount > 0 && <span>{fx.amount} damage</span>}
      </motion.div>
    </div>
  );
}
