import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { BookOpenText, ChevronDown, Eye, EyeOff, Map as MapIcon, Skull, Swords, X } from 'lucide-react';
import { api } from '../../api.js';
import { decodeRevealed } from '../../components/DungeonMap.jsx';

const DIFF = { trivial: 'Trivial', easy: 'Easy', medium: 'Medium', hard: 'Hard', deadly: 'Deadly' };

/** The Dungeon Master's screen at the table: narration, the map and its room key. */
export default function DmPanel({ room, dungeon, onSend }) {
  const [library, setLibrary] = useState(null);
  const [choice, setChoice] = useState('');
  const [open, setOpen] = useState(null);
  const [title, setTitle] = useState('');
  const [text, setText] = useState('');
  const map = room.map;

  useEffect(() => {
    api('/dungeons').then((list) => { setLibrary(list); setChoice((c) => c || list[0]?.id || ''); }).catch(() => setLibrary([]));
  }, []);

  const revealed = useMemo(() => map && decodeRevealed(map.revealed, map.width * map.height), [map]);
  const isRevealed = (r) => revealed?.[(r.y + (r.h >> 1)) * map.width + r.x + (r.w >> 1)];

  const narrate = (e) => {
    e.preventDefault();
    if (!text.trim()) return;
    onSend('room:narrate', { title, text }).then((res) => { if (res) { setText(''); setTitle(''); } });
  };

  return (
    <div className="dm-panel">
      <form className="dm-panel__narrate" onSubmit={narrate}>
        <span className="field__label"><BookOpenText size={13} /> Read aloud</span>
        <input value={title} maxLength={80} placeholder="Heading (optional)" onChange={(e) => setTitle(e.target.value)} />
        <textarea className="boxed-text" rows={3} value={text} maxLength={2000} placeholder="Describe the scene. Everyone sees it as a scroll." onChange={(e) => setText(e.target.value)} />
        <button className="btn btn--small btn--gold" disabled={!text.trim()}>Read to the table</button>
      </form>

      {!map ? (
        <div className="dm-panel__load">
          <span className="field__label"><MapIcon size={13} /> Battle map</span>
          {library?.length ? (
            <div className="input-with-btn">
              <select value={choice} onChange={(e) => setChoice(e.target.value)} aria-label="Dungeon to load">
                {library.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
              <button className="btn btn--small btn--gold" onClick={() => onSend('map:load', { dungeonId: choice })}>Load</button>
            </div>
          ) : (
            <p className="muted small">{library ? <>No dungeons yet. <Link to="/dm">Forge one in the Sanctum</Link>, then load it here.</> : 'Opening your library…'}</p>
          )}
          <p className="muted small">Players see only what you reveal. Heroes start at the entrance stairs.</p>
        </div>
      ) : (
        <div className="dm-panel__map">
          <div className="dm-panel__maphead">
            <strong>{map.name}</strong>
            <button className="link-btn" onClick={() => window.confirm('Take the map off the table?') && onSend('map:clear')}><X size={12} /> Unload</button>
          </div>
          {!dungeon && <p className="muted small">This map isn’t in your library, so its room key is hidden.</p>}
          <ol className="dm-rooms">
            {(dungeon?.rooms ?? []).map((r) => (
              <li key={r.id} className={`${open === r.id ? 'is-open' : ''} ${isRevealed(r) ? 'is-revealed' : ''}`}>
                <button className="dm-rooms__head" onClick={() => setOpen(open === r.id ? null : r.id)} aria-expanded={open === r.id}>
                  <span className="room-key__n">{r.n}</span>
                  <span className="dm-rooms__name">{r.kind}</span>
                  {r.encounter && <span className={`diff diff--${r.encounter.difficulty}`}>{DIFF[r.encounter.difficulty] ?? r.encounter.difficulty}</span>}
                  {r.trap && <span className="room-list__flag" title="Trap">⚠</span>}
                  <ChevronDown size={14} className="ledger__chev" />
                </button>
                {open === r.id && (
                  <div className="dm-rooms__body">
                    <p className="dm-rooms__boxed">{r.readAloud}</p>
                    <div className="row">
                      <button className="btn btn--small" onClick={() => onSend('room:narrate', { title: `${r.n}. ${r.kind}`, text: r.readAloud })}><BookOpenText size={13} /> Read aloud</button>
                      {isRevealed(r)
                        ? <button className="btn btn--small btn--ghost" onClick={() => onSend('map:revealRoom', { roomId: r.id, hide: true })}><EyeOff size={13} /> Hide</button>
                        : <button className="btn btn--small" onClick={() => onSend('map:revealRoom', { roomId: r.id })}><Eye size={13} /> Reveal</button>}
                    </div>
                    {r.encounter && (
                      <div className="dm-rooms__enc">
                        <span><Swords size={13} /> {r.encounter.monsters.map((m) => `${m.count} × ${m.name}`).join(', ')}</span>
                        {r.encounter.tactics && <em><Skull size={12} /> {r.encounter.tactics}</em>}
                        <button className="btn btn--small btn--danger" onClick={() => onSend('map:spawn', { roomId: r.id })}>Spawn encounter</button>
                      </div>
                    )}
                    {r.trap && <p className="dm-rooms__note"><b>Trap: {r.trap.name}.</b> {r.trap.trigger}; DC {r.trap.detect} to spot; DC {r.trap.dc} {r.trap.save}{r.trap.damage ? `, ${r.trap.damage}` : ''} {r.trap.effect}.</p>}
                    {r.treasure.length > 0 && <p className="dm-rooms__note"><b>Treasure:</b> {r.treasure.join('; ')}.</p>}
                    {r.notes && <p className="dm-rooms__note"><b>Notes:</b> {r.notes}</p>}
                  </div>
                )}
              </li>
            ))}
          </ol>
          {dungeon?.wandering?.length > 0 && (
            <details className="dm-panel__wander">
              <summary>Wandering monsters (d6)</summary>
              <ol>{dungeon.wandering.map((w) => <li key={w.roll}>{w.text}</li>)}</ol>
            </details>
          )}
        </div>
      )}
    </div>
  );
}
