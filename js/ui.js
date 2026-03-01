/* ══════════════════════════════════════════════════
   BYOB — Be Your Own Band  |  js/ui.js
   DOM construction, event handling, step highlighting.

   Interaction modes:
     Default     — click to toggle, drag to paint on/off
     Shift held  — hover fills any note you move over
     Ctrl drag   — rubber-band multi-select
     Ctrl+C      — copy selection
     Ctrl+V      — paste at last-hovered position
     Backspace   — delete selected notes
     Right-edge  — drag to stretch note length (snaps to slots)
   ══════════════════════════════════════════════════ */

'use strict';

// ══════════════════════════════════════════════════
// PLAYBACK HIGHLIGHT
// ══════════════════════════════════════════════════
const _highlightQueue = [];
let   _lastHighlighted = {};

function queueHighlight(step) { _highlightQueue.push(step); }

function drainHighlights() {
  while (_highlightQueue.length) applyStepHighlight(_highlightQueue.shift());
  requestAnimationFrame(drainHighlights);
}

function applyStepHighlight(step) {
  for (const inst of Object.keys(instruments)) {
    const prev = _lastHighlighted[inst];
    if (prev !== undefined) {
      const led = document.getElementById(`led-${inst}-${prev}`);
      if (led) led.classList.remove('lit');
      document.querySelectorAll(`.step[data-inst="${inst}"][data-step="${prev}"]`)
        .forEach(s => s.classList.remove('playing'));
    }
    _lastHighlighted[inst] = step;
    const led = document.getElementById(`led-${inst}-${step}`);
    if (led) led.classList.add('lit');
    document.querySelectorAll(`.step[data-inst="${inst}"][data-step="${step}"]`)
      .forEach(s => { if (s.classList.contains('on')) s.classList.add('playing'); });
  }
  document.getElementById('playheadFill').style.width = ((step / stepCount) * 100) + '%';
}

function clearAllHighlights() {
  document.querySelectorAll('.led-dot').forEach(l => l.classList.remove('lit'));
  document.querySelectorAll('.step').forEach(s => s.classList.remove('playing'));
  document.getElementById('playheadFill').style.width = '0%';
  _lastHighlighted = {};
}

// ══════════════════════════════════════════════════
// SELECTION STATE
// ══════════════════════════════════════════════════
// Each entry: { inst, row, step }
const selection = new Set();
// Clipboard: array of { inst, row, step, len }
let clipboard = [];
// Last hovered position for paste origin
let _hoverInst = null, _hoverRow = null, _hoverStep = 0;

function selKey(inst, row, step) { return `${inst}|${row}|${step}`; }
function selParse(key) { const [inst, row, step] = key.split('|'); return { inst, row, step: parseInt(step) }; }

function selectNote(inst, row, step) {
  selection.add(selKey(inst, row, step));
  const el = stepEl(inst, row, step);
  if (el) el.classList.add('selected');
}

function deselectNote(inst, row, step) {
  selection.delete(selKey(inst, row, step));
  const el = stepEl(inst, row, step);
  if (el) el.classList.remove('selected');
}

function clearSelection() {
  for (const key of selection) {
    const { inst, row, step } = selParse(key);
    const el = stepEl(inst, row, step);
    if (el) el.classList.remove('selected');
  }
  selection.clear();
}

function stepEl(inst, row, step) {
  return document.querySelector(`.step[data-inst="${inst}"][data-row="${row}"][data-step="${step}"]`);
}

// ══════════════════════════════════════════════════
// GRID BUILDER
// ══════════════════════════════════════════════════
function buildAllGrids() {
  for (const [inst, def] of Object.entries(instruments)) buildGrid(inst, def);
}

function buildGrid(inst, def) {
  const container = document.getElementById('seq-' + inst);
  container.innerHTML = '';

  // Beat numbers
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
    stepGrid.dataset.inst = inst;
    stepGrid.dataset.row  = row.id;

    for (let s = 0; s < stepCount; s++) {
      stepGrid.appendChild(makeStepEl(inst, row, s));
    }

    seqRow.appendChild(stepGrid);
    container.appendChild(seqRow);
  }
}

