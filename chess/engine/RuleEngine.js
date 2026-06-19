// RuleEngine.js
// 规则引擎统一入口（Agent 2，最高优先级）。
// 所有规则集中于此与其子模块；UI 与 AI 必须通过本接口，禁止自行实现规则。
//
// 提供接口（规范要求）：
//   isLegalMove(board, move, turn)
//   generateLegalMoves(board, turn)
//   makeMove(board, move)
//   undoMove(board, move)
//   isCheck(board, turn)
//   isCheckmate(board, turn)
//   isStalemate(board, turn)
//   isDraw(board)
//   cloneBoard(board)

import {
  ROWS,
  COLS,
  PIECE,
  RED,
  BLACK,
  cloneBoard as _cloneBoard,
  colorOf,
  typeOf,
  inBounds,
} from './Board.js';
import { moveEquals } from './Move.js';
import {
  generateLegalMoves as _generateLegalMoves,
  generatePseudoMoves,
} from './MoveGenerator.js';
import { isCheck as _isCheck } from './CheckDetector.js';
import { isCheckmate as _isCheckmate, isStalemate as _isStalemate } from './CheckmateDetector.js';

export const RuleEngine = {
  cloneBoard: _cloneBoard,

  /**
   * 生成某方全部合法走法。
   */
  generateLegalMoves(board, turn) {
    return _generateLegalMoves(board, turn);
  },

  /**
   * 判断一个 move 对 turn 方是否合法。
   * 综合校验：边界、起点为己方棋子、符合棋子走法、走后不被将军、不形成将帅照面。
   */
  isLegalMove(board, move, turn) {
    if (!move) return false;
    const { fromRow, fromCol, toRow, toCol } = move;
    if (!inBounds(fromRow, fromCol) || !inBounds(toRow, toCol)) return false;
    const piece = board[fromRow][fromCol];
    if (!piece || colorOf(piece) !== turn) return false;
    // 以"是否在合法走法集合中"为准，保证与生成器一致。
    return this.generateLegalMoves(board, turn).some((m) => moveEquals(m, move));
  },

  /**
   * 执行走子（原地修改 board）。被吃的棋子写入 move.captured，供 undoMove 还原。
   * @returns 被吃的棋子编码或 null
   */
  makeMove(board, move) {
    const { fromRow, fromCol, toRow, toCol } = move;
    const captured = board[toRow][toCol];
    board[toRow][toCol] = board[fromRow][fromCol];
    board[fromRow][fromCol] = null;
    move.captured = captured ?? null;
    return move.captured;
  },

  /**
   * 撤销走子（原地修改 board）。依赖 move.captured。
   */
  undoMove(board, move) {
    const { fromRow, fromCol, toRow, toCol } = move;
    board[fromRow][fromCol] = board[toRow][toCol];
    board[toRow][toCol] = move.captured ?? null;
  },

  isCheck(board, turn) {
    return _isCheck(board, turn);
  },

  isCheckmate(board, turn) {
    return _isCheckmate(board, turn);
  },

  isStalemate(board, turn) {
    return _isStalemate(board, turn);
  },

  /**
   * 基础和棋判定：双方均无进攻子力（只剩将/士/象），无法将死。
   * 注：长将、重复局面等判定在 Phase 5 实现。
   */
  isDraw(board) {
    const attackers = new Set([PIECE.ROOK, PIECE.CANNON, PIECE.HORSE, PIECE.PAWN]);
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const p = board[r][c];
        if (p && attackers.has(typeOf(p))) return false;
      }
    }
    return true;
  },
};

export { generatePseudoMoves };
