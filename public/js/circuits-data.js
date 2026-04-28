'use strict';
/**
 * Predefined F1 circuit coordinate data.
 * Each circuit is an array of {x, z} world-coordinate waypoints (in metres).
 * Coordinates are approximate but distinctive and recognisable.
 * The circuit renderer draws smooth polylines through these points.
 */
(function () {

  // Helper: build a path from a direction+distance description
  // segments: [{angle°, dist (m)}]
  function buildFromSegments(segments, closed = true) {
    const pts = [{ x: 0, z: 0 }];
    let angle = 0; // radians, 0=north(+z), clockwise positive
    for (const seg of segments) {
      angle += (seg.turn || 0) * Math.PI / 180;
      const steps = Math.max(2, Math.round(seg.dist / 20));
      const dx = Math.sin(angle) * seg.dist / steps;
      const dz = Math.cos(angle) * seg.dist / steps;
      for (let i = 0; i < steps; i++) {
        const last = pts[pts.length - 1];
        pts.push({ x: last.x + dx, z: last.z + dz });
      }
    }
    if (closed) pts.push({ ...pts[0] });
    return pts;
  }

  // Helper: scale coords so they fit roughly in [-1000,1000] range
  function centre(pts) {
    const xs = pts.map(p => p.x), zs = pts.map(p => p.z);
    const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
    const cz = (Math.min(...zs) + Math.max(...zs)) / 2;
    return pts.map(p => ({ x: p.x - cx, z: p.z - cz }));
  }

  // ── Melbourne – Albert Park (trackId 0) ────────────────────────────────────
  function melbourne() {
    return centre(buildFromSegments([
      { dist: 300 },         // Start straight
      { turn:  90, dist: 60 },  // T1 right
      { turn: -30, dist: 120 },
      { turn:  70, dist: 80 },  // T3
      { dist: 250 },         // Back straight
      { turn:  90, dist: 100 }, // T6
      { turn: -80, dist: 60 },
      { turn:  90, dist: 120 },
      { dist: 180 },
      { turn: -90, dist: 80 },
      { turn:  60, dist: 100 }, // Lakeside
      { turn: -20, dist: 80 },
      { turn:  20, dist: 100 },
      { turn:  90, dist: 60 },
      { dist: 120 },
      { turn:  90, dist: 80 },  // T13
      { turn: -60, dist: 60 },
      { turn:  60, dist: 80 },
      { turn:  90, dist: 100 }, // Final sector
      { dist: 200 },
      { turn: -90, dist: 60 },
      { turn:  80, dist: 100 },
    ]));
  }

  // ── Sakhir – Bahrain (trackId 3) ──────────────────────────────────────────
  function sakhir() {
    return centre(buildFromSegments([
      { dist: 400 },          // Main straight
      { turn:  35, dist: 100 },
      { turn: -35, dist: 80 },  // Turn 1-2
      { turn:  20, dist: 200 },
      { turn:  90, dist: 80 },  // Turn 4
      { dist: 100 },
      { turn: -90, dist: 60 },
      { turn:  30, dist: 100 },
      { dist: 200 },          // Back section
      { turn: 100, dist: 60 },  // Turn 8 hairpin
      { turn:  60, dist: 80 },
      { dist: 250 },          // Long back straight
      { turn:  80, dist: 100 }, // Turn 10
      { turn: -80, dist: 60 },
      { turn:  80, dist: 100 },
      { dist: 150 },
      { turn: -80, dist: 60 },  // Turn 14
      { turn:  90, dist: 120 },
      { dist: 150 },
      { turn: -30, dist: 80 },
    ]));
  }

  // ── Monaco (trackId 5) ─────────────────────────────────────────────────────
  function monaco() {
    return centre(buildFromSegments([
      { dist: 300 },            // Start straight (Bd Albert 1er)
      { turn: -20, dist: 60 },
      { turn:  20, dist: 80 },  // Mirabeau
      { turn:  70, dist: 40 },  // Portier
      { turn:  80, dist: 30 },  // Fairmont (tight right)
      { turn: 165, dist: 20 },  // LOEWS/Grand Hotel hairpin
      { turn: -30, dist: 50 },
      { turn: -60, dist: 60 },  // Portier
      { dist: 100 },            // Tunnel section
      { turn: -30, dist: 80 },
      { turn:  10, dist: 80 },
      { turn: -40, dist: 60 },  // Swimming pool
      { turn:  50, dist: 40 },
      { turn: -50, dist: 50 },  // Rascasse
      { turn:  80, dist: 60 },
      { turn:  70, dist: 50 },  // Antony Noghes
      { dist: 150 },
      { turn: -50, dist: 60 },
      { turn:  60, dist: 80 },
    ]));
  }

  // ── Silverstone (trackId 7) ───────────────────────────────────────────────
  function silverstone() {
    return centre(buildFromSegments([
      { dist: 300 },            // Wellington Straight
      { turn: -50, dist: 80 },  // Brooklands
      { turn:  30, dist: 60 },
      { turn: -40, dist: 80 },  // Luffield
      { turn:  90, dist: 100 }, // Woodcote
      { turn: -10, dist: 300 }, // Hangar Straight (after Copse)
      { turn:  50, dist: 80 },  // Copse (fast right)
      { turn: -50, dist: 60 },  // Maggotts (left)
      { turn:  70, dist: 50 },  // Becketts (right)
      { turn: -50, dist: 40 },  // Chapel
      { dist: 250 },            // Hangar Straight
      { turn:  70, dist: 100 }, // Stowe
      { turn: -30, dist: 80 },
      { turn: -40, dist: 60 },  // Vale
      { turn:  50, dist: 80 },  // Club
      { turn:  30, dist: 80 },
      { turn: -20, dist: 200 }, // National pits straight
      { turn: -30, dist: 60 },  // Abbey
      { turn:  50, dist: 40 },  // Farm
      { turn: -50, dist: 60 },
      { turn:  20, dist: 80 },
      { turn:  30, dist: 60 },  // Village
      { turn: -10, dist: 100 },
    ]));
  }

  // ── Spa-Francorchamps (trackId 10) ────────────────────────────────────────
  function spa() {
    return centre(buildFromSegments([
      { dist: 200 },            // Straight before La Source
      { turn: 150, dist: 60 },  // La Source hairpin (right)
      { dist: 80 },
      { turn: -80, dist: 80 },  // Eau Rouge left
      { turn:  80, dist: 80 },  // Raidillon right
      { dist: 500 },            // Kemmel Straight
      { turn: -50, dist: 80 },  // Les Combes left
      { turn:  50, dist: 60 },
      { turn:  20, dist: 200 },
      { turn:  40, dist: 80 },  // Pouhon
      { turn:  20, dist: 100 },
      { dist: 150 },
      { turn: -30, dist: 60 },  // Fagnes
      { turn:  30, dist: 80 },
      { dist: 100 },
      { turn: -60, dist: 80 },  // Campus
      { turn:  50, dist: 60 },
      { dist: 200 },            // Back section
      { turn: -40, dist: 80 },  // Blanchimont
      { turn:  40, dist: 60 },
      { turn: 110, dist: 60 },  // Bus Stop chicane
      { turn: -100, dist: 40 },
      { dist: 300 },            // Straight back to pit lane
    ]));
  }

  // ── Monza (trackId 11) ────────────────────────────────────────────────────
  function monza() {
    return centre(buildFromSegments([
      { dist: 800 },            // Main straight (very long)
      { turn:  30, dist: 80 },  // Variante del Rettifilo R
      { turn: -80, dist: 40 },  // chicane left
      { turn:  80, dist: 40 },
      { turn: -40, dist: 60 },
      { dist: 200 },            // Through the curves (Curva Grande area)
      { turn:  50, dist: 80 },  // Variante della Roggia R
      { turn: -70, dist: 40 },  // chicane
      { turn:  70, dist: 40 },
      { dist: 150 },
      { turn:  30, dist: 80 },  // Lesmo 1
      { turn: -10, dist: 100 },
      { turn:  40, dist: 80 },  // Lesmo 2
      { dist: 350 },            // Serraglio / approach to Ascari
      { turn:  60, dist: 60 },  // Variante Ascari R
      { turn: -70, dist: 40 },
      { turn:  70, dist: 40 },
      { turn: -30, dist: 60 },
      { dist: 450 },            // Back straight
      { turn:  90, dist: 180 }, // Parabolica (big right-hander)
    ]));
  }

  // ── Singapore (trackId 12) ────────────────────────────────────────────────
  function singapore() {
    return centre(buildFromSegments([
      { dist: 200 },            // Start straight
      { turn:  90, dist: 60 },  // T1 right
      { dist: 100 },
      { turn: -90, dist: 50 },  // T3 left
      { dist: 80 },
      { turn:  90, dist: 40 },
      { dist: 150 },
      { turn:  90, dist: 50 },  // T7
      { turn: -50, dist: 60 },
      { turn:  50, dist: 60 },
      { dist: 120 },
      { turn: -90, dist: 50 },
      { dist: 80 },
      { turn: 100, dist: 50 },  // T10 hairpin
      { dist: 300 },            // Long straight (Raffles)
      { turn: -90, dist: 40 },
      { dist: 80 },
      { turn:  90, dist: 40 },
      { dist: 100 },
      { turn: -90, dist: 40 },  // T13
      { dist: 60 },
      { turn:  50, dist: 50 },
      { turn: -50, dist: 60 },
      { dist: 100 },
      { turn:  90, dist: 50 },
      { dist: 80 },
      { turn: -60, dist: 60 },
      { turn:  70, dist: 50 },
    ]));
  }

  // ── Suzuka (trackId 13) ───────────────────────────────────────────────────
  function suzuka() {
    // Approximated figure-8 shape
    return centre(buildFromSegments([
      { dist: 300 },            // Start straight
      { turn: -50, dist: 80 },  // T1
      { turn:  50, dist: 60 },
      { turn: -30, dist: 80 },  // Esses
      { turn:  30, dist: 60 },
      { turn: -30, dist: 80 },
      { turn:  50, dist: 60 },
      { dist: 150 },            // Degner
      { turn:  80, dist: 60 },  // Hairpin
      { turn:  60, dist: 60 },
      { dist: 100 },            // Under the overpass (figure-8)
      { turn: -70, dist: 60 },  // T11
      { turn:  70, dist: 60 },
      { dist: 200 },
      { turn:  30, dist: 80 },  // 130R (fast right)
      { dist: 80 },
      { turn: -60, dist: 50 },  // Chicane
      { turn:  70, dist: 50 },
      { dist: 200 },
      { turn: -40, dist: 80 },  // Spoon curve
      { turn:  30, dist: 100 },
    ]));
  }

  // ── Austin / COTA (trackId 15) ────────────────────────────────────────────
  function austin() {
    return centre(buildFromSegments([
      { dist: 300 },            // Back straight
      { turn: -100, dist: 80 }, // T1 (uphill hairpin)
      { turn:  50, dist: 60 },
      { dist: 150 },
      { turn: -40, dist: 60 },  // T3
      { turn:  40, dist: 80 },
      { dist: 100 },
      { turn:  50, dist: 80 },
      { turn: -80, dist: 60 },  // T5
      { turn:  80, dist: 80 },
      { dist: 200 },
      { turn: -50, dist: 60 },  // T8 (right)
      { turn:  40, dist: 100 },
      { dist: 150 },
      { turn:  80, dist: 60 },  // T11
      { turn: -80, dist: 50 },
      { dist: 250 },
      { turn:  90, dist: 80 },  // T13
      { turn: -80, dist: 60 },
      { turn:  90, dist: 80 },
      { dist: 150 },
      { turn: -60, dist: 80 },  // T15-16
      { turn:  60, dist: 60 },
      { dist: 200 },
    ]));
  }

  // ── Red Bull Ring (trackId 17) ────────────────────────────────────────────
  function redBullRing() {
    return centre(buildFromSegments([
      { dist: 400 },            // Main straight
      { turn: -100, dist: 80 }, // T1 hairpin (right)
      { dist: 150 },
      { turn: -50, dist: 60 },  // T2
      { dist: 200 },            // Long uphill
      { turn:  50, dist: 80 },  // T3
      { dist: 100 },
      { turn: -100, dist: 60 }, // T4 hairpin
      { dist: 200 },
      { turn:  70, dist: 80 },  // T5
      { turn: -60, dist: 60 },
      { dist: 150 },
      { turn: -80, dist: 60 },  // T6
    ]));
  }

  // ── Interlagos / São Paulo (trackId 18) ───────────────────────────────────
  function interlagos() {
    return centre(buildFromSegments([
      { dist: 200 },            // Pit straight
      { turn: -50, dist: 80 },  // Senna S (left)
      { turn:  70, dist: 60 },  // Senna S (right)
      { dist: 150 },
      { turn: -40, dist: 80 },
      { dist: 400 },            // Back straight
      { turn: 130, dist: 80 },  // Descida do Lago (hairpin)
      { dist: 150 },
      { turn: -50, dist: 60 },  // Cotovelo
      { turn:  70, dist: 80 },
      { dist: 100 },
      { turn: -90, dist: 80 },  // Laranjinha
      { dist: 200 },
      { turn: -50, dist: 60 },  // Pinheirinho
      { turn:  60, dist: 80 },
      { dist: 100 },
      { turn: -100, dist: 60 }, // Mergulho
      { dist: 200 },
      { turn:  80, dist: 80 },  // Junção
      { turn: -60, dist: 60 },
      { dist: 150 },            // Final chicane area
    ]));
  }

  // ── Baku – Azerbaijan (trackId 20) ────────────────────────────────────────
  function baku() {
    return centre(buildFromSegments([
      { dist: 700 },            // Very long back straight (2.2 km)
      { turn:  90, dist: 80 },  // T1 right
      { dist: 100 },
      { turn: -90, dist: 60 },  // T2
      { dist: 150 },
      { turn: -70, dist: 60 },  // T3
      { turn:  80, dist: 50 },
      { dist: 100 },
      { turn:  80, dist: 50 },  // Castle section begins
      { turn: -40, dist: 40 },
      { turn:  40, dist: 30 },  // Very narrow section
      { turn: -30, dist: 40 },
      { turn:  30, dist: 30 },
      { turn: -40, dist: 40 },
      { dist: 80 },
      { turn:  60, dist: 60 },
      { turn: -60, dist: 60 },  // Exit castle
      { dist: 200 },            // Back to pit lane
      { turn:  70, dist: 80 },
      { turn: -80, dist: 60 },
      { dist: 150 },
    ]));
  }

  // ── Zandvoort (trackId 26) ────────────────────────────────────────────────
  function zandvoort() {
    return centre(buildFromSegments([
      { dist: 250 },            // Main straight
      { turn: -60, dist: 80 },  // T1 (banked corner)
      { turn:  50, dist: 60 },
      { dist: 100 },
      { turn:  40, dist: 80 },  // T3
      { dist: 200 },
      { turn: -30, dist: 80 },  // Hugenholtz
      { dist: 100 },
      { turn:  50, dist: 60 },  // Scheivlak
      { dist: 100 },
      { turn: -40, dist: 80 },
      { turn:  50, dist: 60 },
      { dist: 150 },
      { turn: -80, dist: 80 },  // Gerlach
      { dist: 100 },
      { turn: 100, dist: 80 },  // Kumho (banked)
      { dist: 150 },
    ]));
  }

  // ── Imola (trackId 27) ────────────────────────────────────────────────────
  function imola() {
    return centre(buildFromSegments([
      { dist: 250 },            // Main straight
      { turn: -100, dist: 60 }, // T1 Tamburello (after chicane)
      { dist: 80 },
      { turn:  60, dist: 50 },  // Variante Tamburello
      { turn: -60, dist: 50 },
      { dist: 200 },
      { turn: -80, dist: 80 },  // Tosa hairpin
      { dist: 150 },
      { turn:  60, dist: 80 },  // Piratella
      { dist: 100 },
      { turn: -50, dist: 60 },
      { dist: 200 },
      { turn:  50, dist: 60 },  // Acque Minerali
      { turn: -60, dist: 50 },
      { turn:  60, dist: 50 },
      { dist: 150 },
      { turn: -80, dist: 60 },  // Variante Alta chicane
      { turn:  80, dist: 50 },
      { dist: 200 },
      { turn: -80, dist: 80 },  // Rivazza
      { turn:  60, dist: 60 },
      { dist: 100 },
    ]));
  }

  // ── Jeddah – Saudi Arabia (trackId 29) ───────────────────────────────────
  function jeddah() {
    return centre(buildFromSegments([
      { dist: 400 },            // Main straight
      { turn:  40, dist: 80 },
      { turn: -40, dist: 60 },
      { dist: 200 },
      { turn: -60, dist: 80 },
      { dist: 100 },
      { turn:  60, dist: 60 },
      { dist: 150 },
      { turn: -50, dist: 60 },  // Technical section
      { turn:  40, dist: 50 },
      { turn: -30, dist: 60 },
      { dist: 300 },            // Fast back section
      { turn:  40, dist: 80 },
      { turn: -30, dist: 60 },
      { dist: 200 },
      { turn: -50, dist: 80 },
      { turn:  50, dist: 60 },
      { dist: 150 },
    ]));
  }

  // ── Miami (trackId 30) ────────────────────────────────────────────────────
  function miami() {
    return centre(buildFromSegments([
      { dist: 300 },            // Main straight
      { turn: -80, dist: 80 },  // T1
      { dist: 100 },
      { turn:  90, dist: 60 },  // T2
      { dist: 150 },
      { turn: -70, dist: 60 },
      { turn:  60, dist: 60 },
      { dist: 200 },
      { turn:  80, dist: 80 },  // Around the stadium
      { dist: 150 },
      { turn: -90, dist: 60 },
      { dist: 100 },
      { turn:  90, dist: 60 },
      { dist: 200 },
      { turn: -80, dist: 80 },
      { turn:  70, dist: 60 },
      { dist: 150 },
      { turn: -60, dist: 60 },
    ]));
  }

  // ── Las Vegas (trackId 31) ────────────────────────────────────────────────
  function lasVegas() {
    return centre(buildFromSegments([
      { dist: 700 },            // Very long back straight (Strip)
      { turn:  90, dist: 80 },  // T1 right
      { dist: 200 },
      { turn: -90, dist: 60 },
      { dist: 100 },
      { turn:  90, dist: 60 },
      { dist: 300 },            // Shorter straight
      { turn:  90, dist: 80 },
      { dist: 150 },
      { turn: -90, dist: 60 },
      { dist: 200 },
      { turn: -90, dist: 80 },  // Hairpin
      { dist: 150 },
    ]));
  }

  // ── Lusail – Qatar (trackId 32) ───────────────────────────────────────────
  function lusail() {
    return centre(buildFromSegments([
      { dist: 400 },            // Main straight
      { turn: -40, dist: 80 },  // T1 fast right
      { dist: 100 },
      { turn:  50, dist: 80 },
      { dist: 150 },
      { turn: -70, dist: 80 },
      { turn:  60, dist: 60 },
      { dist: 200 },
      { turn:  50, dist: 80 },
      { dist: 100 },
      { turn: -80, dist: 80 },
      { dist: 200 },
      { turn:  60, dist: 60 },
      { turn: -50, dist: 60 },
      { dist: 150 },
      { turn: -70, dist: 80 },
      { dist: 200 },
    ]));
  }

  // ── Hungaroring (trackId 9) ───────────────────────────────────────────────
  function hungaroring() {
    return centre(buildFromSegments([
      { dist: 250 },            // Straight
      { turn: -100, dist: 80 }, // T1 hairpin
      { dist: 100 },
      { turn:  60, dist: 60 },
      { turn: -60, dist: 60 },
      { dist: 100 },
      { turn:  50, dist: 80 },  // T4
      { turn: -50, dist: 60 },
      { dist: 200 },
      { turn: -80, dist: 80 },  // Hairpin (T6)
      { dist: 100 },
      { turn:  70, dist: 60 },
      { dist: 100 },
      { turn: -60, dist: 60 },  // T10
      { turn:  50, dist: 80 },
      { dist: 150 },
      { turn: -40, dist: 80 },  // T12
      { dist: 100 },
    ]));
  }

  // ── Catalunya – Spain (trackId 4) ────────────────────────────────────────
  function catalunya() {
    return centre(buildFromSegments([
      { dist: 300 },            // Main straight
      { turn: -80, dist: 80 },  // T1 right
      { dist: 100 },
      { turn:  60, dist: 60 },  // T2
      { dist: 200 },
      { turn: -50, dist: 80 },  // T3
      { dist: 100 },
      { turn:  80, dist: 60 },
      { dist: 150 },
      { turn: -80, dist: 80 },  // T5
      { dist: 100 },
      { turn:  60, dist: 60 },
      { dist: 200 },
      { turn: -60, dist: 80 },  // T9
      { dist: 100 },
      { turn:  80, dist: 60 },  // T10
      { dist: 150 },
      { turn: -70, dist: 80 },  // T12
      { dist: 100 },
      { turn:  90, dist: 80 },  // T13-14 chicane
      { turn: -90, dist: 60 },
      { dist: 200 },
    ]));
  }

  // ── Montréal – Canada (trackId 6) ─────────────────────────────────────────
  function montreal() {
    return centre(buildFromSegments([
      { dist: 350 },            // Straight
      { turn:  90, dist: 80 },  // T1 right
      { dist: 100 },
      { turn: -80, dist: 60 },
      { dist: 200 },
      { turn:  70, dist: 80 },  // Island section
      { turn: -50, dist: 60 },
      { dist: 150 },
      { turn:  60, dist: 80 },
      { dist: 100 },
      { turn: -90, dist: 60 },
      { dist: 400 },            // Back straight (long)
      { turn: -50, dist: 80 },  // Hairpin complex
      { turn:  60, dist: 60 },
      { dist: 100 },
      { turn:  80, dist: 80 },  // Last chicane (Wall of Champions)
      { turn: -90, dist: 60 },
      { dist: 150 },
    ]));
  }

  // ── Portimão (trackId 28) ─────────────────────────────────────────────────
  function portimao() {
    return centre(buildFromSegments([
      { dist: 200 },            // Pit straight
      { turn: -80, dist: 80 },  // T1
      { dist: 100 },
      { turn:  60, dist: 60 },
      { dist: 200 },
      { turn: -60, dist: 80 },
      { dist: 100 },
      { turn:  80, dist: 80 },
      { dist: 150 },
      { turn: -70, dist: 80 },  // T5 downhill
      { dist: 100 },
      { turn:  60, dist: 60 },
      { dist: 200 },            // Long back section
      { turn: -50, dist: 80 },
      { dist: 100 },
      { turn:  80, dist: 80 },
      { dist: 150 },
    ]));
  }

  // ── Yas Marina – Abu Dhabi (trackId 14) ──────────────────────────────────
  function yasMarina() {
    return centre(buildFromSegments([
      { dist: 350 },            // Main straight
      { turn: -80, dist: 80 },  // T1
      { dist: 100 },
      { turn:  60, dist: 60 },  // T2
      { dist: 200 },
      { turn: -60, dist: 80 },  // T5
      { dist: 150 },
      { turn:  80, dist: 80 },
      { dist: 100 },
      { turn: -100, dist: 80 }, // Marina hairpin
      { dist: 200 },
      { turn:  60, dist: 60 },
      { dist: 150 },
      { turn: -50, dist: 80 },
      { turn:  50, dist: 60 },
      { dist: 200 },
      { turn: -80, dist: 80 },
      { dist: 100 },
      { turn:  90, dist: 60 },
    ]));
  }

  // ── Generic oval (fallback for unknown tracks) ────────────────────────────
  function genericOval(steps = 200) {
    const pts = [];
    for (let i = 0; i <= steps; i++) {
      const t = (i / steps) * Math.PI * 2;
      pts.push({
        x: Math.cos(t) * 500 + Math.cos(2 * t) * 60,
        z: Math.sin(t) * 250 + Math.sin(3 * t) * 30,
      });
    }
    return pts;
  }

  // ── Export ────────────────────────────────────────────────────────────────
  window.F1CircuitData = {
    0:  melbourne(),
    3:  sakhir(),
    4:  catalunya(),
    5:  monaco(),
    6:  montreal(),
    7:  silverstone(),
    9:  hungaroring(),
    10: spa(),
    11: monza(),
    12: singapore(),
    13: suzuka(),
    14: yasMarina(),
    15: austin(),
    17: redBullRing(),
    18: interlagos(),
    20: baku(),
    26: zandvoort(),
    27: imola(),
    28: portimao(),
    29: jeddah(),
    30: miami(),
    31: lasVegas(),
    32: lusail(),
    _fallback: genericOval(),
  };

})();
