#!/usr/bin/env node
// Generates line memorization puzzles for a given opening set and injects them into script.js.
// Usage:  node generate-puzzles.js <set-name>
// No dependencies — runs with plain Node.js.

const fs   = require('fs');
const path = require('path');

// ── Opening set definitions (mirrors OPENING_SETS in script.js) ──────────────
const OPENING_SETS = {
  benoni: {
    name:   'Benoni Defense — Main Line',
    player: 'black',
    root:   ['d2d4','g8f6','c2c4','c7c5','d4d5','e7e6','b1c3','e6d5','c4d5','d7d6','g1f3','g7g6'],
  },
};

// ── Minimal chess engine (UCI → SAN, no external deps) ───────────────────────

const FILES = 'abcdefgh';
const RANKS = '12345678';
const sq    = (f, r) => FILES[f] + RANKS[r];
const fc    = s => FILES.indexOf(s[0]);
const rc    = s => RANKS.indexOf(s[1]);
const onB   = (f, r) => f >= 0 && f < 8 && r >= 0 && r < 8;

function startPos() {
  const board = {};
  const back  = ['R','N','B','Q','K','B','N','R'];
  for (let f = 0; f < 8; f++) {
    board[sq(f,0)] = 'w' + back[f];
    board[sq(f,1)] = 'wP';
    board[sq(f,6)] = 'bP';
    board[sq(f,7)] = 'b' + back[f];
  }
  return { board, turn: 'w', ep: null };
}

// Squares a piece on `from` can move to (pseudo-legal — ignores pins)
function reachable(board, from, ep) {
  const piece = board[from];
  if (!piece) return [];
  const [color, type] = [piece[0], piece[1]];
  const f = fc(from), r = rc(from);
  const out = [];

  const slide = (df, dr) => {
    let cf = f+df, cr = r+dr;
    while (onB(cf,cr)) {
      out.push(sq(cf,cr));
      if (board[sq(cf,cr)]) break;
      cf+=df; cr+=dr;
    }
  };
  const step = (df, dr) => { if (onB(f+df,r+dr)) out.push(sq(f+df,r+dr)); };

  if (type === 'P') {
    const dir = color === 'w' ? 1 : -1;
    const startR = color === 'w' ? 1 : 6;
    if (onB(f,r+dir)   && !board[sq(f,r+dir)])                               out.push(sq(f,r+dir));
    if (r === startR   && !board[sq(f,r+dir)] && !board[sq(f,r+2*dir)])      out.push(sq(f,r+2*dir));
    for (const df of [-1,1]) {
      if (onB(f+df,r+dir) && (board[sq(f+df,r+dir)] || sq(f+df,r+dir) === ep)) out.push(sq(f+df,r+dir));
    }
  } else if (type === 'N') {
    for (const [df,dr] of [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]]) step(df,dr);
  } else if (type === 'B') {
    for (const [df,dr] of [[-1,-1],[-1,1],[1,-1],[1,1]]) slide(df,dr);
  } else if (type === 'R') {
    for (const [df,dr] of [[-1,0],[1,0],[0,-1],[0,1]]) slide(df,dr);
  } else if (type === 'Q') {
    for (const [df,dr] of [[-1,-1],[-1,1],[1,-1],[1,1],[-1,0],[1,0],[0,-1],[0,1]]) slide(df,dr);
  } else if (type === 'K') {
    for (const [df,dr] of [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]]) step(df,dr);
  }

  // Filter out own-piece destinations
  return out.filter(s => !board[s] || board[s][0] !== color);
}

