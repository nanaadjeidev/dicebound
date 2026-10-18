import { useMemo } from 'react';
import { AnimatePresence } from 'framer-motion';
import Token from './Token.jsx';
import GameIcon from '../../components/GameIcon.jsx';

const EMBERS = Array.from({ length: 26 }, (_, i) => ({
  left: `${(i * 37) % 100}%`, delay: `${(i * 0.73) % 9}s`, duration: `${7 + ((i * 1.7) % 6)}s`, size: 2 + (i % 3),
}));

function Side({ list, side, label, ...rest }) {
  const density = list.length > 8 ? 'dense' : list.length > 4 ? 'cosy' : 'roomy';
  return (
    <section className={`arena__side arena__side--${side} arena__side--${density}`} aria-label={label}>
      <h3 className="arena__label">{label} <span>{list.filter((c) => c.status !== 'dead').length}/{list.length}</span></h3>
      <div className="arena__tokens">
        <AnimatePresence mode="popLayout">
          {list.map((c) => (
            <Token key={c.id} c={c}
              isTurn={rest.turnId === c.id}
              isTarget={rest.targetId === c.id}
              armed={!!rest.armed}
              mine={c.ownerId === rest.guestId}
              ownerColor={rest.playerColors[c.ownerId]}
              impact={rest.impacts[c.id]}
              floaters={rest.floaters.filter((f) => f.targetId === c.id)}
              onSelect={rest.onSelect}
              onInspect={rest.onInspect} />
          ))}
        </AnimatePresence>
        {list.length === 0 && (
          <div className="arena__empty">
            <GameIcon name={side === 'party' ? 'visored-helm' : 'dragon-head'} size={40} />
            <span>{side === 'party' ? 'No heroes yet. Summon one from the side panel.' : 'No foes yet. Summon a monster from the bestiary.'}</span>
          </div>
        )}
      </div>
    </section>
  );
}

export default function Arena({ room, ...rest }) {
  const party = useMemo(() => room.combatants.filter((c) => c.side === 'party'), [room.combatants]);
  const foes = useMemo(() => room.combatants.filter((c) => c.side === 'foes'), [room.combatants]);
  const playerColors = useMemo(() => Object.fromEntries(room.players.map((p) => [p.id, p.color])), [room.players]);
  return (
    <div className={`arena realm-bg--${room.realm} ${room.phase === 'combat' ? 'is-fighting' : ''}`}>
      <div className="arena__sky" aria-hidden="true" />
      <div className="arena__fog" aria-hidden="true" />
      <div className="arena__embers" aria-hidden="true">
        {EMBERS.map((e, i) => (
          <span key={i} style={{ left: e.left, animationDelay: e.delay, animationDuration: e.duration, width: e.size, height: e.size }} />
        ))}
      </div>
      <div className="arena__floor" aria-hidden="true">
        <svg viewBox="0 0 200 200" className="arena__rune">
          <circle cx="100" cy="100" r="96" />
          <circle cx="100" cy="100" r="80" strokeDasharray="2 6" />
          <polygon points="100,22 168,139 32,139" />
          <polygon points="100,178 32,61 168,61" />
          <circle cx="100" cy="100" r="40" />
        </svg>
      </div>
      <div className="arena__field">
        <Side list={party} side="party" label="The Party" playerColors={playerColors} {...rest} />
        <div className="arena__versus" aria-hidden="true"><span>VS</span></div>
        <Side list={foes} side="foes" label="The Foes" playerColors={playerColors} {...rest} />
      </div>
    </div>
  );
}
