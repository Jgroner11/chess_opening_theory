#!/usr/bin/env node
// Generates line memorization puzzles for a given opening set and injects them into script.js.
// Usage:  node generate-memorization-puzzles.js <set-name>
//         node generate-memorization-puzzles.js <set-name> --clear
//
// Requires chess.js for UCI→SAN conversion:
//   npm install chess.js@0.12.0

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

// ── chess.js ──────────────────────────────────────────────────────────────────
// TODO: replace with chess.js once installed (npm install chess.js@0.12.0)
// const { Chess } = require('chess.js');
//
// function uciToSan(movesBefore, uci) {
//   const g = new Chess();
//   for (const m of movesBefore) g.move({ from: m.slice(0,2), to: m.slice(2,4), promotion: m[4] || 'q' });
//   const result = g.move({ from: uci.slice(0,2), to: uci.slice(2,4), promotion: uci[4] || 'q' });
//   return result ? result.san : uci;
// }

function uciToSan(movesBefore, uci) {
  // Fallback: return raw UCI until chess.js is wired up
  return uci;
}

// ── CLI dispatch ──────────────────────────────────────────────────────────────

const setName = process.argv[2];
const command = process.argv[3] || 'generate';

if (!setName || !OPENING_SETS[setName]) {
  console.error('Usage:');
  console.error('  node generate-memorization-puzzles.js <set-name>           # generate memorization puzzles');
  console.error('  node generate-memorization-puzzles.js <set-name> --clear   # remove all puzzles from set');
  console.error('Available sets: ' + Object.keys(OPENING_SETS).join(', '));
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

// ── Generate memorization puzzles ─────────────────────────────────────────────

const { name: setDisplayName, player, root } = OPENING_SETS[setName];
const playerColor = player === 'black' ? 'b' : 'w';

const generated = [];
for (let i = 0; i < root.length; i++) {
  const moveColor = i % 2 === 0 ? 'w' : 'b';
  if (moveColor !== playerColor) continue;

  const movesBefore = root.slice(0, i);
  const answer      = root[i];
  const moveNum     = Math.floor(i / 2) + 1;
  const san         = uciToSan(movesBefore, answer);
  const prefix      = player === 'black' ? `${moveNum}...` : `${moveNum}.`;

  generated.push({
    type:   'memorization',
    name:   `${setDisplayName} — ${prefix}${san}`,
    moves:  movesBefore,
    answer: answer,
    desc:   `What is ${player === 'black' ? 'Black' : 'White'}'s move ${moveNum} in the main line?`,
  });
}

// ── Inject into script.js ─────────────────────────────────────────────────────

// Deduplicate against existing puzzles
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
