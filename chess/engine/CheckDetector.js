// CheckDetector.js
// 将军检测与"将帅照面"（飞将）检测。
//
// 设计：使用"直接攻击扫描"而非生成对方全部走法，
//   - 更快（满足规则判断 <5ms 要求）
//   - 避免与 MoveGenerator 的循环依赖
//
// 只依赖 Board.js。

import {
  ROWS,
  COLS,
  PIECE,
  RED,
  BLACK,
  getPiece,
  colorOf,
  typeOf,
  opponent,
  inBounds,
} from './Board.js';

/**
 * 找到指定颜色的将/帅位置。
 * @returns {{row:number,col:number}|null}
 */
export function findKing(board, color) {
  const target = (color === RED ? 'r' : 'b') + PIECE.KING;
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (board[r][c] === target) return { row: r, col: c };
    }
  }
  return null;
}

/**
 * 判断 (row,col) 是否被 byColor 方的任意棋子攻击。
 * 用于将军检测。考虑：车、炮、马（蹩腿）、兵、将帅照面。
 * 士/象/将本身无法攻击到对方将（受九宫/河界约束），故省略。
 */
export function isSquareAttacked(board, row, col, byColor) {
  return (
    attackedByRook(board, row, col, byColor) ||
    attackedByCannon(board, row, col, byColor) ||
    attackedByHorse(board, row, col, byColor) ||
    attackedByPawn(board, row, col, byColor) ||
    attackedByFlyingKing(board, row, col, byColor)
  );
}

const ORTHO = [
  [-1, 0],
  [1, 0],
  [0, -1],
  [0, 1],
];

// 车：沿四方向射线，遇到的第一个棋子若是 byColor 的车则攻击成立。
function attackedByRook(board, row, col, byColor) {
  for (const [dr, dc] of ORTHO) {
    let r = row + dr;
    let c = col + dc;
    while (inBounds(r, c)) {
      const p = board[r][c];
      if (p) {
        if (colorOf(p) === byColor && typeOf(p) === PIECE.ROOK) return true;
        break;
      }
      r += dr;
      c += dc;
    }
  }
  return false;
}

// 炮：沿四方向，越过恰好一个棋子（炮架），其后第一个棋子若是 byColor 的炮则攻击成立。
function attackedByCannon(board, row, col, byColor) {
  for (const [dr, dc] of ORTHO) {
    let r = row + dr;
    let c = col + dc;
    let screen = false;
    while (inBounds(r, c)) {
      const p = board[r][c];
      if (p) {
        if (!screen) {
          screen = true; // 找到炮架，继续往后找
        } else {
          if (colorOf(p) === byColor && typeOf(p) === PIECE.CANNON) return true;
          break; // 炮架之后第一个子，不论是否炮都停止
        }
      }
      r += dr;
      c += dc;
    }
  }
  return false;
}

// 马：对方马在以下 8 个位置时可攻击 (row,col)，但需检查"蹩马腿"。
// 马腿点是从对方马朝 (row,col) 方向迈出的第一个正交格。
function attackedByHorse(board, row, col, byColor) {
  // (马所在位置偏移, 对应马腿相对马的位置偏移)
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
  for (const [hr, hc, lr, lc] of patterns) {
    const horseR = row + hr;
    const horseC = col + hc;
    if (!inBounds(horseR, horseC)) continue;
    const p = board[horseR][horseC];
    if (!p || colorOf(p) !== byColor || typeOf(p) !== PIECE.HORSE) continue;
    // 马腿：从马的位置朝目标方向的相邻正交格（即马腿点）
    const legR = horseR + lr;
    const legC = horseC + lc;
    if (board[legR] && board[legR][legC]) continue; // 蹩马腿，不能攻击
    return true;
  }
  return false;
}

// 兵/卒：红兵向上(row 减小)走，故红兵攻击其下方/左右；黑卒反之。
function attackedByPawn(board, row, col, byColor) {
  if (byColor === RED) {
    // 红兵能攻击到 (row,col) 的情况：红兵在 (row+1,col)（红兵向上推进），
    // 或已过河红兵在 (row,col±1)。
    if (isPawn(board, row + 1, col, RED)) return true;
    if (isPawn(board, row, col - 1, RED) && hasCrossed(RED, row)) return true;
    if (isPawn(board, row, col + 1, RED) && hasCrossed(RED, row)) return true;
  } else {
    if (isPawn(board, row - 1, col, BLACK)) return true;
    if (isPawn(board, row, col - 1, BLACK) && hasCrossed(BLACK, row)) return true;
    if (isPawn(board, row, col + 1, BLACK) && hasCrossed(BLACK, row)) return true;
  }
  return false;
}

function isPawn(board, row, col, color) {
  const p = getPiece(board, row, col);
  return !!p && colorOf(p) === color && typeOf(p) === PIECE.PAWN;
}

// 兵能横走 ⇒ 该兵必须已过河。这里判断的是"被攻击格 (row,col) 所在行"对该色兵而言是否已过河区域。
function hasCrossed(color, row) {
  return color === RED ? row <= 4 : row >= 5;
}

// 将帅照面（飞将）：两将同列且中间无子，则视为互相攻击。
function attackedByFlyingKing(board, row, col, byColor) {
  // 仅当 (row,col) 是将/帅时此条才有意义；但函数通用，按列扫描对方将。
  const enemyKing = (byColor === RED ? 'r' : 'b') + PIECE.KING;
  // 同列向上/下扫描，第一个遇到的棋子若是对方将，则照面成立。
  for (const dr of [-1, 1]) {
    let r = row + dr;
    while (inBounds(r, col)) {
      const p = board[r][col];
      if (p) {
        if (p === enemyKing) return true;
        break;
      }
      r += dr;
    }
  }
  return false;
}

/**
 * 指定颜色的将是否正被将军。
 */
export function isCheck(board, color) {
  const king = findKing(board, color);
  if (!king) return true; // 将已不在 = 视为被将死（被吃）
  return isSquareAttacked(board, king.row, king.col, opponent(color));
}

/**
 * 两将是否照面（同列无子阻隔）。独立工具，供测试与合法性校验。
 */
export function kingsFaceEachOther(board) {
  const red = findKing(board, RED);
  const black = findKing(board, BLACK);
  if (!red || !black) return false;
  if (red.col !== black.col) return false;
  const col = red.col;
  const lo = Math.min(red.row, black.row);
  const hi = Math.max(red.row, black.row);
  for (let r = lo + 1; r < hi; r++) {
    if (board[r][col]) return false;
  }
  return true;
}
