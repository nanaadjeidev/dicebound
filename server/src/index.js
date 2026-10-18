import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { Server } from 'socket.io';
import { db } from './db.js';
import { GameError, REALMS, Room, combatantFromCharacter, combatantFromMonster } from './game.js';
import { normalizeCampaign, normalizeCharacter, normalizeDungeon, normalizeMonster } from '../../shared/schema.js';
import { HEROES, HERO_BY_ID } from '../../shared/heroes.js';

const require = (p) => JSON.parse(fs.readFileSync(new URL(p, import.meta.url), 'utf8'));
const BESTIARY = require('../../shared/bestiary.json');
const BESTIARY_BY_ID = new Map(BESTIARY.map((m) => [m.id, m]));
// The list view only needs enough to render a card and filter; full stat blocks load on demand.
const BESTIARY_INDEX = BESTIARY.map(({ id, name, size, type, cr, xp, hp, ac, image, icon, color, alignment }) =>
  ({ id, name, size, type, cr, xp, hp, ac, image, icon, color, alignment, builtin: true }));

const PORT = Number(process.env.PORT ?? 3001);
const CLIENT_DIST = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../client/dist');

const GUEST_COLORS = ['#f59e0b', '#ef4444', '#22c55e', '#3b82f6', '#a855f7', '#ec4899', '#14b8a6', '#eab308', '#f97316', '#06b6d4'];
const NAME_A = ['Brave', 'Wandering', 'Silent', 'Crimson', 'Golden', 'Shadow', 'Iron', 'Wild', 'Lucky', 'Ancient', 'Storm', 'Moonlit'];
const NAME_B = ['Wanderer', 'Bard', 'Sellsword', 'Pilgrim', 'Rogue', 'Mystic', 'Ranger', 'Squire', 'Alchemist', 'Seeker', 'Drifter', 'Warden'];
const pick = (list) => list[crypto.randomInt(list.length)];
const guestName = () => `${pick(NAME_A)} ${pick(NAME_B)}`;
const publicGuest = ({ token, ...g }) => g;
const now = () => Date.now();

// ── HTTP ──────────────────────────────────────────────────────────────────────
const app = express();
app.use(express.json({ limit: '1mb' }));

app.post('/api/guest', (req, res) => {
  const name = String(req.body?.name ?? '').trim().slice(0, 32) || guestName();
  const guest = db.createGuest({
    id: crypto.randomUUID(), token: crypto.randomBytes(24).toString('hex'),
    name, color: pick(GUEST_COLORS), createdAt: now(),
  });
  res.json(guest);
});

function auth(req, res, next) {
  const guest = db.guestByToken(req.get('x-guest-token'));
  if (!guest) return res.status(401).json({ error: 'Unknown guest. Refresh to get a new guest pass.' });
  req.guest = guest;
  next();
}

app.get('/api/me', auth, (req, res) => res.json(publicGuest(req.guest)));
app.patch('/api/me', auth, (req, res) => {
  const name = String(req.body?.name ?? '').trim().slice(0, 32);
  if (!name) return res.status(400).json({ error: 'A name is required.' });
  res.json(publicGuest(db.updateGuest(req.guest.id, { name })));
});

app.get('/api/heroes', (_req, res) => res.json(HEROES));
app.get('/api/bestiary', (_req, res) => {
  res.set('Cache-Control', 'public, max-age=3600');
  res.json(BESTIARY_INDEX);
});

