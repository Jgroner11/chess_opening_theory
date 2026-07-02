// ═══════════════════════════════════════════════════════════════
//  Opening Sets
//  Loaded from data/<set>.json — see loadOpeningSet().
// ═══════════════════════════════════════════════════════════════
let currentSet = null;
let OPENINGS   = [];

async function loadOpeningSet() {
  const set = new URLSearchParams(window.location.search).get('set') || 'benoni';
  const resp = await fetch(`data/${set}.json`);
  if (!resp.ok) throw new Error(`Could not load data/${set}.json (HTTP ${resp.status})`);
  currentSet = await resp.json();
  OPENINGS   = currentSet.puzzles;
}

// ═══════════════════════════════════════════════════════════════
//  Leitner Box Spaced Repetition
//  Puzzles live in boxes 1 (new/missed) .. MAX_BOX (mastered); lower
//  boxes are drawn far more often. A correct answer advances a
//  puzzle's box, a miss resets it to 1. Memorization puzzles also
//  get a weight boost until most of them are mastered, so the line
//  gets learned before variations are drilled.
// ═══════════════════════════════════════════════════════════════
const MAX_BOX             = 5;
const MASTERED_BOX         = 4;
const BOX_WEIGHTS          = { 1: 10, 2: 5, 3: 3, 4: 2, 5: 1 };
const MEMORIZATION_BOOST   = 4; // weight multiplier while no memorization puzzles are mastered yet

function leitnerKey(opening)  { return opening.moves.join(','); }
function leitnerStorageKey()  { return `leitner_${currentSet?.name || 'default'}`; }

function loadLeitnerState() {
  try { return JSON.parse(localStorage.getItem(leitnerStorageKey())) || {}; }
  catch { return {}; }
}

function saveLeitnerState(state) {
  localStorage.setItem(leitnerStorageKey(), JSON.stringify(state));
}

function getBox(state, opening) { return state[leitnerKey(opening)]?.box || 1; }

function updateLeitnerBox(opening, correct) {
  const state = loadLeitnerState();
  const key   = leitnerKey(opening);
  const box   = state[key]?.box || 1;
  state[key]  = { box: correct ? Math.min(box + 1, MAX_BOX) : 1 };
  saveLeitnerState(state);
}

// Weight boost for memorization puzzles: full strength until most of
// them reach MASTERED_BOX, then tapers down to 1 (no boost).
function memorizationMultiplier(state) {
  const memPuzzles = OPENINGS.filter(o => o.type === 'memorization');
  if (memPuzzles.length === 0) return 1;
  const mastered    = memPuzzles.filter(o => getBox(state, o) >= MASTERED_BOX).length;
  const masteryRatio = mastered / memPuzzles.length;
  return 1 + (MEMORIZATION_BOOST - 1) * (1 - masteryRatio);
}

function pickNextPuzzle(exclude) {
  const state   = loadLeitnerState();
  const memMult = memorizationMultiplier(state);
  const pool    = OPENINGS.length > 1 ? OPENINGS.filter(o => o !== exclude) : OPENINGS;

  const weighted = pool.map(o => {
    let weight = BOX_WEIGHTS[getBox(state, o)] || 1;
    if (o.type === 'memorization') weight *= memMult;
    return { opening: o, weight };
  });

  const totalWeight = weighted.reduce((sum, w) => sum + w.weight, 0);
  let roll = Math.random() * totalWeight;
  for (const w of weighted) {
    roll -= w.weight;
    if (roll <= 0) return w.opening;
  }
  return weighted[weighted.length - 1].opening;
}

// ═══════════════════════════════════════════════════════════════
//  Move History
//  Single source of truth for all position state.
// ═══════════════════════════════════════════════════════════════
const hist = {
  moves:    [],  // UCI moves for the current line (opening + user exploration)
  puzzleAt: 0,   // index where the puzzle begins (opening moves end)
  cursor:   0,   // currently displayed position

  fen()       { return fenFromMoves(this.moves.slice(0, this.cursor)); },
  puzzleFen() { return fenFromMoves(this.moves.slice(0, this.puzzleAt)); },
  atPuzzle()  { return this.cursor === this.puzzleAt; },

  load(opening) {
    this.moves    = [...opening.moves];
    this.puzzleAt = opening.moves.length;
    this.cursor   = this.puzzleAt;
  },

  pushMove(uci) {
    this.moves = this.moves.slice(0, this.cursor);
    this.moves.push(uci);
    this.cursor++;
  },

  back()    { if (this.cursor > 0)               this.cursor--; },
  forward() { if (this.cursor < this.moves.length) this.cursor++; },

  resetToOpening() {
    this.moves  = this.moves.slice(0, this.puzzleAt);
    this.cursor = this.puzzleAt;
  },
};

