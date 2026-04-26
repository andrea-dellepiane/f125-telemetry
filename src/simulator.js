'use strict';
/**
 * Demo simulator – generates synthetic F1 telemetry packets and injects them
 * directly into the state + Socket.io bus so the dashboard works out-of-the-box
 * without a running F1 25 game.
 *
 * The simulated car follows an oval-ish circuit approximated with parametric
 * trigonometry so the track trace builds up naturally on the canvas.
 */

const { updateState } = require('./state');

// ── Simplified Monza-like circuit points (world-scale ≈ metres) ──────────────
function buildCircuit() {
  const pts = [];
  const steps = 600;
  for (let i = 0; i <= steps; i++) {
    const t = (i / steps) * Math.PI * 2;
    // Egg-shape: stretch one axis so it looks more like a real circuit
    const x = Math.cos(t) * 600 + Math.cos(2 * t) * 80;
    const z = Math.sin(t) * 300 + Math.sin(3 * t) * 40;
    pts.push({ x, z });
  }
  return pts;
}

const CIRCUIT = buildCircuit();

// ── Simulation state ──────────────────────────────────────────────────────────
let simIdx        = 0;       // position along the circuit
const LAP_STEPS   = CIRCUIT.length - 1;
let lapNum        = 1;
let lapStartTime  = Date.now();
let lastLapMs     = 0;
let bestLapMs     = Infinity;
let sector        = 0;
let totalLapCount = 0;

function lerp(a, b, t) { return a + (b - a) * t; }
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

