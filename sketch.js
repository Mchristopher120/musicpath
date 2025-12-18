/* ============================
   Music Path — sketch.js
   Jogo de Treinamento Auditivo (Pitch)
   Versão: Português / Sci-Fi
   ============================ */

/* ---------- ESTADO GLOBAL ---------- */
let canvas;
let mode = "menu"; // menu | how | select | game

// Áudio
let osc, audioInited = false;
const MIN_FREQ = 200, MAX_FREQ = 1200;

// Dificuldade e Tolerância
let currentDiff = "medium";
const easyTol = 40, mediumTol = 25, hardTol = 12;
let currentTol = mediumTol;

// Caminhos (Paths)
let originalPath = []; // O alvo (invisível inicialmente)
let userPath = [];     // O desenho do jogador

// Estado de Desenho e Jogo
let drawing = false;
let modeGame = "navegar"; // navegar | desenhar
let gameState = "idle";   // idle | playing | waiting | comparing | ended

// Ferramentas de Dev
let dev_mode = false;
let useRandomCurve = false;

// Níveis
let currentLevel = 1;
const MAX_PRESET_LEVEL = 13; // Até o 13 usa predefs, depois aleatório puro

// Margem da área útil
const MARGIN = 50;

// Reprodução (Scanner)
let playback = {
  active: false,
  list: [],
  index: 0,
  intervalId: null,
  msPerPoint: 10
};

// Fade-out (Alvo desaparecendo)
let targetFadeActive = false;
let targetFadeStart = 0;
let targetFadeDuration = 250;
let targetFadeAlpha = 1.0;

// Pontuação
let totalScore = 0;
let comboStreak = 0;
const BASE_POINTS = 100;
const PASSING_SCORE = 70; // Porcentagem para passar

// Multiplicador de pontuação por nível
function levelMultiplier(level){
  if (level <= 5) return 1.0;
  if (level <= 10) return 1.3;
  if (level <= 20) return 1.6;
  return 2.0;
}

// Dados predefinidos de fase (Legado/Compatibilidade)
const phase_data = {
  1: ['const', 220],
  2: ['const', 140],
  3: ['const', 80],
  4: ['linear',  -60, 250 ],
  5: ['linear',  80, 180 ],
  6: ['linear',  -20, 200 ],
  7: ['quad',  200, -120, 180 ],
  8: ['quad', -300, 200, 120 ],
  9: ['quad',  120, -80, 230 ],
  10: ['cubic', 400, -600, 300, 120],
  11: ['cubic', -300, 500, -200, 200],
  12: ['cubic', 320, -350, -100, 350],
  13: ['cubic', 320, -350, -100, 350]
};

/* ---------- SETUP INICIAL ---------- */
function setup(){
  const holder = select('#canvasHolder');
  canvas = createCanvas(800, 400);
  if (holder) canvas.parent('canvasHolder'); else canvas.parent(document.body);

  strokeCap(ROUND);
  strokeJoin(ROUND);

  setDifficulty("medium");
  setupUI();
  showOnly("menuUI");
  mode = "menu";
  buildScoreboardIfMissing();
}