function applyUci(pos, uci) {
  const from  = uci.slice(0,2), to = uci.slice(2,4);
  const promo = uci[4] ? uci[4].toUpperCase() : null;
  const board = { ...pos.board };
  const piece = board[from];
  const color = piece[0], type = piece[1];
  let newEp = null;

  // En passant capture
  if (type === 'P' && to === pos.ep) {
    const dir = color === 'w' ? -1 : 1;
    delete board[sq(fc(to), rc(to)+dir)];
  }
  // Castling — move rook
  if (type === 'K') {
    if (from==='e1'&&to==='g1') { board['f1']='wR'; delete board['h1']; }
    if (from==='e1'&&to==='c1') { board['d1']='wR'; delete board['a1']; }
    if (from==='e8'&&to==='g8') { board['f8']='bR'; delete board['h8']; }
    if (from==='e8'&&to==='c8') { board['d8']='bR'; delete board['a8']; }
  }
  // Pawn double push sets ep square
  if (type === 'P' && Math.abs(rc(to)-rc(from)) === 2) {
    newEp = sq(fc(from), (rc(from)+rc(to))/2);
  }

  delete board[from];
  board[to] = promo ? color+promo : piece;
  return { board, turn: color==='w'?'b':'w', ep: newEp };
}

function isAttacked(board, square, byColor) {
  for (const [s, p] of Object.entries(board)) {
    if (p[0] !== byColor) continue;
    // Use attack squares — for pawns use diagonal only
    const [color, type] = [p[0], p[1]];
    if (type === 'P') {
      const dir = color==='w' ? 1 : -1;
      const f = fc(s), r = rc(s);
      if (sq(f-1,r+dir)===square || sq(f+1,r+dir)===square) return true;
      continue;
    }
    if (reachable(board, s, null).includes(square)) return true;
  }
  return false;
}

function isInCheck(board, color) {
  const king = Object.keys(board).find(s => board[s] === color+'K');
  return king ? isAttacked(board, king, color==='w'?'b':'w') : false;
}

function uciToSan(pos, uci) {
  const from  = uci.slice(0,2), to = uci.slice(2,4);
  const promo = uci[4] ? uci[4].toUpperCase() : null;
  const piece = pos.board[from];
  const color = piece[0], type = piece[1];
  const capture = !!(pos.board[to]) || (type==='P' && to===pos.ep);

  // Castling
  if (type === 'K' && Math.abs(fc(to)-fc(from)) === 2) {
    const base = fc(to) > fc(from) ? 'O-O' : 'O-O-O';
    const next = applyUci(pos, uci);
    return base + (isInCheck(next.board, next.turn) ? '+' : '');
  }

  let san = '';

  if (type === 'P') {
    if (capture) san += from[0] + 'x';
    san += to;
    if (promo) san += '=' + promo;
  } else {
    san += type;
    // Disambiguation: other same-type pieces that can reach `to`
    const alts = Object.keys(pos.board).filter(s =>
      s !== from &&
      pos.board[s] === piece &&
      reachable(pos.board, s, pos.ep).includes(to)
    );
    if (alts.length > 0) {
      const sameFile = alts.some(s => fc(s) === fc(from));
      const sameRank = alts.some(s => rc(s) === rc(from));
      if (!sameFile)       san += from[0];
      else if (!sameRank)  san += from[1];
      else                 san += from;
    }
    if (capture) san += 'x';
    san += to;
  }

  const next = applyUci(pos, uci);
  if (isInCheck(next.board, next.turn)) san += '+';
  return san;
}

function replayMoves(moves) {
  let pos = startPos();
  for (const uci of moves) pos = applyUci(pos, uci);
  return pos;
}

// ── CLI dispatch ──────────────────────────────────────────────────────────────

const setName = process.argv[2];
const command = process.argv[3] || 'generate';
const validSets = Object.keys(OPENING_SETS).join(', ');

if (!setName || !OPENING_SETS[setName]) {
  console.error('Usage:');
  console.error('  node generate-memorization-puzzles.js <set-name>           # generate memorization puzzles');
  console.error('  node generate-memorization-puzzles.js <set-name> --clear   # remove all puzzles from set');
  console.error('Available sets: ' + validSets);
  process.exit(1);
}

// ── Shared: find puzzles array in script.js ───────────────────────────────────

const scriptPath = path.join(__dirname, 'script.js');
let src = fs.readFileSync(scriptPath, 'utf8');

const setStart = src.indexOf(`OPENING_SETS['${setName}']`);
if (setStart === -1) { console.error(`Set '${setName}' not found in script.js`); process.exit(1); }

const puzzlesKeyIdx = src.indexOf('puzzles:', setStart);
if (puzzlesKeyIdx === -1) { console.error(`No 'puzzles:' field in '${setName}'`); process.exit(1); }

