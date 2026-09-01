'use strict';

const COLS = 10;
const ROWS = 20;
const BLOCK = 30;

const COLORS = [
  null,
  '#4dd0e1', // I - cyan
  '#ffd54f', // O - yellow
  '#ba68c8', // T - purple
  '#81c784', // S - green
  '#e57373', // Z - red
  '#64b5f6', // J - azul
  '#ffb74d', // L - orange
  '#b0bec5', // N - tuerca (gris metálico)
];

const PIECES = [
  null,
  [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]], // I
  [[2,2],[2,2]],                               // O
  [[0,3,0],[3,3,3],[0,0,0]],                  // T
  [[0,4,4],[4,4,0],[0,0,0]],                  // S
  [[5,5,0],[0,5,5],[0,0,0]],                  // Z
  [[6,0,0],[6,6,6],[0,0,0]],                  // J
  [[0,0,7],[7,7,7],[0,0,0]],                  // L
  [[8,8,8],[8,0,8],[8,8,8]],                  // N - tuerca
];

const LINE_SCORES = [0, 100, 300, 500, 800];

const canvas = document.getElementById('board');
const ctx = canvas.getContext('2d');
const nextCanvas = document.getElementById('next-canvas');
const nextCtx = nextCanvas.getContext('2d');
const scoreEl = document.getElementById('score');
const linesEl = document.getElementById('lines');
const levelEl = document.getElementById('level');
const overlay = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlay-title');
const overlayScore = document.getElementById('overlay-score');
const restartBtn = document.getElementById('restart-btn');
const themeToggle = document.getElementById('theme-toggle');
const THEME_KEY = 'tetris-theme';
const highscoreListEl = document.getElementById('highscore-list');
const overlayHighscoreListEl = document.getElementById('overlay-highscore-list');
const resetHighscoresBtn = document.getElementById('reset-highscores-btn');
const newHighscoreForm = document.getElementById('new-highscore-form');
const highscoreNameInput = document.getElementById('highscore-name-input');
const saveHighscoreBtn = document.getElementById('save-highscore-btn');
const HIGHSCORES_KEY = 'tetris-highscores';
const MAX_HIGHSCORES = 5;

let board, current, next, score, lines, level, paused, gameOver, lastTime, dropAccum, dropInterval, animId;
let gridColor;
let combo, maxCombo;
let pendingHighscoreIndex = -1;
let pendingHighscoreEntry = null;

function createBoard() {
  return Array.from({ length: ROWS }, () => new Array(COLS).fill(0));
}

function randomPiece() {
  const type = Math.floor(Math.random() * 8) + 1;
  const shape = PIECES[type].map(row => [...row]);
  return { type, shape, x: Math.floor(COLS / 2) - Math.floor(shape[0].length / 2), y: 0 };
}

function collide(shape, ox, oy) {
  for (let r = 0; r < shape.length; r++) {
    for (let c = 0; c < shape[r].length; c++) {
      if (!shape[r][c]) continue;
      const nx = ox + c;
      const ny = oy + r;
      if (nx < 0 || nx >= COLS || ny >= ROWS) return true;
      if (ny >= 0 && board[ny][nx]) return true;
    }
  }
  return false;
}

function rotateCW(shape) {
  const rows = shape.length, cols = shape[0].length;
  const result = Array.from({ length: cols }, () => new Array(rows).fill(0));
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      result[c][rows - 1 - r] = shape[r][c];
  return result;
}

function tryRotate() {
  const rotated = rotateCW(current.shape);
  const kicks = [0, -1, 1, -2, 2];
  for (const kick of kicks) {
    if (!collide(rotated, current.x + kick, current.y)) {
      current.shape = rotated;
      current.x += kick;
      return;
    }
  }
}

function merge() {
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        board[current.y + r][current.x + c] = current.shape[r][c];
}

function clearLines() {
  let cleared = 0;
  for (let r = ROWS - 1; r >= 0; r--) {
    if (board[r].every(v => v !== 0)) {
      board.splice(r, 1);
      board.unshift(new Array(COLS).fill(0));
      cleared++;
      r++;
    }
  }
  if (cleared) {
    lines += cleared;
    score += (LINE_SCORES[cleared] || 0) * level;
    level = Math.floor(lines / 10) + 1;
    dropInterval = Math.max(100, 1000 - (level - 1) * 90);
    combo++;
    if (combo > maxCombo) maxCombo = combo;
    updateHUD();
  } else {
    combo = 0;
  }
  return cleared;
}

function ghostY() {
  let gy = current.y;
  while (!collide(current.shape, current.x, gy + 1)) gy++;
  return gy;
}

function hardDrop() {
  const gy = ghostY();
  score += (gy - current.y) * 2;
  current.y = gy;
  lockPiece();
}

