import { AnimatePresence, motion } from 'framer-motion';
import { MoreHorizontal, Shield } from 'lucide-react';
import Portrait from '../../components/Portrait.jsx';
import HpBar from '../../components/HpBar.jsx';
import GameIcon from '../../components/GameIcon.jsx';

const SIZE_SCALE = { Tiny: 0.8, Small: 0.9, Medium: 1, Large: 1.12, Huge: 1.25, Gargantuan: 1.38 };

export default function Token({ c, isTurn, isTarget, armed, mine, ownerColor, impact, floaters, onSelect, onInspect }) {
  const dead = c.status === 'dead';
  return (
    <motion.div
      layout
      className={[
        'token', `token--${c.side}`, `token--${c.status}`,
        isTurn && 'is-turn', isTarget && 'is-target', armed && !dead && 'is-armable', impact && `fx-${impact}`, mine && 'is-mine',
      ].filter(Boolean).join(' ')}
      style={{ '--accent': c.color, '--scale': SIZE_SCALE[c.size] ?? 1, '--owner': ownerColor }}
      initial={{ opacity: 0, scale: 0.4, y: 30 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.6, filter: 'blur(6px)' }}
      transition={{ type: 'spring', damping: 18, stiffness: 220 }}
    >
      <button className="token__hit" onClick={() => onSelect(c)} aria-label={`${c.name}, ${c.hp} of ${c.maxHp} hit points`} />
      {isTurn && <span className="token__turn-marker" aria-hidden="true" />}
      <div className="token__frame">
        <Portrait src={c.image} icon={c.icon} color={c.color} alt="" />
        <div className="token__ring" />
        {dead && <div className="token__dead"><GameIcon name="skull-crossed-bones" size="46%" color="#f5e9d0" /></div>}
        {c.status === 'down' && (
          <div className="token__dying" title="Death saves">
            <span>{'●'.repeat(c.deathSaves.success)}{'○'.repeat(3 - c.deathSaves.success)}</span>
            <span className="fail">{'●'.repeat(Math.min(3, c.deathSaves.fail))}{'○'.repeat(Math.max(0, 3 - c.deathSaves.fail))}</span>
          </div>
        )}
        {c.status === 'stable' && <div className="token__dying"><span>Stable</span></div>}
        {c.initiative !== null && <span className="token__init" title="Initiative">{c.initiative}</span>}
        <span className="token__ac" title="Armour class"><Shield size={12} />{c.effectiveAc}</span>
        <AnimatePresence>
          {floaters.map((f) => (
            <motion.span key={f.id} className={`floater floater--${f.kind}`}
              initial={{ opacity: 0, y: 10, scale: 0.6 }}
              animate={{ opacity: [0, 1, 1, 0], y: -64, scale: f.crit ? 1.5 : 1.1 }}
              transition={{ duration: 1.5, times: [0, 0.15, 0.7, 1], ease: 'easeOut' }}>
              {f.text}
            </motion.span>
          ))}
        </AnimatePresence>
        {impact === 'crit' && <span className="slash" aria-hidden="true" />}
      </div>
      <div className="token__plate">
        <strong title={c.name}>{c.name}</strong>
        <HpBar hp={c.hp} max={c.maxHp} temp={c.tempHp} compact />
        <span className="token__hp">{c.hp}<small>/{c.maxHp}</small>{c.tempHp > 0 && <em> +{c.tempHp}</em>}</span>
      </div>
      {c.conditions.length > 0 && (
        <div className="token__conditions">
          {c.conditions.map((x) => <span key={x} className={`cond cond--${x.toLowerCase()}`}>{x}</span>)}
        </div>
      )}
      <button className="token__more" onClick={() => onInspect(c)} aria-label={`Inspect ${c.name}`}><MoreHorizontal size={14} /></button>
    </motion.div>
  );
}
