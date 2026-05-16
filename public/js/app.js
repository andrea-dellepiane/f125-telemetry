'use strict';
/**
 * F1 25 Telemetry Dashboard – frontend logic
 */
(function () {

  // ── Lookup tables ──────────────────────────────────────────────────────────
  const TRACK_NAMES = {
    '-1': 'Sconosciuto',
     0: 'Melbourne',    1: 'Paul Ricard',   2: 'Shanghai',
     3: 'Sakhir',       4: 'Catalunya',     5: 'Monaco',
     6: 'Montréal',     7: 'Silverstone',   8: 'Hockenheim',
     9: 'Hungaroring', 10: 'Spa',          11: 'Monza',
    12: 'Singapore',   13: 'Suzuka',        14: 'Yas Marina',
    15: 'Austin',      16: 'Buenos Aires',  17: 'Red Bull Ring',
    18: 'Interlagos',  19: 'Monaco (Classic)', 20: 'Baku',
    21: 'Sakhir Short',22: 'Silverstone Short',23: 'Austin Short',
    24: 'Suzuka Short',25: 'Hanoi',         26: 'Zandvoort',
    27: 'Imola',       28: 'Portimão',      29: 'Jeddah',
    30: 'Miami',       31: 'Las Vegas',     32: 'Lusail',
  };

  const SESSION_TYPES = {
    0:'Sconosciuto', 1:'P1', 2:'P2', 3:'P3', 4:'Short P',
    5:'Q1', 6:'Q2', 7:'Q3', 8:'Short Q', 9:'OSQ', 10:'Gara',
    11:'Gara 2', 12:'Gara 3', 13:'Time Trial',
  };

  const WEATHER = {
    0:{ icon:'☀️', text:'Sereno' },
    1:{ icon:'⛅', text:'Poco Nuvoloso' },
    2:{ icon:'☁️', text:'Nuvoloso' },
    3:{ icon:'🌦️', text:'Pioggia Leggera' },
    4:{ icon:'🌧️', text:'Pioggia' },
    5:{ icon:'⛈️', text:'Temporale' },
  };

  const TYRE_COMPOUNDS = {
    7:  { name:'Inter',  cls:'inter'  },
    8:  { name:'Wet',    cls:'wet'    },
    15: { name:'Dry',    cls:'hard'   },
    16: { name:'Soft',   cls:'soft'   },
    17: { name:'Medium', cls:'medium' },
    18: { name:'Hard',   cls:'hard'   },
    19: { name:'SS',     cls:'soft'   },
    20: { name:'US',     cls:'soft'   },
    21: { name:'HS',     cls:'soft'   },
  };

  const FUEL_MIX_LABELS = ['Magro', 'Standard', 'Ricco', 'Max'];
  const ERS_MODES       = ['None', 'Medium', 'Hotlap', 'Overtake'];

  const FIA_FLAGS = {
    '-2':'–', '-1':'–', 0:'Verde 🟢', 1:'Blu 🔵', 2:'Gialla 🟡',
    3:'–', 4:'–', 5:'Rossa 🔴',
  };

  const SC_STATUS = { 0:null, 1:'SC', 2:'VSC', 3:'Formation' };
  const RACE_SESSION_TYPES = { 10:true, 11:true, 12:true };
  const STINT_TARGETS = {
    soft:    { ideal: 13, max: 18 },
    medium:  { ideal: 19, max: 26 },
    hard:    { ideal: 25, max: 34 },
    inter:   { ideal: 14, max: 20 },
    wet:     { ideal: 18, max: 24 },
    default: { ideal: 18, max: 24 },
  };
  const SECTOR_COUNT = 3;
  const COMPARISON_LAP_STORAGE_KEY = 'f125-comparison-lap';
  const DEFAULT_SECTOR_DELTA_LABEL = 'vs giro prec.';
  const COMPARISON_SECTOR_DELTA_LABEL = 'vs giro di confr.';

  // ── State ──────────────────────────────────────────────────────────────────
  let bestLapMs = Infinity;
  let lastRecordedCompletedLap = 0;
  let recentLapTimes = [];
  let latestSession = {};
  let latestLapData = {};
  let latestTelemetry = {};
  let latestStatus = {};
  let latestAllLapData = [];
  let latestAllCarStatus = [];
  let latestParticipants = [];
  let bestLapByCarIndex = {};
  let playerCarIndex = 0;
  let sectorDisplayState = createEmptySectorDisplayState();
  let playerBestSectorMs = Array(SECTOR_COUNT).fill(Infinity);
  let sessionBestSectorMs = Array(SECTOR_COUNT).fill(Infinity);
  let currentPlayerLap = createEmptyLapProgress();
  let pendingCompletedLapProgress = null;
  let previousCompletedLapRecord = null;
  let lastCompletedLapRecord = null;
  let observedCarSectorMs = {};
  let observedCarCompletedLap = {};
  let latestTrackTraceLength = 0;
  let comparisonLap = loadComparisonLap();

  // ── DOM helpers ───────────────────────────────────────────────────────────
  function $(id)       { return document.getElementById(id); }
  function text(id, v) { const el = $(id); if (el) el.textContent = v; }
  function pct(v)      { return Math.round(v * 100) + '%'; }
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  function setBar(barId, fraction) {
    const el = $(barId);
    if (el) el.style.width = Math.max(0, Math.min(1, fraction)) * 100 + '%';
  }

  // ── Formatting ─────────────────────────────────────────────────────────────
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

  function msToEditableTime(ms) {
    if (!ms || ms <= 0) return '';
    const mins = Math.floor(ms / 60000);
    const secs = Math.floor((ms % 60000) / 1000);
    const msec = ms % 1000;
    if (mins > 0) return `${mins}:${String(secs).padStart(2, '0')}.${String(msec).padStart(3, '0')}`;
    return `${secs}.${String(msec).padStart(3, '0')}`;
  }

  function sectorTotalMs(ms, mins) {
    if (!ms || ms <= 0) return 0;
    return ((mins || 0) * 60000) + ms;
  }

  function deriveSector3Ms(lapTimeMs, sector1Ms, sector2Ms) {
    if (lapTimeMs <= 0 || sector1Ms <= 0 || sector2Ms <= 0) return 0;
    const sector3Ms = lapTimeMs - sector1Ms - sector2Ms;
    return sector3Ms > 0 ? sector3Ms : 0;
  }

  function formatSectorDelta(label, deltaMs) {
    if (!Number.isFinite(deltaMs)) return `${label} –`;
    const sign = deltaMs > 0 ? '+' : deltaMs < 0 ? '-' : '';
    return `${label} ${sign}${(Math.abs(deltaMs) / 1000).toFixed(3)}s`;
  }

  function formatLapDelta(deltaMs) {
    if (!Number.isFinite(deltaMs)) return '–';
    const sign = deltaMs > 0 ? '+' : deltaMs < 0 ? '-' : '';
    return `${sign}${(Math.abs(deltaMs) / 1000).toFixed(3)}s`;
  }

  function parseUserTimeToMs(value) {
    const raw = String(value || '').trim().replace(',', '.');
    if (!raw) return 0;

    if (raw.includes(':')) {
      const parts = raw.split(':');
      if (parts.length !== 2) return NaN;
      const mins = Number(parts[0]);
      const secs = Number(parts[1]);
      if (!Number.isFinite(mins) || !Number.isFinite(secs) || mins < 0 || secs < 0) return NaN;
      return Math.round((mins * 60 + secs) * 1000);
    }

    const secs = Number(raw);
    if (!Number.isFinite(secs) || secs < 0) return NaN;
    return Math.round(secs * 1000);
  }

  function createEmptySectorBoxState() {
    return {
      timeMs: 0,
      deltaMs: null,
      colour: 'neutral',
      deltaLabel: DEFAULT_SECTOR_DELTA_LABEL,
      neutralDelta: false,
    };
  }

  function createEmptySectorDisplayState() {
    return Array.from({ length: SECTOR_COUNT }, createEmptySectorBoxState);
  }

  function createEmptyLapProgress(lapNum = 0) {
    return {
      lapNum,
      sectors: Array(SECTOR_COUNT).fill(0),
    };
  }

  function normaliseComparisonLap(candidate) {
    if (!candidate || !Array.isArray(candidate.sectors) || candidate.sectors.length !== SECTOR_COUNT) return null;
    const sectors = candidate.sectors.map((value) => Math.round(Number(value) || 0));
    if (sectors.some((value) => !Number.isFinite(value) || value <= 0)) return null;
    return {
      sectors,
      totalMs: sectors.reduce((sum, value) => sum + value, 0),
    };
  }

  function loadComparisonLap() {
    try {
      const raw = window.localStorage.getItem(COMPARISON_LAP_STORAGE_KEY);
      if (!raw) return null;
      return normaliseComparisonLap(JSON.parse(raw));
    } catch (_) {
      return null;
    }
  }

  function persistComparisonLap() {
    try {
      if (!comparisonLap) {
        window.localStorage.removeItem(COMPARISON_LAP_STORAGE_KEY);
        return;
      }
      window.localStorage.setItem(COMPARISON_LAP_STORAGE_KEY, JSON.stringify(comparisonLap));
    } catch (_) {}
  }

  function getReportedBestLapMs(lapPacket, allCars) {
    const player = lapPacket && (lapPacket.player || lapPacket);
    const fromPlayer = player && Number(player.bestLapTimeInMS);
    if (fromPlayer > 0) return fromPlayer;

    const cars = Array.isArray(allCars)
      ? allCars
      : (lapPacket && Array.isArray(lapPacket.cars) ? lapPacket.cars : []);
    const playerCar = cars.find((car) => car && car.carIndex === playerCarIndex);
    const fromCars = playerCar && Number(playerCar.bestLapTimeInMS);
    return fromCars > 0 ? fromCars : 0;
  }

  function updateSectorBest(bestArray, index, timeMs) {
    if (!timeMs || timeMs <= 0) return;
    bestArray[index] = Math.min(bestArray[index], timeMs);
  }

  function getSectorDeltaClass(deltaMs, neutralDelta) {
    if (neutralDelta || !Number.isFinite(deltaMs) || deltaMs === 0) return 'delta-neutral';
    return deltaMs < 0 ? 'delta-faster' : 'delta-slower';
  }

  function setLapDeltaValue(id, deltaMs) {
    const el = $(id);
    if (!el) return;
    el.textContent = formatLapDelta(deltaMs);
    el.className = `time-value ${Number.isFinite(deltaMs)
      ? (deltaMs < 0 ? 'delta-faster' : deltaMs > 0 ? 'delta-slower' : 'delta-neutral')
      : 'delta-neutral'}`;
  }

  function updateBestLapDisplay() {
    text('best-lap-time', msToLapTime(bestLapMs < Infinity ? bestLapMs : 0));
  }

  function updateLapComparisonRows() {
    const previousDelta = (
      lastCompletedLapRecord &&
      previousCompletedLapRecord &&
      previousCompletedLapRecord.totalMs > 0
    ) ? lastCompletedLapRecord.totalMs - previousCompletedLapRecord.totalMs : null;

    const bestDelta = lastCompletedLapRecord
      ? lastCompletedLapRecord.deltaToBestAtCompletionMs
      : null;

    const comparisonDelta = (
      lastCompletedLapRecord &&
      comparisonLap &&
      comparisonLap.totalMs > 0
    ) ? lastCompletedLapRecord.totalMs - comparisonLap.totalMs : null;

    setLapDeltaValue('last-lap-vs-previous', previousDelta);
    setLapDeltaValue('last-lap-vs-best', bestDelta);
    setLapDeltaValue('last-lap-vs-comparison', comparisonDelta);
  }

  function updateComparisonLapDisplays() {
    text('comparison-lap-time', comparisonLap ? msToLapTime(comparisonLap.totalMs) : '–:––.–––');

    const wrap = $('comparison-sector-wrap');
    if (wrap) wrap.style.display = comparisonLap ? 'block' : 'none';

    for (let index = 0; index < SECTOR_COUNT; index++) {
      text(`comparison-s${index + 1}-time`, comparisonLap ? msSector(comparisonLap.sectors[index], 0) : '–');
    }

    updateLapComparisonRows();
    refreshVisibleSectorComparisons();
  }

  function getActiveSectorReference(index) {
    if (comparisonLap && comparisonLap.sectors[index] > 0) {
      return {
        label: COMPARISON_SECTOR_DELTA_LABEL,
        timeMs: comparisonLap.sectors[index],
        neutralDelta: true,
      };
    }

    if (previousCompletedLapRecord && previousCompletedLapRecord.sectors[index] > 0) {
      return {
        label: DEFAULT_SECTOR_DELTA_LABEL,
        timeMs: previousCompletedLapRecord.sectors[index],
        neutralDelta: false,
      };
    }

    return {
      label: comparisonLap ? COMPARISON_SECTOR_DELTA_LABEL : DEFAULT_SECTOR_DELTA_LABEL,
      timeMs: 0,
      neutralDelta: !!comparisonLap,
    };
  }

  function refreshVisibleSectorComparisons() {
    sectorDisplayState = sectorDisplayState.map((state, index) => {
      const reference = getActiveSectorReference(index);
      return {
        ...state,
        deltaLabel: reference.label,
        deltaMs: reference.timeMs > 0 && state.timeMs > 0 ? state.timeMs - reference.timeMs : null,
        neutralDelta: reference.neutralDelta,
      };
    });
    renderSectorBoxes(clamp(latestLapData.sector || 0, 0, 2));
  }

  function renderSectorBoxes(activeSector) {
    sectorDisplayState.forEach((state, index) => {
      const box = $(`s${index + 1}-box`);
      const timeEl = $(`s${index + 1}-time`);
      const deltaEl = $(`s${index + 1}-delta`);
      if (timeEl) timeEl.textContent = state.timeMs > 0 ? msSector(state.timeMs, 0) : '–';
      if (deltaEl) {
        deltaEl.textContent = formatSectorDelta(state.deltaLabel, state.deltaMs);
        deltaEl.className = `sector-delta ${getSectorDeltaClass(state.deltaMs, state.neutralDelta)}`;
      }
      if (!box) return;
      box.classList.remove('active', 'sector-neutral', 'sector-yellow', 'sector-green', 'sector-purple');
      box.classList.add(`sector-${state.colour || 'neutral'}`);
      if (index === activeSector) box.classList.add('active');
    });
  }

  function resetSectorTimingState() {
    bestLapMs = Infinity;
    lastRecordedCompletedLap = 0;
    recentLapTimes = [];
    bestLapByCarIndex = {};
    sectorDisplayState = createEmptySectorDisplayState();
    playerBestSectorMs = Array(SECTOR_COUNT).fill(Infinity);
    sessionBestSectorMs = Array(SECTOR_COUNT).fill(Infinity);
    currentPlayerLap = createEmptyLapProgress();
    pendingCompletedLapProgress = null;
    previousCompletedLapRecord = null;
    lastCompletedLapRecord = null;
    observedCarSectorMs = {};
    observedCarCompletedLap = {};
    updateBestLapDisplay();
    updateLapComparisonRows();
    updateComparisonLapDisplays();
    renderSectorBoxes(0);
  }

  function classifySectorColour(index, timeMs) {
    const previousSessionBest = sessionBestSectorMs[index];
    const previousPlayerBest = playerBestSectorMs[index];

    if (!Number.isFinite(previousSessionBest) || timeMs <= previousSessionBest) return 'purple';
    if (!Number.isFinite(previousPlayerBest) || timeMs <= previousPlayerBest) return 'green';
    return 'yellow';
  }

  function applyPlayerSector(index, timeMs) {
    if (!timeMs || timeMs <= 0) return;
    const reference = getActiveSectorReference(index);
    sectorDisplayState[index] = {
      timeMs,
      deltaMs: reference.timeMs > 0 ? timeMs - reference.timeMs : null,
      colour: classifySectorColour(index, timeMs),
      deltaLabel: reference.label,
      neutralDelta: reference.neutralDelta,
    };
    updateSectorBest(playerBestSectorMs, index, timeMs);
    updateSectorBest(sessionBestSectorMs, index, timeMs);
  }

  function buildCompletedLapRecord(progress, lapTimeMs) {
    const sector1Ms = progress.sectors[0];
    const sector2Ms = progress.sectors[1];
    const sector3Ms = deriveSector3Ms(lapTimeMs, sector1Ms, sector2Ms);
    return {
      lapNum: progress.lapNum,
      totalMs: lapTimeMs,
      sectors: [sector1Ms, sector2Ms, sector3Ms],
      deltaToBestAtCompletionMs: Number.isFinite(bestLapMs) ? lapTimeMs - bestLapMs : null,
    };
  }

  function finalizePendingCompletedLap(currentLapNum, lastLapTimeMs) {
    const completedLapNum = Math.max(0, currentLapNum - 1);
    if (!pendingCompletedLapProgress || pendingCompletedLapProgress.lapNum !== completedLapNum || !lastLapTimeMs) return;
    if (lastCompletedLapRecord && lastCompletedLapRecord.lapNum >= completedLapNum) {
      pendingCompletedLapProgress = null;
      return;
    }

    const completedLap = buildCompletedLapRecord(pendingCompletedLapProgress, lastLapTimeMs);
    completedLap.sectors.forEach((timeMs, index) => {
      if (timeMs > 0) applyPlayerSector(index, timeMs);
    });

    previousCompletedLapRecord = lastCompletedLapRecord;
    lastCompletedLapRecord = completedLap;

    if (completedLap.totalMs > 0 && completedLap.totalMs < bestLapMs) {
      bestLapMs = completedLap.totalMs;
    }

    pendingCompletedLapProgress = null;
    updateBestLapDisplay();
    updateLapComparisonRows();
  }

  function observeOtherCarsSectorBenchmarks(cars) {
    (cars || []).forEach((car) => {
      if (!car || car.carIndex === playerCarIndex) return;
      const sector1Ms = sectorTotalMs(car.sector1TimeInMS, car.sector1TimeMinutes);
      const sector2Ms = sectorTotalMs(car.sector2TimeInMS, car.sector2TimeMinutes);
      const liveSectors = observedCarSectorMs[car.carIndex] || [0, 0];

      if (sector1Ms > 0) {
        liveSectors[0] = sector1Ms;
        updateSectorBest(sessionBestSectorMs, 0, sector1Ms);
      }

      if (sector2Ms > 0) {
        liveSectors[1] = sector2Ms;
        updateSectorBest(sessionBestSectorMs, 1, sector2Ms);
      }

      const completedLapNum = Math.max(0, (car.currentLapNum || 1) - 1);
      const lastLapTimeMs = car.lastLapTimeInMS || 0;

      if (lastLapTimeMs > 0 && completedLapNum > (observedCarCompletedLap[car.carIndex] || 0)) {
        updateSectorBest(sessionBestSectorMs, 2, deriveSector3Ms(lastLapTimeMs, liveSectors[0], liveSectors[1]));
        observedCarCompletedLap[car.carIndex] = completedLapNum;
        observedCarSectorMs[car.carIndex] = [0, 0];
        return;
      }

      observedCarSectorMs[car.carIndex] = liveSectors;
    });
  }

  // ── Tyre temp → colour ─────────────────────────────────────────────────────
  function tyreClass(temp) {
    if (temp < 80)  return 'tyre-cold';
    if (temp < 90)  return 'tyre-ok';
    if (temp < 100) return 'tyre-warm';
    if (temp < 110) return 'tyre-hot';
    return 'tyre-danger';
  }

  function updateTyreCircle(circleId, temp) {
    const el = $(circleId);
    if (!el) return;
    el.className = 'tyre-circle ' + tyreClass(temp);
  }

  function mean(values) {
    if (!Array.isArray(values) || !values.length) return 0;
    return values.reduce((sum, value) => sum + (Number(value) || 0), 0) / values.length;
  }

  function setPlayerCarIndex(nextIndex) {
    if (!Number.isInteger(nextIndex) || nextIndex < 0) return;
    playerCarIndex = nextIndex;
    if (window.CircuitMap && CircuitMap.setPlayerCarIndex) {
      CircuitMap.setPlayerCarIndex(playerCarIndex);
    }
  }

  function syncPlayerCarIndex(source) {
    if (source && Number.isInteger(source.playerCarIndex)) {
      setPlayerCarIndex(source.playerCarIndex);
    }
  }

  function driverCodeFromName(name, raceNumber) {
    const clean = (name || '').replace(/[^\p{L}\p{N}\s'-]/gu, '').trim();
    if (!clean) return String(raceNumber || 0).padStart(2, '0');
    const parts = clean.split(/\s+/).filter(Boolean);
    const source = (parts[parts.length - 1] || parts[0] || '').replace(/[^A-Za-z0-9]/g, '');
    return (source.slice(0, 3) || clean.slice(0, 3)).toUpperCase();
  }

  function byCarIndex(items) {
    const map = {};
    (items || []).forEach((item) => {
      if (item && Number.isInteger(item.carIndex)) map[item.carIndex] = item;
    });
    return map;
  }

  function updateSteeringBar(steerValue) {
    const left = $('sw-steer-left-bar');
    const right = $('sw-steer-right-bar');
    const label = $('sw-steer-pct');
    const clamped = clamp(Number(steerValue) || 0, -1, 1);
    const magnitude = Math.round(Math.abs(clamped) * 100);

    if (left) left.style.width = (clamped < 0 ? Math.abs(clamped) * 50 : 0) + '%';
    if (right) right.style.width = (clamped > 0 ? Math.abs(clamped) * 50 : 0) + '%';
    if (label) {
      if (magnitude === 0) label.textContent = '0%';
      else label.textContent = `${clamped < 0 ? 'SX' : 'DX'} ${magnitude}%`;
    }
  }

  function rememberBestLaps(cars) {
    (cars || []).forEach((car) => {
      const lap = car.lastLapTimeInMS || 0;
      if (!lap || lap <= 0) return;
      const currentBest = bestLapByCarIndex[car.carIndex] || Infinity;
      if (lap < currentBest) bestLapByCarIndex[car.carIndex] = lap;
    });
  }

  function buildLeaderboardRows() {
    if (!Array.isArray(latestAllLapData) || !latestAllLapData.length) return [];

    rememberBestLaps(latestAllLapData);

    const participantMap = byCarIndex(latestParticipants);
    const statusMap = byCarIndex(latestAllCarStatus);
    const rows = latestAllLapData
      .filter((car) => {
        const resultStatus = car.resultStatus ?? 2;
        return resultStatus !== 0 && resultStatus !== 1;
      })
      .map((car) => {
        const participant = participantMap[car.carIndex] || {};
        const status = statusMap[car.carIndex] || {};
        const driverName = car.driverName || participant.driverName || `Car ${car.carIndex + 1}`;
        const bestLapTimeInMS = car.bestLapTimeInMS || bestLapByCarIndex[car.carIndex] || 0;
        return {
          ...car,
          position: car.position || car.carPosition || 0,
          driverName,
          driverCode: car.driverCode || participant.driverCode || driverCodeFromName(driverName, participant.raceNumber),
          teamId: car.teamId ?? participant.teamId,
          teamColor: car.teamColor || participant.teamColor || '#666',
          raceNumber: car.raceNumber || participant.raceNumber,
          tyreCompound: car.tyreCompound || status.visualTyreCompound || status.actualTyreCompound || 0,
          gapToLeaderMs: car.gapToLeaderMs || car.deltaToRaceLeaderInMS || 0,
          bestLapTimeInMS,
          pitStatus: car.pitStatus || 0,
          isPlayer: car.carIndex === playerCarIndex,
          hasFastestLap: false,
        };
      })
      .sort((a, b) => (a.position || 999) - (b.position || 999));

    let fastestIdx = -1;
    let fastestLap = Infinity;
    rows.forEach((row, idx) => {
      if (row.bestLapTimeInMS > 0 && row.bestLapTimeInMS < fastestLap) {
        fastestLap = row.bestLapTimeInMS;
        fastestIdx = idx;
      }
    });
    if (fastestIdx >= 0) rows[fastestIdx].hasFastestLap = true;

    return rows;
  }

  function refreshLeaderboard() {
    if (!window.Leaderboard) return;
    const rows = buildLeaderboardRows();
    Leaderboard.update(rows);
  }

  function noteCompletedLap(d) {
    const completedLap = Math.max(0, (d.currentLapNum || 1) - 1);
    if (!d.lastLapTimeInMS || completedLap <= lastRecordedCompletedLap) return;
    recentLapTimes.push(d.lastLapTimeInMS);
    if (recentLapTimes.length > 5) recentLapTimes.shift();
    lastRecordedCompletedLap = completedLap;
  }

  function getStintTarget(compoundCode) {
    const compoundInfo = TYRE_COMPOUNDS[compoundCode] || {};
    return STINT_TARGETS[compoundInfo.cls] || STINT_TARGETS.default;
  }

  function estimatePitLossSec(session) {
    const trackLength = session.trackLength || 5400;
    return clamp(Math.round(trackLength / 250), 18, 28);
  }

  function getTrafficWindow(cars) {
    if (!Array.isArray(cars) || !cars.length) {
      return { gapAheadSec: Infinity, gapBehindSec: Infinity };
    }
    const ordered = [...cars].sort((a, b) =>
      (a.position || a.carPosition || 999) - (b.position || b.carPosition || 999)
    );
    const playerIndex = ordered.findIndex((car) => car.carIndex === playerCarIndex);
    if (playerIndex === -1) {
      return { gapAheadSec: Infinity, gapBehindSec: Infinity };
    }

    const player = ordered[playerIndex];
    const ahead = playerIndex > 0 ? ordered[playerIndex - 1] : null;
    const behind = playerIndex < ordered.length - 1 ? ordered[playerIndex + 1] : null;
    const gapOf = (car) => car ? (car.gapToLeaderMs || car.deltaToRaceLeaderInMS || 0) : 0;

    return {
      gapAheadSec: ahead
        ? Math.max(0, (gapOf(player) - gapOf(ahead)) / 1000)
        : Infinity,
      gapBehindSec: behind
        ? Math.max(0, (gapOf(behind) - gapOf(player)) / 1000)
        : Infinity,
    };
  }

  function renderPitAdvice(state) {
    const badge = $('pit-advice-badge');
    const summary = $('pit-advice-summary');
    const lap = $('pit-advice-lap');
    const windowEl = $('pit-advice-window');
    const reason = $('pit-advice-reason');
    if (!badge || !summary || !lap || !windowEl || !reason) return;

    badge.textContent = state.badge;
    badge.className = `pit-strategy-badge ${state.level || 'neutral'}`;
    summary.textContent = state.summary;
    lap.textContent = state.lap;
    windowEl.textContent = state.window;
    reason.textContent = state.reason;
  }

  function updatePitStrategy() {
    const sessionType = latestSession.sessionType;
    const currentLap = latestLapData.currentLapNum || 0;
    const totalLaps = latestSession.totalLaps || window.__totalLaps || 0;
    const lapsRemaining = totalLaps > 0 ? Math.max(totalLaps - currentLap, 0) : 0;
    const pitStatus = latestLapData.pitStatus || 0;
    const pitLaneTimerActive = latestLapData.pitLaneTimerActive || 0;
    const officialIdealLap = latestSession.pitStopWindowIdealLap || 0;
    const officialLatestLap = latestSession.pitStopWindowLatestLap || 0;

    if (!RACE_SESSION_TYPES[sessionType]) {
      renderPitAdvice({
        level: 'neutral',
        badge: 'Setup',
        summary: 'Strategia pit attiva soprattutto in gara.',
        lap: '–',
        window: 'Monitoraggio',
        reason: 'Sto comunque tracciando degrado gomme, passo e temperature.',
      });
      return;
    }

    if (!currentLap || !totalLaps) {
      renderPitAdvice({
        level: 'neutral',
        badge: 'Wait',
        summary: 'Servono ancora dati di sessione per stimare la finestra box.',
        lap: '–',
        window: 'In raccolta',
        reason: 'Appena arrivano giro corrente e totale giri calcolo la strategia.',
      });
      return;
    }

    if (pitStatus > 0 || pitLaneTimerActive) {
      renderPitAdvice({
        level: 'neutral',
        badge: 'In Box',
        summary: 'Sosta in corso, preparo il prossimo stint.',
        lap: `Lap ${currentLap}`,
        window: 'Questa tornata',
        reason: 'Appena rientri in pista ricalcolo la prossima finestra ideale.',
      });
      return;
    }

    const compoundInfo = TYRE_COMPOUNDS[latestStatus.visualTyreCompound] || { name: 'Dry', cls: 'hard' };
    const target = getStintTarget(latestStatus.visualTyreCompound);
    const tyreAge = latestStatus.tyresAgeLaps || 0;
    const tyreTemps = latestTelemetry.tyresSurfaceTemperature || [0, 0, 0, 0];
    const avgTyreTemp = mean(tyreTemps);
    const maxTyreTemp = Math.max.apply(null, tyreTemps.concat([0]));
    const rollingLap = recentLapTimes.length
      ? recentLapTimes.slice(-3).reduce((sum, value) => sum + value, 0) / Math.min(3, recentLapTimes.length)
      : 0;
    const paceDropMs = (rollingLap && bestLapMs < Infinity) ? rollingLap - bestLapMs : 0;
    const pitLossSec = estimatePitLossSec(latestSession);
    const traffic = getTrafficWindow(latestAllLapData);
    const fuelDeltaLaps = (latestStatus.fuelRemainingLaps || 0) - lapsRemaining;

    const heatPenalty = avgTyreTemp >= 105 || maxTyreTemp >= 111 ? 3 :
      avgTyreTemp >= 101 || maxTyreTemp >= 108 ? 2 :
      avgTyreTemp >= 97 ? 1 : 0;
    const pacePenalty = paceDropMs >= 1400 ? 3 :
      paceDropMs >= 850 ? 2 :
      paceDropMs >= 450 ? 1 : 0;

    const adjustedIdealAge = Math.max(6, target.ideal - Math.min(2, pacePenalty));
    const adjustedMaxAge = Math.max(adjustedIdealAge + 1, target.max - heatPenalty - pacePenalty);
    const canReachEnd = tyreAge + lapsRemaining <= adjustedMaxAge &&
      avgTyreTemp < 104 &&
      paceDropMs < 1100;

    const safePitNow = traffic.gapBehindSec === Infinity || traffic.gapBehindSec >= pitLossSec + 1.5;
    const trafficTight = traffic.gapBehindSec !== Infinity && traffic.gapBehindSec < pitLossSec - 2;
    let lapsToPit = adjustedMaxAge - tyreAge;

    if (tyreAge >= adjustedIdealAge - 1) lapsToPit = Math.min(lapsToPit, safePitNow ? 1 : 2);
    if (heatPenalty >= 2 || pacePenalty >= 2) lapsToPit = Math.min(lapsToPit, 1);
    if (trafficTight && lapsToPit === 1) lapsToPit = 2;

    lapsToPit = clamp(Math.round(lapsToPit), 0, Math.max(lapsRemaining - 1, 0));
    const heuristicLap = currentLap + lapsToPit;
    const recommendedLap = officialIdealLap > 0 ? officialIdealLap : heuristicLap;

    const reasons = [
      `${compoundInfo.name} a ${tyreAge} giri, target ${adjustedIdealAge}-${adjustedMaxAge}`,
    ];
    if (officialIdealLap > 0) {
      reasons.unshift(`strategia EA: ideale lap ${officialIdealLap}${officialLatestLap > 0 ? `, ultimo ${officialLatestLap}` : ''}`);
    }
    if (paceDropMs >= 350) reasons.push(`passo in calo di +${(paceDropMs / 1000).toFixed(1)}s`);
    if (avgTyreTemp >= 97) reasons.push(`gomme a ${Math.round(avgTyreTemp)}°C di media`);
    if (traffic.gapBehindSec !== Infinity) {
      reasons.push(`gap dietro ${traffic.gapBehindSec.toFixed(1)}s, pit loss stimato ${pitLossSec}s`);
    }
    if (fuelDeltaLaps < -0.4) {
      reasons.push(`carburante corto di ${Math.abs(fuelDeltaLaps).toFixed(1)} giri, serve lift-and-coast`);
    }

    if (canReachEnd) {
      renderPitAdvice({
        level: 'good',
        badge: 'Stay Out',
        summary: 'Stint gestibile fino alla fine, al momento non serve box.',
        lap: 'Fine gara',
        window: `${lapsRemaining} giri al traguardo`,
        reason: reasons.slice(0, 3).join(' | '),
      });
      return;
    }

    if (tyreAge >= adjustedMaxAge || heatPenalty >= 3 || pacePenalty >= 3 ||
      (officialLatestLap > 0 && currentLap >= officialLatestLap)) {
      renderPitAdvice({
        level: 'alert',
        badge: 'Pit Now',
        summary: 'Finestra box aperta subito: gomme o passo stanno cedendo.',
        lap: `Lap ${currentLap}`,
        window: 'Questa tornata',
        reason: reasons.slice(0, 4).join(' | '),
      });
      return;
    }

    if (tyreAge >= adjustedIdealAge - 2 || heatPenalty >= 1 || pacePenalty >= 1 ||
      (officialIdealLap > 0 && currentLap >= Math.max(1, officialIdealLap - 1))) {
      renderPitAdvice({
        level: safePitNow ? 'warn' : 'neutral',
        badge: safePitNow ? 'Window Open' : 'Prepare',
        summary: safePitNow
          ? 'Hai una finestra box abbastanza pulita, puoi anticipare la sosta.'
          : 'Preparati al pit: la finestra sta per aprirsi.',
        lap: `Lap ${recommendedLap}`,
        window: officialIdealLap > 0
          ? `${Math.max(officialIdealLap - currentLap, 0)} giri`
          : (lapsToPit === 0 ? 'Questa tornata' : `${lapsToPit} giri`),
        reason: reasons.slice(0, 4).join(' | '),
      });
      return;
    }

    renderPitAdvice({
      level: 'neutral',
      badge: 'Monitor',
      summary: 'Puoi restare fuori ancora un po, la gomma e il passo sono stabili.',
      lap: `Lap ${recommendedLap}`,
      window: `${lapsToPit} giri`,
      reason: reasons.slice(0, 3).join(' | '),
    });
  }

  // ── Handlers ──────────────────────────────────────────────────────────────
  function handleSession(d) {
    const previousSession = latestSession || {};
    const trackChanged =
      Number.isInteger(d.trackId) &&
      previousSession.trackId !== d.trackId;
    const sessionTypeChanged =
      Number.isInteger(d.sessionType) &&
      previousSession.sessionType !== d.sessionType;
    const sessionRestarted =
      typeof d.sessionTimeLeft === 'number' &&
      typeof previousSession.sessionTimeLeft === 'number' &&
      previousSession.sessionTimeLeft > 0 &&
      d.sessionTimeLeft > previousSession.sessionTimeLeft + 20;

    if (trackChanged || sessionTypeChanged || sessionRestarted) {
      resetSectorTimingState();
    }

    latestSession = d || {};
    syncPlayerCarIndex(d);
    const track   = TRACK_NAMES[d.trackId] ?? `Track ${d.trackId}`;
    const session = SESSION_TYPES[d.sessionType] ?? `Type ${d.sessionType}`;
    const weather = WEATHER[d.weather] ?? { icon:'?', text:'Sconosciuto' };

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

    // Update leaderboard session label
    text('lb-session-label', session);

    // Tell circuit map which track we're on
    if (CircuitMap) CircuitMap.setTrackId(d.trackId);
    updatePitStrategy();
  }

  function handleLapData(d) {
    syncPlayerCarIndex(d);
    if (Array.isArray(d.cars)) {
      latestAllLapData = d.cars;
      observeOtherCarsSectorBenchmarks(d.cars);
      refreshLeaderboard();
    }

    const lap = d.player || d;
    latestLapData = lap || {};
    text('car-position',     lap.carPosition || '–');
    text('current-lap-time', msToLapTime(lap.currentLapTimeInMS));
    text('last-lap-time',    msToLapTime(lap.lastLapTimeInMS));

    const sector = clamp(lap.sector || 0, 0, 2);
    const currentLapNum = lap.currentLapNum || 1;
    const currentLapTimeMs = lap.currentLapTimeInMS || 0;
    const rawSector1Ms = sectorTotalMs(lap.sector1TimeInMS, lap.sector1TimeMinutes);
    const rawSector2Ms = sectorTotalMs(lap.sector2TimeInMS, lap.sector2TimeMinutes);
    const sector1Ms = rawSector1Ms > 0 && rawSector1Ms <= currentLapTimeMs ? rawSector1Ms : 0;
    const sector2Ms = rawSector2Ms > 0 && rawSector2Ms <= currentLapTimeMs ? rawSector2Ms : 0;

    if (!currentPlayerLap.lapNum || currentLapNum < currentPlayerLap.lapNum) {
      currentPlayerLap = createEmptyLapProgress(currentLapNum);
      pendingCompletedLapProgress = null;
    }

    if (currentPlayerLap.lapNum && currentLapNum > currentPlayerLap.lapNum) {
      pendingCompletedLapProgress = {
        lapNum: currentPlayerLap.lapNum,
        sectors: currentPlayerLap.sectors.slice(),
      };
      currentPlayerLap = createEmptyLapProgress(currentLapNum);
    }

    finalizePendingCompletedLap(currentLapNum, lap.lastLapTimeInMS || 0);

    if (sector1Ms > currentPlayerLap.sectors[0]) {
      currentPlayerLap.sectors[0] = sector1Ms;
      applyPlayerSector(0, sector1Ms);
    }

    if (sector2Ms > currentPlayerLap.sectors[1]) {
      currentPlayerLap.sectors[1] = sector2Ms;
      applyPlayerSector(1, sector2Ms);
    }

    const reportedBestLapMs = getReportedBestLapMs(d, latestAllLapData);
    if (reportedBestLapMs > 0 && reportedBestLapMs < bestLapMs) {
      bestLapMs = reportedBestLapMs;
    }
    updateBestLapDisplay();

    renderSectorBoxes(sector);

    const lapCounter = $('lap-counter');
    if (lapCounter) {
      const total = window.__totalLaps || '';
      lapCounter.textContent = `Lap ${lap.currentLapNum}${total ? ' / ' + total : ''}`;
    }

    if (lap.deltaToRaceLeaderInMS > 0) {
      text('gap-leader', '+' + (lap.deltaToRaceLeaderInMS / 1000).toFixed(3) + 's');
    } else { text('gap-leader', '–'); }
    if (lap.deltaToCarInFrontInMS > 0) {
      text('gap-ahead', '+' + (lap.deltaToCarInFrontInMS / 1000).toFixed(3) + 's');
    } else { text('gap-ahead', '–'); }

    text('lap-distance', lap.lapDistance > 0 ? Math.round(lap.lapDistance) + ' m' : '–');
    text('num-pit-stops', lap.numPitStops || 0);

    noteCompletedLap(lap);
    updatePitStrategy();

    // Lap recorder hooks
    if (window.LapRecorder) {
      LapRecorder.setLapData(lap);
      LapRecorder.onLapChange(lap.currentLapNum);
      LapRecorder.captureSample();
    }
  }

  function handleTelemetry(d) {
    syncPlayerCarIndex(d);
    const t = d.player || d;
    latestTelemetry = t || {};

    // Quick stats in timing card
    text('qs-speed', t.speed ?? 0);
    text('qs-rpm',   (t.engineRPM || 0).toLocaleString());
    const gearVal = t.gear === -1 ? 'R' : t.gear === 0 ? 'N' : t.gear;
    text('qs-gear', gearVal ?? 'N');

    const drsEl = $('qs-drs');
    if (drsEl) drsEl.classList.toggle('active', !!t.drs);

    // Input bars
    setBar('sw-throttle-bar', t.throttle || 0);
    text('sw-throttle-pct', pct(t.throttle || 0));
    setBar('sw-brake-bar', t.brake || 0);
    text('sw-brake-pct', pct(t.brake || 0));
    updateSteeringBar(t.steer || 0);

    // Tyres
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

    // Lap recorder
    if (window.LapRecorder) LapRecorder.setTelemetry(t);
    updatePitStrategy();
  }

  function handleStatus(d) {
    syncPlayerCarIndex(d);
    if (Array.isArray(d.cars)) {
      latestAllCarStatus = d.cars;
      refreshLeaderboard();
    }
    const s = d.player || d;
    latestStatus = s || {};

    if (s.maxRPM)       window.__maxRPM       = s.maxRPM;
    if (s.fuelCapacity) window.__fuelCapacity = s.fuelCapacity;

    // Fuel
    const fuelFrac = (s.fuelInTank || 0) / (s.fuelCapacity || 110);
    setBar('fuel-bar', fuelFrac);
    text('fuel-kg', (s.fuelInTank || 0).toFixed(1));
    text('fuel-remaining-laps', (s.fuelRemainingLaps || 0).toFixed(1) + ' giri rimanenti');
    text('fuel-mix', FUEL_MIX_LABELS[s.fuelMix] || 'Standard');

    // ERS
    const ersMax  = 4000000;
    const ersFrac = (s.ersStoreEnergy || 0) / ersMax;
    setBar('ers-store-bar', ersFrac);
    text('ers-mj',       ((s.ersStoreEnergy || 0) / 1e6).toFixed(2));
    text('ers-deployed', ((s.ersDeployedThisLap || 0) / 1e6).toFixed(2));
    text('ers-mode',     ERS_MODES[s.ersDeployMode] || 'None');

    // Tyre compound badge
    const compoundInfo = TYRE_COMPOUNDS[s.visualTyreCompound] || { name: '–', cls: '' };
    const badge = $('tyre-compound-badge');
    if (badge) {
      badge.textContent = compoundInfo.name;
      badge.className   = 'tyre-compound-badge ' + compoundInfo.cls;
    }
    text('tyre-age', (s.tyresAgeLaps || 0) + ' giri');

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

    updatePitStrategy();
  }

  function handleMotion(d) {
    syncPlayerCarIndex(d);
    const pc = d.playerCar || {};

    CircuitMap.updateCars(
      { x: pc.worldPositionX, z: pc.worldPositionZ },
      d.allCars || []
    );
  }

  function handleTrackTrace(pts) {
    if (Array.isArray(pts)) {
      latestTrackTraceLength = pts.length;
      CircuitMap.updateTrace(pts);
      return;
    }

    if (!pts || typeof pts !== 'object') return;

    if (pts.mode === 'replace') {
      latestTrackTraceLength = Number.isInteger(pts.totalLength)
        ? pts.totalLength
        : Array.isArray(pts.points) ? pts.points.length : 0;
      CircuitMap.updateTrace(pts);
      return;
    }

    if (pts.mode === 'append') {
      const start = Number.isInteger(pts.start) ? pts.start : latestTrackTraceLength;
      if (start < latestTrackTraceLength) return;
      latestTrackTraceLength = Number.isInteger(pts.totalLength)
        ? pts.totalLength
        : start + (Array.isArray(pts.points) ? pts.points.length : 0);
      CircuitMap.updateTrace(pts);
    }
  }

  function handleParticipants(data) {
    if (!data) return;
    syncPlayerCarIndex(data);
    const participants = data.participants || data;
    if (Array.isArray(participants)) {
      latestParticipants = participants;
      CircuitMap.setParticipants(participants);
      refreshLeaderboard();
    }
  }

  function handleAllLapData(data) {
    latestAllLapData = (data && data.cars) ? data.cars : data;
    syncPlayerCarIndex(data);
    observeOtherCarsSectorBenchmarks(latestAllLapData);
    refreshLeaderboard();
    updatePitStrategy();
  }

  function handleAllCarStatus(data) {
    latestAllCarStatus = (data && data.cars) ? data.cars : data;
    syncPlayerCarIndex(data);
    refreshLeaderboard();
    updatePitStrategy();
  }

  function setComparisonModalVisibility(isOpen) {
    const backdrop = $('comparison-modal-backdrop');
    if (!backdrop) return;
    backdrop.classList.toggle('is-hidden', !isOpen);
    backdrop.setAttribute('aria-hidden', isOpen ? 'false' : 'true');
  }

  function getComparisonLapInputs() {
    return [
      $('comparison-sector-1'),
      $('comparison-sector-2'),
      $('comparison-sector-3'),
    ];
  }

  function setComparisonModalError(message) {
    text('comparison-modal-error', message || '');
  }

  function updateComparisonClearButton() {
    const clearBtn = $('comparison-clear-btn');
    if (clearBtn) clearBtn.style.display = comparisonLap ? 'inline-flex' : 'none';
  }

  function populateComparisonLapModal() {
    const inputs = getComparisonLapInputs();
    inputs.forEach((input, index) => {
      if (!input) return;
      input.value = comparisonLap ? msToEditableTime(comparisonLap.sectors[index]) : '';
    });
    updateComparisonClearButton();
    setComparisonModalError('');
    renderComparisonLapPreview();
  }

  function readComparisonLapDraft() {
    const sectors = getComparisonLapInputs().map((input) => parseUserTimeToMs(input && input.value));
    if (sectors.some((value) => Number.isNaN(value))) {
      return { error: 'Controlla il formato dei settori. Usa ad esempio 28.345 oppure 1:02.345.' };
    }
    if (sectors.some((value) => value <= 0)) {
      return { error: 'Compila tutti e tre i settori prima di salvare il giro di confronto.' };
    }
    return {
      sectors,
      totalMs: sectors.reduce((sum, value) => sum + value, 0),
    };
  }

  function renderComparisonLapPreview() {
    const preview = $('comparison-total-preview');
    if (!preview) return;
    const draft = readComparisonLapDraft();
    preview.textContent = draft.error ? '–:––.–––' : msToLapTime(draft.totalMs);
  }

  function openComparisonLapModal() {
    populateComparisonLapModal();
    setComparisonModalVisibility(true);
    const firstInput = $('comparison-sector-1');
    if (firstInput) firstInput.focus();
  }

  function closeComparisonLapModal() {
    setComparisonModalVisibility(false);
    setComparisonModalError('');
  }

  function saveComparisonLapFromModal() {
    const draft = readComparisonLapDraft();
    if (draft.error) {
      setComparisonModalError(draft.error);
      renderComparisonLapPreview();
      return;
    }

    comparisonLap = normaliseComparisonLap(draft);
    persistComparisonLap();
    updateComparisonLapDisplays();
    closeComparisonLapModal();
  }

  function clearComparisonLap() {
    comparisonLap = null;
    persistComparisonLap();
    updateComparisonLapDisplays();
    closeComparisonLapModal();
  }

  function bindComparisonLapControls() {
    const openBtn = $('comparison-lap-btn');
    if (openBtn) openBtn.addEventListener('click', openComparisonLapModal);

    getComparisonLapInputs().forEach((input) => {
      if (!input) return;
      input.addEventListener('input', () => {
        setComparisonModalError('');
        renderComparisonLapPreview();
      });
    });

    const saveBtn = $('comparison-save-btn');
    if (saveBtn) saveBtn.addEventListener('click', saveComparisonLapFromModal);

    const clearBtn = $('comparison-clear-btn');
    if (clearBtn) clearBtn.addEventListener('click', clearComparisonLap);

    const cancelBtn = $('comparison-cancel-btn');
    if (cancelBtn) cancelBtn.addEventListener('click', closeComparisonLapModal);

    const closeBtn = $('comparison-modal-close');
    if (closeBtn) closeBtn.addEventListener('click', closeComparisonLapModal);

    const backdrop = $('comparison-modal-backdrop');
    if (backdrop) {
      backdrop.addEventListener('click', (event) => {
        if (event.target === backdrop) closeComparisonLapModal();
      });
    }

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') closeComparisonLapModal();
    });
  }

  // ── Init from state snapshot ───────────────────────────────────────────────
  function handleInit(state) {
    syncPlayerCarIndex(state);
    if (state.session) {
      window.__totalLaps = state.session.totalLaps;
      handleSession(state.session);
    }
    if (state.lapData)         handleLapData(state.lapData);
    if (state.playerTelemetry) handleTelemetry({ player: state.playerTelemetry });
    if (state.playerStatus)    handleStatus({ player: state.playerStatus });
    if (state.motion)          handleMotion(state.motion);
    if (state.trackTrace)      handleTrackTrace(state.trackTrace);
    if (state.participants)    handleParticipants({ participants: state.participants });
    if (state.allCarStatus && state.allCarStatus.length)
      handleAllCarStatus({ cars: state.allCarStatus });
    if (state.allLapData && state.allLapData.length)
      handleAllLapData({ cars: state.allLapData });
  }

  // ── Connection status ──────────────────────────────────────────────────────
  function setConnected(state) {
    const dot   = $('conn-dot');
    const label = $('conn-label');
    if (!dot || !label) return;
    if (state === 'demo') {
      dot.className     = 'dot demo';
      label.textContent = 'Demo';
    } else if (state === 'live') {
      dot.className     = 'dot connected';
      label.textContent = 'Live';
    } else {
      dot.className     = 'dot';
      label.textContent = 'In attesa…';
    }
  }

  // ── Socket.io ──────────────────────────────────────────────────────────────
  const socket = io();

  socket.on('connect',    () => setConnected('live'));
  socket.on('disconnect', () => setConnected('off'));

  socket.on('init',         handleInit);
  socket.on('session',      (d) => {
    window.__totalLaps = d.totalLaps;
    handleSession(d);
    if (d._demo) setConnected('demo');
  });
  socket.on('lapData',      handleLapData);
  socket.on('carTelemetry', handleTelemetry);
  socket.on('carStatus',    handleStatus);
  socket.on('motion',       handleMotion);
  socket.on('trackTrace',   handleTrackTrace);
  socket.on('participants', handleParticipants);
  socket.on('allLapData',   handleAllLapData);
  socket.on('allCarStatus', handleAllCarStatus);

  // ── Init ───────────────────────────────────────────────────────────────────
  CircuitMap.init(document.getElementById('circuit-canvas'));
  if (CircuitMap.setPlayerCarIndex) CircuitMap.setPlayerCarIndex(playerCarIndex);
  if (window.LapRecorder) LapRecorder.init();
  bindComparisonLapControls();
  updateBestLapDisplay();
  updateComparisonLapDisplays();

  fetch('/api/state')
    .then(r => r.json())
    .then(handleInit)
    .catch(() => {});

})();
