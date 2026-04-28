'use strict';
/**
 * Circuit canvas – renders the F1 track map with:
 * - Real circuit image as background (from /circuits/ folder)
 * - All car positions with team colours overlaid on the image
 * - Car positions mapped using live telemetry bounding box
 */
(function () {

  const PLAYER_RADIUS    = 7;
  const RIVAL_RADIUS     = 4;
  const PADDING          = 20;

  // trackId → circuit image filename
  const TRACK_IMAGES = {
    0:  'Australia_Circuit.avif',       // Melbourne
    2:  'China_Circuit.avif',           // Shanghai
    3:  'Bahrain_Circuit.avif',         // Sakhir
    4:  'Spain_Circuit.avif',           // Catalunya
    5:  'Monaco_Circuit.avif',          // Monaco
    6:  'Canada_Circuit.avif',          // Montreal
    7:  'Great_Britain_Circuit.avif',   // Silverstone
    9:  'Hungary_Circuit.avif',         // Hungaroring
    10: 'Belgium_Circuit.avif',         // Spa
    11: 'Italy_Circuit.avif',           // Monza
    12: 'Singapore_Circuit.avif',       // Singapore
    13: 'Japan_Circuit.avif',           // Suzuka
    14: 'Abu_Dhabi_Circuit.avif',       // Yas Marina
    15: 'USA_Circuit.avif',             // Austin (COTA)
    17: 'Austria_Circuit.avif',         // Red Bull Ring
    18: 'Brazil_Circuit.avif',          // Interlagos
    20: 'Baku_Circuit.avif',            // Baku
    26: 'Netherlands_Circuit.avif',     // Zandvoort
    27: 'Emilia_Romagna_Circuit.avif',  // Imola
    29: 'Saudi_Arabia_Circuit.avif',    // Jeddah
    30: 'Miami_Circuit.avif',           // Miami
    31: 'Las_Vegas_Circuit.avif',       // Las Vegas
    32: 'Qatar_Circuit.avif',           // Lusail
    33: 'Mexico_Circuit.avif',          // Mexico City
  };

  // Team colour lookup (carIndex → CSS colour)
  const TEAM_COLOURS = {};
  const PARTICIPANTS = {};

  let canvas    = null;
  let ctx       = null;
  let circuitImgEl = null;
  let trackId   = -1;

  // Live trace used only to build a bounding box from real GPS data
  let trace     = [];
  let allCars   = [];
  let playerX   = null;
  let playerZ   = null;

  let bb        = { minX: -600, maxX: 600, minZ: -350, maxZ: 350 };
  let bbDirty   = true;
  let bbReady   = false;  // true once we have a real-data BB

  // ── Init ─────────────────────────────────────────────────────────────────
  function init(canvasEl) {
    canvas       = canvasEl;
    ctx          = canvas.getContext('2d');
    circuitImgEl = document.getElementById('circuit-img');
    window.addEventListener('resize', onResize);
    onResize();
    requestAnimationFrame(drawLoop);
  }

  function onResize() {
    if (!canvas) return;
    const wrap = canvas.parentElement;
    canvas.width  = wrap.clientWidth  || 400;
    canvas.height = wrap.clientHeight || 480;
    bbDirty = true;
  }

  // ── Public API ───────────────────────────────────────────────────────────
  function updateTrace(points) {
    if (!Array.isArray(points) || points.length < 10) return;
    trace   = points;
    bbDirty = true;
  }

  function updateCars(player, rivals) {
    if (player) { playerX = player.x; playerZ = player.z; }
    if (rivals)   allCars = rivals;
  }

  function setTrackId(id) {
    if (id === trackId) return;
    trackId  = id;
    trace    = [];   // reset trace on track change
    bbReady  = false;
    bbDirty  = true;

    // Show the circuit background image if available
    if (circuitImgEl) {
      const imgName = TRACK_IMAGES[id];
      if (imgName) {
        circuitImgEl.src = `/circuits/${imgName}`;
        circuitImgEl.classList.add('visible');
      } else {
        circuitImgEl.src = '';
        circuitImgEl.classList.remove('visible');
      }
    }
  }

  function setParticipants(participants) {
    if (!Array.isArray(participants)) return;
    participants.forEach(p => {
      PARTICIPANTS[p.carIndex] = p;
      TEAM_COLOURS[p.carIndex] = p.teamColor || '#888';
    });
  }

  // ── Bounding box ─────────────────────────────────────────────────────────
  function computeBB(pts) {
    if (!pts || pts.length < 2) return;
    let minX = Infinity, maxX = -Infinity;
    let minZ = Infinity, maxZ = -Infinity;
    for (const p of pts) {
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.z < minZ) minZ = p.z;
      if (p.z > maxZ) maxZ = p.z;
    }
    const marginX = (maxX - minX) * 0.1 + 30;
    const marginZ = (maxZ - minZ) * 0.1 + 30;
    bb = { minX: minX - marginX, maxX: maxX + marginX,
           minZ: minZ - marginZ, maxZ: maxZ + marginZ };
    bbDirty = false;
    bbReady = true;
  }

  function recomputeBB() {
    if (!bbDirty) return;
    // Prefer real telemetry data for accurate BB; it requires enough points
    if (trace.length >= 50) {
      computeBB(trace);
    } else {
      bbDirty = false;
    }
  }

  // World → canvas (maps real-world GPS coords to canvas pixels)
  function w2c(wx, wz) {
    const W = canvas.width, H = canvas.height;
    const scaleX = (W - PADDING * 2) / (bb.maxX - bb.minX);
    const scaleZ = (H - PADDING * 2) / (bb.maxZ - bb.minZ);
    const scale  = Math.min(scaleX, scaleZ);
    const cxOff  = (W - (bb.maxX - bb.minX) * scale) / 2;
    const czOff  = (H - (bb.maxZ - bb.minZ) * scale) / 2;
    return {
      cx: cxOff + (wx - bb.minX) * scale,
      cy: czOff + (wz - bb.minZ) * scale,
    };
  }

  // ── Draw ─────────────────────────────────────────────────────────────────
  function drawLoop() {
    requestAnimationFrame(drawLoop);
    draw();
  }

  function draw() {
    const W = canvas.width, H = canvas.height;
    ctx.clearRect(0, 0, W, H);

    recomputeBB();

    const hasImage = circuitImgEl && circuitImgEl.classList.contains('visible');

    if (!hasImage) {
      // No circuit image: dark background with waiting message
      ctx.fillStyle = '#070710';
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = '#2a2a4a';
      ctx.font = '13px "Segoe UI", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('In attesa dei dati telemetrici…', W / 2, H / 2);
      return;
    }

    // Transparent canvas – the circuit image is the background (shown via CSS <img>)
    // We only draw the car position dots on the canvas overlay

    if (!bbReady) {
      // Waiting for enough telemetry to build bounding box
      return;
    }

    // ── Rival cars ────────────────────────────────────────────────────────
    allCars.forEach(car => {
      if (car.carIndex === 0) return; // player drawn separately
      const { cx, cy } = w2c(car.x, car.z);
      const colour = TEAM_COLOURS[car.carIndex] || '#666';
      ctx.beginPath();
      ctx.arc(cx, cy, RIVAL_RADIUS, 0, Math.PI * 2);
      ctx.fillStyle = colour + 'cc';
      ctx.fill();
      ctx.strokeStyle = colour;
      ctx.lineWidth   = 1.5;
      ctx.stroke();
    });

    // ── Player car ────────────────────────────────────────────────────────
    if (playerX !== null) {
      const { cx, cy } = w2c(playerX, playerZ);

      // Glow ring
      const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, PLAYER_RADIUS + 6);
      grad.addColorStop(0, 'rgba(225,6,0,0.6)');
      grad.addColorStop(1, 'rgba(225,6,0,0)');
      ctx.beginPath();
      ctx.arc(cx, cy, PLAYER_RADIUS + 6, 0, Math.PI * 2);
      ctx.fillStyle = grad;
      ctx.fill();

      ctx.beginPath();
      ctx.arc(cx, cy, PLAYER_RADIUS, 0, Math.PI * 2);
      ctx.fillStyle = '#e10600';
      ctx.fill();

      ctx.beginPath();
      ctx.arc(cx, cy, PLAYER_RADIUS - 3, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
    }
  }

  // ── Export ────────────────────────────────────────────────────────────────
  window.CircuitMap = { init, updateTrace, updateCars, setTrackId, setParticipants };
})();

