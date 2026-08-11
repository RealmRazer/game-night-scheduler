# Game Night Scheduler

A small, self-hosted, When2meet-style scheduling tool. Players type their name and
paint the days/times they're free on a shared grid; everyone else's picks stack into
a heatmap so it's obvious at a glance when most people are free. An admin can lock in
the winning time and, once the session's over, wipe the board to start a new round.

No accounts, no external services, one SQLite file. Runs anywhere Node.js or Docker runs.

## Features

- **Shared availability grid** — click-and-drag (or touch-drag) to paint the times you can play.
- **Timezone-aware** — the admin sets the event's home timezone; every visitor sees times converted to their own browser timezone automatically (with a manual override dropdown), so a distributed group never has to do the math themselves.
- **Live heatmap** — darker cells mean more people are free; hover a cell to see who.
- **Filter by person** — click anyone's name to highlight just their picks on the grid and dim everyone else's.
- **Day overlap counter** — each day's column header shows the best overlap for that day (e.g. "3/4"), and lights up when everyone in the group shares at least one common time that day.
- **Most-popular slot highlight** — the single time (or times, if tied) with the highest overlap across the whole grid gets a small ★ marker, so the best pick jumps out without hovering every cell.
- **No login for players** — just a name
- **Admin panel** (`/admin`, password-protected)
  - Configure the date range, time window, and slot length (15/30/60 min) shown on the grid.
  - Click a cell to pick a candidate time, then confirm it — it's pinned to the top of the page for everyone.
  - Clear all responses to start a fresh round for the next game night.
- **Single SQLite file** for storage — no external database to run.

## Quick start (Docker — recommended for self-hosting)

```bash
git clone <this-repo-url> game-night-scheduler
cd game-night-scheduler
cp .env.example .env
# edit .env and set a real ADMIN_PASSWORD
docker compose up -d --build
```

The app is now running at `http://localhost:3000`. Data persists in `./data/scheduler.db`
on the host, so it survives container restarts/rebuilds.

To deploy on a VPS, point a reverse proxy (Caddy, nginx, Traefik) at port 3000 for
TLS/your domain — the app itself just serves plain HTTP.

## Quick start (plain Node.js)

Requires Node.js 18+.

```bash
git clone <this-repo-url> game-night-scheduler
cd game-night-scheduler
npm install
cp .env.example .env
# edit .env and set ADMIN_PASSWORD
npm start
```

Visit `http://localhost:3000`. The database file is created automatically at
`data/scheduler.db`.

## Deploying straight from GitHub

1. Push this repo to your own GitHub account (or fork it).
2. On your server: `git clone <your-fork-url> && cd game-night-scheduler`
3. `cp .env.example .env` and set `ADMIN_PASSWORD` to something real.
4. `docker compose up -d --build` (or the plain Node.js steps above).
5. To update later: `git pull && docker compose up -d --build`.

Any platform that can run a Dockerfile (Railway, Render, Fly.io, a home server, a
Raspberry Pi, etc.) will work — just make sure the `/app/data` volume (or `DATA_DIR`)
is persisted, and set the `ADMIN_PASSWORD` environment variable.

## Configuration

Set via environment variables (`.env` file or your platform's env settings):

| Variable         | Default    | Purpose                                       |
|------------------|------------|------------------------------------------------|
| `ADMIN_PASSWORD` | `changeme` | Password for `/admin`. **Change this.**        |
| `PORT`           | `3000`     | Port the server listens on.                    |
| `DATA_DIR`       | `./data`   | Where `scheduler.db` is stored.                |

The event title, date range, time window, and slot length are configured from the
admin panel itself (not environment variables), so you can adjust them between rounds
without redeploying.

## How timezones work

The admin sets an **event timezone** in the grid settings (defaults to the server's own
timezone on first run — check and change it in `/admin` before sharing the link). The
start/end date and time you configure are interpreted as wall-clock time in that
timezone. Internally, every slot is stored as an absolute point in time, so it's
unambiguous no matter who's looking at it.

On both the player and admin pages, a "Showing times in" dropdown (defaulting to
whatever the browser reports, overridable) controls how those slots are displayed —
so someone in Tokyo and someone in New York looking at the same grid see the same
real moments, just labeled in their own local time. This uses the browser's built-in
`Intl` timezone database, so no extra dependency or timezone data file is needed.

## How admin auth works

This is intentionally simple for a small, trusted-group tool: the admin panel checks
a single shared password against `ADMIN_PASSWORD` on every admin request (sent as an
`X-Admin-Password` header). There are no per-user admin accounts or sessions. If you
need stronger access control, put the app behind your reverse proxy's own auth (e.g.
Caddy `basicauth`, an nginx `auth_basic` block, or a Tailscale/VPN-only deployment).

## Project structure

```
server/
  index.js      Express app + API routes
  db.js         SQLite schema and defaults (better-sqlite3)
public/
  index.html    Player view — mark availability, see the heatmap
  admin.html    Admin view — grid settings, confirm a time, clear responses
  css/style.css Shared styling
  js/grid.js    Shared grid-building + click/drag-paint logic
  js/app.js     Player page logic
  js/admin.js   Admin page logic
```

## API overview

All endpoints are JSON. Admin endpoints require an `X-Admin-Password` header.

| Method | Path                        | Description                                  |
|--------|-----------------------------|-----------------------------------------------|
| GET    | `/api/config`               | Grid settings + confirmed slot                |
| GET    | `/api/availability`         | All participants and their selected slots     |
| GET    | `/api/availability/:name`   | One participant's saved slots                 |
| POST   | `/api/availability`         | Create/update a participant's availability     |
| DELETE | `/api/availability/:name`   | Remove a participant                          |
| POST   | `/api/admin/login`          | Check the admin password                      |
| POST   | `/api/admin/config`         | Update event title / date range / time window  |
| POST   | `/api/admin/confirm`        | Set (or clear) the confirmed slot              |
| POST   | `/api/admin/clear`          | Wipe all responses and the confirmed slot      |

## License

MIT — do whatever you'd like with it.
