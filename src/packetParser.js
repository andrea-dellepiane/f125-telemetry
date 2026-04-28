'use strict';
/**
 * F1 2025 UDP Packet Parser
 *
 * Based on the publicly available F1 24 UDP specification
 * (Codemasters / EA Sports) – the F1 25 wire format is compatible.
 *
 * Packet IDs:
 *  0  Motion
 *  1  Session
 *  2  Lap Data
 *  3  Event
 *  4  Participants
 *  5  Car Setups
 *  6  Car Telemetry
 *  7  Car Status
 *  8  Final Classification
 *  9  Lobby Info
 * 10  Car Damage
 * 11  Session History
 * 12  Tyre Sets
 * 13  Motion Extended
 */

const PACKET_ID = {
  MOTION:       0,
  SESSION:      1,
  LAP_DATA:     2,
  EVENT:        3,
  PARTICIPANTS: 4,
  CAR_SETUPS:   5,
  CAR_TELEMETRY:6,
  CAR_STATUS:   7,
  FINAL_CLASS:  8,
  LOBBY_INFO:   9,
  CAR_DAMAGE:  10,
  SESSION_HIST:11,
  TYRE_SETS:   12,
  MOTION_EX:   13,
};

const LAP_DATA_SIZE = 57; // bytes per car in F1 25
const CAR_TELEMETRY_SIZE = 60; // bytes per car
const CAR_STATUS_SIZE = 55; // bytes per car
const PARTICIPANT_DATA_SIZE = 57; // bytes per car

/** Header is 29 bytes at the start of every packet */
function parseHeader(buf) {
  if (buf.length < 29) return null;
  let o = 0;
  const packetFormat           = buf.readUInt16LE(o); o += 2;
  const gameYear               = buf.readUInt8(o);    o += 1;
  const gameMajorVersion       = buf.readUInt8(o);    o += 1;
  const gameMinorVersion       = buf.readUInt8(o);    o += 1;
  const packetVersion          = buf.readUInt8(o);    o += 1;
  const packetId               = buf.readUInt8(o);    o += 1;
  const sessionUID             = buf.readBigUInt64LE(o).toString(); o += 8;
  const sessionTime            = buf.readFloatLE(o);  o += 4;
  const frameIdentifier        = buf.readUInt32LE(o); o += 4;
  const overallFrameIdentifier = buf.readUInt32LE(o); o += 4;
  const playerCarIndex         = buf.readUInt8(o);    o += 1;
  const secondaryPlayerCarIndex= buf.readUInt8(o);    o += 1;
  return {
    header: { packetFormat, gameYear, gameMajorVersion, gameMinorVersion,
              packetVersion, packetId, sessionUID, sessionTime,
              frameIdentifier, overallFrameIdentifier,
              playerCarIndex, secondaryPlayerCarIndex },
    offset: o,
  };
}

// ─── Motion (ID 0) ────────────────────────────────────────────────────────────
function parseMotion(buf, headerOffset, playerCarIndex) {
  const CAR_MOTION_SIZE = 60; // bytes per car
  const cars = [];
  let o = headerOffset;

  for (let i = 0; i < 22; i++) {
    if (o + CAR_MOTION_SIZE > buf.length) break;
    const worldPositionX   = buf.readFloatLE(o);  o += 4;
    const worldPositionY   = buf.readFloatLE(o);  o += 4;
    const worldPositionZ   = buf.readFloatLE(o);  o += 4;
    const worldVelocityX   = buf.readFloatLE(o);  o += 4;
    const worldVelocityY   = buf.readFloatLE(o);  o += 4;
    const worldVelocityZ   = buf.readFloatLE(o);  o += 4;
    /* worldForwardDir */ o += 6;
    /* worldRightDir   */ o += 6;
    const gForceLateral    = buf.readFloatLE(o);  o += 4;
    const gForceLongitudinal=buf.readFloatLE(o);  o += 4;
    const gForceVertical   = buf.readFloatLE(o);  o += 4;
    const yaw              = buf.readFloatLE(o);  o += 4;
    const pitch            = buf.readFloatLE(o);  o += 4;
    const roll             = buf.readFloatLE(o);  o += 4;
    cars.push({ worldPositionX, worldPositionY, worldPositionZ,
                worldVelocityX, worldVelocityY, worldVelocityZ,
                gForceLateral, gForceLongitudinal, gForceVertical,
                yaw, pitch, roll });
  }

  const player = cars[playerCarIndex] || cars[0];
  return {
    type: 'motion',
    data: {
      playerCarIndex,
      playerCar: player || {},
      allCars: cars.map((c, i) => ({
        carIndex: i, x: c.worldPositionX, z: c.worldPositionZ })),
    },
  };
}

