# Third-party licenses and notices

- **Three.js 0.187.0** — MIT License. Source: https://github.com/mrdoob/three.js
- **chess.js 1.4.0** — BSD 2-Clause License. Source: https://github.com/jhlywa/chess.js
- **Stockfish.js 19.0.1 (lite, single-threaded WebAssembly)** — GNU General Public License version 3.0 (GPL-3.0). The engine is distributed by the `stockfish` npm package maintained by Nathan Rugg and contributors. Source: https://github.com/nmrugg/stockfish.js
- **Stockfish chess engine** — GNU GPL v3. Upstream project: https://github.com/official-stockfish/Stockfish

The `postinstall` script copies the Stockfish engine's own `Copying.txt` and `AUTHORS` notices from the installed npm package into `public/licenses/` when those files are present. The corresponding `.js` and `.wasm` engine files are copied unmodified into `public/engines/`.

Stockfish is copyleft software. Before redistributing a built application containing the engine, preserve the GPL notices and make the corresponding source code and applicable build scripts available in accordance with GPL-3.0. The VANTA application code is provided as an independent project; this file does not relicense any third-party component.
