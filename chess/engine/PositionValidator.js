// PositionValidator.js
// 局面合法性校验器。用于把非法残局/局面挡在题库与导入入口之外。
//
// 铁律：只调用 RuleEngine / CheckDetector，绝不自行实现走子规则。
//
// 校验项：
//   - 双方各恰有一个将/帅
//   - 将/帅在本方九宫内
//   - 士在九宫内、象在本方半场（合法落点）
//   - 兵/卒不在本方底线两格的非法行（不能后退到不可能的行）
//   - 各兵种数量不超过标准上限
//   - 两将不照面（飞将非法静态局面）
//   - 轮到 turn 方走子时，对方不应处于被将军状态（那是非法到达的局面）

import {
  ROWS,
  COLS,
  PIECE,
  RED,
  BLACK,
  colorOf,
  typeOf,
  inPalace,
  onOwnSide,
  opponent,
  isAdvisorSquare,
  isElephantSquare,
} from './Board.js';
import { RuleEngine } from './RuleEngine.js';
import { findKing, kingsFaceEachOther } from './CheckDetector.js';

// 每方各兵种数量上限（标准棋制）。
const MAX_COUNT = {
  [PIECE.KING]: 1,
  [PIECE.ADVISOR]: 2,
  [PIECE.ELEPHANT]: 2,
  [PIECE.HORSE]: 2,
  [PIECE.ROOK]: 2,
  [PIECE.CANNON]: 2,
  [PIECE.PAWN]: 5,
};

/**
 * 校验局面是否合法。
 * @param {(string|null)[][]} board
 * @param {'red'|'black'} turn 轮到谁走（默认红）
 * @returns {{valid:boolean, errors:string[]}}
 */
export function validatePosition(board, turn = RED) {
  const errors = [];
  const counts = { red: {}, black: {} };

  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const p = board[r][c];
      if (!p) continue;
      const color = colorOf(p);
      const t = typeOf(p);
      counts[color][t] = (counts[color][t] || 0) + 1;

      // 各兵种落点合法性。
      if (t === PIECE.KING && !inPalace(color, r, c)) {
        errors.push(`${color} 将/帅 不在九宫内 (${r},${c})`);
      }
      if (t === PIECE.ADVISOR && !isAdvisorSquare(color, r, c)) {
        errors.push(`${color} 士/仕 不在九宫斜线交叉点 (${r},${c})`);
      }
      if (t === PIECE.ELEPHANT && !isElephantSquare(color, r, c)) {
        errors.push(`${color} 象/相 不在合法田字点 (${r},${c})`);
      }
      if (t === PIECE.PAWN && illegalPawnRow(color, r)) {
        errors.push(`${color} 兵/卒 处于不可能到达的行 (${r},${c})`);
      }
    }
  }

  // 将/帅存在性与数量。
  for (const color of [RED, BLACK]) {
    const kc = counts[color][PIECE.KING] || 0;
    if (kc !== 1) errors.push(`${color} 必须恰有一个将/帅（实际 ${kc}）`);
    for (const t of Object.keys(MAX_COUNT)) {
      const n = counts[color][t] || 0;
      if (n > MAX_COUNT[t]) errors.push(`${color} ${t} 数量 ${n} 超过上限 ${MAX_COUNT[t]}`);
    }
  }

  // 两将照面（静态非法）。
  if (kingsFaceEachOther(board)) {
    errors.push('两将照面（飞将），非法静态局面');
  }

  // 走子前，对方不应处于被将军状态。
  if (findKing(board, RED) && findKing(board, BLACK)) {
    const other = opponent(turn);
    if (RuleEngine.isCheck(board, other)) {
      errors.push(`${turn} 走子前，对方(${other}) 不应处于被将军状态`);
    }
  }

  return { valid: errors.length === 0, errors };
}

// 兵/卒不可能出现的行：兵只能向前与（过河后）横走，永不后退。
// 红兵从 row6 出发向上：合法行 0..6；黑卒从 row3 出发向下：合法行 3..9。
function illegalPawnRow(color, row) {
  if (color === RED) return row > 6;
  return row < 3;
}
