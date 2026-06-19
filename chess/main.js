// main.js  (Agent 0 — Project Manager) — V2
// 模块集成、事件绑定、状态机驱动、模式切换。严禁实现规则：一切合法性都问 RuleEngine。
//
// 模式：
//   'pvp'    双人对战：悔棋/认输/着法记录(中文记谱)/回放
//   'ai'     人机对战：你执红，AI 执黑，五档难度 + 可选每步限时 + 思考可视化
//   'puzzle' 残局/题库：100+ 题、分级提示、评级、失败复盘、题库列表、计时
//
// V2 还包含：统计中心、成就系统、FEN 导入/导出/分享、最近一步高亮、坐标外移。

import { createInitialBoard, cloneBoard, RED, BLACK, opponent, colorOf, typeOf, ROWS, COLS } from './engine/Board.js';
import { RuleEngine } from './engine/RuleEngine.js';
import { findKing, isCheck } from './engine/CheckDetector.js';
import { exportFen, loadFen } from './engine/FenManager.js';
import { createMove } from './engine/Move.js';
import { moveToChinese } from './engine/Notation.js';
import { validatePosition } from './engine/PositionValidator.js';
import { BoardRenderer } from './ui/BoardRenderer.js';
import { AnimationManager } from './ui/AnimationManager.js';
import { AudioManager } from './ui/AudioManager.js';
import { EffectManager } from './ui/EffectManager.js';
import { AIManager } from './ui/AIManager.js';
import { PuzzleManager } from './ui/PuzzleManager.js';
import { StatsManager } from './ui/StatsManager.js';
import { LIBRARY, CATEGORY_META } from './data/library.js';

const MOVE_MS = 150;
const CAPTURE_MS = 200;

// 吃子列表用的棋子汉字。
const GLYPH = {
  red: { K: '帅', A: '仕', B: '相', N: '马', R: '车', C: '炮', P: '兵' },
  black: { K: '将', A: '士', B: '象', N: '马', R: '车', C: '炮', P: '卒' },
};

const $ = (id) => (typeof document !== 'undefined' ? document.getElementById(id) : null);

class GameController {
  constructor() {
    this.canvas = $('board');
    this.renderer = new BoardRenderer(this.canvas);
    this.anim = new AnimationManager();
    this.audio = new AudioManager();
    this.effects = new EffectManager($('overlay'));
    this.ai = new AIManager();
    this.stats = new StatsManager();
    this.puzzle = null;

    this.statusEl = $('status');
    this.turnEl = $('turn');
    this.fenEl = $('fen');
    this.moveListEl = $('move-list');

    this.mode = 'pvp';
    this.aiColor = BLACK;
    this.aiLevel = 'expert';
    this.aiThinking = false;
    this.showCoords = true; // 默认显示坐标，便于定位、避免坐标被忽视
    this.checkPulse = 0;
    this.hintCell = null;
    this._liftRaf = null; // 拿子悬停动画句柄
    this._liftStart = null; // 悬停动画起始时刻
    this._drop = null; // 放子落点回弹/涟漪状态

    // 计时
    this.stepLimit = 0; // 每步限时(秒)，0=不限
    this._timerHandle = null;
    this._remain = 0;

    this._bindEvents();
    this.reset();
  }

  // ============ 通用重置 ============
  reset() {
    this.anim.cancel();
    this.effects.clear();
    this._stopTimer();
    this.aiThinking = false;
    this.selected = null;
    this.legalTargets = [];
    this.lastMove = null;
    this.checkCell = null;
    this.hintCell = null;
    this.gameOver = false;
    this.history = [];
    this.moveLog = [];
    this._floating = null;
    this._hideCell = null;
    this._drop = null;
    this._stopLift();

    if (this.mode === 'puzzle') {
      this.puzzle.reset();
      this._loadPuzzle();
    } else {
      this.board = createInitialBoard();
      this.turn = RED;
      this.setStatus(this.mode === 'ai' ? '你执红，点击棋子走棋' : '点击红方棋子开始');
    }
    this.snapshots = [cloneBoard(this.board)];
    this.viewIndex = 0;
    this.renderMoveList();
    this.render();
    this._startTimerIfNeeded();
  }

