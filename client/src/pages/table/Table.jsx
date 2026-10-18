import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Check, ChevronLeft, Copy, Crown, LogOut, Map as MapIcon, MessageSquare, Square, Swords, Users, WandSparkles } from 'lucide-react';
import { useGuest } from '../../guest.jsx';
import { api, emit } from '../../api.js';
import { useToast } from '../../components/Toasts.jsx';
import GameIcon from '../../components/GameIcon.jsx';
import { REALMS, REALM_BY_KEY } from '../../realms.js';
import { useRoomStream } from './useRoomStream.js';
import Arena from './Arena.jsx';
import ActionDock from './ActionDock.jsx';
import Chronicle from './Chronicle.jsx';
import FxOverlay from './FxOverlay.jsx';
import InitiativeRibbon from './InitiativeRibbon.jsx';
import Inspector from './Inspector.jsx';
import PartyPanel from './PartyPanel.jsx';
import Summon from './Summon.jsx';
import MapView from './MapView.jsx';
import DmPanel from './DmPanel.jsx';
import DiceOverlay from './DiceOverlay.jsx';

/** The DM's read-aloud text, unrolled for everyone as a scroll. */
function Narration({ n, onClose }) {
  useEffect(() => {
    const t = setTimeout(onClose, Math.max(7000, n.text.split(/\s+/).length * 380));
    return () => clearTimeout(t);
  }, [n, onClose]);
  return (
    <motion.button className="narration" onClick={onClose} initial={{ opacity: 0, y: -24, scaleY: 0.6 }} animate={{ opacity: 1, y: 0, scaleY: 1 }}
      exit={{ opacity: 0, y: -12 }} transition={{ type: 'spring', damping: 20 }} aria-label="Dismiss narration">
      {n.title && <h3>{n.title}</h3>}
      <p>{n.text}</p>
      <small>Click to dismiss</small>
    </motion.button>
  );
}

