import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Minus, Plus, Search } from 'lucide-react';
import { CLASSES, characterSubtitle } from '@shared/rules.js';
import { api } from '../../api.js';
import { useBestiary, useHeroes } from '../../useBestiary.js';
import { CR_BANDS, useMonsterFilter } from '../Bestiary.jsx';
import Portrait from '../../components/Portrait.jsx';

export default function Summon({ onSend }) {
  const [tab, setTab] = useState('monsters');
  const [side, setSide] = useState(null);
  const [count, setCount] = useState(1);
  const [limit, setLimit] = useState(40);
  const [mine, setMine] = useState([]);
  const [myMonsters, setMyMonsters] = useState([]);
  const [heroQuery, setHeroQuery] = useState('');
  const heroes = useHeroes();
  const srd = useBestiary();

  useEffect(() => {
    api('/characters').then(setMine).catch(() => {});
    api('/monsters').then(setMyMonsters).catch(() => {});
  }, []);

  const f = useMonsterFilter(srd ? [...myMonsters, ...srd] : null);
  useEffect(() => setLimit(40), [f.query, f.type, f.band]);

  const heroSide = side ?? 'party';
  const monsterSide = side ?? 'foes';
  const hq = heroQuery.trim().toLowerCase();
  const heroList = [...mine, ...(heroes ?? [])].filter((h) => !hq || h.name.toLowerCase().includes(hq) || h.class.includes(hq));

  return (
    <div className="summon">
      <div className="tabs tabs--small">
        <button className={tab === 'monsters' ? 'is-active' : ''} onClick={() => setTab('monsters')}>Monsters</button>
        <button className={tab === 'heroes' ? 'is-active' : ''} onClick={() => setTab('heroes')}>Heroes</button>
      </div>
      <div className="summon__opts">
        <div className="segmented" role="radiogroup" aria-label="Side">
          <button className={(tab === 'heroes' ? heroSide : monsterSide) === 'party' ? 'is-active' : ''} onClick={() => setSide('party')}>Ally</button>
          <button className={(tab === 'heroes' ? heroSide : monsterSide) === 'foes' ? 'is-active' : ''} onClick={() => setSide('foes')}>Enemy</button>
        </div>
        {tab === 'monsters' && (
          <div className="stepper" aria-label="How many">
            <button onClick={() => setCount(Math.max(1, count - 1))} aria-label="Fewer"><Minus size={12} /></button>
            <span>×{count}</span>
            <button onClick={() => setCount(Math.min(8, count + 1))} aria-label="More"><Plus size={12} /></button>
          </div>
        )}
      </div>

      {tab === 'monsters' ? (
        <>
          <div className="summon__filters">
            <label className="search search--small"><Search size={14} />
              <input value={f.query} onChange={(e) => f.setQuery(e.target.value)} placeholder="Search monsters" />
            </label>
            <select value={f.band} onChange={(e) => f.setBand(e.target.value)} aria-label="Challenge rating">
              {CR_BANDS.map((b) => <option key={b.key} value={b.key}>{b.label}</option>)}
            </select>
            <select value={f.type} onChange={(e) => f.setType(e.target.value)} aria-label="Type">
              <option value="">All types</option>
              {f.types.map((t) => <option key={t}>{t}</option>)}
            </select>
          </div>
          <ul className="summon__list">
            {f.filtered.slice(0, limit).map((m) => (
              <li key={m.id}>
                <button className="summon-row" onClick={() => onSend('room:addMonster', { monsterId: m.id, count, side: monsterSide })}>
                  <Portrait src={m.image} icon={m.icon} color={m.color} alt="" />
                  <div><strong>{m.name}</strong><span>{m.builtin ? '' : '★ '}{m.size} {m.type} · HP {m.hp} · AC {m.ac}</span></div>
                  <em>CR {m.cr}</em>
                </button>
              </li>
            ))}
            {limit < f.filtered.length && <li><button className="btn btn--small btn--ghost summon__more" onClick={() => setLimit(limit + 60)}>Show more ({f.filtered.length - limit})</button></li>}
          </ul>
        </>
      ) : (
        <>
          <label className="search search--small"><Search size={14} />
            <input value={heroQuery} onChange={(e) => setHeroQuery(e.target.value)} placeholder="Search heroes" />
          </label>
          <ul className="summon__list">
            {mine.length === 0 && <li className="muted small summon__hint">Tip: <Link to="/heroes/new">forge your own hero</Link>. Their HP is saved after each battle.</li>}
            {heroList.map((h) => (
              <li key={h.id}>
                <button className="summon-row" onClick={() => onSend('room:addCharacter', { characterId: h.id, side: heroSide })}>
                  <Portrait src={h.image} icon={CLASSES[h.class]?.icon} color={CLASSES[h.class]?.color} alt="" />
                  <div><strong>{h.name}</strong><span>{h.premade ? '' : '★ '}{characterSubtitle(h)}</span></div>
                  <em>{h.hp}/{h.maxHp}</em>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