/* ---------- CONFIGURAÇÃO DA UI ---------- */
function setupUI(){
  function on(id, handler){
    const el = select(id);
    if (el) el.mousePressed(handler);
    return el;
  }

  // Menus
  on("#menuStartBtn", ()=> { mode = "select"; showOnly("selectUI"); });
  on("#menuHowBtn",   ()=> { mode = "how"; showOnly("howUI"); });
  on("#howBackBtn",   ()=> { mode = "menu"; showOnly("menuUI"); });

  // Botões de Dificuldade
  on("#easyBtn",   ()=> setDifficulty("easy"));
  on("#mediumBtn", ()=> setDifficulty("medium"));
  on("#hardBtn",   ()=> setDifficulty("hard"));

  // Ações de Seleção
  on("#selectBackBtn", ()=> { mode = "menu"; showOnly("menuUI"); });

  // Toggle de Curvas Aleatórias na tela de seleção
  const selectUI = select('#selectUI');
  if (selectUI && !select('#randomToggle')) {
    const row = createDiv();
    row.parent(selectUI);
    row.style('margin-top','8px');
    row.style('display','flex');
    row.style('justify-content','center');
    row.style('gap','8px');

    const rndLabel = createSpan('Gerar Curvas Aleatórias: ');
    rndLabel.parent(row);
    rndLabel.style('align-self','center');
    rndLabel.style('font-family', 'var(--font-tech)');
    rndLabel.style('font-size', '14px');

    const rndBtn = createButton('OFF');
    rndBtn.parent(row);
    rndBtn.id('randomToggle');
    rndBtn.mousePressed(()=>{
      useRandomCurve = !useRandomCurve;
      rndBtn.html(useRandomCurve ? 'ON' : 'OFF');
      rndBtn.style('background', useRandomCurve ? 'var(--neon-green)' : 'transparent');
      rndBtn.style('color', useRandomCurve ? '#000' : 'var(--text-muted)');
    });
  }

  // Iniciar Jogo
  on("#selectContinueBtn", ()=> {
    totalScore = 0; comboStreak = 0;
    updateScoreboard();
    currentLevel = 1;
    startLevel(currentLevel);
    mode = "game";
    showOnly("gameUI");
  });

  // Botão de Voltar ao Menu (Sair do Jogo)
  on("#gameBackBtn", () => {
    stopPlayback(); // Para o som
    if(osc) osc.amp(0, 0.1); 
    targetFadeActive = false;
    mode = "menu";
    showOnly("menuUI");
  });

  // Ações dentro do Jogo
  on("#replayBtn", ()=> { if (originalPath.length>1) startPlayback(originalPath); });

  on("#playBtn", ()=> {
    if (userPath.length > 1) {
      if (dev_mode || gameState === 'ended') {
        startTargetFade(250);
      }
      gameState = "playing";
      clearMessage();
      startPlayback(smoothPath(userPath));
    }
  });

  on("#clearBtn", ()=> {
    userPath = [];
    dev_mode = false;
    if (gameState === 'ended') gameState = 'waiting';
    clearMessage();
    select('#devNextBtn')?.addClass('hidden');
    select('#devBackBtn')?.addClass('hidden');
    updateScoreboard();
  });

  on("#submitBtn", ()=> submitAttempt());

  on("#desvendarBtn", ()=> {
    if (originalPath.length > 1) {
      dev_mode = true;
      gameState = "ended";
      targetFadeActive = false; targetFadeAlpha = 1;
      showMessage("Caminho Revelado pelo Sistema!", "green");
      startPlayback(originalPath);
    }
  });

  // Navegação Dev (escondido normalmente)
  const devBack = select("#devBackBtn");
  const devNext = select("#devNextBtn");
  if (devBack) devBack.mousePressed(()=> { if (currentLevel>1){ currentLevel--; startLevel(currentLevel); } });
  if (devNext) devNext.mousePressed(()=> { currentLevel++; startLevel(currentLevel); });

  const gb = select("#giveUpBtn");
  if (gb) gb.addClass('hidden');

  /* --- CRIAÇÃO DO BOTÃO DE MODO DINÂMICO --- */
  const gameUI = select('#gameUI');
  if (gameUI && !select('#modeBtn')){
    // Cria o botão de modo
    const modeBtn = createButton(''); 
    modeBtn.id('modeBtn');
    
    // Insere logo após o título do nível para destaque
    const levelTitle = select('#levelLabel');
    if(levelTitle) {
      modeBtn.parent(gameUI);
      levelTitle.elt.after(modeBtn.elt); 
    } else {
      modeBtn.parent(gameUI);
    }

    modeBtn.mousePressed(()=> toggleMode());
    updateModeButtonVisual(modeBtn);
  }

  // Atalhos de Teclado
  window.addEventListener('keydown', (e)=> {
    if (mode === 'game'){
      if (e.code === 'Space'){ toggleMode(); e.preventDefault(); }
      if (e.key === 'p' || e.key === 'P'){ if (userPath.length>1) { if (dev_mode || gameState==='ended') startTargetFade(250); gameState="playing"; startPlayback(smoothPath(userPath)); } }
      if (e.key === 'r' || e.key === 'R'){ if (originalPath.length>1) startPlayback(originalPath); }
      if (e.key === 'a' || e.key === 'A'){ userPath = []; updateScoreboard(); }
    }
  });
}

/* ---------- GERENCIAMENTO DE TELAS ---------- */
function showOnly(id){
  const panels = ["menuUI","howUI","selectUI","gameUI","winUI","finalUI"];
  panels.forEach(p=>{
    const el = select('#'+p);
    if (!el) return;
    if (p === id) el.removeClass('hidden'); else el.addClass('hidden');
  });
  clearMessage();
}