function makeStepEl(inst, row, s) {
  const el = document.createElement('div');
  el.className = 'step' + (s % 4 === 0 && s > 0 ? ' group-start' : '');
  el.dataset.inst = inst;
  el.dataset.row  = row.id;
  el.dataset.step = s;

  // Resize handle (right edge drag)
  const handle = document.createElement('div');
  handle.className = 'step-resize-handle';
  el.appendChild(handle);

  const len = grid[inst][row.id][s];
  if (len > 0) renderStepOn(el, row.color, len);

  el.addEventListener('mousedown',  onStepMousedown);
  el.addEventListener('mouseenter', onStepMouseenter);
  handle.addEventListener('mousedown', onResizeHandleMousedown);

  return el;
}

// Re-render a single step element from grid state
function refreshStepEl(inst, row, s) {
  const el = stepEl(inst, row, s);
  if (!el) return;
  const rowDef = instruments[inst].rows.find(r => r.id === row);
  const len = grid[inst][row][s];
  if (len > 0) renderStepOn(el, rowDef.color, len);
  else renderStepOff(el);
  if (selection.has(selKey(inst, row, s))) el.classList.add('selected');
}

function renderStepOn(el, color, len) {
  el.classList.add('on');
  el.style.background  = color;
  el.style.boxShadow   = `0 0 8px ${color}66`;
  el.style.borderColor = 'transparent';
  // Stretch: flex-grow proportional to length
  el.style.flexGrow = len;
}

function renderStepOff(el) {
  el.classList.remove('on', 'playing', 'selected');
  el.style.background  = '';
  el.style.boxShadow   = '';
  el.style.borderColor = '';
  el.style.flexGrow    = 1;
}

// ══════════════════════════════════════════════════
// MODIFIER KEY TRACKING
// ══════════════════════════════════════════════════
const keys = { ctrl: false, shift: false };

document.addEventListener('keydown', e => {
  if (e.key === 'Control') keys.ctrl  = true;
  if (e.key === 'Shift')   keys.shift = true;

  if (keys.ctrl && e.key === 'c') { e.preventDefault(); copySelection(); }
  if (keys.ctrl && e.key === 'v') { e.preventDefault(); pasteSelection(); }
  if (e.key === 'Backspace' || e.key === 'Delete') deleteSelection();
});

document.addEventListener('keyup', e => {
  if (e.key === 'Control') { keys.ctrl  = false; endRubberBand(); }
  if (e.key === 'Shift')   keys.shift = false;
});

// ══════════════════════════════════════════════════
// DEFAULT MOUSE INTERACTION  (no modifier)
// ══════════════════════════════════════════════════
let _mouseDown = false;
let _dragMode  = null; // 'on' | 'off'

document.addEventListener('mousedown', () => _mouseDown = true);
document.addEventListener('mouseup',   () => {
  _mouseDown = false;
  _dragMode  = null;
});

function onStepMousedown(e) {
  // Let resize handle take priority
  if (e.target.classList.contains('step-resize-handle')) return;

  const el   = e.currentTarget;
  const inst = el.dataset.inst;
  const row  = el.dataset.row;
  const s    = parseInt(el.dataset.step);

  // Track hover position for paste
  _hoverInst = inst; _hoverRow = row; _hoverStep = s;

  if (keys.ctrl) {
    // Ctrl+click: start rubber-band; handled by rubber-band mousedown
    return;
  }

  if (keys.shift) {
    // Shift+click: always turn on
    if (!grid[inst][row][s]) setStep(inst, row, s, 1);
    return;
  }

  // Normal: toggle
  const wasOn = grid[inst][row][s] > 0;
  _dragMode = wasOn ? 'off' : 'on';
  setStep(inst, row, s, wasOn ? 0 : 1);
  clearSelection();
}

