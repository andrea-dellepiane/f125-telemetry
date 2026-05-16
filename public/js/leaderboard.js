'use strict';
/**
 * Live Race Leaderboard
 * Renders the real-time race order with driver codes, team colours,
 * gaps, intervals, best lap times, pit indicators and fastest-lap highlights.
 */
(function () {

  const TYRE_SYMBOLS = {
    16: { label: 'S', cls: 'tyre-s' },
    17: { label: 'M', cls: 'tyre-m' },
    18: { label: 'H', cls: 'tyre-h' },
    7:  { label: 'I', cls: 'tyre-i' },
    8:  { label: 'W', cls: 'tyre-w' },
  };

  function msToGap(ms) {
    if (ms <= 0) return 'Leader';
    if (ms >= 60000) return `+${Math.floor(ms / 60000)}L`;
    return `+${(ms / 1000).toFixed(3)}s`;
  }

  function msToInterval(ms) {
    if (ms == null || ms <= 0) return '—';
    if (ms >= 60000) return `+${Math.floor(ms / 60000)}L`;
    return `+${(ms / 1000).toFixed(3)}s`;
  }

  function msToLapTime(ms) {
    if (!ms || ms <= 0) return '–:––.–––';
    const m   = Math.floor(ms / 60000);
    const s   = Math.floor((ms % 60000) / 1000);
    const ms3 = ms % 1000;
    return `${m}:${String(s).padStart(2, '0')}.${String(ms3).padStart(3, '0')}`;
  }

  function render(cars) {
    const container = document.getElementById('leaderboard-rows');
    if (!container) return;

    container.innerHTML = '';

    cars.forEach((car, i) => {
      const pos    = car.position || i + 1;
      const tyre   = TYRE_SYMBOLS[car.tyreCompound] || { label: '?', cls: '' };
      const isPlayer = !!car.isPlayer;
      const inPit    = car.pitStatus > 0;
      const isLapped = (car.gapToLeaderMs || 0) >= 60000;

      const row = document.createElement('div');
      row.className = 'lb-row' +
        (isPlayer     ? ' lb-player'  : '') +
        (car.hasFastestLap ? ' lb-fastest' : '') +
        (inPit        ? ' lb-in-pit'  : '') +
        (isLapped     ? ' lb-lapped'  : '');
      row.dataset.carIndex = car.carIndex;

      // ── Position ──────────────────────────────────────────────────────────
      const posEl = document.createElement('span');
      posEl.className = 'lb-pos';
      posEl.textContent = pos;

      // ── Team colour bar ───────────────────────────────────────────────────
      const colBar = document.createElement('span');
      colBar.className = 'lb-team-bar';
      colBar.style.background = car.teamColor || '#444';

      // ── Driver code + badges ──────────────────────────────────────────────
      const codeEl = document.createElement('span');
      codeEl.className = 'lb-code';
      let codeHTML = '';
      if (car.hasFastestLap) codeHTML += '<span class="lb-fl">🟣</span>';
      codeHTML += (car.driverCode || '???');
      if (inPit) codeHTML += '<span class="lb-pit-dot">PIT</span>';
      codeEl.innerHTML = codeHTML;

      // ── Tyre badge ────────────────────────────────────────────────────────
      const tyreEl = document.createElement('span');
      tyreEl.className = `lb-tyre ${tyre.cls}`;
      tyreEl.textContent = tyre.label;

      // ── Gap / Interval ────────────────────────────────────────────────────
      const gapEl = document.createElement('span');
      gapEl.className = 'lb-gap';
      if (pos === 1) {
        gapEl.innerHTML = '<span class="lb-gap-leader">Leader</span>';
      } else {
        const intMs = car.intervalMs != null ? car.intervalMs : (car.gapToLeaderMs || 0);
        const intText   = msToInterval(intMs);
        const totalText = msToGap(car.gapToLeaderMs || 0);
        gapEl.innerHTML =
          `<span class="lb-gap-int">${intText}</span>` +
          `<span class="lb-gap-total">${totalText}</span>`;
      }

      row.appendChild(posEl);
      row.appendChild(colBar);
      row.appendChild(codeEl);
      row.appendChild(tyreEl);
      row.appendChild(gapEl);

      // ── Penalty indicator ─────────────────────────────────────────────────
      if (car.penalties > 0) {
        const penEl = document.createElement('span');
        penEl.className = 'lb-penalty';
        penEl.textContent = `+${car.penalties}s`;
        row.appendChild(penEl);
      }

      // ── Sub-row: best lap + current lap ───────────────────────────────────
      if (car.bestLapTimeInMS > 0 || car.currentLapNum > 0) {
        const subRow = document.createElement('div');
        subRow.className = 'lb-sub-row';

        if (car.bestLapTimeInMS > 0) {
          const bestEl = document.createElement('span');
          bestEl.className = 'lb-best-time' + (car.hasFastestLap ? ' lb-fl-time' : '');
          bestEl.textContent = msToLapTime(car.bestLapTimeInMS);
          subRow.appendChild(bestEl);
        }

        if (car.currentLapNum > 0) {
          const lapEl = document.createElement('span');
          lapEl.className = 'lb-cur-lap';
          lapEl.textContent = `L${car.currentLapNum}`;
          subRow.appendChild(lapEl);
        }

        row.appendChild(subRow);
      }

      container.appendChild(row);
    });
  }

  function update(data) {
    const cars = (data && data.cars) ? data.cars : data;
    if (!Array.isArray(cars)) return;
    render(cars);
  }

  window.Leaderboard = { update, render };
})();
