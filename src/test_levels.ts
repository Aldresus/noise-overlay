(function (): void {
  const assert = require('assert');
  require('./levels');
  const { rmsToLevel, emaStep, alphaFromDt, patienceStep, moodState, DRAIN_SECONDS } = (globalThis as any).Levels;

  assert.strictEqual(rmsToLevel(0), 0, 'silence maps to 0, not NaN');
  assert(Math.abs(rmsToLevel(0.01) - 0.5) < 0.02, '-40 dBFS maps to ~0.5');
  assert.strictEqual(rmsToLevel(1), 1, 'loud rms clamps to 1');
  assert.strictEqual(rmsToLevel(10), 1, 'above 0 dBFS still clamps to 1');

  let avg = 0;
  for (let i = 0; i < 500; i++) avg = emaStep(avg, 1, alphaFromDt(1 / 60));
  assert(avg > 0.99, 'EMA converges toward a constant input');

  // Continuous 20s above threshold drains patience from 1 to ~0.
  {
    let p = 1;
    const dt = 0.1;
    for (let t = 0; t < DRAIN_SECONDS; t += dt) p = patienceStep(p, 0.8, 0.5, dt);
    assert(p < 0.05, `20s continuous noise should nearly empty patience, got ${p}`);
  }

  // A single 0.2s spike above threshold costs ~1% of the gauge (0.2/20 = 1%).
  {
    const p = patienceStep(1, 0.8, 0.5, 0.2);
    const cost = 1 - p;
    assert(cost > 0.005 && cost < 0.02, `0.2s spike should cost ~1%, cost was ${cost}`);
  }

  // Clamps at 0 and 1, never goes outside.
  {
    let p = patienceStep(0, 0.8, 0.5, 100); // huge dt above threshold
    assert.strictEqual(p, 0, 'patience clamps at 0');
    p = patienceStep(1, 0.1, 0.5, 100); // huge dt below threshold
    assert.strictEqual(p, 1, 'patience clamps at 1');
  }

  // Four state boundaries.
  assert.strictEqual(moodState(1), 'content');
  assert.strictEqual(moodState(0.76), 'content');
  assert.strictEqual(moodState(0.75), 'attentif');
  assert.strictEqual(moodState(0.51), 'attentif');
  assert.strictEqual(moodState(0.5), 'inquiet');
  assert.strictEqual(moodState(0.26), 'inquiet');
  assert.strictEqual(moodState(0.25), 'fache');
  assert.strictEqual(moodState(0), 'fache');

  console.log('all tests passed');
})();