/* ---------- DIFICULDADE ---------- */
function setDifficulty(name){
  currentDiff = name;
  if (name === 'easy') currentTol = easyTol;
  else if (name === 'medium') currentTol = mediumTol;
  else if (name === 'hard') currentTol = hardTol;

  ["easyBtn","mediumBtn","hardBtn"].forEach(id=>{
    const el = select('#'+id);
    if (!el) return;
    if (id.startsWith(name)) el.addClass('selectedDiff'); else el.removeClass('selectedDiff');
  });
}

/* ---------- LOOP DE DESENHO (DRAW) ---------- */
function draw(){
  // Fundo Azul Escuro (Navy)
  background(10, 15, 25); 
  drawSubtleGrid();

  if (mode === 'menu') renderMenu();
  else if (mode === 'how') renderHow();
  else if (mode === 'select') renderSelectDifficulty();
  else if (mode === 'game') renderGame();

  updateTargetFade();

  if (playback.active) drawPlaybackCursor();
}

/* ---------- RENDERS ---------- */
function renderMenu(){ /* HTML trata do layout */ }
function renderHow(){ /* HTML trata do layout */ }

function renderSelectDifficulty(){
  const y = height/2;
  stroke('#0066FF'); strokeWeight(3); line(MARGIN, y, width - MARGIN, y);
  noStroke(); fill(0,150,255,40);
  if (currentTol > 0){
    for (let x = MARGIN; x <= width - MARGIN; x += 4) circle(x, y, currentTol * 2);
  }
}

function renderGame(){
  // Desenha o Alvo (se permitido)
  if (dev_mode || gameState === 'ended' || targetFadeActive) drawTargetWithTolerance();

  if (dev_mode){
    select('#devNextBtn')?.removeClass('hidden');
    select('#devBackBtn')?.removeClass('hidden');
  }

  // Linha do Usuário
  if (userPath.length > 1){
    // Glow
    stroke('rgba(255, 0, 85, 0.3)'); 
    strokeWeight(10);
    noFill(); beginShape(); for (let p of userPath) vertex(p.x, p.y); endShape();
    
    // Linha principal
    stroke('#ff0055'); 
    strokeWeight(3); 
    beginShape(); for (let p of userPath) vertex(p.x, p.y); endShape();
  }

  // Cursor do Navegador (Visualização enquanto segura o mouse)
  if (modeGame === 'navegar' && mouseIsPressed && isMouseOnCanvas()){
    noStroke(); 
    fill(0, 243, 255, 50); // Aura azul
    circle(mouseX, mouseY, 30);
    fill('#00f3ff'); // Miolo azul
    circle(mouseX, mouseY, 8);
  }

  drawStartEndGuides();
}

/* ---------- DECORAÇÃO: GRADE ---------- */
function drawSubtleGrid(){
  push();
  stroke('rgba(0, 243, 255, 0.05)'); 
  strokeWeight(1);
  for (let x = 0; x < width; x += 40) line(x, 0, x, height);
  for (let y = 0; y < height; y += 40) line(0, y, width, y);
  
  // Horizonte
  stroke('rgba(0, 243, 255, 0.2)');
  line(0, height/2, width, height/2);
  pop();
}

/* ---------- GERAÇÃO DE NÍVEIS ---------- */
function startLevel(level){
  currentLevel = level;
  select('#levelLabel')?.html('Nível ' + level);

  dev_mode = false;
  userPath = [];
  clearMessage();
  select('#devNextBtn')?.addClass('hidden');
  select('#devBackBtn')?.addClass('hidden');

  if (useRandomCurve){
    originalPath = generateProceduralCurveForLevel(level);
  } else {
    if (level <= MAX_PRESET_LEVEL) originalPath = generatePathForLevel(level);
    else originalPath = generateProceduralCurveForLevel(level);
  }

  gameState = 'playing';
  startPlayback(originalPath, ()=> { gameState = 'waiting'; });
  updateScoreboard();
}

