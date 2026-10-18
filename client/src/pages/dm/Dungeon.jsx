import { useCallback, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import {
  BrickWall, ChevronLeft, DoorClosed, Download, Eraser, MousePointer2, Play, Plus, Printer, RefreshCw, Skull, Square, Trash2, Wand2,
} from 'lucide-react';
import { THEMES } from '@shared/dungeon.js';
import { rateEncounter } from '@shared/encounters.js';
import { useGuest } from '../../guest.jsx';
import { emit } from '../../api.js';
import { useBestiary } from '../../useBestiary.js';
import { useToast } from '../../components/Toasts.jsx';
import Modal from '../../components/Modal.jsx';
import DungeonMap, { MAP_STYLES } from '../../components/DungeonMap.jsx';
import GeneratorForm from './GeneratorForm.jsx';
import { useDoc } from './useDoc.js';

const TOOLS = [
  { key: 'select', label: 'Select room', icon: MousePointer2 },
  { key: 'floor', label: 'Paint floor', icon: Square },
  { key: 'rock', label: 'Paint wall', icon: BrickWall },
  { key: 'door', label: 'Door (click to cycle)', icon: DoorClosed },
  { key: 'feature', label: 'Furniture', icon: Wand2 },
  { key: 'erase', label: 'Remove furniture', icon: Eraser },
];
const DOOR_CYCLE = ['door', 'locked', 'secret', 'portcullis', 'arch', null];
const FEATURES = ['pillar', 'statue', 'altar', 'coffin', 'table', 'chest', 'trap', 'stairs-up', 'stairs-down', 'rubble', 'brazier', 'pool',
  'throne', 'bed', 'crate', 'cage', 'shelf', 'rack', 'fungus', 'crystal', 'tree', 'lava', 'chasm', 'anvil', 'wheel', 'hoard'];
const REALM_FOR_THEME = { crypt: 'crypt', cavern: 'dungeon', stronghold: 'dungeon', sewer: 'dungeon', temple: 'crypt', lair: 'volcano', fey: 'forest' };
const DIFFICULTY_LABEL = { none: '—', trivial: 'Trivial', easy: 'Easy', medium: 'Medium', hard: 'Hard', deadly: 'Deadly' };

export function DifficultyBadge({ rating }) {
  return <span className={`diff diff--${rating.difficulty}`}>{DIFFICULTY_LABEL[rating.difficulty]} · {rating.adjusted.toLocaleString()} XP</span>;
}

function EncounterEditor({ encounter, party, onChange, monsters }) {
  const [query, setQuery] = useState('');
  const list = encounter?.monsters ?? [];
  const rating = rateEncounter(list.map((m) => ({ xp: m.xp, count: m.count })), party);
  const set = (next) => onChange(next.length ? { ...(encounter ?? {}), monsters: next, xp: rating.base } : null);
  const add = () => {
    const m = monsters?.find((x) => x.name.toLowerCase() === query.trim().toLowerCase());
    if (!m) return;
    const existing = list.find((x) => x.id === m.id);
    set(existing ? list.map((x) => (x === existing ? { ...x, count: x.count + 1 } : x)) : [...list, { id: m.id, name: m.name, cr: m.cr, xp: m.xp, count: 1 }]);
    setQuery('');
  };
  return (
    <div className="enc">
      <div className="enc__head">
        <span className="field__label">Encounter</span>
        {list.length > 0 && <DifficultyBadge rating={rating} />}
      </div>
      {list.map((m) => (
        <div key={m.id} className="enc__row">
          <input type="number" min="1" max="30" value={m.count} className="mini-input" aria-label={`${m.name} count`}
            onChange={(e) => set(list.map((x) => (x.id === m.id ? { ...x, count: Math.max(1, Number(e.target.value) || 1) } : x)))} />
          <span className="enc__name">{m.name}</span>
          <small className="muted">CR {m.cr} · {m.xp} XP</small>
          <button className="icon-btn icon-btn--small" onClick={() => set(list.filter((x) => x.id !== m.id))} aria-label={`Remove ${m.name}`}><Trash2 size={13} /></button>
        </div>
      ))}
      <div className="input-with-btn">
        <input list="bestiary-names" value={query} placeholder="Add a monster…" onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } }} />
        <button className="btn btn--small" onClick={add}><Plus size={14} /></button>
      </div>
      {encounter?.tactics && <p className="enc__tactics"><Skull size={13} /> {encounter.tactics}</p>}
    </div>
  );
}