// ═══════════════════════════════════════════════════════════════
//  Analysis Cache   fen -> { bestMove, cp, mate, depth, source }
//  'source' is 'lichess' | 'stockfish' | null
// ═══════════════════════════════════════════════════════════════
const analysisCache = {};

function cacheGet(fen) { return analysisCache[fen] || null; }

function cacheSet(fen, fields) {
  if (!analysisCache[fen]) {
    analysisCache[fen] = { bestMove: null, cp: null, mate: null, depth: null, source: null };
  }
  Object.assign(analysisCache[fen], fields);
}

// ═══════════════════════════════════════════════════════════════
//  Stockfish Engine
// ═══════════════════════════════════════════════════════════════
let sf          = null;
let engineReady = false;
let sfFen       = null; // FEN Stockfish is currently analyzing (null = idle)

function initEngine() {
  sf = new Worker('stockfish.js');
  sf.onmessage = function(e) { onEngineMessage(e.data.trim()); };
  sf.postMessage('uci');
}

function onEngineMessage(msg) {
  if (msg === 'uciok')  { sf.postMessage('isready'); return; }
  if (msg === 'readyok') {
    engineReady = true;
    if (currentOpening) analyzePosition(hist.fen());
    return;
  }
  if (msg.startsWith('bestmove')) return;

  if (!msg.startsWith('info') || !msg.includes('score') || sfFen === null) return;

  const depthM = msg.match(/depth (\d+)/);
  if (depthM) $('#depthBadge').text('depth ' + depthM[1]);

  const cpM   = msg.match(/score cp (-?\d+)/);
  const mateM = msg.match(/score mate (-?\d+)/);
  let cp = null, mate = null;
  if (cpM)   cp   = parseInt(cpM[1]);
  if (mateM) { mate = parseInt(mateM[1]); cp = mate > 0 ? 30000 : -30000; }

  if (cp !== null) {
    const whiteCp = new Chess(sfFen).turn() === 'b' ? -cp : cp;
    updateEvalBar(whiteCp, mate);
  }

  const pvM = msg.match(/\bpv ([a-h][1-8][a-h][1-8][qrbn]?)/);
  if (pvM) {
    const uci = pvM[1];
    cacheSet(sfFen, { bestMove: uci, cp, mate, depth: depthM ? parseInt(depthM[1]) : null, source: 'stockfish' });

    if (showBestMoveActive && sfFen === hist.fen()) {
      drawArrow(uci.slice(0, 2), uci.slice(2, 4));
    }
  }
}

function stopEngine() {
  if (sfFen !== null) {
    sf.postMessage('stop');
    sfFen = null;
  }
}

function runEngine(fen) {
  stopEngine();
  sfFen = fen;
  sf.postMessage('position fen ' + fen);
  sf.postMessage('go infinite');
}

// ═══════════════════════════════════════════════════════════════
//  Analysis Controller   Lichess first → Stockfish fallback
// ═══════════════════════════════════════════════════════════════
function analyzePosition(fen) {
  stopEngine();
  $('#thinkDots').show();
  $('#depthBadge').text('');

  // Already have a definitive Lichess result — apply immediately
  const cached = cacheGet(fen);
  if (cached && cached.source === 'lichess') {
    applyResult(fen);
    $('#thinkDots').hide();
    return;
  }

  // Try Lichess first
  fetch('https://lichess.org/api/cloud-eval?fen=' + encodeURIComponent(fen) + '&multiPv=1')
    .then(function(r) { if (!r.ok) throw new Error(); return r.json(); })
    .then(function(data) {
      if (hist.fen() !== fen) return; // navigated away while fetching
      if (!data.pvs || !data.pvs.length) throw new Error();
      const pv  = data.pvs[0];
      const uci = pv.moves.split(' ')[0];
      cacheSet(fen, { bestMove: uci, cp: pv.cp ?? null, mate: pv.mate ?? null, depth: data.depth ?? null, source: 'lichess' });
      applyResult(fen);
      $('#thinkDots').hide();
    })
    .catch(function() {
      if (hist.fen() !== fen) return;
      if (engineReady) runEngine(fen);
    });
}

