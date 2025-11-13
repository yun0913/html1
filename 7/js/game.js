// Apex Shooter - Canvas 射擊遊戲 with audio, highscore, and touch controls
(() => {
  const canvas = document.getElementById('gameCanvas');
  const ctx = canvas.getContext('2d');
  const scoreEl = document.getElementById('score');
  const highEl = document.getElementById('highScore');
  const msgEl = document.getElementById('message');
  const themeToggle = document.getElementById('themeToggle');
  const startBtn = document.getElementById('startBtn');
  const pauseBtn = document.getElementById('pauseBtn');
  const restartBtn = document.getElementById('restartBtn');
  const touchLeft = document.getElementById('touchLeft');
  const touchRight = document.getElementById('touchRight');
  const touchFire = document.getElementById('touchFire');

  // Audio context & simple synth sounds
  let audioCtx = null;
  function ensureAudio() {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  function playShot(){
    try{
      ensureAudio();
      const o = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      o.type = 'sine'; o.frequency.value = 800;
      g.gain.value = 0.06;
      o.connect(g); g.connect(audioCtx.destination);
      o.start(); o.stop(audioCtx.currentTime + 0.06);
    }catch(e){/* ignore if blocked */}
  }
  function playExplode(){
    try{
      ensureAudio();
      const o = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      o.type = 'triangle'; o.frequency.setValueAtTime(200, audioCtx.currentTime);
      o.frequency.exponentialRampToValueAtTime(40, audioCtx.currentTime + 0.25);
      g.gain.setValueAtTime(0.12, audioCtx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.3);
      o.connect(g); g.connect(audioCtx.destination);
      o.start(); o.stop(audioCtx.currentTime + 0.3);
    }catch(e){}
  }

  // DPR handling
  let DPR = window.devicePixelRatio || 1;
  function resizeCanvas(){
    const rect = canvas.getBoundingClientRect();
    canvas.width = Math.floor(rect.width * DPR);
    canvas.height = Math.floor(rect.height * DPR);
    ctx.setTransform(DPR,0,0,DPR,0,0);
  }
  window.addEventListener('resize', resizeCanvas);
  resizeCanvas();

  // Game state
  let running = false;
  let paused = false;
  let score = 0;
  let lastTime = 0;

  // high score load
  const HS_KEY = 'apex_highscore_v1';
  function loadHigh(){
    const v = parseInt(localStorage.getItem(HS_KEY) || '0', 10) || 0; highEl.textContent = v; return v;
  }
  function saveHigh(v){ localStorage.setItem(HS_KEY, String(v)); highEl.textContent = v; }
  loadHigh();

  const player = { x: 400, y: 520, w: 64, h: 12, speed: 320, color: '#0b84ff' };
  const bullets = [];
  const enemies = [];
  let enemyTimer = 0;
  let enemyInterval = 900; // ms

  // Input
  const keys = {};
  window.addEventListener('keydown', e => { keys[e.code] = true; if (e.code === 'Space') e.preventDefault(); });
  window.addEventListener('keyup', e => { keys[e.code] = false; });

  // Theme handling (supports user preference + system prefers-color-scheme)
  const THEME_KEY = 'apex_theme_v1';
  let useSystemTheme = true;
  const mql = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)');
  function applyTheme(t){
    if (t === 'dark') document.body.classList.add('dark'); else document.body.classList.remove('dark');
    // update player color for visibility
    if (t === 'dark') player.color = '#66b8ff'; else player.color = '#0b84ff';
    // update toggle aria and title
    if (themeToggle){ themeToggle.setAttribute('aria-pressed', t === 'dark'); themeToggle.title = t === 'dark' ? '深色模式' : '淺色模式'; }
  }

  function resolveSystem(){ return (mql && mql.matches) ? 'dark' : 'light'; }

  function loadTheme(){
    const stored = localStorage.getItem(THEME_KEY);
    if (stored === 'light' || stored === 'dark'){
      useSystemTheme = false;
      applyTheme(stored);
      return stored;
    }
    // no stored preference -> follow system
    useSystemTheme = true;
    const sys = resolveSystem();
    applyTheme(sys);
    return 'system';
  }

  function saveTheme(t){
    // when user explicitly chooses, persist it and stop following system
    localStorage.setItem(THEME_KEY, t);
    useSystemTheme = false;
  }

  // react to system changes only if user hasn't chosen explicitly
  function onSystemChange(e){ if (useSystemTheme) applyTheme(e.matches ? 'dark' : 'light'); }
  if (mql && mql.addEventListener){ mql.addEventListener('change', onSystemChange); } else if (mql && mql.addListener){ mql.addListener(onSystemChange); }

  // init theme
  loadTheme();

  if (themeToggle){
    themeToggle.addEventListener('click', ()=>{
      const cur = document.body.classList.contains('dark') ? 'dark' : 'light';
      const next = cur === 'dark' ? 'light' : 'dark';
      applyTheme(next);
      saveTheme(next);
    });
  }

  // touch buttons behavior
  touchLeft.addEventListener('pointerdown', ()=> keys['TouchLeft'] = true);
  touchLeft.addEventListener('pointerup', ()=> keys['TouchLeft'] = false);
  touchRight.addEventListener('pointerdown', ()=> keys['TouchRight'] = true);
  touchRight.addEventListener('pointerup', ()=> keys['TouchRight'] = false);
  touchFire.addEventListener('pointerdown', ()=> { keys['Space'] = true; setTimeout(()=> keys['Space'] = false, 80); });

  // Simple touch on canvas (tap left/right to move)
  canvas.addEventListener('pointerdown', (e) => {
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    if (x < rect.width/2) keys['TouchLeft'] = true; else keys['TouchRight'] = true;
  });
  canvas.addEventListener('pointerup', (e) => { keys['TouchLeft'] = false; keys['TouchRight'] = false; });

  function spawnEnemy(){
    const w = 36 + Math.random()*28;
    enemies.push({ x: Math.random() * (canvas.width/DPR - w - 20) + 10, y: -30, w, h: 18 + Math.random()*12, speed: 40 + Math.random()*120, color: `hsl(${Math.random()*40+180},80%,45%)` });
  }

  function fire(){
    bullets.push({x: player.x + player.w/2, y: player.y - 6, r:4, speed: 480});
    playShot();
  }

  function update(dt){
    const left = keys['ArrowLeft'] || keys['KeyA'] || keys['TouchLeft'];
    const right = keys['ArrowRight'] || keys['KeyD'] || keys['TouchRight'];
    if (left) player.x -= player.speed * dt;
    if (right) player.x += player.speed * dt;
    player.x = Math.max(8, Math.min((canvas.width/DPR) - player.w - 8, player.x));

    if (keys['Space'] && !keys._spaceCooldown){ fire(); keys._spaceCooldown = true; setTimeout(()=> keys._spaceCooldown = false, 160); }

    for (let i = bullets.length-1; i>=0; i--){ bullets[i].y -= bullets[i].speed * dt; if (bullets[i].y < -10) bullets.splice(i,1); }

    enemyTimer += dt*1000;
    // difficulty scaling
    enemyInterval = Math.max(350, 900 - Math.floor(score/50)*40);
    if (enemyTimer > enemyInterval){ spawnEnemy(); enemyTimer = 0; }

    for (let i = enemies.length-1; i>=0; i--){
      enemies[i].y += enemies[i].speed * dt;
      if (enemies[i].y > (canvas.height/DPR) - 20){ endGame(false); return; }
      for (let j = bullets.length-1; j>=0; j--){
        const b = bullets[j]; const e = enemies[i];
        if (b.x > e.x && b.x < e.x + e.w && b.y > e.y && b.y < e.y + e.h){
          bullets.splice(j,1); enemies.splice(i,1); score += 10; scoreEl.textContent = score; playExplode();
          // save high
          const currentHigh = parseInt(localStorage.getItem(HS_KEY) || '0', 10) || 0;
          if (score > currentHigh) saveHigh(score);
          break;
        }
      }
    }
  }

  function draw(){
    const W = canvas.width/DPR, H = canvas.height/DPR;
    ctx.clearRect(0,0,W,H);

    // player with subtle glow
    ctx.fillStyle = player.color;
    ctx.beginPath(); roundRect(ctx, player.x, player.y, player.w, player.h, 6); ctx.fill();
    ctx.fillStyle = 'rgba(11,132,255,0.12)'; ctx.fillRect(player.x-6, player.y-10, player.w+12, 12);

    // bullets
    ctx.fillStyle = '#111'; bullets.forEach(b => { ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, Math.PI*2); ctx.fill(); });

    // enemies
    enemies.forEach(e => { ctx.fillStyle = e.color; ctx.beginPath(); roundRect(ctx, e.x, e.y, e.w, e.h, 6); ctx.fill(); });
  }

  function loop(ts){
    if (!running || paused) { lastTime = ts; requestAnimationFrame(loop); return; }
    const dt = (ts - lastTime) / 1000 || 0; lastTime = ts; update(dt); draw(); requestAnimationFrame(loop);
  }

  function startGame(){ running = true; paused = false; score = 0; enemyTimer = 0; bullets.length = 0; enemies.length = 0; player.x = (canvas.width/DPR)/2 - player.w/2; scoreEl.textContent = score; msgEl.textContent = ''; lastTime = performance.now(); requestAnimationFrame(loop); }
  function endGame(won){ running = false; paused = false; msgEl.textContent = '遊戲結束'; }
  function pauseGame(){ paused = !paused; msgEl.textContent = paused ? '已暫停' : ''; }

  startBtn.addEventListener('click', ()=> { if (!running) startGame(); if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume(); });
  pauseBtn.addEventListener('click', ()=> { if (running) pauseGame(); });
  restartBtn.addEventListener('click', ()=> { startGame(); });

  // helper
  function roundRect(ctx,x,y,w,h,r){ ctx.beginPath(); ctx.moveTo(x+r,y); ctx.arcTo(x+w,y,x+w,y+h,r); ctx.arcTo(x+w,y+h,x,y+h,r); ctx.arcTo(x,y+h,x,y,r); ctx.arcTo(x,y,x+w,y,r); ctx.closePath(); }

  player.x = (canvas.width/DPR)/2 - player.w/2; player.y = (canvas.height/DPR) - 60;
  window.__apex = { startGame, pauseGame, endGame };

  // resume audio on first user gesture
  ['pointerdown','keydown','touchstart','click'].forEach(ev => window.addEventListener(ev, ()=> { if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume(); }));
})();
