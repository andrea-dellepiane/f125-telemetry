'use strict';
const path    = require('path');
const express = require('express');
const http    = require('http');
const { Server } = require('socket.io');

const { createUdpServer } = require('./src/udpServer');
const { startSimulator   } = require('./src/simulator');
const { getState         } = require('./src/state');

const PORT     = process.env.PORT     ? parseInt(process.env.PORT)     : 3000;
const UDP_PORT = process.env.UDP_PORT ? parseInt(process.env.UDP_PORT) : 20777;
const DEMO     = process.argv.includes('--demo') || process.env.DEMO === '1';

// ── HTTP + Socket.io setup ────────────────────────────────────────────────────
const app    = express();
const server = http.createServer(app);
const io     = new Server(server, { cors: { origin: '*' } });

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

/** Snapshot of the full application state (useful for initial page load) */
app.get('/api/state', (_req, res) => res.json(getState()));

/**
 * Rule-based AI lap analysis endpoint.
 * Expects { samples: [{lapDistance, speed, throttle, brake, gear, steer, timestamp}], lapTimeMs }
 */
app.post('/api/analyze-lap', (req, res) => {
  const { samples = [], lapTimeMs = 0 } = req.body || {};
  const hints = [];

  if (samples.length < 10) {
    return res.json({ hints: ["Dati insufficienti per l'analisi. Completa un giro intero."] });
  }

  // ── Braking analysis ──────────────────────────────────────────────────────
  const brakingZones = [];
  let inBraking = false;
  let brakeStart = null;

  samples.forEach((s, i) => {
    if (!inBraking && s.brake > 0.15) {
      inBraking  = true;
      brakeStart = s;
    } else if (inBraking && s.brake <= 0.05) {
      inBraking = false;
      if (brakeStart) {
        brakingZones.push({
          dist:       brakeStart.lapDistance,
          entrySpeed: brakeStart.speed,
          minSpeed:   Math.min(...samples.slice(
            samples.indexOf(brakeStart), i + 1
          ).map(x => x.speed)),
          duration: s.timestamp - brakeStart.timestamp,
        });
        brakeStart = null;
      }
    }
  });

  // Late throttle detection (>300 ms after brake release before throttle > 0.3)
  let lateThrottleCount = 0;
  samples.forEach((s, i) => {
    if (i < 3) return;
    const prev = samples[i - 1];
    if (prev.brake > 0.1 && s.brake <= 0.05) {
      // Find when throttle opens
      let tOpen = null;
      for (let j = i; j < Math.min(i + 20, samples.length); j++) {
        if (samples[j].throttle > 0.3) { tOpen = samples[j].timestamp; break; }
      }
      if (tOpen === null || tOpen - s.timestamp > 300) lateThrottleCount++;
    }
  });

  // Over-braking detection (braking with < 30 km/h, waste of energy)
  const overBraking = brakingZones.filter(z => z.minSpeed < 30 && z.entrySpeed > 100);

  // Top speed
  const maxSpeed = Math.max(...samples.map(s => s.speed));
  const avgSpeed = samples.reduce((a, s) => a + s.speed, 0) / samples.length;

  // Gear analysis (check if staying in low gear at high speed)
  const highSpeedLowGear = samples.filter(s => s.speed > 200 && s.gear < 5).length;

  // Steering analysis (high steer while braking = possible rotation issue)
  const brakeAndSteer = samples.filter(s => s.brake > 0.3 && Math.abs(s.steer) > 0.3).length;

  // ── Generate hints ──────────────────────────────────────────────────────
  if (lapTimeMs > 0) {
    const mins = Math.floor(lapTimeMs / 60000);
    const secs = ((lapTimeMs % 60000) / 1000).toFixed(3);
    hints.push(`⏱ Tempo giro: ${mins}:${secs.padStart(6, '0')}`);
  }

  hints.push(`📊 Velocità media: ${Math.round(avgSpeed)} km/h | Velocità max: ${Math.round(maxSpeed)} km/h`);

  if (lateThrottleCount > 3) {
    hints.push(`🟡 Apertura gas tardiva in ${lateThrottleCount} curve. Apri il gas prima all'uscita per guadagnare accelerazione.`);
  } else if (lateThrottleCount === 0) {
    hints.push(`✅ Ottima gestione del gas – apertura efficiente in tutte le curve.`);
  }

  if (overBraking.length > 0) {
    const worst = overBraking.sort((a, b) => b.entrySpeed - a.entrySpeed)[0];
    hints.push(`🔴 Frenata eccessiva rilevata a ${Math.round(worst.dist)} m (entrata a ${Math.round(worst.entrySpeed)} km/h). Riduci la forza frenante per preservare i pneumatici.`);
  }

  if (brakingZones.length > 0) {
    const avgBrakeEntry = Math.round(brakingZones.reduce((a, z) => a + z.entrySpeed, 0) / brakingZones.length);
    if (avgBrakeEntry > 200) {
      hints.push(`✅ Buoni punti di frenata – entri mediamente a ${avgBrakeEntry} km/h nelle frenate.`);
    } else {
      hints.push(`🟡 Punti di frenata anticipati – entri mediamente a ${avgBrakeEntry} km/h. Prova a frenare più tardi per guadagnare tempo.`);
    }
  }

  if (highSpeedLowGear > 5) {
    hints.push(`🟡 Marcia bassa ad alta velocità in ${highSpeedLowGear} campioni. Controlla le scalate anticipate nelle curve veloci.`);
  }

  if (brakeAndSteer > 10) {
    hints.push(`🔴 Sterzo accentuato durante la frenata rilevato ${brakeAndSteer} volte – rischio di bloccaggio. Frena dritto prima di sterzare.`);
  }

  if (avgSpeed < 120) {
    hints.push(`🟡 Velocità media bassa (${Math.round(avgSpeed)} km/h). Verifica le traiettorie nelle curva lente per migliorare la percorrenza.`);
  }

  if (hints.length <= 2) {
    hints.push(`🏆 Giro eccellente! Mantieni la consistenza e lavora sulla regolarità settore per settore.`);
  }

  res.json({ hints, stats: { lapTimeMs, maxSpeed, avgSpeed, brakingZones: brakingZones.length } });
});

