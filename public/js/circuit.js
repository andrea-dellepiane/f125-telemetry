'use strict';
/**
 * Circuit canvas – renders the F1 track map with:
 * - Predefined circuit layout (when track is known)
 * - Live telemetry trace overlay
 * - All car positions with team colours
 * - Start/finish line, sector markers
 */
(function () {

  const TRACK_WIDTH      = 14;  // px for track outline
  const TRACE_WIDTH      = 4;   // px for live racing line
  const PLAYER_RADIUS    = 7;
  const RIVAL_RADIUS     = 4;
  const PADDING          = 32;
  const TRACE_HISTORY    = 15000;

  // Team colour lookup (carIndex → CSS colour)
  const TEAM_COLOURS = {};
  const PARTICIPANTS = {};

  let canvas   = null;
  let ctx      = null;
  let trackId  = -1;

  // Predefined circuit points (from circuits-data.js)
  let predefPts = null;

  // Live trace (accumulated GPS points)
  let trace     = [];
  let allCars   = [];
  let playerX   = null;
  let playerZ   = null;

  let bb        = { minX: -600, maxX: 600, minZ: -350, maxZ: 350 };
  let bbDirty   = true;

  // ── Init ─────────────────────────────────────────────────────────────────
  function init(canvasEl) {
    canvas = canvasEl;
    ctx    = canvas.getContext('2d');
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
    if (!Array.isArray(points)) return;
    trace   = points;
    bbDirty = true;
  }

  function updateCars(player, rivals) {
    if (player) { playerX = player.x; playerZ = player.z; }
    if (rivals)   allCars = rivals;
  }

  function setTrackId(id) {
    if (id === trackId) return;
    trackId   = id;
    predefPts = null;
    trace     = [];  // reset trace when changing track
    bbDirty   = true;

    if (window.F1CircuitData) {
      predefPts = window.F1CircuitData[id] || window.F1CircuitData._fallback;
      bbDirty   = true;
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
    const marginX = (maxX - minX) * 0.08 + 30;
    const marginZ = (maxZ - minZ) * 0.08 + 30;
    bb = { minX: minX - marginX, maxX: maxX + marginX,
           minZ: minZ - marginZ, maxZ: maxZ + marginZ };
    bbDirty = false;
  }

  function recomputeBB() {
    if (!bbDirty) return;
    const activePts = predefPts || (trace.length >= 2 ? trace : null);
    if (activePts) computeBB(activePts);
    else bbDirty = false;
  }

  // World → canvas
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

  function drawPath(pts, lineWidth, strokeStyle, lineDash) {
    if (!pts || pts.length < 2) return;
    ctx.beginPath();
    ctx.setLineDash(lineDash || []);
    const { cx, cy } = w2c(pts[0].x, pts[0].z);
    ctx.moveTo(cx, cy);
    for (let i = 1; i < pts.length; i++) {
      const p = w2c(pts[i].x, pts[i].z);
      ctx.lineTo(p.cx, p.cy);
    }
    ctx.strokeStyle = strokeStyle;
    ctx.lineWidth   = lineWidth;
    ctx.lineCap     = 'round';
    ctx.lineJoin    = 'round';
    ctx.stroke();
    ctx.setLineDash([]);
  }

  function draw() {
    const W = canvas.width, H = canvas.height;
    ctx.clearRect(0, 0, W, H);

    // Background
    ctx.fillStyle = '#070710';
    ctx.fillRect(0, 0, W, H);

    recomputeBB();

    const hasPts = predefPts || trace.length >= 2;

    if (!hasPts) {
      ctx.fillStyle = '#2a2a4a';
      ctx.font = '13px "Segoe UI", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('In attesa dei dati telemetrici…', W / 2, H / 2);
      return;
    }

    // ── Track outline (predefined or live trace) ──────────────────────────
    const basePts = predefPts || trace;

    // Wide grey track surface
    drawPath(basePts, TRACK_WIDTH + 6, '#1e1e2e');
    // Track kerb/edges
    drawPath(basePts, TRACK_WIDTH + 2, '#2e3a5a');
    // Track surface
    drawPath(basePts, TRACK_WIDTH - 2, '#2a3050');
    // Centre line
    drawPath(basePts, 1.5, '#3a3a5a', [8, 8]);

    // ── Live trace overlay ────────────────────────────────────────────────
    if (trace.length >= 2) {
      // Colour trace by speed (not available here, so use gradient by position)
      drawPath(trace, TRACE_WIDTH, 'rgba(59,110,200,0.8)');
    }

    // ── Start/Finish line (at first point of predefined data) ─────────────
    if (predefPts && predefPts.length > 2) {
      const sp = w2c(predefPts[0].x, predefPts[0].z);
      const np = w2c(predefPts[2].x, predefPts[2].z);
      const angle = Math.atan2(np.cy - sp.cy, np.cx - sp.cx) + Math.PI / 2;
      ctx.save();
      ctx.translate(sp.cx, sp.cy);
      ctx.rotate(angle);
      ctx.fillStyle = '#ffffff';
      for (let i = 0; i < 6; i++) {
        ctx.fillStyle = i % 2 === 0 ? '#ffffff' : '#000000';
        ctx.fillRect(-6 + i * 2, -1, 2, 9);
      }
      ctx.restore();
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
      ctx.lineWidth   = 1;
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
