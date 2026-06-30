// ═══════════════════════════════════════════════════════════════
//  Debug Logging
// ═══════════════════════════════════════════════════════════════
const logLines = [];

function dbg(msg) {
  const ts = new Date().toISOString().slice(11, 23);
  const line = '[' + ts + '] ' + msg;
  logLines.push(line);
  const el = document.getElementById('debugLog');
  if (el) {
    el.textContent += line + '\n';
    el.scrollTop = el.scrollHeight;
  }
}

function copyLog() {
  navigator.clipboard.writeText(logLines.join('\n'))
    .then(() => alert('Log copied to clipboard!'))
    .catch(() => alert('Copy failed — select the log text manually.'));
}

function toggleLog() {
  const log = document.getElementById('debugLog');
  const btn = event.target;
  if (log.style.display === 'none') { log.style.display = ''; btn.textContent = 'Hide'; }
  else { log.style.display = 'none'; btn.textContent = 'Show'; }
}

// ═══════════════════════════════════════════════════════════════
//  Opening Positions  (moves in UCI format; FEN computed at runtime)
// ═══════════════════════════════════════════════════════════════
const OPENINGS = [
  { name: "Ruy Lopez — Morphy Defense",
    moves: ['e2e4','e7e5','g1f3','b8c6','f1b5'],
    desc: "After 1.e4 e5 2.Nf3 Nc6 3.Bb5. Black should stake a claim in the center." },
  { name: "Italian Game — Classical",
    moves: ['e2e4','e7e5','g1f3','b8c6','f1c4'],
    desc: "After 1.e4 e5 2.Nf3 Nc6 3.Bc4. Black has several principled responses." },
  { name: "Giuoco Piano — Italian Center",
    moves: ['e2e4','e7e5','g1f3','b8c6','f1c4','f8c5'],
    desc: "After 1.e4 e5 2.Nf3 Nc6 3.Bc4 Bc5. White's classical central break." },
  { name: "Italian — Four Knights",
    moves: ['e2e4','e7e5','g1f3','b8c6','f1c4','g8f6','b1c3'],
    desc: "After 1.e4 e5 2.Nf3 Nc6 3.Bc4 Nf6 4.Nc3. Black's most principled reply?" },
  { name: "Sicilian — Open Variation",
    moves: ['e2e4','c7c5','g1f3','d7d6','d2d4'],
    desc: "After 1.e4 c5 2.Nf3 d6 3.d4. Black should recapture to open the c-file." },
  { name: "Sicilian Najdorf — Be3",
    moves: ['e2e4','c7c5','g1f3','d7d6','d2d4','c5d4','f3d4','g8f6','b1c3','a7a6'],
    desc: "After 1.e4 c5 2.Nf3 d6 3.d4 cxd4 4.Nxd4 Nf6 5.Nc3 a6. White's sharpest response?" },
  { name: "French Defense — Winawer",
    moves: ['e2e4','e7e6','d2d4','d7d5','b1c3','f8b4'],
    desc: "After 1.e4 e6 2.d4 d5 3.Nc3 Bb4. White must react to the pin on c3." },
  { name: "French Defense — Tarrasch",
    moves: ['e2e4','e7e6','d2d4','d7d5'],
    desc: "After 1.e4 e6 2.d4 d5. White avoids the main lines. Best development?" },
  { name: "Caro-Kann — Classical",
    moves: ['e2e4','c7c6','d2d4','d7d5','b1c3'],
    desc: "After 1.e4 c6 2.d4 d5 3.Nc3. Black's standard recapture in the center." },
  { name: "Queen's Gambit Declined",
    moves: ['d2d4','d7d5','c2c4','e7e6'],
    desc: "After 1.d4 d5 2.c4 e6. White's most classical developing move?" },
  { name: "Queen's Gambit Accepted",
    moves: ['d2d4','d7d5','c2c4','d5c4'],
    desc: "After 1.d4 d5 2.c4 dxc4. White must fight for the center immediately." },
  { name: "Nimzo-Indian Defense",
    moves: ['d2d4','g8f6','c2c4','e7e6','b1c3','f8b4'],
    desc: "After 1.d4 Nf6 2.c4 e6 3.Nc3 Bb4. How does White handle the pin?" },
  { name: "King's Indian Defense — Classical",
    moves: ['d2d4','g8f6','c2c4','g7g6','b1c3','f8g7','e2e4','d7d6','g1f3','e8g8'],
    desc: "After 1.d4 Nf6 2.c4 g6 3.Nc3 Bg7 4.e4 d6 5.Nf3 0-0. White's classical setup?" },
  { name: "Grünfeld Defense",
    moves: ['d2d4','g8f6','c2c4','g7g6','b1c3','d7d5'],
    desc: "After 1.d4 Nf6 2.c4 g6 3.Nc3 d5. How does White accept the challenge?" },
  { name: "English Opening — Symmetrical",
    moves: ['c2c4','c7c5','b1c3','b8c6'],
    desc: "After 1.c4 c5 2.Nc3 Nc6. White's most flexible continuing move?" },
  { name: "Scotch Game",
    moves: ['e2e4','e7e5','g1f3','b8c6','d2d4'],
    desc: "After 1.e4 e5 2.Nf3 Nc6 3.d4. Black's principled response to d4?" },
  { name: "Vienna Gambit",
    moves: ['e2e4','e7e5','b1c3','b8c6','f2f4'],
    desc: "After 1.e4 e5 2.Nc3 Nc6 3.f4. How should Black handle the gambit?" },
  { name: "Pirc Defense — Austrian Attack",
    moves: ['e2e4','d7d6','d2d4','g8f6','b1c3','g7g6','f2f4'],
    desc: "After 1.e4 d6 2.d4 Nf6 3.Nc3 g6 4.f4. Black's best setup?" },
  { name: "Scandinavian Defense — Main Line",
    moves: ['e2e4','d7d5','e4d5','d8d5','b1c3'],
    desc: "After 1.e4 d5 2.exd5 Qxd5 3.Nc3. The queen is attacked — where does it go?" },
  { name: "London System",
    moves: ['d2d4','d7d5','g1f3','g8f6','c1f4'],
    desc: "After 1.d4 d5 2.Nf3 Nf6 3.Bf4. Black's most active development plan?" },
  { name: "Slav Defense",
    moves: ['d2d4','d7d5','c2c4','c7c6'],
    desc: "After 1.d4 d5 2.c4 c6. White's most aggressive continuation?" },
  { name: "Dutch Defense — Stonewall",
    moves: ['d2d4','f7f5','c2c4','g8f6'],
    desc: "After 1.d4 f5 2.c4 Nf6. How does White fight for the center?" },
  { name: "Catalan Opening",
    moves: ['d2d4','d7d5','c2c4','e7e6','g2g3'],
    desc: "After 1.d4 d5 2.c4 e6 3.g3. Black's most solid response to the Catalan?" },
  { name: "Four Knights Game",
    moves: ['e2e4','e7e5','g1f3','b8c6','b1c3','g8f6'],
    desc: "After 1.e4 e5 2.Nf3 Nc6 3.Nc3 Nf6. White's most ambitious reply?" },
];