// ─── Session (ID 1) ───────────────────────────────────────────────────────────
function parseSession(buf, o) {
  if (o + 17 > buf.length) return null;
  const weather           = buf.readUInt8(o);    o += 1;
  const trackTemperature  = buf.readInt8(o);     o += 1;
  const airTemperature    = buf.readInt8(o);     o += 1;
  const totalLaps         = buf.readUInt8(o);    o += 1;
  const trackLength       = buf.readUInt16LE(o); o += 2;
  const sessionType       = buf.readUInt8(o);    o += 1;
  const trackId           = buf.readInt8(o);     o += 1;
  const formula           = buf.readUInt8(o);    o += 1;
  const sessionTimeLeft   = buf.readUInt16LE(o); o += 2;
  const sessionDuration   = buf.readUInt16LE(o); o += 2;
  const pitSpeedLimit     = buf.readUInt8(o);    o += 1;
  const gamePaused        = buf.readUInt8(o);    o += 1;
  const isSpectating      = buf.readUInt8(o);    o += 1;
  const spectatorCarIndex = buf.readUInt8(o);    o += 1;
  /* sliProNativeSupport */ o += 1;
  const numMarshalZones   = buf.readUInt8(o);    o += 1;
  // Skip marshal zones (21 * 5 = 105 bytes)
  o += 105;
  const safetyCarStatus   = buf.readUInt8(o);    o += 1;
  const networkGame       = buf.readUInt8(o);    o += 1;
  // Skip weather forecast samples prefix (numWeatherForecastSamples uint8)
  const numWeatherForecastSamples = buf.readUInt8(o); o += 1;
  // Skip weather forecast samples (64 * 8 = 512 bytes)
  o += 512;
  /* forecastAccuracy */ o += 1;
  const aiDifficulty      = buf.readUInt8(o);    o += 1;
  // Skip link identifiers (3 * uint32 = 12 bytes)
  o += 12;
  const pitStopWindowIdealLap  = buf.readUInt8(o); o += 1;
  const pitStopWindowLatestLap = buf.readUInt8(o); o += 1;
  const pitStopRejoinPosition  = buf.readUInt8(o); o += 1;
  // Skip assist flags (9 bytes)
  o += 9;
  const gameMode          = buf.readUInt8(o);    o += 1;
  /* ruleSet */ o += 1;
  const timeOfDay         = (o + 4 <= buf.length) ? buf.readUInt32LE(o) : 0;

  return {
    type: 'session',
    data: {
      weather, trackTemperature, airTemperature, totalLaps, trackLength,
      sessionType, trackId, formula, sessionTimeLeft, sessionDuration,
      pitSpeedLimit, gamePaused, isSpectating, spectatorCarIndex,
      numMarshalZones, safetyCarStatus, networkGame, aiDifficulty,
      pitStopWindowIdealLap, pitStopWindowLatestLap, pitStopRejoinPosition,
      gameMode, timeOfDay,
    },
  };
}

