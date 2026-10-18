import { motion } from 'framer-motion';
import Portrait from '../../components/Portrait.jsx';

export default function InitiativeRibbon({ room, onSelect }) {
  if (room.phase !== 'combat') return null;
  const order = room.combatants.filter((c) => c.status !== 'dead');
  const turnIdx = Math.max(0, order.findIndex((c) => c.id === room.turnId));
  const rotated = [...order.slice(turnIdx), ...order.slice(0, turnIdx)];
  return (
    <div className="ribbon" aria-label="Initiative order">
      <span className="ribbon__round">Round <strong>{room.round}</strong></span>
      <ol className="ribbon__list">
        {rotated.map((c, i) => (
          <motion.li key={c.id} layout transition={{ type: 'spring', damping: 24, stiffness: 260 }}
            className={`ribbon__item ribbon__item--${c.side} ${i === 0 ? 'is-current' : ''} ${c.status !== 'ok' ? 'is-down' : ''}`}>
            <button onClick={() => onSelect(c)} title={`${c.name} · initiative ${c.initiative}`}>
              <Portrait src={c.image} icon={c.icon} color={c.color} alt="" />
              <span className="ribbon__init">{c.initiative}</span>
              {i === 0 && <span className="ribbon__name">{c.name}</span>}
            </button>
          </motion.li>
        ))}
      </ol>
    </div>
  );
}