// ═══════════════════════════════════════════════════════════════
//  Stockfish Engine
// ═══════════════════════════════════════════════════════════════
let sf = null;
let bestMove = null;
let puzzleBestMove = null;
let analysisMode = 'puzzle';
let analyzing = false;
let engineReady = false;
let analysisFen = ''; // FEN that was sent to the engine — used to correctly flip cp sign
let dynamicBestMove = false; // true while "Show Best Move" infinite search is running

function initEngine() {
  try {
    sf = new Worker('stockfish.js');
    sf.onmessage = function(e) { onEngineMessage(e.data.trim()); };
    sf.onerror = function(e) { dbg('WORKER ERROR: ' + e.message); };
    sf.postMessage('uci');
  } catch (e) {
    dbg('INIT ERROR: ' + e.message);
  }
}

function onEngineMessage(msg) {
  if (msg === 'uciok') {
    sf.postMessage('isready');
    return;
  }

  if (msg === 'readyok') {
    engineReady = true;
    if (currentOpening) startAnalysis(puzzleFen);
    return;
  }

  if (msg.startsWith('info') && msg.includes('score')) {
    const depthM = msg.match(/depth (\d+)/);
    if (depthM) $('#depthBadge').text('depth ' + depthM[1]);

    const cpM   = msg.match(/score cp (-?\d+)/);
    const mateM = msg.match(/score mate (-?\d+)/);
    let rawCp = null;

    if (cpM) {
      rawCp = parseInt(cpM[1]);
    } else if (mateM) {
      const m = parseInt(mateM[1]);
      rawCp = m > 0 ? 30000 : -30000;
    }

    if (rawCp !== null) {
      const whiteCp = (analysisFen && new Chess(analysisFen).turn() === 'b') ? -rawCp : rawCp;
      updateEvalBar(whiteCp, mateM ? parseInt(mateM[1]) : null);
    }

    const pvM = msg.match(/\bpv ([a-h][1-8][a-h][1-8][qrbn]?)/);
    if (pvM) {
      if (!bestMove) $('#thinkDots').hide(); // first result — engine is no longer cold
      bestMove = pvM[1];
      if (analysisMode === 'puzzle') puzzleBestMove = pvM[1];
      if (dynamicBestMove) drawArrow(pvM[1].slice(0,2), pvM[1].slice(2,4));
    }
  }

  // bestmove arrives when we send "stop" (position transition) — use it to hide dots
  if (msg.startsWith('bestmove')) {
    analyzing = false;
    $('#thinkDots').hide();
    $('#depthBadge').text('');
  }
}

