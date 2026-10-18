import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import {
  BookOpen, Castle, ChevronDown, ChevronLeft, Compass, Crown, Link2, MapPin, NotebookPen, Plus, ScrollText, Swords, Trash2, Unlink, Users,
} from 'lucide-react';
import { THEMES } from '@shared/dungeon.js';
import { rateEncounter } from '@shared/encounters.js';
import { api } from '../../api.js';
import { useBestiary } from '../../useBestiary.js';
import { useToast } from '../../components/Toasts.jsx';
import Modal from '../../components/Modal.jsx';
import DungeonMap from '../../components/DungeonMap.jsx';
import GeneratorForm from './GeneratorForm.jsx';
import { DifficultyBadge } from './Dungeon.jsx';
import { newId, useDoc } from './useDoc.js';

const TABS = [
  { key: 'overview', label: 'Overview', icon: Compass },
  { key: 'sessions', label: 'Sessions', icon: NotebookPen },
  { key: 'npcs', label: 'Cast', icon: Users },
  { key: 'locations', label: 'Places', icon: MapPin },
  { key: 'quests', label: 'Quests', icon: ScrollText },
  { key: 'encounters', label: 'Encounters', icon: Swords },
  { key: 'dungeons', label: 'Dungeons', icon: Castle },
  { key: 'notes', label: 'Notes', icon: BookOpen },
];

// Each list-style tab is one "ledger": a collection of entries with these fields.
const LEDGERS = {
  sessions: {
    noun: 'session', title: (s) => s.title, blank: (n) => ({ title: `Session ${n + 1}`, date: '', status: 'planned', prep: '', recap: '' }),
    meta: (s) => [s.date, s.status === 'played' ? 'Played' : 'Planned'].filter(Boolean).join(' · '),
    fields: [
      { key: 'title', label: 'Title' }, { key: 'date', label: 'Date', type: 'date' },
      { key: 'status', label: 'Status', options: [['planned', 'Planned'], ['played', 'Played']] },
      { key: 'prep', label: 'Prep: strong start, scenes, secrets & clues', type: 'area', rows: 6 },
      { key: 'recap', label: 'Recap: what actually happened', type: 'area', rows: 4 },
    ],
  },
  npcs: {
    noun: 'character', title: (n) => n.name, blank: () => ({ name: 'New character', role: '', attitude: 'unknown', description: '', secret: '', image: '' }),
    meta: (n) => [n.role, n.attitude !== 'unknown' && n.attitude].filter(Boolean).join(' · '), tone: (n) => n.attitude,
    fields: [
      { key: 'name', label: 'Name' }, { key: 'role', label: 'Role', placeholder: 'Innkeeper, cult leader, rival…' },
      { key: 'attitude', label: 'Attitude', options: [['unknown', 'Unknown'], ['friendly', 'Friendly'], ['neutral', 'Neutral'], ['hostile', 'Hostile']] },
      { key: 'image', label: 'Portrait URL', placeholder: '/img/monsters/noble.webp or https://…' },
      { key: 'description', label: 'Description & voice', type: 'area', rows: 3 },
      { key: 'secret', label: 'Secret (DM only)', type: 'area', rows: 2, secret: true },
    ],
  },
  locations: {
    noun: 'place', title: (l) => l.name, blank: () => ({ name: 'New place', region: '', description: '', secret: '' }), meta: (l) => l.region,
    fields: [
      { key: 'name', label: 'Name' }, { key: 'region', label: 'Region' },
      { key: 'description', label: 'Description', type: 'area', rows: 4 },
      { key: 'secret', label: 'Secret (DM only)', type: 'area', rows: 2, secret: true },
    ],
  },
  quests: {
    noun: 'quest', title: (q) => q.title, blank: () => ({ title: 'New quest', giver: '', reward: '', status: 'open', description: '' }),
    meta: (q) => [q.giver && `from ${q.giver}`, q.reward && `reward: ${q.reward}`].filter(Boolean).join(' · '), tone: (q) => q.status,
    fields: [
      { key: 'title', label: 'Title' }, { key: 'giver', label: 'Quest giver' }, { key: 'reward', label: 'Reward' },
      { key: 'status', label: 'Status', options: [['open', 'Rumoured'], ['active', 'Active'], ['done', 'Completed'], ['failed', 'Failed']] },
      { key: 'description', label: 'Details', type: 'area', rows: 4 },
    ],
  },
};