function tick() {
  totalLapCount++;

  // Progress around the circuit
  simIdx = (simIdx + 1) % LAP_STEPS;
  const progress = simIdx / LAP_STEPS;

  if (simIdx === 0) {
    const elapsed = Date.now() - lapStartTime;
    lastLapMs = elapsed;
    if (elapsed < bestLapMs) bestLapMs = elapsed;
    lapNum++;
    lapStartTime = Date.now();
  }

  const p = CIRCUIT[simIdx];
  const pNext = CIRCUIT[(simIdx + 1) % LAP_STEPS];
  const dx = pNext.x - p.x;
  const dz = pNext.z - p.z;
  const yaw = Math.atan2(dx, dz);

  // Vary speed/throttle/brake around the circuit to simulate braking zones
  const speedFactor = 0.5 + 0.5 * Math.abs(Math.sin(progress * Math.PI * 8));
  const speed        = Math.round(lerp(80, 330, speedFactor));
  const throttle     = clamp(speedFactor + 0.1, 0, 1);
  const brake        = clamp(1 - speedFactor - 0.2, 0, 1);
  const gear         = clamp(Math.floor(lerp(1, 8, speedFactor)), 1, 8);
  const engineRPM    = Math.round(lerp(7000, 15000, speedFactor));
  const revLights    = Math.round(clamp(((engineRPM - 7000) / 8000) * 100, 0, 100));

  // ── Push motion ──
  updateState({
    type: 'motion',
    data: {
      playerCar: {
        worldPositionX: p.x,
        worldPositionY: 0,
        worldPositionZ: p.z,
        worldVelocityX: dx,
        worldVelocityY: 0,
        worldVelocityZ: dz,
        gForceLateral: Math.sin(progress * Math.PI * 6) * 3,
        gForceLongitudinal: brake > 0.2 ? -2 : throttle > 0.8 ? 0.5 : 0,
        gForceVertical: 1,
        yaw,
        pitch: 0,
        roll: 0,
      },
      allCars: CIRCUIT
        .filter((_, i) => i % Math.floor(LAP_STEPS / 10) === 0)
        .slice(0, 10)
        .map((pt, i) => ({
          carIndex: i + 1,
          x: pt.x + (i - 5) * 3,
          z: pt.z + (i - 5) * 2,
        })),
    },
  });

  // ── Push telemetry ──
  const tyreTemp = Math.round(lerp(80, 105, speedFactor));
  updateState({
    type: 'carTelemetry',
    data: {
      player: {
        speed,
        throttle,
        steer: Math.sin(progress * Math.PI * 12) * 0.3,
        brake,
        clutch: 0,
        gear,
        engineRPM,
        drs: speed > 250 && brake < 0.1 ? 1 : 0,
        revLightsPercent: revLights,
        revLightsBitValue: 0,
        brakesTemperature: [tyreTemp + 50, tyreTemp + 50, tyreTemp + 30, tyreTemp + 30],
        tyresSurfaceTemperature: [tyreTemp, tyreTemp, tyreTemp - 5, tyreTemp - 5],
        tyresInnerTemperature:   [tyreTemp + 10, tyreTemp + 10, tyreTemp + 5, tyreTemp + 5],
        engineTemperature: 105,
        tyresPressure: [23.5, 23.5, 22.0, 22.0],
        surfaceType: [0, 0, 0, 0],
      },
    },
  });

  // ── Push lap data ──
  const currentLapMs = Date.now() - lapStartTime;
  const s1 = currentLapMs * 0.35;
  const s2 = currentLapMs * 0.35;
  sector = progress < 0.35 ? 0 : progress < 0.7 ? 1 : 2;

  updateState({
    type: 'lapData',
    data: {
      lastLapTimeInMS:       lastLapMs,
      currentLapTimeInMS:    currentLapMs,
      sector1TimeInMS:       sector > 0 ? Math.round(s1) : 0,
      sector1TimeMinutes:    0,
      sector2TimeInMS:       sector > 1 ? Math.round(s2) : 0,
      sector2TimeMinutes:    0,
      deltaToCarInFrontInMS: Math.round(Math.random() * 5000),
      deltaToRaceLeaderInMS: Math.round(Math.random() * 30000),
      lapDistance:           progress * 5793,
      totalDistance:         (lapNum - 1) * 5793 + progress * 5793,
      safetyCarDelta:        0,
      carPosition:           1,
      currentLapNum:         lapNum,
      pitStatus:             0,
      numPitStops:           0,
      sector,
      currentLapInvalid:     0,
      penalties:             0,
      totalWarnings:         0,
      cornerCuttingWarnings: 0,
      numUnservedDriveThroughPens: 0,
      numUnservedStopGoPens: 0,
      gridPosition:          1,
      driverStatus:          4, // On flying lap
      resultStatus:          2, // Active
    },
  });

  // ── Push status every 30 ticks ──
  if (totalLapCount % 30 === 0) {
    const fuelConsumed = lapNum * 1.7;
    updateState({
      type: 'carStatus',
      data: {
        player: {
          tractionControl: 0,
          antiLockBrakes: 0,
          fuelMix: 1,
          frontBrakeBias: 56,
          pitLimiterStatus: 0,
          fuelInTank: Math.max(0, 110 - fuelConsumed),
          fuelCapacity: 110,
          fuelRemainingLaps: Math.max(0, 50 - lapNum + 1),
          maxRPM: 15000,
          idleRPM: 4500,
          maxGears: 8,
          drsAllowed: 1,
          drsActivationDistance: 0,
          actualTyreCompound: 16,
          visualTyreCompound: 16, // Soft
          tyresAgeLaps: lapNum - 1,
          vehicleFiaFlags: 0,
          enginePowerICE: 600000,
          enginePowerMGUK: 120000,
          ersStoreEnergy: clamp(4000000 * (0.3 + 0.7 * (1 - progress)), 0, 4000000),
          ersDeployMode: speed > 250 ? 3 : 1,
          ersHarvestedThisLapMGUK: progress * 1000000,
          ersHarvestedThisLapMGUH: progress * 500000,
          ersDeployedThisLap: progress * 1500000,
          networkPaused: 0,
        },
      },
    });

    // ── Push session every 30 ticks ──
    updateState({
      type: 'session',
      data: {
        weather: 0,
        trackTemperature: 42,
        airTemperature: 28,
        totalLaps: 53,
        trackLength: 5793,
        sessionType: 10,  // Race
        trackId: 11,      // Monza
        formula: 0,
        sessionTimeLeft: Math.max(0, 5400 - totalLapCount),
        sessionDuration: 5400,
        pitSpeedLimit: 80,
        gamePaused: 0,
        isSpectating: 0,
        spectatorCarIndex: 255,
        numMarshalZones: 0,
        safetyCarStatus: 0,
        networkGame: 0,
        aiDifficulty: 95,
        gameMode: 0,
        timeOfDay: 700,
      },
    });
  }

  return { progress, speed, lapNum };
}

/**
 * Start the demo simulator.
 * @param {(type: string, data: object) => void} onPacket  – socket.io emit callback
 * @param {number} intervalMs – simulation tick rate in ms (default 16 ≈ 60 fps)
 * @returns {NodeJS.Timeout}
 */
function startSimulator(onPacket, intervalMs = 80) {
  console.log('▶  Demo simulator running (no F1 25 game required)');
  return setInterval(() => {
    tick();
    // We broadcast the full updated state slices via the onPacket callback
    // by re-emitting the just-updated state keys so the frontend refreshes.
    const state = require('./state').getState();
    onPacket('motion',       state.motion);
    onPacket('carTelemetry', { player: state.playerTelemetry });
    onPacket('lapData',      state.lapData);
    onPacket('carStatus',    { player: state.playerStatus });
    onPacket('session',      state.session);
    onPacket('trackTrace',   state.trackTrace);
  }, intervalMs);
}

module.exports = { startSimulator };
