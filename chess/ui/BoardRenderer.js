// BoardRenderer.js  (Agent 1)
// 负责把局面画到 Canvas 上，并提供像素↔棋盘坐标转换、走法高亮、将军特效。
// 严格只做"显示"，不含任何规则逻辑。
//
// 渲染采用全量重绘（immediate mode）：每帧根据传入 state 画整张棋盘，
// 棋盘规模很小，FPS 远超 60。
//
// 接口（规范要求）：
//   drawBoard(board)          —— 见 render(state)
//   highlightMoves(moves)     —— 通过 render 的 state.legalTargets 实现
//   showCheckEffect()         —— 通过 state.checkCell + 闪烁强度实现
//   showVictoryEffect()       —— 由 EffectManager 叠加（Phase 3）

import { ROWS, COLS, colorOf, typeOf, RED } from '../engine/Board.js';

// 棋子显示汉字
const GLYPH = {
  red: { K: '帅', A: '仕', B: '相', N: '马', R: '车', C: '炮', P: '兵' },
  black: { K: '将', A: '士', B: '象', N: '马', R: '车', C: '炮', P: '卒' },
};

export class BoardRenderer {
  constructor(canvas, options = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    // 加大棋盘：更大的格距与外边距，使边缘坐标数字有充足留白、不被棋子或外框遮挡。
    this.margin = options.margin ?? 60;
    this.grid = options.grid ?? 66;
    // 棋子半径相对格距收紧到 0.42，保证棋子完全落在交叉点内、互不相压。
    this.pieceR = options.pieceRadius ?? this.grid * 0.42;

    this.baseW = this.margin * 2 + this.grid * (COLS - 1);
    this.baseH = this.margin * 2 + this.grid * (ROWS - 1);

    this._setupHiDPI();
  }

