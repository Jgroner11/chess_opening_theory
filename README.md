# Chess Opening Theory Trainer

A browser-based tool for studying chess opening theory through puzzles.
View the site via VS Code Live Server (`index.html`).

---

## Puzzle Data

Opening sets live in `data/<set-name>.json` as `{ name, player, root, puzzles }`:

- `name` — display name shown on the index card and puzzle screen.
- `player` — `"white"` or `"black"`, whose side the puzzles quiz.
- `root` — the reference main line, as UCI moves.
- `puzzles` — generated puzzle entries (see **Puzzle Types** below).

`data/sets.json` is a manifest listing which set files exist (e.g. `["benoni"]`) — `index.html` reads it to build the opening cards, so a new set needs an entry here in addition to its own `data/<set-name>.json`. Everything else on a card (name, root, color, puzzle count) is pulled directly from the set's data — no need to touch `index.html`.

`script.js` loads the active set at runtime via `data/<set-name>.json`, selected with `?set=<set-name>` in the URL.

---

## Generating Puzzles

Puzzles are generated with Python scripts that call the same Lichess Cloud Eval API the frontend's "Ask Lichess" button and analysis board use (falling back to a local Stockfish engine for positions Lichess hasn't cached).

**Setup:**
```
conda create -n chess python=3.14 -y
conda activate chess
conda install -c conda-forge chess requests -y
```

### Line memorization puzzles

Walks a set's root line and creates one puzzle per target-player move, quizzing recall of the book continuation.

```
python generate_memorization_puzzles.py <set-name>
python generate_memorization_puzzles.py <set-name> --clear   # remove memorization puzzles from the set
```

### Variation puzzles

Walks a set's root line and, at each opponent move, asks Lichess for alternative moves the opponent could have played instead (excluding the book move) — then finds the target player's best response to each deviation.

```
python generate_variation_puzzles.py <set-name>
python generate_variation_puzzles.py <set-name> --clear   # remove variation puzzles from the set
```

**Common flags (both scripts):**

| Flag         | Meaning                                                                 |
|--------------|--------------------------------------------------------------------------|
| `--engine`   | Path to a local UCI engine binary (e.g. Stockfish), used when a position isn't in Lichess's cloud eval cache |
| `--depth`    | Search depth for the local engine fallback (default 20)                 |
| `--sleep`    | Seconds between Lichess requests (default 1.0)                          |
| `-v` / `--verbose` | Print eval source/detail for each position                        |

**Variation-only flag:**

| Flag         | Meaning                                                                 |
|--------------|--------------------------------------------------------------------------|
| `--per-ply`  | Max deviation puzzles generated per opponent move (default 3)           |

`--clear` on either script only removes that script's own puzzle type, leaving the other type intact — both scripts write into the same `puzzles` array.

---

## Available Opening Sets

| Set name | Display name    | Player |
|----------|------------------|--------|
| `benoni` | Benoni Defense   | Black  |

---

## Puzzle Types

Every puzzle has `{ type, moves, bestMove, eval }`: `moves` are the UCI moves to reach the puzzle position, `bestMove` is the correct answer, `eval` is `{ cp, mate }` (white-relative) for the position after `bestMove` is played.

| Type            | Description                                                                 |
|-----------------|-----------------------------------------------------------------------------|
| `memorization`  | The position is a subposition of the root line. Find the next move in the line. |
| `variation`     | The opponent deviated from the line at some point. Find the best engine response. |
