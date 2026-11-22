import { Chess } from 'chess.js';

const STANDARD_START_FEN = new Chess().fen();

export class GameController {
  constructor() {
    this.game = new Chess();
    this.initialFen = this.game.fen();
    this.redoStack = [];
  }

  reset(fen) {
    this.game = fen ? new Chess(fen) : new Chess();
    this.initialFen = this.game.fen();
    this.redoStack = [];
  }

  get fen() { return this.game.fen(); }
  get turn() { return this.game.turn(); }
  get board() { return this.game.board(); }
  get history() { return this.game.history({ verbose:true }); }
  get pgn() { return this.game.pgn({ maxWidth:80, newline:'\n' }); }
  get gameOver() { return this.game.isGameOver(); }
  get isCheck() { return this.game.isCheck(); }
  get isCheckmate() { return this.game.isCheckmate(); }
  get isStalemate() { return this.game.isStalemate(); }
  get isDraw() { return this.game.isDraw(); }
  get isThreefoldRepetition() { return this.game.isThreefoldRepetition(); }
  get isInsufficientMaterial() { return this.game.isInsufficientMaterial(); }

  legalMoves(square) {
    return this.game.moves(square ? { square, verbose:true } : { verbose:true });
  }

  move(from, to, promotion = null) {
    try {
      const result = this.game.move({ from, to, ...(promotion ? { promotion } : {}) });
      this.redoStack = [];
      return { ok:true, move:result };
    } catch (error) {
      return { ok:false, error:error.message || 'Illegal move.' };
    }
  }

  undo() {
    const move = this.game.undo();
    if (move) this.redoStack.push({ from:move.from, to:move.to, promotion:move.promotion });
    return move;
  }

  redo() {
    const move = this.redoStack.pop();
    if (!move) return null;
    try {
      return this.game.move(move);
    } catch {
      this.redoStack = [];
      return null;
    }
  }

  clearRedo() { this.redoStack = []; }

  currentCheckSquare() {
    if (!this.game.isCheck()) return null;
    const king = this.game.board().flat().find(piece => piece && piece.type === 'k' && piece.color === this.turn);
    return king?.square || null;
  }

  repetitionCount() {
    // Repetition must be evaluated from this game's actual starting position.
    // A custom FEN is not interchangeable with the standard initial position.
    const replay = new Chess(this.initialFen || STANDARD_START_FEN);
    const positionKey = game => {
      const fields = game.fen().split(' ');
      const hasLegalEnPassant = fields[3] !== '-' && game.moves({ verbose:true }).some(move => move.flags.includes('e'));
      return `${fields[0]} ${fields[1]} ${fields[2]} ${hasLegalEnPassant ? fields[3] : '-'}`;
    };
    const currentKey = positionKey(this.game);
    let count = positionKey(replay) === currentKey ? 1 : 0;
    for (const move of this.history) {
      replay.move({ from:move.from, to:move.to, ...(move.promotion ? { promotion:move.promotion } : {}) });
      if (positionKey(replay) === currentKey) count += 1;
    }
    return count;
  }

  status() {
    if (this.game.isCheckmate()) return { done:true, type:'checkmate', text:`Checkmate — ${this.turn === 'w' ? 'Black' : 'White'} wins.` };
    if (this.game.isStalemate()) return { done:true, type:'stalemate', text:'Draw — stalemate.' };
    if (this.game.isInsufficientMaterial()) return { done:true, type:'insufficient', text:'Draw — insufficient material.' };
    const fenParts = this.game.fen().split(' ');
    const halfmoveClock = Number(fenParts[4] || 0);
    if (halfmoveClock >= 150) return { done:true, type:'seventy-five-move', text:'Draw — seventy-five-move rule.' };
    if (this.repetitionCount() >= 5) return { done:true, type:'fivefold-repetition', text:'Draw — fivefold repetition.' };
    if (this.game.isThreefoldRepetition()) return { done:false, type:'claimable-threefold', text:`${this.turn === 'w' ? 'White' : 'Black'} to move — draw may be claimed by repetition.` };
    if (halfmoveClock >= 100) return { done:false, type:'claimable-fifty', text:`${this.turn === 'w' ? 'White' : 'Black'} to move — draw may be claimed by the fifty-move rule.` };
    if (this.game.isDraw()) return { done:true, type:'draw', text:'Draw.' };
    return { done:false, type:this.game.isCheck() ? 'check' : 'playing', text:`${this.turn === 'w' ? 'White' : 'Black'} to move${this.game.isCheck() ? ' · Check' : ''}.` };
  }

  canClaimDraw() {
    const halfmoveClock = Number(this.game.fen().split(' ')[4] || 0);
    return this.game.isThreefoldRepetition() || halfmoveClock >= 100;
  }

  claimDraw() {
    if (!this.canClaimDraw()) return false;
    // chess.js marks a claimable draw through its game history; the UI owns the claimed result.
    return true;
  }

  canPossiblyMate(color) {
    const boardPieces = this.game.board().flat().filter(Boolean);
    const own = boardPieces.filter(piece => piece.color === color && piece.type !== 'k');
    const enemy = boardPieces.filter(piece => piece.color !== color && piece.type !== 'k');
    if (own.length === 0) return false;
    if (own.some(piece => ['p','r','q'].includes(piece.type))) return true;
    // With only kings on the other side, a lone minor piece and two knights
    // cannot produce a legal checkmate position. Opposing material can change
    // that assessment because it may block its own king's escape squares.
    if (enemy.length === 0) {
      if (own.length === 1) return false;
      if (own.length === 2 && own.every(piece => piece.type === 'n')) return false;
      if (own.every(piece => piece.type === 'b')) {
        const squareColors = own.map(piece => {
          const file = 'abcdefgh'.indexOf(piece.square[0]);
          const rank = Number(piece.square[1]);
          return (file + rank) % 2;
        });
        if (new Set(squareColors).size === 1) return false;
      }
    }
    return true;
  }

  material() {
    const values = { w:0, b:0 };
    for (const move of this.history) {
      if (move.captured) values[move.color] += ({ p:1, n:3, b:3, r:5, q:9 }[move.captured] || 0);
    }
    return values;
  }

  capturedBy(color) {
    return this.history.filter(move => move.color === color && move.captured).map(move => ({ type:move.captured, color:color === 'w' ? 'b' : 'w' }));
  }

  loadPgn(pgn) {
    const next = new Chess();
    next.loadPgn(pgn);
    this.game = next;
    this.initialFen = next.header().FEN || STANDARD_START_FEN;
    this.redoStack = [];
  }
}
