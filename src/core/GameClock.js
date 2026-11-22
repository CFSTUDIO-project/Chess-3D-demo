export const CLOCK_PRESETS = {
  unlimited: { label:'Unlimited', seconds:null, increment:0 },
  bullet: { label:'1 minute', seconds:60, increment:0 },
  blitz3: { label:'3 minutes', seconds:180, increment:0 },
  blitz3i2: { label:'3 + 2', seconds:180, increment:2 },
  blitz5: { label:'5 minutes', seconds:300, increment:0 },
  blitz5i3: { label:'5 + 3', seconds:300, increment:3 },
  rapid10: { label:'10 minutes', seconds:600, increment:0 },
  rapid15i10: { label:'15 + 10', seconds:900, increment:10 },
  custom: { label:'Custom', seconds:600, increment:0 }
};

export class GameClock {
  constructor({ onTick = () => {}, onFlag = () => {} } = {}) {
    this.onTick = onTick;
    this.onFlag = onFlag;
    this.baseSeconds = 600;
    this.increment = 0;
    this.remaining = { w:600, b:600 };
    this.active = 'w';
    this.running = false;
    this.lastTick = 0;
    this.interval = null;
  }

  configure({ seconds = 600, increment = 0 } = {}) {
    this.stop();
    this.baseSeconds = seconds == null ? null : Math.max(1, Number(seconds));
    this.increment = Math.max(0, Number(increment) || 0);
    this.remaining = { w:this.baseSeconds, b:this.baseSeconds };
    this.active = 'w';
    this.emit();
  }

  start(color = 'w') {
    this.active = color === 'b' ? 'b' : 'w';
    if (this.baseSeconds == null) {
      this.running = false;
      this.emit();
      return;
    }
    this.running = true;
    this.lastTick = performance.now();
    if (!this.interval) this.interval = window.setInterval(() => this.tick(), 100);
    this.emit();
  }

  tick() {
    if (!this.running || this.baseSeconds == null) return;
    const now = performance.now();
    const elapsed = (now - this.lastTick) / 1000;
    this.lastTick = now;
    this.remaining[this.active] = Math.max(0, this.remaining[this.active] - elapsed);
    if (this.remaining[this.active] <= 0) {
      const flagged = this.active;
      this.remaining[flagged] = 0;
      this.running = false;
      this.stopInterval();
      this.emit();
      this.onFlag(flagged);
      return;
    }
    this.emit();
  }

  onMove(moverColor) {
    if (this.baseSeconds == null) { this.active = moverColor === 'w' ? 'b' : 'w'; this.emit(); return; }
    if (this.running && this.active === moverColor) this.remaining[moverColor] += this.increment;
    this.active = moverColor === 'w' ? 'b' : 'w';
    this.lastTick = performance.now();
    this.running = true;
    if (!this.interval) this.interval = window.setInterval(() => this.tick(), 100);
    this.emit();
  }

  pause() {
    this.tick();
    this.running = false;
    this.emit();
  }

  resume() {
    if (this.baseSeconds == null || this.remaining[this.active] <= 0) return;
    this.running = true;
    this.lastTick = performance.now();
    if (!this.interval) this.interval = window.setInterval(() => this.tick(), 100);
    this.emit();
  }

  toggle() { this.running ? this.pause() : this.resume(); }

  switchManually() {
    this.tick();
    if (this.remaining[this.active] <= 0) return;
    this.active = this.active === 'w' ? 'b' : 'w';
    this.lastTick = performance.now();
    this.running = true;
    this.emit();
  }

  snapshot() {
    return { remaining:{ ...this.remaining }, active:this.active, running:this.running, baseSeconds:this.baseSeconds, increment:this.increment };
  }

  restore(snapshot) {
    this.stop();
    if (!snapshot) return;
    this.baseSeconds = snapshot.baseSeconds;
    this.increment = snapshot.increment;
    this.remaining = { ...snapshot.remaining };
    this.active = snapshot.active;
    if (snapshot.running && this.baseSeconds != null) this.resume();
    else this.emit();
  }

  reset(color = 'w') {
    this.stop();
    this.remaining = { w:this.baseSeconds, b:this.baseSeconds };
    this.active = color;
    this.emit();
  }

  stop() {
    this.running = false;
    this.stopInterval();
  }

  stopInterval() {
    if (this.interval) window.clearInterval(this.interval);
    this.interval = null;
  }

  emit() { this.onTick({ ...this.remaining, active:this.active, running:this.running, unlimited:this.baseSeconds == null }); }

  dispose() { this.stop(); }
}

export function formatClock(value) {
  if (value == null) return '∞';
  const seconds = Math.max(0, Math.ceil(value));
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return `${String(minutes).padStart(2,'0')}:${String(remainder).padStart(2,'0')}`;
}
