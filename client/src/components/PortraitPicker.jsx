import { useMemo, useState } from 'react';
import { Link as LinkIcon, Search } from 'lucide-react';
import { useBestiary } from '../useBestiary.js';
import Modal from './Modal.jsx';

const HERO_FIRST = new Set([
  'knight', 'mage', 'archmage', 'priest', 'acolyte', 'scout', 'spy', 'assassin', 'veteran', 'gladiator', 'noble',
  'druid', 'berserker', 'bandit-captain', 'bandit', 'thug', 'guard', 'cultist', 'cult-fanatic', 'tribal-warrior',
  'drow', 'duergar', 'deep-gnome-svirfneblin', 'commoner', 'half-red-dragon-veteran', 'werebear-human',
  'weretiger-human', 'werewolf-human', 'wererat-human', 'wereboar-human',
]);

/** Choose any SRD portrait, or paste an image URL from anywhere on the internet. */
export default function PortraitPicker({ current, onPick, onClose }) {
  const bestiary = useBestiary();
  const [query, setQuery] = useState('');
  const [url, setUrl] = useState(current?.startsWith('http') ? current : '');
  const [scope, setScope] = useState('heroes');

  const images = useMemo(() => {
    const all = (bestiary ?? []).filter((m) => m.image);
    const slug = (m) => m.id.slice(4);
    const list = scope === 'heroes' ? all.filter((m) => HERO_FIRST.has(slug(m))) : all;
    const q = query.trim().toLowerCase();
    return q ? list.filter((m) => m.name.toLowerCase().includes(q)) : list;
  }, [bestiary, query, scope]);

  const validUrl = /^https?:\/\/\S+$/i.test(url.trim());

  return (
    <Modal title="Choose a portrait" onClose={onClose} wide>
      <form className="url-row" onSubmit={(e) => { e.preventDefault(); if (validUrl) onPick(url.trim()); }}>
        <LinkIcon size={16} />
        <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="Paste an image URL from the internet…" />
        {validUrl && <img src={url} alt="" className="url-row__preview" />}
        <button className="btn btn--small btn--gold" disabled={!validUrl}>Use URL</button>
      </form>
      <div className="toolbar toolbar--tight">
        <div className="tabs">
          <button className={scope === 'heroes' ? 'is-active' : ''} onClick={() => setScope('heroes')}>Adventurers</button>
          <button className={scope === 'all' ? 'is-active' : ''} onClick={() => setScope('all')}>All creatures</button>
        </div>
        <label className="search">
          <Search size={16} />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search portraits" />
        </label>
      </div>
      <div className="portrait-grid">
        {bestiary === null && <p className="muted">Unrolling the gallery…</p>}
        {images.map((m) => (
          <button key={m.id} className={`portrait-grid__item ${current === m.image ? 'is-active' : ''}`} onClick={() => onPick(m.image)} title={m.name}>
            <img src={m.image} alt={m.name} loading="lazy" />
            <span>{m.name}</span>
          </button>
        ))}
      </div>
    </Modal>
  );
}
