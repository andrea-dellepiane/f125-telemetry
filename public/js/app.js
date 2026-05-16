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
  let sectorDisplayState = Array.from({ length: SECTOR_COUNT }, () => ({
    timeMs: 0,
    deltaMs: null,
    colour: 'neutral',
  }));
  let playerBestSectorMs = Array(SECTOR_COUNT).fill(Infinity);
  let sessionBestSectorMs = Array(SECTOR_COUNT).fill(Infinity);
  let playerCurrentLapSectorMs = Array(SECTOR_COUNT).fill(0);
  let lastCompletedPlayerLapSectorMs = null;
  let playerSectorCommitLapNums = Array(SECTOR_COUNT).fill(0);
  let lastProcessedPlayerCompletedLap = 0;
  let observedCarSectorMs = {};
  let observedCarCompletedLap = {};
  let latestTrackTraceLength = 0;

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

  function sectorTotalMs(ms, mins) {
    if (!ms || ms <= 0) return 0;
    return ((mins || 0) * 60000) + ms;
  }

  function deriveSector3Ms(lapTimeMs, sector1Ms, sector2Ms) {
    if (lapTimeMs <= 0 || sector1Ms <= 0 || sector2Ms <= 0) return 0;
    const sector3Ms = lapTimeMs - sector1Ms - sector2Ms;
    return sector3Ms > 0 ? sector3Ms : 0;
  }

  function formatSectorDelta(deltaMs) {
    if (!Number.isFinite(deltaMs)) return 'vs giro prec. –';
    const sign = deltaMs > 0 ? '+' : deltaMs < 0 ? '-' : '';
    return `vs giro prec. ${sign}${(Math.abs(deltaMs) / 1000).toFixed(3)}s`;
  }

  function getSectorDeltaClass(deltaMs) {
    if (!Number.isFinite(deltaMs) || deltaMs === 0) return 'delta-neutral';
    return deltaMs < 0 ? 'delta-faster' : 'delta-slower';
  }

  function updateSectorBest(bestArray, index, timeMs) {
    if (!timeMs || timeMs <= 0) return;
    bestArray[index] = Math.min(bestArray[index], timeMs);
  }

  function renderSectorBoxes(activeSector) {
    sectorDisplayState.forEach((state, index) => {
      const box = $(`s${index + 1}-box`);
      const timeEl = $(`s${index + 1}-time`);
      const deltaEl = $(`s${index + 1}-delta`);
      if (timeEl) timeEl.textContent = state.timeMs > 0 ? msSector(state.timeMs, 0) : '–';
      if (deltaEl) {
        deltaEl.textContent = formatSectorDelta(state.deltaMs);
        deltaEl.className = `sector-delta ${getSectorDeltaClass(state.deltaMs)}`;
      }
      if (!box) return;
      box.classList.remove('active', 'sector-neutral', 'sector-yellow', 'sector-green', 'sector-purple');
      box.classList.add(`sector-${state.colour || 'neutral'}`);
      if (index === activeSector) box.classList.add('active');
    });
  }

  function resetSectorTimingState() {
    sectorDisplayState = Array.from({ length: SECTOR_COUNT }, () => ({
      timeMs: 0,
      deltaMs: null,
      colour: 'neutral',
    }));
    playerBestSectorMs = Array(SECTOR_COUNT).fill(Infinity);
    sessionBestSectorMs = Array(SECTOR_COUNT).fill(Infinity);
    playerCurrentLapSectorMs = Array(SECTOR_COUNT).fill(0);
    lastCompletedPlayerLapSectorMs = null;
    playerSectorCommitLapNums = Array(SECTOR_COUNT).fill(0);
    lastProcessedPlayerCompletedLap = 0;
    observedCarSectorMs = {};
    observedCarCompletedLap = {};
    renderSectorBoxes(0);
  }

  function classifySectorColour(index, timeMs) {
    const previousSessionBest = sessionBestSectorMs[index];
    const previousPlayerBest = playerBestSectorMs[index];

    if (!Number.isFinite(previousSessionBest) || timeMs <= previousSessionBest) return 'purple';
    if (!Number.isFinite(previousPlayerBest) || timeMs <= previousPlayerBest) return 'green';
    return 'yellow';
  }

  function applyPlayerSector(index, timeMs, lapNum) {
    if (!timeMs || timeMs <= 0) return;
    const previousLapTime = lastCompletedPlayerLapSectorMs && lastCompletedPlayerLapSectorMs[index] > 0
      ? lastCompletedPlayerLapSectorMs[index]
      : null;
    sectorDisplayState[index] = {
      timeMs,
      deltaMs: Number.isFinite(previousLapTime) ? timeMs - previousLapTime : null,
      colour: classifySectorColour(index, timeMs),
    };
    updateSectorBest(playerBestSectorMs, index, timeMs);
    updateSectorBest(sessionBestSectorMs, index, timeMs);
    playerSectorCommitLapNums[index] = lapNum || 0;
  }

  function finalizePlayerLap(completedLapNum, lapTimeMs) {
    const sector1Ms = playerCurrentLapSectorMs[0];
    const sector2Ms = playerCurrentLapSectorMs[1];
    const sector3Ms = deriveSector3Ms(lapTimeMs, sector1Ms, sector2Ms);
    const completedSectors = [sector1Ms, sector2Ms, sector3Ms];

    completedSectors.forEach((timeMs, index) => {
      if (!timeMs || timeMs <= 0) return;
      if (playerSectorCommitLapNums[index] !== completedLapNum || index === 2) {
        applyPlayerSector(index, timeMs, completedLapNum);
      }
    });

    lastCompletedPlayerLapSectorMs = completedSectors;
    playerCurrentLapSectorMs = Array(SECTOR_COUNT).fill(0);
    lastProcessedPlayerCompletedLap = completedLapNum;
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

    if (lap.lastLapTimeInMS > 0 && lap.lastLapTimeInMS < bestLapMs) {
      bestLapMs = lap.lastLapTimeInMS;
    }
    text('best-lap-time', msToLapTime(bestLapMs < Infinity ? bestLapMs : 0));

    const sector = clamp(lap.sector || 0, 0, 2);
    const currentLapNum = lap.currentLapNum || 1;
    const completedLapNum = Math.max(0, currentLapNum - 1);
    const previousSector1Ms = playerCurrentLapSectorMs[0];
    const previousSector2Ms = playerCurrentLapSectorMs[1];
    const sector1Ms = sectorTotalMs(lap.sector1TimeInMS, lap.sector1TimeMinutes);
    const sector2Ms = sectorTotalMs(lap.sector2TimeInMS, lap.sector2TimeMinutes);

    if (lap.lastLapTimeInMS > 0 && completedLapNum > lastProcessedPlayerCompletedLap) {
      finalizePlayerLap(completedLapNum, lap.lastLapTimeInMS);
    }

    if (sector1Ms > 0) {
      playerCurrentLapSectorMs[0] = sector1Ms;
      if (sector1Ms !== previousSector1Ms) applyPlayerSector(0, sector1Ms, currentLapNum);
    }

    if (sector2Ms > 0) {
      playerCurrentLapSectorMs[1] = sector2Ms;
      if (sector2Ms !== previousSector2Ms) applyPlayerSector(1, sector2Ms, currentLapNum);
    }

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

  fetch('/api/state')
    .then(r => r.json())
    .then(handleInit)
    .catch(() => {});

})();
