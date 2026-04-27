'use strict';
/**
 * Lap Recorder – captures telemetry samples during a lap and sends them
 * to the server's /api/analyze-lap endpoint for rule-based AI analysis.
 */
(function () {

  let isRecording   = false;
  let samples       = [];
  let lapStartTime  = 0;
  let lastLapNum    = -1;
  let recordingLapNum = -1;
  let lastSampleTime  = 0;

  const SAMPLE_INTERVAL_MS = 100; // capture every 100 ms

  // ── Current telemetry (updated externally) ───────────────────────────────
  let currentTelemetry = {};
  let currentLapData   = {};

  function setTelemetry(t) { currentTelemetry = t || {}; }
  function setLapData(d)   { currentLapData   = d || {}; }

  // ── Recording control ─────────────────────────────────────────────────────
  function startRecording() {
    if (isRecording) return;
    isRecording     = true;
    samples         = [];
    lapStartTime    = Date.now();
    recordingLapNum = currentLapData.currentLapNum || 1;
    lastSampleTime  = 0;
    updateUI();
    showStatus('🔴 Registrazione in corso…', 'recording');
  }

  function stopRecording() {
    if (!isRecording) return;
    isRecording = false;
    updateUI();
    if (samples.length > 5) {
      showStatus(`✅ Giro registrato (${samples.length} campioni). Analisi in corso…`, 'analyzing');
      analyzeLap();
    } else {
      showStatus('⚠️ Dati insufficienti. Riprova dopo almeno mezzo giro.', 'error');
    }
  }

  // Auto-stop when lap number changes
  function onLapChange(newLapNum) {
    if (isRecording && newLapNum !== recordingLapNum) {
      stopRecording();
    }
    lastLapNum = newLapNum;
  }

  // ── Sample capture ────────────────────────────────────────────────────────
  function captureSample() {
    if (!isRecording) return;
    const now = Date.now();
    if (now - lastSampleTime < SAMPLE_INTERVAL_MS) return;
    lastSampleTime = now;

    const t = currentTelemetry;
    const l = currentLapData;

    samples.push({
      timestamp:   now,
      lapDistance: l.lapDistance || 0,
      speed:       t.speed       || 0,
      throttle:    t.throttle    || 0,
      brake:       t.brake       || 0,
      gear:        t.gear        || 0,
      steer:       t.steer       || 0,
      engineRPM:   t.engineRPM   || 0,
      drs:         t.drs         || 0,
    });

    // Update progress bar
    const lapMs = Date.now() - lapStartTime;
    updateProgress(lapMs);
  }

  // ── AI Analysis ───────────────────────────────────────────────────────────
  async function analyzeLap() {
    const lapTimeMs = Date.now() - lapStartTime;
    try {
      const res = await fetch('/api/analyze-lap', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ samples, lapTimeMs }),
      });
      const data = await res.json();
      showAnalysisResults(data);
    } catch (e) {
      showStatus('❌ Errore nella comunicazione con il server.', 'error');
    }
  }

  // ── Speed trace visualisation ─────────────────────────────────────────────
  function drawSpeedTrace(canvas, sampleArr) {
    if (!canvas || !sampleArr || sampleArr.length < 2) return;
    const ctx  = canvas.getContext('2d');
    const W    = canvas.width  = canvas.offsetWidth  || 400;
    const H    = canvas.height = canvas.offsetHeight || 80;
    ctx.clearRect(0, 0, W, H);

    const maxDist  = Math.max(...sampleArr.map(s => s.lapDistance));
    const maxSpeed = Math.max(...sampleArr.map(s => s.speed), 1);

    // Background
    ctx.fillStyle = '#0a0a14';
    ctx.fillRect(0, 0, W, H);

    // Speed trace (gradient by speed)
    ctx.beginPath();
    ctx.moveTo(0, H);
    sampleArr.forEach((s, i) => {
      const px = (s.lapDistance / maxDist) * W;
      const py = H - (s.speed / maxSpeed) * (H - 8);
      i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
    });
    ctx.lineTo(W, H);
    ctx.closePath();
    const grad = ctx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, 'rgba(225,6,0,0.8)');
    grad.addColorStop(1, 'rgba(225,6,0,0.1)');
    ctx.fillStyle = grad;
    ctx.fill();

    // Brake trace
    ctx.beginPath();
    sampleArr.forEach((s, i) => {
      const px = (s.lapDistance / maxDist) * W;
      const py = H - (s.brake / 1) * (H - 8);
      i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
    });
    ctx.strokeStyle = 'rgba(255,100,0,0.7)';
    ctx.lineWidth   = 1.5;
    ctx.stroke();

    // Labels
    ctx.fillStyle   = '#7a7a9a';
    ctx.font        = '9px Segoe UI';
    ctx.textAlign   = 'left';
    ctx.fillText(`0 m`, 2, H - 2);
    ctx.textAlign   = 'right';
    ctx.fillText(`${Math.round(maxDist)} m`, W - 2, H - 2);
    ctx.textAlign   = 'right';
    ctx.fillText(`${Math.round(maxSpeed)} km/h`, W - 2, 10);
  }

  // ── UI helpers ─────────────────────────────────────────────────────────────
  function updateUI() {
    const btn = document.getElementById('lap-rec-btn');
    const ind = document.getElementById('lap-rec-indicator');
    if (!btn) return;
    if (isRecording) {
      btn.textContent = '⏹ Ferma Registrazione';
      btn.classList.add('recording');
      if (ind) ind.classList.add('active');
    } else {
      btn.textContent = '⏺ Registra Giro';
      btn.classList.remove('recording');
      if (ind) ind.classList.remove('active');
    }
  }

  function updateProgress(lapMs) {
    const mins = Math.floor(lapMs / 60000);
    const secs = ((lapMs % 60000) / 1000).toFixed(1);
    const el   = document.getElementById('lap-rec-time');
    if (el) el.textContent = `${mins}:${String(secs).padStart(4, '0')} – ${samples.length} campioni`;
  }

  function showStatus(msg, cls) {
    const el = document.getElementById('lap-rec-status');
    if (!el) return;
    el.textContent  = msg;
    el.className    = 'lap-rec-status ' + (cls || '');
    el.style.display = 'block';
  }

  function showAnalysisResults(data) {
    const panel   = document.getElementById('ai-analysis-panel');
    const list    = document.getElementById('ai-hints-list');
    const canvas  = document.getElementById('speed-trace-canvas');
    if (!panel || !list) return;

    list.innerHTML = '';
    (data.hints || []).forEach(hint => {
      const li   = document.createElement('li');
      li.textContent = hint;
      list.appendChild(li);
    });

    panel.style.display = 'block';
    showStatus(`🤖 Analisi completata – ${(data.hints || []).length} suggerimenti`, 'done');

    // Draw speed trace
    if (canvas && samples.length > 2) {
      setTimeout(() => drawSpeedTrace(canvas, samples), 100);
    }
  }

  // ── Button wiring (called after DOM ready) ─────────────────────────────────
  function init() {
    const btn = document.getElementById('lap-rec-btn');
    if (btn) {
      btn.addEventListener('click', () => {
        if (isRecording) stopRecording();
        else startRecording();
      });
    }

    const closeBtn = document.getElementById('ai-panel-close');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        const panel = document.getElementById('ai-analysis-panel');
        if (panel) panel.style.display = 'none';
      });
    }
  }

  // Export
  window.LapRecorder = {
    init,
    captureSample,
    setTelemetry,
    setLapData,
    onLapChange,
  };
})();
