'use strict';
/**
 * Demo simulator – generates synthetic F1 telemetry for the player car AND
 * 19 AI opponents so all dashboard panels (leaderboard, circuit map, etc.)
 * populate immediately without a running F1 25 game.
 */

const { updateState } = require('./state');

// ── 2025 F1 Grid ──────────────────────────────────────────────────────────────
const TEAMS = [
  { id: 0, name: 'Red Bull Racing', color: '#3671C6', short: 'RBR' },
  { id: 1, name: 'Ferrari',         color: '#E8002D', short: 'FER' },
  { id: 2, name: 'Mercedes',        color: '#27F4D2', short: 'MER' },
  { id: 3, name: 'McLaren',         color: '#FF8000', short: 'MCL' },
  { id: 4, name: 'Aston Martin',    color: '#358C75', short: 'AMR' },
  { id: 5, name: 'Alpine',          color: '#FF87BC', short: 'ALP' },
  { id: 6, name: 'Williams',        color: '#64C4FF', short: 'WIL' },
  { id: 7, name: 'RB',              color: '#6692FF', short: 'RB'  },
  { id: 8, name: 'Kick Sauber',     color: '#52E252', short: 'SAU' },
  { id: 9, name: 'Haas',            color: '#B6BABD', short: 'HAS' },
];

const DRIVERS = [
  { carIndex: 0,  code: 'VER', name: 'Verstappen', teamId: 0, number: 1,  pace: 0.99 },
  { carIndex: 1,  code: 'LAW', name: 'Lawson',     teamId: 0, number: 30, pace: 0.96 },
  { carIndex: 2,  code: 'LEC', name: 'Leclerc',    teamId: 1, number: 16, pace: 0.98 },
  { carIndex: 3,  code: 'HAM', name: 'Hamilton',   teamId: 1, number: 44, pace: 0.97 },
  { carIndex: 4,  code: 'RUS', name: 'Russell',    teamId: 2, number: 63, pace: 0.97 },
  { carIndex: 5,  code: 'ANT', name: 'Antonelli',  teamId: 2, number: 12, pace: 0.95 },
  { carIndex: 6,  code: 'NOR', name: 'Norris',     teamId: 3, number: 4,  pace: 0.98 },
  { carIndex: 7,  code: 'PIA', name: 'Piastri',    teamId: 3, number: 81, pace: 0.97 },
  { carIndex: 8,  code: 'ALO', name: 'Alonso',     teamId: 4, number: 14, pace: 0.96 },
  { carIndex: 9,  code: 'STR', name: 'Stroll',     teamId: 4, number: 18, pace: 0.93 },
  { carIndex: 10, code: 'GAS', name: 'Gasly',      teamId: 5, number: 10, pace: 0.94 },
  { carIndex: 11, code: 'DOO', name: 'Doohan',     teamId: 5, number: 7,  pace: 0.92 },
  { carIndex: 12, code: 'ALB', name: 'Albon',      teamId: 6, number: 23, pace: 0.93 },
  { carIndex: 13, code: 'SAI', name: 'Sainz',      teamId: 6, number: 55, pace: 0.96 },
  { carIndex: 14, code: 'TSU', name: 'Tsunoda',    teamId: 7, number: 22, pace: 0.94 },
  { carIndex: 15, code: 'HAD', name: 'Hadjar',     teamId: 7, number: 6,  pace: 0.92 },
  { carIndex: 16, code: 'HUL', name: 'Hulkenberg', teamId: 8, number: 27, pace: 0.93 },
  { carIndex: 17, code: 'BOR', name: 'Bortoleto',  teamId: 8, number: 5,  pace: 0.91 },
  { carIndex: 18, code: 'OCO', name: 'Ocon',       teamId: 9, number: 31, pace: 0.93 },
  { carIndex: 19, code: 'BEA', name: 'Bearman',    teamId: 9, number: 87, pace: 0.92 },
];