function applyResult(fen) {
  const c = cacheGet(fen);
  if (!c || !c.bestMove) return;

  // Update eval bar
  const rawCp   = c.mate != null ? (c.mate > 0 ? 30000 : -30000) : (c.cp ?? 0);
  const whiteCp = new Chess(fen).turn() === 'b' ? -rawCp : rawCp;
  updateEvalBar(whiteCp, c.mate ?? null);
  if (c.depth) $('#depthBadge').text('depth ' + c.depth);

  // Draw live arrow if show best move is active and we're still on this position
  if (showBestMoveActive && hist.fen() === fen) {
    drawArrow(c.bestMove.slice(0, 2), c.bestMove.slice(2, 4));
  }
}

// ═══════════════════════════════════════════════════════════════
//  Eval Bar
// ═══════════════════════════════════════════════════════════════
function updateEvalBar(cp, mateNum) {
  const whiteRatio = 0.5 + 0.5 * Math.tanh(cp / 400);
  const whitePct   = (whiteRatio * 100).toFixed(1);
  const blackPct   = (100 - whiteRatio * 100).toFixed(1);
  $('#evalBlack').css('height', blackPct + '%');
  $('#evalWhite').css('height', whitePct + '%');
  let label;
  if (mateNum !== null) {
    label = (mateNum > 0 ? 'M' : '-M') + Math.abs(mateNum);
  } else {
    const pawns = Math.abs(cp / 100).toFixed(1);
    label = cp >= 0 ? '+' + pawns : '-' + pawns;
  }
  $('#evalScore').text(label);
}

// ═══════════════════════════════════════════════════════════════
//  Puzzle State
// ═══════════════════════════════════════════════════════════════
let currentOpening     = null;
let puzzleBestMove     = null; // correct answer for the current puzzle position
let puzzleScored       = false;
let showBestMoveActive = false;
let score = { correct: 0, total: 0, streak: 0 };

// ═══════════════════════════════════════════════════════════════
//  Helpers
// ═══════════════════════════════════════════════════════════════
function fenFromMoves(moves) {
  const g = new Chess();
  for (const m of moves) g.move({ from: m.slice(0,2), to: m.slice(2,4), promotion: m[4] || 'q' });
  return g.fen();
}

function uciToSan(uci, fen) {
  try {
    const tmp = new Chess(fen);
    const mv  = tmp.move({ from: uci.slice(0,2), to: uci.slice(2,4), promotion: uci[4] || 'q' });
    return mv ? mv.san : uci;
  } catch (_) { return uci; }
}

function isTerminalPosition(fen) {
  const g = new Chess(fen);
  return g.in_checkmate() || g.in_stalemate();
}

// ═══════════════════════════════════════════════════════════════
//  Puzzle Loading
// ═══════════════════════════════════════════════════════════════
function loadPuzzle() {
  if (OPENINGS.length === 0) {
    $('#openingName').text('No puzzles yet');
    $('#openingDesc').text('Puzzles for this opening are being generated.');
    return;
  }
  currentOpening = pickNextPuzzle(currentOpening);

  hist.load(currentOpening);
  puzzleBestMove     = currentOpening.bestMove;
  puzzleScored       = false;
  showBestMoveActive = false;

  const fen = hist.fen();
  boardFlipped = new Chess(fen).turn() === 'b';
  board.position(fen, false);
  board.orientation(boardFlipped ? 'black' : 'white');
  $('#evalBar').toggleClass('flipped', boardFlipped);

  clearArrow();
  setLastMoveHighlight(currentOpening.moves);
  $('#openingName').text(currentSet.name);
  $('#openingDesc').text(currentOpening.type === 'memorization' ? 'What is the next move in the line?' : 'What is the best move here?');
  updateTurnIndicator(new Chess(fen).turn());
  updateNavButtons();
  updatePuzzlePositionState();
  hideFeedback();
  updateScoreDisplay();
  updateEvalBar(0, null);
  analyzePosition(fen);
}

