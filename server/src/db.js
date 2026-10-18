// SQLite document store (Node's built-in node:sqlite). Each row keeps the full document as JSON,
// with the fields we query on (token, owner, updatedAt) lifted into indexed columns.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const DATA_DIR = process.env.DATA_DIR ?? path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../data');
const FILE = path.join(DATA_DIR, 'dicebound.sqlite');
const LEGACY_JSON = path.join(DATA_DIR, 'db.json');
const KINDS = ['characters', 'monsters', 'campaigns', 'dungeons'];

fs.mkdirSync(DATA_DIR, { recursive: true });
const sql = new DatabaseSync(FILE);
sql.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA synchronous = NORMAL;
  CREATE TABLE IF NOT EXISTS guests (
    id    TEXT PRIMARY KEY,
    token TEXT NOT NULL UNIQUE,
    data  TEXT NOT NULL
  );
  ${KINDS.map((kind) => `
  CREATE TABLE IF NOT EXISTS ${kind} (
    id         TEXT PRIMARY KEY,
    owner_id   TEXT NOT NULL,
    updated_at INTEGER NOT NULL,
    data       TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS ${kind}_owner ON ${kind} (owner_id, updated_at DESC);`).join('')}
`);

const parse = (row) => (row ? JSON.parse(row.data) : null);

const q = {
  insertGuest: sql.prepare('INSERT OR REPLACE INTO guests (id, token, data) VALUES (?, ?, ?)'),
  guestByToken: sql.prepare('SELECT data FROM guests WHERE token = ?'),
  getGuest: sql.prepare('SELECT data FROM guests WHERE id = ?'),
  ...Object.fromEntries(KINDS.map((kind) => [kind, {
    list: sql.prepare(`SELECT data FROM ${kind} WHERE owner_id = ? ORDER BY updated_at DESC`),
    get: sql.prepare(`SELECT data FROM ${kind} WHERE id = ?`),
    put: sql.prepare(`INSERT OR REPLACE INTO ${kind} (id, owner_id, updated_at, data) VALUES (?, ?, ?, ?)`),
    remove: sql.prepare(`DELETE FROM ${kind} WHERE id = ?`),
  }])),
};

function table(kind) {
  if (!KINDS.includes(kind)) throw new Error(`Unknown kind: ${kind}`);
  return q[kind];
}

export const db = {
  createGuest(guest) {
    q.insertGuest.run(guest.id, guest.token, JSON.stringify(guest));
    return guest;
  },
  guestByToken: (token) => (token ? parse(q.guestByToken.get(String(token))) : null),
  getGuest: (id) => parse(q.getGuest.get(id)),
  updateGuest(id, patch) {
    const guest = db.getGuest(id);
    if (!guest) return null;
    return db.createGuest({ ...guest, ...patch });
  },

  list: (kind, ownerId) => table(kind).list.all(ownerId).map(parse),
  get: (kind, id) => parse(table(kind).get.get(id)),
  put(kind, doc) {
    table(kind).put.run(doc.id, doc.ownerId, doc.updatedAt ?? Date.now(), JSON.stringify(doc));
    return doc;
  },
  remove(kind, id) {
    table(kind).remove.run(id);
  },
};

// One-time import from the old JSON-file store, which is kept as db.json.migrated.
if (fs.existsSync(LEGACY_JSON)) {
  try {
    const legacy = JSON.parse(fs.readFileSync(LEGACY_JSON, 'utf8'));
    sql.exec('BEGIN');
    for (const guest of Object.values(legacy.guests ?? {})) db.createGuest(guest);
    for (const kind of KINDS) for (const doc of Object.values(legacy[kind] ?? {})) db.put(kind, doc);
    sql.exec('COMMIT');
    fs.renameSync(LEGACY_JSON, `${LEGACY_JSON}.migrated`);
    console.log('Imported db.json into SQLite.');
  } catch (err) {
    try { sql.exec('ROLLBACK'); } catch { }
    console.warn('Could not import db.json:', err.message);
  }
}
