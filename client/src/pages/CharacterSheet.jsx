import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import {
  ChevronLeft, Footprints, Heart, HeartPulse, Minus, Plus, RotateCcw, Save, Shield, Sparkles, Trash2, UserPlus, Zap,
} from 'lucide-react';
import {
  ABILITIES, ABILITY_NAMES, ALIGNMENTS, BACKGROUNDS, CLASSES, RACES, SKILLS, attacksPerTurn, autoMaxHp,
  finalAbilities, fmtMod, mod, profBonus, resolveAction, saveBonuses, skillBonus, starterActions,
} from '@shared/rules.js';
import { newCharacter } from '@shared/schema.js';
import { isValidDice, withBonus } from '@shared/dice.js';
import { api } from '../api.js';
import { useToast } from '../components/Toasts.jsx';
import { useDice } from '../components/DiceTray.jsx';
import GameIcon from '../components/GameIcon.jsx';
import Portrait from '../components/Portrait.jsx';
import PortraitPicker from '../components/PortraitPicker.jsx';
import Modal from '../components/Modal.jsx';
import { recruit } from './Heroes.jsx';

const KIND_LABELS = { attack: 'Attack roll', save: 'Saving throw', heal: 'Healing', auto: 'Never misses', special: 'Description only' };
const sameActions = (a, b) => JSON.stringify(a.map(({ id, ...x }) => x)) === JSON.stringify(b.map(({ id, ...x }) => x));

function withDerived(next, prev) {
  if (!next.autoHp) return next;
  const maxHp = autoMaxHp(next);
  const hp = prev && prev.hp === prev.maxHp ? maxHp : Math.min(next.hp, maxHp);
  return { ...next, maxHp, hp };
}

