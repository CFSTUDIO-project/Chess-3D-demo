import { Chess } from 'chess.js';
import { GameController } from './core/GameController.js';
import { GameClock, CLOCK_PRESETS, formatClock } from './core/GameClock.js';
import { StockfishEngine, DIFFICULTIES } from './ai/StockfishEngine.js';
import { ChessScene, PIECE_VALUES, THEMES } from './three/ChessScene.js';

const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
const PIECE_GLYPHS = { w:{k:'♔',q:'♕',r:'♖',b:'♗',n:'♘',p:'♙'}, b:{k:'♚',q:'♛',r:'♜',b:'♝',n:'♞',p:'♟︎'} };
const DEFAULT_SETTINGS = {
  theme:'walnut', quality:'high', coordinates:true, moveHints:true, sound:true,
  volume:35, privateHandover:true, animation:true, autoRotate:false, reducedMotion:false,
  compact:false, confirmNewGame:true, defaultDifficulty:'medium'
};

function loadSettings() {
  try {
    const value = JSON.parse(localStorage.getItem('vanta.settings') || '{}');
    return { ...DEFAULT_SETTINGS, ...value };
  } catch { return { ...DEFAULT_SETTINGS }; }
}

const settings = loadSettings();
const controller = new GameController();
const engine = new StockfishEngine();
let scene = null;
let lobbyScene = null;
let mode = 'ai';
let difficulty = settings.defaultDifficulty;
let humanColor = 'w';
let aiColor = 'b';
let players = { w:'White', b:'Black' };
let clockPreset = 'rapid10';
let selectedSquare = null;
let modalIsOpen = false;
let currentResult = null;
let waitingForEngine = false;
let waitingForReady = false;
let gameHasStarted = false;
let gameEpoch = 0;
let clockSnapshots = [];
let lastClockState = { w:600, b:600, active:'w', running:false, unlimited:false };
let toastTimer = 0;
let lastAutosaveAt = 0;
let activeSettingsTab = 'board';
let setupDraft = { mode:'ai', difficulty:'medium', color:'w', clock:'rapid10', whiteName:'White', blackName:'Black' };

const ui = {
  lobby:$('#lobbyView'), game:$('#gameView'), lobbyCanvas:$('#lobbyCanvas'), boardCanvas:$('#boardCanvas'),
  modalBackdrop:$('#modalBackdrop'), modalTitle:$('#modalTitle'), modalKicker:$('#modalKicker'), modalBody:$('#modalBody'), modalFooter:$('#modalFooter'),
  handover:$('#handoverOverlay'), handoverTitle:$('#handoverTitle'), handoverText:$('#handoverText'),
  toast:$('#toast'), thinking:$('#thinkingOverlay'), thinkingDetail:$('#thinkingDetail'), engineStatus:$('#engineStatus')
};

class AudioManager {
  constructor() { this.context = null; }
  play(kind = 'move') {
    if (!settings.sound || settings.volume <= 0) return;
    try {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) return;
      this.context ||= new AudioContextClass();
      if (this.context.state === 'suspended') this.context.resume();
      const now = this.context.currentTime;
      const config = {
        click:[520,.035,'sine'], move:[310,.07,'triangle'], capture:[145,.11,'sine'],
        check:[660,.09,'sine'], success:[720,.16,'sine'], error:[180,.08,'triangle'],
        menu:[440,.05,'sine']
      }[kind] || [340,.06,'sine'];
      const oscillator = this.context.createOscillator();
      const gain = this.context.createGain();
      oscillator.type = config[2];
      oscillator.frequency.setValueAtTime(config[0], now);
      if (kind === 'capture') oscillator.frequency.exponentialRampToValueAtTime(78, now + config[1]);
      if (kind === 'success') oscillator.frequency.exponentialRampToValueAtTime(940, now + config[1]);
      const volume = Math.max(.001, Math.min(1, settings.volume / 100)) * .075;
      gain.gain.setValueAtTime(volume, now);
      gain.gain.exponentialRampToValueAtTime(.001, now + config[1]);
      oscillator.connect(gain); gain.connect(this.context.destination);
      oscillator.start(now); oscillator.stop(now + config[1] + .01);
    } catch { /* Audio is optional; the chess game remains fully usable without it. */ }
  }
}
const audio = new AudioManager();

const clock = new GameClock({
  onTick: state => {
    lastClockState = state;
    renderClocks(state);
    if (gameHasStarted && !currentResult && Date.now() - lastAutosaveAt > 1400) saveAutosave();
  },
  onFlag: color => handleTimeout(color)
});

engine.setStatusHandler((state, detail) => {
  ui.engineStatus.className = `engine-pill ${state === 'ready' ? 'ready' : state === 'loading' ? 'loading' : ''}`;
  ui.engineStatus.innerHTML = `<i></i> ${state === 'ready' ? 'ENGINE READY' : state === 'loading' ? 'ENGINE LOADING' : state === 'error' ? 'ENGINE OFFLINE' : 'ENGINE STANDBY'}`;
  ui.engineStatus.title = detail;
  if (state === 'error') showToast(`AI unavailable: ${detail}`);
});
engine.setInfoHandler(info => {
  if (waitingForEngine && info.depth) {
    ui.thinkingDetail.textContent = `Searching depth ${info.depth} · ${formatNodes(info.nodes)} nodes`;
  }
});

