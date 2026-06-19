// Board.js
// 棋盘数据层。统一格式：board[10][9]，10 行 9 列。
// row 0 在顶部（黑方底线），row 9 在底部（红方底线）。
// 空位用 null 表示；棋子用两字符编码，如 "rK" "bP"。
//
// 本文件只负责"数据"，不包含任何走子规则。规则全部在 RuleEngine 系列模块中。

export const ROWS = 10;
export const COLS = 9;

// 棋子类型常量（第二个字符）
export const PIECE = {
  KING: 'K',     // 将 / 帅
  ADVISOR: 'A',  // 士 / 仕
  ELEPHANT: 'B', // 象 / 相
  HORSE: 'N',    // 马
  ROOK: 'R',     // 车
  CANNON: 'C',   // 炮
  PAWN: 'P',     // 兵 / 卒
};

export const RED = 'red';
export const BLACK = 'black';

/**
 * 生成标准开局棋盘。
 * @returns {(string|null)[][]} board[10][9]
 */
export function createInitialBoard() {
  return [
    ['bR', 'bN', 'bB', 'bA', 'bK', 'bA', 'bB', 'bN', 'bR'], // row 0
    [null, null, null, null, null, null, null, null, null], // row 1
    [null, 'bC', null, null, null, null, null, 'bC', null],  // row 2
    ['bP', null, 'bP', null, 'bP', null, 'bP', null, 'bP'],  // row 3
    [null, null, null, null, null, null, null, null, null], // row 4
    [null, null, null, null, null, null, null, null, null], // row 5
    ['rP', null, 'rP', null, 'rP', null, 'rP', null, 'rP'],  // row 6
    [null, 'rC', null, null, null, null, null, 'rC', null],  // row 7
    [null, null, null, null, null, null, null, null, null], // row 8
    ['rR', 'rN', 'rB', 'rA', 'rK', 'rA', 'rB', 'rN', 'rR'],  // row 9
  ];
}

/**
 * 生成全空棋盘（用于残局 / 测试）。
 */
export function createEmptyBoard() {
  const board = [];
  for (let r = 0; r < ROWS; r++) {
    board.push(new Array(COLS).fill(null));
  }
  return board;
}

/**
 * 深拷贝棋盘。
 */
export function cloneBoard(board) {
  return board.map((row) => row.slice());
}

/**
 * 坐标是否在棋盘内。
 */
export function inBounds(row, col) {
  return row >= 0 && row < ROWS && col >= 0 && col < COLS;
}

/**
 * 取指定位置棋子编码，越界或空返回 null。
 */
export function getPiece(board, row, col) {
  if (!inBounds(row, col)) return null;
  return board[row][col];
}

/**
 * 返回棋子颜色 'red' | 'black' | null。
 */
export function colorOf(piece) {
  if (!piece) return null;
  return piece[0] === 'r' ? RED : BLACK;
}

/**
 * 返回棋子类型字符（K/A/B/N/R/C/P），空返回 null。
 */
export function typeOf(piece) {
  if (!piece) return null;
  return piece[1];
}

export function isRed(piece) {
  return !!piece && piece[0] === 'r';
}

export function isBlack(piece) {
  return !!piece && piece[0] === 'b';
}

/**
 * 返回对方颜色。
 */
export function opponent(color) {
  return color === RED ? BLACK : RED;
}

/**
 * 是否在己方九宫内。
 * 红：row 7~9, col 3~5；黑：row 0~2, col 3~5。
 */
export function inPalace(color, row, col) {
  if (col < 3 || col > 5) return false;
  if (color === RED) return row >= 7 && row <= 9;
  return row >= 0 && row <= 2;
}

/**
 * 判断坐标是否在某颜色的"己方半场"（未过河区域）。
 * 河界在 row4 与 row5 之间。红方半场 row 5~9，黑方半场 row 0~4。
 */
export function onOwnSide(color, row) {
  if (color === RED) return row >= 5;
  return row <= 4;
}

// 士/仕的合法落点（九宫斜线交叉点，每方 5 个）。
const ADVISOR_SQUARES = {
  [RED]: new Set(['9,3', '9,5', '8,4', '7,3', '7,5']),
  [BLACK]: new Set(['0,3', '0,5', '1,4', '2,3', '2,5']),
};

// 象/相的合法落点（本方半场田字交叉点，每方 7 个）。
const ELEPHANT_SQUARES = {
  [RED]: new Set(['9,2', '9,6', '7,0', '7,4', '7,8', '5,2', '5,6']),
  [BLACK]: new Set(['0,2', '0,6', '2,0', '2,4', '2,8', '4,2', '4,6']),
};

/** 是否为该颜色士/仕的合法落点。 */
export function isAdvisorSquare(color, row, col) {
  return ADVISOR_SQUARES[color].has(`${row},${col}`);
}

/** 是否为该颜色象/相的合法落点。 */
export function isElephantSquare(color, row, col) {
  return ELEPHANT_SQUARES[color].has(`${row},${col}`);
}
