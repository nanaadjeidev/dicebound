import { useState } from 'react';
import { NavLink, Link } from 'react-router-dom';
import { Pencil, Wifi, WifiOff } from 'lucide-react';
import { useGuest } from '../guest.jsx';
import { useToast } from './Toasts.jsx';
import GameIcon from './GameIcon.jsx';

export default function Nav() {
  const { guest, online, rename } = useGuest();
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');

  const save = async () => {
    setEditing(false);
    const name = draft.trim();
    if (!name || name === guest.name) return;
    try {
      await rename(name);
      toast(`You shall be known as ${name}.`, 'success');
    } catch (err) {
      toast(err.message, 'error');
    }
  };

  return (
    <header className="nav">
      <Link to="/" className="nav__brand">
        <GameIcon name="dice-twenty-faces-twenty" size={26} className="nav__logo" />
        <span>Dicebound</span>
      </Link>
      <nav className="nav__links">
        <NavLink to="/" end title="Tavern"><GameIcon name="tavern-sign" size={16} /> Tavern</NavLink>
        <NavLink to="/heroes" title="Heroes"><GameIcon name="visored-helm" size={16} /> Heroes</NavLink>
        <NavLink to="/bestiary" title="Bestiary"><GameIcon name="dragon-head" size={16} /> Bestiary</NavLink>
        <NavLink to="/dice" title="Dice Forge"><GameIcon name="d20" size={16} /> Dice Forge</NavLink>
        <NavLink to="/dm" title="DM’s Sanctum"><GameIcon name="crystal-ball" size={16} /> DM’s Sanctum</NavLink>
      </nav>
      <div className="nav__guest">
        <span className={`nav__status ${online ? 'is-online' : ''}`} title={online ? 'Connected' : 'Reconnecting…'}>
          {online ? <Wifi size={14} /> : <WifiOff size={14} />}
        </span>
        {editing ? (
          <input autoFocus className="nav__name-input" value={draft} maxLength={32}
            onChange={(e) => setDraft(e.target.value)} onBlur={save}
            onKeyDown={(e) => { if (e.key === 'Enter') save(); if (e.key === 'Escape') setEditing(false); }} />
        ) : (
          <button className="guest-chip" onClick={() => { setDraft(guest.name); setEditing(true); }} title="Rename your guest">
            <span className="guest-chip__dot" style={{ background: guest.color }} />
            <span className="guest-chip__name">{guest.name}</span>
            <span className="guest-chip__tag">Guest</span>
            <Pencil size={12} />
          </button>
        )}
      </div>
    </header>
  );
}
