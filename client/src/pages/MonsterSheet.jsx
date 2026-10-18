import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import { ChevronLeft, Copy, Dices, Pencil, Plus, Save, Trash2, X } from 'lucide-react';
import { ABILITIES, ABILITY_NAMES, fmtMod, mod } from '@shared/rules.js';
import { average, isValidDice, withBonus } from '@shared/dice.js';
import { newMonster } from '@shared/schema.js';
import { api } from '../api.js';
import { useToast } from '../components/Toasts.jsx';
import { useDice } from '../components/DiceTray.jsx';
import Portrait from '../components/Portrait.jsx';
import PortraitPicker from '../components/PortraitPicker.jsx';
import Modal from '../components/Modal.jsx';

const SIZES = ['Tiny', 'Small', 'Medium', 'Large', 'Huge', 'Gargantuan'];
const TYPES = ['aberration', 'beast', 'celestial', 'construct', 'dragon', 'elemental', 'fey', 'fiend', 'giant', 'humanoid', 'monstrosity', 'ooze', 'plant', 'undead', 'swarm'];
const ICONS = ['claw', 'dragon', 'skull', 'eye', 'flame', 'paw', 'horns', 'leaf', 'user', 'droplet', 'mountain', 'cog', 'sun', 'bug'];

export default function MonsterSheet() {
  const { id } = useParams();
  const isNew = id === 'new';
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToast();
  const [m, setM] = useState(null);
  const [editing, setEditing] = useState(isNew);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    setEditing(isNew || !!location.state?.edit);
    if (isNew) return setM(newMonster({ name: '' }));
    setM(null);
    api(`/monsters/${id}`).then(setM).catch((err) => { toast(err.message, 'error'); navigate('/bestiary'); });
  }, [id, isNew, navigate, toast, location.state]);

  if (!m) return <div className="page"><div className="statblock-layout is-loading" /></div>;

  const duplicate = async () => {
    try {
      const { id: _id, builtin, ownerId, ...copy } = m;
      const created = await api('/monsters', { method: 'POST', body: { ...copy, name: `${m.name} (Variant)` } });
      toast('A new variant crawls into existence. Make it your own!', 'success');
      navigate(`/bestiary/${created.id}`, { state: { edit: true } });
    } catch (err) {
      toast(err.message, 'error');
    }
  };

  const save = async (draft) => {
    try {
      const saved = isNew
        ? await api('/monsters', { method: 'POST', body: draft })
        : await api(`/monsters/${m.id}`, { method: 'PUT', body: draft });
      setM(saved);
      setEditing(false);
      toast(`${saved.name} added to your bestiary.`, 'success');
      if (isNew) navigate(`/bestiary/${saved.id}`, { replace: true });
    } catch (err) {
      toast(err.message, 'error');
    }
  };

  const remove = async () => {
    await api(`/monsters/${m.id}`, { method: 'DELETE' }).catch((err) => toast(err.message, 'error'));
    navigate('/bestiary?tab=mine');
  };

  return (
    <div className="page page--sheet">
      <div className="sheet-bar">
        <Link to={m.builtin ? '/bestiary' : '/bestiary?tab=mine'} className="btn btn--ghost"><ChevronLeft size={16} /> Bestiary</Link>
        {!editing && (
          <div className="sheet-bar__actions">
            {m.builtin ? (
              <button className="btn btn--gold" onClick={duplicate}><Copy size={16} /> Duplicate &amp; customise</button>
            ) : (
              <>
                <button className="btn btn--ghost btn--danger" onClick={() => setConfirmDelete(true)}><Trash2 size={16} /> Delete</button>
                <button className="btn btn--gold" onClick={() => setEditing(true)}><Pencil size={16} /> Edit</button>
              </>
            )}
          </div>
        )}
      </div>

      {editing ? (
        <MonsterEditor initial={m} onSave={save} onCancel={() => (isNew ? navigate('/bestiary') : setEditing(false))} />
      ) : (
        <div className="statblock-layout" style={{ '--accent': m.color }}>
          <aside className="statblock-art">
            <Portrait src={m.image} icon={m.icon} color={m.color} shape="frame" alt={m.name} />
            <div className="statblock-art__caption">
              <span className="cr-badge cr-badge--lg">CR {m.cr}</span>
              <span>{m.xp?.toLocaleString()} XP</span>
            </div>
          </aside>
          <StatBlock m={m} />
        </div>
      )}

      <AnimatePresence>
        {confirmDelete && (
          <Modal title={`Banish ${m.name}?`} onClose={() => setConfirmDelete(false)}
            footer={<>
              <button className="btn btn--ghost" onClick={() => setConfirmDelete(false)}>Keep it</button>
              <button className="btn btn--danger" onClick={remove}><Trash2 size={16} /> Banish</button>
            </>}>
            <p>This permanently deletes your custom monster.</p>
          </Modal>
        )}
      </AnimatePresence>
    </div>
  );
}

