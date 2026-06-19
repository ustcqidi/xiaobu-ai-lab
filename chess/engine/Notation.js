// Notation.js
// 标准中国象棋记谱（如「炮二平五」「马八进七」「前车进一」）。
// 纯显示/翻译层，不含任何走子规则，只读取棋盘与 Move。
//
// 记谱约定：
//   红方：纵线用汉字「一~九」，从红方右侧（棋盘 col=8）数起 ⇒ file = 9 - col。
//   黑方：纵线用阿拉伯「1~9」，从黑方右侧（棋盘 col=0）数起 ⇒ file = col + 1。
//   进 = 朝对方推进（红 row 减小 / 黑 row 增大）；退 = 反之；平 = 横走。
//   直行子（车/炮/兵/将）纵走记步数，横走记目标纵线。
//   斜行子（马/相/象/士/仕）记目标纵线（不记步数）。
//   同纵线有两枚同种子用「前/后」（三枚用「前/中/后」）替代起点纵线。

import { ROWS, RED, colorOf, typeOf, PIECE } from './Board.js';

const CN_NUM = ['一', '二', '三', '四', '五', '六', '七', '八', '九'];

const NAME = {
  red: { K: '帅', A: '仕', B: '相', N: '马', R: '车', C: '炮', P: '兵' },
  black: { K: '将', A: '士', B: '象', N: '马', R: '车', C: '炮', P: '卒' },
};

const DIAGONAL = new Set([PIECE.HORSE, PIECE.ELEPHANT, PIECE.ADVISOR]);

/** 纵线编号字符（按颜色）。 */
function fileChar(color, col) {
  if (color === RED) return CN_NUM[8 - col];
  return String(col + 1);
}

/** 步数字符（红用汉字，黑用阿拉伯）。 */
function stepChar(color, n) {
  if (color === RED) return CN_NUM[n - 1];
  return String(n);
}

/**
 * 把一步棋翻译为标准记谱字符串。
 * @param {(string|null)[][]} board 走子【之前】的棋盘
 * @param {{fromRow,fromCol,toRow,toCol}} move
 * @returns {string} 例如「炮二平五」
 */
export function moveToChinese(board, move) {
  const piece = board[move.fromRow][move.fromCol];
  if (!piece) return '';
  const color = colorOf(piece);
  const type = typeOf(piece);
  const name = NAME[color][type];

  const prefix = resolvePrefix(board, move, color, type, name);

  // 纵走方向：红方“进”为 row 减小，黑方“进”为 row 增大。
  const forward = color === RED ? move.toRow < move.fromRow : move.toRow > move.fromRow;
  const sameRow = move.toRow === move.fromRow;

  let action;
  if (sameRow) {
    action = '平' + fileChar(color, move.toCol);
  } else if (DIAGONAL.has(type)) {
    // 斜行子：进/退 + 目标纵线。
    action = (forward ? '进' : '退') + fileChar(color, move.toCol);
  } else {
    // 直行子：进/退 + 步数。
    const steps = Math.abs(move.toRow - move.fromRow);
    action = (forward ? '进' : '退') + stepChar(color, steps);
  }

  return prefix + action;
}

/**
 * 计算着法前缀：通常是「子名 + 起点纵线」；
 * 若同一纵线上有多枚同种同色子，则用「前/中/后 + 子名」。
 */
function resolvePrefix(board, move, color, type, name) {
  const col = move.fromCol;
  const sameFile = [];
  for (let r = 0; r < ROWS; r++) {
    const p = board[r][col];
    if (p && colorOf(p) === color && typeOf(p) === type) sameFile.push(r);
  }

  if (sameFile.length < 2) {
    return name + fileChar(color, col);
  }

  // 排序：红方 row 越小越“前”；黑方 row 越大越“前”。
  sameFile.sort((a, b) => (color === RED ? a - b : b - a));
  const idx = sameFile.indexOf(move.fromRow);

  let pos;
  if (sameFile.length === 2) {
    pos = idx === 0 ? '前' : '后';
  } else {
    pos = idx === 0 ? '前' : idx === sameFile.length - 1 ? '后' : '中';
  }
  return pos + name;
}

/** 调试用：把内部坐标 Move 转为简短串。 */
export function moveToCoords(move) {
  return `(${move.fromRow},${move.fromCol})→(${move.toRow},${move.toCol})`;
}
