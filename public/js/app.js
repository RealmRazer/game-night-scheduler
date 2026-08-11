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
    tzSelect: document.getElementById('tz-select'),
    filterStatus: document.getElementById('filter-status'),
    filterStatusName: document.getElementById('filter-status-name'),
    filterClearBtn: document.getElementById('filter-clear-btn')
  };

  let config = null;
  let participants = [];
  let editing = false;
  let editingSlots = new Set();
  let filteredName = null;
  let viewerTz = localStorage.getItem(TZ_STORAGE_KEY) || G.detectViewerTimezone();

  G.populateTimezoneSelect(els.tzSelect, viewerTz);
  els.tzSelect.addEventListener('change', () => {
    viewerTz = els.tzSelect.value;
    localStorage.setItem(TZ_STORAGE_KEY, viewerTz);
    renderConfirmedBanner();
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

  function renderChips() {
    if (!participants.length) {
      els.chips.innerHTML = '<span style="color:var(--text-muted); font-size:13px;">No one yet — be the first.</span>';
      return;
    }
    els.chips.innerHTML = '';
    participants.forEach((p) => {
      const chip = document.createElement('span');
      chip.className = 'chip' + (p.name === filteredName ? ' active' : '');
      chip.textContent = `${p.name} (${p.slots.length})`;
      chip.title = `Click to highlight ${p.name}'s picks`;
      chip.addEventListener('click', () => {
        filteredName = filteredName === p.name ? null : p.name;
        renderChips();
        renderFilterStatus();
        renderGrid();
      });
      els.chips.appendChild(chip);
    });
  }

  function renderFilterStatus() {
    els.filterStatus.classList.toggle('show', !!filteredName);
    els.filterStatusName.textContent = filteredName || '';
  }
  els.filterClearBtn.addEventListener('click', () => {
    filteredName = null;
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

    G.buildGrid(els.table, config, viewerTz, (td, slot) => {
      if (!slot) return; // empty/disabled cell at a timezone-offset edge
      if (editing) {
        if (editingSlots.has(slot)) td.style.background = 'var(--you)';
        else td.style.background = '';
      } else if (filteredName) {
        const person = participants.find((p) => p.name === filteredName);
        const matches = person && person.slots.includes(slot);
        td.classList.add(matches ? 'filter-match' : 'filter-dim');
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
      } else {
        const count = counts[slot] || 0;
        td.style.background = G.heatColor(count / maxCount);
        if (currentName && mySavedSlots.has(slot)) td.classList.add('you-selected');
        if (config.confirmedSlot === slot) td.classList.add('confirmed');
        if (actualMax > 1 && count === actualMax) td.classList.add('peak');
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
    if (filteredName && !participants.some((p) => p.name === filteredName)) filteredName = null;
    els.title.textContent = config.title;
    document.title = `${config.title} — Scheduler`;
    renderConfirmedBanner();
    renderChips();
    renderFilterStatus();
    renderGrid();
  }

  function enterEditMode() {
    const name = els.nameInput.value.trim();
    if (!name) { showToast('Enter your name first.'); els.nameInput.focus(); return; }
    editing = true;
    filteredName = null;
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
