import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { BookOpen, Castle, Plus, ScrollText, Trash2, Users } from 'lucide-react';
import { THEMES } from '@shared/dungeon.js';
import { newCampaign } from '@shared/schema.js';
import { api } from '../../api.js';
import { useToast } from '../../components/Toasts.jsx';
import Modal from '../../components/Modal.jsx';
import DungeonMap from '../../components/DungeonMap.jsx';
import GeneratorForm from './GeneratorForm.jsx';

function Thumb({ d }) {
  // A cheap static preview: the editor's renderer at a fixed small size, no interaction.
  return (
    <div className="dungeon-card__map" aria-hidden="true">
      <DungeonMap map={d} mapStyle="parchment" showNumbers={false} interactive={false} />
    </div>
  );
}

export default function Sanctum() {
  const toast = useToast();
  const navigate = useNavigate();
  const [campaigns, setCampaigns] = useState(null);
  const [dungeons, setDungeons] = useState(null);
  const [forging, setForging] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api('/campaigns').then(setCampaigns).catch((e) => toast(e.message, 'error'));
    api('/dungeons').then(setDungeons).catch((e) => toast(e.message, 'error'));
  }, [toast]);

  const dungeonsById = useMemo(() => Object.fromEntries((dungeons ?? []).map((d) => [d.id, d])), [dungeons]);

  const createCampaign = async () => {
    try {
      const c = await api('/campaigns', { method: 'POST', body: newCampaign() });
      navigate(`/dm/campaigns/${c.id}`);
    } catch (e) {
      toast(e.message, 'error');
    }
  };

  const forge = async (dungeon) => {
    setBusy(true);
    try {
      const d = await api('/dungeons', { method: 'POST', body: dungeon });
      navigate(`/dm/dungeons/${d.id}`);
    } catch (e) {
      toast(e.message, 'error');
      setBusy(false);
    }
  };

  const remove = async (kind, doc) => {
    if (!window.confirm(`Delete “${doc.name}”? This can’t be undone.`)) return;
    try {
      await api(`/${kind}/${doc.id}`, { method: 'DELETE' });
      (kind === 'campaigns' ? setCampaigns : setDungeons)((list) => list.filter((x) => x.id !== doc.id));
      toast(`${doc.name} was struck from the records.`);
    } catch (e) {
      toast(e.message, 'error');
    }
  };

  return (
    <div className="page sanctum">
      <header className="sanctum__hero">
        <div>
          <span className="kicker">Behind the screen</span>
          <h1 className="page__title">The Dungeon Master’s Sanctum</h1>
          <p className="sanctum__lede">Plan campaigns, keep your notes and NPCs in one place, and forge dungeons in seconds, stocked with
            balanced encounters, traps and treasure. Take any dungeon to the table as a live battle map with fog of war.</p>
        </div>
        <div className="sanctum__actions">
          <button className="btn btn--gold btn--lg" onClick={() => setForging(true)}><Castle size={18} /> Forge a dungeon</button>
          <button className="btn btn--lg" onClick={createCampaign}><ScrollText size={18} /> New campaign</button>
        </div>
      </header>

      <section className="sanctum__section">
        <h2 className="section-title"><BookOpen size={18} /> Campaigns <span className="pill">{campaigns?.length ?? '…'}</span></h2>
        {campaigns && campaigns.length === 0 && (
          <div className="empty-state empty-state--small">
            <h2>No campaigns yet</h2>
            <p>A campaign keeps your world together: sessions, NPCs, places, quests and planned encounters.</p>
            <button className="btn btn--gold" onClick={createCampaign}><Plus size={16} /> Start a campaign</button>
          </div>
        )}
        <div className="campaign-grid">
          {campaigns?.map((c) => (
            <motion.div key={c.id} layout className="campaign-card" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
              <Link to={`/dm/campaigns/${c.id}`} className="campaign-card__link">
                <span className="campaign-card__seal">{c.name.slice(0, 1)}</span>
                <h3>{c.name}</h3>
                {c.tagline && <p className="campaign-card__tag">{c.tagline}</p>}
                <div className="campaign-card__stats">
                  <span><Users size={12} /> {c.partySize} heroes · level {c.partyLevel}</span>
                  <span>{c.sessions.length} sessions</span>
                  <span>{c.npcs.length} NPCs</span>
                  <span>{c.dungeonIds.filter((id) => dungeonsById[id]).length} dungeons</span>
                </div>
              </Link>
              <button className="icon-btn campaign-card__delete" onClick={() => remove('campaigns', c)} aria-label={`Delete ${c.name}`}><Trash2 size={14} /></button>
            </motion.div>
          ))}
        </div>
      </section>

      <section className="sanctum__section">
        <h2 className="section-title"><Castle size={18} /> Dungeon library <span className="pill">{dungeons?.length ?? '…'}</span></h2>
        {dungeons && dungeons.length === 0 && (
          <div className="empty-state empty-state--small">
            <h2>No dungeons yet</h2>
            <p>Pick a theme and the generator lays out rooms, corridors, doors, monsters, traps and loot. Then edit anything you like.</p>
            <button className="btn btn--gold" onClick={() => setForging(true)}><Castle size={16} /> Forge your first dungeon</button>
          </div>
        )}
        <div className="dungeon-grid">
          {dungeons?.map((d) => (
            <motion.div key={d.id} layout className="dungeon-card" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
              <Link to={`/dm/dungeons/${d.id}`} className="dungeon-card__link">
                <Thumb d={d} />
                <div className="dungeon-card__body">
                  <h3>{d.name}</h3>
                  <span>{THEMES[d.theme]?.label ?? d.theme} · {d.rooms.length} rooms · party level {d.level}</span>
                </div>
              </Link>
              <button className="icon-btn campaign-card__delete" onClick={() => remove('dungeons', d)} aria-label={`Delete ${d.name}`}><Trash2 size={14} /></button>
            </motion.div>
          ))}
        </div>
      </section>

      <AnimatePresence>
        {forging && (
          <Modal title="Forge a dungeon" wide onClose={() => setForging(false)}>
            <GeneratorForm onGenerate={forge} busy={busy} />
          </Modal>
        )}
      </AnimatePresence>
    </div>
  );
}