// Caminho determinístico (Fases fixas)
function generatePathForLevel(level){
  const w = width, h = height;
  const data = phase_data[level] || ['const', h/2];
  const type = data[0];
  const params = data.slice(1);
  const arr = [];
  for (let xi = MARGIN; xi <= w - MARGIN; xi++){
    let t = (xi - MARGIN) / ((w - MARGIN) - MARGIN);
    let y = h/2;
    if (type === 'const'){ y = params[0]; }
    else if (type === 'linear'){ let [a,b] = params; y = a * t + b; }
    else if (type === 'quad'){ let [a,b,c] = params; y = a*t*t + b*t + c; }
    else if (type === 'cubic'){ let [a,b,c,d] = params; y = a*t*t*t + b*t*t + c*t + d; }
    y = constrain(y, MARGIN, h - MARGIN);
    arr.push({ x: xi, y: y });
  }
  return arr;
}

/* ---------- GERAÇÃO PROCEDURAL ---------- */
function generateProceduralCurveForLevel(level){
  if (level <= 5) return generateRandomStraightComposite(level);
  if (level <= 10) return generateMixedCurve(level);
  return generateComplexSmoothCurve(level);
}

// Retas (Níveis 1-5)
function generateRandomStraightComposite(level){
  const segments = Math.min(3, 1 + Math.floor(map(level, 1, 5, 1, 3)));
  const w = width, h = height;
  const keys = [];
  for (let s = 0; s <= segments; s++){
    const x = floor( map(s, 0, segments, MARGIN, w - MARGIN) );
    const pad = h * 0.18;
    const y = floor( random( MARGIN + pad, h - MARGIN - pad ) );
    keys.push({x,y});
  }
  const path = [];
  for (let i=0;i<keys.length-1;i++){
    const a = keys[i], b = keys[i+1];
    const dx = b.x - a.x;
    const steps = Math.max(2, Math.abs(dx)); 
    for (let k=0;k<steps;k++){
      const t = k/(steps-1);
      const x = lerp(a.x, b.x, t);
      const y = lerp(a.y, b.y, t);
      path.push({x,y});
    }
  }
  return path.map(p => ({x:constrain(p.x, MARGIN, width-MARGIN), y:constrain(p.y, MARGIN, height-MARGIN)}));
}

// Mistas (Níveis 6-10)
function generateMixedCurve(level){
  const w = width, h = height;
  const keys = [];
  const segments = 3 + Math.floor(random(0,2));
  for (let i=0;i<segments;i++){
    const x = floor( map(i, 0, segments-1, MARGIN, w - MARGIN) + random(-8,8) );
    const pad = h * 0.16;
    const y = floor( random( MARGIN + pad, h - MARGIN - pad ) );
    keys.push({x,y});
  }
  const straightMask = [];
  for (let i=0;i<keys.length-1;i++){
    straightMask.push( random() < 0.4 ); 
  }
  let full = [];
  for (let i=0;i<keys.length-1;i++){
    const a = keys[Math.max(0,i-1)];
    const b = keys[i];
    const c = keys[i+1];
    const d = keys[Math.min(keys.length-1,i+2)];
    const samples =  Math.max(10, floor( (c.x - b.x) ) );
    for (let s=0;s<samples;s++){
      const t = s/(samples-1);
      if (straightMask[i]){
        const x = lerp(b.x, c.x, t);
        const y = lerp(b.y, c.y, t);
        full.push({x,y});
      } else {
        const pt = catmullRomPoint(a||b, b, c, d||c, t);
        full.push(pt);
      }
    }
  }
  return full.map(p => ({x:constrain(p.x, MARGIN, width-MARGIN), y:constrain(p.y, MARGIN, height-MARGIN)}));
}

// Curvas Complexas (Níveis 11+)
function generateComplexSmoothCurve(level){
  const w = width, h = height;
  const nPoints = 6 + Math.min(10, Math.floor((level - 11) / 2));
  const keys = [];
  for (let i=0;i<nPoints;i++){
    const x = floor( map(i, 0, nPoints-1, MARGIN, w - MARGIN) + random(-12,12) );
    const center = h/2;
    const y = floor( center + sin(i*0.6 + random(-0.4,0.4)) * (h*0.18 + random(-20,20)) );
    keys.push({x,y});
  }
  let full = [];
  for (let i=0;i<keys.length-1;i++){
    const a = keys[Math.max(0,i-1)];
    const b = keys[i];
    const c = keys[i+1];
    const d = keys[Math.min(keys.length-1,i+2)];
    const samples = Math.max(12, Math.floor((c.x - b.x) * 1.2));
    for (let s=0;s<samples;s++){
      const t = s/(samples-1);
      const pt = catmullRomPoint(a||b, b, c, d||c, t);
      full.push(pt);
    }
  }
  return full.map(p => ({x:constrain(p.x, MARGIN, width-MARGIN), y:constrain(p.y, MARGIN, height-MARGIN)}));
}

