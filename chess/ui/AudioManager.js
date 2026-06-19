// AudioManager.js  (Agent 1)
// 用 Web Audio API 合成音效（无需音频素材文件，保证双击即用），
// 将军用 Web Speech API 播报。支持音量控制与静音。

export class AudioManager {
  constructor() {
    this.volume = 0.6;
    this.muted = false;
    this.ctx = null; // 延迟创建，需用户手势后才能播放
  }

  _ensure() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC) this.ctx = new AC();
    }
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
    return this.ctx;
  }

  setVolume(v) {
    this.volume = Math.max(0, Math.min(1, v));
  }

  setMuted(m) {
    this.muted = m;
  }

  // 合成一个短促音：freq 频率、dur 时长、type 波形；可选起止频率做滑音，更圆润不机械。
  _beep(freq, dur, type = 'triangle', gainScale = 1, freqEnd = null) {
    if (this.muted) return;
    const ctx = this._ensure();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    const now = ctx.currentTime;
    osc.frequency.setValueAtTime(freq, now);
    if (freqEnd) osc.frequency.exponentialRampToValueAtTime(freqEnd, now + dur);
    const peak = this.volume * gainScale;
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(peak, now + 0.006);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    osc.connect(gain).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + dur + 0.02);
  }

  // 走子：清脆“嗒”，叠加一个低频木质感，模拟落子。
  playMove() {
    this._beep(560, 0.07, 'triangle', 0.7, 360);
    this._beep(180, 0.06, 'sine', 0.35);
  }

  // 吃子：更重的双击“咔哒”。
  playCapture() {
    this._beep(300, 0.09, 'triangle', 0.7, 150);
    setTimeout(() => this._beep(160, 0.12, 'square', 0.5, 90), 45);
  }

  playCheck() {
    this._beep(720, 0.14, 'sawtooth', 0.6, 520);
    this.speak('将军');
  }

  // 绝杀：下行强音 + 语音。
  playMate() {
    [660, 520, 392].forEach((f, i) => setTimeout(() => this._beep(f, 0.16, 'sawtooth', 0.7), i * 90));
    this.speak('将死');
  }

  // 悔棋：轻柔回撤滑音。
  playUndo() {
    this._beep(420, 0.12, 'sine', 0.5, 280);
  }

  // 倒计时滴答。
  playTick() {
    this._beep(880, 0.05, 'square', 0.45);
  }

  // 超时警示。
  playTimeout() {
    this._beep(330, 0.3, 'sawtooth', 0.7, 180);
  }

  playVictory() {
    [523, 659, 784, 1047].forEach((f, i) =>
      setTimeout(() => this._beep(f, 0.18, 'triangle', 0.7), i * 110)
    );
  }

  playDefeat() {
    [392, 330, 262].forEach((f, i) =>
      setTimeout(() => this._beep(f, 0.22, 'sine', 0.7), i * 140)
    );
  }

  // Web Speech API 播报
  speak(text) {
    if (this.muted) return;
    if (!('speechSynthesis' in window)) return;
    try {
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'zh-CN';
      u.volume = this.volume;
      u.rate = 1.05;
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(u);
    } catch (_) {
      /* 忽略不支持的环境 */
    }
  }
}
