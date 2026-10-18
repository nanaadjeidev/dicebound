import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Heart, Plus, Shield, UserPlus } from 'lucide-react';
import { CLASSES, characterSubtitle } from '@shared/rules.js';
import { api } from '../api.js';
import { useHeroes } from '../useBestiary.js';
import { useToast } from '../components/Toasts.jsx';
import GameIcon from '../components/GameIcon.jsx';
import Portrait from '../components/Portrait.jsx';

export async function recruit(hero) {
  const { id, premade, ...copy } = hero;
  return api('/characters', { method: 'POST', body: copy });
}

export function HeroCard({ hero, index = 0, action }) {
  const cls = CLASSES[hero.class];
  return (
    <motion.article className="hero-card" style={{ '--accent': cls?.color }}
      initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(index, 12) * 0.03 }}>
      <Link to={`/heroes/${hero.id}`} className="hero-card__link">
        <Portrait src={hero.image} icon={cls?.icon} color={cls?.color} shape="frame" alt={hero.name} />
        <div className="hero-card__emblem" title={cls?.name}><GameIcon name={cls?.icon} size={18} color={cls?.color} /></div>
        <div className="hero-card__body">
          <h3>{hero.name}</h3>
          <p>{characterSubtitle(hero)}</p>
          <div className="hero-card__stats">
            <span><Heart size={13} /> {hero.hp}/{hero.maxHp}</span>
            <span><Shield size={13} /> {hero.ac}</span>
          </div>
        </div>
      </Link>
      {action}
    </motion.article>
  );
}

export default function Heroes() {
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') ?? 'mine';
  const [mine, setMine] = useState(null);
  const [classFilter, setClassFilter] = useState('');
  const heroes = useHeroes();
  const toast = useToast();
  const navigate = useNavigate();

  useEffect(() => {
    api('/characters').then(setMine).catch((err) => { toast(err.message, 'error'); setMine([]); });
  }, [toast]);

  useEffect(() => {
    if (mine && mine.length === 0 && !params.get('tab')) setParams({ tab: 'hall' }, { replace: true });
  }, [mine, params, setParams]);

  const list = tab === 'hall' ? heroes : mine;
  const filtered = useMemo(() => (list ?? []).filter((h) => !classFilter || h.class === classFilter), [list, classFilter]);

  const doRecruit = async (hero) => {
    try {
      const created = await recruit(hero);
      toast(`${hero.name} joins your roster!`, 'success');
      navigate(`/heroes/${created.id}`);
    } catch (err) {
      toast(err.message, 'error');
    }
  };

  return (
    <div className="page">
      <header className="page__head">
        <div>
          <p className="kicker">Your company</p>
          <h1 className="page__title">Heroes</h1>
        </div>
        <Link to="/heroes/new" className="btn btn--gold"><Plus size={16} /> Forge a new hero</Link>
      </header>

      <div className="toolbar">
        <div className="tabs" role="tablist">
          <button role="tab" aria-selected={tab === 'mine'} className={tab === 'mine' ? 'is-active' : ''} onClick={() => setParams({ tab: 'mine' })}>
            My heroes <span className="pill">{mine?.length ?? '…'}</span>
          </button>
          <button role="tab" aria-selected={tab === 'hall'} className={tab === 'hall' ? 'is-active' : ''} onClick={() => setParams({ tab: 'hall' })}>
            Hall of Heroes <span className="pill">{heroes?.length ?? '…'}</span>
          </button>
        </div>
        <div className="chips">
          <button className={`chip ${!classFilter ? 'is-active' : ''}`} onClick={() => setClassFilter('')}>All classes</button>
          {Object.entries(CLASSES).map(([key, c]) => (
            <button key={key} className={`chip ${classFilter === key ? 'is-active' : ''}`} style={{ '--accent': c.color }}
              onClick={() => setClassFilter(classFilter === key ? '' : key)}>
              <GameIcon name={c.icon} size={14} color={c.color} /> {c.name}
            </button>
          ))}
        </div>
      </div>

      {tab === 'mine' && mine?.length === 0 ? (
        <div className="empty-state">
          <GameIcon name="visored-helm" size={56} />
          <h2>No heroes yet</h2>
          <p>Forge your own, or recruit a legend from the Hall of Heroes.</p>
          <div className="row">
            <Link to="/heroes/new" className="btn btn--gold"><Plus size={16} /> Forge a hero</Link>
            <button className="btn" onClick={() => setParams({ tab: 'hall' })}>Visit the Hall</button>
          </div>
        </div>
      ) : (
        <div className="card-grid">
          {list === null && Array.from({ length: 8 }, (_, i) => <div key={i} className="hero-card is-loading" />)}
          {filtered.map((h, i) => (
            <HeroCard key={h.id} hero={h} index={i}
              action={tab === 'hall' && (
                <button className="hero-card__action" onClick={() => doRecruit(h)}><UserPlus size={14} /> Recruit</button>
              )} />
          ))}
          {list && filtered.length === 0 && <p className="empty">No {CLASSES[classFilter]?.name}s here yet.</p>}
        </div>
      )}
    </div>
  );
}