function startAnalysis(fen, mode) {
  if (!sf || !engineReady) return;
  dynamicBestMove = false; // cancel any active infinite search
  analysisFen = fen;
  analysisMode = mode || 'puzzle';
  analyzing = true;
  bestMove = null;
  $('#thinkDots').show();
  $('#depthBadge').text('');
  sf.postMessage('stop');
  sf.postMessage('position fen ' + fen);
  sf.postMessage('go infinite');
}

// ═══════════════════════════════════════════════════════════════
//  Eval Bar
// ═══════════════════════════════════════════════════════════════
function updateEvalBar(cp, mateNum) {
  const whiteRatio = 0.5 + 0.5 * Math.tanh(cp / 400);
  const whitePct = (whiteRatio * 100).toFixed(1);
  const blackPct = (100 - whiteRatio * 100).toFixed(1);

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
//  Game State
// ═══════════════════════════════════════════════════════════════
let game = null;
let board = null;
let currentOpening = null;
let origOpening = [];  // original opening moves — never modified after load
let fullLine = [];     // single rewritable line (opening context + user moves)
let puzzleIdx = 0;     // index in fullLine where the puzzle starts
let navIndex = 0;      // cursor into fullLine
let puzzleFen = '';    // FEN at puzzleIdx
let puzzleScored = false;
let score = { correct: 0, total: 0, streak: 0 };

function fenFromMoves(moves) {
  const g = new Chess();
  for (const m of moves) {
    g.move({ from: m.slice(0,2), to: m.slice(2,4), promotion: m[4] || 'q' });
  }
  return g.fen();
}

function fenAt(idx) { return fenFromMoves(fullLine.slice(0, idx)); }

function loadPuzzle() {
  let next;
  do { next = OPENINGS[Math.floor(Math.random() * OPENINGS.length)]; }
  while (next === currentOpening && OPENINGS.length > 1);
  currentOpening = next;

  origOpening = [...currentOpening.moves];
  fullLine = [...origOpening];
  puzzleIdx = origOpening.length;
  navIndex = puzzleIdx;
  puzzleScored = false;
  bestMove = null;
  puzzleBestMove = null;
  puzzleFen = fenFromMoves(origOpening);

  game = new Chess(puzzleFen);
  board.position(puzzleFen, false);
  boardFlipped = game.turn() === 'b';
  board.orientation(boardFlipped ? 'black' : 'white');
  $('#evalBar').toggleClass('flipped', boardFlipped);

  clearArrow();
  setLastMoveHighlight(origOpening);

  $('#openingName').text(currentOpening.name);
  $('#openingDesc').text(currentOpening.desc);
  updateTurnIndicator(game.turn());
  updateNavButtons();
  updatePuzzlePositionState();
  hideFeedback();
  updateScoreDisplay();
  updateEvalBar(0, null);
  startAnalysis(puzzleFen, 'puzzle');
}

// ═══════════════════════════════════════════════════════════════
//  Navigation
// ═══════════════════════════════════════════════════════════════
const NAV_ANIM_MS = 180;

let navQueue = [];
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

  // Hide the destination piece (chessboard.js already placed it there).
  const $dest = $(`[data-square="${toSq}"]`).find('img');
  $dest.css('opacity', 0);

  // Create a floating overlay piece we fully control for the animation.
  const $anim = $('<img>')
    .attr('src', pieceSrc)
    .css({
      position: 'fixed',
      left: from.left, top: from.top,
      width: from.size, height: from.size,
      zIndex: 9000,
      pointerEvents: 'none',
      transition: 'none'
    });
  $('body').append($anim);

  void $anim[0].offsetWidth; // force reflow before starting transition
  $anim.css({
    transition: `left ${NAV_ANIM_MS}ms ease, top ${NAV_ANIM_MS}ms ease`,
    left: to.left,
    top:  to.top
  });

  setTimeout(() => {
    $dest.css('opacity', 1);
    $anim.remove();
  }, NAV_ANIM_MS);
}

