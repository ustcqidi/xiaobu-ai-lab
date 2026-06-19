// Move.js
// 统一的 Move 结构与辅助函数。
// 项目中禁止使用其它 Move 格式：
//   { fromRow, fromCol, toRow, toCol }

/**
 * 创建一个 Move 对象。
 */
export function createMove(fromRow, fromCol, toRow, toCol) {
  return { fromRow, fromCol, toRow, toCol };
}

/**
 * 两个 Move 是否相等。
 */
export function moveEquals(a, b) {
  return (
    a.fromRow === b.fromRow &&
    a.fromCol === b.fromCol &&
    a.toRow === b.toRow &&
    a.toCol === b.toCol
  );
}

/**
 * 将列号转换为中文纵线（红/黑视角不同，这里给出通用调试串）。
 */
export function moveToString(move) {
  return `(${move.fromRow},${move.fromCol})->(${move.toRow},${move.toCol})`;
}