function formatNodes(value) {
  if (!value) return '—';
  return value >= 1_000_000 ? `${(value/1_000_000).toFixed(1)}m` : value >= 1_000 ? `${(value/1_000).toFixed(0)}k` : String(value);
}
function saveSettings() { localStorage.setItem('vanta.settings', JSON.stringify(settings)); }
function showToast(message) {
  ui.toast.textContent = message;
  ui.toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => ui.toast.classList.remove('show'), 2600);
}
function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[char]));
}
function clockName(key) { return CLOCK_PRESETS[key]?.label || 'Custom'; }
function closeModal() {
  ui.modalBackdrop.classList.add('hidden');
  modalIsOpen = false;
  ui.modalBody.innerHTML = '';
  ui.modalFooter.innerHTML = '';
}
function openModal({ kicker='VANTA / CHESS', title, body='', footer='' }) {
  ui.modalKicker.textContent = kicker;
  ui.modalTitle.textContent = title;
  ui.modalBody.innerHTML = body;
  ui.modalFooter.innerHTML = footer;
  ui.modalBackdrop.classList.remove('hidden');
  modalIsOpen = true;
  audio.play('menu');
}
function addModalButton(label, action, kind = '') {
  const button = document.createElement('button');
  button.className = `modal-button ${kind}`;
  button.textContent = label;
  button.addEventListener('click', action);
  ui.modalFooter.appendChild(button);
  return button;
}

function ensureLobbyScene() {
  if (lobbyScene) return;
  try {
    lobbyScene = new ChessScene(ui.lobbyCanvas, { interactive:false, quality:'medium', coordinates:false });
    lobbyScene.setPosition(new Chess().board(), null, false);
    lobbyScene.controls.enabled = true;
    lobbyScene.controls.autoRotate = true;
    lobbyScene.controls.autoRotateSpeed = .42;
  } catch (error) {
    ui.lobbyCanvas.innerHTML = `<div class="modal-note">3D graphics are unavailable in this browser. The game rules and engine still require WebGL for the board view.</div>`;
    console.error(error);
  }
}

function enterGameView() {
  if (lobbyScene) { lobbyScene.dispose(); lobbyScene = null; }
  ui.lobby.classList.add('hidden');
  ui.game.classList.remove('hidden');
  try {
    scene?.dispose();
    scene = new ChessScene(ui.boardCanvas, {
      interactive:true,
      quality:settings.quality,
      coordinates:settings.coordinates,
      onSquare:(square, detail) => onBoardSquare(square, detail)
    });
    scene.applyTheme(settings.theme);
    scene.controls.autoRotate = Boolean(settings.autoRotate);
    scene.controls.autoRotateSpeed = .35;
    scene.setPosition(controller.board, null, false);
    scene.setOrientation(humanColor);
    refreshHighlights();
  } catch (error) {
    console.error(error);
    ui.boardCanvas.innerHTML = `<div class="modal-note">WebGL could not start. Enable hardware acceleration or use a browser with WebGL support.</div>`;
    showToast('3D board unavailable. Try another browser or enable WebGL.');
  }
  updateGameUI();
}

function returnToLobby() {
  gameEpoch += 1;
  engine.stop();
  waitingForEngine = false;
  ui.thinking.classList.add('hidden');
  ui.handover.classList.add('hidden');
  clock.pause();
  scene?.dispose(); scene = null;
  ui.game.classList.add('hidden');
  ui.lobby.classList.remove('hidden');
  ensureLobbyScene();
  refreshResumeButton();
}

function openSetupModal() {
  setupDraft = {
    mode, difficulty, color:humanColor, clock:clockPreset,
    whiteName:players.w || 'White', blackName:players.b || 'Black'
  };
  const body = `
    <div class="form-field"><span class="form-label">CHOOSE YOUR MATCH</span></div>
    <div class="option-grid" id="modeOptions">
      <button class="option-card ${setupDraft.mode === 'ai' ? 'selected' : ''}" data-mode="ai"><strong>Human vs Engine</strong><small>Play against Stockfish with three real search strengths.</small></button>
      <button class="option-card ${setupDraft.mode === 'local' ? 'selected' : ''}" data-mode="local"><strong>Two players</strong><small>Pass one device between two people. No network needed.</small></button>
    </div>
    <div class="form-grid" style="margin-top:18px">
      <div class="form-field ai-only"><label for="setupDifficulty">ENGINE STRENGTH</label><select id="setupDifficulty"><option value="easy">Easy · Developing</option><option value="medium">Medium · Balanced</option><option value="hard">Hard · Strong</option></select></div>
      <div class="form-field ai-only"><label for="setupColor">PLAY AS</label><select id="setupColor"><option value="w">White · Move first</option><option value="b">Black · Engine opens</option></select></div>
      <div class="form-field"><label for="setupClock">TIME CONTROL</label><select id="setupClock">${Object.entries(CLOCK_PRESETS).map(([key,preset]) => `<option value="${key}">${escapeHtml(preset.label)}</option>`).join('')}</select></div>
      <div class="form-field local-only"><label for="setupWhite">WHITE PLAYER</label><input id="setupWhite" maxlength="20" value="White" /></div>
      <div class="form-field local-only"><label for="setupBlack">BLACK PLAYER</label><input id="setupBlack" maxlength="20" value="Black" /></div>
    </div>
    <div class="form-grid" id="customClockFields" style="display:none">
      <div class="form-field"><label for="customMinutes">STARTING MINUTES</label><input id="customMinutes" type="number" min="1" max="180" value="10" /></div>
      <div class="form-field"><label for="customIncrement">INCREMENT / SECONDS</label><input id="customIncrement" type="number" min="0" max="60" value="0" /></div>
    </div>
    <p class="modal-note">The standard chess starting position is fixed by the rules. Every later position is created by legal moves played on this board; the engine evaluates the current position rather than choosing from a random move list.</p>
  `;
  openModal({ kicker:'MATCH CONFIGURATION', title:'Set the terms.', body });
  const modeOptions = $$('#modeOptions [data-mode]');
  const syncFields = () => {
    $$('.ai-only').forEach(el => el.style.display = setupDraft.mode === 'ai' ? '' : 'none');
    $$('.local-only').forEach(el => el.style.display = setupDraft.mode === 'local' ? '' : 'none');
    modeOptions.forEach(el => el.classList.toggle('selected', el.dataset.mode === setupDraft.mode));
  };
  modeOptions.forEach(button => button.addEventListener('click', () => { setupDraft.mode = button.dataset.mode; syncFields(); audio.play('click'); }));
  $('#setupDifficulty').value = setupDraft.difficulty;
  $('#setupColor').value = setupDraft.color;
  $('#setupClock').value = setupDraft.clock;
  $('#customClockFields').style.display = setupDraft.clock === 'custom' ? 'grid' : 'none';
  $('#setupWhite').value = setupDraft.whiteName || 'White';
  $('#setupBlack').value = setupDraft.blackName || 'Black';
  $('#setupClock').addEventListener('change', () => { $('#customClockFields').style.display = $('#setupClock').value === 'custom' ? 'grid' : 'none'; });
  syncFields();
  addModalButton('Cancel', closeModal);
  addModalButton('Start match', () => {
    setupDraft.difficulty = $('#setupDifficulty').value;
    setupDraft.color = $('#setupColor').value;
    setupDraft.clock = $('#setupClock').value;
    setupDraft.whiteName = $('#setupWhite')?.value.trim() || 'White';
    setupDraft.blackName = $('#setupBlack')?.value.trim() || 'Black';
    if (setupDraft.clock === 'custom') {
      setupDraft.customSeconds = Math.max(60, Math.min(10800, Number($('#customMinutes').value || 10) * 60));
      setupDraft.customIncrement = Math.max(0, Math.min(60, Number($('#customIncrement').value || 0)));
    }
    closeModal();
    startGame(setupDraft);
  }, 'primary');
}

