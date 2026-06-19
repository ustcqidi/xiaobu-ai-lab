// data/library.js
// 统一题库：把人工精编题（puzzles.js / endgames.js，均经严格测试）与
// 自动生成题（generated.js，经 MateSolver 验证）合并为带元数据的分类题库。
//
// 统一 schema：
//   { id, name, fen, side:'red', type, difficulty:1..5, solution:Move[], hint? }
//   type ∈ 'mate1' | 'mate2' | 'mate3' | 'endgame'
//
// 运行时由 PuzzleManager 消费；解题推进、提示、答案均由 MateSolver 动态求解，
// 不依赖每题预先写好的对手应着。

import { oneMoveMates, twoMoveMates } from './puzzles.js';
import { endgames } from './endgames.js';
import { genMate1, genMate2, genMate3 } from './generated.js';
import { classicEndgames } from './classicEndgames.js';

function normalize(list, type, difficultyFn) {
  return list.map((p, i) => ({
    id: p.id,
    name: p.name,
    fen: p.fen,
    side: p.side || 'red',
    type: p.type || type,
    difficulty: p.difficulty || difficultyFn(p, i),
    solution: p.solution,
    hint: p.hint || null,
    desc: p.desc || null,
  }));
}

export const CATEGORY_META = {
  mate1: { key: 'mate1', label: '一步杀', icon: '①' },
  mate2: { key: 'mate2', label: '两步杀', icon: '②' },
  mate3: { key: 'mate3', label: '三步杀', icon: '③' },
  endgame: { key: 'endgame', label: '实战残局', icon: '残' },
  classic: { key: 'classic', label: '经典排局', icon: '谱' },
};

export const LIBRARY = {
  // 人工精编一步杀（难度1）+ 自动生成一步杀（难度1）
  mate1: [
    ...normalize(oneMoveMates, 'mate1', () => 1),
    ...normalize(genMate1, 'mate1', () => 1),
  ],
  // 人工精编两步杀（难度2）+ 自动生成两步杀（难度2）
  mate2: [
    ...normalize(twoMoveMates, 'mate2', () => 2),
    ...normalize(genMate2, 'mate2', () => 2),
  ],
  // 自动生成三步杀（难度4）
  mate3: [...normalize(genMate3, 'mate3', () => 4)],
  // 人工精编残局（难度按序 3~5）
  endgame: [...normalize(endgames, 'endgame', (_p, i) => 3 + Math.min(2, Math.floor(i / 5)))],
  // 经典江湖排局（古谱原图，难度 5）
  classic: [...normalize(classicEndgames, 'classic', () => 5)],
};

/** 题库总题数。 */
export function totalPuzzles() {
  return Object.values(LIBRARY).reduce((n, list) => n + list.length, 0);
}

/** 扁平化全部题目（用于统计/检索）。 */
export function allPuzzles() {
  return Object.values(LIBRARY).flat();
}