function processNavQueue() {
  if (navAnimating || navQueue.length === 0) return;
  const step = navQueue.shift();
  const next = navIndex + step;
  if (next < 0 || next > fullLine.length) { processNavQueue(); return; }

  // Determine the squares the piece travels between for this step.
  let fromSq, toSq;
  if (step === +1) {
    const mv = fullLine[next - 1]; // move being replayed
    fromSq = mv.slice(0, 2);
    toSq   = mv.slice(2, 4);
  } else {
    const mv = fullLine[navIndex - 1]; // move being un-done
    // Visual motion is the reverse: piece returns from dest back to source
    fromSq = mv.slice(2, 4);
    toSq   = mv.slice(0, 2);
  }

  // Capture piece src from the source square BEFORE board.position changes the DOM.
  const pieceSrc = $(`[data-square="${fromSq}"]`).find('img').attr('src') || '';

  navIndex = next;
  navAnimating = true;

  // Snap board to final state with NO built-in animation, then do our own.
  const fen = fenAt(navIndex);
  board.position(fen, false);
  animatePieceMove(fromSq, toSq, pieceSrc);

  clearArrow();
  clearSquareHighlights();
  if (navIndex > 0) {
    const last = fullLine[navIndex - 1];
    applyLastMove(last.slice(0, 2), last.slice(2, 4));
  }
  updateNavButtons();
  updatePuzzlePositionState();
  startAnalysis(fen, 'eval');

  setTimeout(() => { navAnimating = false; processNavQueue(); }, NAV_ANIM_MS);
}


function isTerminalPosition(idx) {
  const g = new Chess(fenAt(idx));
  return g.in_checkmate() || g.in_stalemate();
}

function updateNavButtons() {
  $('#navBack').prop('disabled', navIndex <= 0);
  $('#navForward').prop('disabled', navIndex >= fullLine.length);
  $('#hintBtn').prop('disabled', isTerminalPosition(navIndex));
}

// ═══════════════════════════════════════════════════════════════
//  Square Highlighting
// ═══════════════════════════════════════════════════════════════
function setLastMoveHighlight(moves) {
  clearSquareHighlights();
  if (!moves || moves.length === 0) return;
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
  // Always reflects puzzle turn — called once on loadPuzzle, not on navigation
  $('#turnChip').css('background', turn === 'w' ? '#f0ead6' : '#2a2a2a');
  $('#turnText').text(turn === 'w' ? 'White to move' : 'Black to move');
}

function updatePuzzlePositionState() {
  const atPuzzle = navIndex === puzzleIdx;
  $('#openingCard').toggleClass('browsing', !atPuzzle);
}

// ═══════════════════════════════════════════════════════════════
//  Board Interaction
// ═══════════════════════════════════════════════════════════════
let selectedSquare = null;

// Own drag implementation (chessboard.js drag is disabled via onDragStart returning false)
let dragFrom    = null;
let dragStartX  = 0, dragStartY = 0;
let dragActive  = false;
let mouseIsDown = false;
let $dragGhost  = null;
let $dragSrcImg = null;
const DRAG_THRESHOLD = 8;

function validPieceAt(square) {
  if (navIndex < puzzleIdx) return false;
  const g = new Chess(fenAt(navIndex));
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

  // Threshold crossed — lift piece into ghost
  dragActive = true;
  const sqSize = $('#board').width() / 8;
  $dragSrcImg = $(`[data-square="${dragFrom}"]`).find('img');
  $dragSrcImg.css('opacity', 0);
  $dragGhost = $('<img>')
    .attr('src', $dragSrcImg.attr('src'))
    .css({ position: 'fixed', width: sqSize, height: sqSize,
           left: e.clientX - sqSize / 2, top: e.clientY - sqSize / 2,
           zIndex: 9001, pointerEvents: 'none' })
    .appendTo('body');
});

