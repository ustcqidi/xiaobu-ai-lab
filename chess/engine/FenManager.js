// FenManager.js
// FEN 局面串的载入与导出。从 Phase 1 起即支持，用于残局、题库、AI 分析、棋谱保存。
//
// 采用通行的中国象棋 FEN 约定（与 UCCI / Pikafish 兼容）：
//   - 大写字母 = 红方，小写字母 = 黑方
//   - 字母含义：K将 A士 B象 N马 R车 C炮 P兵
//   - 行顺序：从 row0(黑底线/顶部) 到 row9(红底线/底部)，'/' 分隔
//   - 数字表示连续空格
//   - 棋盘串后空格 + 走子方：'w' 红，'b' 黑（载入时也接受 'r'）
//
// 标准开局：
//   rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/9/RNBAKABNR w - - 0 1
//
// 依赖 Board.js。

import {
  ROWS,
  COLS,
  RED,
  BLACK,
  createEmptyBoard,
  colorOf,
  typeOf,
} from './Board.js';

const FEN_TYPES = new Set(['K', 'A', 'B', 'N', 'R', 'C', 'P']);

/**
 * 载入 FEN，返回 { board, turn }。
 * @param {string} fen
 * @returns {{board:(string|null)[][], turn:string}}
 */
export function loadFen(fen) {
  if (typeof fen !== 'string' || !fen.trim()) {
    throw new Error('FEN 不能为空');
  }
  const parts = fen.trim().split(/\s+/);
  const layout = parts[0];
  const rows = layout.split('/');
  if (rows.length !== ROWS) {
    throw new Error(`FEN 行数应为 ${ROWS}，实际 ${rows.length}`);
  }

  const board = createEmptyBoard();
  for (let r = 0; r < ROWS; r++) {
    let c = 0;
    for (const ch of rows[r]) {
      if (ch >= '1' && ch <= '9') {
        c += Number(ch);
      } else {
        const upper = ch.toUpperCase();
        if (!FEN_TYPES.has(upper)) {
          throw new Error(`FEN 含非法字符: ${ch}`);
        }
        if (c >= COLS) throw new Error(`FEN 第 ${r} 行列数超出 ${COLS}`);
        const color = ch === upper ? 'r' : 'b'; // 大写=红
        board[r][c] = color + upper;
        c++;
      }
    }
    if (c !== COLS) {
      throw new Error(`FEN 第 ${r} 行列数应为 ${COLS}，实际 ${c}`);
    }
  }

  let turn = RED;
  const side = (parts[1] || 'w').toLowerCase();
  if (side === 'b') turn = BLACK;
  else if (side === 'w' || side === 'r') turn = RED;
  else throw new Error(`FEN 走子方非法: ${parts[1]}`);

  return { board, turn };
}

/**
 * 导出当前局面为 FEN。
 * @param {(string|null)[][]} board
 * @param {string} turn 'red' | 'black'
 * @returns {string}
 */
export function exportFen(board, turn = RED) {
  const rows = [];
  for (let r = 0; r < ROWS; r++) {
    let line = '';
    let empty = 0;
    for (let c = 0; c < COLS; c++) {
      const piece = board[r][c];
      if (!piece) {
        empty++;
        continue;
      }
      if (empty > 0) {
        line += empty;
        empty = 0;
      }
      const t = typeOf(piece);
      line += colorOf(piece) === RED ? t.toUpperCase() : t.toLowerCase();
    }
    if (empty > 0) line += empty;
    rows.push(line || '9');
  }
  const side = turn === RED ? 'w' : 'b';
  // 末尾附标准占位字段（吃子/回合计数），便于与外部工具互通。
  return `${rows.join('/')} ${side} - - 0 1`;
}

/** 标准开局 FEN 常量。 */
export const START_FEN =
  'rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/9/RNBAKABNR w - - 0 1';
