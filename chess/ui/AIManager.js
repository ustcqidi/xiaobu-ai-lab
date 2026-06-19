// AIManager.js  (Agent 4) — V2 统一搜索 AI
// 规范铁律：AI 禁止自己实现规则，所有走法/合法性/将死判定一律调用 RuleEngine。
//
// V2 改动（移除随机/贪心，统一为搜索 AI，按深度分级）：
//   新手 novice=1  普通 normal=2  困难 expert=3  大师 master=4  宗师 grandmaster=5
//   兼容旧难度键：easy=1 / medium=2 / hard=3（供既有测试使用）。
//
// 算法：迭代加深 + Alpha-Beta + 着法排序（PV 着法、MVV-LVA 吃子、杀手着法）
//   + 时间上限（保证 UI 响应）+ 杀棋优先（MATE_SCORE 随 ply 衰减偏好快杀）。
// 思考可视化：通过 opts.onInfo({depth,score,nodes}) 回调上报每层结果。

import { RuleEngine } from '../engine/RuleEngine.js';
import { opponent, typeOf } from '../engine/Board.js';
import { evaluate, PIECE_VALUE } from '../engine/Evaluation.js';

const MATE_SCORE = 1000000;

// 难度 → 搜索配置：maxDepth 目标深度；timeLimit 单步思考时间上限(ms)。
const LEVELS = {
  // 新分级
  novice: { depth: 1, time: 250 },
  normal: { depth: 2, time: 600 },
  expert: { depth: 3, time: 1300 },
  master: { depth: 4, time: 2600 },
  grandmaster: { depth: 5, time: 4800 },
  // 兼容旧键
  easy: { depth: 1, time: 250 },
  medium: { depth: 2, time: 600 },
  hard: { depth: 3, time: 1300 },
};

export class AIManager {
  constructor() {
    this._killers = []; // 每层两枚杀手着法
    this._nodes = 0;
  }

  /**
   * 计算 AI 着法（同步返回）。
   * @param {(string|null)[][]} board
   * @param {'red'|'black'} turn
   * @param {string|number} difficulty 难度键或直接给定深度数字
   * @param {{onInfo?:Function,timeLimit?:number,maxDepth?:number}} [opts]
   * @returns {{fromRow,fromCol,toRow,toCol}|null}
   */
  getAIMove(board, turn, difficulty = 'expert', opts = {}) {
    const moves = RuleEngine.generateLegalMoves(board, turn);
    if (moves.length === 0) return null;
    if (moves.length === 1) return moves[0];

    const cfg = this._resolveLevel(difficulty, opts);
    return this._iterativeDeepening(board, turn, cfg, opts.onInfo);
  }

  _resolveLevel(difficulty, opts) {
    let base;
    if (typeof difficulty === 'number') {
      base = { depth: Math.max(1, Math.min(6, difficulty)), time: 400 * difficulty };
    } else {
      base = LEVELS[difficulty] || LEVELS.expert;
    }
    return {
      depth: opts.maxDepth || base.depth,
      time: opts.timeLimit || base.time,
    };
  }

  // ---- 迭代加深：逐层加深，超时返回上一完整层的最优着 ----
  _iterativeDeepening(board, root, cfg, onInfo) {
    const deadline = Date.now() + cfg.time;
    this._killers = Array.from({ length: cfg.depth + 2 }, () => []);
    let best = null;
    let bestScore = 0;

    for (let depth = 1; depth <= cfg.depth; depth++) {
      this._nodes = 0;
      this._deadline = deadline;
      this._aborted = false;

      const result = this._searchRoot(board, root, depth, best);

      if (this._aborted && best) break; // 本层未完成，沿用上一层结果
      if (result.move) {
        best = result.move;
        bestScore = result.score;
        if (onInfo) onInfo({ depth, score: bestScore, nodes: this._nodes });
        // 已找到将杀，无需更深。
        if (Math.abs(bestScore) >= MATE_SCORE - 100) break;
      }
      if (Date.now() >= deadline) break;
    }
    return best || RuleEngine.generateLegalMoves(board, root)[0];
  }

