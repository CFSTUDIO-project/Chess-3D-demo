const DIFFICULTIES = {
  easy:   { label:'Easy',   elo:1350, skill:1,  depth:8,  moveTime:550 },
  medium: { label:'Medium', elo:1850, skill:9,  depth:12, moveTime:1050 },
  hard:   { label:'Hard',   elo:null, skill:20, depth:16, moveTime:1850 }
};

export class StockfishEngine {
  constructor() {
    this.worker = null;
    this.ready = false;
    this.initializing = null;
    this.searching = false;
    this.pendingResolve = null;
    this.pendingReject = null;
    this.readyWaiters = [];
    this.initialResolve = null;
    this.initialReject = null;
    this.onStatus = () => {};
    this.onInfo = () => {};
    this.timeoutId = null;
  }

  setStatusHandler(callback) { this.onStatus = callback; }
  setInfoHandler(callback) { this.onInfo = callback; }

  async initialize() {
    if (this.ready) return true;
    if (this.initializing) return this.initializing;
    this.initializing = new Promise((resolve, reject) => {
      this.initialResolve = resolve;
      this.initialReject = reject;
      try {
        const engineUrl = `${import.meta.env.BASE_URL}engines/stockfish-19-lite-single.js`;
        this.worker = new Worker(engineUrl);
        this.timeoutId = window.setTimeout(() => {
          this.fail(new Error('Stockfish did not respond within 20 seconds.'));
        }, 20000);
        this.worker.onmessage = event => this.handleMessage(String(event.data ?? '').trim());
        this.worker.onerror = error => this.fail(error instanceof Error ? error : new Error('The Stockfish worker could not be loaded.'));
        this.worker.postMessage('uci');
        this.onStatus('loading', 'Loading Stockfish 19 WASM…');
      } catch (error) {
        this.fail(error);
      }
    });
    return this.initializing;
  }

  handleMessage(line) {
    if (!line) return;
    if (line === 'uciok') {
      this.worker?.postMessage('setoption name Threads value 1');
      this.worker?.postMessage('setoption name Hash value 32');
      this.worker?.postMessage('isready');
      return;
    }
    if (line === 'readyok') {
      this.ready = true;
      if (this.timeoutId) clearTimeout(this.timeoutId);
      this.timeoutId = null;
      if (this.initialResolve) {
        this.initialResolve(true);
        this.initialResolve = null;
        this.initialReject = null;
        this.initializing = null;
        this.onStatus('ready', 'Stockfish 19 · Lite WASM');
      }
      const waiter = this.readyWaiters.shift();
      waiter?.resolve(true);
      return;
    }
    if (line.startsWith('info ')) {
      const depth = Number(line.match(/\bdepth (\d+)/)?.[1] || 0);
      const nodes = Number(line.match(/\bnodes (\d+)/)?.[1] || 0);
      const cp = line.match(/\bscore cp (-?\d+)/);
      const mate = line.match(/\bscore mate (-?\d+)/);
      this.onInfo({ depth, nodes, score:cp ? Number(cp[1])/100 : null, mate:mate ? Number(mate[1]) : null, raw:line });
      return;
    }
    if (line.startsWith('bestmove ')) {
      this.searching = false;
      const move = line.split(/\s+/)[1];
      const resolve = this.pendingResolve;
      this.pendingResolve = null;
      this.pendingReject = null;
      resolve?.(move && move !== '(none)' ? move : null);
    }
  }

  fail(error) {
    if (this.timeoutId) clearTimeout(this.timeoutId);
    this.timeoutId = null;
    this.ready = false;
    this.initializing = null;
    this.onStatus('error', error?.message || 'Stockfish is unavailable.');
    this.initialReject?.(error);
    this.initialResolve = null;
    this.initialReject = null;
    this.pendingReject?.(error);
    this.pendingResolve = null;
    this.pendingReject = null;
    for (const waiter of this.readyWaiters.splice(0)) waiter.reject(error);
  }

  waitReady() {
    return new Promise((resolve, reject) => {
      this.readyWaiters.push({ resolve, reject });
      this.worker.postMessage('isready');
    });
  }

  async bestMove(fen, level = 'medium', moveHistory = []) {
    await this.initialize();
    if (!this.worker || !this.ready) throw new Error('Stockfish is not ready.');
    this.stop();
    const setting = DIFFICULTIES[level] || DIFFICULTIES.medium;
    this.worker.postMessage('ucinewgame');
    this.worker.postMessage(`setoption name Skill Level value ${setting.skill}`);
    if (setting.elo == null) {
      this.worker.postMessage('setoption name UCI_LimitStrength value false');
    } else {
      this.worker.postMessage('setoption name UCI_LimitStrength value true');
      this.worker.postMessage(`setoption name UCI_Elo value ${setting.elo}`);
    }
    await this.waitReady();
    const historyLine = moveHistory.length ? ` moves ${moveHistory.join(' ')}` : '';
    const isStandardStart = fen === 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
    this.worker.postMessage(moveHistory.length || isStandardStart ? `position startpos${historyLine}` : `position fen ${fen}`);
    this.searching = true;
    return new Promise((resolve, reject) => {
      this.pendingResolve = resolve;
      this.pendingReject = reject;
      this.worker.postMessage(`go depth ${setting.depth} movetime ${setting.moveTime}`);
    });
  }

  stop() {
    if (this.worker && this.searching) this.worker.postMessage('stop');
    this.searching = false;
    if (this.pendingResolve) {
      const resolve = this.pendingResolve;
      this.pendingResolve = null;
      this.pendingReject = null;
      resolve(null);
    }
  }

  terminate() {
    this.stop();
    if (this.timeoutId) clearTimeout(this.timeoutId);
    this.worker?.terminate();
    this.worker = null;
    this.ready = false;
    this.initializing = null;
    this.readyWaiters.splice(0).forEach(waiter => waiter.reject(new Error('Engine terminated.')));
  }
}

export { DIFFICULTIES };
