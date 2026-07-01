# Chess Opening Theory Trainer

A browser-based tool for studying chess opening theory through puzzles.
View the site via VS Code Live Server (`index.html`).

---

## Terminal Commands

All scripts run with Node.js from the project directory. No npm installs required.

### Generate memorization puzzles

Generates one puzzle for each of the target player's moves in the opening's root line and adds them to `script.js`. Safe to run multiple times — duplicates are skipped.

```
node generate-memorization-puzzles.js <set-name>
```

**Example:**
```
node generate-memorization-puzzles.js benoni
```

This adds puzzles like "Benoni Defense — Main Line — 1...Nf6", "...2...c5", etc.

---

### Clear all puzzles from a set

Removes every puzzle from the named set in `script.js`, leaving the set structure intact.

```
node generate-memorization-puzzles.js <set-name> --clear
```

**Example:**
```
node generate-memorization-puzzles.js benoni --clear
```

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
