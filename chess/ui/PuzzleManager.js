// ui/PuzzleManager.js  — V2
// 题库管理器：加载题目、判定正解、分级提示、成绩评级、失败复盘、切题。
//
// 设计原则：只调用规则引擎(engine/)，绝不自行实现走子/将杀规则。
//   - 杀法题（mate1/2/3）：用 MateSolver 判定“是否维持强制将杀”，
//     任何能维持强制将杀的着法都算正解；对手应着取“最顽强防守”。
//   - 残局题（endgame）：作为「红方对阵 AI 取胜」训练，对手应着由外部注入
//     的 opponentReply 提供；走到将死即过关。
//
// 兼容旧类别键：oneMove→mate1、twoMove→mate2、endgame→endgame。

import { RuleEngine } from '../engine/RuleEngine.js';
import { loadFen } from '../engine/FenManager.js';
import { opponent, RED } from '../engine/Board.js';
import { moveToChinese } from '../engine/Notation.js';
import { findForcedMate, bestDefense, keepsForcedMate } from '../engine/MateSolver.js';
import { LIBRARY } from '../data/library.js';

// 旧→新类别键映射。
const ALIAS = { oneMove: 'mate1', twoMove: 'mate2', endgame: 'endgame' };
const MATE_DEPTH = { mate1: 1, mate2: 2, mate3: 3 };

export class PuzzleManager {
  /**
   * @param {Object} [options]
   * @param {string} [options.category='mate1'] 类别键（新旧均可）
   * @param {Function} [options.opponentReply] (board,color)=>Move 残局对手应着
   * @param {Array}    [options.puzzles] 直接注入题目列表（覆盖 category）
   */
  constructor(options = {}) {
    const { category = 'mate1', puzzles, opponentReply } = options;
    this.opponentReply = opponentReply || null;

    if (puzzles) {
      this.category = 'custom';
      this.puzzles = puzzles.slice();
    } else {
      this.setCategory(category);
    }
    this.index = 0;
    this._load(this.index);
  }

  static categoryNames() {
    return Object.keys(LIBRARY);
  }

  /** 切换类别并回到第 0 题（保留外部传入的类别键以兼容旧断言）。 */
  setCategory(category) {
    const resolved = ALIAS[category] || category;
    const list = LIBRARY[resolved];
    if (!list) throw new Error(`未知题库类别: ${category}`);
    this.category = category; // 保留原始键
    this._resolvedCategory = resolved;
    this.puzzles = list;
    this.index = 0;
    this._load(this.index);
    return this.current;
  }

  get current() {
    return this.puzzles[this.index] ?? null;
  }
  get total() {
    return this.puzzles.length;
  }

  _mateDepthForCurrent() {
    const p = this.current;
    if (!p) return 0;
    return MATE_DEPTH[p.type] || MATE_DEPTH[ALIAS[this.category]] || 0;
  }

  _load(i) {
    const puzzle = this.puzzles[i];
    if (!puzzle) {
      this.board = null;
      this.turn = null;
      return;
    }
    const { board, turn } = loadFen(puzzle.fen);
    this.board = board;
    this.turn = turn;
    this.solved = false;
    // 杀法题：记录当前强制将杀剩余深度（随解题推进递减）。
    const maxD = this._mateDepthForCurrent();
    this.remainingDepth = maxD ? findForcedMate(board, turn, maxD).depth || maxD : 0;
    // 成绩追踪。
    this._resetTracking();
  }

  _resetTracking() {
    this.startTime = Date.now();
    this.hintLevel = 0;
    this.errorCount = 0;
    this.wrongMoves = [];
    this.answerRevealed = false;
  }

  goTo(i) {
    if (i < 0 || i >= this.puzzles.length) throw new Error('题目下标越界');
    this.index = i;
    this._load(i);
    return this.current;
  }
  next() {
    this.index = (this.index + 1) % this.puzzles.length;
    this._load(this.index);
    return this.current;
  }
  prev() {
    this.index = (this.index - 1 + this.puzzles.length) % this.puzzles.length;
    this._load(this.index);
    return this.current;
  }
  reset() {
    this._load(this.index);
    return this.current;
  }

