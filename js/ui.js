/* ══════════════════════════════════════════════════
   BYOB — Be Your Own Band  |  js/ui.js
   DOM construction, event handling, step highlighting.
   Depends on: state.js, audio.js (both loaded before)
   ══════════════════════════════════════════════════ */

'use strict';

// ── Step highlight queue ─────────────────────────────
// audio.js calls queueHighlight(); ui.js drains it on rAF.
const _highlightQueue = [];
let   _lastHighlighted = {};

function queueHighlight(step) {
  _highlightQueue.push(step);
}

function drainHighlights() {
  while (_highlightQueue.length) {
    applyStepHighlight(_highlightQueue.shift());
  }
  requestAnimationFrame(drainHighlights);
}

function applyStepHighlight(step) {
  const allInsts = Object.keys(instruments);

  // Clear previous highlight
  for (const inst of allInsts) {
    const prev = _lastHighlighted[inst];
    if (prev !== undefined) {
      const led = document.getElementById(`led-${inst}-${prev}`);
      if (led) led.classList.remove('lit');
      document.querySelectorAll(`.step[data-inst="${inst}"][data-step="${prev}"]`)
        .forEach(s => s.classList.remove('playing'));
    }
    _lastHighlighted[inst] = step;
  }

  // Apply new highlight
  for (const inst of allInsts) {
    const led = document.getElementById(`led-${inst}-${step}`);
    if (led) led.classList.add('lit');
    document.querySelectorAll(`.step[data-inst="${inst}"][data-step="${step}"]`)
      .forEach(s => { if (s.classList.contains('on')) s.classList.add('playing'); });
  }

  // Playhead bar
  document.getElementById('playheadFill').style.width =
    ((step / stepCount) * 100) + '%';
}

function clearAllHighlights() {
  document.querySelectorAll('.led-dot').forEach(l => l.classList.remove('lit'));
  document.querySelectorAll('.step').forEach(s => s.classList.remove('playing'));
  document.getElementById('playheadFill').style.width = '0%';
  _lastHighlighted = {};
}

// ── Grid builder ────────────────────────────────────

function buildAllGrids() {
  for (const [inst, def] of Object.entries(instruments)) {
    buildGrid(inst, def);
  }
}

function buildGrid(inst, def) {
  const container = document.getElementById('seq-' + inst);
  container.innerHTML = '';

  // Beat number row
  const numRow = document.createElement('div');
  numRow.className = 'beat-numbers';
  for (let s = 0; s < stepCount; s++) {
    const n = document.createElement('div');
    n.className = 'beat-num' + (s % 4 === 0 ? ' quarter' : '') + (s % 4 === 0 && s > 0 ? ' group-start' : '');
    n.textContent = s % 4 === 0 ? String(s / 4 + 1) : '';
    numRow.appendChild(n);
  }
  container.appendChild(numRow);

  // LED row
  const ledRow = document.createElement('div');
  ledRow.className = 'led-row';
  ledRow.id = `leds-${inst}`;
  for (let s = 0; s < stepCount; s++) {
    const dot = document.createElement('div');
    dot.className = 'led-dot' + (s % 4 === 0 && s > 0 ? ' group-start' : '');
    dot.id = `led-${inst}-${s}`;
    ledRow.appendChild(dot);
  }
  container.appendChild(ledRow);

  // Step rows
  for (const row of def.rows) {
    const seqRow = document.createElement('div');
    seqRow.className = 'seq-row';

    const label = document.createElement('div');
    label.className = 'row-label';
    label.textContent = row.label;
    seqRow.appendChild(label);

    const stepGrid = document.createElement('div');
    stepGrid.className = 'step-grid';

    for (let s = 0; s < stepCount; s++) {
      const step = document.createElement('div');
      step.className = 'step' + (s % 4 === 0 && s > 0 ? ' group-start' : '');
      step.dataset.inst = inst;
      step.dataset.row  = row.id;
      step.dataset.step = s;

      if (grid[inst][row.id][s]) {
        applyStepOn(step, row.color);
      }

      step.addEventListener('mousedown',  onStepMousedown);
      step.addEventListener('mouseenter', onStepMouseenter);
      stepGrid.appendChild(step);
    }

    seqRow.appendChild(stepGrid);
    container.appendChild(seqRow);
  }
}

// ── Step interaction ─────────────────────────────────
let _mouseDown = false;
let _dragMode  = null; // 'on' | 'off'

document.addEventListener('mousedown', () => _mouseDown = true);
document.addEventListener('mouseup',   () => { _mouseDown = false; _dragMode = null; });

function onStepMousedown(e) {
  const { inst, row, step } = e.target.dataset;
  const s     = parseInt(step);
  const wasOn = grid[inst][row][s];
  _dragMode   = wasOn ? 'off' : 'on';
  setStep(e.target, inst, row, s, !wasOn);
}