export default function Dungeon() {
  const { id } = useParams();
  const { socket } = useGuest();
  const toast = useToast();
  const navigate = useNavigate();
  const monsters = useBestiary();
  const { doc, update, status, error, flush } = useDoc('dungeons', id);
  const [tool, setTool] = useState('select');
  const [featureType, setFeatureType] = useState('pillar');
  const [selectedId, setSelectedId] = useState(null);
  const [mapStyle, setMapStyle] = useState('parchment');
  const [regen, setRegen] = useState(false);
  const mapRef = useRef(null);

  const party = useMemo(() => ({ level: doc?.level ?? 1, size: doc?.party ?? 4 }), [doc?.level, doc?.party]);
  const selected = doc?.rooms.find((r) => r.id === selectedId) ?? null;
  const updateRoom = (roomId, patch) => update((d) => ({ ...d, rooms: d.rooms.map((r) => (r.id === roomId ? { ...r, ...patch } : r)) }));

  const roomAtCell = useCallback((x, y) => doc?.rooms.find((r) => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h) ?? null, [doc?.rooms]);

  const paint = useCallback((x, y) => {
    update((d) => {
      if (x < 0 || y < 0 || x >= d.width || y >= d.height) return d;
      const i = y * d.width + x;
      const inRoom = d.rooms.some((r) => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h);
      const ch = tool === 'rock' ? '#' : inRoom ? '.' : ',';
      if (d.cells[i] === ch) return d;
      const cells = d.cells.slice(0, i) + ch + d.cells.slice(i + 1);
      // Walls swallow whatever stood there.
      const clear = tool === 'rock' ? (o) => o.x !== x || o.y !== y : () => true;
      return { ...d, cells, doors: d.doors.filter(clear), features: d.features.filter(clear) };
    });
  }, [tool, update]);

  const onCellClick = useCallback((x, y) => {
    if (!doc || x < 0 || y < 0 || x >= doc.width || y >= doc.height) return;
    const open = (cx, cy) => doc.cells[cy * doc.width + cx] !== '#';
    if (tool === 'select') return setSelectedId(roomAtCell(x, y)?.id ?? null);
    if (!open(x, y)) return toast('Paint some floor there first.');
    if (tool === 'door') {
      update((d) => {
        const existing = d.doors.find((o) => o.x === x && o.y === y);
        const next = DOOR_CYCLE[(DOOR_CYCLE.indexOf(existing?.kind ?? null) + 1) % DOOR_CYCLE.length];
        const others = d.doors.filter((o) => o !== existing);
        const dir = !open(x, y - 1) && !open(x, y + 1) ? 'v' : 'h';
        return { ...d, doors: next ? [...others, { x, y, dir, kind: next }] : others };
      });
    } else if (tool === 'feature' || tool === 'erase') {
      update((d) => {
        const others = d.features.filter((f) => f.x !== x || f.y !== y);
        if (tool === 'erase') return { ...d, features: others };
        return { ...d, features: [...others, { x, y, type: featureType, ...(featureType === 'trap' ? { hidden: true } : {}) }] };
      });
    }
  }, [doc, tool, featureType, roomAtCell, update, toast]);

  const regenerate = (fresh) => {
    update((d) => ({ ...d, ...fresh, notes: d.notes }));
    setSelectedId(null);
    setRegen(false);
    toast('A new dungeon rises from the dark.', 'success');
  };

  const exportPng = () => {
    const svg = mapRef.current?.querySelector('svg');
    if (!svg) return;
    const scale = 32;
    const clone = svg.cloneNode(true);
    clone.setAttribute('width', doc.width * scale);
    clone.setAttribute('height', doc.height * scale);
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    clone.querySelector('g').setAttribute('transform', `scale(${scale})`);
    clone.querySelectorAll('.dmap__fog').forEach((n) => n.remove());
    const bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    Object.entries({ width: '100%', height: '100%', fill: MAP_STYLES[mapStyle].bg }).forEach(([k, v]) => bg.setAttribute(k, v));
    clone.insertBefore(bg, clone.firstChild.nextSibling);
    const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(clone)], { type: 'image/svg+xml' }));
    const img = new Image();
    img.onload = () => {
      const canvas = Object.assign(document.createElement('canvas'), { width: doc.width * scale, height: doc.height * scale });
      canvas.getContext('2d').drawImage(img, 0, 0);
      URL.revokeObjectURL(url);
      canvas.toBlob((blob) => {
        const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: `${doc.name.replace(/[^\w]+/g, '-').toLowerCase()}.png` });
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 2000);
      });
    };
    img.src = url;
  };

  const runAtTable = async () => {
    try {
      await flush();
      const res = await emit(socket, 'room:create', { name: doc.name.slice(0, 40), realm: REALM_FOR_THEME[doc.theme] ?? 'dungeon' });
      await emit(socket, 'map:load', { dungeonId: doc.id });
      navigate(`/table/${res.code}`);
    } catch (e) {
      toast(e.message, 'error');
    }
  };

  if (error && !doc) return <div className="page"><h1 className="page__title">Lost in the dark</h1><p className="muted">{error}</p><Link to="/dm" className="btn">Back to the Sanctum</Link></div>;
  if (!doc) return <div className="page"><div className="is-loading" /></div>;

  return (
    <div className="dungeon-editor">
      <header className="dungeon-editor__bar">
        <Link to="/dm" className="icon-btn" aria-label="Back to the Sanctum"><ChevronLeft size={18} /></Link>
        <div className="dungeon-editor__title">
          <input className="title-input" value={doc.name} maxLength={100} onChange={(e) => update({ name: e.target.value })} aria-label="Dungeon name" />
          <span>{THEMES[doc.theme]?.label} · {doc.rooms.length} rooms · party of {doc.party} at level {doc.level} · seed <code>{doc.seed}</code> · <em className={`save-state save-state--${status}`}>{status === 'saved' ? 'Saved' : status === 'error' ? 'Not saved' : 'Saving…'}</em></span>
        </div>
        <div className="dungeon-editor__actions">
          <select value={mapStyle} onChange={(e) => setMapStyle(e.target.value)} className="select--small" aria-label="Map style">
            {Object.entries(MAP_STYLES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
          <button className="btn btn--small btn--ghost" onClick={() => setRegen(true)}><RefreshCw size={14} /> Regenerate</button>
          <button className="btn btn--small btn--ghost" onClick={exportPng}><Download size={14} /> PNG</button>
          <button className="btn btn--small btn--ghost" onClick={() => window.print()}><Printer size={14} /> Print key</button>
          <button className="btn btn--small btn--gold" onClick={runAtTable} disabled={!socket}><Play size={14} /> Run at the table</button>
        </div>
      </header>

      <div className="dungeon-editor__body">
        <div className="dungeon-editor__tools" role="toolbar" aria-label="Map tools">
          {TOOLS.map(({ key, label, icon: Icon }) => (
            <button key={key} className={`tool ${tool === key ? 'is-active' : ''}`} onClick={() => setTool(key)} title={label} aria-label={label} aria-pressed={tool === key}>
              <Icon size={18} />
            </button>
          ))}
          {tool === 'feature' && (
            <select className="tool__select" value={featureType} onChange={(e) => setFeatureType(e.target.value)} aria-label="Furniture type">
              {FEATURES.map((f) => <option key={f} value={f}>{f.replace('-', ' ')}</option>)}
            </select>
          )}
        </div>

        <div className="dungeon-editor__map" ref={mapRef}>
          <DungeonMap map={doc} mapStyle={mapStyle} view="dm" selectedRoom={selected} painting={tool === 'floor' || tool === 'rock'}
            onPaint={paint} onCellClick={onCellClick} />
          <p className="dungeon-editor__hint">Scroll to zoom · drag to pan{tool === 'floor' || tool === 'rock' ? ' · Alt+drag pans while painting' : ''}</p>
        </div>

        <aside className="dungeon-editor__key">
          {selected ? (
            <div className="room-key">
              <div className="room-key__head">
                <span className="room-key__n">{selected.n}</span>
                <input className="title-input title-input--small" value={selected.kind} onChange={(e) => updateRoom(selected.id, { kind: e.target.value })} aria-label="Room name" />
                <button className="link-btn" onClick={() => setSelectedId(null)}>All rooms</button>
              </div>
              <label className="field">
                <span>Read aloud</span>
                <textarea className="boxed-text" rows={5} value={selected.readAloud} onChange={(e) => updateRoom(selected.id, { readAloud: e.target.value })} />
              </label>
              <EncounterEditor encounter={selected.encounter} party={party} monsters={monsters}
                onChange={(encounter) => updateRoom(selected.id, { encounter })} />
              <label className="field">
                <span>Treasure <small className="muted">(one per line)</small></span>
                <textarea rows={3} value={selected.treasure.join('\n')} onChange={(e) => updateRoom(selected.id, { treasure: e.target.value.split('\n') })}
                  onBlur={(e) => updateRoom(selected.id, { treasure: e.target.value.split('\n').map((t) => t.trim()).filter(Boolean) })} />
              </label>
              {selected.trap && (
                <div className="trap-card">
                  <div className="trap-card__head"><strong>{selected.trap.name}</strong><span className={`diff diff--${selected.trap.severity === 'dangerous' ? 'hard' : 'easy'}`}>{selected.trap.severity}</span>
                    <button className="icon-btn icon-btn--small" onClick={() => updateRoom(selected.id, { trap: null })} aria-label="Remove trap"><Trash2 size={13} /></button></div>
                  <p>Triggered by {selected.trap.trigger}. Spot it with a DC {selected.trap.detect} Wisdom (Perception) check.
                    DC {selected.trap.dc} {selected.trap.save} save{selected.trap.damage ? `, ${selected.trap.damage} ` : ' '}{selected.trap.effect}.</p>
                </div>
              )}
              <label className="field">
                <span>DM notes</span>
                <textarea rows={3} value={selected.notes} placeholder="Secrets, clues, what happens if…" onChange={(e) => updateRoom(selected.id, { notes: e.target.value })} />
              </label>
            </div>
          ) : (
            <div className="room-key">
              <h2 className="section-title section-title--small">Room key</h2>
              <ol className="room-list">
                {doc.rooms.map((r) => (
                  <li key={r.id}>
                    <button onClick={() => { setSelectedId(r.id); setTool('select'); }}>
                      <span className="room-key__n">{r.n}</span>
                      <span className="room-list__name">{r.kind}</span>
                      {r.encounter && <span className={`diff diff--${r.encounter.difficulty}`}>{DIFFICULTY_LABEL[r.encounter.difficulty] ?? r.encounter.difficulty}</span>}
                      {r.trap && <span className="room-list__flag" title="Trap">⚠</span>}
                      {r.treasure.length > 0 && <span className="room-list__flag" title="Treasure">◆</span>}
                    </button>
                  </li>
                ))}
              </ol>
              {doc.hooks.length > 0 && (
                <>
                  <h3 className="section-title section-title--small">Adventure hooks</h3>
                  <ul className="hooks">{doc.hooks.map((h, i) => <li key={i}>{h}</li>)}</ul>
                </>
              )}
              {doc.wandering.length > 0 && (
                <>
                  <h3 className="section-title section-title--small">Wandering monsters <small className="muted">(d6, every 30 minutes)</small></h3>
                  <table className="wander"><tbody>{doc.wandering.map((w) => <tr key={w.roll}><td>{w.roll}</td><td>{w.text}</td></tr>)}</tbody></table>
                </>
              )}
              <label className="field">
                <span>Dungeon notes</span>
                <textarea rows={4} value={doc.notes ?? ''} onChange={(e) => update({ notes: e.target.value })} placeholder="Overall plot, factions, the way out…" />
              </label>
            </div>
          )}
        </aside>
      </div>

      <datalist id="bestiary-names">{monsters?.map((m) => <option key={m.id} value={m.name}>CR {m.cr}</option>)}</datalist>

      {/* Printed room key: hidden on screen, laid out for paper by the print stylesheet. */}
      <section className="print-key" aria-hidden="true">
        <h1>{doc.name}</h1>
        <p>{THEMES[doc.theme]?.label} for {doc.party} heroes of level {doc.level}.</p>
        {doc.hooks.length > 0 && <><h2>Hooks</h2><ul>{doc.hooks.map((h, i) => <li key={i}>{h}</li>)}</ul></>}
        {doc.rooms.map((r) => (
          <article key={r.id}>
            <h2>{r.n}. {r.kind}</h2>
            <blockquote>{r.readAloud}</blockquote>
            {r.encounter && <p><b>Encounter ({r.encounter.difficulty}):</b> {r.encounter.monsters.map((m) => `${m.count} × ${m.name}`).join(', ')}. {r.encounter.tactics}</p>}
            {r.trap && <p><b>Trap: {r.trap.name}.</b> {r.trap.trigger}; DC {r.trap.detect} to spot; DC {r.trap.dc} {r.trap.save}{r.trap.damage ? `, ${r.trap.damage}` : ''} {r.trap.effect}.</p>}
            {r.treasure.length > 0 && <p><b>Treasure:</b> {r.treasure.join('; ')}.</p>}
            {r.notes && <p><b>Notes:</b> {r.notes}</p>}
          </article>
        ))}
        {doc.wandering.length > 0 && <><h2>Wandering monsters (d6)</h2><ol>{doc.wandering.map((w) => <li key={w.roll}>{w.text}</li>)}</ol></>}
      </section>

      <AnimatePresence>
        {regen && (
          <Modal title="Regenerate dungeon" wide onClose={() => setRegen(false)}>
            <p className="muted" style={{ marginBottom: 14 }}>This replaces the map and room key. Your dungeon notes are kept.</p>
            <GeneratorForm initial={doc} onGenerate={regenerate} submitLabel="Regenerate" />
          </Modal>
        )}
      </AnimatePresence>
    </div>
  );
}
