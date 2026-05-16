'use strict';
/**
 * Circuit canvas – builds the visible circuit from live telemetry.
 * Hidden circuit images are used only as validation masks to reject
 * impossible/off-track trace segments once enough data has been collected.
 */
(function () {

  const PLAYER_RADIUS = 3.2;
  const PLAYER_CORE_RADIUS = 1.4;
  const PLAYER_GLOW_RADIUS = 10;
  const RIVAL_RADIUS = 2.4;
  const TRACE_WIDTH = 4.2;
  const TRACE_GLOW_WIDTH = 10;
  const VIEWPORT_PADDING = 18;
  const TRACE_SAMPLE_STEP = 2.2;
  const ENABLE_TRACE_AUTO_FILTER = false;
  const MIN_POINT_STEP = 0.9;
  const MIN_TRACE_POINTS_FOR_MASK = 240;
  const MIN_TRACE_LENGTH_FOR_MASK = 900;
  const MIN_TRACE_SPAN_FOR_MASK = 180;
  const IMAGE_SCAN_MAX_DIM = 960;
  const IMAGE_BG_SAMPLE_SIZE = 20;
  const IMAGE_ALPHA_THRESHOLD = 16;
  const IMAGE_DIFF_THRESHOLD = 34;
  const IMAGE_LUMA_THRESHOLD = 26;
  const IMAGE_SCORE_NEIGHBOURHOOD = 2;
  const TRACK_POINT_SCORE_MIN = 34;
  const TRACK_SEGMENT_SCORE_MIN = 24;
  const TRACK_SEGMENT_HIT_RATIO_MIN = 0.5;
  const MAX_JUMP_THRESHOLD_MIN = 42;
  const MAX_JUMP_THRESHOLD_MAX = 170;
  const FALLBACK_RADIUS = 120;
  const DEFAULT_TRACK_BOX = { x: 0.06, y: 0.08, w: 0.88, h: 0.84 };
  const VIEW_TRANSFORMS = [
    (x, z) => ({ x, z }),
    (x, z) => ({ x: -x, z }),
    (x, z) => ({ x, z: -z }),
    (x, z) => ({ x: -x, z: -z }),
    (x, z) => ({ x: z, z: x }),
    (x, z) => ({ x: -z, z: x }),
    (x, z) => ({ x: z, z: -x }),
    (x, z) => ({ x: -z, z: -x }),
  ];

  // trackId → circuit image filename
  const TRACK_IMAGES = {
    0: 'Australia_Circuit.avif',
    2: 'China_Circuit.avif',
    3: 'Bahrain_Circuit.avif',
    4: 'Spain_Circuit.avif',
    5: 'Monaco_Circuit.avif',
    6: 'Canada_Circuit.avif',
    7: 'Great_Britain_Circuit.avif',
    9: 'Hungary_Circuit.avif',
    10: 'Belgium_Circuit.avif',
    11: 'Italy_Circuit.avif',
    12: 'Singapore_Circuit.avif',
    13: 'Japan_Circuit.avif',
    14: 'Abu_Dhabi_Circuit.avif',
    15: 'USA_Circuit.avif',
    17: 'Austria_Circuit.avif',
    18: 'Brazil_Circuit.avif',
    20: 'Baku_Circuit.avif',
    26: 'Netherlands_Circuit.avif',
    27: 'Emilia_Romagna_Circuit.avif',
    29: 'Saudi_Arabia_Circuit.avif',
    30: 'Miami_Circuit.avif',
    31: 'Las_Vegas_Circuit.avif',
    32: 'Qatar_Circuit.avif',
    33: 'Mexico_Circuit.avif',
  };

  const TEAM_COLOURS = {};

  let canvas = null;
  let ctx = null;
  let circuitImgEl = null;
  let trackId = -1;
  let playerCarIndex = 0;
  let fallbackLayout = [];

  let rawTrace = [];
  let traceSegments = [];
  let acceptedTracePoints = [];
  let traceDirty = true;
  let trackFilterReady = false;

  let allCars = [];
  let playerX = null;
  let playerZ = null;

  let bb = { minX: -FALLBACK_RADIUS, maxX: FALLBACK_RADIUS, minZ: -FALLBACK_RADIUS, maxZ: FALLBACK_RADIUS };
  let bbReady = false;
  let imageAnalysis = null;
  let viewTransformId = 0;

  function init(canvasEl) {
    canvas = canvasEl;
    ctx = canvas.getContext('2d');
    circuitImgEl = document.getElementById('circuit-img');
    if (circuitImgEl) {
      circuitImgEl.addEventListener('load', onImageLoad);
      circuitImgEl.addEventListener('error', onImageError);
    }
    window.addEventListener('resize', onResize);
    onResize();
    requestAnimationFrame(drawLoop);
  }

  function onResize() {
    if (!canvas) return;
    const wrap = canvas.parentElement;
    canvas.width = wrap.clientWidth || 400;
    canvas.height = wrap.clientHeight || 480;
  }

  function updateTrace(payload) {
    if (Array.isArray(payload)) {
      rawTrace = simplifyTrace(payload);
      traceDirty = true;
      return;
    }

    if (!payload || typeof payload !== 'object') return;

    if (payload.mode === 'append') {
      appendTracePoints(payload.points);
      traceDirty = true;
      return;
    }

    if (payload.mode === 'replace') {
      rawTrace = simplifyTrace(payload.points || []);
      traceDirty = true;
      return;
    }
  }

  function appendTracePoints(points) {
    if (!Array.isArray(points) || !points.length) return;
    let lastKept = rawTrace[rawTrace.length - 1] || null;

    points.forEach((point) => {
      if (!point || !isFiniteNumber(point.x) || !isFiniteNumber(point.z)) return;
      const clean = { x: point.x, z: point.z };
      if (!lastKept || distance(lastKept, clean) >= TRACE_SAMPLE_STEP) {
        rawTrace.push(clean);
        lastKept = clean;
      }
    });

    traceDirty = true;
  }

  function updateCars(player, rivals) {
    if (player) {
      playerX = isFiniteNumber(player.x) ? player.x : playerX;
      playerZ = isFiniteNumber(player.z) ? player.z : playerZ;
    }
    if (Array.isArray(rivals)) allCars = rivals;
  }

  function setTrackId(id) {
    if (id === trackId) return;
    trackId = id;
    fallbackLayout = getFallbackLayout(id);
    rawTrace = [];
    traceSegments = [];
    acceptedTracePoints = [];
    traceDirty = true;
    trackFilterReady = false;
    imageAnalysis = null;
    viewTransformId = 0;
    bb = { minX: -FALLBACK_RADIUS, maxX: FALLBACK_RADIUS, minZ: -FALLBACK_RADIUS, maxZ: FALLBACK_RADIUS };
    bbReady = false;

    if (circuitImgEl) {
      const imgName = TRACK_IMAGES[id];
      circuitImgEl.removeAttribute('src');
      if (imgName) circuitImgEl.src = `/circuits/${imgName}`;
    }
  }

  function setParticipants(participants) {
    if (!Array.isArray(participants)) return;
    participants.forEach((participant) => {
      TEAM_COLOURS[participant.carIndex] = participant.teamColor || '#888';
    });
  }

  function setPlayerCarIndex(index) {
    if (!Number.isInteger(index) || index < 0) return;
    playerCarIndex = index;
  }

  function onImageLoad() {
    imageAnalysis = analyzeTrackImage(circuitImgEl);
    chooseViewTransform(getTransformSourcePoints());
    traceDirty = true;
  }

  function onImageError() {
    imageAnalysis = null;
    viewTransformId = 0;
    traceDirty = true;
  }

  function getFallbackLayout(id) {
    const layouts = window.F1CircuitData || {};
    if (Array.isArray(layouts[id]) && layouts[id].length > 1) return layouts[id];
    if (Array.isArray(layouts._fallback)) return layouts._fallback;
    return [];
  }

  function simplifyTrace(points) {
    const simplified = [];
    let lastKept = null;

    points.forEach((point) => {
      if (!point || !isFiniteNumber(point.x) || !isFiniteNumber(point.z)) return;
      const clean = { x: point.x, z: point.z };
      if (!lastKept || distance(lastKept, clean) >= TRACE_SAMPLE_STEP) {
        simplified.push(clean);
        lastKept = clean;
      }
    });

    return simplified;
  }

  function rebuildTraceGeometry() {
    const source = rawTrace;
    traceSegments = [];
    acceptedTracePoints = [];
    trackFilterReady = false;

    if (!source.length) {
      resetBoundsAroundPlayer();
      traceDirty = false;
      return;
    }

    if (source.length === 1) {
      acceptedTracePoints = source.slice();
      resetBoundsAroundPoint(source[0]);
      traceSegments = [];
      traceDirty = false;
      return;
    }

    const coarseSegments = buildSegments(source);
    const coarsePoints = flattenSegments(coarseSegments);
    const coarseBounds = computeBounds(coarsePoints) || computeBounds(source);

    if (!coarseBounds) {
      resetBoundsAroundPlayer();
      traceDirty = false;
      return;
    }

    bb = coarseBounds;
    bbReady = coarsePoints.length >= 2;
    chooseViewTransform(coarsePoints.length >= 2 ? coarsePoints : source);

    const canUseMask = ENABLE_TRACE_AUTO_FILTER && isMaskFilteringReady(coarsePoints, coarseBounds);
    if (!canUseMask) {
      traceSegments = coarseSegments;
      acceptedTracePoints = coarsePoints;
      traceDirty = false;
      return;
    }

    trackFilterReady = true;

    let filteredSegments = buildSegments(source, {
      bounds: coarseBounds,
      validatePoint: (point, bounds) => isWorldPointOnTrack(point, bounds),
      validateSegment: (from, to, bounds) => isWorldSegmentOnTrack(from, to, bounds),
    });
    let filteredPoints = flattenSegments(filteredSegments);
    let filteredBounds = computeBounds(filteredPoints) || coarseBounds;

    bb = filteredBounds;
    bbReady = filteredPoints.length >= 2;
    chooseViewTransform(filteredPoints.length >= 2 ? filteredPoints : coarsePoints);

    filteredSegments = buildSegments(source, {
      bounds: filteredBounds,
      validatePoint: (point, bounds) => isWorldPointOnTrack(point, bounds),
      validateSegment: (from, to, bounds) => isWorldSegmentOnTrack(from, to, bounds),
    });
    filteredPoints = flattenSegments(filteredSegments);
    filteredBounds = computeBounds(filteredPoints) || coarseBounds;

    bb = filteredBounds;
    bbReady = filteredPoints.length >= 2;
    traceSegments = filteredSegments.length ? filteredSegments : coarseSegments;
    acceptedTracePoints = filteredPoints.length ? filteredPoints : coarsePoints;
    traceDirty = false;
  }

  function buildSegments(points, options = {}) {
    if (!Array.isArray(points) || points.length < 2) return [];

    const bounds = options.bounds || computeBounds(points) || bb;
    const jumpThreshold = getJumpThreshold(points);
    const segments = [];
    let current = [];

    function flush() {
      if (current.length >= 2) segments.push(current);
      current = [];
    }

    points.forEach((point) => {
      if (!point || !isFiniteNumber(point.x) || !isFiniteNumber(point.z)) {
        flush();
        return;
      }

      if (!current.length) {
        if (!options.validatePoint || options.validatePoint(point, bounds)) {
          current = [point];
        }
        return;
      }

      const prev = current[current.length - 1];
      const step = distance(prev, point);
      if (step < MIN_POINT_STEP) return;

      const pointValid = !options.validatePoint || options.validatePoint(point, bounds);
      const segmentValid = pointValid &&
        (!options.validateSegment || options.validateSegment(prev, point, bounds));

      if (step > jumpThreshold || !segmentValid) {
        flush();
        if (pointValid) current = [point];
        return;
      }

      current.push(point);
    });

    flush();
    return segments;
  }

  function flattenSegments(segments) {
    return segments.reduce((all, segment) => all.concat(segment), []);
  }

  function getJumpThreshold(points) {
    const samples = [];
    const stride = Math.max(1, Math.floor(points.length / 250));

    for (let i = stride; i < points.length; i += stride) {
      const step = distance(points[i - stride], points[i]);
      if (step > MIN_POINT_STEP && step < 70) samples.push(step);
    }

    if (!samples.length) return 80;
    samples.sort((a, b) => a - b);
    const median = samples[Math.floor(samples.length / 2)];
    return clamp(median * 8, MAX_JUMP_THRESHOLD_MIN, MAX_JUMP_THRESHOLD_MAX);
  }

  function isMaskFilteringReady(points, bounds) {
    if (!imageAnalysis || !Array.isArray(points) || points.length < MIN_TRACE_POINTS_FOR_MASK) {
      return false;
    }
    if (!bounds) return false;
    const spanX = bounds.maxX - bounds.minX;
    const spanZ = bounds.maxZ - bounds.minZ;
    return (
      spanX >= MIN_TRACE_SPAN_FOR_MASK &&
      spanZ >= MIN_TRACE_SPAN_FOR_MASK &&
      getPolylineLength(points) >= MIN_TRACE_LENGTH_FOR_MASK
    );
  }

  function getTransformSourcePoints() {
    if (acceptedTracePoints.length >= 2) return acceptedTracePoints;
    if (rawTrace.length >= 2) return rawTrace;
    return fallbackLayout;
  }

  function chooseViewTransform(sourcePoints) {
    if (!imageAnalysis || !Array.isArray(sourcePoints) || sourcePoints.length < 2) {
      viewTransformId = 0;
      return;
    }

    const sourceBounds = computeBounds(sourcePoints);
    if (!sourceBounds) {
      viewTransformId = 0;
      return;
    }

    const sampleRect = getImageTrackRect();
    const stride = Math.max(1, Math.floor(sourcePoints.length / 180));
    let bestScore = -Infinity;
    let bestId = 0;

    for (let transformId = 0; transformId < VIEW_TRANSFORMS.length; transformId++) {
      const transformedBounds = getTransformedBounds(sourceBounds, transformId);
      let score = 0;

      for (let i = 0; i < sourcePoints.length; i += stride) {
        const mapped = mapPointToRect(sourcePoints[i], transformedBounds, transformId, sampleRect);
        score += sampleTrackPixelScore(mapped.x, mapped.y);
      }

      if (score > bestScore) {
        bestScore = score;
        bestId = transformId;
      }
    }

    viewTransformId = bestId;
  }

  function computeBounds(points) {
    if (!Array.isArray(points) || points.length < 1) return null;

    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;

    points.forEach((point) => {
      if (!point || !isFiniteNumber(point.x) || !isFiniteNumber(point.z)) return;
      if (point.x < minX) minX = point.x;
      if (point.x > maxX) maxX = point.x;
      if (point.z < minZ) minZ = point.z;
      if (point.z > maxZ) maxZ = point.z;
    });

    if (!isFiniteNumber(minX) || !isFiniteNumber(maxX) || !isFiniteNumber(minZ) || !isFiniteNumber(maxZ)) {
      return null;
    }

    const spanX = Math.max(24, maxX - minX);
    const spanZ = Math.max(24, maxZ - minZ);
    const marginX = spanX * 0.08 + 18;
    const marginZ = spanZ * 0.08 + 18;
    return {
      minX: minX - marginX,
      maxX: maxX + marginX,
      minZ: minZ - marginZ,
      maxZ: maxZ + marginZ,
    };
  }

  function resetBoundsAroundPoint(point) {
    const cx = point && isFiniteNumber(point.x) ? point.x : 0;
    const cz = point && isFiniteNumber(point.z) ? point.z : 0;
    bb = {
      minX: cx - FALLBACK_RADIUS,
      maxX: cx + FALLBACK_RADIUS,
      minZ: cz - FALLBACK_RADIUS,
      maxZ: cz + FALLBACK_RADIUS,
    };
    bbReady = true;
  }

  function resetBoundsAroundPlayer() {
    if (isFiniteNumber(playerX) && isFiniteNumber(playerZ)) {
      resetBoundsAroundPoint({ x: playerX, z: playerZ });
      return;
    }
    bb = {
      minX: -FALLBACK_RADIUS,
      maxX: FALLBACK_RADIUS,
      minZ: -FALLBACK_RADIUS,
      maxZ: FALLBACK_RADIUS,
    };
    bbReady = false;
  }

  function getCanvasViewport() {
    const pad = VIEWPORT_PADDING;
    return {
      x: pad,
      y: pad,
      w: Math.max(40, canvas.width - pad * 2),
      h: Math.max(40, canvas.height - pad * 2),
    };
  }

  function getImageTrackRect() {
    if (!imageAnalysis) return { x: 0, y: 0, w: 1, h: 1 };
    return {
      x: imageAnalysis.trackBox.x * imageAnalysis.width,
      y: imageAnalysis.trackBox.y * imageAnalysis.height,
      w: imageAnalysis.trackBox.w * imageAnalysis.width,
      h: imageAnalysis.trackBox.h * imageAnalysis.height,
    };
  }

  function applyViewTransform(x, z, transformId) {
    const transform = VIEW_TRANSFORMS[transformId] || VIEW_TRANSFORMS[0];
    return transform(x, z);
  }

  function getTransformedBounds(bounds, transformId) {
    const centreX = (bounds.minX + bounds.maxX) / 2;
    const centreZ = (bounds.minZ + bounds.maxZ) / 2;
    const corners = [
      { x: bounds.minX, z: bounds.minZ },
      { x: bounds.maxX, z: bounds.minZ },
      { x: bounds.maxX, z: bounds.maxZ },
      { x: bounds.minX, z: bounds.maxZ },
    ];

    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;

    corners.forEach((corner) => {
      const transformed = applyViewTransform(corner.x - centreX, corner.z - centreZ, transformId);
      if (transformed.x < minX) minX = transformed.x;
      if (transformed.x > maxX) maxX = transformed.x;
      if (transformed.z < minZ) minZ = transformed.z;
      if (transformed.z > maxZ) maxZ = transformed.z;
    });

    return { minX, maxX, minZ, maxZ, centreX, centreZ };
  }

  function mapPointToRect(point, transformedBounds, transformId, rect) {
    const transformed = applyViewTransform(
      point.x - transformedBounds.centreX,
      point.z - transformedBounds.centreZ,
      transformId
    );
    const width = Math.max(1, transformedBounds.maxX - transformedBounds.minX);
    const height = Math.max(1, transformedBounds.maxZ - transformedBounds.minZ);
    const scale = Math.min(rect.w / width, rect.h / height);
    const offsetX = rect.x + (rect.w - width * scale) / 2;
    const offsetY = rect.y + (rect.h - height * scale) / 2;

    return {
      x: offsetX + (transformed.x - transformedBounds.minX) * scale,
      y: offsetY + (transformed.z - transformedBounds.minZ) * scale,
    };
  }

  function worldToCanvas(wx, wz) {
    const viewport = getCanvasViewport();
    const transformedBounds = getTransformedBounds(bb, viewTransformId);
    const mapped = mapPointToRect({ x: wx, z: wz }, transformedBounds, viewTransformId, viewport);
    return { cx: mapped.x, cy: mapped.y };
  }

  function worldToImage(point, bounds) {
    if (!imageAnalysis) return null;
    const transformedBounds = getTransformedBounds(bounds || bb, viewTransformId);
    return mapPointToRect(point, transformedBounds, viewTransformId, getImageTrackRect());
  }

  function isWorldPointOnTrack(point, bounds) {
    const mapped = worldToImage(point, bounds);
    if (!mapped) return true;
    return sampleTrackPixelScore(mapped.x, mapped.y) >= TRACK_POINT_SCORE_MIN;
  }

  function isWorldSegmentOnTrack(from, to, bounds) {
    if (!imageAnalysis) return true;
    const start = worldToImage(from, bounds);
    const end = worldToImage(to, bounds);
    if (!start || !end) return true;

    const stepCount = clamp(Math.ceil(distance(from, to) / 7), 3, 16);
    let hits = 0;
    let bestScore = 0;
    let missRun = 0;
    let maxMissRun = 0;
    let totalScore = 0;

    for (let i = 0; i <= stepCount; i++) {
      const t = i / stepCount;
      const x = start.x + (end.x - start.x) * t;
      const y = start.y + (end.y - start.y) * t;
      const score = sampleTrackPixelScore(x, y);
      totalScore += score;
      if (score >= TRACK_SEGMENT_SCORE_MIN) {
        hits++;
        missRun = 0;
      } else {
        missRun++;
        if (missRun > maxMissRun) maxMissRun = missRun;
      }
      if (score > bestScore) bestScore = score;
    }

    const samples = stepCount + 1;
    const hitRatio = hits / samples;
    const avgScore = totalScore / samples;

    return (
      hitRatio >= TRACK_SEGMENT_HIT_RATIO_MIN &&
      avgScore >= TRACK_SEGMENT_SCORE_MIN &&
      maxMissRun <= Math.ceil(samples * 0.45)
    ) || (
      hitRatio >= 0.42 &&
      avgScore >= TRACK_SEGMENT_SCORE_MIN + 8 &&
      bestScore >= TRACK_POINT_SCORE_MIN + 10 &&
      maxMissRun <= 2
    );
  }

  function analyzeTrackImage(imgEl) {
    if (!imgEl || !imgEl.naturalWidth || !imgEl.naturalHeight) return null;

    try {
      const scale = Math.min(1, IMAGE_SCAN_MAX_DIM / Math.max(imgEl.naturalWidth, imgEl.naturalHeight));
      const sampleW = Math.max(120, Math.round(imgEl.naturalWidth * scale));
      const sampleH = Math.max(120, Math.round(imgEl.naturalHeight * scale));
      const offscreen = document.createElement('canvas');
      offscreen.width = sampleW;
      offscreen.height = sampleH;
      const offCtx = offscreen.getContext('2d', { willReadFrequently: true });
      offCtx.drawImage(imgEl, 0, 0, sampleW, sampleH);

      const imageData = offCtx.getImageData(0, 0, sampleW, sampleH).data;
      const bg = sampleBackground(imageData, sampleW, sampleH);

      let minX = sampleW;
      let minY = sampleH;
      let maxX = -1;
      let maxY = -1;

      for (let y = 0; y < sampleH; y++) {
        for (let x = 0; x < sampleW; x++) {
          const i = (y * sampleW + x) * 4;
          const a = imageData[i + 3];
          if (a < IMAGE_ALPHA_THRESHOLD) continue;
          const r = imageData[i];
          const g = imageData[i + 1];
          const b = imageData[i + 2];
          const diff = colourDiff(r, g, b, bg.r, bg.g, bg.b);
          const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
          if (diff < IMAGE_DIFF_THRESHOLD && luma < IMAGE_LUMA_THRESHOLD) continue;
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }

      if (maxX <= minX || maxY <= minY) {
        return {
          width: sampleW,
          height: sampleH,
          imageData,
          bg,
          trackBox: DEFAULT_TRACK_BOX,
        };
      }

      const margin = Math.max(6, Math.round(Math.min(sampleW, sampleH) * 0.015));
      minX = Math.max(0, minX - margin);
      minY = Math.max(0, minY - margin);
      maxX = Math.min(sampleW - 1, maxX + margin);
      maxY = Math.min(sampleH - 1, maxY + margin);

      return {
        width: sampleW,
        height: sampleH,
        imageData,
        bg,
        trackBox: {
          x: minX / sampleW,
          y: minY / sampleH,
          w: Math.max(0.2, (maxX - minX) / sampleW),
          h: Math.max(0.2, (maxY - minY) / sampleH),
        },
      };
    } catch (_) {
      return null;
    }
  }

  function sampleTrackPixelScore(sampleX, sampleY) {
    if (!imageAnalysis) return 0;
    let best = 0;

    for (let dy = -IMAGE_SCORE_NEIGHBOURHOOD; dy <= IMAGE_SCORE_NEIGHBOURHOOD; dy++) {
      for (let dx = -IMAGE_SCORE_NEIGHBOURHOOD; dx <= IMAGE_SCORE_NEIGHBOURHOOD; dx++) {
        const x = Math.round(sampleX + dx);
        const y = Math.round(sampleY + dy);
        if (x < 0 || x >= imageAnalysis.width || y < 0 || y >= imageAnalysis.height) continue;

        const i = (y * imageAnalysis.width + x) * 4;
        const a = imageAnalysis.imageData[i + 3];
        if (a < IMAGE_ALPHA_THRESHOLD) continue;

        const r = imageAnalysis.imageData[i];
        const g = imageAnalysis.imageData[i + 1];
        const b = imageAnalysis.imageData[i + 2];
        const diff = colourDiff(r, g, b, imageAnalysis.bg.r, imageAnalysis.bg.g, imageAnalysis.bg.b);
        const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;

        let score = diff;
        if (luma < 10) score *= 0.15;
        if (g > r + 55 && g > b + 55 && luma > 70) score *= 0.35;
        if (r > 160 && b > 160 && g < 120) score *= 0.35;

        if (score > best) best = score;
      }
    }

    return best;
  }

  function sampleBackground(imageData, width, height) {
    const sample = Math.max(4, Math.min(IMAGE_BG_SAMPLE_SIZE, Math.floor(Math.min(width, height) / 8)));
    const areas = [
      { x0: 0, y0: 0 },
      { x0: width - sample, y0: 0 },
      { x0: 0, y0: height - sample },
      { x0: width - sample, y0: height - sample },
    ];

    let totalR = 0;
    let totalG = 0;
    let totalB = 0;
    let count = 0;

    areas.forEach((area) => {
      for (let y = area.y0; y < area.y0 + sample; y++) {
        for (let x = area.x0; x < area.x0 + sample; x++) {
          const i = (y * width + x) * 4;
          totalR += imageData[i];
          totalG += imageData[i + 1];
          totalB += imageData[i + 2];
          count++;
        }
      }
    });

    return {
      r: totalR / count,
      g: totalG / count,
      b: totalB / count,
    };
  }

  function colourDiff(r1, g1, b1, r2, g2, b2) {
    return Math.abs(r1 - r2) + Math.abs(g1 - g2) + Math.abs(b1 - b2);
  }

  function drawLoop() {
    requestAnimationFrame(drawLoop);
    draw();
  }

  function drawTraceSegments() {
    if (!traceSegments.length) return;

    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    traceSegments.forEach((segment) => {
      if (segment.length < 2) return;

      ctx.beginPath();
      segment.forEach((point, index) => {
        const { cx, cy } = worldToCanvas(point.x, point.z);
        if (index === 0) ctx.moveTo(cx, cy);
        else ctx.lineTo(cx, cy);
      });
      ctx.strokeStyle = 'rgba(59, 158, 222, 0.18)';
      ctx.lineWidth = TRACE_GLOW_WIDTH;
      ctx.stroke();

      ctx.beginPath();
      segment.forEach((point, index) => {
        const { cx, cy } = worldToCanvas(point.x, point.z);
        if (index === 0) ctx.moveTo(cx, cy);
        else ctx.lineTo(cx, cy);
      });
      ctx.strokeStyle = 'rgba(114, 212, 255, 0.95)';
      ctx.lineWidth = TRACE_WIDTH;
      ctx.stroke();
    });
  }

  function drawStatusLabel() {
    ctx.font = '11px "Segoe UI", sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillStyle = 'rgba(234, 234, 246, 0.84)';

    if (!acceptedTracePoints.length) {
      ctx.fillText('Tracciamento circuito in avvio…', 16, 14);
      return;
    }

    const status = trackFilterReady ? 'Filtro pista attivo' : 'Tracciato live completo';
    ctx.fillText(status, 16, 14);
  }

  function drawCars() {
    allCars.forEach((car) => {
      if (!car || car.carIndex === playerCarIndex || !isFiniteNumber(car.x) || !isFiniteNumber(car.z)) return;
      const { cx, cy } = worldToCanvas(car.x, car.z);
      const colour = TEAM_COLOURS[car.carIndex] || '#666';
      ctx.beginPath();
      ctx.arc(cx, cy, RIVAL_RADIUS, 0, Math.PI * 2);
      ctx.fillStyle = `${colour}cc`;
      ctx.fill();
      ctx.strokeStyle = colour;
      ctx.lineWidth = 1.3;
      ctx.stroke();
    });

    if (!isFiniteNumber(playerX) || !isFiniteNumber(playerZ)) return;
    const { cx, cy } = worldToCanvas(playerX, playerZ);

    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, PLAYER_GLOW_RADIUS);
    grad.addColorStop(0, 'rgba(225, 6, 0, 0.58)');
    grad.addColorStop(1, 'rgba(225, 6, 0, 0)');
    ctx.beginPath();
    ctx.arc(cx, cy, PLAYER_GLOW_RADIUS, 0, Math.PI * 2);
    ctx.fillStyle = grad;
    ctx.fill();

    ctx.beginPath();
    ctx.arc(cx, cy, PLAYER_RADIUS, 0, Math.PI * 2);
    ctx.fillStyle = '#e10600';
    ctx.fill();

    ctx.beginPath();
    ctx.arc(cx, cy, PLAYER_CORE_RADIUS, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
  }

  function draw() {
    if (!canvas || !ctx) return;
    if (traceDirty) rebuildTraceGeometry();

    const W = canvas.width;
    const H = canvas.height;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#070710';
    ctx.fillRect(0, 0, W, H);

    const gradient = ctx.createLinearGradient(0, 0, 0, H);
    gradient.addColorStop(0, 'rgba(255,255,255,0.035)');
    gradient.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, W, H);

    drawTraceSegments();
    drawCars();
    drawStatusLabel();
  }

  function getPolylineLength(points) {
    let total = 0;
    for (let i = 1; i < points.length; i++) {
      total += distance(points[i - 1], points[i]);
    }
    return total;
  }

  function distance(a, b) {
    const dx = (b.x || 0) - (a.x || 0);
    const dz = (b.z || 0) - (a.z || 0);
    return Math.sqrt(dx * dx + dz * dz);
  }

  function isFiniteNumber(value) {
    return Number.isFinite(value);
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  window.CircuitMap = {
    init,
    updateTrace,
    updateCars,
    setTrackId,
    setParticipants,
    setPlayerCarIndex,
  };
})();