$(document).on('mouseup', function(e) {
  mouseIsDown = false;
  if (!dragActive) {
    if (dragFrom) {
      const el = document.elementFromPoint(e.clientX, e.clientY);
      const upSquare = $(el).closest('[data-square]').attr('data-square');
      dbg(`MOUSEUP(no-drag)  dragFrom=${dragFrom}  upSquare=${upSquare}  sel=${selectedSquare}  sameSquare=${upSquare === dragFrom}`);
      if (upSquare !== dragFrom) {
        $('.sq-selected').removeClass('sq-selected');
        if (selectedSquare) $(`[data-square="${selectedSquare}"]`).addClass('sq-selected');
        dbg(`  → orphaned highlight cleared, restored sel=${selectedSquare}`);
      }
      // else: mousedown+mouseup same square — click will fire next, let it handle state
    } else {
      dbg(`MOUSEUP(no-drag)  dragFrom=null  sel=${selectedSquare}`);
    }
    dragFrom = null;
    return;
  }

  if ($dragGhost)  { $dragGhost.remove();  $dragGhost  = null; }
  if ($dragSrcImg) { $dragSrcImg.css('opacity', 1); $dragSrcImg = null; }

  const el     = document.elementFromPoint(e.clientX, e.clientY);
  const target = $(el).closest('[data-square]').attr('data-square');
  let moveSucceeded = false;
  if (target && target !== dragFrom) {
    moveSucceeded = performMove(dragFrom, target);
  }
  board.position(fenAt(navIndex), false);
  if (moveSucceeded) {
    selectedSquare = null;
    $('.sq-selected').removeClass('sq-selected');
  } else {
    // Invalid drop — keep piece selected so user can still click to move
    selectedSquare = dragFrom;
    $(`[data-square="${dragFrom}"]`).addClass('sq-selected');
  }
  dragFrom  = null;
  dragActive = false;
});

function performMove(source, target) {
  if (navIndex < puzzleIdx) return false; // opening review — navigate only
  const g = new Chess(fenAt(navIndex));
  const move = g.move({ from: source, to: target, promotion: 'q' });
  if (!move) return false;

  const userUci = source + target;
  const atPuzzlePos = (navIndex === puzzleIdx);

  fullLine = fullLine.slice(0, navIndex);
  fullLine.push(userUci);
  navIndex++;
  game = g;

  $('.sq-last-move').removeClass('sq-last-move');
  applyLastMove(source, target);
  updateNavButtons();
  updatePuzzlePositionState();

  if (atPuzzlePos) {
    if (analyzing || !puzzleBestMove) {
      waitForBestMove(userUci);
    } else {
      showOnBoardJudgment(userUci);
    }
    if (!puzzleScored) {
      puzzleScored = true;
      score.total++;
      if (analyzing || !puzzleBestMove) {
        waitForScore(userUci);
      } else {
        recordScore(userUci);
      }
    }
  } else {
    clearArrow();
    startAnalysis(g.fen(), 'eval');
  }

  return true;
}

function waitForBestMove(userUci) {
  const poll = setInterval(() => {
    if (puzzleBestMove) { clearInterval(poll); showOnBoardJudgment(userUci); }
  }, 200);
  setTimeout(() => clearInterval(poll), 6000);
}

function waitForScore(userUci) {
  const poll = setInterval(() => {
    if (puzzleBestMove) { clearInterval(poll); recordScore(userUci); }
  }, 200);
  setTimeout(() => {
    clearInterval(poll);
    if (!puzzleBestMove) showFeedback('info', 'Engine timed out.');
  }, 6000);
}

function showOnBoardJudgment(userUci) {
  const userTo = userUci.slice(2, 4);
  const correct = puzzleBestMove && userUci.slice(0,4) === puzzleBestMove.slice(0,4);
  clearArrow();
  if (correct) {
    drawBadge(userTo, 'correct');
  } else {
    if (puzzleBestMove) drawArrow(puzzleBestMove.slice(0,2), puzzleBestMove.slice(2,4));
    drawBadge(userTo, 'wrong');
  }
  startAnalysis(game.fen(), 'eval');
}