function catmullRomPoint(a, b, c, d, t){
  const t2 = t*t, t3 = t2*t;
  const x = 0.5 * ( (2*b.x) + (-a.x + c.x)*t + (2*a.x -5*b.x + 4*c.x - d.x)*t2 + (-a.x + 3*b.x -3*c.x + d.x)*t3 );
  const y = 0.5 * ( (2*b.y) + (-a.y + c.y)*t + (2*a.y -5*b.y + 4*c.y - d.y)*t2 + (-a.y + 3*b.y -3*c.y + d.y)*t3 );
  return {x,y};
}

/* ---------- UTILITÁRIOS DE PATH E ÁUDIO ---------- */
function smoothPath(path){
  if (!path || path.length < 3) return path.slice();
  const out = [];
  for (let i=0;i<path.length;i++){
    let prev = path[Math.max(0,i-1)];
    let cur = path[i];
    let next = path[Math.min(path.length-1,i+1)];
    out.push({ x: cur.x, y: (prev.y + cur.y + next.y) / 3 });
  }
  return out;
}

function resampleToN(list, N){
  const out = [];
  if (!list || list.length === 0) return out;
  if (N <= 0) return out;
  for (let i=0;i<N;i++){
    let t = i / (N-1);
    let idx = floor(t * (list.length - 1));
    out.push(list[idx]);
  }
  return out;
}

function startPlayback(list, onFinished){
  stopPlayback();
  if (!list || list.length < 2){ if (onFinished) onFinished(); return; }

  ensureAudio();

  const N = Math.min(500, list.length);
  const playList = resampleToN(smoothPath(list), N);

  playback.active = true;
  playback.list = playList;
  playback.index = 0;
  playback.msPerPoint = 10;

  playback.intervalId = setInterval(()=>{
    const i = playback.index;
    if (i >= playback.list.length){
      stopPlayback();
      if (onFinished) onFinished();
      return;
    }
    const p = playback.list[i];
    const freq = map(p.y, MARGIN, height - MARGIN, MAX_FREQ, MIN_FREQ);
    try { osc.freq(freq); osc.amp(0.28); } catch(e){}
    playback.index++;
  }, playback.msPerPoint);
}

function stopPlayback(){
  if (playback.intervalId) clearInterval(playback.intervalId);
  playback.intervalId = null;
  playback.active = false;
  playback.list = [];
  playback.index = 0;
  try { if (audioInited) osc.amp(0, 0.05); } catch(e){}
}

/* --- CURSOR TIPO SCANNER (Sem bolinha) --- */
function drawPlaybackCursor(){
  if (!playback.active || !playback.list || playback.list.length === 0) return;
  
  const idx = max(0, min(playback.index, playback.list.length-1));
  const p = playback.list[idx];
  
  push();
  stroke('rgba(10, 255, 96, 0.5)'); 
  strokeWeight(2);
  // Apenas a linha vertical
  line(p.x, MARGIN, p.x, height - MARGIN);
  pop();
}

/* ---------- EFEITOS DE FADE ---------- */
function startTargetFade(ms){
  targetFadeActive = true;
  targetFadeStart = millis();
  targetFadeDuration = ms || 250;
  targetFadeAlpha = 1.0;
}

function updateTargetFade(){
  if (!targetFadeActive) return;
  const t = millis() - targetFadeStart;
  const p = constrain(t / targetFadeDuration, 0, 1);
  targetFadeAlpha = 1 - (1 - pow(1 - p, 2));
  if (p >= 1){
    targetFadeActive = false;
    targetFadeAlpha = 0;
    dev_mode = false;
    if (gameState === 'ended') gameState = 'playing';
  }
}

/* ---------- INPUT MOUSE ---------- */
function mousePressed(){
  if (mode !== 'game') return;
  if (!isMouseOnCanvas()) return;

  if (modeGame === 'navegar'){
    ensureAudio();
    const f = map(mouseY, MARGIN, height - MARGIN, MAX_FREQ, MIN_FREQ);
    osc.freq(f); osc.amp(0.28, 0.02);
  } else if (modeGame === 'desenhar' && gameState === 'waiting'){
    userPath = [];
    drawing = true;
    ensureAudio();
    userPath.push({ x: mouseX, y: mouseY });
  }
}