// Characters and custom monsters share the same owner-scoped CRUD.
function crud(kind, normalize, { builtins } = {}) {
  const base = `/api/${kind}`;
  const owned = (req, res) => {
    const doc = db.get(kind, req.params.id);
    if (!doc || doc.ownerId !== req.guest.id) {
      res.status(404).json({ error: 'Not found.' });
      return null;
    }
    return doc;
  };
  app.get(base, auth, (req, res) => res.json(db.list(kind, req.guest.id)));
  app.get(`${base}/:id`, auth, (req, res) => {
    const builtin = builtins?.get(req.params.id);
    if (builtin) return res.json(builtin);
    const doc = owned(req, res);
    if (doc) res.json(doc);
  });
  app.post(base, auth, (req, res) => {
    if (db.list(kind, req.guest.id).length >= 100) return res.status(400).json({ error: 'Roster is full (100).' });
    const doc = { ...normalize(req.body), id: crypto.randomUUID(), ownerId: req.guest.id, createdAt: now(), updatedAt: now() };
    res.status(201).json(db.put(kind, doc));
  });
  app.put(`${base}/:id`, auth, (req, res) => {
    const doc = owned(req, res);
    if (!doc) return;
    res.json(db.put(kind, { ...normalize(req.body), id: doc.id, ownerId: doc.ownerId, createdAt: doc.createdAt, updatedAt: now() }));
  });
  app.delete(`${base}/:id`, auth, (req, res) => {
    if (!owned(req, res)) return;
    db.remove(kind, req.params.id);
    res.status(204).end();
  });
}
crud('characters', normalizeCharacter, { builtins: HERO_BY_ID });
crud('monsters', normalizeMonster, { builtins: BESTIARY_BY_ID });
crud('campaigns', normalizeCampaign);
crud('dungeons', normalizeDungeon);

app.get('/api/rooms', (_req, res) => res.json(roomList()));

if (fs.existsSync(CLIENT_DIST)) {
  app.use(express.static(CLIENT_DIST, { maxAge: '1h' }));
  app.get(/^\/(?!api|socket\.io).*/, (_req, res) => res.sendFile(path.join(CLIENT_DIST, 'index.html')));
}

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: 'Something went wrong in the tavern kitchen.' });
});

// ── Rooms ─────────────────────────────────────────────────────────────────────
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: true } });
const rooms = new Map();

function roomCode() {
  const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  let code;
  do code = Array.from({ length: 5 }, () => letters[crypto.randomInt(letters.length)]).join('');
  while (rooms.has(code));
  return code;
}

function roomList() {
  return [...rooms.values()].filter((r) => r.players.size > 0)
    .sort((a, b) => b.createdAt - a.createdAt).slice(0, 50).map((r) => r.summary());
}

let listTimer = null;
function broadcastRoomList() {
  clearTimeout(listTimer);
  listTimer = setTimeout(() => io.emit('rooms:update', roomList()), 250);
}

function broadcast(room, fx = []) {
  if (fx.length) io.to(room.code).emit('room:fx', fx);
  io.to(room.code).emit('room:state', room.toJSON());
  broadcastRoomList();
}

function writeBackHp(characterId, ownerId, hp) {
  const c = db.get('characters', characterId);
  if (c && c.ownerId === ownerId) db.put('characters', { ...c, hp, updatedAt: now() });
}

// Abandoned rooms are swept after 30 minutes with nobody connected.
setInterval(() => {
  for (const [code, room] of rooms) {
    if (room.emptySince && now() - room.emptySince > 30 * 60_000) rooms.delete(code);
  }
  broadcastRoomList();
}, 60_000).unref();

io.use((socket, next) => {
  const guest = db.guestByToken(socket.handshake.auth?.token);
  if (!guest) return next(new Error('unauthorised'));
  socket.data.guestId = guest.id;
  next();
});

