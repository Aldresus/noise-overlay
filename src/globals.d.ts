// ponytail: renderer.ts and settings.ts are plain <script> files, so they share
// one global TS scope — the ambient declarations they both need live here once
// instead of clashing. Emits no JS.

type Settings = {
  threshold: number;
  drain: number;
  refill: number;
  sound: boolean;
  micId: string;
  size: number; // overlay side length in px (square)
};

type Meters = {
  level: number;
  inst: number;
  patience: number;
  state: 'content' | 'attentif' | 'inquiet' | 'fache';
  over: boolean;
  overSeconds: number;
  rms: number;
  dbfs: number;
};

declare const drag: {
  start(): void;
  move(x: number, y: number): void;
};

declare const menu: {
  action(name: string): void;
};

declare const api: {
  getSettings(): Promise<Settings>;
  setSettings(s: Settings): void;
  onSettings(cb: (s: Settings) => void): void;
  sendMeters(m: Meters): void;
  onMeters(cb: (m: Meters) => void): void;
  sendMics(l: { deviceId: string; label: string }[]): void;
  onMics(cb: (l: { deviceId: string; label: string }[]) => void): void;
};

declare const Levels: {
  rmsToLevel(rms: number): number;
  emaStep(avg: number, level: number, alpha: number): number;
  alphaFromDt(dt: number, tau?: number): number;
  patienceStep(
    prev: number,
    smoothedLevel: number,
    threshold: number,
    dt: number,
    drainSeconds?: number,
    refillSeconds?: number,
  ): number;
  moodState(patience: number): 'content' | 'attentif' | 'inquiet' | 'fache';
  TAU: number;
  DRAIN_SECONDS: number;
  REFILL_SECONDS: number;
};
