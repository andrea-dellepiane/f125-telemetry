# F1 25 Telemetry Dashboard

A real-time telemetry dashboard for **Formula 1 2025** that receives UDP broadcast data from the game and displays it in a live web interface.

## Features

- 🏎️ **Live telemetry** – Speed, throttle, brake, steer, gear, RPM, DRS, ERS
- ⏱️ **Timing** – Current / last / best lap times, sector splits, gaps
- 🏁 **Session info** – Track name, session type, weather, lap counter, safety car
- 🔴 **Tyre data** – Surface & inner temperatures, brake temps, pressure (per corner)
- ⛽ **Fuel & ERS** – Fuel level, laps remaining, ERS store & deployment mode
- 🗺️ **Circuit map** – Canvas-based live circuit trace with car position (built from world coordinates as the car drives)
- 🎮 **Demo / simulator mode** – Works out-of-the-box without the game running

## Quick Start

### Install dependencies
```bash
npm install
```

### Run with the built-in simulator (no game required)
```bash
npm run demo
# or
node server.js --demo
```

Open **http://localhost:3000** in your browser.

### Run with F1 25 game data
```bash
npm start
```

In F1 25, go to **Settings → Telemetry Settings** and enable UDP telemetry:
- **UDP Telemetry**: On
- **UDP Broadcast Mode**: On
- **UDP IP Address**: IP of the machine running this server
- **UDP Port**: `20777` (default)
- **UDP Format**: 2025

### Environment variables
| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | HTTP server port |
| `UDP_PORT` | `20777` | UDP port to listen on |
| `DEMO` | `0` | Set to `1` to run simulator |

## Architecture

```
F1 25 game  ──UDP:20777──▶  Node.js server
                               │
                    ┌──────────┴──────────┐
                    │  Packet Parser       │
                    │  (Motion, Session,   │
                    │   LapData, CarTelm,  │
                    │   CarStatus)         │
                    └──────────┬──────────┘
                               │ Socket.io
                    ┌──────────▼──────────┐
                    │  Web Dashboard       │
                    │  (HTML/CSS/JS)       │
                    └─────────────────────┘
```

## UDP Packet Types Handled

| ID | Packet | Data Used |
|----|--------|-----------|
| 0 | Motion | World position (X/Z), G-forces, yaw |
| 1 | Session | Track, weather, session type, laps |
| 2 | Lap Data | Lap/sector times, position, gaps |
| 6 | Car Telemetry | Speed, throttle, brake, steer, gear, RPM, DRS, tyre temps |
| 7 | Car Status | Fuel, ERS, tyre compound, flags |