function mouseDragged(){
  if (mode !== 'game') return;
  if (!isMouseOnCanvas()) return;

  if (modeGame === 'navegar'){
    if (!audioInited) ensureAudio();
    const f = map(mouseY, MARGIN, height - MARGIN, MAX_FREQ, MIN_FREQ);
    osc.freq(f); osc.amp(0.28);
  } else if (modeGame === 'desenhar' && drawing && gameState === 'waiting'){
    userPath.push({ x: mouseX, y: mouseY });
    if (!audioInited) ensureAudio();
    const f = map(mouseY, MARGIN, height - MARGIN, MAX_FREQ, MIN_FREQ);
    osc.freq(f); osc.amp(0.28);
  }
}

function mouseReleased(){
  if (mode !== 'game') return;
  if (audioInited) osc.amp(0, 0.05);
  if (drawing && modeGame === 'desenhar') drawing = false;
}

/* ---------- CONTROLE DE MODO ---------- */
function toggleMode() {
  modeGame = (modeGame === "navegar") ? "desenhar" : "navegar";
  
  const mb = select('#modeBtn');
  if (mb) updateModeButtonVisual(mb);
}

function updateModeButtonVisual(btn) {
  btn.removeClass('mode-nav');
  btn.removeClass('mode-draw');

  if (modeGame === "navegar") {
    btn.html("📡 ESCUTAR FREQUÊNCIA"); 
    btn.addClass('mode-nav');
  } else {
    btn.html("✍️ TRAÇAR SINAL"); 
    btn.addClass('mode-draw');
  }
}

/* ---------- PONTUAÇÃO E SUBMISSÃO ---------- */
function getAdjustedTolerance(){
  return currentTol + 15;
}

function submitAttempt(){
  if (gameState !== 'waiting') return;

  if (!userPath || userPath.length < 5){ flashFail("Traçado muito curto! Sinais insuficientes."); return; }

  // DTW
  const N = 200;
  const cand = resampleToN(smoothPath(userPath), N);
  const targ = resampleToN(smoothPath(originalPath), N);

  const candY = cand.map(p => p.y);
  const targY = targ.map(p => p.y);

  const dtwDist = dtwDistance(candY, targY);
  const meanDist = dtwDist / (candY.length + targY.length);
  const visualTol = getAdjustedTolerance();
  const scoringTol = visualTol * 0.6;

  let precision = (1 - (meanDist / scoringTol)) * 100;
  if (!isFinite(precision)) precision = 0;
  precision = constrain(precision, 0, 100);

  const mult = levelMultiplier(currentLevel);
  let bonus = 0;
  if (precision >= 90) bonus = 100;
  else if (precision >= 75) bonus = 60;
  else if (precision >= 50) bonus = 30;
  else bonus = 10;

  const comboBonus = comboStreak * 15;
  const levelPoints = Math.round((BASE_POINTS + bonus + comboBonus) * mult);

  if (precision >= PASSING_SCORE){
    comboStreak++;
    totalScore += levelPoints;
    gameState = 'ended';
    showMessage(`SUCESSO! Precisão: ${precision.toFixed(1)}%  (+${levelPoints} pts)`, 'green');
    startPlayback(cand);
    select('#devNextBtn')?.removeClass('hidden');
    updateScoreboard(precision, levelPoints);
  } else {
    comboStreak = 0;
    showMessage(`FALHA NA SINCRONIA. Precisão: ${precision.toFixed(1)}%`, 'red');
    updateScoreboard(precision, 0);
  }
}

function flashFail(msg = 'Tente novamente'){
  showMessage(msg, 'red');
  setTimeout(()=>{ clearMessage(); }, 2500);
  updateScoreboard();
}

function dtwDistance(a, b){
  const n = a.length;
  const m = b.length;
  const w = Math.max(Math.abs(n - m), Math.floor(Math.max(n,m) * 0.25));
  const dtw = new Array(n+1);
  for (let i=0;i<=n;i++){
    dtw[i] = new Array(m+1).fill(Infinity);
  }
  dtw[0][0] = 0;
  for (let i=1;i<=n;i++){
    const start = Math.max(1, i - w);
    const end = Math.min(m, i + w);
    for (let j=start; j<=end; j++){
      const cost = Math.abs(a[i-1] - b[j-1]);
      const best = Math.min(dtw[i-1][j], dtw[i][j-1], dtw[i-1][j-1]);
      dtw[i][j] = cost + best;
    }
  }
  return dtw[n][m];
}

