import { useCallback, useEffect, useRef, useState } from 'react';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let floaterSeq = 0;

/**
 * Subscribes to a room's state and effect stream. Effects (attacks, heals, deaths…) play
 * one after another; state updates that arrive mid-animation are held back until the
 * blow lands so hit-point bars drop in sync with the dice.
 */
export function useRoomStream(socket) {
  const [room, setRoom] = useState(null);
  const [fx, setFx] = useState(null);
  const [floaters, setFloaters] = useState([]);
  const [impacts, setImpacts] = useState({});
  const [dice, setDice] = useState([]); // shared 3D rolls waiting to be thrown
  const [pings, setPings] = useState([]);
  const [narration, setNarration] = useState(null);
  const queue = useRef([]);
  const busy = useRef(false);
  const pending = useRef(null);
  const alive = useRef(true);

  const flush = () => {
    if (pending.current) {
      setRoom(pending.current);
      pending.current = null;
    }
  };

  const floater = (targetId, text, kind, crit = false) => {
    const id = ++floaterSeq;
    setFloaters((f) => [...f, { id, targetId, text, kind, crit }]);
    setTimeout(() => alive.current && setFloaters((f) => f.filter((x) => x.id !== id)), 1600);
  };

  const impact = (targetId, kind, ms = 650) => {
    setImpacts((s) => ({ ...s, [targetId]: kind }));
    setTimeout(() => alive.current && setImpacts((s) => {
      const { [targetId]: _, ...rest } = s;
      return rest;
    }), ms);
  };

  const play = useCallback(async (e) => {
    switch (e.type) {
      case 'attack':
      case 'save':
      case 'auto': {
        setFx({ ...e, key: Math.random() });
        await wait(e.type === 'auto' ? 450 : 750);
        flush();
        const landed = e.type === 'save' ? e.amount > 0 : e.hit;
        if (landed) {
          floater(e.targetId, `−${e.amount}`, e.crit ? 'crit' : 'damage', e.crit);
          impact(e.targetId, e.crit ? 'crit' : 'hit');
        } else {
          floater(e.targetId, e.type === 'save' ? 'Saved!' : 'Miss', 'miss');
          impact(e.targetId, 'dodge', 450);
        }
        await wait(950);
        setFx(null);
        await wait(120);
        break;
      }
      case 'heal':
        flush();
        if (e.amount > 0) floater(e.targetId, `+${e.amount}`, 'heal');
        impact(e.targetId, 'heal', 900);
        await wait(e.action ? 650 : 50);
        break;
      case 'damage':
        flush();
        floater(e.targetId, `−${e.amount}`, 'damage');
        impact(e.targetId, 'hit');
        await wait(400);
        break;
      case 'down':
      case 'death':
        flush();
        impact(e.targetId, 'death', 1200);
        await wait(700);
        break;
      case 'deathsave':
        flush();
        floater(e.targetId, e.natural >= 10 ? `Save ${e.natural}` : `Fail ${e.natural}`, e.natural >= 10 ? 'heal' : 'damage');
        await wait(500);
        break;
      case 'initiative':
        // Nothing to sync with an impact here: let the state that follows in the same packet through.
        setFx({ ...e, key: Math.random() });
        await wait(60);
        flush();
        await wait(2540);
        setFx(null);
        break;
      case 'roll':
        // Thrown by the dice overlay; the queue doesn't wait for the dice to land.
        setDice((d) => [...d, { ...e, key: Math.random() }]);
        flush();
        await wait(60);
        break;
      case 'ping': {
        const id = Math.random();
        setPings((p) => [...p, { ...e, id }]);
        setTimeout(() => alive.current && setPings((p) => p.filter((x) => x.id !== id)), 2400);
        flush();
        break;
      }
      case 'narration':
        setNarration({ ...e, key: Math.random() });
        flush();
        break;
      default:
        flush();
    }
  }, []);

  const run = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    while (queue.current.length && alive.current) await play(queue.current.shift());
    busy.current = false;
    flush();
  }, [play]);

  useEffect(() => {
    if (!socket) return undefined;
    alive.current = true;
    const onFx = (list) => {
      queue.current.push(...list);
      run();
    };
    const onState = (state) => {
      if (busy.current || queue.current.length) pending.current = state;
      else setRoom(state);
    };
    socket.on('room:fx', onFx);
    socket.on('room:state', onState);
    return () => {
      alive.current = false;
      socket.off('room:fx', onFx);
      socket.off('room:state', onState);
    };
  }, [socket, run]);

  const diceDone = useCallback((key) => setDice((d) => d.filter((x) => x.key !== key)), []);
  return { room, fx, floaters, impacts, dice, diceDone, pings, narration, dismissNarration: () => setNarration(null) };
}
