/* ══════════════════════════════════════════════════
   BYOB — Be Your Own Band  |  js/audio.js
   Web Audio engine: init, synthesis per instrument,
   step scheduler, and canvas visualizer.
   Depends on: state.js (loaded before this file)
   ══════════════════════════════════════════════════ */

'use strict';

// ── Audio context & nodes ───────────────────────────
let audioCtx       = null;
let masterGainNode = null;
let analyserNode   = null;
let compressorNode = null;

// ── Playback engine ─────────────────────────────────
let isPlaying          = false;
let currentStep        = 0;
let schedulerTimer     = null;
let nextNoteTime       = 0;
const SCHEDULE_AHEAD   = 0.1;   // seconds
const SCHEDULER_TICK   = 25;    // ms

// ── Public: lazy-init audio context ─────────────────
function initAudio() {
  if (audioCtx) return;

  audioCtx = new (window.AudioContext || window.webkitAudioContext)();

  compressorNode = audioCtx.createDynamicsCompressor();
  compressorNode.threshold.value = -12;
  compressorNode.knee.value      =   6;
  compressorNode.ratio.value     =   4;
  compressorNode.attack.value    = 0.003;
  compressorNode.release.value   = 0.25;

  masterGainNode = audioCtx.createGain();
  masterGainNode.gain.value = 0.8;

  analyserNode = audioCtx.createAnalyser();
  analyserNode.fftSize = 2048;

  masterGainNode.connect(compressorNode);
  compressorNode.connect(analyserNode);
  analyserNode.connect(audioCtx.destination);

  startVisualizer();
}

function setMasterVolume(v) {
  if (masterGainNode) masterGainNode.gain.value = v;
}

function getInstGain(inst) {
  return instMuted[inst] ? 0 : instVolumes[inst];
}

// ── Scheduler ───────────────────────────────────────
function scheduleStep(step, time) {
  for (const inst of Object.keys(instruments)) {
    if (!grid[inst]) continue;
    for (const [rowId, pattern] of Object.entries(grid[inst])) {
      if (pattern[step]) {
        triggerSound(inst, rowId, time, getInstGain(inst));
      }
    }
  }
}

function runScheduler() {
  const secondsPerStep = (60 / bpm) / 4; // 16th notes

  while (nextNoteTime < audioCtx.currentTime + SCHEDULE_AHEAD) {
    let t = nextNoteTime;
    // Apply swing: push every odd sub-beat forward
    if (swing > 0 && currentStep % 2 === 1) {
      t += secondsPerStep * swing * 0.5;
    }
    scheduleStep(currentStep, t);
    // Notify UI to update highlights (deferred to next animation frame via ui.js)
    queueHighlight(currentStep);
    currentStep = (currentStep + 1) % stepCount;
    nextNoteTime += secondsPerStep;
  }
}

function startPlayback() {
  initAudio();
  if (audioCtx.state === 'suspended') audioCtx.resume();
  isPlaying    = true;
  currentStep  = 0;
  nextNoteTime = audioCtx.currentTime;
  schedulerTimer = setInterval(runScheduler, SCHEDULER_TICK);
}

function stopPlayback() {
  isPlaying = false;
  clearInterval(schedulerTimer);
}

// ── Synthesis helpers ────────────────────────────────

/** Create a gain node connected to master, set to val at time. */
function makeGain(val, time) {
  const g = audioCtx.createGain();
  g.gain.setValueAtTime(val, time);
  g.connect(masterGainNode);
  return g;
}

/** Soft-clipping distortion curve. */
function makeDistCurve(amount) {
  const n = 512;
  const curve = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i * 2) / n - 1;
    curve[i] = ((Math.PI + amount) * x) / (Math.PI + amount * Math.abs(x));
  }
  return curve;
}

// ── Dispatch ────────────────────────────────────────
function triggerSound(inst, rowId, time, vol) {
  if (!audioCtx || vol === 0) return;
  if (inst === 'drums')  triggerDrum(rowId, time, vol);
  if (inst === 'keys')   triggerKeys(rowId, time, vol);
  if (inst === 'guitar') triggerGuitar(rowId, time, vol);
  if (inst === 'bass')   triggerBass(rowId, time, vol);
}