const arrStart = src.indexOf('[', puzzlesKeyIdx);
let depth = 0, arrEnd = -1;
for (let i = arrStart; i < src.length; i++) {
  if (src[i] === '[') depth++;
  else if (src[i] === ']') { if (--depth === 0) { arrEnd = i; break; } }
}
if (arrEnd === -1) { console.error('Could not find closing ] for puzzles array'); process.exit(1); }

// ── --clear ───────────────────────────────────────────────────────────────────

if (command === '--clear') {
  const existing = src.slice(arrStart + 1, arrEnd).trim();
  if (!existing) {
    console.log(`'${setName}' already has no puzzles.`);
    process.exit(0);
  }
  fs.writeFileSync(scriptPath, src.slice(0, arrStart) + '[]' + src.slice(arrEnd + 1), 'utf8');
  console.log(`Cleared all puzzles from '${setName}'.`);
  process.exit(0);
}

// ── generate memorization puzzles ─────────────────────────────────────────────

const { name: setDisplayName, player, root } = OPENING_SETS[setName];
const playerColor = player === 'black' ? 'b' : 'w';

const generated = [];
for (let i = 0; i < root.length; i++) {
  const moveColor = i % 2 === 0 ? 'w' : 'b';
  if (moveColor !== playerColor) continue;

  const movesBefore = root.slice(0, i);
  const answer      = root[i];
  const moveNum     = Math.floor(i / 2) + 1;
  const pos         = replayMoves(movesBefore);
  const san         = uciToSan(pos, answer);
  const prefix      = player === 'black' ? `${moveNum}...` : `${moveNum}.`;

  generated.push({
    type:   'memorization',
    name:   `${setDisplayName} — ${prefix}${san}`,
    moves:  movesBefore,
    answer: answer,
    desc:   `What is ${player === 'black' ? "Black" : "White"}'s move ${moveNum} in the main line?`,
  });
}

// ── Inject into script.js ─────────────────────────────────────────────────────

// Parse existing entries to deduplicate
const existingStr = src.slice(arrStart + 1, arrEnd);
const existingKeys = new Set();
{
  let d = 0, start = -1;
  for (let i = 0; i < existingStr.length; i++) {
    if (existingStr[i] === '{') { if (d===0) start=i; d++; }
    else if (existingStr[i] === '}') {
      if (--d === 0 && start !== -1) {
        const entry = existingStr.slice(start, i+1);
        const mMatch = /moves:\s*(\[[^\]]*\])/.exec(entry);
        const aMatch = /answer:\s*"([^"]+)"/.exec(entry) || /answer:\s*'([^']+)'/.exec(entry);
        if (mMatch && aMatch) existingKeys.add(mMatch[1].replace(/\s/g,'') + '|' + aMatch[1]);
        start = -1;
      }
    }
  }
}

const toAdd = generated.filter(p => {
  const key = JSON.stringify(p.moves).replace(/\s/g,'') + '|' + p.answer;
  return !existingKeys.has(key);
});

if (toAdd.length === 0) { console.log('All puzzles already present — nothing to add.'); process.exit(0); }

function serializePuzzle(p) {
  return [
    `    {`,
    `      type:   ${JSON.stringify(p.type)},`,
    `      name:   ${JSON.stringify(p.name)},`,
    `      moves:  ${JSON.stringify(p.moves)},`,
    `      answer: ${JSON.stringify(p.answer)},`,
    `      desc:   ${JSON.stringify(p.desc)},`,
    `    }`,
  ].join('\n');
}

const existingContent = existingStr.trim();
const newEntries = toAdd.map(serializePuzzle).join(',\n');
const newArr = existingContent
  ? `[\n${existingContent},\n${newEntries},\n  ]`
  : `[\n${newEntries},\n  ]`;

fs.writeFileSync(scriptPath, src.slice(0, arrStart) + newArr + src.slice(arrEnd + 1), 'utf8');
console.log(`Added ${toAdd.length} memorization puzzle(s) to '${setName}':`);
toAdd.forEach(p => console.log(`  ${p.name}`));
