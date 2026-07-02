# Chess Opening Theory Trainer

A browser-based tool for studying chess opening theory through puzzles.
View the site via VS Code Live Server (`index.html`).

---

## Puzzle Data

Opening sets live in `data/<set-name>.json` as `{ name, player, root, puzzles }`. Puzzles are generated algorithmically by a Python script (TBD) and written into these JSON files — `script.js` loads them at runtime via `?set=<set-name>`.

---

## Available Opening Sets

| Set name | Display name            | Player |
|----------|-------------------------|--------|
| `benoni` | Benoni Defense — Main Line | Black  |

---

## Puzzle Types

| Type            | Description                                                                 |
|-----------------|-----------------------------------------------------------------------------|
| `memorization`  | The position is a subposition of the root line. Find the next move in the line. |
| `variation`     | The opponent deviated from the line at some point. Find the best engine response (sourced from the Lichess cloud eval API). |
