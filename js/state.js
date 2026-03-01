/* ══════════════════════════════════════════════════
   BYOB — Be Your Own Band  |  js/state.js
   Grid model:
     grid[inst][rowId][step] = 0 (off) | N (note spans N slots)
   ══════════════════════════════════════════════════ */
'use strict';

let stepCount = 32;
let bpm       = 120;
let swing     = 0;

const instVolumes = { drums: 0.85, keys: 0.70, guitar: 0.70, bass: 0.80 };
const instMuted   = { drums: false, keys: false, guitar: false, bass: false };
const instVariant = { drums: 'acoustic', keys: 'piano', guitar: 'acoustic', bass: 'electric' };

const grid = {};

const instruments = {
  drums: {
    color: 'var(--drums-color)',
    rows: [
      { id: 'kick',    label: 'Kick',    color: '#e85544' },
      { id: 'snare',   label: 'Snare',   color: '#ff8866' },
      { id: 'hihat',   label: 'Hi-Hat',  color: '#ffaa33' },
      { id: 'openhat', label: 'Open HH', color: '#ffcc44' },
      { id: 'crash',   label: 'Crash',   color: '#ffdd88' },
      { id: 'tom',     label: 'Tom',     color: '#dd6644' },
      { id: 'clap',    label: 'Clap',    color: '#ff6688' },
    ],
  },
  keys: {
    color: 'var(--keys-color)',
    rows: [
      { id: 'C4', label: 'C4', color: '#5b9cf5' },
      { id: 'D4', label: 'D4', color: '#6aabff' },
      { id: 'E4', label: 'E4', color: '#79bbff' },
      { id: 'F4', label: 'F4', color: '#5b9cf5' },
      { id: 'G4', label: 'G4', color: '#4a8de0' },
      { id: 'A4', label: 'A4', color: '#6aabff' },
      { id: 'B4', label: 'B4', color: '#79bbff' },
      { id: 'C5', label: 'C5', color: '#3a7cd0' },
    ],
  },
  guitar: {
    color: 'var(--guitar-color)',
    rows: [
      { id: 'E2',  label: 'E2', color: '#5dd67a' },
      { id: 'A2',  label: 'A2', color: '#4ec46a' },
      { id: 'D3',  label: 'D3', color: '#6ddd88' },
      { id: 'G3',  label: 'G3', color: '#5dd67a' },
      { id: 'B3',  label: 'B3', color: '#7ee690' },
      { id: 'E4g', label: 'E4', color: '#4ec46a' },
    ],
  },
  bass: {
    color: 'var(--bass-color)',
    rows: [
      { id: 'E1', label: 'E1', color: '#a875f5' },
      { id: 'A1', label: 'A1', color: '#9966e0' },
      { id: 'D2', label: 'D2', color: '#bb88ff' },
      { id: 'G2', label: 'G2', color: '#a875f5' },
      { id: 'C2', label: 'C2', color: '#cc99ff' },
    ],
  },
};

const NOTE_FREQ = {
  C1:32.7, D1:36.7, E1:41.2, F1:43.7, G1:49,   A1:55,   B1:61.7,
  C2:65.4, D2:73.4, E2:82.4, F2:87.3, G2:98,   A2:110,  B2:123.5,
  C3:130.8,D3:146.8,E3:164.8,F3:174.6,G3:196,  A3:220,  B3:246.9,
  C4:261.6,D4:293.7,E4:329.6,F4:349.2,G4:392,  A4:440,  B4:493.9,
  C5:523.3,D5:587.3,E5:659.3,F5:698.5,G5:784,  A5:880,  B5:987.8,
  E4g:329.6,
};

function initGrid() {
  for (const [inst, def] of Object.entries(instruments)) {
    grid[inst] = {};
    for (const row of def.rows) grid[inst][row.id] = new Array(stepCount).fill(0);
  }
}

function resizeGrid(newCount) {
  for (const [inst, def] of Object.entries(instruments)) {
    for (const row of def.rows) {
      const old = grid[inst][row.id];
      const next = new Array(newCount).fill(0);
      for (let i = 0; i < Math.min(old.length, newCount); i++) next[i] = old[i];
      grid[inst][row.id] = next;
    }
  }
  stepCount = newCount;
}

function clearGrid() {
  for (const inst of Object.keys(grid))
    for (const rowId of Object.keys(grid[inst]))
      grid[inst][rowId].fill(0);
}

function clearInstGrid(inst) {
  for (const rowId of Object.keys(grid[inst]))
    grid[inst][rowId].fill(0);
}

function loadDefaultPattern() {
  const s = (inst, row, steps) =>
    steps.forEach(i => { if (i < stepCount) grid[inst][row][i] = 1; });
  s('drums','kick',  [0,8,16,24]);
  s('drums','snare', [4,12,20,28]);
  s('drums','hihat', [0,2,4,6,8,10,12,14,16,18,20,22,24,26,28,30]);
  s('bass', 'E1',    [0,10,16,26]);
}