// ─── Lap Data (ID 2) ─────────────────────────────────────────────────────────
function readLapDataAt(buf, offset, carIndex) {
  if (offset + LAP_DATA_SIZE > buf.length) return null;
  let p = offset;

  const lastLapTimeInMS          = buf.readUInt32LE(p); p += 4;
  const currentLapTimeInMS       = buf.readUInt32LE(p); p += 4;
  const sector1TimeInMS          = buf.readUInt16LE(p); p += 2;
  const sector1TimeMinutes       = buf.readUInt8(p);    p += 1;
  const sector2TimeInMS          = buf.readUInt16LE(p); p += 2;
  const sector2TimeMinutes       = buf.readUInt8(p);    p += 1;
  const deltaToCarInFrontInMS    = buf.readUInt16LE(p); p += 2;
  const deltaToRaceLeaderInMS    = buf.readUInt16LE(p); p += 2;
  const lapDistance              = buf.readFloatLE(p);  p += 4;
  const totalDistance            = buf.readFloatLE(p);  p += 4;
  const safetyCarDelta           = buf.readFloatLE(p);  p += 4;
  const carPosition              = buf.readUInt8(p);    p += 1;
  const currentLapNum            = buf.readUInt8(p);    p += 1;
  const pitStatus                = buf.readUInt8(p);    p += 1;
  const numPitStops              = buf.readUInt8(p);    p += 1;
  const sector                   = buf.readUInt8(p);    p += 1;
  const currentLapInvalid        = buf.readUInt8(p);    p += 1;
  const penalties                = buf.readUInt8(p);    p += 1;
  const totalWarnings            = buf.readUInt8(p);    p += 1;
  const cornerCuttingWarnings    = buf.readUInt8(p);    p += 1;
  const numUnservedDriveThroughPens = buf.readUInt8(p); p += 1;
  const numUnservedStopGoPens    = buf.readUInt8(p);    p += 1;
  const gridPosition             = buf.readUInt8(p);    p += 1;
  const driverStatus             = buf.readUInt8(p);    p += 1;
  const resultStatus             = buf.readUInt8(p);    p += 1;
  const pitLaneTimerActive       = buf.readUInt8(p);    p += 1;
  const pitLaneTimeInLaneInMS    = buf.readUInt16LE(p); p += 2;
  const pitStopTimerInMS         = buf.readUInt16LE(p); p += 2;
  const pitStopShouldServePen    = buf.readUInt8(p);    p += 1;
  const speedTrapFastestSpeed    = buf.readFloatLE(p);  p += 4;
  const speedTrapFastestLap      = buf.readUInt8(p);    p += 1;

  return {
    carIndex,
    lastLapTimeInMS, currentLapTimeInMS,
    sector1TimeInMS, sector1TimeMinutes,
    sector2TimeInMS, sector2TimeMinutes,
    deltaToCarInFrontInMS, deltaToRaceLeaderInMS,
    lapDistance, totalDistance, safetyCarDelta,
    carPosition, currentLapNum, pitStatus, numPitStops,
    sector, currentLapInvalid, penalties, totalWarnings,
    cornerCuttingWarnings, numUnservedDriveThroughPens,
    numUnservedStopGoPens, gridPosition, driverStatus,
    resultStatus, pitLaneTimerActive, pitLaneTimeInLaneInMS,
    pitStopTimerInMS, pitStopShouldServePen,
    speedTrapFastestSpeed, speedTrapFastestLap,
  };
}

function parseLapData(buf, headerOffset, playerCarIndex) {
  const cars = [];
  for (let i = 0; i < 22; i++) {
    const carData = readLapDataAt(buf, headerOffset + i * LAP_DATA_SIZE, i);
    if (carData) cars.push(carData);
  }
  if (!cars.length) return null;

  const player = cars[playerCarIndex] || cars[0];
  const trailerOffset = headerOffset + LAP_DATA_SIZE * 22;
  const timeTrialPBCarIdx = trailerOffset < buf.length ? buf.readUInt8(trailerOffset) : 255;
  const timeTrialRivalCarIdx = trailerOffset + 1 < buf.length ? buf.readUInt8(trailerOffset + 1) : 255;

  return {
    type: 'lapData',
    data: {
      playerCarIndex,
      player,
      cars,
      timeTrialPBCarIdx,
      timeTrialRivalCarIdx,
    },
  };
}

// ─── Car Telemetry (ID 6) ────────────────────────────────────────────────────
function parseCarTelemetry(buf, headerOffset, playerCarIndex) {
  const o = headerOffset + playerCarIndex * CAR_TELEMETRY_SIZE;
  if (o + CAR_TELEMETRY_SIZE > buf.length) return null;
  let p = o;

  const speed              = buf.readUInt16LE(p); p += 2;
  const throttle           = buf.readFloatLE(p);  p += 4;
  const steer              = buf.readFloatLE(p);  p += 4;
  const brake              = buf.readFloatLE(p);  p += 4;
  const clutch             = buf.readUInt8(p);    p += 1;
  const gear               = buf.readInt8(p);     p += 1;
  const engineRPM          = buf.readUInt16LE(p); p += 2;
  const drs                = buf.readUInt8(p);    p += 1;
  const revLightsPercent   = buf.readUInt8(p);    p += 1;
  const revLightsBitValue  = buf.readUInt16LE(p); p += 2;

  const brakesTemperature = [];
  for (let i = 0; i < 4; i++) { brakesTemperature.push(buf.readUInt16LE(p)); p += 2; }

  const tyresSurfaceTemperature = [];
  for (let i = 0; i < 4; i++) { tyresSurfaceTemperature.push(buf.readUInt8(p)); p += 1; }

  const tyresInnerTemperature = [];
  for (let i = 0; i < 4; i++) { tyresInnerTemperature.push(buf.readUInt8(p)); p += 1; }

  const engineTemperature  = buf.readUInt16LE(p); p += 2;

  const tyresPressure = [];
  for (let i = 0; i < 4; i++) { tyresPressure.push(buf.readFloatLE(p)); p += 4; }

  const surfaceType = [];
  for (let i = 0; i < 4; i++) { surfaceType.push(buf.readUInt8(p)); p += 1; }

  return {
    type: 'carTelemetry',
    data: {
      playerCarIndex,
      player: {
        speed, throttle, steer, brake, clutch, gear, engineRPM, drs,
        revLightsPercent, revLightsBitValue, brakesTemperature,
        tyresSurfaceTemperature, tyresInnerTemperature, engineTemperature,
        tyresPressure, surfaceType,
      },
    },
  };
}