export default function CharacterSheet() {
  const { id } = useParams();
  const isNew = id === 'new';
  const premade = id.startsWith('hero-');
  const navigate = useNavigate();
  const toast = useToast();
  const dice = useDice();
  const [c, setC] = useState(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [picker, setPicker] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    setDirty(false);
    if (isNew) return setC(newCharacter({ name: '', image: '/img/monsters/veteran.webp' }));
    setC(null);
    api(`/characters/${id}`).then(setC).catch((err) => { toast(err.message, 'error'); navigate('/heroes'); });
  }, [id, isNew, navigate, toast]);

  useEffect(() => {
    if (!dirty) return undefined;
    const warn = (e) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const update = (patch) => {
    if (premade) return;
    setDirty(true);
    setC((prev) => {
      let next = { ...prev, ...patch };
      // Keep class actions in step with class/level, unless the player has customised them.
      if ((patch.class || patch.level) && sameActions(prev.actions, starterActions(prev.class, prev.level))) {
        next.actions = starterActions(next.class, next.level);
      }
      if (patch.class && patch.class !== prev.class) {
        next = { ...next, ac: CLASSES[patch.class].ac, skills: [...CLASSES[patch.class].skills] };
      }
      if (patch.race && patch.race !== prev.race) next.speed = RACES[patch.race].speed;
      return withDerived(next, prev);
    });
  };

  const derived = useMemo(() => {
    if (!c) return null;
    return {
      abil: finalAbilities(c), pb: profBonus(c.level), saves: saveBonuses(c), apt: attacksPerTurn(c),
      customActions: !sameActions(c.actions, starterActions(c.class, c.level)),
    };
  }, [c]);

  if (!c) return <div className="page"><div className="sheet is-loading" /></div>;
  const cls = CLASSES[c.class];
  const race = RACES[c.race];
  const ro = premade;
  const rollCheck = (label, bonus) => dice.roll(`${c.name || 'Hero'} · ${label}`, withBonus('1d20', bonus));

  const save = async () => {
    setSaving(true);
    try {
      const saved = isNew
        ? await api('/characters', { method: 'POST', body: c })
        : await api(`/characters/${c.id}`, { method: 'PUT', body: c });
      setDirty(false);
      setC(saved);
      toast(`${saved.name} has been inscribed in the chronicles.`, 'success');
      if (isNew) navigate(`/heroes/${saved.id}`, { replace: true });
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    try {
      await api(`/characters/${c.id}`, { method: 'DELETE' });
      setDirty(false);
      toast(`${c.name} has retired from adventuring.`);
      navigate('/heroes');
    } catch (err) {
      toast(err.message, 'error');
    }
  };

  const doRecruit = async () => {
    try {
      const created = await recruit(c);
      toast(`${c.name} joins your roster!`, 'success');
      navigate(`/heroes/${created.id}`);
    } catch (err) {
      toast(err.message, 'error');
    }
  };

  const setAction = (i, patch) => update({ actions: c.actions.map((a, j) => (j === i ? { ...a, ...patch } : a)) });

  return (
    <div className="page page--sheet">
      <div className="sheet-bar">
        <Link to={premade ? '/heroes?tab=hall' : '/heroes'} className="btn btn--ghost"><ChevronLeft size={16} /> Heroes</Link>
        <div className="sheet-bar__actions">
          {premade ? (
            <>
              <span className="muted small">Legends can’t be edited. Recruit a copy to make it yours.</span>
              <button className="btn btn--gold" onClick={doRecruit}><UserPlus size={16} /> Recruit to my roster</button>
            </>
          ) : (
            <>
              {!isNew && <button className="btn btn--ghost btn--danger" onClick={() => setConfirmDelete(true)}><Trash2 size={16} /> Retire</button>}
              <button className="btn btn--gold" onClick={save} disabled={saving || (!dirty && !isNew)}>
                <Save size={16} /> {saving ? 'Saving…' : isNew ? 'Create hero' : dirty ? 'Save changes' : 'Saved'}
              </button>
            </>
          )}
        </div>
      </div>

      <article className="sheet" style={{ '--accent': cls.color }}>
        {/* ── Identity ─────────────────────────────────────────── */}
        <header className="sheet__head">
          <button className="sheet__portrait" onClick={() => !ro && setPicker(true)} disabled={ro} title={ro ? c.name : 'Change portrait'}>
            <Portrait src={c.image} icon={cls.icon} color={cls.color} shape="frame" alt={c.name} />
            {!ro && <span className="sheet__portrait-hint">Change portrait</span>}
          </button>
          <div className="sheet__identity">
            <input className="sheet__name" value={c.name} placeholder="Name your hero" maxLength={60} readOnly={ro}
              onChange={(e) => update({ name: e.target.value })} aria-label="Character name" />
            <div className="sheet__selects">
              <label className="field field--inline"><span>Race</span>
                <select value={c.race} disabled={ro} onChange={(e) => update({ race: e.target.value })}>
                  {Object.entries(RACES).map(([k, r]) => <option key={k} value={k}>{r.name}</option>)}
                </select>
              </label>
              <label className="field field--inline"><span>Class</span>
                <select value={c.class} disabled={ro} onChange={(e) => update({ class: e.target.value })}>
                  {Object.entries(CLASSES).map(([k, x]) => <option key={k} value={k}>{x.name}</option>)}
                </select>
              </label>
              <label className="field field--inline field--level"><span>Level</span>
                <select value={c.level} disabled={ro} onChange={(e) => update({ level: Number(e.target.value) })}>
                  {Array.from({ length: 20 }, (_, i) => <option key={i + 1} value={i + 1}>{i + 1}</option>)}
                </select>
              </label>
              <label className="field field--inline"><span>Background</span>
                <select value={c.background} disabled={ro} onChange={(e) => update({ background: e.target.value })}>
                  {[...new Set([c.background, ...BACKGROUNDS])].filter(Boolean).map((b) => <option key={b}>{b}</option>)}
                </select>
              </label>
              <label className="field field--inline"><span>Alignment</span>
                <select value={c.alignment} disabled={ro} onChange={(e) => update({ alignment: e.target.value })}>
                  {[...new Set([c.alignment, ...ALIGNMENTS])].filter(Boolean).map((a) => <option key={a}>{a}</option>)}
                </select>
              </label>
            </div>
            <p className="sheet__blurb"><GameIcon name={cls.icon} size={16} color={cls.color} /> {cls.blurb} <em>{race.traits}</em></p>
          </div>
        </header>

        {/* ── Vitals ───────────────────────────────────────────── */}
        <section className="vitals">
          <div className="vital vital--ac">
            <Shield className="vital__bg" />
            <span className="vital__label">Armour Class</span>
            <input type="number" className="vital__value" value={c.ac} min={1} max={30} readOnly={ro}
              onChange={(e) => update({ ac: Number(e.target.value) })} aria-label="Armour class" />
          </div>
          <div className="vital vital--hp">
            <Heart className="vital__bg" />
            <span className="vital__label">Hit Points</span>
            <div className="vital__hp">
              {!ro && <button className="icon-btn" onClick={() => update({ hp: Math.max(0, c.hp - 1) })} aria-label="Lose 1 HP"><Minus size={14} /></button>}
              <span className="vital__value">{c.hp}<small>/{c.maxHp}</small></span>
              {!ro && <button className="icon-btn" onClick={() => update({ hp: Math.min(c.maxHp, c.hp + 1) })} aria-label="Gain 1 HP"><Plus size={14} /></button>}
            </div>
            {!ro && (
              <div className="vital__sub">
                <button className="link-btn" onClick={() => update({ hp: c.maxHp })}><HeartPulse size={12} /> Long rest</button>
                <label className="toggle-inline">
                  <input type="checkbox" checked={c.autoHp} onChange={(e) => update({ autoHp: e.target.checked })} /> auto max
                </label>
                {!c.autoHp && (
                  <input type="number" className="mini-input" value={c.maxHp} min={1} max={999} aria-label="Maximum HP"
                    onChange={(e) => update({ maxHp: Number(e.target.value), hp: Math.min(c.hp, Number(e.target.value)) })} />
                )}
              </div>
            )}
          </div>
          <button className="vital vital--roll" onClick={() => rollCheck('Initiative', mod(derived.abil.dex))}>
            <Zap className="vital__bg" />
            <span className="vital__label">Initiative</span>
            <span className="vital__value">{fmtMod(mod(derived.abil.dex))}</span>
          </button>
          <div className="vital">
            <Footprints className="vital__bg" />
            <span className="vital__label">Speed</span>
            <span className="vital__value">{c.speed}<small> ft</small></span>
          </div>
          <div className="vital">
            <Sparkles className="vital__bg" />
            <span className="vital__label">Proficiency</span>
            <span className="vital__value">{fmtMod(derived.pb)}</span>
          </div>
          <div className="vital">
            <GameIcon name="heart-bottle" size={60} className="vital__bg" />
            <span className="vital__label">Potions</span>
            <div className="vital__hp">
              {!ro && <button className="icon-btn" onClick={() => update({ potions: Math.max(0, c.potions - 1) })} aria-label="Remove potion"><Minus size={14} /></button>}
              <span className="vital__value">{c.potions}</span>
              {!ro && <button className="icon-btn" onClick={() => update({ potions: Math.min(20, c.potions + 1) })} aria-label="Add potion"><Plus size={14} /></button>}
            </div>
          </div>
        </section>

        <div className="sheet__cols">
          {/* ── Abilities ─────────────────────────────────────── */}
          <section className="sheet__col">
            <h2 className="sheet__section">Ability Scores</h2>
            <div className="abilities">
              {ABILITIES.map((a) => {
                const bonus = race.bonus[a] ?? 0;
                const m = mod(derived.abil[a]);
                return (
                  <div key={a} className={`ability ${cls.primary === a ? 'is-primary' : ''}`}>
                    <span className="ability__name">{ABILITY_NAMES[a]}</span>
                    <button className="ability__mod" onClick={() => rollCheck(`${ABILITY_NAMES[a]} check`, m)} title="Roll a check">
                      {fmtMod(m)}
                    </button>
                    <div className="ability__score">
                      <input type="number" min={1} max={30} value={c.abilities[a]} readOnly={ro} aria-label={`${ABILITY_NAMES[a]} base score`}
                        onChange={(e) => update({ abilities: { ...c.abilities, [a]: Number(e.target.value) } })} />
                      {bonus > 0 && <span className="ability__race" title={`${race.name} bonus`}>+{bonus} = {derived.abil[a]}</span>}
                    </div>
                  </div>
                );
              })}
            </div>

            <h2 className="sheet__section">Saving Throws</h2>
            <ul className="checklist">
              {ABILITIES.map((a) => (
                <li key={a}>
                  <span className={`dot ${cls.saves.includes(a) ? 'is-on' : ''}`} />
                  <button className="checklist__roll" onClick={() => rollCheck(`${ABILITY_NAMES[a]} save`, derived.saves[a])}>
                    <strong>{fmtMod(derived.saves[a])}</strong> {ABILITY_NAMES[a]}
                  </button>
                </li>
              ))}
            </ul>
          </section>

          {/* ── Skills ────────────────────────────────────────── */}
          <section className="sheet__col">
            <h2 className="sheet__section">Skills <span className="muted small">click the gem to train</span></h2>
            <ul className="checklist checklist--skills">
              {SKILLS.map((s) => {
                const on = c.skills.includes(s.key);
                const b = skillBonus(c, s);
                return (
                  <li key={s.key}>
                    <button className={`dot dot--btn ${on ? 'is-on' : ''}`} disabled={ro} aria-pressed={on} aria-label={`Proficient in ${s.name}`}
                      onClick={() => update({ skills: on ? c.skills.filter((k) => k !== s.key) : [...c.skills, s.key] })} />
                    <button className="checklist__roll" onClick={() => rollCheck(s.name, b)}>
                      <strong>{fmtMod(b)}</strong> {s.name} <small>{s.ability}</small>
                    </button>
                  </li>
                );
              })}
            </ul>
            <div className="passive">Passive Perception <strong>{10 + skillBonus(c, SKILLS.find((s) => s.key === 'perception'))}</strong></div>
          </section>

          {/* ── Actions ───────────────────────────────────────── */}
          <section className="sheet__col sheet__col--wide">
            <h2 className="sheet__section">
              Attacks &amp; Spells
              <span className="muted small">{derived.apt > 1 ? `${derived.apt} attacks per turn` : '1 attack per turn'}</span>
            </h2>
            <div className="actions-list">
              {c.actions.map((a, i) => (
                <ActionCard key={a.id ?? i} action={a} resolved={isValidDice(a.damage) ? resolveAction(c, a) : null} ro={ro}
                  onChange={(patch) => setAction(i, patch)}
                  onRemove={() => update({ actions: c.actions.filter((_, j) => j !== i) })}
                  onRoll={(r) => {
                    if (r.kind === 'attack') rollCheck(`${a.name} to hit`, r.toHit);
                    setTimeout(() => dice.roll(`${a.name} ${r.kind === 'heal' ? 'healing' : 'damage'}`, r.damage), r.kind === 'attack' ? 900 : 0);
                  }} />
              ))}
            </div>
            {!ro && (
              <div className="row">
                <button className="btn btn--small" disabled={c.actions.length >= 16}
                  onClick={() => update({ actions: [...c.actions, { id: `a${Date.now()}`, name: 'New attack', kind: 'attack', ability: cls.primary, proficient: true, addMod: true, bonus: 0, damage: '1d6', damageType: 'slashing' }] })}>
                  <Plus size={14} /> Add attack or spell
                </button>
                {derived.customActions && (
                  <button className="btn btn--small btn--ghost" onClick={() => update({ actions: starterActions(c.class, c.level) })}>
                    <RotateCcw size={14} /> Reset to {cls.name} defaults
                  </button>
                )}
              </div>
            )}

            <div className="sheet__notes">
              <label className="field"><span>Equipment</span>
                <textarea rows={3} value={c.equipment} readOnly={ro} placeholder="Chain mail, shield, explorer’s pack…" onChange={(e) => update({ equipment: e.target.value })} />
              </label>
              <label className="field"><span>Features &amp; traits</span>
                <textarea rows={3} value={c.traits} readOnly={ro} placeholder="Fighting style, feats, spells known…" onChange={(e) => update({ traits: e.target.value })} />
              </label>
              <label className="field"><span>Backstory &amp; notes</span>
                <textarea rows={4} value={c.notes} readOnly={ro} placeholder="Where do they come from? What do they fear?" onChange={(e) => update({ notes: e.target.value })} />
              </label>
            </div>
          </section>
        </div>
      </article>

      <AnimatePresence>
        {picker && <PortraitPicker current={c.image} onClose={() => setPicker(false)} onPick={(image) => { update({ image }); setPicker(false); }} />}
        {confirmDelete && (
          <Modal title={`Retire ${c.name}?`} onClose={() => setConfirmDelete(false)}
            footer={<>
              <button className="btn btn--ghost" onClick={() => setConfirmDelete(false)}>Keep adventuring</button>
              <button className="btn btn--danger" onClick={remove}><Trash2 size={16} /> Retire forever</button>
            </>}>
            <p>This deletes the character sheet permanently.</p>
          </Modal>
        )}
      </AnimatePresence>
    </div>
  );
}

function ActionCard({ action: a, resolved, ro, onChange, onRemove, onRoll }) {
  const [open, setOpen] = useState(false);
  const badDice = a.damage && !isValidDice(a.damage);
  const summary = !resolved ? 'Needs damage dice'
    : resolved.kind === 'attack' ? `${fmtMod(resolved.toHit)} to hit · ${resolved.damage} ${resolved.damageType}`
      : resolved.kind === 'save' ? `DC ${resolved.dc} ${resolved.save.toUpperCase()} · ${resolved.damage} ${resolved.damageType}${resolved.halfOnSave ? ' (half on save)' : ''}`
        : resolved.kind === 'heal' ? `Heals ${resolved.damage}${a.self ? ' (self)' : ''}`
          : `Auto-hit · ${resolved.damage} ${resolved.damageType}`;
  const icon = a.kind === 'heal' ? 'heart-bottle' : a.kind === 'save' ? 'fireball' : a.kind === 'auto' ? 'wizard-staff' : 'broadsword';
  return (
    <div className={`action-card action-card--${a.kind} ${open ? 'is-open' : ''}`}>
      <div className="action-card__row">
        <GameIcon name={icon} size={22} className="action-card__icon" />
        <div className="action-card__text">
          <strong>{a.name}</strong>
          <span>{summary}{a.uses ? ` · ${a.uses}/battle` : ''}{a.range ? ` · ${a.range}` : ''}</span>
        </div>
        {resolved && <button className="btn btn--small" onClick={() => onRoll(resolved)}>Roll</button>}
        {!ro && <button className="btn btn--small btn--ghost" onClick={() => setOpen(!open)}>{open ? 'Done' : 'Edit'}</button>}
      </div>
      {open && !ro && (
        <div className="action-card__edit">
          <label className="field"><span>Name</span><input value={a.name} maxLength={60} onChange={(e) => onChange({ name: e.target.value })} /></label>
          <label className="field"><span>Type</span>
            <select value={a.kind} onChange={(e) => onChange({ kind: e.target.value })}>
              {Object.entries(KIND_LABELS).filter(([k]) => k !== 'special').map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
          </label>
          <label className="field"><span>Ability</span>
            <select value={a.ability} onChange={(e) => onChange({ ability: e.target.value })}>
              {ABILITIES.map((x) => <option key={x} value={x}>{ABILITY_NAMES[x]}</option>)}
              <option value="none">None</option>
            </select>
          </label>
          <label className={`field ${badDice ? 'has-error' : ''}`}><span>Dice</span>
            <input value={a.damage} placeholder="1d8" maxLength={40} onChange={(e) => onChange({ damage: e.target.value.replace(/\s/g, '') })} />
          </label>
          {a.kind !== 'heal' && (
            <label className="field"><span>Damage type</span><input value={a.damageType} maxLength={40} onChange={(e) => onChange({ damageType: e.target.value })} /></label>
          )}
          {a.kind === 'save' && (
            <label className="field"><span>Target saves with</span>
              <select value={a.save ?? 'dex'} onChange={(e) => onChange({ save: e.target.value })}>
                {ABILITIES.map((x) => <option key={x} value={x}>{ABILITY_NAMES[x]}</option>)}
              </select>
            </label>
          )}
          <label className="field"><span>Magic bonus</span><input type="number" min={-10} max={10} value={a.bonus ?? 0} onChange={(e) => onChange({ bonus: Number(e.target.value) })} /></label>
          <label className="field"><span>Uses per battle</span><input type="number" min={0} max={20} value={a.uses ?? 0} placeholder="∞" onChange={(e) => onChange({ uses: Number(e.target.value) || undefined })} /></label>
          <div className="action-card__checks">
            <label><input type="checkbox" checked={!!a.addMod} onChange={(e) => onChange({ addMod: e.target.checked })} /> Add ability modifier to {a.kind === 'heal' ? 'healing' : 'damage'}</label>
            {a.kind === 'attack' && <label><input type="checkbox" checked={a.proficient !== false} onChange={(e) => onChange({ proficient: e.target.checked })} /> Proficient</label>}
            {a.kind === 'save' && <label><input type="checkbox" checked={!!a.halfOnSave} onChange={(e) => onChange({ halfOnSave: e.target.checked })} /> Half damage on a successful save</label>}
            {a.kind === 'heal' && <label><input type="checkbox" checked={!!a.self} onChange={(e) => onChange({ self: e.target.checked })} /> Self only</label>}
          </div>
          <button className="btn btn--small btn--ghost btn--danger" onClick={onRemove}><Trash2 size={14} /> Remove</button>
        </div>
      )}
    </div>
  );
}