  // ============ 事件绑定 ============
  _bindEvents() {
    if (this.canvas) this.canvas.addEventListener('click', (e) => this.onClick(e));
    const on = (id, evt, fn) => {
      const el = $(id);
      if (el) el.addEventListener(evt, fn);
    };
    on('btn-reset', 'click', () => this.reset());
    on('btn-undo', 'click', () => this.undo());
    on('btn-resign', 'click', () => this.resign());
    on('mode', 'change', (e) => this.setMode(e.target.value));
    on('ai-level', 'change', (e) => (this.aiLevel = e.target.value));
    on('ai-steptime', 'change', (e) => {
      this.stepLimit = Number(e.target.value) || 0;
      this._restartTimer();
    });
    on('puzzle-category', 'change', (e) => {
      this.puzzle.setCategory(e.target.value);
      this._syncClassicPick();
      this._afterPuzzleSwitch();
    });
    on('classic-select', 'change', (e) => this._gotoClassic(Number(e.target.value)));
    on('btn-next-puzzle', 'click', () => { this.puzzle.next(); this._afterPuzzleSwitch(); });
    on('btn-prev-puzzle', 'click', () => { this.puzzle.prev(); this._afterPuzzleSwitch(); });
    on('btn-puzzle-reset', 'click', () => { this.puzzle.reset(); this._afterPuzzleSwitch(); });
    on('btn-hint', 'click', () => this.showHint());
    on('btn-answer', 'click', () => this.showAnswer());
    on('btn-hist-prev', 'click', () => this._historyNav(-1));
    on('btn-hist-next', 'click', () => this._historyNav(1));
    on('btn-hist-live', 'click', () => this._historyLive());
    on('btn-fen-load', 'click', () => this.importFen());
    on('btn-fen-copy', 'click', () => this.copyFen());
    on('btn-stats', 'click', () => this.toggleStats());
    on('btn-stats-reset', 'click', () => { this.stats.reset(); this.renderStats(); });
    on('chk-coords', 'change', (e) => { this.showCoords = e.target.checked; this.render(); });
    on('chk-mute', 'change', (e) => this.audio.setMuted(e.target.checked));
    on('rng-vol', 'input', (e) => this.audio.setVolume(Number(e.target.value)));
  }

  // ============ 模式切换 ============
  setMode(mode) {
    this.mode = mode;
    const show = (id, visible) => {
      const el = $(id);
      if (el) el.classList.toggle('hidden', !visible);
    };
    show('group-game', mode !== 'puzzle');
    show('movelist-box', mode !== 'puzzle');
    show('group-puzzle', mode === 'puzzle');
    show('puzzlelist-box', mode === 'puzzle');
    show('puzzle-meta', mode === 'puzzle');
    show('ai-controls', mode === 'ai');

    if (mode === 'puzzle' && !this.puzzle) {
      this.puzzle = new PuzzleManager({
        category: 'mate1',
        // 残局对手应着：用大师级搜索 AI 防守。
        opponentReply: (board, color) => this.ai.getAIMove(board, color, 'master', { timeLimit: 1500 }),
      });
    }
    this.reset();
    if (mode === 'puzzle') {
      this._populateClassicSelect();
      this._syncClassicPick();
      this.renderPuzzleList();
    }
  }

  // 经典残局下拉：填充选项 / 同步显示与选中项 / 跳转。
  _populateClassicSelect() {
    const sel = $('classic-select');
    if (!sel) return;
    const list = LIBRARY.classic || [];
    sel.innerHTML = list.map((p, i) => `<option value="${i}">${i + 1}. ${p.name}</option>`).join('');
  }
  _syncClassicPick() {
    const wrap =
      typeof document !== 'undefined' && typeof document.querySelector === 'function'
        ? document.querySelector('.classic-pick')
        : null;
    const isClassic = this.mode === 'puzzle' && this.puzzle && this.puzzle._resolvedCategory === 'classic';
    if (wrap) wrap.classList.toggle('show', !!isClassic);
    if (isClassic) {
      const sel = $('classic-select');
      if (sel) sel.value = String(this.puzzle.index);
    }
  }
  _gotoClassic(idx) {
    if (this.mode !== 'puzzle' || !this.puzzle) return;
    const catSel = $('puzzle-category');
    if (catSel) catSel.value = 'classic';
    this.puzzle.setCategory('classic');
    this.puzzle.goTo(idx);
    this._syncClassicPick();
    this._afterPuzzleSwitch();
  }

  // ============ 点击分发 ============
  onClick(e) {
    if (this.gameOver || this.anim.running || this.aiThinking) return;
    if (this._isViewingHistory()) { this._historyLive(); return; } // 回放态下点击先回到当前
    const cell = this.renderer.pixelToCell(e.clientX, e.clientY);
    if (!cell) return;
    if (this.mode === 'puzzle') this._onPuzzleClick(cell);
    else this._onPlayClick(cell);
  }

  // ---- pvp / ai 点击 ----
  _onPlayClick(cell) {
    if (this.mode === 'ai' && this.turn === this.aiColor) return;

    if (this.selected) {
      const move = this.legalTargets.find((m) => m.toRow === cell.row && m.toCol === cell.col);
      if (move) {
        this.hintCell = null;
        this.performMove(move, () => this.afterPlayMove());
        return;
      }
      // 再次点击同一颗棋子：把它放下（取消选择），并播放落子特效。
      if (cell.row === this.selected.row && cell.col === this.selected.col) {
        this._putDown(this.selected);
        this.render();
        return;
      }
      // 点击己方其它棋子：换手拿起新子。
      const piece = this.board[cell.row][cell.col];
      if (piece && colorOf(piece) === this.turn) {
        this._select(cell);
        this.render();
        return;
      }
      // 点击空白或非法点：放下取消选择。
      this._putDown(this.selected);
      this.render();
      return;
    }
    this._select(cell);
    this.render();
  }

