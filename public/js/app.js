(function () {
  const G = window.GridUtils;
  const TZ_STORAGE_KEY = 'gns_viewer_tz';

  const els = {
    title: document.getElementById('event-title'),
    nameInput: document.getElementById('name-input'),
    editBtn: document.getElementById('edit-btn'),
    saveBtn: document.getElementById('save-btn'),
    cancelBtn: document.getElementById('cancel-btn'),
    removeBtn: document.getElementById('remove-btn'),
    editingHelp: document.getElementById('editing-help'),
    modePill: document.getElementById('mode-pill'),
    table: document.getElementById('grid-table'),
    legend: document.getElementById('legend-swatches'),
    tooltip: document.getElementById('tooltip'),
    toast: document.getElementById('toast'),
    chips: document.getElementById('participant-chips'),
    confirmedSlot: document.getElementById('confirmed-banner-slot'),
    shortlistPanel: document.getElementById('shortlist-panel'),
    tzSelect: document.getElementById('tz-select'),
    filterStatus: document.getElementById('filter-status'),
    filterStatusName: document.getElementById('filter-status-name'),
    filterClearBtn: document.getElementById('filter-clear-btn')
  };

  let config = null;
  let participants = [];
  let editing = false;
  let editingSlots = new Set();
  let filteredNames = new Set();
  let viewerTz = localStorage.getItem(TZ_STORAGE_KEY) || G.detectViewerTimezone();

  G.populateTimezoneSelect(els.tzSelect, viewerTz);
  els.tzSelect.addEventListener('change', () => {
    viewerTz = els.tzSelect.value;
    localStorage.setItem(TZ_STORAGE_KEY, viewerTz);
    renderConfirmedBanner();
    renderShortlist();
    renderGrid();
  });

  function showToast(msg) {
    els.toast.textContent = msg;
    els.toast.classList.add('show');
    setTimeout(() => els.toast.classList.remove('show'), 2200);
  }

  function computeCounts() {
    const counts = {};
    participants.forEach((p) => {
      p.slots.forEach((s) => { counts[s] = (counts[s] || 0) + 1; });
    });
    return counts;
  }

  function whoIsFree(slot) {
    return participants.filter((p) => p.slots.includes(slot)).map((p) => p.name);
  }

  function renderConfirmedBanner() {
    els.confirmedSlot.innerHTML = '';
    if (!config.confirmedSlot) return;
    const div = document.createElement('div');
    div.className = 'confirmed-banner';
    div.innerHTML = `<span class="dot"></span><div><div class="label">Confirmed time</div><div class="value">${G.formatSlotFull(config.confirmedSlot, viewerTz)}</div></div>`;
    els.confirmedSlot.appendChild(div);
  }

  function renderShortlist() {
    els.shortlistPanel.innerHTML = '';
    const list = config.shortlist || [];
    if (!list.length) return;
    const wrap = document.createElement('div');
    wrap.className = 'panel';
    const title = document.createElement('p');
    title.className = 'panel-title';
    title.textContent = `Being considered (${list.length})`;
    wrap.appendChild(title);
    list.forEach((slot) => {
      const item = document.createElement('div');
      item.className = 'shortlist-item';
      const names = whoIsFree(slot);
      item.innerHTML = `<div><div class="slot-label">${G.formatSlotFull(slot, viewerTz)}</div><div class="slot-meta">${names.length ? names.length + ' free: ' + names.join(', ') : 'nobody free yet'}</div></div>`;
      wrap.appendChild(item);
    });
    els.shortlistPanel.appendChild(wrap);
  }

  function renderChips() {
    if (!participants.length) {
      els.chips.innerHTML = '<span style="color:var(--text-muted); font-size:13px;">No one yet — be the first.</span>';
      return;
    }
    els.chips.innerHTML = '';
    participants.forEach((p) => {
      const chip = document.createElement('span');
      chip.className = 'chip' + (filteredNames.has(p.name) ? ' active' : '');
      chip.textContent = `${p.name} (${p.slots.length})`;
      chip.title = `Click to highlight ${p.name}'s picks`;
      chip.addEventListener('click', () => {
        if (filteredNames.has(p.name)) filteredNames.delete(p.name);
        else filteredNames.add(p.name);
        renderChips();
        renderFilterStatus();
        renderGrid();
      });
      els.chips.appendChild(chip);
    });
  }

  function renderFilterStatus() {
    const active = filteredNames.size > 0;
    els.filterStatus.classList.toggle('show', active);
    els.filterStatusName.textContent = active ? Array.from(filteredNames).join(', ') : '';
  }
  els.filterClearBtn.addEventListener('click', () => {
    filteredNames.clear();
    renderChips();
    renderFilterStatus();
    renderGrid();
  });

  function renderGrid() {
    const counts = computeCounts();
    const countValues = Object.values(counts);
    const maxCount = Math.max(1, ...countValues);
    const actualMax = countValues.length ? Math.max(...countValues) : 0;
    const totalParticipants = participants.length;
    const currentName = els.nameInput.value.trim();
    const mySavedSlots = new Set(
      (participants.find((p) => p.name === currentName) || { slots: [] }).slots
    );
    const shortlist = new Set(config.shortlist || []);

    function attachTooltip(td, slot) {
      td.addEventListener('mouseenter', (e) => {
        const names = whoIsFree(slot);
        if (!names.length) return;
        els.tooltip.innerHTML = `${G.formatSlotFull(slot, viewerTz)}<br><span class="who">${names.join(', ')}</span>`;
        els.tooltip.style.display = 'block';
      });
      td.addEventListener('mousemove', (e) => {
        els.tooltip.style.left = e.clientX + 14 + 'px';
        els.tooltip.style.top = e.clientY + 14 + 'px';
      });
      td.addEventListener('mouseleave', () => { els.tooltip.style.display = 'none'; });
    }

    G.buildGrid(els.table, config, viewerTz, (td, slot) => {
      if (!slot) return; // empty/disabled cell at a timezone-offset edge
      if (editing) {
        if (editingSlots.has(slot)) td.style.background = 'var(--you)';
        else td.style.background = '';
      } else if (filteredNames.size > 0) {
        const matchCount = participants.filter((p) => filteredNames.has(p.name) && p.slots.includes(slot)).length;
        if (matchCount === 0) td.classList.add('filter-dim');
        else if (matchCount === filteredNames.size) td.classList.add('filter-match');
        else td.classList.add('filter-partial');
        attachTooltip(td, slot);
      } else {
        const count = counts[slot] || 0;
        td.style.background = G.heatColor(count / maxCount);
        if (currentName && mySavedSlots.has(slot)) td.classList.add('you-selected');
        if (config.confirmedSlot === slot) td.classList.add('confirmed');
        else if (shortlist.has(slot)) td.classList.add('shortlisted');
        if (actualMax > 1 && count === actualMax) td.classList.add('peak');
        attachTooltip(td, slot);
      }
    }, (th, date, daySlots) => {
      if (!totalParticipants) return;
      const dayMax = daySlots.reduce((m, s) => Math.max(m, counts[s] || 0), 0);
      const badge = document.createElement('div');
      badge.className = 'day-counter' + (dayMax === totalParticipants ? ' full' : '');
      badge.textContent = `${dayMax}/${totalParticipants}`;
      badge.title = dayMax === totalParticipants
        ? 'Everyone shares at least one time this day'
        : `Best overlap this day: ${dayMax} of ${totalParticipants}`;
      th.appendChild(badge);
    });

    G.buildLegend(els.legend);
  }

  G.attachPaintHandlers(
    els.table,
    (slot, value) => {
      if (!editing) return;
      if (value) editingSlots.add(slot); else editingSlots.delete(slot);
      const td = els.table.querySelector(`[data-slot="${slot}"]`);
      if (td) td.style.background = value ? 'var(--you)' : '';
    },
    (slot) => editingSlots.has(slot)
  );

  async function loadAll() {
    const [cfgRes, availRes] = await Promise.all([
      fetch('/api/config'),
      fetch('/api/availability')
    ]);
    config = await cfgRes.json();
    participants = (await availRes.json()).participants;
    const stillPresent = new Set(participants.map((p) => p.name));
    filteredNames.forEach((n) => { if (!stillPresent.has(n)) filteredNames.delete(n); });
    els.title.textContent = config.title;
    document.title = `${config.title} — Scheduler`;
    renderConfirmedBanner();
    renderShortlist();
    renderChips();
    renderFilterStatus();
    renderGrid();
  }

  function enterEditMode() {
    const name = els.nameInput.value.trim();
    if (!name) { showToast('Enter your name first.'); els.nameInput.focus(); return; }
    editing = true;
    filteredNames.clear();
    renderChips();
    renderFilterStatus();
    const existing = participants.find((p) => p.name === name);
    editingSlots = new Set(existing ? existing.slots : []);
    els.editingHelp.style.display = '';
    els.modePill.textContent = 'editing';
    els.modePill.classList.add('editing');
    els.removeBtn.style.display = existing ? '' : 'none';
    els.nameInput.disabled = true;
    els.editBtn.disabled = true;
    renderGrid();
  }

  function exitEditMode() {
    editing = false;
    els.editingHelp.style.display = 'none';
    els.modePill.textContent = 'viewing';
    els.modePill.classList.remove('editing');
    els.nameInput.disabled = false;
    els.editBtn.disabled = false;
    renderGrid();
  }

  els.editBtn.addEventListener('click', enterEditMode);
  els.cancelBtn.addEventListener('click', exitEditMode);

  els.saveBtn.addEventListener('click', async () => {
    const name = els.nameInput.value.trim();
    const res = await fetch('/api/availability', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, slots: Array.from(editingSlots) })
    });
    if (!res.ok) { showToast('Could not save. Try again.'); return; }
    showToast('Availability saved.');
    await loadAll();
    exitEditMode();
  });

  els.removeBtn.addEventListener('click', async () => {
    const name = els.nameInput.value.trim();
    if (!confirm(`Remove all availability for "${name}"?`)) return;
    await fetch(`/api/availability/${encodeURIComponent(name)}`, { method: 'DELETE' });
    showToast('Removed.');
    await loadAll();
    exitEditMode();
  });

  loadAll();
  setInterval(() => { if (!editing) loadAll(); }, 15000);
})();
