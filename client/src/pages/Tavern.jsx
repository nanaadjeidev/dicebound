import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowRight, Users, Swords } from 'lucide-react';

const STEPS = [
  { n: 'I', title: 'Prepare', icon: 'crystal-ball', to: '/dm', text: 'Plan your campaign in the DM’s Sanctum and forge a dungeon in seconds: rooms, read-aloud text, balanced encounters, traps and loot.' },
  { n: 'II', title: 'Gather', icon: 'scroll-unfurled', to: null, text: 'Open a table and send the five-letter code. Friends join from anywhere with no sign-up, bringing their own heroes.' },
  { n: 'III', title: 'Play', icon: 'd20', to: '/dice', text: 'Explore a battle map under fog of war, read scenes aloud as scrolls, and watch everyone’s own dice tumble in real 3D.' },
];
import { useGuest } from '../guest.jsx';
import { api, emit } from '../api.js';
import { useToast } from '../components/Toasts.jsx';
import GameIcon from '../components/GameIcon.jsx';
import { REALMS, REALM_BY_KEY } from '../realms.js';

const SHOWCASE = [
  { src: '/img/monsters/lich.webp', name: 'Lich' },
  { src: '/img/monsters/adult-red-dragon.webp', name: 'Adult Red Dragon' },
  { src: '/img/monsters/knight.webp', name: 'Ser Aldric Vane' },
];

