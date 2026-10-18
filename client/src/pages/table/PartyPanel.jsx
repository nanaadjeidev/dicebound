import { Crown } from 'lucide-react';

export default function PartyPanel({ room, me }) {
  return (
    <div className="party">
      <ul className="party__list">
        {room.players.map((p) => {
          const owned = room.combatants.filter((c) => c.ownerId === p.id);
          return (
            <li key={p.id} className={p.online ? '' : 'is-away'}>
              <span className="party__avatar" style={{ background: p.color }}>{p.name[0]}</span>
              <div>
                <strong>{p.name}{p.id === me && ' (you)'}</strong>
                <span>{p.id === room.hostId ? 'Dungeon Master' : 'Adventurer'} · {p.online ? 'online' : 'away'}</span>
                {owned.length > 0 && <small>Controls {owned.map((c) => c.name).join(', ')}</small>}
              </div>
              {p.id === room.hostId && <Crown size={16} className="party__crown" />}
            </li>
          );
        })}
      </ul>
      <p className="muted small">The Dungeon Master can act for any combatant, adjust hit points and run the turn order.</p>
    </div>
  );
}