  isLegal(move) {
    if (!this.board) return false;
    return RuleEngine.isLegalMove(this.board, move, this.turn);
  }

  /** 当前题是否为残局类型（实战残局或经典排局，均为对阵 AI 取胜/打谱）。 */
  isEndgame() {
    const t = this.current && this.current.type;
    return (
      t === 'endgame' ||
      t === 'classic' ||
      this._resolvedCategory === 'endgame' ||
      this._resolvedCategory === 'classic'
    );
  }

  /**
   * 提交一步用户走法。
   * @returns {{ok,solved,reason?,autoReply?,illegal?}}
   */
  submitMove(move) {
    const puzzle = this.current;
    if (!puzzle) return { ok: false, solved: false, reason: '无题目' };
    if (this.solved) return { ok: true, solved: true };

    if (!this.isLegal(move)) {
      return { ok: false, solved: false, illegal: true, reason: '走法不合法' };
    }

    return this.isEndgame() ? this._submitEndgame(move) : this._submitMate(move);
  }

  // ---- 杀法题：用强制将杀判定正解 ----
  _submitMate(move) {
    const side = this.turn;
    const depth = this.remainingDepth || this._mateDepthForCurrent();

    const correct = keepsForcedMate(this.board, side, move, depth);
    if (!correct) {
      this.errorCount++;
      this.wrongMoves.push(moveToChinese(this.board, move));
      return { ok: false, solved: false, reason: '这一步无法构成杀棋，再想想' };
    }

    RuleEngine.makeMove(this.board, move);
    this.turn = opponent(side);

    if (RuleEngine.isCheckmate(this.board, this.turn)) {
      this.solved = true;
      return { ok: true, solved: true };
    }

    // 自动替对手走最顽强防守。
    const reply = bestDefense(this.board, this.turn, depth - 1);
    if (reply) {
      RuleEngine.makeMove(this.board, reply);
      this.turn = opponent(this.turn);
      this.remainingDepth = Math.max(1, depth - 1);
      return { ok: true, solved: false, autoReply: reply };
    }
    return { ok: true, solved: false };
  }

  // ---- 残局题：对阵 AI 取胜（对手应着由外部注入）----
  _submitEndgame(move) {
    const side = this.turn;
    RuleEngine.makeMove(this.board, move);
    this.turn = opponent(side);

    if (RuleEngine.isCheckmate(this.board, this.turn)) {
      this.solved = true;
      return { ok: true, solved: true };
    }
    if (RuleEngine.isStalemate(this.board, this.turn)) {
      // 把对手困毙也算取胜。
      this.solved = true;
      return { ok: true, solved: true };
    }

    let reply = null;
    if (this.opponentReply) reply = this.opponentReply(this.board, this.turn);
    if (!reply) reply = RuleEngine.generateLegalMoves(this.board, this.turn)[0] || null;
    if (reply) {
      RuleEngine.makeMove(this.board, reply);
      this.turn = opponent(this.turn);
    }
    return { ok: true, solved: false, autoReply: reply };
  }

  // ---- 分级提示 ----
  /** 当前应走的正解首着（用于提示/答案显示）。 */
  _expectedMove() {
    const p = this.current;
    if (!p) return null;
    const maxD = this._mateDepthForCurrent();
    if (maxD) {
      const res = findForcedMate(this.board, this.turn, this.remainingDepth || maxD);
      if (res.found && res.line[0]) return res.line[0];
    }
    // 残局/兜底：用题目预存 solution[0]（仅当仍处初始局面时有效）。
    return p.solution && p.solution[0] ? p.solution[0] : null;
  }

  /**
   * 取下一级提示文本并累计提示次数。
   *   1 级：进攻方向；2 级：关键子力；3 级：推荐着法（记谱）。
   * @returns {{level:number, text:string}}
   */
  nextHint() {
    this.hintLevel = Math.min(3, this.hintLevel + 1);
    return { level: this.hintLevel, text: this.hintTextFor(this.hintLevel) };
  }

