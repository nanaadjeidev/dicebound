export default function HpBar({ hp, max, temp = 0, compact = false }) {
  const pct = max ? Math.max(0, Math.min(100, (hp / max) * 100)) : 0;
  const tone = pct > 60 ? 'good' : pct > 30 ? 'hurt' : 'grave';
  return (
    <div className={`hpbar hpbar--${tone} ${compact ? 'hpbar--compact' : ''}`} title={`${hp} / ${max} HP`}>
      <div className="hpbar__trail" style={{ width: `${pct}%` }} />
      <div className="hpbar__fill" style={{ width: `${pct}%` }} />
      {temp > 0 && <div className="hpbar__temp" style={{ width: `${Math.min(100, (temp / max) * 100)}%` }} />}
      {!compact && <span className="hpbar__label">{hp}<small>/{max}</small>{temp > 0 && <em> +{temp}</em>}</span>}
    </div>
  );
}
