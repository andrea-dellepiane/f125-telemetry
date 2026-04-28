'use strict';
/**
 * Application state – holds the latest data from every parsed UDP packet.
 * All consumers (HTTP API, Socket.io broadcasts) read from here.
 */

let state = {
  playerCarIndex: 0,

  session: {
    packetFormat: null,
    gameYear: null,
    weather: 0,           // 0-5: Clear, Light Cloud, Overcast, Light Rain, Heavy Rain, Storm
    trackTemperature: 0,
    airTemperature: 0,
    totalLaps: 0,
    trackLength: 0,
    sessionType: 0,       // 0=Unknown,1=P1,2=P2,3=P3,5=Q1,6=Q2,7=Q3,10=R,13=TT
    trackId: -1,
    sessionTimeLeft: 0,
    sessionDuration: 0,
    pitStopWindowIdealLap: 0,
    pitStopWindowLatestLap: 0,
    pitStopRejoinPosition: 0,
    safetyCarStatus: 0,   // 0=None,1=Full,2=Virtual,3=Formation Lap
    networkGame: 0,
    timeOfDay: 0,
    aiDifficulty: 0,
  },

  lapData: {
    lastLapTimeInMS: 0,
    currentLapTimeInMS: 0,
    sector1TimeInMS: 0,
    sector1TimeMinutes: 0,
    sector2TimeInMS: 0,
    sector2TimeMinutes: 0,
    deltaToCarInFrontInMS: 0,
    deltaToRaceLeaderInMS: 0,
    lapDistance: 0,
    totalDistance: 0,
    carPosition: 1,
    currentLapNum: 1,
    pitStatus: 0,
    numPitStops: 0,
    sector: 0,
    currentLapInvalid: 0,
    penalties: 0,
    gridPosition: 1,
    driverStatus: 0,
    resultStatus: 0,
  },

  playerTelemetry: {
    speed: 0,              // km/h
    throttle: 0,           // 0.0 – 1.0
    steer: 0,              // -1.0 (left) – 1.0 (right)
    brake: 0,              // 0.0 – 1.0
    clutch: 0,             // 0 – 100
    gear: 0,               // -1=R, 0=N, 1-8
    engineRPM: 0,
    drs: 0,                // 0=off, 1=on
    revLightsPercent: 0,   // 0 – 100
    brakesTemperature: [0, 0, 0, 0],        // FL FR RL RR (°C)
    tyresSurfaceTemperature: [0, 0, 0, 0],  // FL FR RL RR (°C)
    tyresInnerTemperature: [0, 0, 0, 0],    // FL FR RL RR (°C)
    engineTemperature: 0,
    tyresPressure: [0, 0, 0, 0],           // FL FR RL RR (PSI)
  },

  playerStatus: {
    tractionControl: 0,
    antiLockBrakes: 0,
    fuelMix: 0,           // 0=Lean,1=Standard,2=Rich,3=Max
    frontBrakeBias: 50,
    pitLimiterStatus: 0,
    fuelInTank: 0,
    fuelCapacity: 110,
    fuelRemainingLaps: 0,
    maxRPM: 15000,
    idleRPM: 4000,
    maxGears: 8,
    drsAllowed: 0,
    drsActivationDistance: 0,
    actualTyreCompound: 0,
    visualTyreCompound: 16, // 16=Soft,17=Medium,18=Hard,7=Inter,8=Wet
    tyresAgeLaps: 0,
    vehicleFiaFlags: 0,  // -1=Invalid,-2=None,0=Green,1=Blue,2=Yellow
    ersStoreEnergy: 0,   // Joules (max ~4,000,000)
    ersDeployMode: 0,    // 0=None,1=Medium,2=Hotlap,3=Overtake
    ersHarvestedThisLapMGUK: 0,
    ersHarvestedThisLapMGUH: 0,
    ersDeployedThisLap: 0,
  },

  motion: {
    playerPosition: { x: 0, y: 0, z: 0 },
    playerYaw: 0,
    allCars: [],
    // Full playerCar data (including g-forces) for client consumption
    playerCar: {},
  },

  // Accumulates world positions to build track layout on canvas
  trackTrace: [],

  // All 20 drivers – name, team, race number
  participants: [],

  // Per-car lap data (positions, gaps, penalties, pit status…)
  allLapData: [],

  // Per-car status (compound, tyre age, limiter, fuel, ERS...)
  allCarStatus: [],

  connected: false,
  lastUpdated: null,
};

function getState() {
  return state;
}

/**
 * Update state based on a parsed packet result.
 * @param {{ type: string, data: object }} result
 */
function updateState(result) {
  if (result && result.header && Number.isInteger(result.header.playerCarIndex)) {
    state.playerCarIndex = result.header.playerCarIndex;
  }

  switch (result.type) {
    case 'session':
      {
        const previousTrackId = state.session.trackId;
        const previousSessionType = state.session.sessionType;
        const previousSessionTimeLeft = state.session.sessionTimeLeft;

        Object.assign(state.session, result.data);
        state.connected = true;

        const trackChanged =
          Number.isInteger(result.data.trackId) &&
          previousTrackId !== result.data.trackId;
        const sessionTypeChanged =
          Number.isInteger(result.data.sessionType) &&
          previousSessionType !== result.data.sessionType;
        const sessionRestarted =
          typeof result.data.sessionTimeLeft === 'number' &&
          typeof previousSessionTimeLeft === 'number' &&
          previousSessionTimeLeft > 0 &&
          result.data.sessionTimeLeft > previousSessionTimeLeft + 20;

        if (trackChanged || sessionTypeChanged || sessionRestarted) {
          state.trackTrace = [];
        }
      }
      break;

    case 'lapData':
      Object.assign(state.lapData, result.data.player || result.data);
      if (Array.isArray(result.data.cars)) state.allLapData = result.data.cars;
      break;

    case 'carTelemetry':
      Object.assign(state.playerTelemetry, result.data.player);
      break;

    case 'carStatus':
      Object.assign(state.playerStatus, result.data.player || result.data);
      if (Array.isArray(result.data.cars)) state.allCarStatus = result.data.cars;
      break;

    case 'motion': {
      const pos = result.data.playerCar || {};
      state.motion.playerCar = pos;
      state.motion.playerPosition = {
        x: pos.worldPositionX || 0,
        y: pos.worldPositionY || 0,
        z: pos.worldPositionZ || 0,
      };
      state.motion.playerYaw = pos.yaw || 0;
      state.motion.allCars = result.data.allCars || [];

      // Accumulate track trace (sample every ~1 m to avoid flooding)
      const last = state.trackTrace[state.trackTrace.length - 1];
      const dx = last ? pos.worldPositionX - last.x : Infinity;
      const dz = last ? pos.worldPositionZ - last.z : Infinity;
      if (dx * dx + dz * dz > 1) {
        state.trackTrace.push({ x: pos.worldPositionX, z: pos.worldPositionZ });
        if (state.trackTrace.length > 15000) state.trackTrace.shift();
      }
      break;
    }

    case 'participants':
      state.participants = result.data.participants || [];
      break;

    case 'allLapData':
      state.allLapData = result.data.cars || [];
      break;

    default:
      break;
  }

  state.lastUpdated = Date.now();
}

module.exports = { getState, updateState };
