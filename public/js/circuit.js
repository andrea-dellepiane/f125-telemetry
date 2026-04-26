'use strict';
/**
 * Circuit canvas – renders the accumulated track trace and all car positions.
 *
 * Exported to window.CircuitMap and called from app.js.
 */
(function () {

  const TRACK_COLOUR     = '#2a3a5a';
  const TRACE_COLOUR     = '#3b6ea5';
  const PLAYER_COLOUR    = '#e10600';
  const RIVAL_COLOUR     = '#888';
  const PLAYER_RADIUS    = 6;
  const RIVAL_RADIUS     = 3;
  const PADDING          = 24;     // canvas pixels of padding around the trace
  const TRACE_HISTORY    = 15000;  // max points kept

  let canvas = null;
  let ctx    = null;

  // Raw world-coordinate arrays
  let trace   = [];   // {x, z}[] – full track outline built up over time
  let allCars = [];   // {carIndex, x, z}[]
  let playerX = null;
  let playerZ = null;

  // Derived bounding box (world coords) – recomputed when trace changes
  let bb = { minX: -1, maxX: 1, minZ: -1, maxZ: 1 };
  let bbDirty = true;

  // ── Initialise ──────────────────────────────────────────────────────────
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
    canvas.width  = wrap.clientWidth  || 300;
    canvas.height = wrap.clientHeight || 400;
  }

  // ── Public API ──────────────────────────────────────────────────────────
  function updateTrace(points) {
    if (!Array.isArray(points)) return;
    trace    = points;
    bbDirty  = true;
  }

  function updateCars(player, rivals) {
    if (player) { playerX = player.x; playerZ = player.z; }
    if (rivals)   allCars = rivals;
  }

  // ── Bounding box ────────────────────────────────────────────────────────
  function recomputeBB() {
    if (!bbDirty || trace.length < 2) return;
    let minX = Infinity, maxX = -Infinity;
    let minZ = Infinity, maxZ = -Infinity;
    for (const p of trace) {
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.z < minZ) minZ = p.z;
      if (p.z > maxZ) maxZ = p.z;
    }
    const margin = 50;
    bb = { minX: minX - margin, maxX: maxX + margin,
           minZ: minZ - margin, maxZ: maxZ + margin };
    bbDirty = false;
  }

  // Convert world coords → canvas pixels (auto-scaled & centred)
  function worldToCanvas(wx, wz) {
    const scaleX = (canvas.width  - PADDING * 2) / (bb.maxX - bb.minX);
    const scaleZ = (canvas.height - PADDING * 2) / (bb.maxZ - bb.minZ);
    const scale  = Math.min(scaleX, scaleZ);

    // Centre the track on the canvas
    const cxOff = (canvas.width  - (bb.maxX - bb.minX) * scale) / 2;
    const czOff = (canvas.height - (bb.maxZ - bb.minZ) * scale) / 2;

    const cx = cxOff + (wx - bb.minX) * scale;
    const cz = czOff + (wz - bb.minZ) * scale;
    return { cx, cz };
  }

  // ── Draw ────────────────────────────────────────────────────────────────
  function drawLoop() {
    requestAnimationFrame(drawLoop);
    draw();
  }

  function draw() {
    const W = canvas.width;
    const H = canvas.height;

    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#0a0a14';
    ctx.fillRect(0, 0, W, H);

    if (trace.length < 2) {
      // Nothing accumulated yet – show placeholder text
      ctx.fillStyle = '#2a2a3e';
      ctx.font = '12px "Segoe UI", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('Waiting for telemetry data…', W / 2, H / 2);
      return;
    }

    recomputeBB();

    // ── Draw track outline (wide grey stroke behind) ──────────────────────
    ctx.beginPath();
    {
      const { cx, cz } = worldToCanvas(trace[0].x, trace[0].z);
      ctx.moveTo(cx, cz);
    }
    for (let i = 1; i < trace.length; i++) {
      const { cx, cz } = worldToCanvas(trace[i].x, trace[i].z);
      ctx.lineTo(cx, cz);
    }
    ctx.strokeStyle = TRACK_COLOUR;
    ctx.lineWidth   = 12;
    ctx.lineCap     = 'round';
    ctx.lineJoin    = 'round';
    ctx.stroke();

    // ── Draw racing line (thin coloured line on top) ───────────────────────
    ctx.beginPath();
    {
      const { cx, cz } = worldToCanvas(trace[0].x, trace[0].z);
      ctx.moveTo(cx, cz);
    }
    for (let i = 1; i < trace.length; i++) {
      const { cx, cz } = worldToCanvas(trace[i].x, trace[i].z);
      ctx.lineTo(cx, cz);
    }
    ctx.strokeStyle = TRACE_COLOUR;
    ctx.lineWidth   = 3;
    ctx.stroke();

    // ── Draw rival cars ───────────────────────────────────────────────────
    for (const car of allCars) {
      const { cx, cz } = worldToCanvas(car.x, car.z);
      ctx.beginPath();
      ctx.arc(cx, cz, RIVAL_RADIUS, 0, Math.PI * 2);
      ctx.fillStyle = RIVAL_COLOUR;
      ctx.fill();
    }

    // ── Draw player car ───────────────────────────────────────────────────
    if (playerX !== null) {
      const { cx, cz } = worldToCanvas(playerX, playerZ);

      // Glow ring
      ctx.beginPath();
      ctx.arc(cx, cz, PLAYER_RADIUS + 4, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(225,6,0,0.25)';
      ctx.fill();

      ctx.beginPath();
      ctx.arc(cx, cz, PLAYER_RADIUS, 0, Math.PI * 2);
      ctx.fillStyle = PLAYER_COLOUR;
      ctx.fill();

      ctx.beginPath();
      ctx.arc(cx, cz, PLAYER_RADIUS - 2, 0, Math.PI * 2);
      ctx.fillStyle = '#fff';
      ctx.fill();
    }
  }

  // ── Export ───────────────────────────────────────────────────────────────
  window.CircuitMap = { init, updateTrace, updateCars };
})();
