// Enhanced Canvas shooter with audio, enemy types, pickups, DPI scaling, pools and pause/help
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const startBtn = document.getElementById('startBtn');
const restartBtn = document.getElementById('restartBtn');
const scoreEl = document.getElementById('score');
const livesEl = document.getElementById('lives');
const highscoreEl = document.getElementById('highscore');
const pauseBtn = document.getElementById('pauseBtn');
const helpBtn = document.getElementById('helpBtn');
const helpModal = document.getElementById('helpModal');
const closeHelp = document.getElementById('closeHelp');
const effects = document.getElementById('effects');

let DPR = window.devicePixelRatio || 1;
const CSS_W = 900;
const CSS_H = 560;

function applyDPI(){
  DPR = window.devicePixelRatio || 1;
  canvas.style.width = CSS_W + 'px';
  canvas.style.height = CSS_H + 'px';
  canvas.width = Math.floor(CSS_W * DPR);
  canvas.height = Math.floor(CSS_H * DPR);
  ctx.setTransform(DPR,0,0,DPR,0,0);
}
applyDPI();
window.addEventListener('resize', applyDPI);

let w = CSS_W, h = CSS_H;
let keys = {};

// game state
let player, bullets, enemies, pickups;
let score = 0;
let lives = 3;
let running = false;
let lastTime = 0;
let paused = false;
let highscore = Number(localStorage.getItem('iShooter_highscore') || 0);
highscoreEl.textContent = highscore;

// player enhancements
let specialAmmo = 0;
let dashCooldown = 0; // ms
let dashActiveUntil = 0;

// audio
let audioCtx = null;
const Sound = {
  ensureCtx(){ if(!audioCtx){ audioCtx = new (window.AudioContext||window.webkitAudioContext)(); } },
  playShoot(){
    this.ensureCtx();
    const t = audioCtx.currentTime;
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.type='sine'; o.frequency.setValueAtTime(900, t);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.12, t+0.01);
    g.gain.exponentialRampToValueAtTime(0.001, t+0.18);
    o.connect(g); g.connect(audioCtx.destination);
    o.start(t); o.stop(t+0.2);
  },
  playExplosion(){
    this.ensureCtx();
    const t = audioCtx.currentTime;
    const bufferSize = audioCtx.sampleRate * 0.2;
    const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
    const data = buffer.getChannelData(0);
    for(let i=0;i<bufferSize;i++) data[i] = (Math.random()*2-1) * Math.exp(-i/bufferSize*8);
    const src = audioCtx.createBufferSource(); src.buffer = buffer;
    const flt = audioCtx.createBiquadFilter(); flt.type='highshelf'; flt.frequency.setValueAtTime(1000, t);
    src.connect(flt); flt.connect(audioCtx.destination);
    src.start(t); src.stop(t+0.2);
  },
  playWin(){
    this.ensureCtx();
    const t = audioCtx.currentTime; const o = audioCtx.createOscillator(); const g = audioCtx.createGain();
    o.type='triangle'; o.frequency.setValueAtTime(600, t);
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.12, t+0.02);
    g.gain.linearRampToValueAtTime(0.0001, t+0.4);
    o.connect(g); g.connect(audioCtx.destination); o.start(t); o.frequency.linearRampToValueAtTime(900, t+0.35); o.stop(t+0.45);
  },
  playGameOver(){
    this.ensureCtx();
    const t = audioCtx.currentTime; const o = audioCtx.createOscillator(); const g = audioCtx.createGain();
    o.type='sawtooth'; o.frequency.setValueAtTime(220, t);
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.16, t+0.02);
    g.gain.linearRampToValueAtTime(0.0001, t+0.8);
    o.connect(g); g.connect(audioCtx.destination); o.start(t); o.stop(t+0.9);
  }
};

