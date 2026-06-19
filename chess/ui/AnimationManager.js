// AnimationManager.js  (Agent 1)
// 基于 requestAnimationFrame 的动画驱动。只负责"过渡计算"，不知道棋子规则。
//
// 规范时长：落子 150ms、吃子 200ms。

function easeOutQuad(t) {
  return 1 - (1 - t) * (1 - t);
}

export class AnimationManager {
  constructor() {
    this._raf = null;
    this._running = false;
  }

  get running() {
    return this._running;
  }

  cancel() {
    if (this._raf) cancelAnimationFrame(this._raf);
    this._raf = null;
    this._running = false;
  }

  /**
   * 让一枚棋子从 from 像素位置移动到 to 像素位置。
   * @param {{x,y}} from
   * @param {{x,y}} to
   * @param {number} duration ms
   * @param {(x:number,y:number,progress:number)=>void} onFrame 每帧回调（当前像素位置）
   * @param {()=>void} onDone 结束回调
   */
  animateMove(from, to, duration, onFrame, onDone) {
    this.cancel();
    this._running = true;
    const start = performance.now();
    const step = (now) => {
      const raw = Math.min(1, (now - start) / duration);
      const t = easeOutQuad(raw);
      const x = from.x + (to.x - from.x) * t;
      const y = from.y + (to.y - from.y) * t;
      onFrame(x, y, raw);
      if (raw < 1) {
        this._raf = requestAnimationFrame(step);
      } else {
        this._running = false;
        this._raf = null;
        onDone && onDone();
      }
    };
    this._raf = requestAnimationFrame(step);
  }

  /**
   * 通用计时动画（用于将军闪烁等），progress 0→1，可设 loops 次往返。
   * @returns {()=>void} 取消函数
   */
  pulse(duration, onFrame, { loops = 1 } = {}) {
    const start = performance.now();
    let raf = null;
    const total = duration * loops;
    const step = (now) => {
      const raw = Math.min(1, (now - start) / total);
      // 三角波，产生 loops 次明暗
      const phase = (raw * loops) % 1;
      const intensity = phase < 0.5 ? phase * 2 : (1 - phase) * 2;
      onFrame(intensity, raw);
      if (raw < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => raf && cancelAnimationFrame(raf);
  }
}