/* ---------- AUXILIARES DE DESENHO ---------- */
function drawTargetWithTolerance(){
  if (!originalPath || originalPath.length === 0) return;

  const alpha = targetFadeActive ? targetFadeAlpha : ( (dev_mode || gameState === 'ended') ? 1.0 : 0 );
  if (alpha <= 0) return;

  push();
  stroke(0, 243, 255, 200 * alpha); 
  strokeWeight(3);
  noFill();
  beginShape();
  for (let p of originalPath) vertex(p.x, p.y);
  endShape();

  noStroke();
  const dotBaseAlpha = 60;
  for (let i=0; i<originalPath.length; i+=8){
    const p = originalPath[i];
    fill(0, 243, 255, dotBaseAlpha * alpha); 
    circle(p.x, p.y, currentTol * 2);
  }
  pop();
}

function showMessage(txt, color='black'){
  const el = select('#messageBox');
  if (!el) return;
  let col = color;
  if (color === 'green') col = '#06D6A0';
  if (color === 'red') col = '#E63946';
  el.html(`<span style="color:${col}; font-weight:700;">${txt}</span>`);
}
function clearMessage(){ select('#messageBox')?.html(''); }

function ensureAudio(){
  if (audioInited) return;
  try {
    osc = new p5.Oscillator('sine');
    osc.start();
    osc.amp(0, 0.05);
    audioInited = true;
  } catch(e){
    console.warn("Audio init failed:", e);
    audioInited = false;
  }
}
window.addEventListener('pointerdown', function initAudioOnce(){
  ensureAudio();
  window.removeEventListener('pointerdown', initAudioOnce);
}, { once:true });

function isMouseOnCanvas(){
  return typeof mouseX === 'number' && mouseX >= 0 && mouseX <= width
       && typeof mouseY === 'number' && mouseY >= 0 && mouseY <= height;
}

function drawStartEndGuides(){
  if (!originalPath || originalPath.length < 2) return;
  let start = originalPath[0];
  let end = originalPath[originalPath.length - 1];
  let r = currentTol;

  strokeWeight(2);
  stroke(0, 0, 0, 0.12);

  line(start.x - r, MARGIN, start.x - r, height - MARGIN);
  line(end.x + r, MARGIN, end.x + r, height - MARGIN);

  noStroke(); fill('rgba(0,0,0,0.04)');
  rect(start.x - r - 4, MARGIN, 8, height - 2*MARGIN, 4);
  rect(end.x + r - 4, MARGIN, 8, height - 2*MARGIN, 4);
}

/* ---------- PLACAR (SCOREBOARD) ---------- */
function buildScoreboardIfMissing(){
  const gameUI = select('#gameUI');
  if (!gameUI) return;
  if (!select('#scoreboard')){
    const sb = createDiv();
    sb.id('scoreboard');
    sb.parent(gameUI);
    sb.style('display','flex');
    sb.style('justify-content','center');
    sb.style('gap','18px');
    
    // Traduzido para PT-BR
    const elLevel = createDiv('Nível: 0');
    elLevel.id('sb-level');
    elLevel.parent(sb);
    elLevel.style('font-weight','700');

    const elScore = createDiv('Pontos: 0');
    elScore.id('sb-score');
    elScore.parent(sb);
    elScore.style('font-weight','700');

    const elPrec = createDiv('Precisão: -');
    elPrec.id('sb-precision');
    elPrec.parent(sb);
    elPrec.style('font-weight','700');

    const elCombo = createDiv('Combo: 0');
    elCombo.id('sb-combo');
    elCombo.parent(sb);
    elCombo.style('font-weight','700');
  }
  updateScoreboard();
}

function updateScoreboard(precision=null, lastPoints=0){
  select('#sb-level')?.html('Nível: ' + currentLevel);
  select('#sb-score')?.html('Pontos: ' + totalScore);
  select('#sb-precision')?.html('Precisão: ' + (precision !== null ? precision.toFixed(1)+'%' : '-'));
  select('#sb-combo')?.html('Combo: ' + comboStreak);
}