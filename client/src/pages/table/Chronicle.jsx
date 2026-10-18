import { useEffect, useRef, useState } from 'react';
import { EyeOff, Lock, Send } from 'lucide-react';
import { ABILITY_NAMES } from '@shared/rules.js';
import { describe } from '../../components/DiceTray.jsx';
import GameIcon from '../../components/GameIcon.jsx';
import { loadStyle, shareableStyle } from '../forge/pool.js';

const DICE = ['d4', 'd6', 'd8', 'd10', 'd12', 'd20', 'd100'];
const N = ({ children }) => <strong className="n">{children}</strong>;
const Nat = ({ n }) => <span className={`nat ${n === 20 ? 'nat--20' : n === 1 ? 'nat--1' : ''}`}>{n}</span>;

function Entry({ e }) {
  switch (e.type) {
    case 'banner': return <li className="log log--banner"><span>{e.text}</span></li>;
    case 'turn': return <li className="log log--turn">Round {e.round} · <N>{e.actor}</N>’s turn{e.down ? ' (dying)' : ''}</li>;
    case 'initiative': return <li className="log log--init"><N>{e.actor}</N> rolls initiative <Nat n={e.natural} /> → <b>{e.total}</b></li>;
    case 'attack':
      return (
        <li className={`log log--attack ${e.crit ? 'is-crit' : ''} ${e.hit ? 'is-hit' : 'is-miss'}`}>
          <N>{e.actor}</N> attacks <N>{e.target}</N> with <i>{e.action}</i>.
          <div className="log__math">
            <GameIcon name="dice-twenty-faces-twenty" size={13} />
            {e.d20.length > 1 ? <>[{e.d20.join(', ')}] {e.mode === 'adv' ? 'adv' : 'dis'} → </> : null}
            <Nat n={e.natural} /> {e.toHit >= 0 ? '+' : '−'} {Math.abs(e.toHit)}{e.bless ? ` + ${e.bless} bless` : ''} = <b>{e.total}</b> vs AC {e.ac}
            <span className="verdict">{e.crit ? 'CRITICAL' : e.hit ? 'HIT' : 'MISS'}</span>
          </div>
          {e.hit && <div className="log__dmg"><b>{e.damage}</b> {e.damageType} damage <small>{describe(e.damageRoll)}</small></div>}
        </li>
      );
    case 'save':
      return (
        <li className={`log log--attack ${e.saved ? 'is-miss' : 'is-hit'}`}>
          <N>{e.actor}</N> uses <i>{e.action}</i> on <N>{e.target}</N>.
          <div className="log__math">
            {ABILITY_NAMES[e.save]} save <Nat n={e.natural} /> → <b>{e.total}</b> vs DC {e.dc}{e.autoFail ? ' (auto-fail)' : ''}
            <span className="verdict">{e.saved ? 'SAVED' : 'FAILED'}</span>
          </div>
          <div className="log__dmg"><b>{e.damage}</b> {e.damageType} damage <small>{describe(e.damageRoll)}{e.saved && e.damage ? ', halved' : ''}</small></div>
        </li>
      );
    case 'auto':
      return (
        <li className="log log--attack is-hit">
          <N>{e.actor}</N>’s <i>{e.action}</i> strikes <N>{e.target}</N> unerringly.
          <div className="log__dmg"><b>{e.damage}</b> {e.damageType} damage <small>{describe(e.damageRoll)}</small></div>
        </li>
      );
    case 'heal':
      return (
        <li className="log log--heal">
          <N>{e.actor}</N> {e.actor === e.target ? 'recovers' : <>heals <N>{e.target}</N></>} <b>{e.amount}</b> HP{e.action ? <> with <i>{e.action}</i></> : null}
          {e.damageRoll && <small> {describe(e.damageRoll)}</small>}
        </li>
      );
    case 'death': return <li className={`log log--death ${e.dead ? 'is-dead' : ''}`}><GameIcon name="skull-crossed-bones" size={13} /> {e.text}</li>;
    case 'check': return <li className="log log--roll"><N>{e.actor}</N> rolls {e.label}: <Nat n={e.natural} /> {e.bonus >= 0 ? '+' : '−'} {Math.abs(e.bonus)} = <b>{e.total}</b></li>;
    case 'roll':
      return (
        <li className="log log--roll">
          <span className="author" style={{ color: e.color }}>{e.author}</span> rolls {e.label || e.roll.expr}: <b>{e.roll.total}</b>
          <small> {describe(e.roll)}</small>
        </li>
      );
    case 'secret':
      return (
        <li className="log log--roll log--secret">
          <Lock size={12} /> Secret roll{e.label ? ` (${e.label})` : ''}: <b>{e.roll.total}</b>
          <small> {describe(e.roll)} · only you can see this</small>
        </li>
      );
    case 'narration':
      return (
        <li className="log log--narration">
          {e.title && <strong>{e.title}</strong>}
          <p>{e.text}</p>
        </li>
      );
    case 'chat': return <li className="log log--chat"><span className="author" style={{ color: e.color }}>{e.author}</span> {e.text}</li>;
    default: return <li className="log log--system">{e.text}</li>;
  }
}

export default function Chronicle({ log, onSend, isHost }) {
  const [text, setText] = useState('');
  const [secret, setSecret] = useState(false);
  const [secrets, setSecrets] = useState([]);
  const entries = secrets.length ? [...log, ...secrets].sort((a, b) => a.ts - b.ts) : log;

  // Your dice style travels with the roll, so everyone sees your dice tumble.
  const rollDice = (expr, label) => {
    const hidden = isHost && secret;
    onSend('room:roll', { expr, label, style: shareableStyle(loadStyle()), secret: hidden }).then((res) => {
      if (res?.secret) setSecrets((list) => [...list, { id: `s${Date.now()}`, ts: Date.now(), type: 'secret', ...res.secret }]);
    });
  };
  const listRef = useRef(null);
  const stick = useRef(true);

  useEffect(() => {
    const el = listRef.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [entries.length]);

  const submit = (e) => {
    e.preventDefault();
    const t = text.trim();
    if (!t) return;
    const rollMatch = /^\/r(?:oll)?\s+(.+)$/i.exec(t);
    if (rollMatch) rollDice(rollMatch[1]);
    else onSend('room:chat', { text: t });
    setText('');
  };

  return (
    <div className="chronicle">
      <ol className="chronicle__list" ref={listRef}
        onScroll={(e) => { const el = e.currentTarget; stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40; }}>
        {entries.map((e) => <Entry key={e.id} e={e} />)}
      </ol>
      <div className="dice-bar">
        {DICE.map((d) => (
          <button key={d} onClick={() => rollDice(`1${d}`)} title={`Roll 1${d} ${isHost && secret ? 'in secret' : 'for the table'}`}>{d}</button>
        ))}
        {isHost && (
          <button className={`dice-bar__secret ${secret ? 'is-active' : ''}`} onClick={() => setSecret((v) => !v)} aria-pressed={secret}
            title="Secret rolls: only you see the result">
            <EyeOff size={13} /> Secret
          </button>
        )}
      </div>
      <form className="chronicle__input" onSubmit={submit}>
        <input value={text} maxLength={500} onChange={(e) => setText(e.target.value)} placeholder="Say something, or /r 2d6+3" aria-label="Chat message" />
        <button className="icon-btn" aria-label="Send"><Send size={16} /></button>
      </form>
    </div>
  );
}