function softDrop() {
  if (!collide(current.shape, current.x, current.y + 1)) {
    current.y++;
    score += 1;
    updateHUD();
  } else {
    lockPiece();
  }
}

function lockPiece() {
  merge();
  clearLines();
  spawn();
}

function spawn() {
  current = next;
  next = randomPiece();
  if (collide(current.shape, current.x, current.y)) {
    endGame();
  }
  drawNext();
}

function updateHUD() {
  scoreEl.textContent = score.toLocaleString();
  linesEl.textContent = lines;
  levelEl.textContent = level;
}

function drawBlock(context, x, y, colorIndex, size, alpha) {
  if (!colorIndex) return;
  const color = COLORS[colorIndex];
  context.globalAlpha = alpha ?? 1;
  context.fillStyle = color;
  context.fillRect(x * size + 1, y * size + 1, size - 2, size - 2);
  // highlight
  context.fillStyle = 'rgba(255,255,255,0.12)';
  context.fillRect(x * size + 1, y * size + 1, size - 2, 4);
  context.globalAlpha = 1;
}

function drawGrid() {
  ctx.strokeStyle = gridColor;
  ctx.lineWidth = 0.5;
  for (let c = 1; c < COLS; c++) {
    ctx.beginPath();
    ctx.moveTo(c * BLOCK, 0);
    ctx.lineTo(c * BLOCK, ROWS * BLOCK);
    ctx.stroke();
  }
  for (let r = 1; r < ROWS; r++) {
    ctx.beginPath();
    ctx.moveTo(0, r * BLOCK);
    ctx.lineTo(COLS * BLOCK, r * BLOCK);
    ctx.stroke();
  }
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawGrid();

  // board
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++)
      drawBlock(ctx, c, r, board[r][c], BLOCK);

  // ghost
  const gy = ghostY();
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        drawBlock(ctx, current.x + c, gy + r, current.shape[r][c], BLOCK, 0.2);

  // current piece
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      drawBlock(ctx, current.x + c, current.y + r, current.shape[r][c], BLOCK);
}

function drawNext() {
  const NB = 30;
  nextCtx.clearRect(0, 0, nextCanvas.width, nextCanvas.height);
  const shape = next.shape;
  const offX = Math.floor((4 - shape[0].length) / 2);
  const offY = Math.floor((4 - shape.length) / 2);
  for (let r = 0; r < shape.length; r++)
    for (let c = 0; c < shape[r].length; c++)
      drawBlock(nextCtx, offX + c, offY + r, shape[r][c], NB);
}

function loadHighscores() {
  try {
    const raw = JSON.parse(localStorage.getItem(HIGHSCORES_KEY));
    if (!Array.isArray(raw)) return [];
    return raw.filter(e => e && typeof e.score === 'number');
  } catch {
    return [];
  }
}

function saveHighscores(list) {
  localStorage.setItem(HIGHSCORES_KEY, JSON.stringify(list));
}

function getHighscoreRankIndex(list, candidateScore) {
  if (list.length < MAX_HIGHSCORES) return list.length;
  const idx = list.findIndex(e => candidateScore > e.score);
  return idx === -1 ? -1 : idx;
}

function renderHighscoreList(listEl, entries, highlightIndex) {
  listEl.textContent = '';
  if (entries.length === 0) {
    const li = document.createElement('li');
    li.className = 'highscore-empty';
    li.textContent = 'Sin récords aún';
    listEl.appendChild(li);
    return;
  }
  entries.forEach((entry, i) => {
    const li = document.createElement('li');
    if (i === highlightIndex) li.classList.add('highscore-highlight');

    const rank = document.createElement('span');
    rank.className = 'highscore-rank';
    rank.textContent = `${i + 1}.`;

    const name = document.createElement('span');
    name.className = 'highscore-name';
    name.textContent = entry.name;
    name.title = `${entry.name} — Líneas: ${entry.lines ?? 0}, Combo máx: ${entry.maxCombo ?? 0}`;

    const scoreSpan = document.createElement('span');
    scoreSpan.className = 'highscore-score';
    scoreSpan.textContent = entry.score.toLocaleString();

    li.appendChild(rank);
    li.appendChild(name);
    li.appendChild(scoreSpan);
    listEl.appendChild(li);
  });
}

function refreshHighscoreDisplays(highlightIndex = -1) {
  const list = loadHighscores();
  renderHighscoreList(highscoreListEl, list, -1);
  renderHighscoreList(overlayHighscoreListEl, list, highlightIndex);
}

function resetHighscores() {
  localStorage.removeItem(HIGHSCORES_KEY);
  refreshHighscoreDisplays();
}