// ── DRUMS ────────────────────────────────────────────
function triggerDrum(type, time, vol) {
  const elec = instVariant.drums === 'electronic';

  switch (type) {

    case 'kick': {
      const g = makeGain(vol, time);
      const osc = audioCtx.createOscillator();
      osc.connect(g);
      const baseFreq = elec ? 60 : 55;
      osc.frequency.setValueAtTime(baseFreq * 3, time);
      osc.frequency.exponentialRampToValueAtTime(baseFreq, time + 0.06);
      g.gain.exponentialRampToValueAtTime(0.001, time + 0.4);
      osc.start(time); osc.stop(time + 0.41);

      if (!elec) {
        // Acoustic click transient
        const buf = audioCtx.createBuffer(1, Math.floor(audioCtx.sampleRate * 0.03), audioCtx.sampleRate);
        const ch = buf.getChannelData(0);
        for (let i = 0; i < ch.length; i++) ch[i] = (Math.random() * 2 - 1) * Math.exp(-i / (ch.length * 0.3));
        const src = audioCtx.createBufferSource();
        src.buffer = buf;
        const ng = makeGain(vol * 0.4, time);
        src.connect(ng);
        src.start(time);
      }
      break;
    }

    case 'snare': {
      const dur = elec ? 0.18 : 0.22;
      const bufLen = Math.floor(audioCtx.sampleRate * dur);
      const buf = audioCtx.createBuffer(1, bufLen, audioCtx.sampleRate);
      const ch = buf.getChannelData(0);
      for (let i = 0; i < bufLen; i++) ch[i] = Math.random() * 2 - 1;

      const src = audioCtx.createBufferSource();
      src.buffer = buf;
      const filt = audioCtx.createBiquadFilter();
      filt.type = 'bandpass';
      filt.frequency.value = elec ? 2000 : 1500;
      filt.Q.value = 0.8;
      const g = makeGain(vol * 0.8, time);
      src.connect(filt); filt.connect(g);
      g.gain.exponentialRampToValueAtTime(0.001, time + dur);
      src.start(time);

      // Body tone
      const bodyOsc = audioCtx.createOscillator();
      bodyOsc.frequency.value = elec ? 220 : 180;
      const bg = makeGain(vol * 0.3, time);
      bodyOsc.connect(bg);
      bg.gain.exponentialRampToValueAtTime(0.001, time + 0.1);
      bodyOsc.start(time); bodyOsc.stop(time + 0.12);
      break;
    }

    case 'hihat': {
      const ratios = [1, 1.3717, 1.5420, 1.7320, 2.0, 2.3960];
      const dur = elec ? 0.06 : 0.08;
      ratios.forEach(r => {
        const osc = audioCtx.createOscillator();
        osc.type = 'square';
        osc.frequency.value = 4000 * r;
        const f = audioCtx.createBiquadFilter();
        f.type = 'highpass'; f.frequency.value = 8000;
        const g = makeGain(vol * 0.15, time);
        osc.connect(f); f.connect(g);
        g.gain.exponentialRampToValueAtTime(0.001, time + dur);
        osc.start(time); osc.stop(time + dur + 0.01);
      });
      break;
    }

    case 'openhat': {
      const ratios = [1, 1.3717, 1.5420, 1.7320, 2.0, 2.3960];
      const dur = 0.3;
      ratios.forEach(r => {
        const osc = audioCtx.createOscillator();
        osc.type = 'square';
        osc.frequency.value = 4000 * r;
        const f = audioCtx.createBiquadFilter();
        f.type = 'highpass'; f.frequency.value = 7000;
        const g = makeGain(vol * 0.12, time);
        osc.connect(f); f.connect(g);
        g.gain.exponentialRampToValueAtTime(0.001, time + dur);
        osc.start(time); osc.stop(time + dur + 0.01);
      });
      break;
    }

    case 'crash': {
      const ratios = [1, 1.1, 1.47, 1.66, 1.88, 2.1, 2.35, 2.8];
      const dur = 1.2;
      ratios.forEach(r => {
        const osc = audioCtx.createOscillator();
        osc.type = 'square';
        osc.frequency.value = 3000 * r;
        const f = audioCtx.createBiquadFilter();
        f.type = 'highpass'; f.frequency.value = 5000;
        const g = makeGain(vol * 0.08, time);
        osc.connect(f); f.connect(g);
        g.gain.exponentialRampToValueAtTime(0.001, time + dur);
        osc.start(time); osc.stop(time + dur + 0.01);
      });
      break;
    }

    case 'tom': {
      const freq = elec ? 140 : 110;
      const osc = audioCtx.createOscillator();
      osc.frequency.setValueAtTime(freq * 1.5, time);
      osc.frequency.exponentialRampToValueAtTime(freq, time + 0.08);
      const g = makeGain(vol, time);
      osc.connect(g);
      g.gain.exponentialRampToValueAtTime(0.001, time + 0.35);
      osc.start(time); osc.stop(time + 0.36);
      break;
    }

    case 'clap': {
      for (let i = 0; i < 3; i++) {
        const t = time + i * 0.01;
        const buf = audioCtx.createBuffer(1, Math.floor(audioCtx.sampleRate * 0.05), audioCtx.sampleRate);
        const ch = buf.getChannelData(0);
        for (let j = 0; j < ch.length; j++) ch[j] = Math.random() * 2 - 1;
        const src = audioCtx.createBufferSource();
        src.buffer = buf;
        const f = audioCtx.createBiquadFilter();
        f.type = 'bandpass'; f.frequency.value = 1200; f.Q.value = 0.5;
        const g = makeGain(vol * 0.5, t);
        src.connect(f); f.connect(g);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
        src.start(t);
      }
      break;
    }
  }
}