function recordScore(userUci) {
  const correct = puzzleBestMove && userUci.slice(0,4) === puzzleBestMove.slice(0,4);
  if (correct) {
    score.correct++;
    score.streak++;
    const correctSan = uciToSan(userUci, puzzleFen);
    showFeedback('correct', `✓ Correct! Engine's top choice is <strong>${correctSan}</strong>.`);
  } else {
    score.streak = 0;
    const bestSan = puzzleBestMove ? uciToSan(puzzleBestMove, puzzleFen) : '?';
    showFeedback('wrong', `✗ Best move was <strong>${bestSan}</strong>.`);
  }
  updateScoreDisplay();
}

function revealBestMove() {
  if (isTerminalPosition(navIndex)) return;
  const atPuzzle = (navIndex === puzzleIdx);

  if (atPuzzle && !puzzleScored) {
    // Pre-attempt reveal — count as wrong first
    if (!puzzleBestMove) { showFeedback('info', 'Engine is still thinking…'); return; }
    puzzleScored = true;
    score.total++;
    score.streak = 0;
    const bestSan = uciToSan(puzzleBestMove, puzzleFen);
    showFeedback('wrong', `✗ Best move was <strong>${bestSan}</strong>.`);
    updateScoreDisplay();
  }

  // Engine is already running go infinite — just enable the arrow and draw current best
  dynamicBestMove = true;
  if (bestMove) drawArrow(bestMove.slice(0,2), bestMove.slice(2,4));
}

// ═══════════════════════════════════════════════════════════════
//  Helpers
// ═══════════════════════════════════════════════════════════════
function uciToSan(uci, fen) {
  try {
    const tmp  = new Chess(fen);
    const from = uci.slice(0, 2);
    const to   = uci.slice(2, 4);
    const promo = uci.length > 4 ? uci[4] : undefined;
    const mv = tmp.move({ from, to, promotion: promo || 'q' });
    return mv ? mv.san : uci;
  } catch (_) { return uci; }
}

let boardFlipped = false;

function sqCenter(sq) {
  const files  = 'abcdefgh';
  const canvas = document.getElementById('arrowCanvas');
  const sqSize = canvas.width / 8;
  const fileIdx = files.indexOf(sq[0]);
  const rankIdx = parseInt(sq[1]) - 1;
  const x = boardFlipped ? (7 - fileIdx + 0.5) * sqSize : (fileIdx + 0.5) * sqSize;
  const y = boardFlipped ? (rankIdx + 0.5) * sqSize      : (7 - rankIdx + 0.5) * sqSize;
  return { x, y };
}

function drawBadge(sq, type) {
  const canvas = document.getElementById('arrowCanvas');
  const ctx    = canvas.getContext('2d');
  const sqSize = canvas.width / 8;
  const center = sqCenter(sq);
  const fontSize = sqSize * 0.38;
  const x = center.x + sqSize * 0.22;
  const y = center.y - sqSize * 0.22;

  ctx.font         = `bold ${Math.round(fontSize)}px Arial`;
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle    = type === 'correct' ? '#3ddc64' : '#ff4444';
  ctx.fillText(type === 'correct' ? '✓' : '✗', x, y);
}

function sizeArrowCanvas() {
  const boardEl = document.getElementById('board');
  const canvas  = document.getElementById('arrowCanvas');
  const w = boardEl.offsetWidth;
  const h = boardEl.offsetHeight;
  canvas.width  = w;
  canvas.height = h;
}

function clearArrow() {
  sizeArrowCanvas();
  const canvas = document.getElementById('arrowCanvas');
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
}

function drawArrow(fromSq, toSq) {
  const canvas = document.getElementById('arrowCanvas');
  sizeArrowCanvas();
  const ctx  = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const sqSize = canvas.width / 8;
  const from   = sqCenter(fromSq);
  const to     = sqCenter(toSq);
  const angle  = Math.atan2(to.y - from.y, to.x - from.x);

  const lineW   = sqSize * 0.18;
  const headW   = sqSize * 0.46;
  const headLen = headW * (Math.sqrt(3) / 2);
  const color   = 'rgba(100, 220, 90, 0.90)';

  // Tail starts 32% of a square away from source center (clears the piece)
  const tailX = from.x + Math.cos(angle) * sqSize * 0.32;
  const tailY = from.y + Math.sin(angle) * sqSize * 0.32;

  // Arrowhead tip lands at destination center
  const tipX = to.x;
  const tipY = to.y;

  // Body ends where arrowhead base begins
  const bodyEndX = tipX - Math.cos(angle) * headLen;
  const bodyEndY = tipY - Math.sin(angle) * headLen;

  ctx.save();
  ctx.fillStyle   = color;
  ctx.strokeStyle = color;

  // Shaft
  ctx.lineWidth = lineW;
  ctx.lineCap   = 'round';
  ctx.beginPath();
  ctx.moveTo(tailX, tailY);
  ctx.lineTo(bodyEndX, bodyEndY);
  ctx.stroke();

  // Equilateral arrowhead
  ctx.save();
  ctx.translate(tipX, tipY);
  ctx.rotate(angle);
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(-headLen,  headW / 2);
  ctx.lineTo(-headLen, -headW / 2);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  ctx.restore();
}

