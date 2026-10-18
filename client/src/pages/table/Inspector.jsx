import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeftRight, BookOpen, Heart, Shield, Swords, Trash2, Zap } from 'lucide-react';
import { ABILITIES, CONDITIONS, fmtMod, mod } from '@shared/rules.js';
import Modal from '../../components/Modal.jsx';
import Portrait from '../../components/Portrait.jsx';
import HpBar from '../../components/HpBar.jsx';
import { actionLabel } from './ActionDock.jsx';

export default function Inspector({ c, room, me, canControl, onSend, onClose }) {
  const [amount, setAmount] = useState('');
  const owner = room.players.find((p) => p.id === c.ownerId);
  const n = Math.abs(Math.round(Number(amount)));
  const adjust = (sign, temp = false) => {
    if (!n) return;
    onSend('combat:hp', { id: c.id, amount: sign * n, temp });
    setAmount('');
  };

  return (
    <Modal title={c.name} onClose={onClose} wide>
      <div className="inspector" style={{ '--accent': c.color }}>
        <div className="inspector__art">
          <Portrait src={c.image} icon={c.icon} color={c.color} shape="frame" alt={c.name} />
          {c.kind === 'monster' && (
            <Link className="btn btn--small btn--ghost" to={`/bestiary/${c.sourceId}`} target="_blank"><BookOpen size={14} /> Full stat block</Link>
          )}
          {c.kind === 'pc' && (c.premade || c.ownerId === me) && (
            <Link className="btn btn--small btn--ghost" to={`/heroes/${c.sourceId}`} target="_blank"><BookOpen size={14} /> Character sheet</Link>
          )}
        </div>
        <div className="inspector__body">
          <p className="muted">{c.subtitle} · {c.side === 'party' ? 'Ally' : 'Enemy'} · controlled by {owner?.name ?? 'someone who left'}</p>
          <div className="inspector__stats">
            <div><Shield size={16} /><strong>{c.effectiveAc}</strong><span>AC</span></div>
            <div><Heart size={16} /><strong>{c.hp}/{c.maxHp}</strong><span>HP</span></div>
            <div><Zap size={16} /><strong>{fmtMod(c.initBonus)}</strong><span>Init</span></div>
            <div><Swords size={16} /><strong>{c.attacksPerTurn}</strong><span>Attacks</span></div>
          </div>
          <HpBar hp={c.hp} max={c.maxHp} temp={c.tempHp} />

          <h3 className="inspector__h">Abilities {canControl && <span className="muted small">click to roll for the table</span>}</h3>
          <div className="inspector__abilities">
            {ABILITIES.map((a) => (
              <div key={a}>
                <span>{a.toUpperCase()} {c.abilities[a]}</span>
                <button disabled={!canControl} onClick={() => onSend('combat:check', { actorId: c.id, ability: a, type: 'check' })} title="Ability check">{fmtMod(mod(c.abilities[a]))}</button>
                <button disabled={!canControl} onClick={() => onSend('combat:check', { actorId: c.id, ability: a, type: 'save' })} title="Saving throw" className="is-save">save {fmtMod(c.saves[a])}</button>
              </div>
            ))}
          </div>

          <h3 className="inspector__h">Actions</h3>
          <ul className="inspector__actions">
            {c.actions.map((a, i) => (
              <li key={i}><strong>{a.name}</strong> <span>{actionLabel(a)} {a.damageType}</span>{a.desc && <p>{a.desc}</p>}</li>
            ))}
          </ul>

          <h3 className="inspector__h">Conditions</h3>
          <div className="chips">
            {CONDITIONS.map((x) => (
              <button key={x} disabled={!canControl} className={`chip cond--${x.toLowerCase()} ${c.conditions.includes(x) ? 'is-active' : ''}`}
                onClick={() => onSend('combat:condition', { id: c.id, condition: x })}>{x}</button>
            ))}
          </div>

          {canControl && (
            <>
              <h3 className="inspector__h">Hit points</h3>
              <div className="hp-adjust">
                <input type="number" min={1} max={999} value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Amount"
                  onKeyDown={(e) => e.key === 'Enter' && adjust(-1)} aria-label="Hit point amount" />
                <button className="btn btn--small btn--danger" disabled={!n} onClick={() => adjust(-1)}>Damage</button>
                <button className="btn btn--small btn--heal" disabled={!n} onClick={() => adjust(1)}>Heal</button>
                <button className="btn btn--small" disabled={!n} onClick={() => adjust(1, true)}>Temp HP</button>
              </div>
              <div className="row inspector__danger">
                <button className="btn btn--small btn--ghost" onClick={() => onSend('room:side', { id: c.id, side: c.side === 'party' ? 'foes' : 'party' })}>
                  <ArrowLeftRight size={14} /> Switch to {c.side === 'party' ? 'enemies' : 'party'}
                </button>
                <button className="btn btn--small btn--ghost btn--danger" onClick={() => { onSend('room:remove', { id: c.id }); onClose(); }}>
                  <Trash2 size={14} /> Remove from battle
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </Modal>
  );
}