  _select(cell) {
    this._liftStart = null; // 每次重新拿子，重置悬停动画窗口
    const piece = this.board[cell.row][cell.col];
    if (piece && colorOf(piece) === this.turn) {
      this.selected = cell;
      this.legalTargets = RuleEngine.generateLegalMoves(this.board, this.turn).filter(
        (m) => m.fromRow === cell.row && m.fromCol === cell.col
      );
    } else {
      // 点击空白/对方子 ⇒ 取消选中。
      this.selected = null;
      this.legalTargets = [];
    }
  }

  // ============ 走子动画 ============
  performMove(move, onDone) {
    const movingPiece = this.board[move.fromRow][move.fromCol];
    const isCapture = !!this.board[move.toRow][move.toCol];
    const from = this.renderer.cellToPixel(move.fromRow, move.fromCol);
    const to = this.renderer.cellToPixel(move.toRow, move.toCol);

    this.selected = null;
    this.legalTargets = [];
    this._floating = { piece: movingPiece, x: from.x, y: from.y };
    this._hideCell = { row: move.fromRow, col: move.fromCol };

    this.anim.animateMove(
      from, to, isCapture ? CAPTURE_MS : MOVE_MS,
      (x, y) => { this._floating.x = x; this._floating.y = y; this.render(); },
      () => {
        this._floating = null;
        this._hideCell = null;
        this.commitMove(move, isCapture);
        this._playDrop(move.toRow, move.toCol);
        if (onDone) onDone();
      }
    );
  }

  commitMove(move, isCapture) {
    const mover = this.turn;
    const notation = moveToChinese(this.board, move); // 走子前记谱
    const captured = RuleEngine.makeMove(this.board, move);
    this.lastMove = { ...move };
    this.history.push({ move: { ...move, captured }, mover });
    this.moveLog.push({ notation, mover, capture: !!captured });
    this.snapshots.push(cloneBoard(this.board));
    this.viewIndex = this.moveLog.length;
    isCapture ? this.audio.playCapture() : this.audio.playMove();
    this.turn = opponent(mover);
    this._settle(mover);
    this.renderMoveList();
    this.render();
    if (!this.gameOver) this._restartTimer();
  }

  // 结算将军/绝杀/困毙
  _settle(mover) {
    const next = this.turn;
    if (RuleEngine.isCheckmate(this.board, next)) {
      this.checkCell = findKing(this.board, next);
      this.effects.flashLightning();
      this.audio.playMate();
      this.endGame(`绝杀！${this._name(mover)}胜`, mover);
      return true;
    }
    if (RuleEngine.isStalemate(this.board, next)) {
      this.endGame(`${this._name(next)}被困毙，${this._name(mover)}胜`, mover);
      return true;
    }
    if (RuleEngine.isCheck(this.board, next)) {
      this.checkCell = findKing(this.board, next);
      this.audio.playCheck();
      this.flashCheck();
      this.setStatus(`将军！轮到${this._name(next)}应将（可移将/吃子/垫子/反击）`);
      return false;
    }
    this.checkCell = null;
    this.setStatus(`轮到${this._name(next)}走棋`);
    return false;
  }

  afterPlayMove() {
    if (this.gameOver) return;
    if (this.mode === 'ai' && this.turn === this.aiColor) this.triggerAI();
  }

  triggerAI() {
    this.aiThinking = true;
    // 不停表：保留计时心跳以驱动横幅显示「AI 思考中」，但该分支不扣玩家时间。
    this.setStatus('AI 思考中…');
    this._tick();
    this._showThinking(`<span class="spin">🧠</span> AI 思考中…（${this._levelLabel()}）`);
    setTimeout(() => {
      let info = null;
      const move = this.ai.getAIMove(this.board, this.turn, this.aiLevel, {
        onInfo: (i) => { info = i; },
      });
      this.aiThinking = false;
      if (!move) { this._hideThinking(); return; }
      if (info) {
        const note = moveToChinese(this.board, move);
        this._showThinking(`AI：${note}　·　深度 ${info.depth}　·　评估 ${this._fmtScore(info.score)}　·　${info.nodes} 结点`);
      } else {
        this._hideThinking();
      }
      this.performMove(move, () => {});
    }, 60);
  }

  // ============ 悔棋 / 认输（pvp / ai）============
  undo() {
    if (this.mode === 'puzzle' || this.anim.running || this.aiThinking) return;
    if (this.history.length === 0) return;
    this._historyLive();
    this._undoOne();
    if (this.mode === 'ai' && this.history.length > 0 && this.turn === this.aiColor) {
      this._undoOne();
    }
    this.gameOver = false;
    this.selected = null;
    this.legalTargets = [];
    this.hintCell = null;
    this.checkCell = isCheck(this.board, this.turn) ? findKing(this.board, this.turn) : null;
    this.effects.clear();
    this.audio.playUndo();
    this.viewIndex = this.moveLog.length;
    this.renderMoveList();
    this.setStatus(`已悔棋，轮到${this._name(this.turn)}走棋`);
    this.render();
    this._restartTimer();
  }