// ═══════════════════════════════════════════════════════════════
//  Navigation
// ═══════════════════════════════════════════════════════════════
const NAV_ANIM_MS = 180;
let navQueue     = [];
let navAnimating = false;

function navBack()    { navQueue.push(-1); processNavQueue(); }
function navForward() { navQueue.push(+1); processNavQueue(); }

function squareToPixel(sq) {
  const el = document.querySelector(`[data-square="${sq}"]`);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { left: r.left, top: r.top, size: r.width };
}

function animatePieceMove(fromSq, toSq, pieceSrc) {
  if (!pieceSrc) return;
  const from = squareToPixel(fromSq);
  const to   = squareToPixel(toSq);
  if (!from || !to) return;
  const $dest = $(`[data-square="${toSq}"]`).find('img');
  $dest.css('opacity', 0);
  const $anim = $('<img>')
    .attr('src', pieceSrc)
    .css({ position: 'fixed', left: from.left, top: from.top, width: from.size, height: from.size, zIndex: 9000, pointerEvents: 'none', transition: 'none' });
  $('body').append($anim);
  void $anim[0].offsetWidth;
  $anim.css({ transition: `left ${NAV_ANIM_MS}ms ease, top ${NAV_ANIM_MS}ms ease`, left: to.left, top: to.top });
  setTimeout(() => { $dest.css('opacity', 1); $anim.remove(); }, NAV_ANIM_MS);
}

function processNavQueue() {
  if (navAnimating || navQueue.length === 0) return;
  const step = navQueue.shift();
  const next = hist.cursor + step;
  if (next < 0 || next > hist.moves.length) { processNavQueue(); return; }

  let fromSq, toSq;
  if (step === +1) {
    const mv = hist.moves[next - 1];
    fromSq = mv.slice(0,2); toSq = mv.slice(2,4);
  } else {
    const mv = hist.moves[hist.cursor - 1];
    fromSq = mv.slice(2,4); toSq = mv.slice(0,2);
  }

  const pieceSrc = $(`[data-square="${fromSq}"]`).find('img').attr('src') || '';
  hist.cursor = next;
  navAnimating = true;

  const fen = hist.fen();
  board.position(fen, false);
  animatePieceMove(fromSq, toSq, pieceSrc);

  clearArrow();
  clearSquareHighlights();
  if (hist.cursor > 0) {
    const last = hist.moves[hist.cursor - 1];
    applyLastMove(last.slice(0,2), last.slice(2,4));
  }
  showBestMoveActive = false;
  updateTurnIndicator(new Chess(fen).turn());
  updateNavButtons();
  updatePuzzlePositionState();
  analyzePosition(fen);

  setTimeout(() => { navAnimating = false; processNavQueue(); }, NAV_ANIM_MS);
}

function updateNavButtons() {
  $('#navBack').prop('disabled', hist.cursor <= 0);
  $('#navForward').prop('disabled', hist.cursor >= hist.moves.length);
  $('#hintBtn').prop('disabled', isTerminalPosition(hist.fen()));
}

// ═══════════════════════════════════════════════════════════════
//  Square Highlighting
// ═══════════════════════════════════════════════════════════════
function setLastMoveHighlight(moves) {
  clearSquareHighlights();
  if (!moves || !moves.length) return;
  const last = moves[moves.length - 1];
  applyLastMove(last.slice(0,2), last.slice(2,4));
}

function applyLastMove(from, to) {
  $(`[data-square="${from}"]`).addClass('sq-last-move');
  $(`[data-square="${to}"]`).addClass('sq-last-move');
}

function clearSquareHighlights() {
  $('.sq-last-move').removeClass('sq-last-move');
  $('.sq-selected').removeClass('sq-selected');
}

function updateTurnIndicator(turn) {
  $('#turnChip').css('background', turn === 'w' ? '#f0ead6' : '#2a2a2a');
  $('#turnText').text(turn === 'w' ? 'White to move' : 'Black to move');
}

function updatePuzzlePositionState() {
  $('#openingCard').toggleClass('browsing', !hist.atPuzzle());
}