export function StatBlock({ m, compact = false }) {
  const dice = useDice();
  const rollAction = (a) => {
    if (a.kind === 'attack') {
      dice.roll(`${m.name} · ${a.name} to hit`, withBonus('1d20', a.toHit));
      setTimeout(() => dice.roll(`${m.name} · ${a.name} damage`, a.damage), 900);
    } else {
      dice.roll(`${m.name} · ${a.name}`, a.damage);
    }
  };
  const props = [
    ['Saving Throws', Object.entries(m.saves ?? {}).map(([k, v]) => `${ABILITY_NAMES[k].slice(0, 3)} ${fmtMod(v)}`).join(', ')],
    ['Skills', m.skills],
    ['Damage Vulnerabilities', m.vulnerabilities],
    ['Damage Resistances', m.resistances],
    ['Immunities', m.immunities],
    ['Senses', m.senses],
    ['Languages', m.languages],
  ].filter(([, v]) => v);

  return (
    <article className={`statblock ${compact ? 'statblock--compact' : ''}`}>
      <h1 className="statblock__name">{m.name}</h1>
      <p className="statblock__meta">{m.size} {m.type}{m.subtype ? ` (${m.subtype})` : ''}{m.alignment ? `, ${m.alignment}` : ''}</p>
      <hr className="statblock__rule" />
      <p><strong>Armour Class</strong> {m.ac}{m.acNote ? ` (${m.acNote})` : ''}</p>
      <p><strong>Hit Points</strong> {m.hp}{m.hitDice ? ` (${m.hitDice})` : ''}</p>
      <p><strong>Speed</strong> {m.speed}</p>
      <hr className="statblock__rule" />
      <div className="statblock__abilities">
        {ABILITIES.map((a) => (
          <button key={a} onClick={() => dice.roll(`${m.name} · ${ABILITY_NAMES[a]}`, withBonus('1d20', mod(m.abilities[a])))} title={`Roll ${ABILITY_NAMES[a]}`}>
            <strong>{a.toUpperCase()}</strong>
            <span>{m.abilities[a]} ({fmtMod(mod(m.abilities[a]))})</span>
          </button>
        ))}
      </div>
      <hr className="statblock__rule" />
      {props.map(([k, v]) => <p key={k}><strong>{k}</strong> {v}</p>)}
      <p><strong>Challenge</strong> {m.cr} ({m.xp?.toLocaleString() ?? 0} XP)</p>
      <hr className="statblock__rule" />
      {m.traits?.map((t) => <p key={t.name} className="statblock__entry"><em><strong>{t.name}.</strong></em> {t.desc}</p>)}
      <h2 className="statblock__heading">Actions</h2>
      {m.multiattack && <p className="statblock__entry"><em><strong>Multiattack.</strong></em> {m.multiattack}</p>}
      {m.actions?.map((a, i) => (
        <div key={i} className="statblock__entry statblock__action">
          <p>
            <em><strong>{a.name}{a.recharge ? ` (Recharge ${a.recharge === 6 ? 6 : `${a.recharge}–6`})` : ''}{a.uses ? ` (${a.uses}/Day)` : ''}.</strong></em>{' '}
            {a.desc || describeAction(a)}
          </p>
          {a.kind !== 'special' && a.damage && (
            <button className="roll-chip" onClick={() => rollAction(a)}>
              <Dices size={13} /> {a.kind === 'attack' ? `${fmtMod(a.toHit)} · ` : a.kind === 'save' ? `DC ${a.dc} · ` : ''}{a.damage}
            </button>
          )}
        </div>
      ))}
      {m.legendary?.length > 0 && (
        <>
          <h2 className="statblock__heading">Legendary Actions</h2>
          {m.legendary.map((l) => <p key={l.name} className="statblock__entry"><em><strong>{l.name}.</strong></em> {l.desc}</p>)}
        </>
      )}
    </article>
  );
}