  _undoOne() {
    const last = this.history.pop();
    RuleEngine.undoMove(this.board, last.move);
    this.turn = last.mover;
    this.moveLog.pop();
    this.snapshots.pop();
    this.lastMove = this.history.length
      ? { ...this.history[this.history.length - 1].move }
      : null;
  }

  resign() {
    if (this.mode === 'puzzle' || this.gameOver) return;
    const loser = this.turn;
    const winner = opponent(loser);
    this.endGame(`${this._name(loser)}认输，${this._name(winner)}胜`, winner);
    this.render();
  }

  endGame(message, winner) {
    this.gameOver = true;
    this._stopTimer();
    this.setStatus('🏁 ' + message);
    this.effects.showVictory(message, winner);
    if (winner === RED) this.audio.playVictory();
    else this.audio.playDefeat();
    // 人机对战统计。
    if (this.mode === 'ai') {
      const result = winner === RED ? 'win' : 'loss';
      const newly = this.stats.recordAIResult(result);
      this._announceAchievements(newly);
    }
  }

  // ============ 题库模式 ============
  _afterPuzzleSwitch() {
    this.anim.cancel();
    this.effects.clear();
    this.selected = null;
    this.legalTargets = [];
    this.hintCell = null;
    this.gameOver = false;
    this.moveLog = [];
    this.history = [];
    this._loadPuzzle();
    this.snapshots = [cloneBoard(this.board)];
    this.viewIndex = 0;
    this.renderMoveList();
    this.renderPuzzleList();
    this._syncClassicPick();
    this.render();
    this._restartTimer();
  }

  _loadPuzzle() {
    this.board = this.puzzle.board;
    this.turn = this.puzzle.turn;
    this.selected = null;
    this.legalTargets = [];
    this.lastMove = null;
    this.gameOver = false;
    this.checkCell = isCheck(this.board, this.turn) ? findKing(this.board, this.turn) : null;
    this.effects.clear();
    const p = this.puzzle.current;
    const meta = CATEGORY_META[this.puzzle._resolvedCategory] || {};
    this.setStatus(
      `${meta.label || ''} 第 ${this.puzzle.index + 1}/${this.puzzle.total} 题：${p ? p.name : ''}（${this._name(this.turn)}先走）`
    );
    this.renderPuzzleMeta();
    this._hideReview();
    this.render();
  }

  _onPuzzleClick(cell) {
    if (this.puzzle.solved) return;

    if (this.selected) {
      const target = this.legalTargets.find((m) => m.toRow === cell.row && m.toCol === cell.col);
      if (target) {
        const move = createMove(this.selected.row, this.selected.col, cell.row, cell.col);
        const before = cloneBoard(this.board);
        const userNote = moveToChinese(before, move);
        const result = this.puzzle.submitMove(move);

        if (!result.ok) {
          this.selected = null;
          this.legalTargets = [];
          this.audio.playDefeat();
          this.setStatus(`✗ ${result.reason || '不是正解'}`, 'bad');
          this.renderPuzzleMeta();
          this.render();
          return;
        }

        // 正解：推进棋盘（题库内部已落子，并可能自动应着）。
        const afterUser = cloneBoard(before);
        RuleEngine.makeMove(afterUser, move);
        this._pushPuzzlePly(userNote, this.turn, !!before[cell.row][cell.col]);

        this.board = this.puzzle.board;
        this.turn = this.puzzle.turn;
        this.selected = null;
        this.legalTargets = [];
        this.hintCell = null;
        this.lastMove = result.autoReply ? result.autoReply : move;

        if (result.autoReply) {
          const replyNote = moveToChinese(afterUser, result.autoReply);
          this._pushPuzzlePly(replyNote, opponent(this.turn), false);
        }
        before[cell.row][cell.col] ? this.audio.playCapture() : this.audio.playMove();

        if (result.solved) {
          this._onPuzzleSolved();
        } else {
          this.checkCell = isCheck(this.board, this.turn) ? findKing(this.board, this.turn) : null;
          this.setStatus('走对了，继续走出杀着', 'ok');
        }
        this.renderPuzzleMeta();
        this.render();
        return;
      }
      // 再次点击同一颗棋子：放下（取消选择）。
      if (cell.row === this.selected.row && cell.col === this.selected.col) {
        this._putDown(this.selected);
        this.render();
        return;
      }
    }
    this._select(cell);
    this.render();
  }

  _pushPuzzlePly(notation, mover, capture) {
    this.moveLog.push({ notation, mover, capture });
    this.snapshots.push(cloneBoard(this.puzzle.board));
    this.viewIndex = this.moveLog.length;
    this.renderMoveList();
  }