// ═══════════════════════════════════════════════════════════════
//  Board Interaction
// ═══════════════════════════════════════════════════════════════
let selectedSquare = null;
let dragFrom    = null;
let dragStartX  = 0, dragStartY  = 0;
let dragActive  = false;
let mouseIsDown = false;
let $dragGhost  = null;
let $dragSrcImg = null;
const DRAG_THRESHOLD = 8;

function validPieceAt(square) {
  if (hist.cursor < hist.puzzleAt && !puzzleScored) return false;
  const g = new Chess(hist.fen());
  if (g.game_over()) return false;
  const p = g.get(square);
  return p && p.color === g.turn();
}

$(document).on('mousemove', function(e) {
  if (dragActive) {
    if ($dragGhost) {
      const sqSize = $('#board').width() / 8;
      $dragGhost.css({ left: e.clientX - sqSize / 2, top: e.clientY - sqSize / 2 });
    }
    return;
  }
  if (!mouseIsDown || !dragFrom) return;
  const dx = e.clientX - dragStartX;
  const dy = e.clientY - dragStartY;
  if (Math.sqrt(dx * dx + dy * dy) < DRAG_THRESHOLD) return;
  dragActive = true;
  const sqSize = $('#board').width() / 8;
  $dragSrcImg = $(`[data-square="${dragFrom}"]`).find('img');
  $dragSrcImg.css('opacity', 0);
  $dragGhost = $('<img>')
    .attr('src', $dragSrcImg.attr('src'))
    .css({ position: 'fixed', width: sqSize, height: sqSize, left: e.clientX - sqSize / 2, top: e.clientY - sqSize / 2, zIndex: 9001, pointerEvents: 'none' })
    .appendTo('body');
});

$(document).on('mouseup', function(e) {
  mouseIsDown = false;
  if (!dragActive) {
    if (dragFrom) {
      const el = document.elementFromPoint(e.clientX, e.clientY);
      const upSquare = $(el).closest('[data-square]').attr('data-square');
      if (upSquare !== dragFrom) {
        $('.sq-selected').removeClass('sq-selected');
        if (selectedSquare) $(`[data-square="${selectedSquare}"]`).addClass('sq-selected');
      }
    }
    dragFrom = null;
    return;
  }
  if ($dragGhost)  { $dragGhost.remove();  $dragGhost  = null; }
  if ($dragSrcImg) { $dragSrcImg.css('opacity', 1); $dragSrcImg = null; }
  const el     = document.elementFromPoint(e.clientX, e.clientY);
  const target = $(el).closest('[data-square]').attr('data-square');
  let moveSucceeded = false;
  if (target && target !== dragFrom) moveSucceeded = performMove(dragFrom, target);
  board.position(hist.fen(), false);
  if (moveSucceeded) {
    selectedSquare = null;
    $('.sq-selected').removeClass('sq-selected');
  } else {
    selectedSquare = dragFrom;
    $(`[data-square="${dragFrom}"]`).addClass('sq-selected');
  }
  dragFrom   = null;
  dragActive = false;
});

// ═══════════════════════════════════════════════════════════════
//  Move Execution
// ═══════════════════════════════════════════════════════════════
function performMove(source, target) {
  if (hist.cursor < hist.puzzleAt && !puzzleScored) return false;
  const g = new Chess(hist.fen());
  const move = g.move({ from: source, to: target, promotion: 'q' });
  if (!move) return false;

  const userUci     = source + target;
  const atPuzzlePos = hist.atPuzzle();

  hist.pushMove(userUci);

  $('.sq-last-move').removeClass('sq-last-move');
  applyLastMove(source, target);
  updateTurnIndicator(new Chess(hist.fen()).turn());
  updateNavButtons();
  updatePuzzlePositionState();

  showBestMoveActive = false;

  if (atPuzzlePos) {
    if (!puzzleScored) {
      puzzleScored = true;
      score.total++;
      recordScore(userUci);
      showOnBoardJudgment(userUci);
    } else {
      showOnBoardJudgment(userUci);
    }
  } else {
    clearArrow();
  }

  analyzePosition(hist.fen());
  return true;
}

