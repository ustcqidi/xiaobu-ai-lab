// MateSolver.js
// 受迫将杀求解器（forced mate solver）。
// 统一为以下功能提供能力，避免各处重复实现搜索逻辑：
//   - 题库自动应着（选最顽强防守）
//   - 残局题目分级提示
//   - 题库生成与离线验证
//   - AI 杀棋检测
//
// 铁律：本模块只调用 RuleEngine，绝不自行实现走子/将军/将死规则。
//
// 术语：mate-in-N = 进攻方在 N 个“进攻方着法”之内可强制将死对方
//       （对方所有应着都被将死或继续被强制将死）。

import { RuleEngine } from './RuleEngine.js';
import { opponent } from './Board.js';

/**
 * 进攻方（attacker 先走）能否在 depth 个进攻着法内强制将死对方。
 * @returns {{found:boolean, line?:Move[]}}  line 为主变（含对方最顽强应着）
 */
function canForceMate(board, attacker, depth) {
  const defender = opponent(attacker);
  const moves = RuleEngine.generateLegalMoves(board, attacker);
  // 优先尝试“吃子/可能将军”的着法，命中更快（不改变结论，仅影响顺序）。
  orderForMate(board, moves);

  for (const m of moves) {
    const captured = RuleEngine.makeMove(board, m);

    if (RuleEngine.isCheckmate(board, defender)) {
      m.captured = captured;
      RuleEngine.undoMove(board, m);
      return { found: true, line: [cloneMove(m)] };
    }

    if (depth > 1) {
      const replies = RuleEngine.generateLegalMoves(board, defender);
      // 对方有合法应着才可能形成“强制将杀”；若对方已无着法那是困毙（不计为将杀）。
      if (replies.length > 0) {
        let allLose = true;
        let toughestReply = null;
        let toughestLine = null;
        let toughestDepth = -1;

        for (const r of replies) {
          const cr = RuleEngine.makeMove(board, r);
          const sub = canForceMate(board, attacker, depth - 1);
          r.captured = cr;
          RuleEngine.undoMove(board, r);

          if (!sub.found) {
            allLose = false;
            break;
          }
          // 记录最顽强防守：让进攻方花最多着法的应着。
          const subLen = sub.line ? sub.line.length : 0;
          if (subLen > toughestDepth) {
            toughestDepth = subLen;
            toughestReply = cloneMove(r);
            toughestLine = sub.line;
          }
        }

        if (allLose) {
          m.captured = captured;
          RuleEngine.undoMove(board, m);
          return {
            found: true,
            line: [cloneMove(m), toughestReply, ...(toughestLine || [])],
          };
        }
      }
    }

    m.captured = captured;
    RuleEngine.undoMove(board, m);
  }

  return { found: false };
}

/** 着法排序：吃子优先（仅影响搜索顺序，便于尽早命中）。 */
function orderForMate(board, moves) {
  moves.sort((a, b) => {
    const ca = board[a.toRow][a.toCol] ? 1 : 0;
    const cb = board[b.toRow][b.toCol] ? 1 : 0;
    return cb - ca;
  });
}

function cloneMove(m) {
  return { fromRow: m.fromRow, fromCol: m.fromCol, toRow: m.toRow, toCol: m.toCol };
}

/**
 * 求最短受迫将杀。side 先走，在 [1, maxDepth] 内逐层加深。
 * @param {(string|null)[][]} board 原棋盘（内部克隆，不修改入参）
 * @param {'red'|'black'} side
 * @param {number} maxDepth 最大进攻着法数
 * @returns {{found:boolean, depth:number, line:Move[]}}
 */
export function findForcedMate(board, side, maxDepth = 3) {
  const work = RuleEngine.cloneBoard(board);
  for (let d = 1; d <= maxDepth; d++) {
    const res = canForceMate(work, side, d);
    if (res.found) {
      return { found: true, depth: d, line: res.line };
    }
  }
  return { found: false, depth: 0, line: [] };
}

/**
 * 给定 defender 即将应着的局面，选出“最顽强防守”着法：
 *   在仍被强制将杀的前提下，让进攻方耗费最多着法的应着；
 *   若某应着能逃脱（说明此前局面本非强制将杀），返回能逃脱的应着。
 * 用于题库自动替对手应着，保证解题主线连续且具教学意义。
 * @param {(string|null)[][]} board
 * @param {'red'|'black'} defender 即将走子的防守方
 * @param {number} maxDepth 进攻方剩余可用的将杀深度
 * @returns {Move|null}
 */
export function bestDefense(board, defender, maxDepth = 3) {
  const attacker = opponent(defender);
  const work = RuleEngine.cloneBoard(board);
  const replies = RuleEngine.generateLegalMoves(work, defender);
  if (replies.length === 0) return null;

  let best = replies[0];
  let bestResist = -1;
  let foundEscape = null;

  for (const r of replies) {
    const cr = RuleEngine.makeMove(work, r);
    const sub = canForceMate(work, attacker, maxDepth);
    r.captured = cr;
    RuleEngine.undoMove(work, r);

    if (!sub.found) {
      foundEscape = cloneMove(r); // 能逃脱将杀
      continue;
    }
    const resist = sub.line ? sub.line.length : 0;
    if (resist > bestResist) {
      bestResist = resist;
      best = r;
    }
  }

  // 若存在逃脱着法，说明局面不是强制将杀；返回逃脱着法（防守成功）。
  if (foundEscape) return foundEscape;
  return cloneMove(best);
}

/**
 * 判断 attacker 走 move 后是否仍保持「depth 步内强制将杀」。
 * 用于题库判定：任何能维持强制将杀的着法都算正解（而非只认死板主线）。
 * @param {(string|null)[][]} board 走 move 之前的局面
 * @param {'red'|'black'} attacker
 * @param {Move} move
 * @param {number} depth 走 move 之前的强制将杀深度（move 后应能 depth-1 内杀）
 * @returns {boolean}
 */
export function keepsForcedMate(board, attacker, move, depth) {
  const work = RuleEngine.cloneBoard(board);
  const defender = opponent(attacker);
  const cap = RuleEngine.makeMove(work, move);

  // 立即将死即为正解。
  if (RuleEngine.isCheckmate(work, defender)) {
    return true;
  }
  if (depth <= 1) return false; // 本应一步成杀却未成杀。

  const replies = RuleEngine.generateLegalMoves(work, defender);
  if (replies.length === 0) return false; // 困毙不算将杀正解。

  for (const r of replies) {
    const cr = RuleEngine.makeMove(work, r);
    const sub = canForceMate(work, attacker, depth - 1);
    r.captured = cr;
    RuleEngine.undoMove(work, r);
    if (!sub.found) return false; // 存在应着可逃脱 ⇒ 此着非正解。
  }
  move.captured = cap;
  return true;
}

/**
 * 进攻方（attacker 先走）是否存在一步将杀。AI 杀棋检测便捷接口。
 * @returns {Move|null} 成杀着法或 null
 */
export function findMateInOne(board, attacker) {
  const work = RuleEngine.cloneBoard(board);
  const defender = opponent(attacker);
  for (const m of RuleEngine.generateLegalMoves(work, attacker)) {
    const cap = RuleEngine.makeMove(work, m);
    const mate = RuleEngine.isCheckmate(work, defender);
    m.captured = cap;
    RuleEngine.undoMove(work, m);
    if (mate) return cloneMove(m);
  }
  return null;
}