function Field({ f, value, onChange }) {
  if (f.options) {
    return (
      <label className="field">
        <span>{f.label}</span>
        <select value={value} onChange={(e) => onChange(e.target.value)}>{f.options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
      </label>
    );
  }
  return (
    <label className={`field ${f.type === 'area' ? 'field--wide' : ''} ${f.secret ? 'field--secret' : ''}`}>
      <span>{f.label}</span>
      {f.type === 'area'
        ? <textarea rows={f.rows ?? 3} value={value} onChange={(e) => onChange(e.target.value)} placeholder={f.placeholder} />
        : <input type={f.type ?? 'text'} value={value} onChange={(e) => onChange(e.target.value)} placeholder={f.placeholder} />}
    </label>
  );
}

function Ledger({ items, config, onChange }) {
  const [open, setOpen] = useState(null);
  const add = () => {
    const entry = { id: newId(), ...config.blank(items.length) };
    onChange([entry, ...items]);
    setOpen(entry.id);
  };
  const edit = (id, patch) => onChange(items.map((x) => (x.id === id ? { ...x, ...patch } : x)));
  const remove = (item) => {
    if (window.confirm(`Remove “${config.title(item)}”?`)) onChange(items.filter((x) => x.id !== item.id));
  };
  return (
    <div className="ledger">
      <button className="btn btn--gold" onClick={add}><Plus size={16} /> Add {config.noun}</button>
      {items.length === 0 && <p className="empty">Nothing here yet.</p>}
      {items.map((item) => (
        <motion.div layout key={item.id} className={`ledger__item ${open === item.id ? 'is-open' : ''} ${config.tone ? `tone--${config.tone(item)}` : ''}`}>
          <button className="ledger__head" onClick={() => setOpen(open === item.id ? null : item.id)} aria-expanded={open === item.id}>
            {item.image && <img src={item.image} alt="" className="ledger__face" />}
            <span className="ledger__title">{config.title(item)}</span>
            <span className="ledger__meta">{config.meta?.(item)}</span>
            <ChevronDown size={16} className="ledger__chev" />
          </button>
          {open === item.id && (
            <div className="ledger__body">
              {config.fields.map((f) => <Field key={f.key} f={f} value={item[f.key] ?? ''} onChange={(v) => edit(item.id, { [f.key]: v })} />)}
              <button className="btn btn--small btn--ghost btn--danger" onClick={() => remove(item)}><Trash2 size={14} /> Remove</button>
            </div>
          )}
        </motion.div>
      ))}
    </div>
  );
}

function Encounters({ items, party, onChange, monsters }) {
  const [query, setQuery] = useState({});
  const edit = (id, patch) => onChange(items.map((x) => (x.id === id ? { ...x, ...patch } : x)));
  const addMonster = (enc) => {
    const m = monsters?.find((x) => x.name.toLowerCase() === (query[enc.id] ?? '').trim().toLowerCase());
    if (!m) return;
    const existing = enc.monsters.find((x) => x.id === m.id);
    edit(enc.id, { monsters: existing ? enc.monsters.map((x) => (x === existing ? { ...x, count: x.count + 1 } : x)) : [...enc.monsters, { id: m.id, name: m.name, cr: m.cr, xp: m.xp, count: 1 }] });
    setQuery((q) => ({ ...q, [enc.id]: '' }));
  };
  return (
    <div className="ledger">
      <button className="btn btn--gold" onClick={() => onChange([{ id: newId(), name: 'New encounter', notes: '', monsters: [] }, ...items])}><Plus size={16} /> Plan an encounter</button>
      <p className="muted small">Difficulty is rated for your party of {party.size} at level {party.level}, using the 5e encounter-building rules.</p>
      {items.map((enc) => {
        const rating = rateEncounter(enc.monsters.map((m) => ({ xp: m.xp, count: m.count })), party);
        return (
          <div key={enc.id} className="ledger__item is-open">
            <div className="ledger__body">
              <div className="enc__head">
                <input className="title-input title-input--small" value={enc.name} onChange={(e) => edit(enc.id, { name: e.target.value })} aria-label="Encounter name" />
                {enc.monsters.length > 0 && <DifficultyBadge rating={rating} />}
              </div>
              {enc.monsters.map((m) => (
                <div key={m.id} className="enc__row">
                  <input type="number" min="1" max="30" value={m.count} className="mini-input" aria-label={`${m.name} count`}
                    onChange={(e) => edit(enc.id, { monsters: enc.monsters.map((x) => (x.id === m.id ? { ...x, count: Math.max(1, Number(e.target.value) || 1) } : x)) })} />
                  <span className="enc__name">{m.name}</span>
                  <small className="muted">CR {m.cr} · {m.xp} XP</small>
                  <button className="icon-btn icon-btn--small" onClick={() => edit(enc.id, { monsters: enc.monsters.filter((x) => x.id !== m.id) })} aria-label={`Remove ${m.name}`}><Trash2 size={13} /></button>
                </div>
              ))}
              <div className="input-with-btn">
                <input list="bestiary-names" placeholder="Add a monster…" value={query[enc.id] ?? ''} onChange={(e) => setQuery((q) => ({ ...q, [enc.id]: e.target.value }))}
                  onKeyDown={(e) => { if (e.key === 'Enter') addMonster(enc); }} />
                <button className="btn btn--small" onClick={() => addMonster(enc)}><Plus size={14} /></button>
              </div>
              {enc.monsters.length > 0 && (
                <p className="enc__budget">
                  Easy {rating.thresholds.easy} · Medium {rating.thresholds.medium} · Hard {rating.thresholds.hard} · Deadly {rating.thresholds.deadly} XP
                  {' '}· ×{rating.multiplier} for {rating.count} {rating.count === 1 ? 'monster' : 'monsters'} · {rating.perCharacter} XP each
                </p>
              )}
              <Field f={{ key: 'notes', label: 'Setup & tactics', type: 'area', rows: 2 }} value={enc.notes} onChange={(v) => edit(enc.id, { notes: v })} />
              <button className="btn btn--small btn--ghost btn--danger" onClick={() => onChange(items.filter((x) => x.id !== enc.id))}><Trash2 size={14} /> Remove</button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function Campaign() {
  const { id } = useParams();
  const toast = useToast();
  const navigate = useNavigate();
  const monsters = useBestiary();
  const { doc, update, status, error } = useDoc('campaigns', id);
  const [tab, setTab] = useState('overview');
  const [library, setLibrary] = useState([]);
  const [forging, setForging] = useState(false);

  useEffect(() => { api('/dungeons').then(setLibrary).catch(() => {}); }, []);
  const party = useMemo(() => ({ level: doc?.partyLevel ?? 1, size: doc?.partySize ?? 4 }), [doc?.partyLevel, doc?.partySize]);

  if (error && !doc) return <div className="page"><h1 className="page__title">This tome is lost</h1><p className="muted">{error}</p><Link to="/dm" className="btn">Back to the Sanctum</Link></div>;
  if (!doc) return <div className="page"><div className="is-loading" /></div>;

  const linked = library.filter((d) => doc.dungeonIds.includes(d.id));
  const unlinked = library.filter((d) => !doc.dungeonIds.includes(d.id));
  const nextSession = doc.sessions.find((s) => s.status === 'planned');
  const activeQuests = doc.quests.filter((q) => q.status === 'active');

  const forge = async (dungeon) => {
    try {
      const d = await api('/dungeons', { method: 'POST', body: dungeon });
      setLibrary((l) => [d, ...l]);
      update((c) => ({ ...c, dungeonIds: [d.id, ...c.dungeonIds] }));
      setForging(false);
      navigate(`/dm/dungeons/${d.id}`);
    } catch (e) {
      toast(e.message, 'error');
    }
  };

  return (
    <div className="page campaign">
      <header className="campaign__head">
        <Link to="/dm" className="icon-btn" aria-label="Back to the Sanctum"><ChevronLeft size={18} /></Link>
        <div className="campaign__titles">
          <input className="title-input title-input--hero" value={doc.name} onChange={(e) => update({ name: e.target.value })} aria-label="Campaign name" />
          <input className="campaign__tagline" value={doc.tagline} placeholder="A one-line pitch for your players…" onChange={(e) => update({ tagline: e.target.value })} aria-label="Tagline" />
        </div>
        <div className="campaign__party">
          <label><span>Heroes</span><input type="number" min="1" max="8" value={doc.partySize} onChange={(e) => update({ partySize: Number(e.target.value) })} /></label>
          <label><span>Level</span><input type="number" min="1" max="20" value={doc.partyLevel} onChange={(e) => update({ partyLevel: Number(e.target.value) })} /></label>
          <em className={`save-state save-state--${status}`}>{status === 'saved' ? 'Saved' : status === 'error' ? 'Not saved' : 'Saving…'}</em>
        </div>
      </header>

      <nav className="campaign__tabs" role="tablist">
        {TABS.map(({ key, label, icon: Icon }) => (
          <button key={key} role="tab" aria-selected={tab === key} className={tab === key ? 'is-active' : ''} onClick={() => setTab(key)}>
            <Icon size={15} /> {label}
            {['sessions', 'npcs', 'locations', 'quests', 'encounters'].includes(key) && <span className="pill">{doc[key].length}</span>}
            {key === 'dungeons' && <span className="pill">{linked.length}</span>}
          </button>
        ))}
      </nav>

      <AnimatePresence mode="wait">
        <motion.section key={tab} className="campaign__panel" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
          {tab === 'overview' && (
            <div className="overview">
              <div className="parchment">
                <label className="field">
                  <span>The world & the premise</span>
                  <textarea rows={10} value={doc.setting} placeholder="Where is this, what's going wrong, and why should the heroes care?" onChange={(e) => update({ setting: e.target.value })} />
                </label>
              </div>
              <div className="overview__side">
                <div className="panel stat-panel">
                  <h3><Crown size={15} /> At a glance</h3>
                  <dl>
                    <dt>Party</dt><dd>{doc.partySize} heroes, level {doc.partyLevel}</dd>
                    <dt>Sessions</dt><dd>{doc.sessions.filter((s) => s.status === 'played').length} played, {doc.sessions.filter((s) => s.status === 'planned').length} planned</dd>
                    <dt>Cast</dt><dd>{doc.npcs.length} characters</dd>
                    <dt>Active quests</dt><dd>{activeQuests.length ? activeQuests.map((q) => q.title).join(', ') : 'None'}</dd>
                  </dl>
                </div>
                {nextSession && (
                  <div className="panel stat-panel">
                    <h3><NotebookPen size={15} /> Next session</h3>
                    <strong>{nextSession.title}</strong>{nextSession.date && <span className="muted"> · {nextSession.date}</span>}
                    <p className="stat-panel__prep">{nextSession.prep || 'No prep notes yet.'}</p>
                    <button className="link-btn" onClick={() => setTab('sessions')}>Open session prep</button>
                  </div>
                )}
              </div>
            </div>
          )}
          {LEDGERS[tab] && <Ledger items={doc[tab]} config={LEDGERS[tab]} onChange={(items) => update({ [tab]: items })} />}
          {tab === 'encounters' && <Encounters items={doc.encounters} party={party} monsters={monsters} onChange={(encounters) => update({ encounters })} />}
          {tab === 'dungeons' && (
            <div className="campaign-dungeons">
              <div className="row">
                <button className="btn btn--gold" onClick={() => setForging(true)}><Castle size={16} /> Forge a dungeon for this party</button>
                {unlinked.length > 0 && (
                  <select className="select--small" value="" onChange={(e) => e.target.value && update((c) => ({ ...c, dungeonIds: [...c.dungeonIds, e.target.value] }))} aria-label="Link a dungeon from your library">
                    <option value="">Link one from your library…</option>
                    {unlinked.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </select>
                )}
              </div>
              {linked.length === 0 && <p className="empty">No dungeons linked to this campaign yet.</p>}
              <div className="dungeon-grid">
                {linked.map((d) => (
                  <div key={d.id} className="dungeon-card">
                    <Link to={`/dm/dungeons/${d.id}`} className="dungeon-card__link">
                      <div className="dungeon-card__map" aria-hidden="true"><DungeonMap map={d} mapStyle="parchment" showNumbers={false} interactive={false} /></div>
                      <div className="dungeon-card__body"><h3>{d.name}</h3><span>{THEMES[d.theme]?.label} · {d.rooms.length} rooms · level {d.level}</span></div>
                    </Link>
                    <button className="icon-btn campaign-card__delete" onClick={() => update((c) => ({ ...c, dungeonIds: c.dungeonIds.filter((x) => x !== d.id) }))} aria-label={`Unlink ${d.name}`} title="Unlink"><Unlink size={14} /></button>
                  </div>
                ))}
              </div>
              {library.length === 0 && <p className="muted small"><Link2 size={12} /> Dungeons you forge appear in your library and can be linked to any campaign.</p>}
            </div>
          )}
          {tab === 'notes' && (
            <div className="parchment">
              <label className="field">
                <span>Scratchpad</span>
                <textarea rows={18} value={doc.notes} placeholder="Names you made up on the spot, rulings, loot the party sold…" onChange={(e) => update({ notes: e.target.value })} />
              </label>
            </div>
          )}
        </motion.section>
      </AnimatePresence>

      <datalist id="bestiary-names">{monsters?.map((m) => <option key={m.id} value={m.name}>CR {m.cr}</option>)}</datalist>

      <AnimatePresence>
        {forging && (
          <Modal title="Forge a dungeon" wide onClose={() => setForging(false)}>
            <GeneratorForm initial={{ level: doc.partyLevel, party: doc.partySize }} onGenerate={forge} />
          </Modal>
        )}
      </AnimatePresence>
    </div>
  );
}
