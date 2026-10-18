import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Heart, Plus, Search, Shield } from 'lucide-react';
import { crToNumber } from '@shared/rules.js';
import { api } from '../api.js';
import { useBestiary } from '../useBestiary.js';
import GameIcon from '../components/GameIcon.jsx';
import Portrait from '../components/Portrait.jsx';

export const CR_BANDS = [
  { key: '', label: 'Any CR', test: () => true },
  { key: 'low', label: 'CR 0–1', test: (n) => n <= 1 },
  { key: 'mid', label: 'CR 2–4', test: (n) => n >= 2 && n <= 4 },
  { key: 'high', label: 'CR 5–10', test: (n) => n >= 5 && n <= 10 },
  { key: 'epic', label: 'CR 11–16', test: (n) => n >= 11 && n <= 16 },
  { key: 'mythic', label: 'CR 17+', test: (n) => n >= 17 },
];
const SORTS = {
  name: (a, b) => a.name.localeCompare(b.name),
  cr: (a, b) => crToNumber(a.cr) - crToNumber(b.cr) || a.name.localeCompare(b.name),
  crDesc: (a, b) => crToNumber(b.cr) - crToNumber(a.cr) || a.name.localeCompare(b.name),
  hp: (a, b) => b.hp - a.hp,
};

/** Shared filtering used by the bestiary page and the table's summon panel. */
export function useMonsterFilter(list) {
  const [query, setQuery] = useState('');
  const [type, setType] = useState('');
  const [band, setBand] = useState('');
  const [sort, setSort] = useState('name');
  const types = useMemo(() => [...new Set((list ?? []).map((m) => m.type))].sort(), [list]);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const test = CR_BANDS.find((b) => b.key === band).test;
    return (list ?? [])
      .filter((m) => (!q || m.name.toLowerCase().includes(q)) && (!type || m.type === type) && test(crToNumber(m.cr)))
      .sort(SORTS[sort]);
  }, [list, query, type, band, sort]);
  return { query, setQuery, type, setType, band, setBand, sort, setSort, types, filtered };
}

export function MonsterCard({ m, to, onClick, footer }) {
  const Tag = to ? Link : 'button';
  return (
    <Tag to={to} onClick={onClick} className="monster-card" style={{ '--accent': m.color }}>
      <Portrait src={m.image} icon={m.icon} color={m.color} shape="frame" alt={m.name} />
      <span className="cr-badge" title="Challenge rating">CR {m.cr}</span>
      <div className="monster-card__body">
        <h3>{m.name}</h3>
        <p>{m.size} {m.type}</p>
        <div className="monster-card__stats">
          <span><Heart size={12} /> {m.hp}</span>
          <span><Shield size={12} /> {m.ac}</span>
          {m.xp ? <span>{m.xp.toLocaleString()} XP</span> : null}
        </div>
      </div>
      {footer}
    </Tag>
  );
}

export default function Bestiary() {
  const srd = useBestiary();
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') ?? 'srd';
  const [mine, setMine] = useState(null);
  const [visible, setVisible] = useState(48);
  const sentinel = useRef(null);

  useEffect(() => { api('/monsters').then(setMine).catch(() => setMine([])); }, []);

  const f = useMonsterFilter(tab === 'mine' ? mine : srd);
  useEffect(() => setVisible(48), [f.query, f.type, f.band, f.sort, tab]);

  useEffect(() => {
    const el = sentinel.current;
    if (!el) return undefined;
    const io = new IntersectionObserver(([e]) => e.isIntersecting && setVisible((v) => v + 48), { rootMargin: '600px' });
    io.observe(el);
    return () => io.disconnect();
  }, [f.filtered.length]);

  const list = tab === 'mine' ? mine : srd;

  return (
    <div className="page">
      <header className="page__head">
        <div>
          <p className="kicker">Know thy enemy</p>
          <h1 className="page__title">Bestiary</h1>
        </div>
        <Link to="/bestiary/new" className="btn btn--gold"><Plus size={16} /> Create a monster</Link>
      </header>

      <div className="toolbar">
        <div className="tabs">
          <button className={tab === 'srd' ? 'is-active' : ''} onClick={() => setParams({ tab: 'srd' })}>
            SRD Monsters <span className="pill">{srd?.length ?? '…'}</span>
          </button>
          <button className={tab === 'mine' ? 'is-active' : ''} onClick={() => setParams({ tab: 'mine' })}>
            My creations <span className="pill">{mine?.length ?? '…'}</span>
          </button>
        </div>
        <label className="search">
          <Search size={16} />
          <input value={f.query} onChange={(e) => f.setQuery(e.target.value)} placeholder="Search 334 monsters…" />
        </label>
        <select value={f.band} onChange={(e) => f.setBand(e.target.value)} aria-label="Challenge rating">
          {CR_BANDS.map((b) => <option key={b.key} value={b.key}>{b.label}</option>)}
        </select>
        <select value={f.sort} onChange={(e) => f.setSort(e.target.value)} aria-label="Sort">
          <option value="name">A–Z</option>
          <option value="cr">Weakest first</option>
          <option value="crDesc">Deadliest first</option>
          <option value="hp">Most HP</option>
        </select>
      </div>
      <div className="chips chips--scroll">
        <button className={`chip ${!f.type ? 'is-active' : ''}`} onClick={() => f.setType('')}>All types</button>
        {f.types.map((t) => (
          <button key={t} className={`chip ${f.type === t ? 'is-active' : ''}`} onClick={() => f.setType(f.type === t ? '' : t)}>{t}</button>
        ))}
      </div>

      {tab === 'mine' && mine?.length === 0 ? (
        <div className="empty-state">
          <GameIcon name="dragon-head" size={56} />
          <h2>No homebrew horrors yet</h2>
          <p>Design your own, or open any SRD monster and duplicate it as a starting point.</p>
          <Link to="/bestiary/new" className="btn btn--gold"><Plus size={16} /> Create a monster</Link>
        </div>
      ) : (
        <>
          <p className="muted small results-count">{list ? `${f.filtered.length} creatures` : 'Opening the tome…'}</p>
          <div className="card-grid card-grid--monsters">
            {list === null && Array.from({ length: 12 }, (_, i) => <div key={i} className="monster-card is-loading" />)}
            {f.filtered.slice(0, visible).map((m) => <MonsterCard key={m.id} m={m} to={`/bestiary/${m.id}`} />)}
          </div>
          {visible < f.filtered.length && <div ref={sentinel} className="sentinel" />}
        </>
      )}
    </div>
  );
}
