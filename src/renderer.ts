// ambient declarations (drag, menu, api, Levels, Settings) live in globals.d.ts

(function (): void {
  // ponytail: the mic error stays here only. This window is always visible and
  // owns the microphone; relaying the message to a window that may be closed
  // would be more plumbing than the message is worth.
  const err = document.getElementById('err')!;
  const catSvg = document.getElementById('cat')!;
  let shownState = '';

  // manual drag: app-region drag is gone (it ate right-clicks, see main.ts),
  // so #persona drives the window via IPC instead.
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

  // on document, not on #persona: en plein écran le chat ne couvre qu'une partie
  // de l'écran et la tray est masquée par la fenêtre always-on-top — un clic
  // droit sur le fond noir devait aussi ouvrir le menu, sinon on est piégé.
  document.addEventListener('contextmenu', (e: MouseEvent) => {
    e.preventDefault();
    ctxmenu.hidden = false;
    // measure from the origin: at position:fixed an offset left edge shrinks
    // the available width and would report a wrapped, narrower box.
    ctxmenu.style.left = ctxmenu.style.top = '0px';
    const { width, height } = ctxmenu.getBoundingClientRect();
    // clamp against the live viewport — nothing outside it is drawn.
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

  function rms(data: Float32Array): number {
    let sum = 0;
    for (let i = 0; i < data.length; i++) sum += data[i] * data[i];
    return Math.sqrt(sum / data.length);
  }

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
  // placeholder until getSettings() resolves; size is main's business, unused here
  let settings: Settings = { threshold: 0.5, drain: 20, refill: 40, sound: false, micId: '', size: 360 };
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

  // only this window has microphone permission, so it is the one that can read
  // device labels; main caches the list for the settings window.
  async function sendMics(): Promise<void> {
    const devices = await navigator.mediaDevices.enumerateDevices();
    api.sendMics(
      devices
        .filter((d) => d.kind === 'audioinput')
        .map((d) => ({ deviceId: d.deviceId, label: d.label || d.deviceId })),
    );
  }

  api.onSettings((s: Settings) => {
    const micChanged = s.micId !== settings.micId;
    settings = s;
    if (micChanged) {
      openStream(s.micId || undefined).catch((e: unknown) => {
        err.textContent = 'Micro inaccessible : ' + (e instanceof Error ? e.message : String(e));
      });
    }
  });

  async function main(): Promise<void> {
    settings = await api.getSettings();
    await openStream(settings.micId || undefined);
    await sendMics();

    const data = new Float32Array(2048);
    let lastT = performance.now();
    // ponytail: the settings window redraws bars, not a waveform — 20 Hz is
    // already smoother than the eye needs, and 60 Hz of IPC is pure waste.
    let lastSend = 0;
    const SEND_MS = 50;

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
      const threshold = settings.threshold;
      const over = smoothedLevel > threshold;

      patience = Levels.patienceStep(patience, smoothedLevel, threshold, dt, settings.drain, settings.refill);
      if (over) overSeconds += dt;

      const state = Levels.moodState(patience);
      if (state !== shownState) {
        const rank = { content: 0, attentif: 1, inquiet: 2, fache: 3 };
        if (shownState && settings.sound && rank[state] > rank[shownState as keyof typeof rank]) {
          playWorryChime();
        }
        shownState = state;
        catSvg.setAttribute('class', state); // CSS does the rest: one class, one pose
      }

      if (now - lastSend >= SEND_MS) {
        lastSend = now;
        api.sendMeters({ level: smoothedLevel, inst: instLevel, patience, state, over, overSeconds, rms: rawRms, dbfs });
      }

      requestAnimationFrame(frame);
    }
    frame();
  }

  main().catch((e: unknown) => {
    err.textContent = 'getUserMedia error: ' + (e instanceof Error ? e.message : String(e));
  });
})();
