import { motion } from 'framer-motion';
import { Crosshair, Flag, Hourglass, Play, RotateCcw, SkipForward } from 'lucide-react';
import { fmtMod } from '@shared/rules.js';
import GameIcon from '../../components/GameIcon.jsx';
import Portrait from '../../components/Portrait.jsx';
import HpBar from '../../components/HpBar.jsx';

const KIND_ICON = { attack: 'broadsword', save: 'fireball', heal: 'heart-bottle', auto: 'wizard-staff' };

export function actionLabel(a) {
  if (a.kind === 'attack') return `${fmtMod(a.toHit)} · ${a.damage}`;
  if (a.kind === 'save') return `DC ${a.dc} ${a.save?.toUpperCase()} · ${a.damage}`;
  if (a.kind === 'heal') return `Heal ${a.damage}`;
  return `${a.damage} · auto`;
}

export default function ActionDock({ room, me, isHost, current, canControl, target, armed, mode, setMode, onAction, onSend }) {
  if (room.phase === 'lobby') {
    const party = room.combatants.filter((c) => c.side === 'party').length;
    const foes = room.combatants.filter((c) => c.side === 'foes').length;
    return (
      <div className="dock dock--lobby">
        <div className="dock__message">
          <GameIcon name="tavern-sign" size={30} />
          <div>
            <strong>The party gathers…</strong>
            <span>{party} hero{party === 1 ? '' : 'es'} vs {foes} foe{foes === 1 ? '' : 's'}. {isHost ? 'Summon combatants, then roll initiative when everyone is ready.' : 'Bring your heroes. The Dungeon Master will start the battle.'}</span>
          </div>
        </div>
        {isHost && (
          <button className="btn btn--gold btn--lg btn--pulse" disabled={room.combatants.length < 2} onClick={() => onSend('combat:start')}>
            <Play size={18} /> Roll initiative
          </button>
        )}
      </div>
    );
  }

  if (room.phase === 'ended') {
    return (
      <div className="dock dock--lobby">
        <div className="dock__message">
          <GameIcon name={room.outcome === 'defeat' ? 'skull-crossed-bones' : 'crowned-skull'} size={30} />
          <div>
            <strong>{room.outcome === 'victory' ? 'Victory is yours!' : room.outcome === 'defeat' ? 'The party has fallen.' : 'The battle is over.'}</strong>
            <span>{isHost ? 'Heal everyone for a rematch, or send everyone back to the lobby.' : 'Waiting for the Dungeon Master…'}</span>
          </div>
        </div>
        {isHost && (
          <div className="row">
            <button className="btn" onClick={() => onSend('combat:end')}><Flag size={16} /> Back to lobby</button>
            <button className="btn btn--gold" onClick={() => onSend('combat:rematch')}><RotateCcw size={16} /> Rematch</button>
          </div>
        )}
      </div>
    );
  }

  if (!current) return <div className="dock" />;
  const owner = room.players.find((p) => p.id === current.ownerId);

  if (!canControl) {
    return (
      <div className="dock dock--waiting">
        <Portrait src={current.image} icon={current.icon} color={current.color} className="dock__portrait" />
        <div className="dock__message">
          <Hourglass size={22} className="spin-slow" />
          <div>
            <strong>{current.name}’s turn</strong>
            <span>Controlled by {owner?.name ?? 'the Dungeon Master'}{owner && !owner.online ? ' (away)' : ''}…</span>
          </div>
        </div>
      </div>
    );
  }

  const down = current.status === 'down';
  return (
    <motion.div className="dock dock--active" key={current.id} initial={{ y: 30, opacity: 0 }} animate={{ y: 0, opacity: 1 }}>
      <div className="dock__who">
        <Portrait src={current.image} icon={current.icon} color={current.color} className="dock__portrait" />
        <div>
          <span className="dock__yours">{current.ownerId === me ? 'Your turn' : 'DM controls'}</span>
          <strong>{current.name}</strong>
          <HpBar hp={current.hp} max={current.maxHp} temp={current.tempHp} />
          <div className="pips" title="Attacks left this turn">
            {Array.from({ length: Math.max(current.attacksPerTurn, current.turn.attacksLeft) }, (_, i) => (
              <span key={i} className={i < current.turn.attacksLeft ? 'is-on' : ''} />
            ))}
            <em>{current.turn.attacksLeft} action{current.turn.attacksLeft === 1 ? '' : 's'} left</em>
          </div>
        </div>
      </div>

      {current.status === 'stable' ? (
        <div className="dock__death">
          <p>{current.name} is unconscious but stable. They’ll wake when healed.</p>
        </div>
      ) : down ? (
        <div className="dock__death">
          <p>{current.name} is dying. Roll a death saving throw: 10 or higher succeeds, a natural 20 brings them back.</p>
          <button className="btn btn--danger btn--lg" disabled={current.turn.deathSaveDone} onClick={() => onSend('combat:deathSave', { actorId: current.id })}>
            <GameIcon name="skull-crossed-bones" size={18} /> {current.turn.deathSaveDone ? 'Death save rolled' : 'Roll death save'}
          </button>
        </div>
      ) : (
        <div className="dock__actions">
          <div className="dock__target">
            <Crosshair size={14} />
            {armed ? <span className="blink">Choose a target for {current.actions[armed.index]?.name}…</span>
              : target ? <span>Target: <strong>{target.name}</strong> (AC {target.effectiveAc})</span>
                : <span>Click a token to choose a target</span>}
            <div className="segmented" role="radiogroup" aria-label="Roll mode">
              {[['dis', 'Disadv.'], ['normal', 'Normal'], ['adv', 'Advantage']].map(([k, l]) => (
                <button key={k} role="radio" aria-checked={mode === k} className={mode === k ? 'is-active' : ''} onClick={() => setMode(k)}>{l}</button>
              ))}
            </div>
          </div>
          <div className="action-row">
            {current.actions.map((a, i) => {
              const usesLeft = a.uses ? current.usesLeft[i] ?? 0 : null;
              const spent = (a.uses && usesLeft <= 0) || (a.recharge && !current.charged[i]);
              const disabled = current.turn.attacksLeft <= 0 || spent;
              return (
                <button key={i} className={`action-tile action-tile--${a.kind} ${armed?.index === i ? 'is-armed' : ''}`} disabled={disabled}
                  onClick={() => onAction(i)} title={a.desc || a.name}>
                  <GameIcon name={KIND_ICON[a.kind] ?? 'broadsword'} size={22} />
                  <strong>{a.name}</strong>
                  <span>{actionLabel(a)}</span>
                  {a.damageType && <small>{a.damageType}</small>}
                  {a.uses ? <em className="action-tile__uses">{usesLeft}/{a.uses}</em> : null}
                  {a.recharge ? <em className="action-tile__uses">{current.charged[i] ? 'ready' : `recharge ${a.recharge}+`}</em> : null}
                </button>
              );
            })}
            {current.kind === 'pc' && (
              <button className="action-tile action-tile--potion" disabled={current.turn.bonusUsed || current.potions <= 0}
                onClick={() => onSend('combat:potion', { actorId: current.id })} title="Bonus action: drink a potion of healing (2d4+2)">
                <GameIcon name="heart-bottle" size={22} />
                <strong>Potion</strong>
                <span>2d4+2 · bonus</span>
                <em className="action-tile__uses">{current.potions} left</em>
              </button>
            )}
          </div>
        </div>
      )}

      <button className="btn btn--gold dock__end" onClick={() => onSend('combat:endTurn')}
        disabled={down && !current.turn.deathSaveDone && !isHost}>
        End turn <SkipForward size={16} />
      </button>
    </motion.div>
  );
}