// pools for DOM effects (coins/bricks) to avoid churn
const pool = {coins:[], bricks:[]};
function initPools(){
  for(let i=0;i<40;i++){
    const c = document.createElement('div'); c.className='coin'; c.style.display='none'; pool.coins.push(c); effects.appendChild(c);
  }
  for(let i=0;i<30;i++){
    const b = document.createElement('div'); b.className='brick'; b.style.display='none'; pool.bricks.push(b); effects.appendChild(b);
  }
}
initPools();

function getCoin(){ return pool.coins.find(x=> x.style.display==='none'); }
function getBrick(){ return pool.bricks.find(x=> x.style.display==='none'); }

function spawnCoinAt(x,y,dur=900,delay=0){
  const c = getCoin(); if(!c) return;
  c.style.display='block'; c.style.left = `${x}px`; c.style.top = `${y}px`;
  c.style.animation = `coinFall ${dur}ms linear ${delay}ms forwards`;
  const onEnd = ()=>{ c.style.display='none'; c.removeEventListener('animationend', onEnd); };
  c.addEventListener('animationend', onEnd);
}

function spawnBrickAt(x,y,dur=1000,delay=0){
  const b = getBrick(); if(!b) return;
  b.style.display='block'; b.style.left = `${x}px`; b.style.top = `${y}px`;
  b.style.animation = `brickFall ${dur}ms cubic-bezier(.2,.8,.2,1) ${delay}ms forwards`;
  const onEnd = ()=>{ b.style.display='none'; b.removeEventListener('animationend', onEnd); };
  b.addEventListener('animationend', onEnd);
}

// pickups drawn on canvas
function resetGame(){
  score = 0; lives = 3; bullets = []; enemies = []; pickups = [];
  specialAmmo = 0; dashCooldown = 0; dashActiveUntil = 0;
  player = {x: w/2, y: h-60, w: 48, h: 28, speed: 6, shieldUntil:0};
  updateHUD();
}

function updateHUD(){ scoreEl.textContent = score; livesEl.textContent = lives; highscoreEl.textContent = highscore; }

function spawnEnemy(){
  const ex = 40 + Math.random()*(w-80);
  const ey = -30;
  // choose type: normal 60%, fast 20%, big 15%, boss 5%
  const r = Math.random();
  if(r < 0.6){ enemies.push({x:ex,y:ey,r:18,speed:1 + Math.random()*1.2,type:'normal',hp:1,score:10}); }
  else if(r < 0.8){ enemies.push({x:ex,y:ey,r:12,speed:2.2 + Math.random()*1.4,type:'fast',hp:1,score:15}); }
  else if(r < 0.95){ enemies.push({x:ex,y:ey,r:28,speed:0.6 + Math.random()*0.8,type:'big',hp:2,score:30}); }
  else { enemies.push({x:ex,y:ey,r:48,speed:0.4 + Math.random()*0.6,type:'boss',hp:8,score:200}); }
}

function fire(){
  if(!running) return;
  Sound.playShoot();
  bullets.push({x:player.x,y:player.y-20,r:4,vy:-10, special:false});
}

function fireSpecial(){
  if(specialAmmo<=0) return;
  specialAmmo--; Sound.playShoot();
  // special: big bullet that creates explosion on hit
  bullets.push({x:player.x,y:player.y-20,r:8,vy:-9,special:true});
}

function spawnPickup(x,y){
  // types: life, special, shield, speed
  const types = ['life','special','shield','speed'];
  const t = types[Math.floor(Math.random()*types.length)];
  pickups.push({x,y,vy:1.4,type:t,ttl:8000});
}