// ── Circuit ────────────────────────────────────────────────────────────────────
function buildCircuit() {
  const pts = [];
  const steps = 600;
  for (let i = 0; i <= steps; i++) {
    const t = (i / steps) * Math.PI * 2;
    const x = Math.cos(t) * 600 + Math.cos(2 * t) * 80;
    const z = Math.sin(t) * 300 + Math.sin(3 * t) * 40;
    pts.push({ x, z });
  }
  return pts;
}

const CIRCUIT   = buildCircuit();
const LAP_STEPS = CIRCUIT.length - 1;

// ── Per-car state ─────────────────────────────────────────────────────────────
function initCarStates() {
  return DRIVERS.map((d, i) => ({
    carIndex:     d.carIndex,
    simIdx:       Math.floor((LAP_STEPS / DRIVERS.length) * ((DRIVERS.length - i) % DRIVERS.length)),
    lapNum:       1,
    lapStartTime: Date.now() - Math.floor((i / DRIVERS.length) * 90000),
    lastLapMs:    0,
    bestLapMs:    Infinity,
    numPitStops:  0,
    pitStatus:    0,
    pitCountdown: 0,
    pitStopDone:  false,
    pitStopLap:   Math.min(45, 12 + Math.floor(Math.random() * 8) + i * 2),
    penalties:    0,
    hasFastestLap: false,
  }));
}

let carStates     = initCarStates();
let totalLapCount = 0;
let fastestLapMs  = Infinity;
let fastestLapCar = -1;

function lerp(a, b, t) { return a + (b - a) * t; }
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

function buildLeaderboard() {
  return [...carStates].sort((a, b) => {
    const aTotal = (a.lapNum - 1) * LAP_STEPS + a.simIdx;
    const bTotal = (b.lapNum - 1) * LAP_STEPS + b.simIdx;
    return bTotal - aTotal;
  });
}

