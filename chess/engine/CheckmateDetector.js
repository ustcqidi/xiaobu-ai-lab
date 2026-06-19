// CheckmateDetector.js
// 绝杀（将死）与困毙（无子可动）检测。
// 依赖 CheckDetector.js、MoveGenerator.js。

import { isCheck } from './CheckDetector.js';
import { generateLegalMoves } from './MoveGenerator.js';

/**
 * 指定颜色是否被将死：正被将军 且 无任何合法走法。
 */
export function isCheckmate(board, color) {
  if (!isCheck(board, color)) return false;
  return generateLegalMoves(board, color).length === 0;
}

/**
 * 指定颜色是否困毙：未被将军 但 无任何合法走法。
 * 中国象棋规则中，轮到走棋方无棋可走（困毙）判负。
 */
export function isStalemate(board, color) {
  if (isCheck(board, color)) return false;
  return generateLegalMoves(board, color).length === 0;
}