// ─── Car Status (ID 7) ───────────────────────────────────────────────────────
function readCarStatusAt(buf, offset, carIndex) {
  if (offset + CAR_STATUS_SIZE > buf.length) return null;
  let p = offset;

  const tractionControl       = buf.readUInt8(p);  p += 1;
  const antiLockBrakes        = buf.readUInt8(p);  p += 1;
  const fuelMix               = buf.readUInt8(p);  p += 1;
  const frontBrakeBias        = buf.readUInt8(p);  p += 1;
  const pitLimiterStatus      = buf.readUInt8(p);  p += 1;
  const fuelInTank            = buf.readFloatLE(p);p += 4;
  const fuelCapacity          = buf.readFloatLE(p);p += 4;
  const fuelRemainingLaps     = buf.readFloatLE(p);p += 4;
  const maxRPM                = buf.readUInt16LE(p);p += 2;
  const idleRPM               = buf.readUInt16LE(p);p += 2;
  const maxGears              = buf.readUInt8(p);  p += 1;
  const drsAllowed            = buf.readUInt8(p);  p += 1;
  const drsActivationDistance = buf.readUInt16LE(p);p += 2;
  const actualTyreCompound    = buf.readUInt8(p);  p += 1;
  const visualTyreCompound    = buf.readUInt8(p);  p += 1;
  const tyresAgeLaps          = buf.readUInt8(p);  p += 1;
  const vehicleFiaFlags       = buf.readInt8(p);   p += 1;
  const enginePowerICE        = buf.readFloatLE(p);p += 4;
  const enginePowerMGUK       = buf.readFloatLE(p);p += 4;
  const ersStoreEnergy        = buf.readFloatLE(p);p += 4;
  const ersDeployMode         = buf.readUInt8(p);  p += 1;
  const ersHarvestedThisLapMGUK = buf.readFloatLE(p);p += 4;
  const ersHarvestedThisLapMGUH = buf.readFloatLE(p);p += 4;
  const ersDeployedThisLap    = buf.readFloatLE(p);p += 4;
  const networkPaused         = buf.readUInt8(p);  p += 1;

  return {
    carIndex,
    tractionControl, antiLockBrakes, fuelMix, frontBrakeBias,
    pitLimiterStatus, fuelInTank, fuelCapacity, fuelRemainingLaps,
    maxRPM, idleRPM, maxGears, drsAllowed, drsActivationDistance,
    actualTyreCompound, visualTyreCompound, tyresAgeLaps, vehicleFiaFlags,
    enginePowerICE, enginePowerMGUK, ersStoreEnergy, ersDeployMode,
    ersHarvestedThisLapMGUK, ersHarvestedThisLapMGUH, ersDeployedThisLap,
    networkPaused,
  };
}

function parseCarStatus(buf, headerOffset, playerCarIndex) {
  const cars = [];
  for (let i = 0; i < 22; i++) {
    const carStatus = readCarStatusAt(buf, headerOffset + i * CAR_STATUS_SIZE, i);
    if (carStatus) cars.push(carStatus);
  }
  if (!cars.length) return null;

  return {
    type: 'carStatus',
    data: {
      playerCarIndex,
      player: cars[playerCarIndex] || cars[0],
      cars,
    },
  };
}