function showFeedback(type, html) {
  $('#feedback').attr('class', 'feedback ' + type).html(html);
}

function hideFeedback() {
  $('#feedback').attr('class', 'feedback');
}

function updateScoreDisplay() {
  $('#scoreDisplay').text(score.correct + ' / ' + score.total);
  $('#streakDisplay').text(score.streak > 1 ? '🔥 ' + score.streak + ' in a row' : '');
}

// ═══════════════════════════════════════════════════════════════
//  Init
// ═══════════════════════════════════════════════════════════════
$(document).ready(function () {
  game = new Chess();

  board = Chessboard('board', {
    draggable: false,
    position: 'start',
    pieceTheme: 'img/chesspieces/wikipedia/{piece}.png',
    moveSpeed: 180,
  });

  // Mousedown: start tracking for our own drag. No visual changes except square highlight.
  $('#board').on('mousedown', '.square-55d63', function(e) {
    if (e.which !== 1) return;
    mouseIsDown = true;
    const square = $(this).attr('data-square');
    const highlighted = $('.sq-selected').map(function(){ return $(this).attr('data-square'); }).get().join(',') || 'none';
    dbg(`MOUSEDOWN ${square}  sel=${selectedSquare}  highlighted=${highlighted}  validPiece=${validPieceAt(square)}`);
    if (!validPieceAt(square)) return;
    dragFrom   = square;
    dragStartX = e.clientX;
    dragStartY = e.clientY;
    dragActive = false;
    $('.sq-selected').removeClass('sq-selected');
    $(`[data-square="${square}"]`).addClass('sq-selected');
    dbg(`  → highlighted ${square}, sel still=${selectedSquare}`);
  });

  // Click: handles both first click (select) and second click (move destination)
  $('#board').on('click', '.square-55d63', function() {
    const square = $(this).attr('data-square');
    const highlighted = $('.sq-selected').map(function(){ return $(this).attr('data-square'); }).get().join(',') || 'none';
    dbg(`CLICK ${square}  sel=${selectedSquare}  highlighted=${highlighted}`);
    if (navIndex < puzzleIdx) return;

    if (selectedSquare === null) {
      if (!validPieceAt(square)) { dbg(`  → no valid piece, ignored`); return; }
      selectedSquare = square;
      dbg(`  → selected ${square}`);
    } else if (selectedSquare === square) {
      selectedSquare = null;
      $('.sq-selected').removeClass('sq-selected');
      dbg(`  → deselected`);
    } else {
      const from = selectedSquare;
      selectedSquare = null;
      $('.sq-selected').removeClass('sq-selected');
      if (performMove(from, square)) {
        board.position(fenAt(navIndex), false);
        dbg(`  → moved ${from}→${square}`);
      } else if (validPieceAt(square)) {
        selectedSquare = square;
        $(`[data-square="${square}"]`).addClass('sq-selected');
        dbg(`  → invalid move, reselected ${square}`);
      } else {
        dbg(`  → invalid move, deselected`);
      }
    }
  });

  $(window).resize(() => { board.resize(); sizeArrowCanvas(); });

  $(document).on('keydown', function(e) {
    if (e.key === 'ArrowLeft')  navBack();
    if (e.key === 'ArrowRight') navForward();
  });

  $('#openingCard').on('click', function() {
    if (navIndex === puzzleIdx && fullLine.length === puzzleIdx) return;
    fullLine = [...origOpening];
    navIndex = puzzleIdx;
    board.position(puzzleFen, false);
    clearArrow();
    setLastMoveHighlight(origOpening);
    updateNavButtons();
    updatePuzzlePositionState();
    startAnalysis(puzzleFen, 'eval');
  });

  initEngine();
  loadPuzzle();
});