function onStepMouseenter(e) {
  const el   = e.currentTarget;
  const inst = el.dataset.inst;
  const row  = el.dataset.row;
  const s    = parseInt(el.dataset.step);

  _hoverInst = inst; _hoverRow = row; _hoverStep = s;

  // Shift: fill on hover
  if (keys.shift) {
    if (!grid[inst][row][s]) setStep(inst, row, s, 1);
    return;
  }

  // Normal drag paint
  if (!_mouseDown || !_dragMode || keys.ctrl) return;
  const target = _dragMode === 'on' ? 1 : 0;
  if ((grid[inst][row][s] > 0) !== (target > 0)) {
    setStep(inst, row, s, target);
  }
}

function setStep(inst, row, s, len) {
  grid[inst][row][s] = len;
  const rowDef = instruments[inst].rows.find(r => r.id === row);
  const el = stepEl(inst, row, s);
  if (!el) return;
  if (len > 0) {
    renderStepOn(el, rowDef.color, len);
    initAudio();
    triggerSound(inst, row, audioCtx.currentTime, instVolumes[inst] * 0.5);
  } else {
    renderStepOff(el);
    selection.delete(selKey(inst, row, s));
  }
}

// ══════════════════════════════════════════════════
// RESIZE HANDLE — right-edge drag to stretch note
// ══════════════════════════════════════════════════
function onResizeHandleMousedown(e) {
  e.stopPropagation();
  e.preventDefault();

  const stepEl  = e.target.parentElement;
  const inst    = stepEl.dataset.inst;
  const row     = stepEl.dataset.row;
  const s       = parseInt(stepEl.dataset.step);
  if (!grid[inst][row][s]) return;

  const rowDef   = instruments[inst].rows.find(r => r.id === row);
  const startX   = e.clientX;
  const startLen = grid[inst][row][s];

  // Measure one slot width from the step-grid
  const grid_el  = stepEl.closest('.step-grid');
  const allSteps = Array.from(grid_el.querySelectorAll('.step'));
  const slotW    = allSteps.length > 1
    ? allSteps[1].getBoundingClientRect().left - allSteps[0].getBoundingClientRect().left
    : stepEl.getBoundingClientRect().width;

  document.body.style.cursor = 'ew-resize';

  const onMove = ev => {
    const dx      = ev.clientX - startX;
    const rawLen  = startLen + Math.round(dx / slotW);
    // Clamp: min 1, max = stepCount - s
    const newLen  = Math.max(1, Math.min(stepCount - s, rawLen));
    if (newLen !== grid[inst][row][s]) {
      grid[inst][row][s] = newLen;
      renderStepOn(stepEl, rowDef.color, newLen);
    }
  };

  const onUp = () => {
    document.body.style.cursor = '';
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup',   onUp);
  };

  document.addEventListener('mousemove', onMove);
  document.addEventListener('mouseup',   onUp);
}

// ══════════════════════════════════════════════════
// RUBBER-BAND SELECTION (Ctrl + drag)
// ══════════════════════════════════════════════════
let _rbActive = false;
let _rbBox    = null;   // the visual div
let _rbStart  = null;   // { x, y } in page coords

document.addEventListener('mousedown', e => {
  if (!keys.ctrl) return;
  // Only start if clicking inside a step-grid area
  if (!e.target.closest('.step-grid') && !e.target.closest('.step')) return;
  e.preventDefault();
  _rbActive = true;
  _rbStart  = { x: e.pageX, y: e.pageY };

  _rbBox = document.createElement('div');
  _rbBox.className = 'rubber-band';
  _rbBox.style.left   = e.pageX + 'px';
  _rbBox.style.top    = e.pageY + 'px';
  _rbBox.style.width  = '0px';
  _rbBox.style.height = '0px';
  document.body.appendChild(_rbBox);

  // Clear selection unless shift is also held
  if (!keys.shift) clearSelection();
});