function startGame(config = {}) {
  gameEpoch += 1;
  gameHasStarted = false;
  mode = config.mode || 'ai';
  difficulty = config.difficulty || settings.defaultDifficulty;
  humanColor = mode === 'ai' && config.color === 'b' ? 'b' : 'w';
  aiColor = humanColor === 'w' ? 'b' : 'w';
  clockPreset = config.clock || 'rapid10';
  const preset = CLOCK_PRESETS[clockPreset] || CLOCK_PRESETS.rapid10;
  const seconds = clockPreset === 'custom' ? config.customSeconds || 600 : preset.seconds;
  const increment = clockPreset === 'custom' ? config.customIncrement || 0 : preset.increment;
  players = mode === 'ai'
    ? { w:humanColor === 'w' ? (config.whiteName || 'You') : 'Stockfish', b:humanColor === 'b' ? (config.blackName || 'You') : 'Stockfish' }
    : { w:config.whiteName || 'White', b:config.blackName || 'Black' };
  engine.stop();
  controller.reset();
  if (config.pgn) {
    try { controller.loadPgn(config.pgn); } catch (error) { showToast(`Saved game could not be restored: ${error.message}`); controller.reset(); }
  }
  controller.clearRedo();
  selectedSquare = null;
  currentResult = null;
  waitingForEngine = false;
  waitingForReady = false;
  clockSnapshots = [];
  const clockSeconds = config.clockState && Object.hasOwn(config.clockState, 'baseSeconds') ? config.clockState.baseSeconds : seconds;
  const clockIncrement = config.clockState && Object.hasOwn(config.clockState, 'increment') ? config.clockState.increment : increment;
  clock.configure({ seconds:clockSeconds, increment:clockIncrement });
  if (config.clockState) {
    clock.restore({ ...config.clockState, running:false });
    clockSnapshots = Array.isArray(config.clockSnapshots) ? config.clockSnapshots : [];
    if (!clockSnapshots.length) clockSnapshots.push(clock.snapshot());
  } else {
    clock.start('w');
    clockSnapshots.push(clock.snapshot());
  }
  gameHasStarted = true;
  closeModal();
  ui.thinking.classList.add('hidden');
  enterGameView();
  $('#gameModeLabel').textContent = mode === 'ai' ? `HUMAN VS ENGINE / ${difficulty.toUpperCase()}` : 'LOCAL / TWO PLAYERS';
  $('#gameTitle').textContent = mode === 'ai' ? `Against Stockfish ${difficulty}` : 'A game between friends';
  $('#sideMode').textContent = mode === 'ai' ? 'ENGINE' : 'LOCAL';
  $('#sideClockPreset').textContent = `${clockName(clockPreset).toUpperCase()}${increment ? ` + ${increment}` : ''}`;
  $('#handoverOverlay').classList.add('hidden');
  updateGameUI();
  saveAutosave();
  if (mode === 'ai' && controller.turn === aiColor) maybeEngineTurn();
  else if (mode === 'ai') engine.initialize().catch(() => {});
  if (config.pgn) showToast('Saved match restored. The clock is paused; resume it when ready.');
  refreshResumeButton();
}

function getPieceAt(square) {
  const file = 'abcdefgh'.indexOf(square[0]);
  const row = 8 - Number(square[1]);
  return controller.board[row]?.[file] || null;
}

function onBoardSquare(square, { dragFrom = null } = {}) {
  if (!gameHasStarted || currentResult || waitingForEngine || waitingForReady || modalIsOpen) return;
  if (mode === 'ai' && controller.turn !== humanColor) return;
  if (dragFrom) {
    attemptMove(dragFrom, square);
    return;
  }
  const piece = getPieceAt(square);
  if (selectedSquare) {
    const choices = controller.legalMoves(selectedSquare).filter(move => move.to === square);
    if (choices.length) {
      if (choices.some(move => move.promotion)) openPromotionChooser(choices);
      else attemptMove(selectedSquare, square, null);
      return;
    }
  }
  if (piece && piece.color === controller.turn) {
    selectedSquare = selectedSquare === square ? null : square;
    audio.play('click');
    refreshHighlights();
    $('#boardHint').textContent = selectedSquare ? `LEGAL DESTINATIONS FOR ${square.toUpperCase()}` : 'SELECT A PIECE TO BEGIN';
  } else {
    selectedSquare = null;
    refreshHighlights();
    showToast('That square is not a legal destination.');
  }
}