  _onPuzzleSolved() {
    this.checkCell = findKing(this.board, this.turn);
    this.effects.flashLightning();
    this.effects.showVictory('✓ 解题成功！', opponent(this.turn));
    this.audio.playMate();
    this._stopTimer();

    const g = this.puzzle.grade();
    const p = this.puzzle.current;
    const newly = this.stats.recordPuzzleSolved(p.id, {
      type: p.type,
      timeMs: g.timeMs,
      hints: g.hints,
      errors: g.errors,
      rating: g.rating,
    });
    this.setStatus(`✓ 解题成功！评级 ${g.rating}　用时 ${this._fmtTime(g.timeMs)}　提示 ${g.hints}　错误 ${g.errors}`, 'ok');
    this.renderPuzzleMeta(g);
    this.renderPuzzleList();
    this._announceAchievements(newly);
  }

  showHint() {
    if (this.mode !== 'puzzle' || !this.puzzle || this.puzzle.solved) return;
    const { level, text } = this.puzzle.nextHint();
    // 三级提示同时在棋盘上高亮关键子。
    if (level >= 2) {
      const mv = this.puzzle._expectedMove();
      if (mv) this.hintCell = { row: mv.fromRow, col: mv.fromCol };
    }
    this.setStatus(`💡 ${text}`);
    this.renderPuzzleMeta();
    this.render();
  }

  showAnswer() {
    if (this.mode !== 'puzzle' || !this.puzzle) return;
    const notation = this.puzzle.answerNotation();
    this.setStatus('答案：' + notation.join('　'), 'bad');
    this._showReview();
    this.renderPuzzleMeta();
    this.render();
  }

  // ============ 回放（着法回看）============
  _isViewingHistory() {
    return this.viewIndex < this.moveLog.length;
  }
  _historyNav(delta) {
    const max = this.moveLog.length;
    this.viewIndex = Math.max(0, Math.min(max, this.viewIndex + delta));
    this.renderMoveList();
    this.render();
  }
  _historyLive() {
    this.viewIndex = this.moveLog.length;
    this.renderMoveList();
    this.render();
  }
  _jumpHistory(ply) {
    this.viewIndex = Math.max(0, Math.min(this.moveLog.length, ply));
    this.renderMoveList();
    this.render();
  }

  // ============ 计时器 ============
  // 设计要点（需求 5）：
  //   - 玩家（红）回合：倒计时运行，归零判负；不限时则显示本回合用时。
  //   - AI 回合：横幅切换为「AI 思考中」，绝不消耗玩家剩余时间（aiThinking 分支直接 return）。
  //   - 计时横幅始终常驻，数字放大、并明确标注当前归属。
  _startTimerIfNeeded() {
    this._showTimer(true);
    this._moveStart = Date.now();
    if (this.mode === 'ai') this._remain = this.stepLimit;
    this._tick();
    if (typeof setInterval !== 'undefined') {
      this._timerHandle = setInterval(() => this._tick(), 1000);
    }
  }
  _restartTimer() {
    this._stopTimer();
    this._startTimerIfNeeded();
  }
  _stopTimer() {
    if (this._timerHandle) { clearInterval(this._timerHandle); this._timerHandle = null; }
  }
  _showTimer(visible) {
    const box = $('timer-box');
    if (box) box.classList.toggle('hidden', !visible);
  }
  _setTimer(cls, labelText, valueText) {
    const box = $('timer-box');
    const label = $('timer-label');
    const val = $('timer-value');
    if (box) box.className = 'timer ' + cls;
    if (label) label.textContent = labelText;
    if (val) val.textContent = valueText;
  }
  _tick() {
    // AI 思考中：明确标注，且绝不扣减玩家剩余时间。
    if (this.aiThinking) {
      this._setTimer('thinking', '🧠 AI 思考中', '请稍候…');
      return;
    }

    // 题库 / 残局：正计时显示用时。
    if (this.mode === 'puzzle') {
      if (this.puzzle && this.puzzle.solved) this._stopTimer();
      const start = (this.puzzle && this.puzzle.startTime) || this._moveStart || Date.now();
      this._setTimer('player', '用时', this._fmtTime(Date.now() - start));
      return;
    }

    // 人机对战。
    if (this.mode === 'ai') {
      if (this.turn === this.aiColor) {
        this._setTimer('thinking', '🧠 AI 回合', '请稍候…');
        return;
      }
      if (this.stepLimit > 0) {
        let cls = 'player';
        if (this._remain <= 5) cls = 'danger';
        else if (this._remain <= 10) cls = 'warn';
        this._setTimer(cls, '你的回合 · 剩余', this._fmtTime(this._remain * 1000));
        if (this._remain <= 3 && this._remain > 0) this.audio.playTick();
        if (this._remain <= 0) {
          this.audio.playTimeout();
          const loser = this.turn;
          this.endGame(`${this._name(loser)}超时判负，${this._name(opponent(loser))}胜`, opponent(loser));
          return;
        }
        this._remain--;
        return;
      }
      this._setTimer('player', '你的回合（不限时）', this._fmtTime(Date.now() - (this._moveStart || Date.now())));
      return;
    }

    // 双人对战：标注红 / 黑方回合 + 本回合用时。
    const red = this.turn === RED;
    this._setTimer(red ? 'player' : 'black-turn', red ? '红方回合' : '黑方回合', this._fmtTime(Date.now() - (this._moveStart || Date.now())));
  }

