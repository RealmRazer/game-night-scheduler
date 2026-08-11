const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(path.join(DATA_DIR, 'scheduler.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS config (
    key   TEXT PRIMARY KEY,
    value TEXT
  );

  CREATE TABLE IF NOT EXISTS participants (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    name       TEXT UNIQUE NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS availability (
    participant_id INTEGER NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
    slot           TEXT NOT NULL,
    PRIMARY KEY (participant_id, slot)
  );

  CREATE INDEX IF NOT EXISTS idx_availability_slot ON availability(slot);
`);

const DEFAULTS = {
  title: 'Game Night',
  start_date: dateOffset(0),
  end_date: dateOffset(13), // a two-week window by default; adjust anytime from /admin
  start_time: '17:00',
  end_time: '23:00',
  slot_minutes: '30',
  timezone: detectServerTimezone(),
  confirmed_slot: ''
};

function dateOffset(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function detectServerTimezone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch (e) {
    return 'UTC';
  }
}

const getConfigStmt = db.prepare('SELECT key, value FROM config');
const setConfigStmt = db.prepare(
  'INSERT INTO config (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
);

function seedDefaults() {
  const existing = Object.fromEntries(getConfigStmt.all().map((r) => [r.key, r.value]));
  const tx = db.transaction(() => {
    for (const [key, value] of Object.entries(DEFAULTS)) {
      if (!(key in existing)) setConfigStmt.run(key, value);
    }
  });
  tx();
}
seedDefaults();

module.exports = { db };