function attemptMove(from, to, promotion = null, fromEngine = false) {
  if (!from || !to || from === to || currentResult) return false;
  const legal = controller.legalMoves(from).filter(move => move.to === to);
  if (!legal.length) {
    selectedSquare = null;
    refreshHighlights();
    showToast('Illegal move. Only legal chess moves are accepted.');
    audio.play('error');
    return false;
  }
  if (legal.some(move => move.promotion) && !promotion) {
    openPromotionChooser(legal);
    return false;
  }
  const mover = controller.turn;
  const clockBeforeMove = clock.snapshot();
  const result = controller.move(from, to, promotion);
  if (!result.ok) {
    showToast(result.error || 'Move rejected by the chess rules engine.');
    return false;
  }
  clockSnapshots.push(clockBeforeMove);
  clock.onMove(mover);
  selectedSquare = null;
  const move = result.move;
  if (scene) scene.setPosition(controller.board, move, settings.animation);
  audio.play(move.captured ? 'capture' : 'move');
  const status = controller.status();
  if (status.type === 'check') audio.play('check');
  if (mode === 'local' && settings.autoRotate) scene?.setOrientation(controller.turn);
  updateGameUI();
  saveAutosave();
  if (status.done) {
    finishGame(status.text, status.type);
    return true;
  }
  refreshResumeButton();
  if (mode === 'local' && settings.privateHandover && !fromEngine) {
    showHandover();
  } else if (mode === 'ai' && controller.turn === aiColor) {
    maybeEngineTurn();
  }
  return true;
}

function openPromotionChooser(choices) {
  const color = controller.turn;
  const promotions = ['q','r','b','n'];
  const body = `<p class="modal-note" style="margin-top:-10px">A pawn has reached the final rank. Choose the piece it becomes under the rules of chess.</p><div class="promotion-options">${promotions.map(type => `<button class="promotion-choice" data-promotion="${type}"><b>${PIECE_GLYPHS[color][type]}</b><small>${({q:'QUEEN',r:'ROOK',b:'BISHOP',n:'KNIGHT'})[type]}</small></button>`).join('')}</div>`;
  openModal({ kicker:'PROMOTION', title:'Choose your piece.', body });
  $$('.promotion-choice').forEach(button => button.addEventListener('click', () => {
    const promotion = button.dataset.promotion;
    const move = choices[0];
    closeModal();
    attemptMove(move.from, move.to, promotion);
  }));
  addModalButton('Cancel', closeModal);
}

async function maybeEngineTurn() {
  const epoch = gameEpoch;
  if (mode !== 'ai' || controller.turn !== aiColor || currentResult || waitingForEngine) return;
  waitingForEngine = true;
  scene && (scene.interactive = false);
  scene && (scene.controls.enabled = false);
  ui.thinking.classList.remove('hidden');
  ui.thinkingDetail.textContent = `Stockfish ${DIFFICULTIES[difficulty]?.label || 'Medium'} is evaluating this position`;
  updateGameUI();
  try {
    const moveHistory = controller.history.map(move => `${move.from}${move.to}${move.promotion || ''}`);
    const uci = await engine.bestMove(controller.fen, difficulty, moveHistory);
    if (epoch !== gameEpoch) return;
    if (!uci || currentResult) {
      waitingForEngine = false;
      ui.thinking.classList.add('hidden');
      scene && (scene.interactive = true);
      scene && (scene.controls.enabled = true);
      if (!currentResult && controller.status().done) finishGame(controller.status().text, controller.status().type);
      return;
    }
    const from = uci.slice(0,2);
    const to = uci.slice(2,4);
    const promotion = uci[4] || null;
    const legal = controller.legalMoves(from).some(move => move.to === to && (!move.promotion || move.promotion === promotion));
    if (!legal) throw new Error(`The engine returned an invalid move (${uci}). The move was not played.`);
    waitingForEngine = false;
    ui.thinking.classList.add('hidden');
    scene && (scene.interactive = true);
    scene && (scene.controls.enabled = true);
    attemptMove(from, to, promotion, true);
  } catch (error) {
    if (epoch !== gameEpoch) return;
    waitingForEngine = false;
    clock.pause();
    ui.thinking.classList.add('hidden');
    scene && (scene.interactive = true);
    scene && (scene.controls.enabled = true);
    console.error(error);
    openModal({
      kicker:'ENGINE UNAVAILABLE', title:'The opponent did not load.',
      body:`<p class="modal-note" style="font-size:12px;color:#c7bfaf">${escapeHtml(error.message || 'Stockfish failed to start.')}</p><p class="modal-note">No substitute or random move will be played. The computer match is paused until the real engine can load.</p>`
    });
    addModalButton('Return to lounge', () => { closeModal(); returnToLobby(); });
    addModalButton('Switch to two players', () => { closeModal(); startGame({ mode:'local', clock:clockPreset, whiteName:'White', blackName:'Black' }); }, 'primary');
  }
}

function refreshHighlights() {
  if (!scene) return;
  const moves = selectedSquare ? controller.legalMoves(selectedSquare) : [];
  const targets = settings.moveHints ? [...new Set(moves.map(move => move.to))] : [];
  const last = controller.history.at(-1);
  scene.setHighlights({
    selected:selectedSquare,
    targets,
    lastMove:last ? { from:last.from, to:last.to } : null,
    checkSquare:controller.currentCheckSquare()
  });
}

function renderClocks(state = lastClockState) {
  const topColor = scene?.orientation === 'b' ? 'w' : 'b';
  const bottomColor = topColor === 'w' ? 'b' : 'w';
  const top = $('#topClock');
  const bottom = $('#bottomClock');
  if (!top || !bottom) return;
  top.textContent = formatClock(state[topColor]);
  bottom.textContent = formatClock(state[bottomColor]);
  top.classList.toggle('active-clock', state.active === topColor && state.running);
  bottom.classList.toggle('active-clock', state.active === bottomColor && state.running);
  if (state[topColor] != null && state[topColor] <= 15) top.classList.add('low-time'); else top.classList.remove('low-time');
  if (state[bottomColor] != null && state[bottomColor] <= 15) bottom.classList.add('low-time'); else bottom.classList.remove('low-time');
  const pause = $('#pauseClockButton');
  if (pause) pause.textContent = state.running ? 'PAUSE CLOCK' : 'RESUME CLOCK';
}