  _searchRoot(board, root, depth, pvMove) {
    const moves = this._order(board, RuleEngine.generateLegalMoves(board, root), pvMove, 0);
    let best = null;
    let bestScore = -Infinity;
    let alpha = -Infinity;
    const beta = Infinity;

    for (const m of moves) {
      const captured = RuleEngine.makeMove(board, m);
      const score = -this._alphabeta(board, opponent(root), root, depth - 1, -beta, -alpha, 1);
      m.captured = captured;
      RuleEngine.undoMove(board, m);

      if (this._aborted) return { move: best, score: bestScore };

      if (score > bestScore) {
        bestScore = score;
        best = m;
      }
      if (score > alpha) alpha = score;
    }
    return { move: best, score: bestScore };
  }

  /**
   * Negamax + Alpha-Beta。分值始终从“当前走子方 turn”视角返回（越大越好）。
   * 终局/将死分值以 root 无关的对称方式给出（negamax 自然处理符号）。
   */
  _alphabeta(board, turn, root, depth, alpha, beta, ply) {
    this._nodes++;
    if ((this._nodes & 1023) === 0 && Date.now() >= this._deadline) {
      this._aborted = true;
      return 0;
    }

    const moves = RuleEngine.generateLegalMoves(board, turn);
    if (moves.length === 0) {
      // 无着可走：被将死或困毙，均判负 ⇒ 当前方极差（越快被杀越差）。
      return -(MATE_SCORE - ply);
    }
    if (depth <= 0) {
      // 叶子：从 turn 视角评估。
      return evaluate(board, turn);
    }

    const ordered = this._order(board, moves, null, ply);
    let value = -Infinity;
    let bestLocal = null;

    for (const m of ordered) {
      const captured = RuleEngine.makeMove(board, m);
      const score = -this._alphabeta(board, opponent(turn), root, depth - 1, -beta, -alpha, ply + 1);
      m.captured = captured;
      RuleEngine.undoMove(board, m);

      if (this._aborted) return value === -Infinity ? 0 : value;

      if (score > value) {
        value = score;
        bestLocal = m;
      }
      if (value > alpha) alpha = value;
      if (alpha >= beta) {
        // beta 截断：非吃子着记入杀手着法。
        if (!captured) this._storeKiller(ply, m);
        break;
      }
    }
    return value;
  }

  // ---- 着法排序：PV 着法 → 吃子(MVV-LVA) → 杀手着法 → 其余 ----
  _order(board, moves, pvMove, ply) {
    const killers = this._killers[ply] || [];
    return moves
      .map((m) => {
        let s = 0;
        const victim = board[m.toRow][m.toCol];
        if (pvMove && this._same(m, pvMove)) s += 1000000;
        if (victim) {
          const attacker = board[m.fromRow][m.fromCol];
          s += 10000 + (PIECE_VALUE[typeOf(victim)] || 0) - (PIECE_VALUE[typeOf(attacker)] || 0) / 10;
        } else if (killers.some((k) => this._same(k, m))) {
          s += 9000;
        }
        return { m, s };
      })
      .sort((a, b) => b.s - a.s)
      .map((x) => x.m);
  }

  _storeKiller(ply, m) {
    const arr = this._killers[ply] || (this._killers[ply] = []);
    if (arr.some((k) => this._same(k, m))) return;
    arr.unshift({ fromRow: m.fromRow, fromCol: m.fromCol, toRow: m.toRow, toCol: m.toCol });
    if (arr.length > 2) arr.pop();
  }

  _same(a, b) {
    return (
      a && b &&
      a.fromRow === b.fromRow && a.fromCol === b.fromCol &&
      a.toRow === b.toRow && a.toCol === b.toCol
    );
  }
}
