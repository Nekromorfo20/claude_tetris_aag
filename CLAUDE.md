# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A vanilla Tetris implementation: HTML5 Canvas + CSS + JavaScript (ES6+). No dependencies, no `package.json`, no build step, no test suite.

## Running the game

No install/build required. Either open `index.html` directly, or serve it with any static server:

```bash
python3 -m http.server 8000
# or
npx serve .
```

There is no lint/test/build command in this repo — verify changes by opening the game in a browser.

## Architecture

Everything lives in three files that cooperate:

- `index.html` — DOM structure: `<canvas id="board">` (300×600, i.e. `COLS × BLOCK` by `ROWS × BLOCK`), a `<canvas id="next-canvas">` for the next-piece preview, HUD elements (`#score`, `#lines`, `#level`), and the pause/game-over `#overlay`.
- `style.css` — dark/retro arcade look; no JS-driven theming beyond toggling `.hidden` on the overlay.
- `game.js` — all game logic, single file, no modules, runs in global scope on `DOMContentLoaded`-less top-level `init()` call at the bottom.

### Core model (`game.js`)

- `board`: a `ROWS × COLS` matrix; each cell is `0` (empty) or a 1–7 color index.
- `PIECES`: the 7 tetrominoes as square matrices; `current`/`next` pieces carry `{ type, shape, x, y }`.
- `rotateCW(shape)`: rotation via transpose + row reverse (no separate matrices per orientation).
- `collide(shape, ox, oy)`: bounds + overlap check against `board`, used before every move/rotate/drop.
- `tryRotate()`: rotates then applies wall kicks by testing offsets `[0, -1, 1, -2, 2]` until one doesn't collide.
- `lockPiece()` → `merge()` writes the piece into `board`, `clearLines()` removes full rows (scored via `LINE_SCORES` × `level`), then `spawn()` promotes `next` to `current` and generates a new `next`; if the freshly spawned piece immediately collides, `endGame()` fires.
- `loop(ts)`: `requestAnimationFrame`-driven; accumulates elapsed time in `dropAccum` and advances the piece once it exceeds `dropInterval`. `dropInterval` shrinks as `level` increases (`max(100, 1000 - (level-1)*90)`), and `level` increases every 10 cleared lines.
- `draw()`: clears and redraws grid, locked board, ghost piece (`ghostY()` projects the landing row, drawn at `alpha=0.2`), then the current piece.
- Input is a single `keydown` listener switching on `e.code` (arrows, `KeyX` for rotate, `Space` for hard drop, `KeyP` for pause) — pause/game-over states short-circuit all input except unpause.

Tunable constants at the top of `game.js`: `COLS`, `ROWS`, `BLOCK`, `COLORS`, `LINE_SCORES`, initial `dropInterval`. If `COLS`/`ROWS`/`BLOCK` change, update the `#board` canvas `width`/`height` in `index.html` to match.

## Language note

The README and in-code comments are in Spanish; keep new comments/UI text consistent with that unless told otherwise.