function updateGameUI() {
  const turn = controller.turn;
  const status = controller.status();
  const history = controller.history;
  const topColor = scene?.orientation === 'b' ? 'w' : 'b';
  const bottomColor = topColor === 'w' ? 'b' : 'w';
  $('#topPlayerName').textContent = players[topColor];
  $('#bottomPlayerName').textContent = players[bottomColor];
  $('#topPlayerRole').textContent = mode === 'ai' && topColor === aiColor ? `STOCKFISH / ${difficulty.toUpperCase()}` : topColor === 'w' ? 'WHITE PLAYER' : 'BLACK PLAYER';
  $('#bottomPlayerRole').textContent = mode === 'ai' && bottomColor === aiColor ? `STOCKFISH / ${difficulty.toUpperCase()}` : bottomColor === 'w' ? 'WHITE PLAYER' : 'BLACK PLAYER';
  $('#turnName').textContent = status.done ? (currentResult?.title || status.text) : `${players[turn]} to move`;
  $('#turnSubtext').textContent = status.type === 'check' ? 'The king is in check.' : waitingForEngine ? 'The engine is calculating a legal continuation.' : mode === 'ai' && turn === aiColor ? 'Computer is thinking.' : mode === 'local' ? 'Make your move, then pass the device.' : 'Choose a piece and a legal destination.';
  $('#turnIndicator').classList.toggle('black-turn', turn === 'b');
  $('#turnIndex').textContent = String(Math.floor(history.length / 2) + 1).padStart(2,'0');
  $('#statusText').textContent = currentResult?.text || status.text;
  $('#boardHint').textContent = selectedSquare ? `LEGAL DESTINATIONS FOR ${selectedSquare.toUpperCase()}` : waitingForEngine ? 'ENGINE SEARCH IN PROGRESS' : 'SELECT A PIECE TO BEGIN';
  $('#moveCount').textContent = `MOVE ${String(Math.floor(history.length / 2) + 1).padStart(2,'0')}`;
  $('#sideMode').textContent = mode === 'ai' ? `AI / ${difficulty.toUpperCase()}` : 'LOCAL';
  $('#undoButton').disabled = history.length === 0;
  $('#redoButton').disabled = controller.redoStack.length === 0;
  $('#turnName').classList.toggle('check-text', status.type === 'check');
  const topCaptured = controller.capturedBy(topColor);
  const bottomCaptured = controller.capturedBy(bottomColor);
  $('#topCaptured').innerHTML = topCaptured.map(piece => `<span>${PIECE_GLYPHS[piece.color][piece.type]}</span>`).join('');
  $('#bottomCaptured').innerHTML = bottomCaptured.map(piece => `<span>${PIECE_GLYPHS[piece.color][piece.type]}</span>`).join('');
  const material = controller.material();
  $('#whiteAdvantage').textContent = material.w > material.b ? `+${material.w-material.b}` : '—';
  $('#blackAdvantage').textContent = material.b > material.w ? `+${material.b-material.w}` : '—';
  const whiteTaken = controller.capturedBy('b').map(piece => PIECE_GLYPHS[piece.color][piece.type]);
  const blackTaken = controller.capturedBy('w').map(piece => PIECE_GLYPHS[piece.color][piece.type]);
  $('#whiteMaterial').textContent = whiteTaken.join(' ');
  $('#blackMaterial').textContent = blackTaken.join(' ');
  renderMoveList(history);
  renderClocks(lastClockState);
  refreshHighlights();
}

function renderMoveList(history) {
  const list = $('#moveList');
  if (!history.length) { list.innerHTML = '<div class="empty-history">Your game begins with the first move.</div>'; return; }
  const rows = [];
  for (let index = 0; index < history.length; index += 2) {
    const white = history[index];
    const black = history[index + 1];
    const row = document.createElement('div');
    row.className = 'move-row';
    const number = document.createElement('span'); number.className = 'move-number'; number.textContent = `${Math.floor(index/2)+1}.`;
    const whiteNotation = document.createElement('span'); whiteNotation.className = 'move-notation'; whiteNotation.textContent = white?.san || ''; whiteNotation.title = white?.lan || '';
    if (index === history.length - 1) whiteNotation.classList.add('current');
    const blackNotation = document.createElement('span'); blackNotation.className = 'move-notation'; blackNotation.textContent = black?.san || ''; blackNotation.title = black?.lan || '';
    if (index + 1 === history.length - 1) blackNotation.classList.add('current');
    row.append(number, whiteNotation, blackNotation);
    rows.push(row);
  }
  list.replaceChildren(...rows);
  list.scrollTop = list.scrollHeight;
}

function showHandover() {
  const next = controller.turn;
  ui.handoverTitle.textContent = `Pass to ${players[next]}.`;
  ui.handoverText.textContent = `${players[next]} to move. The board is hidden until the next player is ready.`;
  ui.handover.classList.remove('hidden');
  waitingForReady = true;
  clock.pause();
}

function readyToPlay() {
  if (!waitingForReady) return;
  waitingForReady = false;
  ui.handover.classList.add('hidden');
  clock.resume();
  audio.play('menu');
  updateGameUI();
}

function finishGame(text, type = 'finished') {
  if (currentResult) return;
  currentResult = { text, type, title:type === 'checkmate' ? 'Checkmate.' : type === 'timeout' ? 'Time expired.' : type === 'resignation' ? 'Resignation.' : type === 'draw' || type.includes('draw') ? 'The game is drawn.' : 'Game complete.' };
  clock.pause();
  saveAutosave();
  refreshResumeButton();
  engine.stop();
  waitingForEngine = false;
  ui.thinking.classList.add('hidden');
  scene && (scene.controls.enabled = false);
  updateGameUI();
  audio.play(type === 'checkmate' ? 'success' : 'menu');
  const body = `<p class="modal-note" style="font-size:12px;color:#c7bfaf">${escapeHtml(text)}</p><p class="modal-note">The final position and move record are preserved. You can review the game or begin another match.</p>`;
  openModal({ kicker:'MATCH COMPLETE', title:currentResult.title, body });
  addModalButton('Return to lounge', () => { closeModal(); returnToLobby(); });
  addModalButton('New game', () => { closeModal(); openSetupModal(); }, 'primary');
}