function showOnBoardJudgment(userUci) {
  const correct = puzzleBestMove && userUci.slice(0,4) === puzzleBestMove.slice(0,4);
  clearArrow();
  if (correct) {
    drawBadge(userUci.slice(2,4), 'correct');
  } else {
    if (puzzleBestMove) drawArrow(puzzleBestMove.slice(0,2), puzzleBestMove.slice(2,4));
    drawBadge(userUci.slice(2,4), 'wrong');
  }
}

// ═══════════════════════════════════════════════════════════════
//  Puzzle Scoring & Feedback
// ═══════════════════════════════════════════════════════════════
function recordScore(userUci) {
  const correct        = puzzleBestMove && userUci.slice(0,4) === puzzleBestMove.slice(0,4);
  const isMemorization = currentOpening?.type === 'memorization';
  updateLeitnerBox(currentOpening, correct);
  if (correct) {
    score.correct++;
    score.streak++;
    const san = uciToSan(userUci, hist.puzzleFen());
    const msg = isMemorization
      ? `✓ <strong>${san}</strong> is the continuation of the line.`
      : `✓ Correct! Engine's top choice is <strong>${san}</strong>.`;
    showFeedback('correct', msg);
  } else {
    score.streak = 0;
    const bestSan = puzzleBestMove ? uciToSan(puzzleBestMove, hist.puzzleFen()) : '?';
    const msg = isMemorization
      ? `✗ The line continues <strong>${bestSan}</strong>.`
      : `✗ Best move was <strong>${bestSan}</strong>.`;
    showFeedback('wrong', msg);
  }
  updateScoreDisplay();
}

function revealBestMove() {
  if (isTerminalPosition(hist.fen())) return;

  if (hist.atPuzzle() && !puzzleScored) {
    puzzleScored = true;
    score.total++;
    score.streak = 0;
    updateLeitnerBox(currentOpening, false);
    const bestSan        = uciToSan(puzzleBestMove, hist.puzzleFen());
    const isMemorization = currentOpening?.type === 'memorization';
    const msg = isMemorization
      ? `✗ The line continues <strong>${bestSan}</strong>.`
      : `✗ Best move was <strong>${bestSan}</strong>.`;
    showFeedback('wrong', msg);
    updateScoreDisplay();
  }

  showBestMoveActive = true;
  if (hist.atPuzzle()) {
    if (puzzleBestMove) drawArrow(puzzleBestMove.slice(0,2), puzzleBestMove.slice(2,4));
  } else {
    const cached = cacheGet(hist.fen());
    if (cached && cached.bestMove) drawArrow(cached.bestMove.slice(0,2), cached.bestMove.slice(2,4));
  }
}

function showFeedback(type, html) { $('#feedback').attr('class', 'feedback ' + type).html(html); }
function hideFeedback()           { $('#feedback').attr('class', 'feedback'); }

function updateScoreDisplay() {
  $('#scoreDisplay').text(score.correct + ' / ' + score.total);
  $('#streakDisplay').text(score.streak > 1 ? '🔥 ' + score.streak + ' in a row' : '');
}

// ═══════════════════════════════════════════════════════════════
//  Arrow & Badge
// ═══════════════════════════════════════════════════════════════
let boardFlipped = false;
let board        = null;

function sqCenter(sq) {
  const files   = 'abcdefgh';
  const canvas  = document.getElementById('arrowCanvas');
  const sqSize  = canvas.width / 8;
  const fileIdx = files.indexOf(sq[0]);
  const rankIdx = parseInt(sq[1]) - 1;
  const x = boardFlipped ? (7 - fileIdx + 0.5) * sqSize : (fileIdx + 0.5) * sqSize;
  const y = boardFlipped ? (rankIdx + 0.5) * sqSize      : (7 - rankIdx + 0.5) * sqSize;
  return { x, y };
}

function drawBadge(sq, type) {
  const canvas   = document.getElementById('arrowCanvas');
  const ctx      = canvas.getContext('2d');
  const sqSize   = canvas.width / 8;
  const center   = sqCenter(sq);
  const fontSize = sqSize * 0.38;
  ctx.font         = `bold ${Math.round(fontSize)}px Arial`;
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle    = type === 'correct' ? '#3ddc64' : '#ff4444';
  ctx.fillText(type === 'correct' ? '✓' : '✗', center.x + sqSize * 0.22, center.y - sqSize * 0.22);
}

