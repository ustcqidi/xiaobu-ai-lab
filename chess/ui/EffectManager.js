// EffectManager.js  (Agent 1)
// 棋盘之上的 DOM 覆盖层特效：绝杀闪电、胜利横幅。只做视觉，不含规则。

export class EffectManager {
  /**
   * @param {HTMLElement} overlay 覆盖在棋盘上的容器元素
   */
  constructor(overlay) {
    this.overlay = overlay;
  }

  clear() {
    if (!this.overlay) return;
    this.overlay.className = 'overlay';
    this.overlay.innerHTML = '';
  }

  /** 绝杀闪电：整屏白光快速闪两下。 */
  flashLightning() {
    if (!this.overlay) return;
    this.overlay.classList.add('lightning');
    setTimeout(() => this.overlay && this.overlay.classList.remove('lightning'), 600);
  }

  /**
   * 胜利横幅。
   * @param {string} text
   * @param {'red'|'black'} winner
   */
  showVictory(text, winner) {
    if (!this.overlay) return;
    this.overlay.className = 'overlay show-victory ' + (winner === 'red' ? 'win-red' : 'win-black');
    const banner = document.createElement('div');
    banner.className = 'victory-banner';
    banner.textContent = text;
    this.overlay.innerHTML = '';
    this.overlay.appendChild(banner);
  }
}
