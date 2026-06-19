// ui/StatsManager.js
// 用户统计中心 + 成就系统。持久化到 Storage（浏览器 localStorage / Node 内存）。
//
// 记录：
//   人机对战：对局数、胜、负、和、当前连胜、最高连胜。
//   残局/题库：已解题集合、单题最佳成绩（时间/提示/错误/评级）、最快解题时间、总解题数。
// 成就：达到条件即解锁，返回新解锁项供 UI 弹窗。

import { Storage } from './Storage.js';

const STATS_KEY = 'xq.stats.v2';
const ACH_KEY = 'xq.achievements.v2';

const DEFAULT_STATS = () => ({
  ai: { games: 0, wins: 0, losses: 0, draws: 0, currentStreak: 0, bestStreak: 0 },
  puzzle: { solved: {}, fastestSolveMs: null, totalSolved: 0 },
});

// 成就定义：id / 名称 / 描述 / 判定函数。
export const ACHIEVEMENTS = [
  { id: 'first_blood', name: '旗开得胜', desc: '赢得第一局人机对战', test: (s) => s.ai.wins >= 1 },
  { id: 'streak_10', name: '十连胜', desc: '人机对战达成 10 连胜', test: (s) => s.ai.bestStreak >= 10 },
  { id: 'win_100', name: '百胜将军', desc: '人机对战累计胜场达到 100', test: (s) => s.ai.wins >= 100 },
  { id: 'puzzle_first', name: '残局新手', desc: '完成第一道残局/杀法题', test: (s) => s.puzzle.totalSolved >= 1 },
  { id: 'puzzle_20', name: '杀法熟手', desc: '累计完成 20 道题', test: (s) => s.puzzle.totalSolved >= 20 },
  { id: 'puzzle_50', name: '残局大师', desc: '累计完成 50 道题', test: (s) => s.puzzle.totalSolved >= 50 },
  {
    id: 'mate1_expert',
    name: '一步杀专家',
    desc: '完成 20 道一步杀',
    test: (s) => countSolvedByType(s, 'mate1') >= 20,
  },
  {
    id: 'flawless',
    name: '一气呵成',
    desc: '零提示零错误完成一道两步杀及以上',
    test: (s) =>
      Object.values(s.puzzle.solved).some(
        (rec) => rec.hints === 0 && rec.errors === 0 && (rec.type === 'mate2' || rec.type === 'mate3')
      ),
  },
];

function countSolvedByType(stats, type) {
  return Object.values(stats.puzzle.solved).filter((r) => r.type === type).length;
}

export class StatsManager {
  constructor() {
    this.stats = Object.assign(DEFAULT_STATS(), Storage.get(STATS_KEY, {}));
    // 兼容字段缺省。
    this.stats.ai = Object.assign(DEFAULT_STATS().ai, this.stats.ai || {});
    this.stats.puzzle = Object.assign(DEFAULT_STATS().puzzle, this.stats.puzzle || {});
    this.unlocked = new Set(Storage.get(ACH_KEY, []));
  }

  _save() {
    Storage.set(STATS_KEY, this.stats);
    Storage.set(ACH_KEY, [...this.unlocked]);
  }

  /**
   * 记录一局人机结果。
   * @param {'win'|'loss'|'draw'} result
   * @returns {object[]} 新解锁成就
   */
  recordAIResult(result) {
    const ai = this.stats.ai;
    ai.games++;
    if (result === 'win') {
      ai.wins++;
      ai.currentStreak++;
      ai.bestStreak = Math.max(ai.bestStreak, ai.currentStreak);
    } else if (result === 'loss') {
      ai.losses++;
      ai.currentStreak = 0;
    } else {
      ai.draws++;
      ai.currentStreak = 0;
    }
    return this._commit();
  }

  /**
   * 记录一道题完成成绩（仅在更优时更新单题最佳）。
   * @param {string} id
   * @param {{type:string,timeMs:number,hints:number,errors:number,rating:string}} rec
   * @returns {object[]} 新解锁成就
   */
  recordPuzzleSolved(id, rec) {
    const p = this.stats.puzzle;
    const prev = p.solved[id];
    const isNew = !prev;
    if (isNew || rec.timeMs < prev.timeMs) {
      p.solved[id] = { ...rec };
    }
    if (isNew) p.totalSolved++;
    if (p.fastestSolveMs == null || rec.timeMs < p.fastestSolveMs) {
      p.fastestSolveMs = rec.timeMs;
    }
    return this._commit();
  }

  isPuzzleSolved(id) {
    return !!this.stats.puzzle.solved[id];
  }

  bestRecord(id) {
    return this.stats.puzzle.solved[id] || null;
  }

  /** 检查并解锁满足条件的成就，返回新解锁列表。 */
  _commit() {
    const newly = [];
    for (const a of ACHIEVEMENTS) {
      if (!this.unlocked.has(a.id) && a.test(this.stats)) {
        this.unlocked.add(a.id);
        newly.push(a);
      }
    }
    this._save();
    return newly;
  }

  /** UI 概览数据。 */
  summary() {
    const ai = this.stats.ai;
    const winRate = ai.games ? Math.round((ai.wins / ai.games) * 100) : 0;
    return {
      ai: { ...ai, winRate },
      puzzle: {
        totalSolved: this.stats.puzzle.totalSolved,
        fastestSolveMs: this.stats.puzzle.fastestSolveMs,
        avgTimeMs: this._avgSolveTime(),
      },
      achievements: ACHIEVEMENTS.map((a) => ({ ...a, unlocked: this.unlocked.has(a.id) })),
    };
  }

  _avgSolveTime() {
    const recs = Object.values(this.stats.puzzle.solved);
    if (recs.length === 0) return null;
    return Math.round(recs.reduce((s, r) => s + r.timeMs, 0) / recs.length);
  }

  reset() {
    this.stats = DEFAULT_STATS();
    this.unlocked = new Set();
    this._save();
  }
}