function handleTimeout(color) {
  const winner = color === 'w' ? 'Black' : 'White';
  const winnerColor = color === 'w' ? 'b' : 'w';
  if (controller.isInsufficientMaterial || !controller.canPossiblyMate(winnerColor)) finishGame('Draw — the player who flagged cannot be checkmated with the available material.', 'draw');
  else finishGame(`${winner} wins on time.`, 'timeout');
}

function offerDraw() {
  if (currentResult) return;
  if (controller.canClaimDraw()) {
    finishGame(`Draw claimed by the ${controller.turn === 'w' ? 'White' : 'Black'} player under the ${controller.isThreefoldRepetition ? 'threefold repetition' : 'fifty-move'} rule.`, 'draw');
    return;
  }
  if (mode === 'ai') {
    showToast('No draw claim is currently available. A rules-based draw can be claimed when its conditions are met.');
    return;
  }
  const opponent = players[controller.turn === 'w' ? 'b' : 'w'];
  openModal({ kicker:'DRAW OFFER', title:'Offer a draw?', body:`<p class="modal-note" style="font-size:12px;color:#c7bfaf">${escapeHtml(players[controller.turn])} offers a draw to ${escapeHtml(opponent)}. The game ends only if the other player accepts.</p>` });
  addModalButton('Decline', () => { closeModal(); showToast('Draw offer declined.'); });
  addModalButton('Accept draw', () => { closeModal(); finishGame('Draw by agreement.', 'draw'); }, 'primary');
}

function resign() {
  if (currentResult) return;
  const color = controller.turn;
  const winner = color === 'w' ? 'Black' : 'White';
  openModal({ kicker:'CONFIRM RESIGNATION', title:'Leave the game?', body:`<p class="modal-note" style="font-size:12px;color:#c7bfaf">${escapeHtml(players[color])} resigns. ${escapeHtml(winner)} will be recorded as the winner.</p>` });
  addModalButton('Keep playing', closeModal);
  addModalButton('Resign', () => { closeModal(); finishGame(`${winner} wins by resignation.`, 'resignation'); }, 'danger');
}

function undoMove() {
  if (currentResult || waitingForEngine || waitingForReady) return;
  let count = mode === 'ai' && controller.history.length >= 2 ? 2 : 1;
  let undone = false;
  while (count-- > 0) {
    const move = controller.undo();
    if (!move) break;
    undone = true;
    const snapshot = clockSnapshots.pop();
    if (snapshot) clock.restore(snapshot);
  }
  if (!undone) return;
  selectedSquare = null;
  currentResult = null;
  ui.thinking.classList.add('hidden');
  scene && (scene.interactive = true);
  scene && (scene.controls.enabled = true);
  scene?.setPosition(controller.board, null, false);
  const last = controller.history.at(-1);
  scene?.setHighlights({ lastMove:last ? { from:last.from, to:last.to } : null, checkSquare:controller.currentCheckSquare() });
  updateGameUI();
  saveAutosave();
  showToast('Move undone.');
}

function redoMove() {
  if (currentResult || waitingForEngine || waitingForReady) return;
  const move = controller.redo();
  if (!move) return;
  clockSnapshots.push(clock.snapshot());
  clock.onMove(move.color);
  scene?.setPosition(controller.board, move, settings.animation);
  updateGameUI();
  saveAutosave();
  const status = controller.status();
  if (status.done) finishGame(status.text, status.type);
  else if (mode === 'ai' && controller.turn === aiColor) maybeEngineTurn();
}

function saveAutosave() {
  try {
    lastAutosaveAt = Date.now();
    localStorage.setItem('vanta.autosave', JSON.stringify({
      pgn:controller.pgn, fen:controller.fen, mode, difficulty, humanColor, players, clockPreset,
      clockState:clock.snapshot(), clockSnapshots, completed:Boolean(currentResult), updatedAt:Date.now()
    }));
  } catch { /* Storage can be disabled; gameplay is not dependent on it. */ }
}


function refreshResumeButton() {
  let button = $('#resumeGameButton');
  if (!button) {
    button = document.createElement('button');
    button.id = 'resumeGameButton';
    button.className = 'text-button resume-button';
    button.innerHTML = 'Resume last match <span>↗</span>';
    $('.lobby-actions')?.appendChild(button);
    button.addEventListener('click', resumeSavedGame);
  }
  try {
    const saved = JSON.parse(localStorage.getItem('vanta.autosave') || 'null');
    button.classList.toggle('hidden', !saved?.pgn || saved.completed);
  } catch { button.classList.add('hidden'); }
}

function resumeSavedGame() {
  try {
    const saved = JSON.parse(localStorage.getItem('vanta.autosave') || 'null');
    if (!saved?.pgn || saved.completed) { showToast('There is no unfinished saved match.'); return; }
    startGame({
      mode:saved.mode, difficulty:saved.difficulty, color:saved.humanColor, clock:saved.clockPreset,
      whiteName:saved.players?.w, blackName:saved.players?.b, pgn:saved.pgn,
      clockState:saved.clockState, clockSnapshots:saved.clockSnapshots
    });
  } catch (error) { showToast(`Could not resume the saved game: ${error.message}`); }
}

