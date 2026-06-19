// data/puzzles.js
// 历史人工杀法题已弃用：原数据存在「士/象落非法点、双将照面、起手对方已被将军」等
// 不符合规则的局面（参见 PositionValidator）。现统一改用 tools/genPuzzles.js 生成、
// 并经 engine/MateSolver 逐题验证的合法题库（data/generated.js）。
//
// 本文件保留导出名以兼容引用方；如需人工精编命名杀型，请新增并确保通过
// validatePosition（士/象只落合法点、无飞将、红先且黑方未被将军）。

/**
 * @typedef {Object} Puzzle
 * @property {string} id
 * @property {string} name
 * @property {string} fen
 * @property {'red'|'black'} side
 * @property {{fromRow:number,fromCol:number,toRow:number,toCol:number}[]} solution
 * @property {string} [hint]
 */

/** @type {Puzzle[]} */
export const oneMoveMates = [];

/** @type {Puzzle[]} */
export const twoMoveMates = [];
