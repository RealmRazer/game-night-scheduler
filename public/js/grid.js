// Shared utilities for building the availability grid, with real timezone conversion.
// Slots are stored/keyed as absolute UTC instants ("2026-08-16T01:00") so aggregation
// across viewers in different timezones is always correct. Each viewer's browser
// projects those instants into their own local calendar/time-of-day for display.
window.GridUtils = (function () {
  function pad2(n) { return String(n).padStart(2, '0'); }

  // ---------- event-local calendar helpers (used to enumerate the admin's configured window) ----------

  function dateRange(startDate, endDate) {
    const dates = [];
    let cur = new Date(startDate + 'T00:00:00Z');
    const end = new Date(endDate + 'T00:00:00Z');
    while (cur <= end) {
      dates.push(cur.toISOString().slice(0, 10));
      cur.setUTCDate(cur.getUTCDate() + 1);
    }
    return dates;
  }

  function timeRange(startTime, endTime, slotMinutes) {
    const [sh, sm] = startTime.split(':').map(Number);
    const [eh, em] = endTime.split(':').map(Number);
    const startMin = sh * 60 + sm;
    const endMin = eh * 60 + em;
    const times = [];
    for (let t = startMin; t < endMin; t += slotMinutes) {
      times.push(`${pad2(Math.floor(t / 60))}:${pad2(t % 60)}`);
    }
    return times;
  }

  // ---------- timezone conversion (no external library; uses Intl only) ----------

  function getTimeZoneOffsetMs(instantMs, timeZone) {
    const dtf = new Intl.DateTimeFormat('en-US', {
      timeZone, hour12: false,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit'
    });
    const map = {};
    dtf.formatToParts(new Date(instantMs)).forEach((p) => { if (p.type !== 'literal') map[p.type] = p.value; });
    let hour = Number(map.hour);
    if (hour === 24) hour = 0;
    const asIfUTC = Date.UTC(Number(map.year), Number(map.month) - 1, Number(map.day), hour, Number(map.minute), Number(map.second));
    return asIfUTC - instantMs;
  }

  // Converts a wall-clock date+time as understood in `timeZone` into an absolute instant (Date, UTC-based).
  function zonedTimeToUtc(dateStr, timeStr, timeZone) {
    const [y, mo, d] = dateStr.split('-').map(Number);
    const [hh, mm] = timeStr.split(':').map(Number);
    let guessMs = Date.UTC(y, mo - 1, d, hh, mm, 0);
    for (let i = 0; i < 2; i++) {
      const offset = getTimeZoneOffsetMs(guessMs, timeZone);
      guessMs = Date.UTC(y, mo - 1, d, hh, mm, 0) - offset;
    }
    return new Date(guessMs);
  }

  // Converts an absolute instant into wall-clock date/time as seen in `timeZone`.
  function utcToZonedParts(date, timeZone) {
    const dtf = new Intl.DateTimeFormat('en-US', {
      timeZone, hour12: false,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit'
    });
    const map = {};
    dtf.formatToParts(date).forEach((p) => { if (p.type !== 'literal') map[p.type] = p.value; });
    const hour = map.hour === '24' ? '00' : map.hour;
    return { date: `${map.year}-${map.month}-${map.day}`, time: `${hour}:${map.minute}` };
  }

  function tzAbbreviation(date, timeZone) {
    try {
      const part = new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName: 'short' })
        .formatToParts(date).find((p) => p.type === 'timeZoneName');
      return part ? part.value : timeZone;
    } catch (e) {
      return timeZone;
    }
  }

  function detectViewerTimezone() {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    } catch (e) {
      return 'UTC';
    }
  }

  const FALLBACK_TIMEZONES = [
    'UTC', 'Pacific/Honolulu', 'America/Anchorage', 'America/Los_Angeles', 'America/Denver',
    'America/Phoenix', 'America/Chicago', 'America/New_York', 'America/Sao_Paulo',
    'Atlantic/Azores', 'Europe/London', 'Europe/Paris', 'Europe/Berlin', 'Europe/Athens',
    'Europe/Moscow', 'Africa/Cairo', 'Africa/Johannesburg', 'Asia/Jerusalem', 'Asia/Dubai',
    'Asia/Karachi', 'Asia/Kolkata', 'Asia/Dhaka', 'Asia/Bangkok', 'Asia/Shanghai',
    'Asia/Tokyo', 'Asia/Seoul', 'Australia/Perth', 'Australia/Adelaide', 'Australia/Sydney',
    'Pacific/Auckland'
  ];

  function listTimezones() {
    try {
      if (typeof Intl.supportedValuesOf === 'function') {
        const zones = Intl.supportedValuesOf('timeZone');
        if (zones && zones.length) return zones;
      }
    } catch (e) { /* fall through */ }
    return FALLBACK_TIMEZONES;
  }

  // ---------- absolute slot id helpers ----------

  function isoUtcSlotId(date) {
    return `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}-${pad2(date.getUTCDate())}T${pad2(date.getUTCHours())}:${pad2(date.getUTCMinutes())}`;
  }

  function slotIdToDate(slot) {
    return new Date(slot + ':00Z');
  }

  // All slot instants for the admin's configured window, computed in the event's timezone.
  function eventSlotInstants(config) {
    const dates = dateRange(config.startDate, config.endDate);
    const times = timeRange(config.startTime, config.endTime, config.slotMinutes);
    const instants = [];
    dates.forEach((d) => times.forEach((t) => instants.push(zonedTimeToUtc(d, t, config.timezone))));
    instants.sort((a, b) => a - b);
    return instants;
  }

  function formatTimeLabel(time) {
    const [h, m] = time.split(':').map(Number);
    const period = h >= 12 ? 'PM' : 'AM';
    const h12 = h % 12 === 0 ? 12 : h % 12;
    return m === 0 ? `${h12} ${period}` : `${h12}:${pad2(m)} ${period}`;
  }

  function formatDateHeader(dateStr) {
    const d = new Date(dateStr + 'T00:00:00');
    return {
      dow: d.toLocaleDateString(undefined, { weekday: 'short' }),
      dom: d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
    };
  }

  // Full human label for a slot, shown in the given viewer's timezone.
  function formatSlotFull(slot, viewerTz) {
    const instant = slotIdToDate(slot);
    const { date, time } = utcToZonedParts(instant, viewerTz);
    const d = new Date(date + 'T00:00:00');
    const dateLabel = d.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
    const abbr = tzAbbreviation(instant, viewerTz);
    return `${dateLabel}, ${formatTimeLabel(time)} ${abbr}`;
  }

  // Interpolates between --surface-2 and --accent based on ratio 0..1
  const HEAT_STOPS = ['#232a3d', '#3a3a30', '#5c4f28', '#8a7025', '#c69a2a', '#e8b339'];

  function heatColor(ratio) {
    if (ratio <= 0) return HEAT_STOPS[0];
    const idx = Math.min(HEAT_STOPS.length - 1, Math.ceil(ratio * (HEAT_STOPS.length - 1)));
    return HEAT_STOPS[idx];
  }

  // Builds the <thead> + <tbody> of the grid table, projected into the viewer's timezone.
  // Columns are the viewer's local calendar dates; rows are the viewer's local times-of-day
  // that actually have a slot. Cells with no corresponding slot (can happen at the edges when
  // a timezone offset isn't a whole number of slot-lengths) render as empty/disabled.
  // onCellRender(td, slot|null, localDate, localTime)
  // onHeaderRender(th, localDate, slotsForThatDate) — optional, called for each day column header.
  function buildGrid(table, config, viewerTz, onCellRender, onHeaderRender) {
    table.innerHTML = '';
    const instants = eventSlotInstants(config);

    const cellMap = new Map();
    const dateSet = new Set();
    const timeSet = new Set();
    instants.forEach((instant) => {
      const { date, time } = utcToZonedParts(instant, viewerTz);
      cellMap.set(`${date}|${time}`, instant);
      dateSet.add(date);
      timeSet.add(time);
    });
    const dates = Array.from(dateSet).sort();
    const times = Array.from(timeSet).sort();

    const thead = document.createElement('thead');
    const headRow = document.createElement('tr');
    const corner = document.createElement('th');
    corner.style.background = 'var(--surface)';
    headRow.appendChild(corner);
    dates.forEach((date) => {
      const th = document.createElement('th');
      const { dow, dom } = formatDateHeader(date);
      th.innerHTML = `<div class="dow">${dow}</div><div class="dom">${dom}</div>`;
      if (onHeaderRender) {
        const daySlots = times
          .map((time) => cellMap.get(`${date}|${time}`))
          .filter(Boolean)
          .map((instant) => isoUtcSlotId(instant));
        onHeaderRender(th, date, daySlots);
      }
      headRow.appendChild(th);
    });
    thead.appendChild(headRow);
    table.appendChild(thead);

    const tbody = document.createElement('tbody');
    times.forEach((time) => {
      const tr = document.createElement('tr');
      const isHourMark = time.endsWith(':00');
      if (isHourMark) tr.className = 'hour-line';
      const timeTd = document.createElement('td');
      timeTd.className = 'time-cell';
      timeTd.textContent = isHourMark ? formatTimeLabel(time) : '';
      tr.appendChild(timeTd);
      dates.forEach((date) => {
        const td = document.createElement('td');
        const instant = cellMap.get(`${date}|${time}`);
        if (instant) {
          td.className = 'slot-cell';
          td.dataset.slot = isoUtcSlotId(instant);
        } else {
          td.className = 'slot-cell slot-cell-empty';
        }
        onCellRender(td, td.dataset.slot || null, date, time);
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
  }

  function buildLegend(container) {
    container.innerHTML = '';
    HEAT_STOPS.forEach((c) => {
      const sw = document.createElement('span');
      sw.className = 'legend-swatch';
      sw.style.background = c;
      container.appendChild(sw);
    });
  }

  function populateTimezoneSelect(selectEl, selectedTz) {
    selectEl.innerHTML = '';
    const zones = listTimezones();
    if (!zones.includes(selectedTz)) zones.unshift(selectedTz);
    zones.forEach((tz) => {
      const opt = document.createElement('option');
      opt.value = tz;
      opt.textContent = tz.replace(/_/g, ' ');
      if (tz === selectedTz) opt.selected = true;
      selectEl.appendChild(opt);
    });
  }

  // Attaches click-drag (mouse + touch) painting behavior to a grid table.
  // Cells with no dataset.slot (empty/disabled cells) are ignored.
  function attachPaintHandlers(table, onToggle, isSelected) {
    let painting = false;
    let paintValue = true;

    function cellFromPoint(x, y) {
      const el = document.elementFromPoint(x, y);
      return el && el.classList.contains('slot-cell') && el.dataset.slot ? el : null;
    }

    function startPaint(td) {
      painting = true;
      paintValue = !isSelected(td.dataset.slot);
      onToggle(td.dataset.slot, paintValue);
    }

    table.addEventListener('mousedown', (e) => {
      const td = e.target.closest('.slot-cell');
      if (!td || !td.dataset.slot) return;
      e.preventDefault();
      startPaint(td);
    });
    table.addEventListener('mouseover', (e) => {
      if (!painting) return;
      const td = e.target.closest('.slot-cell');
      if (!td || !td.dataset.slot) return;
      onToggle(td.dataset.slot, paintValue);
    });
    document.addEventListener('mouseup', () => { painting = false; });

    table.addEventListener('touchstart', (e) => {
      const touch = e.touches[0];
      const td = cellFromPoint(touch.clientX, touch.clientY);
      if (!td) return;
      e.preventDefault();
      startPaint(td);
    }, { passive: false });
    table.addEventListener('touchmove', (e) => {
      if (!painting) return;
      const touch = e.touches[0];
      const td = cellFromPoint(touch.clientX, touch.clientY);
      if (!td) return;
      e.preventDefault();
      onToggle(td.dataset.slot, paintValue);
    }, { passive: false });
    document.addEventListener('touchend', () => { painting = false; });
  }

  return {
    dateRange, timeRange, formatTimeLabel, formatDateHeader, formatSlotFull,
    heatColor, buildGrid, buildLegend, attachPaintHandlers,
    detectViewerTimezone, listTimezones, populateTimezoneSelect, tzAbbreviation
  };
})();