// ── Socket.io ─────────────────────────────────────────────────────────────────
io.on('connection', (socket) => {
  console.log(`Client connected: ${socket.id}`);

  // Send the full current state immediately so the dashboard pre-fills
  const s = getState();
  socket.emit('init', s);

  socket.on('disconnect', () =>
    console.log(`Client disconnected: ${socket.id}`)
  );
});

// ── Shared emit helper used by both the UDP path and the simulator ─────────────
function onPacket(type, data) {
  io.emit(type, data);

  if (type === 'lapData' && data && Array.isArray(data.cars)) {
    io.emit('allLapData', { playerCarIndex: data.playerCarIndex, cars: data.cars });
  }

  if (type === 'carStatus' && data && Array.isArray(data.cars)) {
    io.emit('allCarStatus', { playerCarIndex: data.playerCarIndex, cars: data.cars });
  }
}

// ── Start data source ─────────────────────────────────────────────────────────
if (DEMO) {
  startSimulator(onPacket);
} else {
  createUdpServer(UDP_PORT, onPacket);
  console.log(`Waiting for F1 25 UDP data on port ${UDP_PORT}…`);
  console.log('Tip: run with --demo to use the built-in simulator instead.');
}

// ── Periodically push the track trace (for circuit visualisation) ─────────────
setInterval(() => {
  const { trackTrace } = getState();
  if (trackTrace.length) io.emit('trackTrace', trackTrace);
}, 1000);

// ── Start HTTP server ─────────────────────────────────────────────────────────
server.listen(PORT, () => {
  console.log(`\nF1 25 Telemetry Dashboard → http://localhost:${PORT}\n`);
});
