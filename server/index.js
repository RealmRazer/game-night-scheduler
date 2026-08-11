require('dotenv').config();
const path = require('path');
const express = require('express');
const { db } = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'changeme';

if (ADMIN_PASSWORD === 'changeme') {
  console.warn(
    '[warn] ADMIN_PASSWORD is not set (using default "changeme"). Set it in your .env before deploying.'
  );
}

app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

const SLOT_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;

// ---------- helpers ----------

function getConfig() {
  const rows = db.prepare('SELECT key, value FROM config').all();
  const cfg = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  return {
    title: cfg.title,
    startDate: cfg.start_date,
    endDate: cfg.end_date,
    startTime: cfg.start_time,
    endTime: cfg.end_time,
    slotMinutes: Number(cfg.slot_minutes),
    timezone: cfg.timezone || 'UTC',
    confirmedSlot: cfg.confirmed_slot || null
  };
}

function isValidTimezone(tz) {
  if (typeof tz !== 'string' || !tz) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch (e) {
    return false;
  }
}

function requireAdmin(req, res, next) {
  const supplied = req.get('x-admin-password') || '';
  if (supplied !== ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Invalid admin password.' });
  }
  next();
}

// ---------- public API ----------

app.get('/api/config', (req, res) => {
  res.json(getConfig());
});

app.get('/api/availability', (req, res) => {
  const participants = db.prepare('SELECT id, name, updated_at FROM participants').all();
  const slotStmt = db.prepare('SELECT slot FROM availability WHERE participant_id = ?');
  const result = participants.map((p) => ({
    name: p.name,
    updatedAt: p.updated_at,
    slots: slotStmt.all(p.id).map((r) => r.slot)
  }));
  res.json({ participants: result });
});

// Create or update a participant's availability (also acts as "load my existing slots" via GET below)
app.post('/api/availability', (req, res) => {
  const { name, slots } = req.body || {};
  if (typeof name !== 'string' || !name.trim()) {
    return res.status(400).json({ error: 'A name is required.' });
  }
  if (!Array.isArray(slots) || slots.some((s) => typeof s !== 'string' || !SLOT_RE.test(s))) {
    return res.status(400).json({ error: 'Slots must be an array of valid slot IDs.' });
  }
  const cleanName = name.trim().slice(0, 60);

  const tx = db.transaction(() => {
    const existing = db.prepare('SELECT id FROM participants WHERE name = ?').get(cleanName);
    let participantId;
    if (existing) {
      participantId = existing.id;
      db.prepare('UPDATE participants SET updated_at = ? WHERE id = ?').run(
        new Date().toISOString(),
        participantId
      );
      db.prepare('DELETE FROM availability WHERE participant_id = ?').run(participantId);
    } else {
      const info = db
        .prepare('INSERT INTO participants (name, updated_at) VALUES (?, ?)')
        .run(cleanName, new Date().toISOString());
      participantId = info.lastInsertRowid;
    }
    const insertSlot = db.prepare('INSERT OR IGNORE INTO availability (participant_id, slot) VALUES (?, ?)');
    for (const slot of slots) insertSlot.run(participantId, slot);
  });
  tx();

  res.json({ ok: true });
});

app.get('/api/availability/:name', (req, res) => {
  const p = db.prepare('SELECT id FROM participants WHERE name = ?').get(req.params.name);
  if (!p) return res.json({ slots: [] });
  const slots = db.prepare('SELECT slot FROM availability WHERE participant_id = ?').all(p.id).map((r) => r.slot);
  res.json({ slots });
});

app.delete('/api/availability/:name', (req, res) => {
  const info = db.prepare('DELETE FROM participants WHERE name = ?').run(req.params.name);
  res.json({ removed: info.changes > 0 });
});

// ---------- admin API ----------

app.post('/api/admin/login', (req, res) => {
  const { password } = req.body || {};
  if (password === ADMIN_PASSWORD) return res.json({ ok: true });
  res.status(401).json({ error: 'Invalid password.' });
});

app.post('/api/admin/config', requireAdmin, (req, res) => {
  const { title, startDate, endDate, startTime, endTime, slotMinutes, timezone } = req.body || {};
  const errors = [];
  if (!title || typeof title !== 'string') errors.push('title');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate || '')) errors.push('startDate');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(endDate || '')) errors.push('endDate');
  if (!/^\d{2}:\d{2}$/.test(startTime || '')) errors.push('startTime');
  if (!/^\d{2}:\d{2}$/.test(endTime || '')) errors.push('endTime');
  const minutes = Number(slotMinutes);
  if (![15, 30, 60].includes(minutes)) errors.push('slotMinutes');
  if (!isValidTimezone(timezone)) errors.push('timezone');
  if (errors.length) return res.status(400).json({ error: `Invalid fields: ${errors.join(', ')}` });
  if (endDate < startDate) return res.status(400).json({ error: 'endDate must not be before startDate' });
  if (endTime <= startTime) return res.status(400).json({ error: 'endTime must be after startTime' });

  const set = db.prepare(
    'INSERT INTO config (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
  );
  const tx = db.transaction(() => {
    set.run('title', title.trim().slice(0, 80));
    set.run('start_date', startDate);
    set.run('end_date', endDate);
    set.run('start_time', startTime);
    set.run('end_time', endTime);
    set.run('slot_minutes', String(minutes));
    set.run('timezone', timezone);
  });
  tx();
  res.json(getConfig());
});

app.post('/api/admin/confirm', requireAdmin, (req, res) => {
  const { slot } = req.body || {};
  if (slot !== null && !SLOT_RE.test(slot || '')) {
    return res.status(400).json({ error: 'slot must be a valid slot ID or null to clear.' });
  }
  db.prepare(
    'INSERT INTO config (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
  ).run('confirmed_slot', slot || '');
  res.json(getConfig());
});

app.post('/api/admin/clear', requireAdmin, (req, res) => {
  const tx = db.transaction(() => {
    db.prepare('DELETE FROM availability').run();
    db.prepare('DELETE FROM participants').run();
    db.prepare(
      "INSERT INTO config (key, value) VALUES ('confirmed_slot', '') ON CONFLICT(key) DO UPDATE SET value = ''"
    ).run();
  });
  tx();
  res.json({ ok: true });
});

app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'admin.html'));
});

app.listen(PORT, () => {
  console.log(`Game Night Scheduler running at http://localhost:${PORT}`);
});
