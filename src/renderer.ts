declare const drag: {
  start(): void;
  move(x: number, y: number): void;
};

declare const menu: {
  action(name: string): void;
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

(function (): void {
  const readout = document.getElementById('readout')!;
  const err = document.getElementById('err')!;
  const fill = document.getElementById('fill')!;
  const tickEl = document.getElementById('tick')!;
  const thresholdMarker = document.getElementById('thresholdMarker')!;
  const micSelect = document.getElementById('micSelect') as HTMLSelectElement;
  const patienceFill = document.getElementById('patienceFill')!;
  const stateEl = document.getElementById('state')!;
  const overTimeEl = document.getElementById('overTime')!;
  const catSvg = document.getElementById('cat')!;
  let shownState = '';

  // manual drag: app-region drag is gone (it ate right-clicks, see main.ts),
  // so #persona drives the window via IPC instead. Scoped to #persona only —
  // the panel's sliders/select/checkbox never start a drag.
  const persona = document.getElementById('persona')!;
  persona.addEventListener('pointerdown', (e: PointerEvent) => {
    if (e.button !== 0) return;
    persona.setPointerCapture(e.pointerId);
    drag.start();
  });
  persona.addEventListener('pointermove', (e: PointerEvent) => {
    if (e.buttons !== 1) return;
    drag.move(e.screenX, e.screenY);
  });
  persona.addEventListener('pointerup', (e: PointerEvent) => {
    if (persona.hasPointerCapture(e.pointerId)) persona.releasePointerCapture(e.pointerId);
  });
  // right-click menu, drawn in the page (see #ctxmenu in index.html). Right-
  // click only reaches the renderer at all because app-region drag is gone.
  const ctxmenu = document.getElementById('ctxmenu')!;
  const items = Array.from(ctxmenu.querySelectorAll('button'));

  function closeMenu(): void {
    ctxmenu.hidden = true;
  }

  persona.addEventListener('contextmenu', (e: MouseEvent) => {
    e.preventDefault();
    ctxmenu.hidden = false;
    // measure from the origin: at position:fixed an offset left edge shrinks
    // the available width and would report a wrapped, narrower box.
    ctxmenu.style.left = ctxmenu.style.top = '0px';
    const { width, height } = ctxmenu.getBoundingClientRect();
    // clamp against the live viewport — the window is 360 in overlay mode and
    // 720 in settings mode, and nothing outside it is drawn.
    const M = 4; // keep the border off the window edge
    ctxmenu.style.left = `${Math.max(M, Math.min(e.clientX, window.innerWidth - width - M))}px`;
    ctxmenu.style.top = `${Math.max(M, Math.min(e.clientY, window.innerHeight - height - M))}px`;
    items[0].focus();
  });

  ctxmenu.addEventListener('click', (e: MouseEvent) => {
    const action = (e.target as HTMLElement).closest('button')?.dataset.action;
    if (!action) return;
    closeMenu();
    menu.action(action);
  });

  // Tab and Enter already work on real buttons; this only adds the arrows.
  ctxmenu.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    const i = items.indexOf(document.activeElement as HTMLButtonElement);
    items[(i + (e.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length].focus();
  });

  document.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key === 'Escape') closeMenu();
  });
  document.addEventListener('pointerdown', (e: PointerEvent) => {
    if (!ctxmenu.contains(e.target as Node)) closeMenu();
  });

  const MOOD_FR = {
    content: 'Le chat est content',
    attentif: 'Le chat dresse les oreilles',
    inquiet: 'Le chat est inquiet',
    fache: 'Le chat en a assez',
  };

  function rms(data: Float32Array): number {
    let sum = 0;
    for (let i = 0; i < data.length; i++) sum += data[i] * data[i];
    return Math.sqrt(sum / data.length);
  }

  // ponytail: Electron's localStorage is already stored per-app under
  // app.getPath('userData'), so no separate JSON config or IPC is needed.
  function wireSlider(
    inputId: string,
    readoutId: string,
    storageKey: string,
    defaultValue: number,
    onChange?: (value: number) => void,
  ): () => number {
    const input = document.getElementById(inputId) as HTMLInputElement;
    const readoutEl = document.getElementById(readoutId)!;
    let value = Number(localStorage.getItem(storageKey) ?? String(defaultValue));
    input.value = String(value);
    readoutEl.textContent = String(value);
    onChange?.(value);
    input.addEventListener('input', () => {
      value = Number(input.value);
      readoutEl.textContent = String(value);
      localStorage.setItem(storageKey, String(value));
      onChange?.(value);
    });
    return () => value;
  }

  const getThreshold = wireSlider('threshold', 'thresholdValue', 'noise-overlay:threshold', 0.5, (v) => {
    thresholdMarker.style.left = `${v * 100}%`;
  });
  const getDrainSeconds = wireSlider('drain', 'drainValue', 'noise-overlay:drain', Levels.DRAIN_SECONDS);
  const getRefillSeconds = wireSlider('refill', 'refillValue', 'noise-overlay:refill', Levels.REFILL_SECONDS);

  const soundCheckbox = document.getElementById('sound') as HTMLInputElement;
  soundCheckbox.checked = localStorage.getItem('noise-overlay:sound') === 'true';
  soundCheckbox.addEventListener('change', () => {
    localStorage.setItem('noise-overlay:sound', String(soundCheckbox.checked));
  });

  function playWorryChime(): void {
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = 660;
    osc.connect(gain).connect(ctx.destination);
    const t = ctx.currentTime;
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(0.05, t + 0.08);
    gain.gain.linearRampToValueAtTime(0, t + 0.25);
    osc.start(t);
    osc.stop(t + 0.25);
  }

  let ctx: AudioContext | null = null;
  let analyser: AnalyserNode | null = null;
  let currentStream: MediaStream | null = null;
  let avg = 0;
  let patience = 1;
  let overSeconds = 0;
  const MAX_DT = 0.25; // clamp so a minimised window doesn't jump the gauge

  async function openStream(deviceId?: string): Promise<void> {
    if (currentStream) currentStream.getTracks().forEach((t) => t.stop());

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        autoGainControl: false,
        echoCancellation: false,
        noiseSuppression: false,
        ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
      },
    });
    currentStream = stream;

    if (!ctx) ctx = new AudioContext();
    if (analyser) analyser.disconnect();
    const source = ctx.createMediaStreamSource(stream);
    analyser = ctx.createAnalyser();
    analyser.fftSize = 2048;
    source.connect(analyser);
  }

  async function populateMics(): Promise<void> {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const inputs = devices.filter((d) => d.kind === 'audioinput');
    const selected = micSelect.value;
    micSelect.innerHTML = '';
    for (const d of inputs) {
      const opt = document.createElement('option');
      opt.value = d.deviceId;
      opt.textContent = d.label || d.deviceId;
      micSelect.appendChild(opt);
    }
    if (selected) micSelect.value = selected;
  }

  micSelect.addEventListener('change', () => {
    openStream(micSelect.value).catch((e: unknown) => {
      err.textContent = 'Micro inaccessible : ' + (e instanceof Error ? e.message : String(e));
    });
  });

  async function main(): Promise<void> {
    await openStream();
    await populateMics();

    const data = new Float32Array(2048);
    let lastT = performance.now();

    function frame(): void {
      const now = performance.now();
      const dt = Math.min(MAX_DT, Math.max(0, (now - lastT) / 1000));
      lastT = now;

      if (analyser) analyser.getFloatTimeDomainData(data);
      const rawRms = analyser ? rms(data) : 0;
      const dbfs = rawRms > 0 ? 20 * Math.log10(rawRms) : -Infinity;
      const instLevel = Levels.rmsToLevel(rawRms);
      const alpha = Levels.alphaFromDt(dt, Levels.TAU);
      avg = Levels.emaStep(avg, instLevel, alpha);
      const smoothedLevel = avg;
      const threshold = getThreshold();
      const over = smoothedLevel > threshold;

      patience = Levels.patienceStep(patience, smoothedLevel, threshold, dt, getDrainSeconds(), getRefillSeconds());
      if (over) overSeconds += dt;

      fill.style.width = `${smoothedLevel * 100}%`;
      fill.classList.toggle('over', over);
      tickEl.style.left = `${instLevel * 100}%`;
      patienceFill.style.width = `${patience * 100}%`;
      const state = Levels.moodState(patience);
      if (state !== shownState) {
        const rank = { content: 0, attentif: 1, inquiet: 2, fache: 3 };
        if (shownState && soundCheckbox.checked && rank[state] > rank[shownState as keyof typeof rank]) {
          playWorryChime();
        }
        shownState = state;
        stateEl.textContent = MOOD_FR[state];
        patienceFill.className = state; // same four mood colours as the halo
        catSvg.setAttribute('class', state); // CSS does the rest: one class, one pose
      }
      overTimeEl.textContent = `${overSeconds.toFixed(1).replace('.', ',')} s au-dessus du seuil`;

      readout.textContent =
        `rms:       ${rawRms.toFixed(6)}\n` +
        `dBFS:      ${dbfs.toFixed(2)}\n` +
        `smoothed:  ${avg.toFixed(6)}`;

      requestAnimationFrame(frame);
    }
    frame();
  }

  main().catch((e: unknown) => {
    err.textContent = 'getUserMedia error: ' + (e instanceof Error ? e.message : String(e));
  });
})();