export default function Tavern() {
  const { guest, socket } = useGuest();
  const toast = useToast();
  const navigate = useNavigate();
  const [rooms, setRooms] = useState([]);
  const [name, setName] = useState('');
  const [realm, setRealm] = useState('dungeon');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api('/rooms').then(setRooms).catch(() => {});
    if (!socket) return undefined;
    socket.on('rooms:update', setRooms);
    return () => socket.off('rooms:update', setRooms);
  }, [socket]);

  const create = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await emit(socket, 'room:create', { name: name.trim() || `${guest.name}'s Table`, realm });
      navigate(`/table/${res.code}`);
    } catch (err) {
      toast(err.message, 'error');
      setBusy(false);
    }
  };

  const join = (e) => {
    e.preventDefault();
    const c = code.trim().toUpperCase();
    if (c.length === 5) navigate(`/table/${c}`);
    else toast('Table codes have five letters.', 'error');
  };

  return (
    <div className="tavern">
      <section className="hero">
        <div className="hero__copy">
          <motion.p className="kicker" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
            Welcome, {guest.name}
          </motion.p>
          <motion.h1 initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}>
            Your table, anywhere.<br /><span className="gilded">Roll for glory.</span>
          </motion.h1>
          <motion.p className="hero__lede" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.15 }}>
            Run Dungeons &amp; Dragons sessions online with friends who live miles away. Prepare in the
            DM’s Sanctum, explore dungeons under fog of war and roll real 3D dice together. No sign-up: you’re playing as a guest.
          </motion.p>
          <div className="hero__stats">
            <div><strong>334</strong><span>monsters</span></div>
            <div><strong>30</strong><span>ready heroes</span></div>
            <div><strong>12</strong><span>classes</span></div>
            <div><strong>7</strong><span>dungeon themes</span></div>
          </div>
        </div>
        <div className="hero__art" aria-hidden="true">
          {SHOWCASE.map((s, i) => (
            <motion.figure key={s.src} className={`hero__card hero__card--${i}`}
              initial={{ opacity: 0, y: 40, rotate: 0 }} animate={{ opacity: 1, y: 0, rotate: [-9, 0, 8][i] }}
              transition={{ delay: 0.1 + i * 0.12, type: 'spring', damping: 16 }}>
              <img src={s.src} alt="" />
              <figcaption>{s.name}</figcaption>
            </motion.figure>
          ))}
        </div>
      </section>

      <section className="steps" aria-label="How a session works">
        {STEPS.map((s, i) => {
          const body = (
            <>
              <span className="steps__n">{s.n}</span>
              <GameIcon name={s.icon} size={30} />
              <h3>{s.title}</h3>
              <p>{s.text}</p>
            </>
          );
          return (
            <motion.div key={s.title} initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 + i * 0.1 }}>
              {s.to ? <Link to={s.to} className="steps__card">{body}</Link> : <a href="#open-table" className="steps__card">{body}</a>}
            </motion.div>
          );
        })}
      </section>

      <section className="tavern__grid" id="open-table">
        <form className="panel panel--glow create-table" onSubmit={create}>
          <h2 className="panel__title"><Swords size={18} /> Open a table</h2>
          <p className="muted">You’ll be the Dungeon Master. Share the code so friends can join.</p>
          <label className="field">
            <span>Table name</span>
            <input value={name} maxLength={40} placeholder={`${guest.name}'s Table`} onChange={(e) => setName(e.target.value)} />
          </label>
          <span className="field__label">Battlefield</span>
          <div className="realm-picker">
            {REALMS.map((r) => (
              <button type="button" key={r.key} className={`realm-swatch realm-bg--${r.key} ${realm === r.key ? 'is-active' : ''}`}
                onClick={() => setRealm(r.key)} title={r.blurb}>
                <span>{r.name}</span>
              </button>
            ))}
          </div>
          <p className="realm-blurb">{REALM_BY_KEY[realm].blurb}</p>
          <button className="btn btn--gold btn--lg" disabled={busy || !socket}>
            Light the torches <ArrowRight size={18} />
          </button>
        </form>

        <div className="tavern__side">
          <form className="panel join-table" onSubmit={join}>
            <h2 className="panel__title"><GameIcon name="scroll-unfurled" size={18} /> Join with a code</h2>
            <div className="join-table__row">
              <input className="code-input" value={code} maxLength={5} placeholder="ABCDE" aria-label="Table code"
                onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z]/g, ''))} />
              <button className="btn btn--gold">Join</button>
            </div>
          </form>

          <div className="panel rooms">
            <h2 className="panel__title"><Users size={18} /> Tables in session <span className="pill">{rooms.length}</span></h2>
            {rooms.length === 0 ? (
              <p className="empty">The tavern is quiet. Open a table and invite your friends.</p>
            ) : (
              <ul className="rooms__list">
                {rooms.map((r) => (
                  <li key={r.code}>
                    <Link to={`/table/${r.code}`} className={`room-row realm-bg--${r.realm}`}>
                      <div>
                        <strong>{r.name}</strong>
                        <span>DM {r.host} · {r.players} online · {r.combatants} in the arena</span>
                      </div>
                      <span className={`phase-tag phase-tag--${r.phase}`}>{r.phase === 'combat' ? 'In battle' : r.phase === 'ended' ? 'Aftermath' : 'Gathering'}</span>
                      <code>{r.code}</code>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="quick-links">
            <Link to="/heroes" className="quick-link">
              <img src="/img/monsters/gladiator.webp" alt="" />
              <div><strong>Hall of Heroes</strong><span>Create a hero or recruit a legend</span></div>
            </Link>
            <Link to="/bestiary" className="quick-link">
              <img src="/img/monsters/aboleth.webp" alt="" />
              <div><strong>Bestiary</strong><span>334 monsters, from rats to dragons</span></div>
            </Link>
            <Link to="/dm" className="quick-link">
              <img src="/img/monsters/lich.webp" alt="" />
              <div><strong>DM’s Sanctum</strong><span>Campaigns, notes and the dungeon forge</span></div>
            </Link>
            <Link to="/dice" className="quick-link">
              <img src="/img/monsters/young-red-dragon.webp" alt="" />
              <div><strong>Dice Forge</strong><span>Craft dice everyone at your table will see</span></div>
            </Link>
          </div>
        </div>
      </section>

      <footer className="credits">
        Monster statistics and artwork from the <a href="https://www.dnd5eapi.co" target="_blank" rel="noreferrer">D&amp;D 5e SRD API</a> (SRD 5.1, CC BY 4.0).
        Icons by Lorc and Delapouite from <a href="https://game-icons.net" target="_blank" rel="noreferrer">game-icons.net</a> (CC BY 3.0).
      </footer>
    </div>
  );
}