  _setupHiDPI() {
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = this.baseW * dpr;
    this.canvas.height = this.baseH * dpr;
    this.canvas.style.width = this.baseW + 'px';
    this.canvas.style.height = this.baseH + 'px';
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  // 棋盘交点 -> 像素中心
  cellToPixel(row, col) {
    return { x: this.margin + col * this.grid, y: this.margin + row * this.grid };
  }

  // 像素（相对 canvas 显示区域的 client 坐标）-> 最近交点；超出容差返回 null
  pixelToCell(clientX, clientY) {
    const rect = this.canvas.getBoundingClientRect();
    const sx = this.baseW / rect.width;
    const sy = this.baseH / rect.height;
    const x = (clientX - rect.left) * sx;
    const y = (clientY - rect.top) * sy;
    const col = Math.round((x - this.margin) / this.grid);
    const row = Math.round((y - this.margin) / this.grid);
    if (row < 0 || row >= ROWS || col < 0 || col >= COLS) return null;
    const p = this.cellToPixel(row, col);
    if (Math.hypot(p.x - x, p.y - y) > this.grid * 0.5) return null;
    return { row, col };
  }

  /**
   * 渲染整个场景。
   * @param {object} state
   *  - board: 棋盘
   *  - selected: {row,col}|null 选中棋子
   *  - legalTargets: Array<{toRow,toCol}> 合法落点
   *  - lastMove: {fromRow,fromCol,toRow,toCol}|null 上一步
   *  - checkCell: {row,col}|null 被将军的将位
   *  - checkPulse: 0~1 将军闪烁强度
   *  - hideCell: {row,col}|null 动画中临时隐藏的棋子
   *  - floating: {piece,x,y}|null 动画中悬浮绘制的棋子
   *  - showCoords: bool 调试坐标
   */
  render(state) {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.baseW, this.baseH);
    this._drawWood();
    this._drawGrid();
    this._drawPalaceDiagonals();
    this._drawRiver();
    this._drawStarPoints();
    if (state.showCoords) this._drawCoords();

    if (state.lastMove) this._drawLastMove(state.lastMove);
    if (state.hintCell) this._drawHint(state.hintCell);
    if (state.selected) this._drawSelection(state.selected);

    // 棋子
    const board = state.board;
    const sel = state.selected;
    const drop = state.drop;
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const piece = board[r][c];
        if (!piece) continue;
        if (state.hideCell && state.hideCell.row === r && state.hideCell.col === c) continue;
        if (sel && sel.row === r && sel.col === c) {
          // 拿起：棋子被托离棋盘，脚下投影凸显高度。
          this._drawPiece(piece, r, c, { lift: state.selectLift ?? 0.9 });
        } else if (drop && drop.row === r && drop.col === c) {
          // 放下：落子瞬间轻微回弹（由大到正）。
          const p = drop.progress;
          this._drawPiece(piece, r, c, { scale: 1 + 0.16 * (1 - p) });
        } else {
          this._drawPiece(piece, r, c);
        }
      }
    }

    if (state.checkCell) this._drawCheck(state.checkCell, state.checkPulse ?? 0);
    if (state.legalTargets) this._drawLegalTargets(state.legalTargets, board);
    if (state.drop) this._drawDropRipple(state.drop);
    if (state.floating) this._drawFloating(state.floating);
  }

  // ---------- 各图层 ----------
  _drawWood() {
    const ctx = this.ctx;
    const g = ctx.createLinearGradient(0, 0, this.baseW, this.baseH);
    g.addColorStop(0, '#f3d9a4');
    g.addColorStop(0.5, '#eccb8c');
    g.addColorStop(1, '#e3bd76');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, this.baseW, this.baseH);
    // 木纹细线
    ctx.strokeStyle = 'rgba(180,140,80,0.12)';
    ctx.lineWidth = 1;
    for (let i = 0; i < this.baseH; i += 7) {
      ctx.beginPath();
      ctx.moveTo(0, i + Math.sin(i * 0.3) * 2);
      ctx.lineTo(this.baseW, i + Math.cos(i * 0.2) * 2);
      ctx.stroke();
    }
  }

  _drawGrid() {
    const ctx = this.ctx;
    ctx.strokeStyle = '#5a3a1a';
    ctx.lineWidth = 1.4;
    const left = this.margin;
    const right = this.margin + (COLS - 1) * this.grid;
    const top = this.margin;
    const bottom = this.margin + (ROWS - 1) * this.grid;

    // 横线：10 条全长
    for (let r = 0; r < ROWS; r++) {
      const y = this.margin + r * this.grid;
      ctx.beginPath();
      ctx.moveTo(left, y);
      ctx.lineTo(right, y);
      ctx.stroke();
    }
    // 竖线：最外两条全长，其余在河界断开
    const riverTop = this.margin + 4 * this.grid;
    const riverBottom = this.margin + 5 * this.grid;
    for (let c = 0; c < COLS; c++) {
      const x = this.margin + c * this.grid;
      if (c === 0 || c === COLS - 1) {
        ctx.beginPath();
        ctx.moveTo(x, top);
        ctx.lineTo(x, bottom);
        ctx.stroke();
      } else {
        ctx.beginPath();
        ctx.moveTo(x, top);
        ctx.lineTo(x, riverTop);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(x, riverBottom);
        ctx.lineTo(x, bottom);
        ctx.stroke();
      }
    }
    // 外框加粗
    ctx.lineWidth = 2.4;
    ctx.strokeRect(left, top, right - left, bottom - top);
  }

  _drawPalaceDiagonals() {
    const ctx = this.ctx;
    ctx.strokeStyle = '#5a3a1a';
    ctx.lineWidth = 1.4;
    const diag = (r1, c1, r2, c2) => {
      const a = this.cellToPixel(r1, c1);
      const b = this.cellToPixel(r2, c2);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    };
    // 黑方九宫 (row0-2)
    diag(0, 3, 2, 5);
    diag(0, 5, 2, 3);
    // 红方九宫 (row7-9)
    diag(7, 3, 9, 5);
    diag(7, 5, 9, 3);
  }

  _drawRiver() {
    const ctx = this.ctx;
    ctx.save();
    ctx.fillStyle = '#7a4a1a';
    ctx.font = `italic ${this.grid * 0.55}px "STKaiti","KaiTi","PingFang SC",serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const y = this.margin + 4.5 * this.grid;
    ctx.fillText('楚 河', this.margin + 2 * this.grid, y);
    ctx.fillText('漢 界', this.margin + 6 * this.grid, y);
    ctx.restore();
  }

  // 兵/炮位的角标
  _drawStarPoints() {
    const pts = [
      [3, 0], [3, 2], [3, 4], [3, 6], [3, 8],
      [6, 0], [6, 2], [6, 4], [6, 6], [6, 8],
      [2, 1], [2, 7], [7, 1], [7, 7],
    ];
    const ctx = this.ctx;
    ctx.strokeStyle = '#5a3a1a';
    ctx.lineWidth = 1.2;
    const d = 5;
    const gap = 4;
    for (const [r, c] of pts) {
      const { x, y } = this.cellToPixel(r, c);
      const corners = [];
      if (c > 0) corners.push(-1);
      if (c < COLS - 1) corners.push(1);
      for (const sx of corners) {
        for (const sy of [-1, 1]) {
          ctx.beginPath();
          ctx.moveTo(x + sx * gap, y + sy * gap);
          ctx.lineTo(x + sx * (gap + d), y + sy * gap);
          ctx.moveTo(x + sx * gap, y + sy * gap);
          ctx.lineTo(x + sx * gap, y + sy * (gap + d));
          ctx.stroke();
        }
      }
    }
  }

  _drawCoords() {
    const ctx = this.ctx;
    ctx.save();
    ctx.fillStyle = 'rgba(74,46,18,0.92)';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const right = this.margin + (COLS - 1) * this.grid;
    const bottom = this.margin + (ROWS - 1) * this.grid;
    const CN = ['一', '二', '三', '四', '五', '六', '七', '八', '九'];

    // 列号：全部画在外边距的留白区，远离最外侧棋子，绝不遮挡。
    ctx.font = 'bold 14px "PingFang SC", monospace';
    // 顶部（黑方视角）：阿拉伯 1~9，自左向右。
    for (let c = 0; c < COLS; c++) {
      ctx.fillText(String(c + 1), this.margin + c * this.grid, this.margin - 32);
    }
    // 底部（红方视角）：汉字 九~一，红方习惯自右向左。
    for (let c = 0; c < COLS; c++) {
      ctx.fillText(CN[8 - c], this.margin + c * this.grid, bottom + 32);
    }

    // 行号 0~9：画在棋盘两侧留白区，便于定位（0 顶部黑底线，9 红底线）。
    ctx.font = '12px "PingFang SC", monospace';
    ctx.fillStyle = 'rgba(74,46,18,0.7)';
    for (let r = 0; r < ROWS; r++) {
      const y = this.margin + r * this.grid;
      ctx.fillText(String(r), this.margin - 36, y);
      ctx.fillText(String(r), right + 36, y);
    }
    ctx.restore();
  }

  /**
   * 画一枚位于交点的棋子。
   * @param {object} [opts]
   *   - lift: 0~1 抬起高度（拿子）：>0 时棋子上移、放大、加深投影，并在脚下投落地阴影。
   *   - scale: 棋子缩放（落子回弹用）。
   */
  _drawPiece(piece, row, col, opts = {}) {
    const { lift = 0, scale = 1 } = opts;
    const { x, y } = this.cellToPixel(row, col);
    const rise = lift * 10;
    if (lift > 0) {
      // 落地投影：留在原交点的暗影，凸显棋子已被托起的高度。
      this._drawGroundShadow(x, y + 3, this.pieceR * (0.92 + lift * 0.12), 0.16 + lift * 0.14);
    }
    const r = this.pieceR * scale * (1 + lift * 0.08);
    this._drawPieceShape(piece, x, y - rise, r, lift);
  }

  _drawFloating({ piece, x, y }) {
    // 行进中的棋子＝被托在手上：脚下投影 + 抬升绘制，强化"提着走"的手感。
    this._drawGroundShadow(x, y + 7, this.pieceR, 0.22);
    this._drawPieceShape(piece, x, y - 10, this.pieceR * 1.06, 1);
  }

  // 棋子本体绘制（底盘渐变 + 内外圈 + 文字），shadow 随 lift 增强。
  _drawPieceShape(piece, x, y, r, lift = 0) {
    const ctx = this.ctx;
    const isRed = colorOf(piece) === RED;

    ctx.save();
    ctx.shadowColor = `rgba(0,0,0,${0.32 + lift * 0.28})`;
    ctx.shadowBlur = 6 + lift * 12;
    ctx.shadowOffsetX = 2 + lift * 2;
    ctx.shadowOffsetY = 3 + lift * 7;
    const grad = ctx.createRadialGradient(x - r * 0.3, y - r * 0.3, r * 0.2, x, y, r);
    grad.addColorStop(0, '#fffdf5');
    grad.addColorStop(1, '#e8d8b0');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    ctx.lineWidth = 1.5;
    ctx.strokeStyle = isRed ? '#b81f1f' : '#1a1a1a';
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x, y, r * 0.82, 0, Math.PI * 2);
    ctx.stroke();

    ctx.fillStyle = isRed ? '#c01f1f' : '#1a1a1a';
    ctx.font = `bold ${r * 1.15}px "STKaiti","KaiTi","PingFang SC",serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(GLYPH[isRed ? 'red' : 'black'][typeOf(piece)], x, y + 1);
  }

  // 椭圆落地投影。
  _drawGroundShadow(x, y, r, alpha) {
    const ctx = this.ctx;
    ctx.save();
    ctx.fillStyle = `rgba(0,0,0,${alpha})`;
    ctx.beginPath();
    if (ctx.ellipse) ctx.ellipse(x, y, r, r * 0.5, 0, 0, Math.PI * 2);
    else ctx.arc(x, y, r * 0.7, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // 放子涟漪：落点向外扩散的双层金色光环 + 中心一闪，制造"落子有声"的明显反馈。
  _drawDropRipple({ row, col, progress }) {
    const ctx = this.ctx;
    const { x, y } = this.cellToPixel(row, col);
    const p = Math.max(0, Math.min(1, progress));
    ctx.save();
    // 落点中心的短暂高光闪一下（前 40%）。
    if (p < 0.4) {
      const f = 1 - p / 0.4;
      ctx.fillStyle = `rgba(255,230,160,${0.45 * f})`;
      ctx.beginPath();
      ctx.arc(x, y, this.pieceR * (0.6 + 0.4 * f), 0, Math.PI * 2);
      ctx.fill();
    }
    // 外圈主涟漪。
    const r1 = this.pieceR + 2 + p * 22;
    ctx.strokeStyle = `rgba(232,192,125,${0.85 * (1 - p)})`;
    ctx.lineWidth = 3.5 * (1 - p) + 1;
    ctx.beginPath();
    ctx.arc(x, y, r1, 0, Math.PI * 2);
    ctx.stroke();
    // 内圈跟随涟漪（稍滞后），层次更明显。
    const p2 = Math.max(0, p - 0.18);
    const r2 = this.pieceR + 2 + p2 * 22;
    ctx.strokeStyle = `rgba(255,224,138,${0.6 * (1 - p)})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y, r2, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  _drawSelection({ row, col }) {
    const ctx = this.ctx;
    const { x, y } = this.cellToPixel(row, col);
    ctx.save();
    // 柔光底盘，突出当前选中。
    const glow = ctx.createRadialGradient(x, y, this.pieceR * 0.4, x, y, this.pieceR + 8);
    glow.addColorStop(0, 'rgba(60,200,90,0.35)');
    glow.addColorStop(1, 'rgba(60,200,90,0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(x, y, this.pieceR + 8, 0, Math.PI * 2);
    ctx.fill();
    // 双环高亮。
    ctx.strokeStyle = '#22b24a';
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.arc(x, y, this.pieceR + 4, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  // 提示：在被提示的棋子处画一圈金色虚线。
  _drawHint({ row, col }) {
    const ctx = this.ctx;
    const { x, y } = this.cellToPixel(row, col);
    ctx.save();
    ctx.strokeStyle = '#e8c24a';
    ctx.lineWidth = 3;
    ctx.setLineDash([5, 4]);
    ctx.beginPath();
    ctx.arc(x, y, this.pieceR + 6, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  _drawLegalTargets(targets, board) {
    const ctx = this.ctx;
    ctx.save();
    for (const t of targets) {
      const { x, y } = this.cellToPixel(t.toRow, t.toCol);
      const occupied = !!board[t.toRow][t.toCol];
      if (occupied) {
        // 可吃：四角括号
        ctx.strokeStyle = 'rgba(200,30,30,0.85)';
        ctx.lineWidth = 3;
        const r = this.pieceR + 2;
        const d = 9;
        for (const sx of [-1, 1]) {
          for (const sy of [-1, 1]) {
            ctx.beginPath();
            ctx.moveTo(x + sx * r, y + sy * r - sy * d);
            ctx.lineTo(x + sx * r, y + sy * r);
            ctx.lineTo(x + sx * r - sx * d, y + sy * r);
            ctx.stroke();
          }
        }
      } else {
        // 可走：实心圆点
        ctx.fillStyle = 'rgba(31,138,46,0.55)';
        ctx.beginPath();
        ctx.arc(x, y, this.grid * 0.16, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  _drawLastMove(move) {
    const ctx = this.ctx;
    ctx.save();
    const s = this.pieceR + 2;
    // 起点：半透明填充；终点：高亮描边方框。最近一步一目了然，便于复盘。
    const from = this.cellToPixel(move.fromRow, move.fromCol);
    ctx.fillStyle = 'rgba(74,163,224,0.18)';
    ctx.fillRect(from.x - s, from.y - s, s * 2, s * 2);
    const to = this.cellToPixel(move.toRow, move.toCol);
    ctx.fillStyle = 'rgba(74,163,224,0.28)';
    ctx.fillRect(to.x - s, to.y - s, s * 2, s * 2);
    ctx.strokeStyle = 'rgba(74,163,224,0.9)';
    ctx.lineWidth = 2.5;
    ctx.strokeRect(to.x - s, to.y - s, s * 2, s * 2);
    ctx.restore();
  }

  _drawCheck({ row, col }, pulse) {
    const ctx = this.ctx;
    const { x, y } = this.cellToPixel(row, col);
    ctx.save();
    ctx.strokeStyle = `rgba(230,30,30,${0.5 + 0.5 * pulse})`;
    ctx.lineWidth = 3 + 3 * pulse;
    ctx.beginPath();
    ctx.arc(x, y, this.pieceR + 4 + 4 * pulse, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
}