function onStepMouseenter(e) {
  if (!_mouseDown || !_dragMode) return;
  const { inst, row, step } = e.target.dataset;
  if (!inst || !row) return;
  const s      = parseInt(step);
  const target = _dragMode === 'on';
  if (grid[inst][row][s] !== target) {
    setStep(e.target, inst, row, s, target);
  }
}

function setStep(el, inst, row, s, state) {
  grid[inst][row][s] = state;
  const rowDef = instruments[inst].rows.find(r => r.id === row);

  if (state) {
    applyStepOn(el, rowDef.color);
    // Preview the note immediately
    initAudio();
    triggerSound(inst, row, audioCtx.currentTime, instVolumes[inst] * 0.5);
  } else {
    applyStepOff(el);
  }
}

function applyStepOn(el, color) {
  el.classList.add('on');
  el.style.background  = color;
  el.style.boxShadow   = `0 0 8px ${color}66`;
  el.style.borderColor = 'transparent';
}

function applyStepOff(el) {
  el.classList.remove('on', 'playing');
  el.style.background  = '';
  el.style.boxShadow   = '';
  el.style.borderColor = '';
}

// ── Transport controls ───────────────────────────────
const playBtn = document.getElementById('playBtn');
const stopBtn = document.getElementById('stopBtn');

playBtn.addEventListener('click', () => {
  if (isPlaying) {
    stopPlayback();
    clearAllHighlights();
    playBtn.textContent = '▶ Play';
    playBtn.classList.remove('playing');
  } else {
    startPlayback();
    playBtn.textContent = '■ Stop';
    playBtn.classList.add('playing');
  }
});

stopBtn.addEventListener('click', () => {
  stopPlayback();
  clearAllHighlights();
  playBtn.textContent = '▶ Play';
  playBtn.classList.remove('playing');
});

document.getElementById('clearBtn').addEventListener('click', () => {
  clearGrid();
  document.querySelectorAll('.step').forEach(s => applyStepOff(s));
});

// BPM
document.getElementById('bpmInput').addEventListener('input', e => {
  bpm = Math.min(220, Math.max(40, parseInt(e.target.value) || 120));
});
document.getElementById('bpmUp').addEventListener('click', () => {
  bpm = Math.min(220, bpm + 1);
  document.getElementById('bpmInput').value = bpm;
});
document.getElementById('bpmDown').addEventListener('click', () => {
  bpm = Math.max(40, bpm - 1);
  document.getElementById('bpmInput').value = bpm;
});

// Steps
document.getElementById('stepsSelect').addEventListener('change', e => {
  resizeGrid(parseInt(e.target.value));
  buildAllGrids();
  if (isPlaying) { stopPlayback(); startPlayback(); }
});

// Master volume
document.getElementById('masterVol').addEventListener('input', e => {
  setMasterVolume(parseFloat(e.target.value));
});

// Instrument volumes
document.querySelectorAll('.inst-vol-slider').forEach(slider => {
  slider.addEventListener('input', e => {
    instVolumes[e.target.dataset.inst] = parseFloat(e.target.value);
  });
});

// Mute
document.querySelectorAll('.inst-mute').forEach(btn => {
  btn.addEventListener('click', () => {
    const inst = btn.dataset.inst;
    instMuted[inst] = !instMuted[inst];
    btn.classList.toggle('muted', instMuted[inst]);
    btn.textContent = instMuted[inst] ? 'Unmute' : 'Mute';
  });
});

// Variant (instrument style)
document.querySelectorAll('.variant-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const inst = btn.dataset.inst;
    document.querySelectorAll(`.variant-btn[data-inst="${inst}"]`)
      .forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    instVariant[inst] = btn.dataset.variant;
  });
});

// Collapse panels
document.querySelectorAll('.collapse-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.getElementById(btn.dataset.panel).classList.toggle('collapsed');
  });
});

// ── Swing knob ───────────────────────────────────────
let _swingY   = null;
let _swingVal = 0;
const swingKnob = document.getElementById('swingKnob');

swingKnob.addEventListener('pointerdown', e => {
  _swingY = e.clientY;
  swingKnob.setPointerCapture(e.pointerId);

  const onMove = e2 => {
    const dy = _swingY - e2.clientY;
    _swingVal = Math.max(0, Math.min(1, _swingVal + dy / 100));
    _swingY   = e2.clientY;
    swing     = _swingVal;
    swingKnob.style.setProperty('--k-rot', (-150 + _swingVal * 300) + 'deg');
  };

  swingKnob.addEventListener('pointermove', onMove);
  swingKnob.addEventListener('pointerup', () => {
    swingKnob.removeEventListener('pointermove', onMove);
  }, { once: true });
});

// ── Bootstrap ────────────────────────────────────────
initGrid();
loadDefaultPattern();
buildAllGrids();
requestAnimationFrame(drainHighlights);