function describeAction(a) {
  if (a.kind === 'attack') return `Attack: ${fmtMod(a.toHit)} to hit. Hit: ${average(a.damage)} (${a.damage}) ${a.damageType} damage.`;
  if (a.kind === 'save') return `DC ${a.dc} ${ABILITY_NAMES[a.save]} saving throw. ${average(a.damage)} (${a.damage}) ${a.damageType} damage on a failure${a.halfOnSave ? ', half as much on a success' : ''}.`;
  return '';
}

// ── Editor ──────────────────────────────────────────────────────────────────
function MonsterEditor({ initial, onSave, onCancel }) {
  const [d, setD] = useState(initial);
  const [picker, setPicker] = useState(false);
  const [saving, setSaving] = useState(false);
  const set = (patch) => setD((x) => ({ ...x, ...patch }));
  const setList = (key, i, patch) => set({ [key]: d[key].map((x, j) => (j === i ? { ...x, ...patch } : x)) });
  const dropFrom = (key, i) => set({ [key]: d[key].filter((_, j) => j !== i) });

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    await onSave(d);
    setSaving(false);
  };

  return (
    <form className="monster-editor" onSubmit={submit} style={{ '--accent': d.color }}>
      <div className="monster-editor__main">
        <section className="panel">
          <h2 className="panel__title">Identity</h2>
          <div className="form-grid">
            <label className="field field--span2"><span>Name</span><input required value={d.name} maxLength={60} placeholder="The Gloomfang Horror" onChange={(e) => set({ name: e.target.value })} /></label>
            <label className="field"><span>Size</span><select value={d.size} onChange={(e) => set({ size: e.target.value })}>{SIZES.map((s) => <option key={s}>{s}</option>)}</select></label>
            <label className="field"><span>Type</span><select value={d.type} onChange={(e) => set({ type: e.target.value })}>{[...new Set([d.type, ...TYPES])].map((t) => <option key={t}>{t}</option>)}</select></label>
            <label className="field"><span>Alignment</span><input value={d.alignment} maxLength={40} onChange={(e) => set({ alignment: e.target.value })} /></label>
            <label className="field"><span>Challenge</span><input value={d.cr} maxLength={6} onChange={(e) => set({ cr: e.target.value })} /></label>
            <label className="field"><span>XP</span><input type="number" min={0} value={d.xp} onChange={(e) => set({ xp: Number(e.target.value) })} /></label>
            <label className="field"><span>Token colour</span><input type="color" value={d.color} onChange={(e) => set({ color: e.target.value })} /></label>
            <label className="field"><span>Fallback icon</span><select value={d.icon} onChange={(e) => set({ icon: e.target.value })}>{ICONS.map((i) => <option key={i}>{i}</option>)}</select></label>
          </div>
        </section>

        <section className="panel">
          <h2 className="panel__title">Defences</h2>
          <div className="form-grid">
            <label className="field"><span>Armour Class</span><input type="number" min={1} max={30} value={d.ac} onChange={(e) => set({ ac: Number(e.target.value) })} /></label>
            <label className="field"><span>Armour note</span><input value={d.acNote} maxLength={60} onChange={(e) => set({ acNote: e.target.value })} /></label>
            <label className="field"><span>Hit Points</span><input type="number" min={1} max={999} value={d.hp} onChange={(e) => set({ hp: Number(e.target.value) })} /></label>
            <label className={`field ${d.hitDice && !isValidDice(d.hitDice) ? 'has-error' : ''}`}><span>Hit Dice</span>
              <div className="input-with-btn">
                <input value={d.hitDice} maxLength={30} placeholder="4d8+12" onChange={(e) => set({ hitDice: e.target.value.replace(/\s/g, '') })} />
                <button type="button" className="icon-btn" title="Use average" disabled={!isValidDice(d.hitDice)} onClick={() => set({ hp: Math.max(1, average(d.hitDice)) })}>=</button>
              </div>
            </label>
            <label className="field field--span2"><span>Speed</span><input value={d.speed} maxLength={80} onChange={(e) => set({ speed: e.target.value })} /></label>
            <label className="field field--span2"><span>Resistances</span><input value={d.resistances} onChange={(e) => set({ resistances: e.target.value })} /></label>
            <label className="field field--span2"><span>Immunities</span><input value={d.immunities} onChange={(e) => set({ immunities: e.target.value })} /></label>
            <label className="field field--span2"><span>Vulnerabilities</span><input value={d.vulnerabilities} onChange={(e) => set({ vulnerabilities: e.target.value })} /></label>
          </div>
        </section>

        <section className="panel">
          <h2 className="panel__title">Abilities &amp; senses</h2>
          <div className="ability-edit">
            {ABILITIES.map((a) => (
              <label key={a} className="ability-edit__cell">
                <span>{a.toUpperCase()}</span>
                <input type="number" min={1} max={30} value={d.abilities[a]} onChange={(e) => set({ abilities: { ...d.abilities, [a]: Number(e.target.value) } })} />
                <small>{fmtMod(mod(d.abilities[a]))}</small>
                <input type="number" min={-5} max={20} placeholder="save" title="Saving throw bonus override" value={d.saves?.[a] ?? ''}
                  onChange={(e) => {
                    const saves = { ...d.saves };
                    if (e.target.value === '') delete saves[a]; else saves[a] = Number(e.target.value);
                    set({ saves });
                  }} />
              </label>
            ))}
          </div>
          <div className="form-grid">
            <label className="field field--span2"><span>Skills</span><input value={d.skills} placeholder="Perception +5, Stealth +4" onChange={(e) => set({ skills: e.target.value })} /></label>
            <label className="field field--span2"><span>Senses</span><input value={d.senses} onChange={(e) => set({ senses: e.target.value })} /></label>
            <label className="field field--span2"><span>Languages</span><input value={d.languages} onChange={(e) => set({ languages: e.target.value })} /></label>
          </div>
        </section>

        <section className="panel">
          <h2 className="panel__title">Traits</h2>
          {d.traits.map((t, i) => (
            <div key={i} className="list-edit">
              <input value={t.name} placeholder="Trait name" onChange={(e) => setList('traits', i, { name: e.target.value })} />
              <textarea rows={2} value={t.desc} placeholder="What it does" onChange={(e) => setList('traits', i, { desc: e.target.value })} />
              <button type="button" className="icon-btn" onClick={() => dropFrom('traits', i)} aria-label="Remove trait"><X size={16} /></button>
            </div>
          ))}
          <button type="button" className="btn btn--small" onClick={() => set({ traits: [...d.traits, { name: '', desc: '' }] })}><Plus size={14} /> Add trait</button>
        </section>

        <section className="panel">
          <h2 className="panel__title">Actions</h2>
          <div className="form-grid">
            <label className="field"><span>Attacks per turn</span><input type="number" min={1} max={6} value={d.attacksPerTurn} onChange={(e) => set({ attacksPerTurn: Number(e.target.value) })} /></label>
            <label className="field field--span3"><span>Multiattack text</span><input value={d.multiattack} placeholder="The beast makes two attacks: one with its bite and one with its claws." onChange={(e) => set({ multiattack: e.target.value })} /></label>
          </div>
          {d.actions.map((a, i) => (
            <div key={i} className="monster-action-edit">
              <div className="form-grid">
                <label className="field field--span2"><span>Name</span><input value={a.name} onChange={(e) => setList('actions', i, { name: e.target.value })} /></label>
                <label className="field"><span>Type</span>
                  <select value={a.kind} onChange={(e) => setList('actions', i, { kind: e.target.value })}>
                    <option value="attack">Attack roll</option><option value="save">Saving throw</option>
                    <option value="auto">Never misses</option><option value="heal">Healing</option><option value="special">Description only</option>
                  </select>
                </label>
                {a.kind === 'attack' && <label className="field"><span>To hit</span><input type="number" min={-5} max={30} value={a.toHit ?? 0} onChange={(e) => setList('actions', i, { toHit: Number(e.target.value) })} /></label>}
                {a.kind === 'save' && (
                  <>
                    <label className="field"><span>DC</span><input type="number" min={1} max={35} value={a.dc ?? 13} onChange={(e) => setList('actions', i, { dc: Number(e.target.value) })} /></label>
                    <label className="field"><span>Save</span><select value={a.save ?? 'dex'} onChange={(e) => setList('actions', i, { save: e.target.value })}>{ABILITIES.map((x) => <option key={x} value={x}>{ABILITY_NAMES[x]}</option>)}</select></label>
                    <label className="field field--check"><input type="checkbox" checked={!!a.halfOnSave} onChange={(e) => setList('actions', i, { halfOnSave: e.target.checked })} /> Half on save</label>
                  </>
                )}
                {a.kind !== 'special' && (
                  <>
                    <label className={`field ${a.damage && !isValidDice(a.damage) ? 'has-error' : ''}`}><span>Dice</span><input value={a.damage} placeholder="2d6+3" onChange={(e) => setList('actions', i, { damage: e.target.value.replace(/\s/g, '') })} /></label>
                    {a.kind !== 'heal' && <label className="field"><span>Damage type</span><input value={a.damageType} onChange={(e) => setList('actions', i, { damageType: e.target.value })} /></label>}
                  </>
                )}
                <label className="field"><span>Recharge (5 = 5–6)</span><input type="number" min={0} max={6} value={a.recharge ?? ''} onChange={(e) => setList('actions', i, { recharge: Number(e.target.value) || undefined })} /></label>
                <label className="field"><span>Uses per battle</span><input type="number" min={0} max={20} value={a.uses ?? ''} onChange={(e) => setList('actions', i, { uses: Number(e.target.value) || undefined })} /></label>
                <label className="field field--span4"><span>Description</span><textarea rows={2} value={a.desc} onChange={(e) => setList('actions', i, { desc: e.target.value })} /></label>
              </div>
              <button type="button" className="icon-btn monster-action-edit__remove" onClick={() => dropFrom('actions', i)} aria-label="Remove action"><X size={16} /></button>
            </div>
          ))}
          <button type="button" className="btn btn--small" onClick={() => set({ actions: [...d.actions, { name: 'Bite', kind: 'attack', toHit: 4, damage: '1d8+2', damageType: 'piercing', desc: '' }] })}>
            <Plus size={14} /> Add action
          </button>
        </section>
      </div>

      <aside className="monster-editor__side">
        <button type="button" className="sheet__portrait" onClick={() => setPicker(true)}>
          <Portrait src={d.image} icon={d.icon} color={d.color} shape="frame" alt="" />
          <span className="sheet__portrait-hint">Change artwork</span>
        </button>
        <div className="monster-editor__preview">
          <StatBlock m={{ ...d, name: d.name || 'Unnamed Horror' }} compact />
        </div>
        <div className="row">
          <button type="button" className="btn btn--ghost" onClick={onCancel}>Cancel</button>
          <button className="btn btn--gold" disabled={saving}><Save size={16} /> {saving ? 'Saving…' : 'Save monster'}</button>
        </div>
      </aside>

      <AnimatePresence>
        {picker && <PortraitPicker current={d.image} onClose={() => setPicker(false)} onPick={(image) => { set({ image }); setPicker(false); }} />}
      </AnimatePresence>
    </form>
  );
}