document.addEventListener('mousemove', e => {
  if (!_rbActive || !_rbBox) return;
  const x  = Math.min(e.pageX, _rbStart.x);
  const y  = Math.min(e.pageY, _rbStart.y);
  const w  = Math.abs(e.pageX - _rbStart.x);
  const h  = Math.abs(e.pageY - _rbStart.y);
  _rbBox.style.left   = x + 'px';
  _rbBox.style.top    = y + 'px';
  _rbBox.style.width  = w + 'px';
  _rbBox.style.height = h + 'px';

  // Hit-test every active step
  const rbRect = { left: x, right: x + w, top: y, bottom: y + h };
  document.querySelectorAll('.step.on').forEach(el => {
    const r   = el.getBoundingClientRect();
    const top = r.top + window.scrollY;
    const hit = r.left < rbRect.right && r.right > rbRect.left &&
                top    < rbRect.bottom && top + r.height > rbRect.top;
    const inst = el.dataset.inst, row = el.dataset.row, step = parseInt(el.dataset.step);
    if (hit) selectNote(inst, row, step);
    else if (!keys.shift) deselectNote(inst, row, step);
  });
});

document.addEventListener('mouseup', () => { if (_rbActive) endRubberBand(); });

function endRubberBand() {
  _rbActive = false;
  if (_rbBox) { _rbBox.remove(); _rbBox = null; }
}

// ══════════════════════════════════════════════════
// COPY / PASTE / DELETE
// ══════════════════════════════════════════════════
function copySelection() {
  if (!selection.size) return;
  clipboard = [];
  let minStep = Infinity;
  for (const key of selection) {
    const { step } = selParse(key);
    if (step < minStep) minStep = step;
  }
  for (const key of selection) {
    const { inst, row, step } = selParse(key);
    clipboard.push({ inst, row, step: step - minStep, len: grid[inst][row][step] });
  }
  showToast(`Copied ${clipboard.length} note${clipboard.length > 1 ? 's' : ''}`);
}

function pasteSelection() {
  if (!clipboard.length) return;
  clearSelection();
  const originStep = _hoverStep;
  for (const { inst, row, step, len } of clipboard) {
    const s = originStep + step;
    if (s < 0 || s >= stepCount) continue;
    setStep(inst, row, s, len);
    selectNote(inst, row, s);
  }
  showToast(`Pasted ${clipboard.length} note${clipboard.length > 1 ? 's' : ''}`);
}

function deleteSelection() {
  if (!selection.size) return;
  const count = selection.size;
  for (const key of [...selection]) {
    const { inst, row, step } = selParse(key);
    setStep(inst, row, step, 0);
  }
  showToast(`Deleted ${count} note${count > 1 ? 's' : ''}`);
}

// ══════════════════════════════════════════════════
// TOAST NOTIFICATION
// ══════════════════════════════════════════════════
let _toastTimer = null;
function showToast(msg) {
  let toast = document.getElementById('byob-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'byob-toast';
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.classList.add('visible');
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => toast.classList.remove('visible'), 1800);
}

// ══════════════════════════════════════════════════
// TRANSPORT CONTROLS
// ══════════════════════════════════════════════════
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

// Global clear
document.getElementById('clearBtn').addEventListener('click', () => {
  clearGrid();
  document.querySelectorAll('.step').forEach(el => renderStepOff(el));
  clearSelection();
});

// Per-instrument clear buttons (injected into each inst header)
document.querySelectorAll('.inst-clear').forEach(btn => {
  btn.addEventListener('click', () => {
    const inst = btn.dataset.inst;
    clearInstGrid(inst);
    document.querySelectorAll(`.step[data-inst="${inst}"]`).forEach(el => renderStepOff(el));
    // Remove any selection for this inst
    for (const key of [...selection]) {
      if (selParse(key).inst === inst) selection.delete(key);
    }
  });
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

// Variant
document.querySelectorAll('.variant-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const inst = btn.dataset.inst;
    document.querySelectorAll(`.variant-btn[data-inst="${inst}"]`)
      .forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    instVariant[inst] = btn.dataset.variant;
  });
});

// Collapse
document.querySelectorAll('.collapse-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.getElementById(btn.dataset.panel).classList.toggle('collapsed');
  });
});

// Swing knob
let _swingY = null, _swingVal = 0;
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
  swingKnob.addEventListener('pointerup', () => swingKnob.removeEventListener('pointermove', onMove), { once: true });
});

// ══════════════════════════════════════════════════
// BOOTSTRAP
// ══════════════════════════════════════════════════
initGrid();
loadDefaultPattern();
buildAllGrids();
requestAnimationFrame(drainHighlights);