// ── KEYS ─────────────────────────────────────────────
function triggerKeys(noteId, time, vol) {
  const freq    = NOTE_FREQ[noteId] || 261.6;
  const variant = instVariant.keys;

  if (variant === 'piano') {
    [1, 2, 3, 4, 5].forEach((h, i) => {
      const osc = audioCtx.createOscillator();
      osc.frequency.value = freq * h;
      const amp = vol * [0.70, 0.25, 0.12, 0.06, 0.03][i];
      const g = makeGain(0, time);
      osc.connect(g);
      g.gain.linearRampToValueAtTime(amp, time + 0.005);
      g.gain.exponentialRampToValueAtTime(amp * 0.6, time + 0.1);
      g.gain.exponentialRampToValueAtTime(0.001, time + 1.2);
      osc.start(time); osc.stop(time + 1.25);
    });
  }

  else if (variant === 'synth') {
    const osc = audioCtx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = freq;
    const filt = audioCtx.createBiquadFilter();
    filt.type = 'lowpass'; filt.Q.value = 8;
    filt.frequency.setValueAtTime(200,  time);
    filt.frequency.exponentialRampToValueAtTime(4000, time + 0.15);
    filt.frequency.exponentialRampToValueAtTime(800,  time + 0.5);
    const g = makeGain(0, time);
    osc.connect(filt); filt.connect(g);
    g.gain.linearRampToValueAtTime(vol, time + 0.01);
    g.gain.exponentialRampToValueAtTime(vol * 0.6, time + 0.1);
    g.gain.exponentialRampToValueAtTime(0.001, time + 0.8);
    osc.start(time); osc.stop(time + 0.85);
  }

  else if (variant === 'organ') {
    const drawbars = [0.50, 0.40, 0.30, 0.20, 0.15, 0.10];
    [1, 2, 3, 4, 6, 8].forEach((h, i) => {
      const osc = audioCtx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = freq * h;
      const g = makeGain(vol * drawbars[i], time);
      osc.connect(g);
      g.gain.setValueAtTime(vol * drawbars[i], time + 0.4);
      g.gain.linearRampToValueAtTime(0, time + 0.45);
      osc.start(time); osc.stop(time + 0.46);
    });
  }
}

// ── GUITAR ───────────────────────────────────────────
function triggerGuitar(noteId, time, vol) {
  const freq    = NOTE_FREQ[noteId] || 82.4;
  const variant = instVariant.guitar;

  if (variant === 'acoustic') {
    // Noise burst → resonant bandpass filters (Karplus-Strong inspired)
    const bufLen = Math.floor(audioCtx.sampleRate * 0.5);
    const buf = audioCtx.createBuffer(1, bufLen, audioCtx.sampleRate);
    const ch = buf.getChannelData(0);
    for (let i = 0; i < bufLen; i++) {
      ch[i] = (Math.random() * 2 - 1) * Math.exp(-i / (audioCtx.sampleRate * 0.02));
    }
    const src = audioCtx.createBufferSource();
    src.buffer = buf;

    [1, 2, 3].forEach((h, i) => {
      const f = audioCtx.createBiquadFilter();
      f.type = 'bandpass';
      f.frequency.value = freq * h;
      f.Q.value = 20 + i * 10;
      const g = makeGain(vol * [0.70, 0.35, 0.15][i], time);
      src.connect(f); f.connect(g);
      g.gain.exponentialRampToValueAtTime(0.001, time + [1.2, 0.8, 0.5][i]);
    });
    src.start(time);
  }

  else { // electric
    const osc1 = audioCtx.createOscillator();
    osc1.type = 'sawtooth';
    osc1.frequency.value = freq;

    const osc2 = audioCtx.createOscillator();
    osc2.type = 'sawtooth';
    osc2.frequency.value = freq * 1.005; // chorus detune

    const ws = audioCtx.createWaveShaper();
    ws.curve = makeDistCurve(150);
    ws.oversample = '4x';

    const cabinet = audioCtx.createBiquadFilter();
    cabinet.type = 'peaking';
    cabinet.frequency.value = 2000;
    cabinet.gain.value = -6;

    const g = makeGain(vol * 0.4, time);
    osc1.connect(ws); osc2.connect(ws);
    ws.connect(cabinet); cabinet.connect(g);

    g.gain.exponentialRampToValueAtTime(0.001, time + 0.7);
    osc1.start(time); osc2.start(time);
    osc1.stop(time + 0.72); osc2.stop(time + 0.72);
  }
}