io.on('connection', (socket) => {
  const guest = () => db.getGuest(socket.data.guestId);
  const currentRoom = () => rooms.get(socket.data.roomCode) ?? null;

  function leaveCurrent({ permanent }) {
    const room = currentRoom();
    if (!room) return;
    socket.leave(room.code);
    socket.data.roomCode = null;
    if (permanent) room.leave(socket.data.guestId);
    else room.disconnect(socket.data.guestId);
    broadcast(room);
  }

  function enter(room) {
    if (socket.data.roomCode === room.code) return;
    leaveCurrent({ permanent: false });
    socket.join(room.code);
    socket.data.roomCode = room.code;
    room.join(guest());
    broadcast(room);
  }

  // Wraps a handler so errors become friendly acks and every change is broadcast.
  const handle = (event, fn, { needsRoom = true } = {}) => {
    socket.on(event, (payload, ack) => {
      const reply = typeof ack === 'function' ? ack : () => {};
      try {
        const room = currentRoom();
        if (needsRoom && !room) throw new GameError('You are not in a room.');
        const result = fn(room, payload ?? {});
        if (needsRoom) broadcast(room, Array.isArray(result) ? result : []);
        reply({ ok: true, ...(result && !Array.isArray(result) ? result : {}) });
      } catch (err) {
        if (!(err instanceof GameError) && !/Invalid dice/.test(err.message)) console.error(event, err);
        reply({ ok: false, error: err instanceof GameError || /Invalid dice/.test(err.message) ? err.message : 'Something went wrong.' });
      }
    });
  };

  handle('rooms:list', () => ({ rooms: roomList() }), { needsRoom: false });

  handle('room:create', (_room, { name, realm }) => {
    const g = guest();
    const room = new Room({
      code: roomCode(), hostId: g.id, realm: REALMS.includes(realm) ? realm : 'dungeon',
      name: String(name ?? '').trim().slice(0, 40) || `${g.name}'s Table`,
      onCharacterHp: writeBackHp,
    });
    rooms.set(room.code, room);
    room.push({ type: 'banner', text: `${room.name} opens its doors.` });
    enter(room);
    return { code: room.code };
  }, { needsRoom: false });

  handle('room:join', (_room, { code }) => {
    const room = rooms.get(String(code ?? '').toUpperCase().trim());
    if (!room) throw new GameError('No room with that code. It may have closed.');
    enter(room);
    socket.emit('room:state', room.toJSON());
    return { code: room.code };
  }, { needsRoom: false });

  handle('room:leave', (_room, { permanent = true }) => {
    leaveCurrent({ permanent: !!permanent });
    return {};
  }, { needsRoom: false });

  handle('room:addCharacter', (room, { characterId, side }) => {
    const g = guest();
    const c = HERO_BY_ID.get(characterId) ?? db.get('characters', characterId);
    if (!c || (!c.premade && c.ownerId !== g.id)) throw new GameError('Character not found.');
    return room.addCombatant(g.id, combatantFromCharacter(c, { id: room.id('c'), ownerId: g.id, side }));
  });

  handle('room:addMonster', (room, { monsterId, count = 1, side }) => {
    const g = guest();
    const m = BESTIARY_BY_ID.get(monsterId) ?? db.get('monsters', monsterId);
    if (!m || (!m.builtin && m.ownerId !== g.id)) throw new GameError('Monster not found.');
    const n = Math.max(1, Math.min(8, Number(count) || 1));
    const existing = room.combatants.filter((c) => c.sourceId === m.id).length;
    const fx = [];
    for (let i = 0; i < n; i++) {
      const label = n + existing > 1 ? `${m.name} ${String.fromCharCode(65 + ((existing + i) % 26))}` : m.name;
      fx.push(...room.addCombatant(g.id, combatantFromMonster(m, { id: room.id('c'), ownerId: g.id, side, name: label })));
    }
    return fx;
  });

  handle('room:remove', (room, { id }) => room.removeCombatant(socket.data.guestId, id));
  handle('room:side', (room, { id, side }) => room.setSide(socket.data.guestId, id, side));
  handle('room:clear', (room, { side }) => room.clearArena(socket.data.guestId, side));
  handle('room:chat', (room, { text }) => room.chat(guest(), text));
  handle('room:roll', (room, payload) => room.freeRoll(guest(), payload));
  handle('room:narrate', (room, payload) => room.narrate(socket.data.guestId, payload));

  handle('map:load', (room, { dungeonId }) => {
    const d = db.get('dungeons', dungeonId);
    if (!d || d.ownerId !== socket.data.guestId) throw new GameError('That dungeon isn’t in your library.');
    room.loadMap(socket.data.guestId, d);
  });
  handle('map:clear', (room) => room.clearMap(socket.data.guestId));
  handle('map:revealRoom', (room, payload) => room.revealRoom(socket.data.guestId, payload));
  handle('map:reveal', (room, payload) => room.revealCells(socket.data.guestId, payload));
  handle('map:secret', (room, payload) => room.revealSecretDoor(socket.data.guestId, payload));
  handle('map:move', (room, payload) => room.moveToken(socket.data.guestId, payload));
  handle('map:ping', (room, payload) => room.ping(guest(), payload));

  // Brings a room's planned encounter from the DM's own dungeon onto the map, in that room.
  handle('map:spawn', (room, { roomId }) => {
    if (!room.isHost(socket.data.guestId)) throw new GameError('Only the Dungeon Master can spawn monsters.');
    const map = room.requireMap();
    const d = db.get('dungeons', map.id);
    const plan = d?.ownerId === socket.data.guestId ? d.rooms.find((r) => r.id === roomId) : null;
    if (!plan?.encounter?.monsters?.length) throw new GameError('That room has no planned encounter.');
    const area = map.rooms.find((r) => r.id === roomId);
    const centre = { x: area.x + (area.w >> 1), y: area.y + (area.h >> 1) };
    const inRoom = (p) => p.x >= area.x && p.y >= area.y && p.x < area.x + area.w && p.y < area.y + area.h;
    const fx = [];
    for (const group of plan.encounter.monsters) {
      const m = BESTIARY_BY_ID.get(group.id) ?? db.get('monsters', group.id);
      if (!m || (!m.builtin && m.ownerId !== socket.data.guestId)) continue;
      const existing = room.combatants.filter((c) => c.sourceId === m.id).length;
      for (let i = 0; i < Math.min(group.count, 12); i++) {
        const label = group.count + existing > 1 ? `${m.name} ${String.fromCharCode(65 + ((existing + i) % 26))}` : m.name;
        const pos = room.freeCellsNear(centre, 1, { within: inRoom })[0] ?? room.freeCellsNear(centre, 1)[0] ?? null;
        fx.push(...room.addCombatant(socket.data.guestId, combatantFromMonster(m, { id: room.id('c'), ownerId: socket.data.guestId, side: 'foes', name: label }), { pos }));
      }
    }
    return fx;
  });
  handle('room:realm', (room, { realm }) => {
    if (!room.isHost(socket.data.guestId)) throw new GameError('Only the Dungeon Master can change the realm.');
    if (REALMS.includes(realm)) room.realm = realm;
  });

  handle('combat:start', (room) => room.startCombat(socket.data.guestId));
  handle('combat:end', (room) => room.endCombat(socket.data.guestId));
  handle('combat:rematch', (room) => room.rematch(socket.data.guestId));
  handle('combat:endTurn', (room) => room.endTurn(socket.data.guestId));
  handle('combat:act', (room, payload) => room.act(socket.data.guestId, payload));
  handle('combat:potion', (room, payload) => room.potion(socket.data.guestId, payload));
  handle('combat:deathSave', (room, payload) => room.deathSave(socket.data.guestId, payload));
  handle('combat:check', (room, payload) => room.check(socket.data.guestId, payload));
  handle('combat:hp', (room, payload) => room.adjustHp(socket.data.guestId, payload));
  handle('combat:condition', (room, payload) => room.toggleCondition(socket.data.guestId, payload));

  socket.on('disconnect', () => leaveCurrent({ permanent: false }));
});

server.listen(PORT, () => {
  console.log(`⚔  Battle server listening on http://localhost:${PORT} (${BESTIARY.length} monsters, ${HEROES.length} heroes)`);
});