function exportPgn() {
  if (!controller.history.length) { showToast('There are no moves to export yet.'); return; }
  const pgn = controller.pgn;
  const blob = new Blob([pgn], { type:'application/x-chess-pgn;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = `vanta-game-${new Date().toISOString().slice(0,10)}.pgn`;
  anchor.click(); URL.revokeObjectURL(url);
  showToast('PGN exported.');
}

async function copyPgn() {
  if (!controller.history.length) { showToast('No move record to copy yet.'); return; }
  try { await navigator.clipboard.writeText(controller.pgn); showToast('PGN copied to clipboard.'); }
  catch { showToast('Clipboard is unavailable in this browser. Use Export PGN instead.'); }
}

function openNewGame() {
  if (settings.confirmNewGame && controller.history.length && !currentResult) {
    openModal({ kicker:'NEW MATCH', title:'Start over?', body:'<p class="modal-note" style="font-size:12px;color:#c7bfaf">The current match will be ended. Its PGN can be exported before starting again.</p>' });
    addModalButton('Continue current game', closeModal);
    addModalButton('New game', () => { closeModal(); openSetupModal(); }, 'primary');
  } else openSetupModal();
}

function openSettings() {
  activeSettingsTab = 'board';
  renderSettings();
}

function renderSettings() {
  const tabs = [ ['board','BOARD'], ['graphics','GRAPHICS'], ['audio','AUDIO'], ['game','GAMEPLAY'] ];
  const content = {
    board:`
      <div class="setting-row"><span>Board material</span><select id="settingTheme">${Object.keys(THEMES).map(key => `<option value="${key}">${({walnut:'Classic Walnut',obsidian:'Obsidian',marble:'Marble',ivory:'Ivory & Ebony',tournament:'Tournament'})[key]}</option>`).join('')}</select></div>
      <div class="setting-row"><span>Board coordinates</span><input id="settingCoordinates" type="checkbox" /></div>
      <div class="setting-row"><span>Legal move indicators</span><input id="settingHints" type="checkbox" /></div>
      <div class="setting-row"><span>Rotate for active player</span><input id="settingAutoRotate" type="checkbox" /></div>
      <div class="setting-row"><span>Piece animation</span><input id="settingAnimation" type="checkbox" /></div>
      <p class="modal-note">All moves remain governed by the same chess rules regardless of board appearance or camera angle.</p>`,
    graphics:`
      <div class="setting-row"><span>Rendering quality</span><select id="settingQuality"><option value="low">Low · Battery friendly</option><option value="medium">Medium</option><option value="high">High</option></select></div>
      <div class="setting-row"><span>Reduced motion</span><input id="settingReducedMotion" type="checkbox" /></div>
      <p class="modal-note">The renderer caps pixel ratio for mobile performance. Lower quality reduces antialiasing and shadow cost; it does not change chess calculations.</p>`,
    audio:`
      <div class="setting-row"><span>Sound effects</span><input id="settingSound" type="checkbox" /></div>
      <div class="setting-row"><span>Effect volume</span><input id="settingVolume" type="range" min="0" max="100" step="1" /></div>
      <button class="modal-button" id="testSound" style="margin-top:14px">TEST SOUND</button>
      <p class="modal-note">Sounds are generated locally with the Web Audio API. No external soundtrack or copyrighted recording is used.</p>`,
    game:`
      <div class="setting-row"><span>Private turn handover</span><input id="settingHandover" type="checkbox" /></div>
      <div class="setting-row"><span>Confirm new game</span><input id="settingConfirm" type="checkbox" /></div>
      <div class="setting-row"><span>Default engine difficulty</span><select id="settingDifficulty"><option value="easy">Easy</option><option value="medium">Medium</option><option value="hard">Hard</option></select></div>
      <button class="modal-button" id="clearSave" style="margin-top:14px">CLEAR LOCAL SAVE</button>
      <p class="modal-note">Preferences and the last game record are stored in this browser only. No account or remote database is used.</p>`
  }[activeSettingsTab];
  const body = `<div class="settings-tabs">${tabs.map(([id,label]) => `<button class="settings-tab ${activeSettingsTab === id ? 'active' : ''}" data-tab="${id}">${label}</button>`).join('')}</div><div class="settings-list">${content}</div>`;
  openModal({ kicker:'PREFERENCES', title:'Make it yours.', body });
  $$('.settings-tab').forEach(button => button.addEventListener('click', () => { activeSettingsTab = button.dataset.tab; renderSettings(); }));
  $('#settingTheme') && ($('#settingTheme').value = settings.theme);
  $('#settingCoordinates') && ($('#settingCoordinates').checked = settings.coordinates);
  $('#settingHints') && ($('#settingHints').checked = settings.moveHints);
  $('#settingAutoRotate') && ($('#settingAutoRotate').checked = settings.autoRotate);
  $('#settingAnimation') && ($('#settingAnimation').checked = settings.animation);
  $('#settingQuality') && ($('#settingQuality').value = settings.quality);
  $('#settingReducedMotion') && ($('#settingReducedMotion').checked = settings.reducedMotion || false);
  $('#settingSound') && ($('#settingSound').checked = settings.sound);
  $('#settingVolume') && ($('#settingVolume').value = settings.volume);
  $('#settingHandover') && ($('#settingHandover').checked = settings.privateHandover);
  $('#settingConfirm') && ($('#settingConfirm').checked = settings.confirmNewGame);
  $('#settingDifficulty') && ($('#settingDifficulty').value = settings.defaultDifficulty);

  $('#settingTheme')?.addEventListener('change', event => { settings.theme = event.target.value; scene?.applyTheme(settings.theme); saveSettings(); });
  $('#settingCoordinates')?.addEventListener('change', event => { settings.coordinates = event.target.checked; scene?.setCoordinates(settings.coordinates); saveSettings(); });
  $('#settingHints')?.addEventListener('change', event => { settings.moveHints = event.target.checked; refreshHighlights(); saveSettings(); });
  $('#settingAutoRotate')?.addEventListener('change', event => { settings.autoRotate = event.target.checked; if (scene && mode === 'local') scene.setOrientation(controller.turn); saveSettings(); });
  $('#settingAnimation')?.addEventListener('change', event => { settings.animation = event.target.checked; saveSettings(); });
  $('#settingQuality')?.addEventListener('change', event => { settings.quality = event.target.value; scene?.setQuality(settings.quality); saveSettings(); });
  $('#settingReducedMotion')?.addEventListener('change', event => { settings.reducedMotion = event.target.checked; settings.animation = !settings.reducedMotion; saveSettings(); });
  $('#settingSound')?.addEventListener('change', event => { settings.sound = event.target.checked; saveSettings(); });
  $('#settingVolume')?.addEventListener('input', event => { settings.volume = Number(event.target.value); saveSettings(); });
  $('#settingHandover')?.addEventListener('change', event => { settings.privateHandover = event.target.checked; saveSettings(); });
  $('#settingConfirm')?.addEventListener('change', event => { settings.confirmNewGame = event.target.checked; saveSettings(); });
  $('#settingDifficulty')?.addEventListener('change', event => { settings.defaultDifficulty = event.target.value; saveSettings(); });
  $('#testSound')?.addEventListener('click', () => audio.play('move'));
  $('#clearSave')?.addEventListener('click', () => {
    localStorage.removeItem('vanta.autosave');
    showToast('Saved game data cleared. Preferences remain intact.');
  });
  ui.modalFooter.innerHTML = '';
  addModalButton('Done', closeModal, 'primary');
}


function openAbout() {
  const body = `
    <p class="modal-note" style="font-size:12px;color:#c7bfaf">VANTA is a focused chess room: a real chess rules engine, a three-dimensional board and a local computer opponent. It runs in your browser without an account or game server.</p>
    <div class="side-label" style="margin-top:18px">BUILD INFORMATION</div>
    <div class="settings-list">
      <div class="setting-row"><span>Application</span><strong>VANTA 3D Chess</strong></div>
      <div class="setting-row"><span>Version</span><strong>1.0.0</strong></div>
      <div class="setting-row"><span>Rules</span><strong>chess.js 1.4.0</strong></div>
      <div class="setting-row"><span>3D renderer</span><strong>Three.js 0.187.0</strong></div>
      <div class="setting-row"><span>Computer opponent</span><strong>Stockfish 19 WASM</strong></div>
    </div>
    <p class="modal-note">Stockfish is distributed under GPL-3.0. Three.js is MIT-licensed and chess.js is BSD-2-Clause. Full third-party notices and source links are included in LICENSES.md.</p>
    <p class="modal-note">Game positions, preferences and the saved PGN remain in this browser's local storage. No account or remote game database is used.</p>`;
  openModal({ kicker:'ABOUT THE APPLICATION', title:'Quietly competitive.', body });
  addModalButton('Close', closeModal, 'primary');
}

function openRules() {
  const body = `
    <div class="rules-tabs"> <div class="side-label">THE OBJECTIVE</div>
      <p class="modal-note" style="font-size:12px;color:#c7bfaf">Checkmate the opposing king. A king is in check when it is attacked; checkmate occurs when the player has no legal move that removes the check.</p>
      <div class="side-label" style="margin-top:18px">THE SIX PIECES</div>
      <div class="rules-piece-grid">
        ${[['♙','Pawn','One square forward; two from its starting square. Captures diagonally. En passant and promotion are supported.'],['♖','Rook','Any number of empty squares horizontally or vertically.'],['♘','Knight','Moves in an L shape and can jump over pieces.'],['♗','Bishop','Any number of empty squares diagonally.'],['♕','Queen','Any number of empty squares in a straight or diagonal line.'],['♔','King','One square in any direction, never into check. Castling is a special king move.']].map(([icon,name,desc]) => `<div class="rule-piece"><b>${icon}</b><div><strong>${name}</strong><small>${desc}</small></div></div>`).join('')}
      </div>
      <div class="side-label" style="margin-top:18px">SPECIAL RULES & DRAW CONDITIONS</div>
      <p class="modal-note">Castling requires the king and rook to have retained their rights, clear squares, and safe king path. En passant is available immediately after an opposing pawn advances two squares past a capturing pawn. A pawn reaching the last rank promotes to a queen, rook, bishop, or knight. Stalemate, insufficient material, threefold repetition, the fifty-move claim, fivefold repetition, and the seventy-five-move rule are handled by the rules controller and chess.js.</p>
    </div>`;
  openModal({ kicker:'FIELD NOTES / CHESS', title:'The rules, plainly.', body });
  addModalButton('Understood', closeModal, 'primary');
}

function setupEventListeners() {
  $('#playButton').addEventListener('click', openSetupModal);
  $('#rulesButton').addEventListener('click', openRules);
  $('#aboutButton').addEventListener('click', openAbout);
  $('#brandHome').addEventListener('click', returnToLobby);
  $('#backToMenu').addEventListener('click', returnToLobby);
  $('#settingsButton').addEventListener('click', openSettings);
  $('#modalClose').addEventListener('click', closeModal);
  ui.modalBackdrop.addEventListener('click', event => { if (event.target === ui.modalBackdrop) closeModal(); });
  $('#readyButton').addEventListener('click', readyToPlay);
  $('#flipButton').addEventListener('click', () => { scene?.flipBoard(); updateGameUI(); audio.play('click'); });
  $('#fullscreenButton').addEventListener('click', async () => {
    try {
      if (!document.fullscreenElement) await document.documentElement.requestFullscreen();
      else await document.exitFullscreen();
    } catch { showToast('Fullscreen is not available in this browser.'); }
  });
  $('#undoButton').addEventListener('click', undoMove);
  $('#redoButton').addEventListener('click', redoMove);
  $('#newGameButton').addEventListener('click', openNewGame);
  $('#resignButton').addEventListener('click', resign);
  $('#drawButton').addEventListener('click', offerDraw);
  $('#savePgnButton').addEventListener('click', exportPgn);
  $('#copyPgnButton').addEventListener('click', copyPgn);
  $('#pauseClockButton').addEventListener('click', () => {
    if (clock.running) clock.pause(); else clock.resume();
    audio.play('click');
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && modalIsOpen) closeModal();
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z' && !modalIsOpen) { event.preventDefault(); undoMove(); }
  });
  window.addEventListener('beforeunload', () => { scene?.dispose(); lobbyScene?.dispose(); engine.terminate(); clock.dispose(); });
}

setupEventListeners();
ensureLobbyScene();
refreshResumeButton();