function update(dt){
  if(paused) return;
  // dash timer
  dashCooldown = Math.max(0, dashCooldown - dt);
  if(Date.now() < dashActiveUntil) player.speed = 12; else player.speed = 6;

  if(keys['ArrowLeft']||keys['a']) player.x -= player.speed;
  if(keys['ArrowRight']||keys['d']) player.x += player.speed;
  player.x = Math.max(20, Math.min(w-20, player.x));

  bullets.forEach(b=> b.y += b.vy * (dt/16));
  bullets = bullets.filter(b => b.y > -20);

  enemies.forEach(e=> e.y += e.speed * (dt/16));

  // pickups
  pickups.forEach(p=> p.y += p.vy * (dt/16));

  // collisions
  for(let i=enemies.length-1;i>=0;i--){
    const e = enemies[i];
    if(e.y > h+60){ enemies.splice(i,1); lives--; updateHUD(); playBrickFall(1); if(lives<=0) endGame(); continue; }
    for(let j=bullets.length-1;j>=0;j--){
      const b = bullets[j];
      const dx = b.x - e.x; const dy = b.y - e.y;
      if(dx*dx+dy*dy < (b.r+e.r)*(b.r+e.r)){
        // hit
        bullets.splice(j,1);
        e.hp -= b.special ? 3 : 1;
        if(e.hp <= 0){ enemies.splice(i,1); score += e.score; updateHUD(); spawnExplosion(e.x,e.y); Sound.playExplosion(); Sound.playWin();
          // chance to spawn pickup
          if(Math.random()<0.25) spawnPickup(e.x,e.y);
        }
        break;
      }
    }
  }

  // pickups collision with player
  for(let i=pickups.length-1;i>=0;i--){
    const p = pickups[i];
    const dx = p.x - player.x; const dy = p.y - player.y;
    if(dx*dx+dy*dy < 900){
      // collect
      if(p.type==='life'){ lives++; }
      else if(p.type==='special'){ specialAmmo++; }
      else if(p.type==='shield'){ player.shieldUntil = Date.now()+5000; }
      else if(p.type==='speed'){ dashActiveUntil = Date.now()+3000; }
      pickups.splice(i,1); updateHUD();
    } else if(p.y > h+40) pickups.splice(i,1);
  }

  // spawn enemies occasionally (rate increases with score)
  const spawnRate = 0.012 + Math.min(0.02, score/10000);
  if(Math.random() < spawnRate) spawnEnemy();
}

function draw(){
  // clear
  ctx.clearRect(0,0,w,h);
  // background
  const g = ctx.createLinearGradient(0,0,0,h); g.addColorStop(0,'#031018'); g.addColorStop(1,'#001018');
  ctx.fillStyle = g; ctx.fillRect(0,0,w,h);

  // player
  ctx.fillStyle = '#7FD3FF'; ctx.beginPath(); ctx.roundRect(player.x-24, player.y-10, 48, 20, 6); ctx.fill();
  // shield
  if(player.shieldUntil > Date.now()){ ctx.strokeStyle='rgba(127,255,212,0.6)'; ctx.lineWidth=3; ctx.beginPath(); ctx.arc(player.x, player.y, 36,0,Math.PI*2); ctx.stroke(); }

  // bullets
  bullets.forEach(b=>{ ctx.fillStyle = b.special ? '#FFD166' : '#fff'; ctx.beginPath(); ctx.arc(b.x,b.y,b.r,0,Math.PI*2); ctx.fill(); });

  // enemies
  enemies.forEach(e=>{
    if(e.type==='boss'){ ctx.fillStyle='#FF6B6B'; }
    else if(e.type==='big'){ ctx.fillStyle='#FF9F43'; }
    else if(e.type==='fast'){ ctx.fillStyle='#FFCB77'; }
    else ctx.fillStyle = '#FF8B8B';
    ctx.beginPath(); ctx.arc(e.x,e.y,e.r,0,Math.PI*2); ctx.fill();
    if(e.hp>1){ ctx.fillStyle='rgba(0,0,0,0.18)'; ctx.fillRect(e.x - e.r, e.y + e.r + 6, (e.r*2) * (e.hp / (e.type==='boss'?8:2)), 6); }
  });

  // pickups
  pickups.forEach(p=>{
    if(p.type==='life'){ ctx.fillStyle='#7CFFB2'; }
    else if(p.type==='special'){ ctx.fillStyle='#FFD166'; }
    else if(p.type==='shield'){ ctx.fillStyle='#8BD3FF'; }
    else ctx.fillStyle='#C3F0FF';
    ctx.beginPath(); ctx.rect(p.x-8, p.y-8, 16,16); ctx.fill();
  });
}