  hintTextFor(level) {
    const mv = this._expectedMove();
    if (!mv) return this.current?.hint || '试着用强子逼近对方将门。';
    const region = this._regionText(mv);
    switch (level) {
      case 1:
        return `一级提示：从${region}寻找突破，先制造将军威胁。`;
      case 2: {
        const name = moveToChinese(this.board, { ...mv, toRow: mv.fromRow, toCol: mv.fromCol })
          .replace(/[平进退].*$/, '');
        return `二级提示：关键子力是「${name}」，注意它能直接参与杀棋。`;
      }
      case 3:
      default:
        return `三级提示：推荐着法「${moveToChinese(this.board, mv)}」。`;
    }
  }

  _regionText(mv) {
    const col = mv.toCol;
    if (col <= 2) return '右翼（黑方右侧）';
    if (col >= 6) return '左翼（黑方左侧）';
    return '中路';
  }

  // ---- 兼容旧接口 ----
  /** 提示起点（不给终点）。 */
  hintMove() {
    const p = this.current;
    if (!p || !p.solution || !p.solution[0]) return null;
    return { fromRow: p.solution[0].fromRow, fromCol: p.solution[0].fromCol };
  }
  /** 题目自带文字提示。 */
  hintText() {
    return this.current ? this.current.hint || this.hintTextFor(1) : null;
  }
  /** 完整答案（解法着法数组拷贝）。 */
  showAnswer() {
    const p = this.current;
    if (!p) return [];
    this.answerRevealed = true;
    return (p.solution || []).map((m) => ({ ...m }));
  }

  /** 答案的记谱形式（基于初始局面求解出的主线）。 */
  answerNotation() {
    const p = this.current;
    if (!p) return [];
    const { board, turn } = loadFen(p.fen);
    const maxD = this._mateDepthForCurrent();
    // 经典排局等无预存解法的题目：不强行展开主线。
    if (!p.solution || !p.solution.length) return [];
    if (!maxD) return p.solution.map((m) => moveToChinese(board, m));
    const res = findForcedMate(board, turn, maxD);
    if (!res.found) return p.solution.map((m) => moveToChinese(board, m));
    // 沿主线逐步记谱（含对手应着）。
    const work = RuleEngine.cloneBoard(board);
    const out = [];
    for (const m of res.line) {
      out.push(moveToChinese(work, m));
      RuleEngine.makeMove(work, m);
    }
    return out;
  }

  // ---- 成绩评级 ----
  /**
   * 评级 S/A/B/C/D：综合提示、错误、是否看答案、用时。
   * @returns {{rating, timeMs, hints, errors}}
   */
  grade() {
    const timeMs = Date.now() - this.startTime;
    const depth = this._mateDepthForCurrent() || 1;
    const par = depth * 20000; // 每步 20s 基准
    let rating;
    if (this.answerRevealed || this.errorCount >= 4 || this.hintLevel >= 3) rating = 'D';
    else if (this.errorCount === 0 && this.hintLevel === 0 && timeMs <= par) rating = 'S';
    else if (this.errorCount <= 1 && this.hintLevel <= 1) rating = 'A';
    else if (this.errorCount <= 2 && this.hintLevel <= 2) rating = 'B';
    else rating = 'C';
    return { rating, timeMs, hints: this.hintLevel, errors: this.errorCount };
  }

  /** 失败/复盘信息：你走的错着 vs 正确答案。 */
  review() {
    return {
      wrong: this.wrongMoves.slice(),
      correct: this.answerNotation(),
      explanation:
        this.current && this.current.type === 'endgame'
          ? '残局取胜要点：限制对方将的活动、保留进攻子力、稳步逼近将门。'
          : '正解会形成无法解救的将军（强制将杀）；错着往往给了对方解将或脱身的机会。',
    };
  }
}

export default PuzzleManager;
