// ambient declarations (api, Settings, Meters) live in globals.d.ts
// No import/export: this loads as a plain <script> in settings.html.

(function (): void {
  const fill = document.getElementById('fill')!;
  const tickEl = document.getElementById('tick')!;
  const thresholdMarker = document.getElementById('thresholdMarker')!;
  const patienceFill = document.getElementById('patienceFill')!;
  const stateEl = document.getElementById('state')!;
  const overTimeEl = document.getElementById('overTime')!;
  const readout = document.getElementById('readout')!;
  const micSelect = document.getElementById('micSelect') as HTMLSelectElement;
  const soundCheckbox = document.getElementById('sound') as HTMLInputElement;

  const MOOD_FR = {
    content: 'Le chat est content',
    attentif: 'Le chat dresse les oreilles',
    inquiet: 'Le chat est inquiet',
    fache: 'Le chat en a assez',
  };

  let settings: Settings;
  let shownState = '';

  // ponytail: this window owns no state of its own — every edit pushes the
  // whole settings object to main, which persists it and relays it to the
  // overlay. One channel, one payload.
  function push(): void {
    api.setSettings(settings);
  }

  function wireSlider(
    inputId: string,
    readoutId: string,
    key: 'threshold' | 'drain' | 'refill' | 'size',
    onChange?: (value: number) => void,
  ): void {
    const input = document.getElementById(inputId) as HTMLInputElement;
    const readoutEl = document.getElementById(readoutId)!;
    input.value = String(settings[key]);
    readoutEl.textContent = String(settings[key]);
    onChange?.(settings[key]);
    input.addEventListener('input', () => {
      settings[key] = Number(input.value);
      readoutEl.textContent = input.value;
      onChange?.(settings[key]);
      push();
    });
  }

  // the mic list comes from the overlay: only that window has microphone
  // permission, so only it can read device labels.
  api.onMics((list) => {
    micSelect.innerHTML = '';
    for (const d of list) {
      const opt = document.createElement('option');
      opt.value = d.deviceId;
      opt.textContent = d.label;
      micSelect.appendChild(opt);
    }
    if (settings) micSelect.value = settings.micId;
  });

  api.onMeters((m) => {
    fill.style.width = `${m.level * 100}%`;
    fill.classList.toggle('over', m.over);
    tickEl.style.left = `${m.inst * 100}%`;
    patienceFill.style.width = `${m.patience * 100}%`;
    if (m.state !== shownState) {
      shownState = m.state;
      stateEl.textContent = MOOD_FR[m.state];
      patienceFill.className = m.state; // same four mood colours as the halo
    }
    overTimeEl.textContent = `${m.overSeconds.toFixed(1).replace('.', ',')} s au-dessus du seuil`;
    readout.textContent =
      `rms:       ${m.rms.toFixed(6)}\n` +
      `dBFS:      ${m.dbfs.toFixed(2)}\n` +
      `smoothed:  ${m.level.toFixed(6)}`;
  });

  api.getSettings().then((s) => {
    settings = s;

    wireSlider('threshold', 'thresholdValue', 'threshold', (v) => {
      thresholdMarker.style.left = `${v * 100}%`;
    });
    wireSlider('drain', 'drainValue', 'drain');
    wireSlider('refill', 'refillValue', 'refill');
    wireSlider('size', 'sizeValue', 'size');

    soundCheckbox.checked = settings.sound;
    soundCheckbox.addEventListener('change', () => {
      settings.sound = soundCheckbox.checked;
      push();
    });

    micSelect.value = settings.micId;
    micSelect.addEventListener('change', () => {
      settings.micId = micSelect.value;
      push();
    });
  });
})();