function loop(ts){ if(!running) return; if(!lastTime) lastTime = ts; const dt = ts - lastTime; lastTime = ts; update(dt); draw(); requestAnimationFrame(loop); }

function startGame(){ Sound.ensureCtx(); resetGame(); running = true; lastTime = 0; requestAnimationFrame(loop); startBtn.style.display='none'; restartBtn.style.display='none'; pauseBtn.style.display='inline-block'; }

function endGame(){ running = false; restartBtn.style.display = 'inline-block'; startBtn.style.display='none'; Sound.playGameOver(); if(score > highscore){ highscore = score; localStorage.setItem('iShooter_highscore', String(highscore)); updateHUD(); } }

function spawnExplosion(x,y){ playCoinBurst(10, x, y); }

// coin/brick via pool
function playCoinBurst(count=6, cx=null, cy=null){ for(let i=0;i<count;i++){ const x = (cx!==null? cx + (Math.random()*80-40) : Math.random()*window.innerWidth); const y = (cy!==null? cy + (Math.random()*60-30) : Math.random()*200); const dur = 600 + Math.random()*500; const delay = i*20; const c = getCoin(); if(!c) continue; c.style.display='block'; c.style.left = `${x}px`; c.style.top = `${y}px`; c.style.animation = `coinFall ${dur}ms cubic-bezier(.2,.8,.2,1) ${delay}ms forwards`; c.removeEventListener('animationend', c._end); c._end = ()=>{ c.style.display='none'; }; c.addEventListener('animationend', c._end); } }

function playBrickFall(count=6){ for(let i=0;i<count;i++){ const x = 60 + Math.random()*(window.innerWidth-120); const y = -60; const delay = i*60; const dur = 900 + Math.random()*800; const b = getBrick(); if(!b) continue; b.style.display='block'; b.style.left = `${x}px`; b.style.top = `${y}px`; b.style.animation = `brickFall ${dur}ms cubic-bezier(.2,.8,.2,1) ${delay}ms forwards`; b.removeEventListener('animationend', b._end); b._end = ()=>{ b.style.display='none'; }; b.addEventListener('animationend', b._end); } }

// inputs
window.addEventListener('keydown', e=>{ keys[e.key]=true; if(e.key===' ') fire(); if(e.key==='z') fireSpecial(); if(e.key==='Shift') { if(dashCooldown<=0){ dashActiveUntil = Date.now()+350; dashCooldown = 1200; } } });
window.addEventListener('keyup', e=>{ keys[e.key]=false; });
canvas.addEventListener('click', e=>{ fire(); });

startBtn.addEventListener('click', ()=>{ // resume audio on gesture
  Sound.ensureCtx(); startGame(); });
restartBtn.addEventListener('click', ()=>{ resetGame(); startGame(); restartBtn.style.display='none'; });

pauseBtn.addEventListener('click', ()=>{ paused = !paused; pauseBtn.textContent = paused ? '繼續' : '暫停'; if(!paused){ lastTime = performance.now(); requestAnimationFrame(loop); } });
helpBtn.addEventListener('click', ()=>{ helpModal.setAttribute('aria-hidden','false'); });
closeHelp.addEventListener('click', ()=>{ helpModal.setAttribute('aria-hidden','true'); });

// polyfill roundRect
CanvasRenderingContext2D.prototype.roundRect = CanvasRenderingContext2D.prototype.roundRect || function(x,y,w,h,r){ if(w<2*r) r=w/2; if(h<2*r) r=h/2; this.beginPath(); this.moveTo(x+r,y); this.arcTo(x+w,y,x+w,y+h,r); this.arcTo(x+w,y+h,x,y+h,r); this.arcTo(x,y+h,x,y,r); this.arcTo(x,y,x+w,y,r); this.closePath(); };

// init
applyDPI(); resetGame();
// 初始化
buildTracks();
updateCredits();
msgEl.textContent = '準備開始';

