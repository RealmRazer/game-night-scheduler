(function () {
  const G = window.GridUtils;
  const STORAGE_KEY = 'gns_admin_password';
  const TZ_STORAGE_KEY = 'gns_viewer_tz';

  const els = {
    loginView: document.getElementById('login-view'),
    adminView: document.getElementById('admin-view'),
    passwordInput: document.getElementById('admin-password'),
    loginBtn: document.getElementById('login-btn'),
    loginError: document.getElementById('login-error'),
    logoutBtn: document.getElementById('logout-btn'),

    cfgTitle: document.getElementById('cfg-title'),
    cfgStartDate: document.getElementById('cfg-start-date'),
    cfgEndDate: document.getElementById('cfg-end-date'),
    cfgStartTime: document.getElementById('cfg-start-time'),
    cfgEndTime: document.getElementById('cfg-end-time'),
    cfgSlotMinutes: document.getElementById('cfg-slot-minutes'),
    cfgTimezone: document.getElementById('cfg-timezone'),
    saveConfigBtn: document.getElementById('save-config-btn'),
    configStatus: document.getElementById('config-status'),

    confirmedBannerSlot: document.getElementById('confirmed-banner-slot'),
    confirmBtn: document.getElementById('confirm-btn'),
    unconfirmBtn: document.getElementById('unconfirm-btn'),
    table: document.getElementById('grid-table'),
    legend: document.getElementById('legend-swatches'),
    tooltip: document.getElementById('tooltip'),
    toast: document.getElementById('toast'),
    chips: document.getElementById('participant-chips'),
    responseCount: document.getElementById('response-count'),
    clearBtn: document.getElementById('clear-btn'),
    tzSelect: document.getElementById('tz-select'),
    filterStatus: document.getElementById('filter-status'),
    filterStatusName: document.getElementById('filter-status-name'),
    filterClearBtn: document.getElementById('filter-clear-btn')
  };

  let config = null;
  let participants = [];
  let pendingSlot = null;
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

  function adminHeaders() {
    return {
      'Content-Type': 'application/json',
      'X-Admin-Password': sessionStorage.getItem(STORAGE_KEY) || ''
    };
  }

  // ---------- login ----------

  async function tryLogin(password) {
    const res = await fetch('/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password })
    });
    if (!res.ok) return false;
    sessionStorage.setItem(STORAGE_KEY, password);
    return true;
  }

  els.loginBtn.addEventListener('click', async () => {
    const ok = await tryLogin(els.passwordInput.value);
    if (!ok) {
      els.loginError.textContent = 'Incorrect password.';
      els.loginError.style.display = 'block';
      return;
    }
    showAdmin();
  });
  els.passwordInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') els.loginBtn.click();
  });

  els.logoutBtn.addEventListener('click', () => {
    sessionStorage.removeItem(STORAGE_KEY);
    els.adminView.style.display = 'none';
    els.loginView.style.display = '';
  });

  async function showAdmin() {
    els.loginView.style.display = 'none';
    els.adminView.style.display = '';
    await loadAll();
  }

  // ---------- data ----------

  async function loadAll() {
    const [cfgRes, availRes] = await Promise.all([
      fetch('/api/config'),
      fetch('/api/availability')
    ]);
    config = await cfgRes.json();
    participants = (await availRes.json()).participants;
    if (filteredName && !participants.some((p) => p.name === filteredName)) filteredName = null;
    pendingSlot = config.confirmedSlot;
    populateConfigForm();
    renderConfirmedBanner();
    renderChips();
    renderFilterStatus();
    renderGrid();
  }

  function populateConfigForm() {
    els.cfgTitle.value = config.title;
    els.cfgStartDate.value = config.startDate;
    els.cfgEndDate.value = config.endDate;
    els.cfgStartTime.value = config.startTime;
    els.cfgEndTime.value = config.endTime;
    els.cfgSlotMinutes.value = String(config.slotMinutes);
    G.populateTimezoneSelect(els.cfgTimezone, config.timezone);
  }

  els.saveConfigBtn.addEventListener('click', async () => {
    const body = {
      title: els.cfgTitle.value,
      startDate: els.cfgStartDate.value,
      endDate: els.cfgEndDate.value,
      startTime: els.cfgStartTime.value,
      endTime: els.cfgEndTime.value,
      slotMinutes: Number(els.cfgSlotMinutes.value),
      timezone: els.cfgTimezone.value
    };
    const res = await fetch('/api/admin/config', { method: 'POST', headers: adminHeaders(), body: JSON.stringify(body) });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      els.configStatus.textContent = err.error || 'Could not save settings.';
      els.configStatus.style.color = 'var(--danger)';
      return;
    }
    els.configStatus.textContent = 'Saved.';
    els.configStatus.style.color = 'var(--text-muted)';
    await loadAll();
    setTimeout(() => { els.configStatus.textContent = ''; }, 2500);
  });

  // ---------- confirmed banner / chips ----------

  function renderConfirmedBanner() {
    els.confirmedBannerSlot.innerHTML = '';
    if (!config.confirmedSlot) return;
    const div = document.createElement('div');
    div.className = 'confirmed-banner';
    div.innerHTML = `<span class="dot"></span><div><div class="label">Confirmed time</div><div class="value">${G.formatSlotFull(config.confirmedSlot, viewerTz)}</div></div>`;
    els.confirmedBannerSlot.appendChild(div);
  }

  function renderChips() {
    els.responseCount.textContent = participants.length;
    if (!participants.length) {
      els.chips.innerHTML = '<span style="color:var(--text-muted); font-size:13px;">No one yet.</span>';
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

  // ---------- grid ----------

  function computeCounts() {
    const counts = {};
    participants.forEach((p) => p.slots.forEach((s) => { counts[s] = (counts[s] || 0) + 1; }));
    return counts;
  }

  function whoIsFree(slot) {
    return participants.filter((p) => p.slots.includes(slot)).map((p) => p.name);
  }

  function updateConfirmButtons() {
    els.confirmBtn.disabled = !pendingSlot || pendingSlot === config.confirmedSlot;
    els.unconfirmBtn.style.display = config.confirmedSlot ? '' : 'none';
  }

  function renderGrid() {
    const counts = computeCounts();
    const countValues = Object.values(counts);
    const maxCount = Math.max(1, ...countValues);
    const actualMax = countValues.length ? Math.max(...countValues) : 0;
    const totalParticipants = participants.length;
    const filterPerson = filteredName ? participants.find((p) => p.name === filteredName) : null;

    G.buildGrid(els.table, config, viewerTz, (td, slot) => {
      if (!slot) return; // empty/disabled cell at a timezone-offset edge
      if (filterPerson) {
        td.classList.add(filterPerson.slots.includes(slot) ? 'filter-match' : 'filter-dim');
      } else {
        const count = counts[slot] || 0;
        td.style.background = G.heatColor(count / maxCount);
        if (actualMax > 1 && count === actualMax) td.classList.add('peak');
      }
      if (config.confirmedSlot === slot) td.classList.add('confirmed');
      else if (pendingSlot === slot) td.classList.add('pending');

      td.addEventListener('click', () => {
        pendingSlot = pendingSlot === slot ? null : slot;
        renderGrid();
      });
      td.addEventListener('mouseenter', (e) => {
        const names = whoIsFree(slot);
        els.tooltip.innerHTML = `${G.formatSlotFull(slot, viewerTz)}<br><span class="who">${names.length ? names.join(', ') : 'nobody yet'}</span>`;
        els.tooltip.style.display = 'block';
      });
      td.addEventListener('mousemove', (e) => {
        els.tooltip.style.left = e.clientX + 14 + 'px';
        els.tooltip.style.top = e.clientY + 14 + 'px';
      });
      td.addEventListener('mouseleave', () => { els.tooltip.style.display = 'none'; });
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
    updateConfirmButtons();
  }

  els.confirmBtn.addEventListener('click', async () => {
    const res = await fetch('/api/admin/confirm', { method: 'POST', headers: adminHeaders(), body: JSON.stringify({ slot: pendingSlot }) });
    if (!res.ok) { showToast('Could not confirm.'); return; }
    showToast('Time confirmed!');
    await loadAll();
  });

  els.unconfirmBtn.addEventListener('click', async () => {
    const res = await fetch('/api/admin/confirm', { method: 'POST', headers: adminHeaders(), body: JSON.stringify({ slot: null }) });
    if (!res.ok) { showToast('Could not clear.'); return; }
    showToast('Confirmed time cleared.');
    pendingSlot = null;
    await loadAll();
  });

  els.clearBtn.addEventListener('click', async () => {
    if (!confirm('This deletes every response and the confirmed time, starting a fresh round. Continue?')) return;
    const res = await fetch('/api/admin/clear', { method: 'POST', headers: adminHeaders() });
    if (!res.ok) { showToast('Could not clear responses.'); return; }
    showToast('Responses cleared. Ready for a new round.');
    pendingSlot = null;
    await loadAll();
  });

  // ---------- boot ----------

  (function boot() {
    const saved = sessionStorage.getItem(STORAGE_KEY);
    if (saved) {
      tryLogin(saved).then((ok) => { if (ok) showAdmin(); });
    }
  })();
})();
