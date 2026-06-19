// MoveGenerator.js
// 走法生成。分两层：
//   generatePseudoMoves(board, color) —— 只按各棋子走法规则生成，不考虑是否送将。
//   generateLegalMoves(board, color)  —— 在伪走法基础上过滤掉"走后己方被将军/照面"的非法走法。
//
// 依赖 Board.js、CheckDetector.js。

import {
  ROWS,
  COLS,
  PIECE,
  RED,
  BLACK,
  getPiece,
  colorOf,
  typeOf,
  inBounds,
  inPalace,
  onOwnSide,
  cloneBoard,
} from './Board.js';
import { createMove } from './Move.js';
import { isCheck } from './CheckDetector.js';

/**
 * 生成某颜色全部伪合法走法（不过滤送将）。
 * @returns {Array<{fromRow,fromCol,toRow,toCol}>}
 */
export function generatePseudoMoves(board, color) {
  const moves = [];
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const piece = board[r][c];
      if (!piece || colorOf(piece) !== color) continue;
      switch (typeOf(piece)) {
        case PIECE.KING:
          genKing(board, r, c, color, moves);
          break;
        case PIECE.ADVISOR:
          genAdvisor(board, r, c, color, moves);
          break;
        case PIECE.ELEPHANT:
          genElephant(board, r, c, color, moves);
          break;
        case PIECE.HORSE:
          genHorse(board, r, c, color, moves);
          break;
        case PIECE.ROOK:
          genRook(board, r, c, color, moves);
          break;
        case PIECE.CANNON:
          genCannon(board, r, c, color, moves);
          break;
        case PIECE.PAWN:
          genPawn(board, r, c, color, moves);
          break;
      }
    }
  }
  return moves;
}

/**
 * 生成某颜色全部合法走法（过滤掉走后己方被将军或将帅照面的走法）。
 */
export function generateLegalMoves(board, color) {
  const pseudo = generatePseudoMoves(board, color);
  const legal = [];
  for (const m of pseudo) {
    const next = cloneBoard(board);
    next[m.toRow][m.toCol] = next[m.fromRow][m.fromCol];
    next[m.fromRow][m.fromCol] = null;
    // 走后己方不能被将军（isCheck 已包含将帅照面判定）
    if (!isCheck(next, color)) {
      legal.push(m);
    }
  }
  return legal;
}

// ---- 工具：能否落到目标格（空或敌子）----
function canLand(board, color, row, col) {
  if (!inBounds(row, col)) return false;
  const p = board[row][col];
  return !p || colorOf(p) !== color;
}

function push(moves, fromRow, fromCol, toRow, toCol) {
  moves.push(createMove(fromRow, fromCol, toRow, toCol));
}

// 将/帅：九宫内上下左右一步
function genKing(board, r, c, color, moves) {
  const deltas = [
    [-1, 0],
    [1, 0],
    [0, -1],
    [0, 1],
  ];
  for (const [dr, dc] of deltas) {
    const nr = r + dr;
    const nc = c + dc;
    if (inPalace(color, nr, nc) && canLand(board, color, nr, nc)) {
      push(moves, r, c, nr, nc);
    }
  }
}

// 士/仕：九宫内斜走一步
function genAdvisor(board, r, c, color, moves) {
  const deltas = [
    [-1, -1],
    [-1, 1],
    [1, -1],
    [1, 1],
  ];
  for (const [dr, dc] of deltas) {
    const nr = r + dr;
    const nc = c + dc;
    if (inPalace(color, nr, nc) && canLand(board, color, nr, nc)) {
      push(moves, r, c, nr, nc);
    }
  }
}

// 象/相：走田字，象眼不能被堵，不能过河
function genElephant(board, r, c, color, moves) {
  const deltas = [
    [-2, -2, -1, -1],
    [-2, 2, -1, 1],
    [2, -2, 1, -1],
    [2, 2, 1, 1],
  ];
  for (const [dr, dc, er, ec] of deltas) {
    const nr = r + dr;
    const nc = c + dc;
    if (!inBounds(nr, nc)) continue;
    if (!onOwnSide(color, nr)) continue; // 不能过河
    if (board[r + er][c + ec]) continue; // 象眼被堵
    if (canLand(board, color, nr, nc)) push(moves, r, c, nr, nc);
  }
}

// 马：走日字，蹩马腿
function genHorse(board, r, c, color, moves) {
  // [目标偏移, 马腿偏移]
  const patterns = [
    [-2, -1, -1, 0],
    [-2, 1, -1, 0],
    [2, -1, 1, 0],
    [2, 1, 1, 0],
    [-1, -2, 0, -1],
    [1, -2, 0, -1],
    [-1, 2, 0, 1],
    [1, 2, 0, 1],
  ];
  for (const [dr, dc, lr, lc] of patterns) {
    const nr = r + dr;
    const nc = c + dc;
    if (!inBounds(nr, nc)) continue;
    if (board[r + lr][c + lc]) continue; // 蹩马腿
    if (canLand(board, color, nr, nc)) push(moves, r, c, nr, nc);
  }
}

// 车：横竖任意距离，路径不能有阻挡
function genRook(board, r, c, color, moves) {
  const dirs = [
    [-1, 0],
    [1, 0],
    [0, -1],
    [0, 1],
  ];
  for (const [dr, dc] of dirs) {
    let nr = r + dr;
    let nc = c + dc;
    while (inBounds(nr, nc)) {
      const p = board[nr][nc];
      if (!p) {
        push(moves, r, c, nr, nc);
      } else {
        if (colorOf(p) !== color) push(moves, r, c, nr, nc); // 吃子
        break;
      }
      nr += dr;
      nc += dc;
    }
  }
}

// 炮：移动同车；吃子时中间必须且只能隔一个棋子
function genCannon(board, r, c, color, moves) {
  const dirs = [
    [-1, 0],
    [1, 0],
    [0, -1],
    [0, 1],
  ];
  for (const [dr, dc] of dirs) {
    let nr = r + dr;
    let nc = c + dc;
    // 第一阶段：无炮架，只能移动到空格
    while (inBounds(nr, nc) && !board[nr][nc]) {
      push(moves, r, c, nr, nc);
      nr += dr;
      nc += dc;
    }
    // 遇到炮架，越过后寻找第一个棋子
    if (inBounds(nr, nc)) {
      nr += dr;
      nc += dc;
      while (inBounds(nr, nc)) {
        const p = board[nr][nc];
        if (p) {
          if (colorOf(p) !== color) push(moves, r, c, nr, nc); // 隔一子吃敌
          break;
        }
        nr += dr;
        nc += dc;
      }
    }
  }
}

// 兵/卒：未过河只能向前；过河后可前、左、右；不能后退
function genPawn(board, r, c, color, moves) {
  const forward = color === RED ? -1 : 1; // 红向上(row 减)，黑向下
  // 前进
  const fr = r + forward;
  if (inBounds(fr, c) && canLand(board, color, fr, c)) push(moves, r, c, fr, c);
  // 过河后可横走
  if (!onOwnSide(color, r)) {
    for (const dc of [-1, 1]) {
      const nc = c + dc;
      if (inBounds(r, nc) && canLand(board, color, r, nc)) push(moves, r, c, r, nc);
    }
  }
}
