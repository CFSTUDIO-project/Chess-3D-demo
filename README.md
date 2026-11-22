# VANTA — Premium 3D Chess

A browser-based chess game built with Three.js, chess.js and Stockfish 19 WASM. The project is designed as a static web application: no account, backend, API key or paid hosting is required.

## What is implemented

- Genuine Three.js/WebGL scene with a physical board, 64 separate square meshes, board thickness, lighting and shadow casting.
- Six individually modeled 3D piece types with separate light/dark materials.
- Legal chess movement and game state from `chess.js` 1.4.0: check, checkmate, stalemate, castling, en passant, promotion, repetition, fifty-/seventy-five-move conditions and insufficient material.
- Human vs Human pass-and-play on one device, with an optional private handover screen.
- Human vs Stockfish 19 with three real engine configurations. The engine receives the full UCI move history, calculates in a Web Worker and returns a UCI move that is checked against the chess rules engine before it is played.
- Easy: Stockfish strength limit around 1350 Elo, skill level 1, depth 8, approximately 550 ms search budget.
- Medium: strength limit around 1850 Elo, skill level 9, depth 12, approximately 1050 ms search budget.
- Hard: unrestricted Stockfish skill level 20, depth 16, approximately 1850 ms search budget.
- Touch and mouse selection, legal-destination indicators, tap-to-move and drag-to-move.
- Promotion chooser, undo/redo, move history, captured-piece/material display, PGN copy/export and local autosave/resume.
- Chess clock presets, increments, pause/resume, timeout result and a custom clock.
- Board themes, renderer quality, coordinate/hint switches, audio volume and gameplay preferences saved in localStorage.
- Original Web Audio UI/move tones. No third-party music or recorded game sounds are included.
- Responsive desktop and mobile layouts.

## Important chess-position detail

Standard chess always begins from the same official starting position. Rearranging the pieces at the start would be Chess960 (a different chess variant), not standard chess. VANTA keeps the standard setup and never fabricates a random board. The position changes through legal moves. Stockfish calculates from the actual board and complete move history; different human decisions naturally create different positions and different engine responses. Replaying the exact same move history at the same settings may produce the same best move, which is normal deterministic engine behavior—not a fake or random move.

## Requirements

- Node.js 20.19+ (Node.js 22 recommended)
- npm
- A modern browser with WebGL support

The Stockfish single-threaded WASM build is copied into `public/engines/` by the install script. The lite single-threaded build is used because it does not need cross-origin isolation headers. It is about 1.7 MB and is loaded only when a computer opponent is required.

## Run locally

```bash
npm install
npm run dev
```

Open the local URL printed by Vite. Do not open `index.html` directly as a `file://` URL; browser workers and module imports need a local web server.

## Test and build

```bash
npm test
npm run build
npm run preview
```

The rules test file checks the standard position, illegal-move rejection, castling, en passant, all four promotions, checkmate, stalemate, fifty-/seventy-five-move handling, fivefold repetition and insufficient material.

## GitHub Pages

1. Push this project to a GitHub repository.
2. Open **Settings → Pages** and choose **GitHub Actions** as the deployment source.
3. The included `.github/workflows/deploy.yml` installs dependencies, builds `dist/` and deploys it to Pages.
4. Open the Pages URL after the workflow succeeds.

`vite.config.js` uses a relative base path, so the build works from a project Pages URL as well as a root domain. The Stockfish engine files are copied by `postinstall` before the build.

## Controls

- Select a piece, then select one of its highlighted legal destinations.
- Or drag a piece to a destination square.
- Drag on the empty area around the board to orbit the camera; use a pinch/scroll gesture to zoom.
- Use **Flip board** to rotate the view to the opposite side.
- **Undo** reverses one move locally, or the human/engine pair in an engine game. **Redo** replays moves in their original order.
- **Export PGN** creates a portable move record. **Resume last match** restores the locally saved position and clock state; the clock stays paused after restoring.

## Scope and honesty notes

- Stockfish is an actual UCI engine, not a random-move routine. If the engine asset cannot load, the game shows an error and does not invent a response.
- The visual 3D models are procedurally generated from geometry in this source; there are no flat piece icons on the board.
- This version does not include online multiplayer, accounts, a server, an opening database, full chess-engine analysis variations, an interactive move-by-move tutorial, PGN import UI, or individually adjustable sound channels. Those are not represented as completed features.
- The clock switches automatically after each accepted move. The local private handover pauses the next player's clock until they confirm readiness.
- Browsers with WebGL disabled cannot display the 3D board. Use a current browser with hardware acceleration enabled.

## Project structure

```text
vanta-3d-chess/
├── index.html
├── package.json
├── vite.config.js
├── README.md
├── LICENSES.md
├── scripts/
│   └── copy-stockfish.mjs
├── public/
│   ├── engines/             # generated at npm install
│   └── licenses/            # Stockfish notices copied at npm install
├── src/
│   ├── main.js
│   ├── styles.css
│   ├── ai/StockfishEngine.js
│   ├── core/GameController.js
│   ├── core/GameClock.js
│   └── three/ChessScene.js
└── tests/chess-rules.test.mjs
```
