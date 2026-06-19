// Evaluation.js
// 局面评估（Agent 4 / AI）。
// 规范：AI 禁止自己实现规则，本文件仅做"打分"，不生成走法、不判合法性。
// 走法生成与将军判定统一调用 RuleEngine。
//
// evaluate(board, forColor) 返回从 forColor 视角的分值，越大越好。
//
// 评估组成：
//   1. 子力价值（规范强制）：将=10000, 车=900, 炮=450, 马=400, 士=150, 象=150, 兵=100
//   2. 位置价值（piece-square tables）：兵/马/炮等位置加权，过河兵更高
//   3. 机动性：双方合法走法数之差，轻微加权
//   4. 将军威胁：能将到对方时轻微加权

import {
  ROWS,
  COLS,
  PIECE,
  RED,
  BLACK,
  colorOf,
  typeOf,
  opponent,
} from './Board.js';
import { RuleEngine } from './RuleEngine.js';

// ---- 子力价值（规范强制数值）----
export const PIECE_VALUE = {
  [PIECE.KING]: 10000,
  [PIECE.ROOK]: 900,
  [PIECE.CANNON]: 450,
  [PIECE.HORSE]: 400,
  [PIECE.ADVISOR]: 150,
  [PIECE.ELEPHANT]: 150,
  [PIECE.PAWN]: 100,
};

// 机动性权重（每多一个合法走法的价值）
export const MOBILITY_WEIGHT = 2;
// 将军威胁权重（能将到对方时的加分）
export const CHECK_BONUS = 30;
// 守备价值：保留仕/相对将门的庇护（零和项，开局对称为 0）。
export const ADVISOR_SHELTER = 12;
export const ELEPHANT_SHELTER = 10;

// ---- 位置价值表（piece-square tables）----
// 所有表均以"红方视角"给出：row 0 = 黑方底线（红方最深处），row 9 = 红方底线。
// 红方棋子直接按 [row][col] 取值；黑方棋子按上下镜像 [ROWS-1-row][col] 取值。
// 表中数值是"越靠前/越有威胁越高"的相对加成。

// 兵/卒：过河后大幅提升，越深入越高，中路略高。
const PAWN_TABLE = [
  [  0,  0,  0,  0,  0,  0,  0,  0,  0], // row0 (敌方底线)
  [  0,  0,  0,  0,  0,  0,  0,  0,  0],
  [  0,  0,  0,  0,  0,  0,  0,  0,  0],
  [ 75, 80, 90,100,110,100, 90, 80, 75], // 已逼近敌方九宫
  [ 60, 65, 70, 80, 90, 80, 70, 65, 60], // 刚过河纵深
  [ 40, 45, 50, 60, 70, 60, 50, 45, 40], // 刚过河
  [  5,  0, 10,  0, 15,  0, 10,  0,  5], // 未过河（己方半场）
  [  0,  0,  0,  0,  0,  0,  0,  0,  0],
  [  0,  0,  0,  0,  0,  0,  0,  0,  0],
  [  0,  0,  0,  0,  0,  0,  0,  0,  0], // row9 (己方底线)
];

// 马：盘踞中场/敌方腹地价值高，底线与边角价值低。
const HORSE_TABLE = [
  [  0, -4,  4, 10,  4, 10,  4, -4,  0],
  [  4,  8, 18, 16, 24, 16, 18,  8,  4],
  [ 12, 18, 24, 26, 28, 26, 24, 18, 12],
  [ 12, 24, 22, 28, 24, 28, 22, 24, 12],
  [ 10, 20, 22, 26, 26, 26, 22, 20, 10],
  [ 10, 18, 22, 24, 24, 24, 22, 18, 10],
  [  8, 16, 20, 22, 22, 22, 20, 16,  8],
  [  6, 12, 16, 18, 18, 18, 16, 12,  6],
  [  4,  6, 10, 12, 12, 12, 10,  6,  4],
  [  0,  2,  4,  6,  6,  6,  4,  2,  0],
];

