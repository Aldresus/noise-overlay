// No ES import/export in this file: it loads as a plain <script> in the
// renderer (must emit no `require`) and is also `require`d directly from
// Node for the test. IIFE keeps its names out of the shared script scope.
(function (): void {
  // Level scale: RMS -> dBFS -> 0..1 display position.
  const DBFS_MIN = -70; // silence floor
  const DBFS_MAX = -10; // near-clipping ceiling

  function rmsToLevel(rms: number): number {
    const dbfs = rms > 0 ? 20 * Math.log10(rms) : -Infinity;
    const level = (dbfs - DBFS_MIN) / (DBFS_MAX - DBFS_MIN);
    return Math.max(0, Math.min(1, level));
  }

  const TAU = 1.0; // EMA time constant, seconds

  function alphaFromDt(dt: number, tau: number = TAU): number {
    return 1 - Math.exp(-dt / tau);
  }

  function emaStep(avg: number, level: number, alpha: number): number {
    return avg + (level - avg) * alpha;
  }

  // Patience gauge: 1 = calm, 0 = fed up. Drains at a flat rate while the
  // smoothed level is above threshold, refills slower while at/below it.
  // Defaults are untuned guesses; a real classroom tunes them via sliders.
  const DRAIN_SECONDS = 20; // continuous noise: 1 -> 0
  const REFILL_SECONDS = 40; // continuous calm: 0 -> 1

  function patienceStep(
    prev: number,
    smoothedLevel: number,
    threshold: number,
    dt: number,
    drainSeconds: number = DRAIN_SECONDS,
    refillSeconds: number = REFILL_SECONDS,
  ): number {
    const delta = smoothedLevel > threshold ? -dt / drainSeconds : dt / refillSeconds;
    return Math.max(0, Math.min(1, prev + delta));
  }

  type MoodState = 'content' | 'attentif' | 'inquiet' | 'fache';

  function moodState(patience: number): MoodState {
    if (patience > 0.75) return 'content';
    if (patience > 0.5) return 'attentif';
    if (patience > 0.25) return 'inquiet';
    return 'fache';
  }

  (globalThis as any).Levels = {
    rmsToLevel,
    emaStep,
    alphaFromDt,
    patienceStep,
    moodState,
    DBFS_MIN,
    DBFS_MAX,
    TAU,
    DRAIN_SECONDS,
    REFILL_SECONDS,
  };
})();