export default function Table() {
  const { code } = useParams();
  const { socket, guest, online } = useGuest();
  const toast = useToast();
  const navigate = useNavigate();
  const { room, fx, floaters, impacts, dice, diceDone, pings, narration, dismissNarration } = useRoomStream(socket);
  const [view, setView] = useState('arena');
  const [dungeon, setDungeon] = useState(null);
  const [error, setError] = useState(null);
  const [targetId, setTargetId] = useState(null);
  const [armed, setArmed] = useState(null);
  const [inspectId, setInspectId] = useState(null);
  const [panel, setPanel] = useState('log');
  const [mode, setMode] = useState('normal');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!socket) return undefined;
    const join = () => emit(socket, 'room:join', { code }).then(() => setError(null)).catch((err) => setError(err.message));
    socket.on('connect', join);
    if (socket.connected) join();
    return () => {
      socket.off('connect', join);
      if (socket.connected) socket.emit('room:leave', { permanent: false });
    };
  }, [socket, code]);

  const send = useCallback((event, payload) => emit(socket, event, payload).catch((err) => toast(err.message, 'error')), [socket, toast]);

  const isHost = room?.hostId === guest.id;
  const mapId = room?.map?.id;

  // Switch to the map whenever one is loaded; back to the arena when it's taken away.
  useEffect(() => { setView(mapId ? 'map' : 'arena'); }, [mapId]);

  // The DM's own copy of the dungeon carries the room key, traps and secret doors.
  useEffect(() => {
    setDungeon(null);
    if (!isHost || !mapId) return;
    api(`/dungeons/${mapId}`).then(setDungeon).catch(() => setDungeon(null));
  }, [isHost, mapId]);
  const current = room?.combatants.find((c) => c.id === room.turnId) ?? null;
  const canControl = !!current && (isHost || current.ownerId === guest.id);
  const target = room?.combatants.find((c) => c.id === targetId) ?? null;
  const inspecting = room?.combatants.find((c) => c.id === inspectId) ?? null;

  // When your turn starts, aim at the nearest living enemy so you can strike in one click.
  useEffect(() => {
    setArmed(null);
    setMode('normal');
    if (!current || !canControl) return;
    setTargetId((prev) => {
      const t = room.combatants.find((c) => c.id === prev);
      if (t && t.side !== current.side && t.status !== 'dead') return prev;
      return room.combatants.find((c) => c.side !== current.side && c.status !== 'dead')?.id ?? null;
    });
  }, [current?.id, room?.round]); // eslint-disable-line react-hooks/exhaustive-deps

  // If the target falls mid-turn (Extra Attack, Multiattack), swing at the next living enemy.
  useEffect(() => {
    if (target?.status !== 'dead' || !current || !canControl) return;
    setTargetId(room.combatants.find((c) => c.side !== current.side && c.status !== 'dead')?.id ?? null);
  }, [target?.status]); // eslint-disable-line react-hooks/exhaustive-deps

  // Notify when it becomes one of your heroes' turns.
  useEffect(() => {
    if (current && current.ownerId === guest.id && room.phase === 'combat') toast(`${current.name}, it’s your turn!`, 'info');
  }, [current?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const fire = (index, t) => {
    const a = current.actions[index];
    send('combat:act', { actorId: current.id, actionIndex: index, targetId: a.self ? current.id : t.id, mode });
    setArmed(null);
  };

  const onAction = (index) => {
    const a = current.actions[index];
    if (a.self) return fire(index, current);
    const t = target;
    const valid = t && t.status !== 'dead' && (a.kind === 'heal' ? true : t.id !== current.id);
    const sensible = valid && (a.kind === 'heal' ? t.side === current.side : true);
    if (sensible) return fire(index, t);
    if (a.kind === 'heal' && !t) return fire(index, current);
    setArmed({ index });
    toast(a.kind === 'heal' ? 'Choose an ally to heal.' : 'Choose a target in the arena.');
  };

  const onSelect = (c) => {
    if (armed && canControl) {
      if (c.status === 'dead' && current.actions[armed.index]?.kind !== 'heal') return toast(`${c.name} is already dead.`, 'error');
      setTargetId(c.id);
      return fire(armed.index, c);
    }
    setTargetId(c.id === targetId ? null : c.id);
  };

  const copyInvite = async () => {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/table/${room.code}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      toast(`Table code: ${room.code}`);
    }
  };

  const leave = async () => {
    await emit(socket, 'room:leave', { permanent: true }).catch(() => {});
    navigate('/');
  };

  const counts = useMemo(() => ({ online: room?.players.filter((p) => p.online).length ?? 0 }), [room?.players]);

  if (error) {
    return (
      <div className="page table-error">
        <GameIcon name="skull-crossed-bones" size={64} />
        <h1 className="page__title">This table has gone cold</h1>
        <p className="muted">{error}</p>
        <Link to="/" className="btn btn--gold">Back to the tavern</Link>
      </div>
    );
  }
  if (!room) {
    return <div className="splash splash--inline"><GameIcon name="dice-twenty-faces-twenty" size={56} className="splash__spin" /><p>Finding your seat at table {code}…</p></div>;
  }

  return (
    <div className={`table realm--${room.realm}`}>
      <header className="table__bar">
        <Link to="/" className="icon-btn" aria-label="Back to tavern"><ChevronLeft size={18} /></Link>
        <div className="table__title">
          <h1>{room.name}</h1>
          <span>{REALM_BY_KEY[room.realm]?.name} · {room.phase === 'combat' ? `Round ${room.round}` : room.phase === 'ended' ? 'Aftermath' : 'Gathering'}{!online && ' · reconnecting…'}</span>
        </div>
        <button className="code-chip" onClick={copyInvite} title="Copy invite link">
          <span>{room.code}</span>{copied ? <Check size={14} /> : <Copy size={14} />}
        </button>
        <div className="table__players" aria-label={`${counts.online} players online`}>
          {room.players.map((p) => (
            <span key={p.id} className={`avatar ${p.online ? '' : 'is-away'}`} style={{ background: p.color }} title={`${p.name}${p.id === room.hostId ? ' (DM)' : ''}`}>
              {p.name[0]}{p.id === room.hostId && <Crown size={10} className="avatar__crown" />}
            </span>
          ))}
        </div>
        <div className="table__tools">
          {isHost && (
            <select value={room.realm} onChange={(e) => send('room:realm', { realm: e.target.value })} aria-label="Realm" className="select--small">
              {REALMS.map((r) => <option key={r.key} value={r.key}>{r.name}</option>)}
            </select>
          )}
          {room.map && (
            <div className="segmented" role="tablist" aria-label="View">
              <button className={view === 'map' ? 'is-active' : ''} onClick={() => setView('map')}><MapIcon size={13} /> Map</button>
              <button className={view === 'arena' ? 'is-active' : ''} onClick={() => setView('arena')}><Swords size={13} /> Arena</button>
            </div>
          )}
          {isHost && room.phase === 'combat' && <button className="btn btn--small btn--ghost" onClick={() => send('combat:end')}><Square size={14} /> End battle</button>}
          <button className="btn btn--small btn--ghost" onClick={leave}><LogOut size={14} /> Leave</button>
        </div>
      </header>

      <InitiativeRibbon room={room} onSelect={(c) => setInspectId(c.id)} />

      <div className="table__body">
        <div className="table__stage">
          {view === 'map' && room.map ? (
            <MapView room={room} me={guest.id} isHost={isHost} dungeon={dungeon} targetId={targetId} pings={pings}
              onSelect={(c) => (armed ? onSelect(c) : setTargetId(c.id === targetId ? null : c.id))} onSend={send} />
          ) : (
            <Arena room={room} turnId={room.turnId} targetId={targetId} armed={armed} guestId={guest.id}
              impacts={impacts} floaters={floaters} onSelect={onSelect} onInspect={(c) => setInspectId(c.id)} />
          )}
          <DiceOverlay rolls={dice} onDone={diceDone} />
          <AnimatePresence>{narration && <Narration key={narration.key} n={narration} onClose={dismissNarration} />}</AnimatePresence>
          <FxOverlay fx={fx} room={room} />
          <AnimatePresence>
            {room.phase === 'ended' && room.outcome && !fx && (
              <motion.div className={`outcome outcome--${room.outcome}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <motion.h2 initial={{ scale: 2.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', damping: 14 }}>
                  {room.outcome === 'victory' ? 'Victory' : 'Defeat'}
                </motion.h2>
                <p>{room.log.findLast((l) => l.type === 'banner')?.text}</p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <aside className="table__side">
          <div className="tabs tabs--side" role="tablist">
            <button className={panel === 'log' ? 'is-active' : ''} onClick={() => setPanel('log')}><MessageSquare size={14} /> Chronicle</button>
            <button className={panel === 'summon' ? 'is-active' : ''} onClick={() => setPanel('summon')}><WandSparkles size={14} /> Summon</button>
            <button className={panel === 'party' ? 'is-active' : ''} onClick={() => setPanel('party')}><Users size={14} /> Party <span className="pill">{counts.online}</span></button>
            {isHost && <button className={panel === 'dm' ? 'is-active' : ''} onClick={() => setPanel('dm')}><Crown size={14} /> DM</button>}
          </div>
          <div className="table__panel">
            {panel === 'log' && <Chronicle log={room.log} onSend={send} isHost={isHost} />}
            {panel === 'dm' && isHost && <DmPanel room={room} dungeon={dungeon} onSend={send} />}
            {panel === 'summon' && <Summon onSend={send} />}
            {panel === 'party' && <PartyPanel room={room} me={guest.id} />}
          </div>
        </aside>
      </div>

      <ActionDock room={room} me={guest.id} isHost={isHost} current={current} canControl={canControl}
        target={target} armed={armed} mode={mode} setMode={setMode} onAction={onAction} onSend={send} />

      <AnimatePresence>
        {inspecting && (
          <Inspector c={inspecting} room={room} me={guest.id} canControl={isHost || inspecting.ownerId === guest.id}
            onSend={send} onClose={() => setInspectId(null)} />
        )}
      </AnimatePresence>
    </div>
  );
}