function sizeArrowCanvas() {
  const boardEl = document.getElementById('board');
  const canvas  = document.getElementById('arrowCanvas');
  canvas.width  = boardEl.offsetWidth;
  canvas.height = boardEl.offsetHeight;
}

function clearArrow() {
  sizeArrowCanvas();
  const canvas = document.getElementById('arrowCanvas');
  canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
}

function drawArrow(fromSq, toSq, color = 'rgba(100, 220, 90, 0.90)') {
  const canvas  = document.getElementById('arrowCanvas');
  sizeArrowCanvas();
  const ctx     = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const sqSize  = canvas.width / 8;
  const from    = sqCenter(fromSq);
  const to      = sqCenter(toSq);
  const angle   = Math.atan2(to.y - from.y, to.x - from.x);
  const lineW   = sqSize * 0.18;
  const headW   = sqSize * 0.46;
  const headLen = headW * (Math.sqrt(3) / 2);
  const tailX   = from.x + Math.cos(angle) * sqSize * 0.32;
  const tailY   = from.y + Math.sin(angle) * sqSize * 0.32;
  const bodyEndX = to.x - Math.cos(angle) * headLen;
  const bodyEndY = to.y - Math.sin(angle) * headLen;
  ctx.save();
  ctx.fillStyle = ctx.strokeStyle = color;
  ctx.lineWidth = lineW;
  ctx.lineCap   = 'round';
  ctx.beginPath(); ctx.moveTo(tailX, tailY); ctx.lineTo(bodyEndX, bodyEndY); ctx.stroke();
  ctx.save();
  ctx.translate(to.x, to.y); ctx.rotate(angle);
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-headLen, headW / 2); ctx.lineTo(-headLen, -headW / 2);
  ctx.closePath(); ctx.fill();
  ctx.restore();
  ctx.restore();
}

// ═══════════════════════════════════════════════════════════════
//  Init
// ═══════════════════════════════════════════════════════════════
$(document).ready(async function() {
  board = Chessboard('board', {
    draggable: false,
    position: 'start',
    pieceTheme: 'img/chesspieces/wikipedia/{piece}.png',
    moveSpeed: 180,
  });

  $('#board').on('mousedown', '.square-55d63', function(e) {
    if (e.which !== 1) return;
    mouseIsDown = true;
    const square = $(this).attr('data-square');
    if (!validPieceAt(square)) return;
    dragFrom   = square;
    dragStartX = e.clientX;
    dragStartY = e.clientY;
    dragActive = false;
    $('.sq-selected').removeClass('sq-selected');
    $(`[data-square="${square}"]`).addClass('sq-selected');
  });

  $('#board').on('click', '.square-55d63', function() {
    const square = $(this).attr('data-square');
    if (hist.cursor < hist.puzzleAt) return;
    if (selectedSquare === null) {
      if (!validPieceAt(square)) return;
      selectedSquare = square;
    } else if (selectedSquare === square) {
      selectedSquare = null;
      $('.sq-selected').removeClass('sq-selected');
    } else {
      const from = selectedSquare;
      selectedSquare = null;
      $('.sq-selected').removeClass('sq-selected');
      if (performMove(from, square)) {
        board.position(hist.fen(), false);
      } else if (validPieceAt(square)) {
        selectedSquare = square;
        $(`[data-square="${square}"]`).addClass('sq-selected');
      }
    }
  });

  $(window).resize(() => { board.resize(); sizeArrowCanvas(); });

  $(document).on('keydown', function(e) {
    if (e.key === 'ArrowLeft')  navBack();
    if (e.key === 'ArrowRight') navForward();
  });

  $('#openingCard').on('click', function() {
    if (hist.atPuzzle()) return;
    hist.resetToOpening();
    board.position(hist.fen(), false);
    clearArrow();
    setLastMoveHighlight(currentOpening.moves);
    updateNavButtons();
    updatePuzzlePositionState();
    analyzePosition(hist.fen());
  });

  initEngine();

  try {
    await loadOpeningSet();
    loadPuzzle();
  } catch (err) {
    $('#openingName').text('Failed to load opening set');
    $('#openingDesc').text(err.message);
  }
});
