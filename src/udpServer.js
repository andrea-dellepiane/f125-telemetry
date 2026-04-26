'use strict';
const dgram = require('dgram');
const { parsePacket } = require('./packetParser');
const { updateState } = require('./state');

/**
 * Creates and binds a UDP socket that listens for F1 25 telemetry packets.
 * Every successfully parsed packet is forwarded via the onPacket callback
 * AND used to update the shared application state.
 *
 * @param {number} port   UDP port (default 20777)
 * @param {(type: string, data: object) => void} onPacket
 * @returns {dgram.Socket}
 */
function createUdpServer(port, onPacket) {
  const socket = dgram.createSocket({ type: 'udp4', reuseAddr: true });

  socket.on('error', (err) => {
    console.error('UDP server error:', err.message);
  });

  socket.on('message', (msg) => {
    try {
      const result = parsePacket(msg);
      if (result) {
        updateState(result);
        onPacket(result.type, result.data);
      }
    } catch (_) {
      // Silently ignore malformed packets
    }
  });

  socket.on('listening', () => {
    const { address, port: p } = socket.address();
    console.log(`UDP server listening on ${address}:${p}`);
  });

  socket.bind(port);
  return socket;
}

module.exports = { createUdpServer };
