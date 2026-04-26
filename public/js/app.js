'use strict';
/**
 * F1 25 Telemetry Dashboard – frontend logic
 *
 * Connects to the Socket.io server, receives real-time telemetry events,
 * and updates the DOM widgets accordingly.
 */
(function () {

  // ── Lookup tables ─────────────────────────────────────────────────────────

  const TRACK_NAMES = {
    '-1': 'Unknown',
     0: 'Melbourne',    1: 'Paul Ricard',   2: 'Shanghai',
     3: 'Sakhir',       4: 'Catalunya',     5: 'Monaco',
     6: 'Montréal',     7: 'Silverstone',   8: 'Hockenheim',
     9: 'Hungaroring', 10: 'Spa-Francorchamps', 11: 'Monza',
    12: 'Singapore',   13: 'Suzuka',        14: 'Yas Marina',
    15: 'Austin',      16: 'Buenos Aires',  17: 'Red Bull Ring',
    18: 'Interlagos',  19: 'Monaco (Classic)', 20: 'Baku',
    21: 'Sakhir Short',22: 'Silverstone Short',23: 'Austin Short',
    24: 'Suzuka Short',25: 'Hanoi',         26: 'Zandvoort',
    27: 'Imola',       28: 'Portimão',      29: 'Jeddah',
    30: 'Miami',       31: 'Las Vegas',     32: 'Lusail',
  };

  const SESSION_TYPES = {
    0:'Unknown', 1:'P1', 2:'P2', 3:'P3', 4:'Short P',
    5:'Q1', 6:'Q2', 7:'Q3', 8:'Short Q', 9:'OSQ', 10:'Race',
    11:'Race 2', 12:'Race 3', 13:'Time Trial',
  };

  const WEATHER = {
    0:{ icon:'☀️',  text:'Clear'       },
    1:{ icon:'⛅', text:'Light Cloud' },
    2:{ icon:'☁️',  text:'Overcast'    },
    3:{ icon:'🌦️',  text:'Light Rain'  },
    4:{ icon:'🌧️',  text:'Heavy Rain'  },
    5:{ icon:'⛈️',  text:'Storm'       },
  };

  const TYRE_COMPOUNDS = {
    7:  { name:'Inter', cls:'inter' },
    8:  { name:'Wet',   cls:'wet'   },
    15: { name:'Dry',   cls:'hard'  },
    16: { name:'Soft',  cls:'soft'  },
    17: { name:'Medium',cls:'medium'},
    18: { name:'Hard',  cls:'hard'  },
    19: { name:'SS',    cls:'soft'  },
    20: { name:'US',    cls:'soft'  },
    21: { name:'HS',    cls:'soft'  },
  };

  const FUEL_MIX_LABELS = ['Lean', 'Standard', 'Rich', 'Max'];

  const ERS_MODES = ['None', 'Medium', 'Hotlap', 'Overtake'];

  const FIA_FLAGS = {
    '-2':'–', '-1':'–', 0:'Green 🟢', 1:'Blue 🔵', 2:'Yellow 🟡',
    3:'–', 4:'–', 5:'Red 🔴',
  };

  const SC_STATUS = { 0:null, 1:'SC', 2:'VSC', 3:'Formation' };

  // ── Best lap tracking (client-side) ───────────────────────────────────────
  let bestLapMs = Infinity;

  // ── DOM helpers ───────────────────────────────────────────────────────────
  function $(id)       { return document.getElementById(id); }
  function text(id, v) { const el = $(id); if (el) el.textContent = v; }
  function pct(v)      { return Math.round(v * 100) + '%'; }

  function setBar(barId, fraction) {
    const el = $(barId);
    if (el) el.style.width = Math.max(0, Math.min(1, fraction)) * 100 + '%';
  }

  // ── Formatting ────────────────────────────────────────────────────────────
  function msToLapTime(ms) {
    if (!ms || ms <= 0) return '–:––.–––';
    const mins = Math.floor(ms / 60000);
    const secs = Math.floor((ms % 60000) / 1000);
    const msec = ms % 1000;
    return `${mins}:${String(secs).padStart(2,'0')}.${String(msec).padStart(3,'0')}`;
  }

  function msSector(ms, mins) {
    if (!ms || ms <= 0) return '–';
    const total = (mins || 0) * 60000 + ms;
    const s = Math.floor(total / 1000);
    const m = total % 1000;
    return `${s}.${String(m).padStart(3,'0')}`;
  }

  // ── Rev lights ────────────────────────────────────────────────────────────
  const revLightEls = Array.from(document.querySelectorAll('.rev-lights span'));

  function updateRevLights(pctVal) {
    const lit = Math.round(pctVal / 100 * revLightEls.length);
    revLightEls.forEach((el, i) => {
      el.className = '';
      if (i < lit) {
        if (i < 5)       el.classList.add('on-green');
        else if (i < 10) el.classList.add('on-yellow');
        else             el.classList.add('on-red');
      }
    });
  }

  // ── Tyre temperature → colour class ──────────────────────────────────────
  // Optimal F1 tyre window ≈ 80–105 °C
  function tyreClass(temp) {
    if (temp < 60)  return 'tyre-cold';   // Too cold – blue
    if (temp < 80)  return 'tyre-cold';   // Below optimal window – still cold
    if (temp < 90)  return 'tyre-ok';     // Optimal range – green
    if (temp < 100) return 'tyre-warm';   // Upper optimal – yellow
    if (temp < 110) return 'tyre-hot';    // Overheating – orange
    return 'tyre-danger';                 // Critical – red
  }

  function updateTyreCircle(circleId, temp) {
    const el = $(circleId);
    if (!el) return;
    el.className = 'tyre-circle ' + tyreClass(temp);
  }

  // ── Handlers ──────────────────────────────────────────────────────────────
  function handleSession(d) {
    const track   = TRACK_NAMES[d.trackId] ?? `Track ${d.trackId}`;
    const session = SESSION_TYPES[d.sessionType] ?? `Type ${d.sessionType}`;
    const weather = WEATHER[d.weather] ?? { icon:'?', text:'Unknown' };
    const laps    = d.totalLaps > 0 ? `/ ${d.totalLaps}` : '';

    text('track-name',   track);
    text('session-type', session);
    $('weather-icon').textContent = weather.icon;
    text('weather-text', weather.text);

    const scText = SC_STATUS[d.safetyCarStatus];
    const scChip = $('chip-sc');
    if (scChip) {
      scChip.style.display = scText ? 'flex' : 'none';
      text('sc-label', scText || '');
    }
  }

  function handleLapData(d) {
    text('car-position',   d.carPosition || '–');
    text('current-lap-time', msToLapTime(d.currentLapTimeInMS));
    text('last-lap-time',    msToLapTime(d.lastLapTimeInMS));

    if (d.lastLapTimeInMS > 0 && d.lastLapTimeInMS < bestLapMs) {
      bestLapMs = d.lastLapTimeInMS;
    }
    text('best-lap-time', msToLapTime(bestLapMs < Infinity ? bestLapMs : 0));

    // Sectors
    const s1El = $('s1-box'), s2El = $('s2-box'), s3El = $('s3-box');
    const sector = d.sector || 0;

    text('s1-time', d.sector1TimeInMS > 0 ? msSector(d.sector1TimeInMS, d.sector1TimeMinutes) : '–');
    text('s2-time', d.sector2TimeInMS > 0 ? msSector(d.sector2TimeInMS, d.sector2TimeMinutes) : '–');
    text('s3-time', '–');

    [s1El, s2El, s3El].forEach((el, i) => {
      if (!el) return;
      el.classList.remove('active', 'done');
      if (i === sector) el.classList.add('active');
      else if (i < sector) el.classList.add('done');
    });

    // Lap counter in header
    const lapCounter = $('lap-counter');
    if (lapCounter) {
      const total = window.__totalLaps || '';
      lapCounter.textContent = `Lap ${d.currentLapNum}${total ? ' / ' + total : ''}`;
    }

    // Gaps
    if (d.deltaToRaceLeaderInMS > 0) {
      text('gap-leader', '+' + (d.deltaToRaceLeaderInMS / 1000).toFixed(3) + 's');
    } else { text('gap-leader', '–'); }
    if (d.deltaToCarInFrontInMS > 0) {
      text('gap-ahead', '+' + (d.deltaToCarInFrontInMS / 1000).toFixed(3) + 's');
    } else { text('gap-ahead', '–'); }

    text('lap-distance', d.lapDistance > 0 ? Math.round(d.lapDistance) + ' m' : '–');
  }

  function handleTelemetry(d) {
    const t = d.player || d;

    // Speed, Gear, DRS
    text('speed', t.speed ?? 0);
    const gearVal = t.gear === -1 ? 'R' : t.gear === 0 ? 'N' : t.gear;
    text('gear', gearVal ?? 'N');

    const drsEl = $('drs-badge');
    if (drsEl) drsEl.classList.toggle('active', !!t.drs);

    // RPM
    const maxRPM = window.__maxRPM || 15000;
    const rpmFrac = (t.engineRPM || 0) / maxRPM;
    setBar('rpm-bar', rpmFrac);
    text('rpm-value', (t.engineRPM || 0).toLocaleString());
    updateRevLights(t.revLightsPercent || 0);

    // Inputs
    setBar('throttle-bar', t.throttle || 0);
    text('throttle-pct', pct(t.throttle || 0));
    setBar('brake-bar', t.brake || 0);
    text('brake-pct', pct(t.brake || 0));

    // Steer – centre = 50%, left = <50%, right = >50%
    const steerFrac = ((t.steer || 0) + 1) / 2;           // 0..1
    const deadW     = 0.04;                                 // dead-zone width (half)
    const fillEl = $('steer-fill');
    if (fillEl) {
      if (Math.abs(t.steer || 0) < 0.02) {
        fillEl.style.left  = '50%';
        fillEl.style.width = '2px';
      } else if ((t.steer || 0) < 0) {
        const w = (0.5 - steerFrac) * 100;
        fillEl.style.left  = steerFrac * 100 + '%';
        fillEl.style.width = w + '%';
      } else {
        const w = (steerFrac - 0.5) * 100;
        fillEl.style.left  = '50%';
        fillEl.style.width = w + '%';
      }
    }
    text('steer-pct', ((t.steer || 0) * 100).toFixed(0));

    // Tyre temperatures
    const surf = t.tyresSurfaceTemperature || [0,0,0,0];
    const inn  = t.tyresInnerTemperature   || [0,0,0,0];
    const brk  = t.brakesTemperature       || [0,0,0,0];
    const prs  = t.tyresPressure           || [0,0,0,0];
    const corners = ['fl','fr','rl','rr'];
    corners.forEach((c, i) => {
      text(`tyre-temp-${c}`,   `${surf[i]}°`);
      text(`tyre-inner-${c}`,  `${inn[i]}°`);
      text(`brake-temp-${c}`,  `${brk[i]}°`);
      text(`tyre-press-${c}`,  `${(prs[i]||0).toFixed(1)} psi`);
      updateTyreCircle(`tyre-circle-${c}`, surf[i]);
    });

    text('engine-temp', (t.engineTemperature || 0) + '°C');
  }

  function handleStatus(d) {
    const s = d.player || d;

    // Store maxRPM globally for RPM bar scaling
    if (s.maxRPM) window.__maxRPM = s.maxRPM;
    if (s.fuelCapacity) window.__fuelCapacity = s.fuelCapacity;

    // Fuel
    const fuelFrac = (s.fuelInTank || 0) / (s.fuelCapacity || 110);
    setBar('fuel-bar', fuelFrac);
    text('fuel-kg', (s.fuelInTank || 0).toFixed(1));
    text('fuel-remaining-laps', (s.fuelRemainingLaps || 0).toFixed(1) + ' laps remaining');
    text('fuel-mix', FUEL_MIX_LABELS[s.fuelMix] || 'Standard');

    // ERS
    const ersMax  = 4000000; // J
    const ersFrac = (s.ersStoreEnergy || 0) / ersMax;
    setBar('ers-store-bar', ersFrac);
    text('ers-mj',      ((s.ersStoreEnergy || 0) / 1e6).toFixed(2));
    text('ers-deployed', ((s.ersDeployedThisLap || 0) / 1e6).toFixed(2));
    text('ers-mode',    ERS_MODES[s.ersDeployMode] || 'None');

    // ERS in throttle bar
    setBar('ers-bar', ersFrac);
    text('ers-pct', pct(ersFrac));

    // Tyre compound badge
    const compoundInfo = TYRE_COMPOUNDS[s.visualTyreCompound] || { name: '–', cls: '' };
    const badge = $('tyre-compound-badge');
    if (badge) {
      badge.textContent = compoundInfo.name;
      badge.className   = 'tyre-compound-badge ' + compoundInfo.cls;
    }
    text('tyre-age', (s.tyresAgeLaps || 0) + ' laps');

    // Brake bias
    text('brake-bias', (s.frontBrakeBias || 50) + '%');

    // FIA flag
    const flagEl = $('fia-flag');
    if (flagEl) {
      const key = String(s.vehicleFiaFlags);
      flagEl.textContent = FIA_FLAGS[key] ?? '–';
      flagEl.className   = 'misc-value flag-indicator ' +
        (s.vehicleFiaFlags === 0 ? 'flag-green'  :
         s.vehicleFiaFlags === 1 ? 'flag-blue'   :
         s.vehicleFiaFlags === 2 ? 'flag-yellow' :
         s.vehicleFiaFlags === 5 ? 'flag-red'    : '');
    }
  }

  function handleMotion(d) {
    // G-forces
    const pc = d.playerCar || {};
    text('g-lat',  (pc.gForceLateral    || 0).toFixed(2));
    text('g-lon',  (pc.gForceLongitudinal || 0).toFixed(2));
    text('g-vert', (pc.gForceVertical   || 0).toFixed(2));

    // Update circuit car positions
    CircuitMap.updateCars(
      { x: pc.worldPositionX, z: pc.worldPositionZ },
      d.allCars || []
    );
  }

  function handleTrackTrace(pts) {
    CircuitMap.updateTrace(pts);
  }

  // ── Handle full initial state dump ─────────────────────────────────────────
  function handleInit(state) {
    if (state.session) {
      window.__totalLaps = state.session.totalLaps;
      handleSession(state.session);
    }
    if (state.lapData)         handleLapData(state.lapData);
    if (state.playerTelemetry) handleTelemetry({ player: state.playerTelemetry });
    if (state.playerStatus)    handleStatus({ player: state.playerStatus });
    if (state.motion)          handleMotion(state.motion);
    if (state.trackTrace)      handleTrackTrace(state.trackTrace);
  }

  // ── Connection status ──────────────────────────────────────────────────────
  function setConnected(state) {
    const dot   = $('conn-dot');
    const label = $('conn-label');
    if (!dot || !label) return;
    if (state === 'demo') {
      dot.className   = 'dot demo';
      label.textContent = 'Demo Mode';
    } else if (state === 'live') {
      dot.className   = 'dot connected';
      label.textContent = 'Live';
    } else {
      dot.className   = 'dot';
      label.textContent = 'Waiting…';
    }
  }

  // ── Socket.io ──────────────────────────────────────────────────────────────
  const socket = io();

  socket.on('connect', () => setConnected('live'));
  socket.on('disconnect', () => setConnected('off'));

  socket.on('init',         handleInit);
  socket.on('session',      (d) => { window.__totalLaps = d.totalLaps; handleSession(d); });
  socket.on('lapData',      handleLapData);
  socket.on('carTelemetry', handleTelemetry);
  socket.on('carStatus',    handleStatus);
  socket.on('motion',       handleMotion);
  socket.on('trackTrace',   handleTrackTrace);

  // If backend is running in demo mode, receive the demo marker via the
  // session event (trackId = 11 = Monza is the simulator's choice)
  socket.on('session', (d) => {
    if (d._demo) setConnected('demo');
  });

  // ── Canvas init ────────────────────────────────────────────────────────────
  CircuitMap.init(document.getElementById('circuit-canvas'));

  // ── Fetch initial state on page load ─────────────────────────────────────
  fetch('/api/state')
    .then(r => r.json())
    .then(handleInit)
    .catch(() => {});

})();
