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

app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (_req, res) =>
  res.sendFile(path.join(__dirname, 'public', 'index.html'))
);

/** Snapshot of the full application state (useful for initial page load) */
app.get('/api/state', (_req, res) => res.json(getState()));

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