// ── BASS ─────────────────────────────────────────────
function triggerBass(noteId, time, vol) {
  const freq    = NOTE_FREQ[noteId] || 41.2;
  const variant = instVariant.bass;

  if (variant === 'electric') {
    const osc1 = audioCtx.createOscillator();
    osc1.type = 'triangle';
    osc1.frequency.value = freq;

    const osc2 = audioCtx.createOscillator();
    osc2.type = 'sine';
    osc2.frequency.value = freq;

    const filt = audioCtx.createBiquadFilter();
    filt.type = 'lowpass';
    filt.frequency.value = 800;

    const g = makeGain(0, time);
    osc1.connect(filt); osc2.connect(filt); filt.connect(g);

    g.gain.linearRampToValueAtTime(vol, time + 0.01);
    g.gain.setValueAtTime(vol, time + 0.1);
    g.gain.exponentialRampToValueAtTime(0.001, time + 0.6);
    osc1.start(time); osc2.start(time);
    osc1.stop(time + 0.65); osc2.stop(time + 0.65);
  }

  else { // synth bass
    const osc = audioCtx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = freq;

    const filt = audioCtx.createBiquadFilter();
    filt.type = 'lowpass'; filt.Q.value = 12;
    filt.frequency.setValueAtTime(3000, time);
    filt.frequency.exponentialRampToValueAtTime(100, time + 0.3);

    const g = makeGain(0, time);
    osc.connect(filt); filt.connect(g);

    g.gain.linearRampToValueAtTime(vol * 0.9, time + 0.008);
    g.gain.exponentialRampToValueAtTime(0.001, time + 0.5);
    osc.start(time); osc.stop(time + 0.55);
  }
}

// ── Visualizer ───────────────────────────────────────
function startVisualizer() {
  const waveCanvas = document.getElementById('waveCanvas');
  const specCanvas = document.getElementById('specCanvas');
  const wc = waveCanvas.getContext('2d');
  const sc = specCanvas.getContext('2d');

  function resize() {
    const dpr = window.devicePixelRatio || 1;
    waveCanvas.width  = waveCanvas.offsetWidth  * dpr;
    waveCanvas.height = waveCanvas.offsetHeight * dpr;
    specCanvas.width  = specCanvas.offsetWidth  * dpr;
    specCanvas.height = specCanvas.offsetHeight * dpr;
  }
  resize();
  window.addEventListener('resize', resize);

  const waveData = new Uint8Array(analyserNode.frequencyBinCount);
  const freqData = new Uint8Array(analyserNode.frequencyBinCount);

  function draw() {
    requestAnimationFrame(draw);
    const dpr = window.devicePixelRatio || 1;
    const ww = waveCanvas.width, wh = waveCanvas.height;
    const sw = specCanvas.width, sh = specCanvas.height;

    // Waveform
    analyserNode.getByteTimeDomainData(waveData);
    wc.clearRect(0, 0, ww, wh);
    wc.strokeStyle = '#f5a623';
    wc.lineWidth   = 2 * dpr;
    wc.shadowColor = '#f5a623';
    wc.shadowBlur  = 6;
    wc.beginPath();
    const sliceW = ww / waveData.length;
    waveData.forEach((v, i) => {
      const y = (v / 128) * (wh / 2);
      i === 0 ? wc.moveTo(0, y) : wc.lineTo(i * sliceW, y);
    });
    wc.stroke();

    // Spectrum
    analyserNode.getByteFrequencyData(freqData);
    sc.clearRect(0, 0, sw, sh);
    const bins  = Math.floor(freqData.length / 4);
    const barW  = sw / bins;
    for (let i = 0; i < bins; i++) {
      const h   = (freqData[i] / 255) * sh;
      const hue = 30 + (i / bins) * 60;
      sc.fillStyle = `hsl(${hue}, 90%, 55%)`;
      sc.fillRect(i * barW, sh - h, Math.max(barW - 1, 1), h);
    }
  }
  draw();
}
