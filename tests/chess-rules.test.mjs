import assert from 'node:assert/strict';
import { Chess } from 'chess.js';
import { GameController } from '../src/core/GameController.js';

const controller = new GameController();

// Standard initial position: 20 legal moves, White to move, queen on d1/d8.
assert.equal(controller.turn, 'w');
assert.equal(controller.legalMoves().length, 20);
assert.equal(controller.board[7][3].type, 'q');
assert.equal(controller.board[0][3].type, 'q');
assert.equal(controller.move('e2', 'e5').ok, false, 'an illegal pawn jump must be rejected');

// Ordinary opening moves must be applied to the same game state.
for (const [from,to] of [['e2','e4'],['e7','e5'],['g1','f3'],['b8','c6']]) {
  assert.equal(controller.move(from,to).ok, true);
}
assert.equal(controller.history.length, 4);
assert.equal(controller.undo().san, 'Nc6');
assert.equal(controller.redo().san, 'Nc6');

// Castling: both king and rook move, and the engine accepts only legal castle moves.
controller.reset('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1');
assert(controller.legalMoves('e1').some(move => move.san === 'O-O'));
assert(controller.legalMoves('e1').some(move => move.san === 'O-O-O'));
assert.equal(controller.move('e1','g1').ok, true);
assert.equal(controller.board[7][6].type, 'k');
assert.equal(controller.board[7][5].type, 'r');

// En passant must remove the pawn from the square it passed over.
controller.reset();
for (const [from,to] of [['e2','e4'],['a7','a6'],['e4','e5'],['d7','d5']]) {
  assert.equal(controller.move(from,to).ok, true);
}
assert(controller.legalMoves('e5').some(move => move.to === 'd6' && move.flags.includes('e')));
assert.equal(controller.move('e5','d6').ok, true);
assert.equal(controller.board[3][3], null, 'the captured pawn on d5 is removed');

// Promotion is an explicit legal choice; all four promotion types are available.
controller.reset('4k3/P7/8/8/8/8/8/4K3 w - - 0 1');
assert.deepEqual(controller.legalMoves('a7').filter(move => move.to === 'a8').map(move => move.promotion).sort(), ['b','n','q','r']);
assert.equal(controller.move('a7','a8','n').ok, true);
assert.equal(controller.board[0][0].type, 'n');

// Checkmate and stalemate are not conflated.
controller.reset();
for (const [from,to] of [['f2','f3'],['e7','e5'],['g2','g4'],['d8','h4']]) {
  assert.equal(controller.move(from,to).ok, true);
}
assert.equal(controller.status().type, 'checkmate');
assert.equal(controller.status().done, true);
controller.reset('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1');
assert.equal(controller.status().type, 'stalemate');

// Fifty-move claim and automatic seventy-five-move termination.
controller.reset('7k/8/8/8/8/8/6K1/6R1 w - - 100 51');
assert.equal(controller.move('g1','f1').ok, true);
assert.equal(controller.status().type, 'claimable-fifty');
controller.reset('7k/8/8/8/8/8/6K1/6R1 w - - 149 75');
assert.equal(controller.move('g1','f1').ok, true);
assert.equal(controller.status().type, 'seventy-five-move');
assert.equal(controller.status().done, true);

// Repetition tracking starts from a custom FEN when a game is loaded that way.
controller.reset('7k/8/8/8/8/8/6K1/R7 w - - 0 1');
for (const [from,to] of [['a1','a2'],['h8','h7'],['a2','a1'],['h7','h8']]) {
  assert.equal(controller.move(from,to).ok, true);
}
assert.equal(controller.repetitionCount(), 2, 'the custom root position must count in repetition tracking');

// Fivefold repetition is an automatic draw, while threefold is claimable.
controller.reset();
const knightCycle = [['g1','f3'],['g8','f6'],['f3','g1'],['f6','g8']];
for (let cycle = 0; cycle < 4; cycle++) {
  for (const [from,to] of knightCycle) assert.equal(controller.move(from,to).ok, true);
  if (cycle === 1) assert.equal(controller.status().type, 'claimable-threefold');
}
assert.equal(controller.repetitionCount(), 5);
assert.equal(controller.status().type, 'fivefold-repetition');
assert.equal(controller.status().done, true);

// A bare-kings position is an insufficient-material draw.
controller.reset('8/8/8/8/8/8/4k3/3K4 w - - 0 1');
assert.equal(controller.status().type, 'insufficient');

// chess.js remains the authority for the same legal-move state, not a decorative board.
const verification = new Chess();
assert.equal(verification.moves().length, 20);

console.log('VANTA chess rules tests passed.');