// 炮：控制中线与对方阵地价值较高。
const CANNON_TABLE = [
  [  6,  4,  0, -10, -12, -10,  0,  4,  6],
  [  2,  2,  0,  -4,  -14,  -4,  0,  2,  2],
  [  2,  2,  0,  -10, -8,  -10,  0,  2,  2],
  [  0,  0,  2,   6,   6,   6,  2,  0,  0],
  [  0,  0,  4,   6,   8,   6,  4,  0,  0],
  [ -2,  0,  4,   6,   8,   6,  4,  0, -2],
  [  0,  0,  0,   2,   4,   2,  0,  0,  0],
  [  0,  2,  4,   2,   6,   2,  4,  2,  0],
  [  0,  0,  2,   4,   4,   4,  2,  0,  0],
  [  0,  0,  2,   6,   6,   6,  2,  0,  0],
];

// 车：占据要道、过河、卡线价值高。
const ROOK_TABLE = [
  [ 14, 14, 12, 18, 16, 18, 12, 14, 14],
  [ 16, 20, 18, 24, 26, 24, 18, 20, 16],
  [ 12, 12, 12, 18, 18, 18, 12, 12, 12],
  [ 12, 18, 16, 22, 22, 22, 16, 18, 12],
  [ 12, 14, 12, 18, 18, 18, 12, 14, 12],
  [ 12, 16, 14, 20, 20, 20, 14, 16, 12],
  [  6, 10,  8, 14, 14, 14,  8, 10,  6],
  [  4,  8,  6, 14, 12, 14,  6,  8,  4],
  [  8,  4,  8, 16,  8, 16,  8,  4,  8],
  [ -2, 10,  6, 14, 12, 14,  6, 10, -2],
];

const TABLES = {
  [PIECE.PAWN]: PAWN_TABLE,
  [PIECE.HORSE]: HORSE_TABLE,
  [PIECE.CANNON]: CANNON_TABLE,
  [PIECE.ROOK]: ROOK_TABLE,
};

/**
 * 取某棋子在其位置上的位置价值（已按颜色处理镜像）。
 */
function positionValue(piece, row, col) {
  const t = typeOf(piece);
  const table = TABLES[t];
  if (!table) return 0;
  const color = colorOf(piece);
  // 表以红方视角给出；黑方上下镜像。
  const r = color === RED ? row : ROWS - 1 - row;
  return table[r][col];
}

/**
 * 计算某一方的"原始得分"（子力 + 位置）。
 */
function materialAndPosition(board, color) {
  let score = 0;
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const p = board[r][c];
      if (!p || colorOf(p) !== color) continue;
      score += PIECE_VALUE[typeOf(p)] || 0;
      score += positionValue(p, r, c);
    }
  }
  return score;
}

/**
 * 将门庇护分：在场仕/相提供守备价值（鼓励保留防御子，残局尤为关键）。
 * 零和项：开局双方满守备 ⇒ my-opp=0。
 */
function kingShelter(board, color) {
  let advisors = 0;
  let elephants = 0;
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const p = board[r][c];
      if (!p || colorOf(p) !== color) continue;
      const t = typeOf(p);
      if (t === PIECE.ADVISOR) advisors++;
      else if (t === PIECE.ELEPHANT) elephants++;
    }
  }
  return advisors * ADVISOR_SHELTER + elephants * ELEPHANT_SHELTER;
}

/**
 * 局面评估：返回从 forColor 视角的分值（越大越好）。
 * @param {(string|null)[][]} board
 * @param {'red'|'black'} forColor
 * @returns {number}
 */
export function evaluate(board, forColor) {
  const opp = opponent(forColor);

  // 子力 + 位置
  const myMP = materialAndPosition(board, forColor);
  const oppMP = materialAndPosition(board, opp);
  let score = myMP - oppMP;

  // 机动性差（合法走法数）。调用 RuleEngine，绝不自己实现规则。
  const myMobility = RuleEngine.generateLegalMoves(board, forColor).length;
  const oppMobility = RuleEngine.generateLegalMoves(board, opp).length;
  score += MOBILITY_WEIGHT * (myMobility - oppMobility);

  // 将军威胁（轻微加权）：我方将到对方加分，被对方将到扣分。
  if (RuleEngine.isCheck(board, opp)) score += CHECK_BONUS;
  if (RuleEngine.isCheck(board, forColor)) score -= CHECK_BONUS;

  // 将门庇护（仕/相守备，残局更重要）。
  score += kingShelter(board, forColor) - kingShelter(board, opp);

  return score;
}