  // ============ FEN 导入 / 导出 ============
  importFen() {
    const input = $('fen-input');
    if (!input) return;
    const fen = (input.value || '').trim();
    if (!fen) { this._toast('请先粘贴 FEN'); return; }
    let parsed;
    try { parsed = loadFen(fen); } catch (err) { this._toast('FEN 解析失败：' + err.message); return; }
    const v = validatePosition(parsed.board, parsed.turn);
    if (!v.valid) { this._toast('局面非法：' + v.errors[0]); return; }
    // 以自由对弈方式载入该局面。
    const sel = $('mode'); if (sel) sel.value = 'pvp';
    this.setMode('pvp');
    this.board = parsed.board;
    this.turn = parsed.turn;
    this.snapshots = [cloneBoard(this.board)];
    this.viewIndex = 0;
    this.checkCell = isCheck(this.board, this.turn) ? findKing(this.board, this.turn) : null;
    this.setStatus(`已导入局面，轮到${this._name(this.turn)}走棋`, 'ok');
    this.render();
    this._toast('已导入残局');
  }

  copyFen() {
    const fen = exportFen(this.board, this.turn);
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(fen).then(
        () => this._toast('FEN 已复制，可分享'),
        () => this._toast('复制失败：' + fen)
      );
    } else {
      this._toast(fen);
    }
  }

  // ============ 统计中心 / 成就 ============
  toggleStats() {
    const box = $('stats-box');
    if (!box) return;
    const willShow = box.classList.contains('hidden');
    box.classList.toggle('hidden', !willShow);
    if (willShow) this.renderStats();
  }

  renderStats() {
    const c = $('stats-content');
    const a = $('ach-list');
    if (!c && !a) return;
    const s = this.stats.summary();
    if (c) {
      c.innerHTML = [
        ['对局数', s.ai.games],
        ['胜 / 负 / 和', `${s.ai.wins} / ${s.ai.losses} / ${s.ai.draws}`],
        ['胜率', s.ai.winRate + '%'],
        ['当前连胜', s.ai.currentStreak],
        ['最高连胜', s.ai.bestStreak],
        ['已完成题数', s.puzzle.totalSolved],
        ['最快解题', s.puzzle.fastestSolveMs != null ? this._fmtTime(s.puzzle.fastestSolveMs) : '—'],
        ['平均用时', s.puzzle.avgTimeMs != null ? this._fmtTime(s.puzzle.avgTimeMs) : '—'],
      ].map(([k, v]) => `<div class="k">${k}</div><div class="v">${v}</div>`).join('');
    }
    if (a) {
      a.innerHTML = s.achievements
        .map((ac) => `<div class="ach ${ac.unlocked ? 'unlocked' : ''}"><span class="ico">${ac.unlocked ? '🏅' : '🔒'}</span><span class="meta"><b>${ac.name}</b><span>${ac.desc}</span></span></div>`)
        .join('');
    }
  }

  // ============ 左侧常驻统计栏 ============
  renderSideStats() {
    const s = this.stats.summary();
    const rec = $('side-record');
    if (rec) {
      rec.innerHTML = [
        ['对局', s.ai.games],
        ['胜', s.ai.wins],
        ['负', s.ai.losses],
        ['和', s.ai.draws],
        ['胜率', s.ai.winRate + '%'],
        ['当前连胜', s.ai.currentStreak],
      ].map(([k, v]) => `<span class="k">${k}</span><span class="v">${v}</span>`).join('');
    }

    const plies = (this.moveLog || []).length;
    const rounds = $('side-rounds');
    if (rounds) rounds.textContent = Math.ceil(plies / 2);
    const moves = $('side-moves');
    if (moves) moves.textContent = plies;

    const cap = this._capturedPieces();
    this._renderCaptures('cap-red', cap.byRed);
    this._renderCaptures('cap-black', cap.byBlack);

    const sp = $('side-puzzle');
    if (sp) {
      sp.innerHTML = [
        ['已解题', s.puzzle.totalSolved],
        ['最快', s.puzzle.fastestSolveMs != null ? this._fmtTime(s.puzzle.fastestSolveMs) : '—'],
        ['平均', s.puzzle.avgTimeMs != null ? this._fmtTime(s.puzzle.avgTimeMs) : '—'],
      ].map(([k, v]) => `<span class="k">${k}</span><span class="v">${v}</span>`).join('');
    }
  }

  // 通过对比开局快照与当前局面，推算已被吃掉的棋子（适用于所有模式，含 FEN 残局）。
  _capturedPieces() {
    const init = (this.snapshots && this.snapshots[0]) || this.board;
    const tally = (board) => {
      const m = {};
      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
          const p = board[r][c];
          if (p) m[p] = (m[p] || 0) + 1;
        }
      }
      return m;
    };
    const a = tally(init);
    const b = tally(this.board);
    const byRed = []; // 被红方吃掉的黑子
    const byBlack = []; // 被黑方吃掉的红子
    for (const key of Object.keys(a)) {
      const lost = a[key] - (b[key] || 0);
      if (lost <= 0) continue;
      const isRedPiece = colorOf(key) === RED;
      const glyph = GLYPH[isRedPiece ? 'red' : 'black'][typeOf(key)];
      for (let i = 0; i < lost; i++) {
        (isRedPiece ? byBlack : byRed).push({ glyph, red: isRedPiece });
      }
    }
    return { byRed, byBlack };
  }

  _renderCaptures(id, arr) {
    const el = $(id);
    if (!el) return;
    if (!arr.length) { el.innerHTML = '<span class="empty">暂无</span>'; return; }
    el.innerHTML = arr.map((x) => `<span class="cap ${x.red ? 'r' : 'b'}">${x.glyph}</span>`).join('');
  }

  _announceAchievements(list) {
    if (!list || list.length === 0) return;
    this._toast('🏅 解锁成就：' + list.map((a) => a.name).join('、'));
    const box = $('stats-box');
    if (box && !box.classList.contains('hidden')) this.renderStats();
  }

  // ============ 渲染：着法记录 / 题库列表 / 题目信息 ============
  renderMoveList() {
    if (!this.moveListEl) return;
    const items = (this.moveLog || []).map((m, i) => {
      const cls = m.mover === RED ? 'mv-red' : 'mv-black';
      const viewing = this.viewIndex === i + 1 ? ' viewing' : '';
      const text = typeof m === 'string' ? m : m.notation;
      return `<li class="${viewing}" data-ply="${i + 1}"><span class="mv-no">${i + 1}.</span> <span class="${cls}">${text}</span></li>`;
    });
    this.moveListEl.innerHTML = items.join('');
    // 点击回看。
    Array.from(this.moveListEl.querySelectorAll('li')).forEach((li) => {
      li.addEventListener('click', () => this._jumpHistory(Number(li.dataset.ply)));
    });
    if (!this._isViewingHistory()) this.moveListEl.scrollTop = this.moveListEl.scrollHeight;
  }

  renderPuzzleList() {
    const el = $('puzzle-list');
    if (!el || !this.puzzle) return;
    const list = this.puzzle.puzzles;
    el.innerHTML = list
      .map((p, i) => {
        const rec = this.stats.bestRecord(p.id);
        const done = rec ? '✓' : '';
        const best = rec ? `${rec.rating}·${this._fmtTime(rec.timeMs)}` : '';
        const diff = '★'.repeat(p.difficulty || 1);
        const active = i === this.puzzle.index ? ' active' : '';
        return `<li class="${active}" data-idx="${i}"><span class="p-no">${i + 1}</span><span class="p-name">${p.name}</span><span class="p-diff">${diff}</span><span class="p-done">${done}</span><span class="p-best">${best}</span></li>`;
      })
      .join('');
    Array.from(el.querySelectorAll('li')).forEach((li) => {
      li.addEventListener('click', () => {
        this.puzzle.goTo(Number(li.dataset.idx));
        this._afterPuzzleSwitch();
      });
    });
  }

  renderPuzzleMeta(grade) {
    const el = $('puzzle-meta');
    if (!el || !this.puzzle) return;
    const p = this.puzzle.current;
    if (!p) { el.innerHTML = ''; return; }
    const meta = CATEGORY_META[this.puzzle._resolvedCategory] || {};
    const parts = [
      `<span class="badge">${meta.label || ''}</span>`,
      `<span class="badge">难度 ${'★'.repeat(p.difficulty || 1)}</span>`,
      `<span class="badge">提示 ${this.puzzle.hintLevel}</span>`,
      `<span class="badge">错误 ${this.puzzle.errorCount}</span>`,
    ];
    if (grade) parts.push(`<span class="rating rating-${grade.rating}">${grade.rating}</span>`);
    if (p.desc) parts.push(`<span class="puzzle-desc">${p.desc}</span>`);
    el.innerHTML = parts.join('');
  }

  _showReview() {
    const el = $('puzzle-review');
    if (!el || !this.puzzle) return;
    const r = this.puzzle.review();
    el.classList.remove('hidden');
    el.innerHTML =
      `<h4>失败复盘</h4>` +
      (r.wrong.length ? `<div class="wrong">你走过的错着：${r.wrong.join('、')}</div>` : '') +
      `<div class="ans">正确主线：${r.correct.join('　')}</div>` +
      `<div>${r.explanation}</div>`;
  }
  _hideReview() {
    const el = $('puzzle-review');
    if (el) el.classList.add('hidden');
  }

  // ============ 思考可视化 ============
  _showThinking(html) {
    const el = $('ai-think');
    if (!el) return;
    el.classList.remove('hidden');
    el.innerHTML = html;
  }
  _hideThinking() {
    const el = $('ai-think');
    if (el) el.classList.add('hidden');
  }
  _levelLabel() {
    return { novice: '新手', normal: '普通', expert: '困难', master: '大师', grandmaster: '宗师' }[this.aiLevel] || this.aiLevel;
  }

  // ============ 拿子 / 放子 特效 ============
  // 拿子悬停：选中的棋子持续轻微"呼吸"上浮。用自停的 rAF 循环驱动重绘，
  // 选择清空即自动停止；无 rAF 环境（如测试桩）下退化为静态抬起。
  _currentLift() {
    if (!this.selected) return 0;
    const now = typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now();
    return 0.78 + 0.22 * Math.sin(now / 240); // 约 0.56~1.0 之间起伏
  }
  _maybeAnimateLift() {
    if (typeof requestAnimationFrame === 'undefined') return;
    if (!this.selected || this.anim.running || this._liftRaf != null) return;
    const now = typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now();
    if (this._liftStart == null) this._liftStart = now;
    // 上限保护：避免在「同步立即回调」的 rAF 桩（测试环境）下无限递归。
    if (now - this._liftStart > 30000) return;
    this._liftRaf = requestAnimationFrame(() => {
      this._liftRaf = null;
      if (!this.selected || this.anim.running) return;
      this.render(); // 重绘会再次触发 _maybeAnimateLift，形成自停循环
    });
  }
  _stopLift() {
    if (this._liftRaf != null && typeof cancelAnimationFrame !== 'undefined') cancelAnimationFrame(this._liftRaf);
    this._liftRaf = null;
    this._liftStart = null;
  }
  // 放下（取消选择）：棋子落回原位，并播放与落子一致的回弹 + 涟漪特效。
  _putDown(cell) {
    this.selected = null;
    this.legalTargets = [];
    this._stopLift();
    this.audio.playMove();
    if (cell) this._playDrop(cell.row, cell.col);
  }

  // 放子落点：棋子由大回弹到正、金色涟漪向外扩散。
  _playDrop(row, col) {
    this._drop = { row, col, progress: 0 };
    if (typeof requestAnimationFrame === 'undefined') { this._drop = null; return; }
    const start = typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now();
    const dur = 340;
    const step = (now) => {
      const p = Math.min(1, (now - start) / dur);
      this._drop = { row, col, progress: p };
      this.render();
      if (p < 1) requestAnimationFrame(step);
      else { this._drop = null; this.render(); }
    };
    requestAnimationFrame(step);
  }

  // ============ 公共 ============
  flashCheck() {
    this.anim.pulse(220, (intensity) => { this.checkPulse = intensity; this.render(); }, { loops: 3 });
  }

  _toast(text) {
    const el = $('toast');
    if (!el) return;
    el.textContent = text;
    el.classList.remove('hidden');
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => el.classList.add('hidden'), 2600);
  }

  _name(color) { return color === RED ? '红方' : '黑方'; }

  _fmtTime(ms) {
    const s = Math.max(0, Math.round(ms / 1000));
    const m = Math.floor(s / 60);
    return `${String(m).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  }
  _fmtScore(score) {
    if (Math.abs(score) >= 900000) return score > 0 ? '必胜' : '必负';
    return (score / 100).toFixed(1);
  }

  setStatus(text, kind) {
    if (this.statusEl) {
      this.statusEl.textContent = text;
      this.statusEl.className = 'status' + (kind ? ' ' + kind : '');
    }
    if (this.turnEl) {
      this.turnEl.textContent = this._name(this.turn);
      this.turnEl.className = this.turn === RED ? 'turn-red' : 'turn-black';
    }
  }

  render() {
    const viewing = this._isViewingHistory();
    const board = viewing ? this.snapshots[this.viewIndex] : this.board;
    let lastMove = this.lastMove;
    if (viewing) {
      const entry = this.history[this.viewIndex - 1];
      lastMove = entry ? entry.move : null;
    }
    this.renderer.render({
      board,
      selected: viewing ? null : this.selected,
      legalTargets: viewing ? [] : this.legalTargets,
      lastMove,
      checkCell: viewing ? null : this.checkCell,
      checkPulse: this.checkPulse,
      hideCell: this._hideCell,
      floating: this._floating,
      showCoords: this.showCoords,
      hintCell: viewing ? null : this.hintCell,
      drop: viewing ? null : this._drop,
      selectLift: this._currentLift(),
    });
    if (this.fenEl) this.fenEl.textContent = exportFen(this.board, this.turn);
    this.renderSideStats();
    this._maybeAnimateLift();
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener('DOMContentLoaded', () => {
    const g = new GameController();
    const m = new URLSearchParams((window.location && window.location.search) || '').get('mode');
    if (m && ['pvp', 'ai', 'puzzle'].includes(m)) {
      const sel = $('mode');
      if (sel) sel.value = m;
      g.setMode(m);
    }
    window.game = g;
  });
}