// ─── Participants (ID 4) ─────────────────────────────────────────────────────
function readUtf8CString(buf, offset, length) {
  const slice = buf.subarray(offset, offset + length);
  const zeroIdx = slice.indexOf(0);
  return slice.subarray(0, zeroIdx === -1 ? length : zeroIdx).toString('utf8').trim();
}

function driverCodeFromName(name, raceNumber) {
  const clean = (name || '').replace(/[^\p{L}\p{N}\s'-]/gu, '').trim();
  if (!clean) return String(raceNumber || 0).padStart(2, '0');
  const parts = clean.split(/\s+/).filter(Boolean);
  const source = (parts[parts.length - 1] || parts[0]).replace(/[^A-Za-z0-9]/g, '');
  return (source.slice(0, 3) || clean.slice(0, 3)).toUpperCase();
}

function parseParticipants(buf, headerOffset, playerCarIndex) {
  if (headerOffset >= buf.length) return null;
  let o = headerOffset;
  const numActiveCars = buf.readUInt8(o); o += 1;
  const participants = [];

  for (let i = 0; i < 22; i++) {
    if (o + PARTICIPANT_DATA_SIZE > buf.length) break;
    const aiControlled = buf.readUInt8(o); o += 1;
    const driverId     = buf.readUInt8(o); o += 1;
    const networkId    = buf.readUInt8(o); o += 1;
    const teamId       = buf.readUInt8(o); o += 1;
    const myTeam       = buf.readUInt8(o); o += 1;
    const raceNumber   = buf.readUInt8(o); o += 1;
    const nationality  = buf.readUInt8(o); o += 1;
    const driverName   = readUtf8CString(buf, o, 32); o += 32;
    const yourTelemetry = buf.readUInt8(o); o += 1;
    const showOnlineNames = buf.readUInt8(o); o += 1;
    const techLevel    = buf.readUInt16LE(o); o += 2;
    const platform     = buf.readUInt8(o); o += 1;
    const numColours   = buf.readUInt8(o); o += 1;
    const liveryColours = [];
    for (let c = 0; c < 4; c++) {
      const red = buf.readUInt8(o); o += 1;
      const green = buf.readUInt8(o); o += 1;
      const blue = buf.readUInt8(o); o += 1;
      liveryColours.push({ red, green, blue });
    }

    const primaryColour = liveryColours[0] || { red: 136, green: 136, blue: 136 };
    const teamColor = `#${[primaryColour.red, primaryColour.green, primaryColour.blue]
      .map((v) => v.toString(16).padStart(2, '0')).join('')}`;

    participants.push({
      carIndex: i,
      aiControlled,
      driverId,
      networkId,
      teamId,
      myTeam,
      raceNumber,
      nationality,
      driverName,
      driverCode: driverCodeFromName(driverName, raceNumber),
      yourTelemetry,
      showOnlineNames,
      techLevel,
      platform,
      numColours,
      liveryColours,
      teamColor,
    });
  }

  return {
    type: 'participants',
    data: {
      playerCarIndex,
      numActiveCars,
      participants,
    },
  };
}

// ─── Main parse entry ─────────────────────────────────────────────────────────
/**
 * Parse a raw UDP buffer from the F1 25 game.
 * @param {Buffer} buf
 * @returns {{ type: string, data: object } | null}
 */
function parsePacket(buf) {
  const result = parseHeader(buf);
  if (!result) return null;
  const { header, offset } = result;
  const { packetId, playerCarIndex } = header;

  // Inject header metadata into all results
  const withHeader = (r) => r ? Object.assign(r, { header }) : null;

  switch (packetId) {
    case PACKET_ID.MOTION:
      return withHeader(parseMotion(buf, offset, playerCarIndex));
    case PACKET_ID.SESSION:
      return withHeader(parseSession(buf, offset));
    case PACKET_ID.LAP_DATA:
      return withHeader(parseLapData(buf, offset, playerCarIndex));
    case PACKET_ID.PARTICIPANTS:
      return withHeader(parseParticipants(buf, offset, playerCarIndex));
    case PACKET_ID.CAR_TELEMETRY:
      return withHeader(parseCarTelemetry(buf, offset, playerCarIndex));
    case PACKET_ID.CAR_STATUS:
      return withHeader(parseCarStatus(buf, offset, playerCarIndex));
    default:
      return null; // Ignore unhandled packet types
  }
}

module.exports = { parsePacket, PACKET_ID };