function saveNewHighscore() {
  // Guard: solo se puede guardar mientras el juego terminó y hay un récord
  // pendiente de esta partida (evita registros espurios si se reinicia
  // el juego mientras el formulario seguía visible/enfocado).
  if (!gameOver || !pendingHighscoreEntry) return;
  const name = (highscoreNameInput.value || 'Jugador').trim().slice(0, 12) || 'Jugador';
  const list = loadHighscores();
  const entry = { ...pendingHighscoreEntry, name };
  list.splice(pendingHighscoreIndex === -1 ? list.length : pendingHighscoreIndex, 0, entry);
  list.sort((a, b) => b.score - a.score);
  const trimmed = list.slice(0, MAX_HIGHSCORES);
  saveHighscores(trimmed);
  const newIndex = trimmed.findIndex(e => e === entry);
  newHighscoreForm.classList.add('hidden');
  pendingHighscoreEntry = null;
  refreshHighscoreDisplays(newIndex);
}

function endGame() {
  gameOver = true;
  cancelAnimationFrame(animId);
  overlayTitle.textContent = 'GAME OVER';
  overlayScore.textContent = `Puntuación: ${score.toLocaleString()}`;
  overlay.classList.remove('hidden');

  const list = loadHighscores();
  pendingHighscoreIndex = getHighscoreRankIndex(list, score);
  if (pendingHighscoreIndex !== -1 && score > 0) {
    // Snapshot de los datos de esta partida: evita guardar valores
    // incorrectos si el jugador reinicia antes de confirmar el nombre.
    pendingHighscoreEntry = { score, lines, maxCombo };
    newHighscoreForm.classList.remove('hidden');
    highscoreNameInput.disabled = false;
    saveHighscoreBtn.disabled = false;
    highscoreNameInput.value = '';
    refreshHighscoreDisplays(-1);
    setTimeout(() => highscoreNameInput.focus(), 0);
  } else {
    pendingHighscoreEntry = null;
    newHighscoreForm.classList.add('hidden');
    refreshHighscoreDisplays(-1);
  }
}

function togglePause() {
  if (gameOver) return;
  paused = !paused;
  if (!paused) {
    lastTime = performance.now();
    loop(lastTime);
  } else {
    cancelAnimationFrame(animId);
    overlayTitle.textContent = 'PAUSA';
    overlayScore.textContent = '';
    overlay.classList.remove('hidden');
  }
}

function loop(ts) {
  const dt = ts - lastTime;
  lastTime = ts;
  dropAccum += dt;
  if (dropAccum >= dropInterval) {
    dropAccum = 0;
    if (!collide(current.shape, current.x, current.y + 1)) {
      current.y++;
    } else {
      lockPiece();
    }
  }
  if (gameOver) return;
  draw();
  animId = requestAnimationFrame(loop);
}

function init() {
  board = createBoard();
  score = 0;
  lines = 0;
  level = 1;
  paused = false;
  gameOver = false;
  dropInterval = 1000;
  dropAccum = 0;
  combo = 0;
  maxCombo = 0;
  pendingHighscoreIndex = -1;
  pendingHighscoreEntry = null;
  lastTime = performance.now();
  next = randomPiece();
  spawn();
  updateHUD();
  overlay.classList.add('hidden');
  newHighscoreForm.classList.add('hidden');
  highscoreNameInput.disabled = true;
  saveHighscoreBtn.disabled = true;
  cancelAnimationFrame(animId);
  animId = requestAnimationFrame(loop);
}

document.addEventListener('keydown', e => {
  if (e.code === 'KeyP') { togglePause(); return; }
  if (paused || gameOver) return;
  switch (e.code) {
    case 'ArrowLeft':
      if (!collide(current.shape, current.x - 1, current.y)) current.x--;
      break;
    case 'ArrowRight':
      if (!collide(current.shape, current.x + 1, current.y)) current.x++;
      break;
    case 'ArrowDown':
      softDrop();
      break;
    case 'ArrowUp':
    case 'KeyX':
      tryRotate();
      break;
    case 'Space':
      e.preventDefault();
      hardDrop();
      break;
  }
  updateHUD();
});

restartBtn.addEventListener('click', init);
resetHighscoresBtn.addEventListener('click', resetHighscores);
saveHighscoreBtn.addEventListener('click', saveNewHighscore);
highscoreNameInput.addEventListener('keydown', e => {
  if (e.code === 'Enter') saveNewHighscore();
});

refreshHighscoreDisplays();

function readGridColor() {
  return getComputedStyle(document.documentElement).getPropertyValue('--color-grid-line').trim();
}

function applyTheme(theme, { persist = true } = {}) {
  document.documentElement.setAttribute('data-theme', theme);
  gridColor = readGridColor();
  if (persist) localStorage.setItem(THEME_KEY, theme);
  if (current) draw();
}

themeToggle.addEventListener('change', () => {
  applyTheme(themeToggle.checked ? 'light' : 'dark');
});

const savedTheme = localStorage.getItem(THEME_KEY) === 'light' ? 'light' : 'dark';
themeToggle.checked = savedTheme === 'light';
applyTheme(savedTheme, { persist: false });

init();
