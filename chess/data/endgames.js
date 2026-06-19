// data/endgames.js
// 实战残局题库：改用 tools/genPuzzles.js 自动生成、经 PositionValidator 校验合法
// 且非 3 步速杀的「红优」残局（红方对阵 AI 取胜训练）。
//
// 历史人工残局存在士/象落非法点等不合规问题，已弃用；此处统一从 generated.js 取数。

export { genEndgame as endgames } from './generated.js';