function tick() {
  totalLapCount++;
  const playerState = carStates[0];

  carStates.forEach((cs, driverIdx) => {
    const driver = DRIVERS[driverIdx];

    // Pit stop trigger
    if (!cs.pitStopDone && cs.lapNum === cs.pitStopLap && cs.pitStatus === 0) {
      if (cs.simIdx > LAP_STEPS * 0.8) {
        cs.pitStatus    = 1;
        cs.pitCountdown = 250;
      }
    }

    if (cs.pitStatus > 0) {
      cs.pitCountdown--;
      if (cs.pitCountdown <= 0) {
        cs.pitStatus   = 0;
        cs.pitStopDone = true;
        cs.numPitStops++;
        cs.lapStartTime = Date.now();
      }
      return;
    }

    const advance = Math.round(lerp(1, 2, driver.pace));
    cs.simIdx = (cs.simIdx + advance) % LAP_STEPS;

    if (cs.simIdx < advance) {
      const elapsed = Date.now() - cs.lapStartTime;
      cs.lastLapMs  = elapsed;
      if (elapsed < cs.bestLapMs) {
        cs.bestLapMs = elapsed;
        if (elapsed < fastestLapMs) {
          fastestLapMs  = elapsed;
          fastestLapCar = cs.carIndex;
          carStates.forEach(c => { c.hasFastestLap = false; });
          cs.hasFastestLap = true;
        }
      }
      cs.lapNum++;
      cs.lapStartTime = Date.now();
    }
  });

  const progress    = playerState.simIdx / LAP_STEPS;
  const p           = CIRCUIT[playerState.simIdx];
  const pNext       = CIRCUIT[(playerState.simIdx + 1) % LAP_STEPS];
  const dx          = pNext.x - p.x;
  const dz          = pNext.z - p.z;
  const yaw         = Math.atan2(dx, dz);
  const speedFactor = 0.5 + 0.5 * Math.abs(Math.sin(progress * Math.PI * 8));
  const speed       = Math.round(lerp(80, 330, speedFactor));
  const throttle    = clamp(speedFactor + 0.1, 0, 1);
  const brake       = clamp(1 - speedFactor - 0.2, 0, 1);
  const gear        = clamp(Math.floor(lerp(1, 8, speedFactor)), 1, 8);
  const engineRPM   = Math.round(lerp(7000, 15000, speedFactor));
  const revLights   = Math.round(clamp(((engineRPM - 7000) / 8000) * 100, 0, 100));

  updateState({
    type: 'motion',
    data: {
      playerCar: {
        worldPositionX: p.x, worldPositionY: 0, worldPositionZ: p.z,
        worldVelocityX: dx,  worldVelocityY: 0, worldVelocityZ: dz,
        gForceLateral:      Math.sin(progress * Math.PI * 6) * 3,
        gForceLongitudinal: brake > 0.2 ? -2 : throttle > 0.8 ? 0.5 : 0,
        gForceVertical: 1,
        yaw, pitch: 0, roll: 0,
      },
      allCars: carStates.map(cs => {
        const cp = CIRCUIT[cs.simIdx];
        return { carIndex: cs.carIndex, x: cp.x, z: cp.z };
      }),
    },
  });

  const tyreTemp = Math.round(lerp(80, 105, speedFactor));
  updateState({
    type: 'carTelemetry',
    data: {
      player: {
        speed, throttle, steer: Math.sin(progress * Math.PI * 12) * 0.3,
        brake, clutch: 0, gear, engineRPM,
        drs: speed > 250 && brake < 0.1 ? 1 : 0,
        revLightsPercent: revLights, revLightsBitValue: 0,
        brakesTemperature:       [tyreTemp + 50, tyreTemp + 50, tyreTemp + 30, tyreTemp + 30],
        tyresSurfaceTemperature: [tyreTemp, tyreTemp, tyreTemp - 5, tyreTemp - 5],
        tyresInnerTemperature:   [tyreTemp + 10, tyreTemp + 10, tyreTemp + 5, tyreTemp + 5],
        engineTemperature: 105,
        tyresPressure: [23.5, 23.5, 22.0, 22.0],
        surfaceType: [0, 0, 0, 0],
      },
    },
  });

  const currentLapMs = Date.now() - playerState.lapStartTime;
  const s1ms  = currentLapMs * 0.35;
  const s2ms  = currentLapMs * 0.35;
  const sector = progress < 0.35 ? 0 : progress < 0.7 ? 1 : 2;

  updateState({
    type: 'lapData',
    data: {
      lastLapTimeInMS:       playerState.lastLapMs,
      currentLapTimeInMS:    currentLapMs,
      sector1TimeInMS:       sector > 0 ? Math.round(s1ms) : 0,
      sector1TimeMinutes:    0,
      sector2TimeInMS:       sector > 1 ? Math.round(s2ms) : 0,
      sector2TimeMinutes:    0,
      deltaToCarInFrontInMS: Math.round(Math.random() * 5000 + 200),
      deltaToRaceLeaderInMS: 0,
      lapDistance:           progress * 5793,
      totalDistance:         (playerState.lapNum - 1) * 5793 + progress * 5793,
      safetyCarDelta: 0, carPosition: 1,
      currentLapNum:  playerState.lapNum,
      pitStatus:      playerState.pitStatus,
      numPitStops:    playerState.numPitStops,
      sector, currentLapInvalid: 0, penalties: playerState.penalties,
      totalWarnings: 0, cornerCuttingWarnings: 0,
      numUnservedDriveThroughPens: 0, numUnservedStopGoPens: 0,
      gridPosition: 1, driverStatus: 4, resultStatus: 2,
    },
  });

  if (totalLapCount % 30 === 0) {
    const fuelConsumed = playerState.lapNum * 1.7;
    updateState({
      type: 'carStatus',
      data: {
        player: {
          tractionControl: 0, antiLockBrakes: 0, fuelMix: 1, frontBrakeBias: 56,
          pitLimiterStatus: playerState.pitStatus > 0 ? 1 : 0,
          fuelInTank:        Math.max(0, 110 - fuelConsumed),
          fuelCapacity: 110,
          fuelRemainingLaps: Math.max(0, 50 - playerState.lapNum + 1),
          maxRPM: 15000, idleRPM: 4500, maxGears: 8,
          drsAllowed: 1, drsActivationDistance: 0,
          actualTyreCompound: 16, visualTyreCompound: 16,
          tyresAgeLaps: playerState.lapNum - 1,
          vehicleFiaFlags: 0,
          enginePowerICE: 600000, enginePowerMGUK: 120000,
          ersStoreEnergy:          clamp(4000000 * (0.3 + 0.7 * (1 - progress)), 0, 4000000),
          ersDeployMode:           speed > 250 ? 3 : 1,
          ersHarvestedThisLapMGUK: progress * 1000000,
          ersHarvestedThisLapMGUH: progress * 500000,
          ersDeployedThisLap:      progress * 1500000,
          networkPaused: 0,
        },
      },
    });

    updateState({
      type: 'session',
      data: {
        weather: 0, trackTemperature: 42, airTemperature: 28,
        totalLaps: 53, trackLength: 5793, sessionType: 10, trackId: 11,
        formula: 0,
        sessionTimeLeft: Math.max(0, 5400 - totalLapCount),
        sessionDuration: 5400,
        pitSpeedLimit: 80, gamePaused: 0, isSpectating: 0,
        spectatorCarIndex: 255, numMarshalZones: 0, safetyCarStatus: 0,
        networkGame: 0, aiDifficulty: 95, gameMode: 0, timeOfDay: 700,
      },
    });

    // Leaderboard data
    const leaderboard = buildLeaderboard();
    const leaderTotal = (leaderboard[0].lapNum - 1) * LAP_STEPS + leaderboard[0].simIdx;

    const allLapDataCars = leaderboard.map((cs, pos) => {
      const driver = DRIVERS[cs.carIndex];
      const team   = TEAMS[driver.teamId];
      const lapMs  = Date.now() - cs.lapStartTime;
      const myTotal = (cs.lapNum - 1) * LAP_STEPS + cs.simIdx;
      const gapMs  = pos === 0 ? 0 : Math.round((leaderTotal - myTotal) * 80 * 0.9);

      return {
        carIndex:      cs.carIndex,
        position:      pos + 1,
        driverCode:    driver.code,
        driverName:    driver.name,
        teamId:        driver.teamId,
        teamName:      team.name,
        teamColor:     team.color,
        raceNumber:    driver.number,
        currentLapNum: cs.lapNum,
        currentLapTimeInMS: lapMs,
        lastLapTimeInMS:    cs.lastLapMs,
        bestLapTimeInMS:    cs.bestLapMs < Infinity ? cs.bestLapMs : 0,
        lapDistance:   (cs.simIdx / LAP_STEPS) * 5793,
        pitStatus:     cs.pitStatus,
        numPitStops:   cs.numPitStops,
        penalties:     cs.penalties,
        hasFastestLap: cs.hasFastestLap,
        gapToLeaderMs: gapMs,
        tyreCompound:  cs.numPitStops > 0 ? 18 : 16,
      };
    });

    updateState({ type: 'allLapData',   data: { cars: allLapDataCars } });
    updateState({ type: 'participants', data: {
      participants: DRIVERS.map(d => ({
        carIndex:   d.carIndex,
        driverCode: d.code,
        driverName: d.name,
        teamId:     d.teamId,
        teamName:   TEAMS[d.teamId].name,
        teamColor:  TEAMS[d.teamId].color,
        raceNumber: d.number,
      })),
      teams: TEAMS,
    }});
  }

  return { progress, speed, lapNum: playerState.lapNum };
}

function startSimulator(onPacket, intervalMs = 80) {
  console.log('▶  Demo simulator running (no F1 25 game required)');
  return setInterval(() => {
    tick();
    const state = require('./state').getState();
    onPacket('motion',       state.motion);
    onPacket('carTelemetry', { player: state.playerTelemetry });
    onPacket('lapData',      state.lapData);
    onPacket('carStatus',    { player: state.playerStatus });
    onPacket('session',      state.session);
    onPacket('trackTrace',   state.trackTrace);
    if (state.allLapData.length)   onPacket('allLapData',   { cars: state.allLapData });
    if (state.participants.length) onPacket('participants',  { participants: state.participants, teams: TEAMS });
  }, intervalMs);
}

module.exports = { startSimulator };
