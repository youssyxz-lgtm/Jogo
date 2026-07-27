alert('SCRIPT CARREGOU'); window.onerror = function(msg, url, line){ alert('ERRO: ' + msg + ' (linha ' + line + ')'); };/* =========================================================================
   ZONA DE COMBATE — mini FPS em JavaScript puro
   Motor: raycasting 2.5D (estilo Wolfenstein), sem bibliotecas externas.
   Organizado em seções para facilitar expansão futura.
   ========================================================================= */

'use strict';

/* =========================================================================
   1. MAPA
   Grade 16x16. 4 "casas" (uma em cada quadrante) cercadas por muros,
   com caixas, barris, árvores e coberturas baixas espalhadas pelo meio.
   Códigos: 0 vazio | 1 casa | 2 caixa | 3 barril | 4 árvore | 5 cobertura | 9 muro externo
   ========================================================================= */
const MAP = [
  [9,9,9,9,9,9,9,9,9,9,9,9,9,9,9,9],
  [9,0,0,0,0,1,1,0,0,1,1,0,0,0,0,9],
  [9,0,4,0,0,1,0,0,0,0,1,0,0,4,0,9],
  [9,0,0,0,0,1,0,1,1,0,1,0,0,0,0,9],
  [9,0,0,2,0,0,0,0,0,0,0,0,3,0,0,9],
  [9,1,1,0,1,1,0,5,5,0,1,1,0,1,1,9],
  [9,1,0,0,0,1,0,0,0,0,1,0,0,0,1,9],
  [9,0,0,0,0,0,0,0,0,0,0,0,0,0,0,9],
  [9,0,0,0,0,0,0,0,0,0,0,0,0,0,0,9],
  [9,1,0,0,0,1,0,0,0,0,1,0,0,0,1,9],
  [9,1,1,0,1,1,0,5,5,0,1,1,0,1,1,9],
  [9,0,0,3,0,0,0,0,0,0,0,0,2,0,0,9],
  [9,0,0,0,0,1,0,1,1,0,1,0,0,0,0,9],
  [9,0,4,0,0,1,0,0,0,0,1,0,0,4,0,9],
  [9,0,0,0,0,1,1,0,0,1,1,0,0,0,0,9],
  [9,9,9,9,9,9,9,9,9,9,9,9,9,9,9,9],
];
const MAP_H = MAP.length, MAP_W = MAP[0].length;

function tileAt(x, y){
  const mx = Math.floor(x), my = Math.floor(y);
  if (mx < 0 || my < 0 || mx >= MAP_W || my >= MAP_H) return 9;
  return MAP[my][mx];
}
function isSolid(x, y){ return tileAt(x, y) !== 0; }

// Cores por tipo de bloco (face clara / face escura, para dar volume nas paredes)
const TILE_COLORS = {
  1: { l: '#8a6a4a', d: '#6b4f36' }, // casa (madeira)
  2: { l: '#c9a66b', d: '#a3835a' }, // caixa
  3: { l: '#a0522d', d: '#7a3d21' }, // barril
  4: { l: '#3e5c34', d: '#2c4225' }, // árvore
  5: { l: '#7a7a72', d: '#5c5c55' }, // cobertura baixa
  9: { l: '#565c52', d: '#3f453b' }, // muro externo
};

/* =========================================================================
   2. ARMAS
   ========================================================================= */
const WEAPONS = [
  {
    name: 'AK-47', auto: true, damage: 34, headshotMult: 2.2,
    fireRate: 105, spread: 0.050, adsSpreadMult: 0.35,
    reloadTime: 2200, magSize: 30, reserveMax: 90,
    recoil: 0.05, kick: 10, soundFreq: 95, soundDur: 0.09,
  },
  {
    name: 'Kar98k', auto: false, damage: 96, headshotMult: 1.6,
    fireRate: 1150, spread: 0.008, adsSpreadMult: 0.15,
    reloadTime: 3200, magSize: 5, reserveMax: 25,
    recoil: 0.09, kick: 22, soundFreq: 55, soundDur: 0.20,
  },
  {
    name: 'Uzi', auto: true, damage: 17, headshotMult: 2.0,
    fireRate: 75, spread: 0.070, adsSpreadMult: 0.40,
    reloadTime: 1700, magSize: 32, reserveMax: 96,
    recoil: 0.032, kick: 7, soundFreq: 150, soundDur: 0.06,
  },
  {
    name: 'P90', auto: true, damage: 21, headshotMult: 2.0,
    fireRate: 65, spread: 0.045, adsSpreadMult: 0.30,
    reloadTime: 2000, magSize: 50, reserveMax: 150,
    recoil: 0.026, kick: 6, soundFreq: 170, soundDur: 0.055,
  },
];

/* =========================================================================
   3. ÁUDIO — sons simples via Web Audio API (sem arquivos externos)
   ========================================================================= */
const SFX = {
  ctx: null,
  init(){
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AC();
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  },
  shot(freq, dur){
    if (!this.ctx) return;
    const t0 = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(freq * 2.2, t0);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20,freq * 0.6), t0 + dur);
    gain.gain.setValueAtTime(0.28, t0);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    osc.connect(gain).connect(this.ctx.destination);
    osc.start(t0); osc.stop(t0 + dur + 0.02);
  },
  click(freq){
    if (!this.ctx) return;
    const t0 = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(freq, t0);
    gain.gain.setValueAtTime(0.15, t0);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.06);
    osc.connect(gain).connect(this.ctx.destination);
    osc.start(t0); osc.stop(t0 + 0.07);
  },
  reload(){
    if (!this.ctx) return;
    this.click(320);
    setTimeout(() => this.click(420), 160);
  },
  empty(){ this.click(180); },
  hit(){ this.click(900); },
};

/* =========================================================================
   4. ESTADO DO JOGO
   ========================================================================= */
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const miniCanvas = document.getElementById('minimap');
const miniCtx = miniCanvas.getContext('2d');

let W = 0, H = 0; // resolução interna de render (reduzida p/ performance)
const RENDER_SCALE = 0.62; // reduz resolução interna e aumenta via CSS p/ FPS estável
const RAY_STEP = 2; // pixels por coluna de raio (2 = metade da resolução horizontal)

function resize(){
  W = Math.floor(window.innerWidth * RENDER_SCALE);
  H = Math.floor(window.innerHeight * RENDER_SCALE);
  canvas.width = W; canvas.height = H;
  canvas.style.width = window.innerWidth + 'px';
  canvas.style.height = window.innerHeight + 'px';
}
window.addEventListener('resize', resize);
resize();

const player = {
  x: 8.5, y: 8.5,
  dir: Math.PI, // ângulo em radianos
  pitch: 0,     // deslocamento vertical de "olhar" (cosmético)
  fov: Math.PI / 3, // ~60 graus
  health: 100,
  weaponIndex: 0,
  ammo: WEAPONS.map(w => ({ mag: w.magSize, reserve: w.reserveMax })),
  reloading: false,
  reloadStart: 0,
  ads: false,
  adsAmount: 0, // 0..1 suavizado
  lastShot: 0,
  isShooting: false,
  shotEdgeUsed: false, // controla disparo semi-automático (Kar98k)
  viewKick: 0,          // recuo vertical visual (decai)
  shakeTime: 0,
  alive: true,
  radius: 0.22,
  speed: 2.6,
};

class Enemy {
  constructor(x, y, id){
    this.id = id;
    this.x = x; this.y = y;
    this.dir = Math.random() * Math.PI * 2;
    this.health = 100;
    this.maxHealth = 100;
    this.state = 'patrol'; // patrol | chase | attack | dead
    this.waypoint = null;
    this.lastSeen = -Infinity;
    this.lastShot = 0;
    this.alive = true;
    this.deathTime = 0;
    this.speed = 1.15;
    this.radius = 0.24;
    this.pickWaypoint();
  }
  pickWaypoint(){
    for (let tries = 0; tries < 20; tries++){
      const wx = 1.5 + Math.random() * (MAP_W - 3);
      const wy = 1.5 + Math.random() * (MAP_H - 3);
      if (!isSolid(wx, wy)) { this.waypoint = { x: wx, y: wy }; return; }
    }
    this.waypoint = { x: this.x, y: this.y };
  }
}

const enemies = [
  new Enemy(8.5, 4.5, 0),
  new Enemy(4.5, 8.5, 1),
  new Enemy(12.5, 8.5, 2),
  new Enemy(8.5, 12.5, 3),
];

let particles = [];   // efeitos de sangue/faíscas (espaço de tela)
let dmgNumbers = [];  // números de dano flutuantes (espaço de tela)
let muzzleFlashUntil = 0;
let hitmarkerUntil = 0;

let gameState = 'menu'; // menu | playing | over
let zbuffer = new Float32Array(0);

/* =========================================================================
   5. FÍSICA / COLISÃO
   ========================================================================= */
function tryMove(entity, dx, dy){
  const r = entity.radius;
  // eixo X
  let nx = entity.x + dx;
  if (!isSolid(nx + Math.sign(dx) * r, entity.y - r) && !isSolid(nx + Math.sign(dx) * r, entity.y + r)) {
    entity.x = nx;
  }
  // eixo Y
  let ny = entity.y + dy;
  if (!isSolid(entity.x - r, ny + Math.sign(dy) * r) && !isSolid(entity.x + r, ny + Math.sign(dy) * r)) {
    entity.y = ny;
  }
}

// Raycast DDA genérico — usado para render de paredes, linha de visão e tiros.
// Retorna a distância até a parede, coordenadas do impacto e o "lado" atingido.
function castRay(ox, oy, angle, maxDist){
  const dirX = Math.cos(angle), dirY = Math.sin(angle);
  let mapX = Math.floor(ox), mapY = Math.floor(oy);

  const deltaDistX = Math.abs(1 / (dirX || 1e-9));
  const deltaDistY = Math.abs(1 / (dirY || 1e-9));

  let stepX, sideDistX, stepY, sideDistY;
  if (dirX < 0) { stepX = -1; sideDistX = (ox - mapX) * deltaDistX; }
  else { stepX = 1; sideDistX = (mapX + 1 - ox) * deltaDistX; }
  if (dirY < 0) { stepY = -1; sideDistY = (oy - mapY) * deltaDistY; }
  else { stepY = 1; sideDistY = (mapY + 1 - oy) * deltaDistY; }

  let side = 0, dist = 0;
  const limit = maxDist || 30;
  while (dist < limit) {
    if (sideDistX < sideDistY) { sideDistX += deltaDistX; mapX += stepX; side = 0; dist = sideDistX - deltaDistX; }
    else { sideDistY += deltaDistY; mapY += stepY; side = 1; dist = sideDistY - deltaDistY; }
    const tile = tileAt(mapX, mapY);
    if (tile !== 0) {
      const perpDist = side === 0 ? (mapX - ox + (1 - stepX) / 2) / (dirX || 1e-9)
                                   : (mapY - oy + (1 - stepY) / 2) / (dirY || 1e-9);
      return {
        dist: Math.max(0.0001, perpDist), tile, side,
        hitX: ox + dirX * perpDist, hitY: oy + dirY * perpDist,
      };
    }
  }
  return { dist: limit, tile: 0, side: 0, hitX: ox + dirX * limit, hitY: oy + dirY * limit };
}

// Verifica linha de visão livre entre dois pontos (usado pela IA)
function hasLineOfSight(x1, y1, x2, y2){
  const dx = x2 - x1, dy = y2 - y1;
  const dist = Math.hypot(dx, dy);
  const angle = Math.atan2(dy, dx);
  const hit = castRay(x1, y1, angle, dist);
  return hit.dist >= dist - 0.15;
}

/* =========================================================================
   6. ENTRADA — teclado/mouse (desktop) e touch (mobile)
   ========================================================================= */
const keys = {};
let mouseLocked = false;
window.addEventListener('keydown', e => { keys[e.code] = true; if (e.code === 'KeyR') attemptReload(); if (e.code === 'KeyQ') switchWeapon(); if (e.code >= 'Digit1' && e.code <= 'Digit4') { player.weaponIndex = e.code.charCodeAt(0) - 'Digit1'.charCodeAt(0); cancelReload(); } });
window.addEventListener('keyup', e => { keys[e.code] = false; });

canvas.addEventListener('click', () => { if (gameState === 'playing' && !isTouchDevice()) canvas.requestPointerLock(); });
document.addEventListener('pointerlockchange', () => { mouseLocked = document.pointerLockElement === canvas; });
window.addEventListener('mousemove', e => {
  if (mouseLocked) {
    player.dir += e.movementX * 0.0028;
    player.pitch = clamp(player.pitch - e.movementY * 0.6, -120, 120);
  }
});
window.addEventListener('mousedown', e => {
  if (!mouseLocked) return;
  if (e.button === 0) { player.isShooting = true; }
  if (e.button === 2) { player.ads = true; }
});
window.addEventListener('mouseup', e => {
  if (e.button === 0) player.isShooting = false;
  if (e.button === 2) player.ads = false;
});
window.addEventListener('contextmenu', e => e.preventDefault());

function isTouchDevice(){ return ('ontouchstart' in window) || navigator.maxTouchPoints > 0; }

// ---- Joystick virtual (movimento) ----
const joyBase = document.getElementById('joystick-base');
const joyNub = document.getElementById('joystick-nub');
const joyZone = document.getElementById('joystick-zone');
let joyTouchId = null, joyVec = { x: 0, y: 0 };
const JOY_RADIUS = 50;

joyZone.addEventListener('touchstart', e => {
  const t = e.changedTouches[0];
  joyTouchId = t.identifier;
  updateJoystick(t);
  e.preventDefault();
}, { passive: false });
joyZone.addEventListener('touchmove', e => {
  for (const t of e.changedTouches) if (t.identifier === joyTouchId) updateJoystick(t);
  e.preventDefault();
}, { passive: false });
joyZone.addEventListener('touchend', e => {
  for (const t of e.changedTouches) if (t.identifier === joyTouchId) { joyTouchId = null; joyVec = { x: 0, y: 0 }; joyNub.style.transform = 'translate(0,0)'; }
}, { passive: false });

function updateJoystick(t){
  const rect = joyBase.getBoundingClientRect();
  const cx = rect.left + rect.width / 2, cy = rect.top + rect.height / 2;
  let dx = t.clientX - cx, dy = t.clientY - cy;
  const d = Math.hypot(dx, dy);
  if (d > JOY_RADIUS) { dx = dx / d * JOY_RADIUS; dy = dy / d * JOY_RADIUS; }
  joyNub.style.transform = `translate(${dx}px, ${dy}px)`;
  joyVec.x = dx / JOY_RADIUS; joyVec.y = dy / JOY_RADIUS;
}

// ---- Área de olhar (arrastar para rotacionar a câmera) ----
const lookZone = document.getElementById('look-zone');
let lookTouchId = null, lookLastX = 0, lookLastY = 0;
lookZone.addEventListener('touchstart', e => {
  const t = e.changedTouches[0];
  lookTouchId = t.identifier; lookLastX = t.clientX; lookLastY = t.clientY;
  e.preventDefault();
}, { passive: false });
lookZone.addEventListener('touchmove', e => {
  for (const t of e.changedTouches) {
    if (t.identifier === lookTouchId) {
      const dx = t.clientX - lookLastX, dy = t.clientY - lookLastY;
      player.dir += dx * 0.0042;
      player.pitch = clamp(player.pitch - dy * 0.5, -120, 120);
      lookLastX = t.clientX; lookLastY = t.clientY;
    }
  }
  e.preventDefault();
}, { passive: false });
lookZone.addEventListener('touchend', e => {
  for (const t of e.changedTouches) if (t.identifier === lookTouchId) lookTouchId = null;
});

// ---- Botões de ação ----
function bindHold(id, onStart, onEnd){
  const el = document.getElementById(id);
  const start = e => { e.preventDefault(); el.classList.add('active'); onStart(); SFX.init(); };
  const end = e => { e.preventDefault(); el.classList.remove('active'); if (onEnd) onEnd(); };
  el.addEventListener('touchstart', start, { passive: false });
  el.addEventListener('touchend', end, { passive: false });
  el.addEventListener('touchcancel', end, { passive: false });
  el.addEventListener('mousedown', start);
  window.addEventListener('mouseup', end);
}
bindHold('btn-fire', () => { player.isShooting = true; }, () => { player.isShooting = false; player.shotEdgeUsed = false; });
bindHold('btn-ads', () => { player.ads = true; }, () => { player.ads = false; });
bindHold('btn-reload', () => attemptReload(), null);
bindHold('btn-switch', () => switchWeapon(), null);

function clamp(v, a, b){ return Math.max(a, Math.min(b, v)); }/* =========================================================================
   7. AÇÕES DO JOGADOR — atirar / recarregar / trocar arma
   ========================================================================= */
function switchWeapon(){
  if (player.reloading) cancelReload();
  player.weaponIndex = (player.weaponIndex + 1) % WEAPONS.length;
  player.isShooting = false; player.shotEdgeUsed = false;
}

function cancelReload(){
  player.reloading = false;
  document.getElementById('reload-bar-track').classList.add('hidden');
  document.getElementById('viewmodel').classList.remove('reloading');
}

function attemptReload(){
  const w = WEAPONS[player.weaponIndex];
  const a = player.ammo[player.weaponIndex];
  if (player.reloading || a.mag >= w.magSize || a.reserve <= 0) return;
  player.reloading = true;
  player.reloadStart = performance.now();
  document.getElementById('reload-bar-track').classList.remove('hidden');
  document.getElementById('viewmodel').classList.add('reloading');
  SFX.init(); SFX.reload();
  setTimeout(() => {
    if (!player.reloading) return; // cancelado (trocou de arma)
    const need = w.magSize - a.mag;
    const take = Math.min(need, a.reserve);
    a.mag += take; a.reserve -= take;
    player.reloading = false;
    document.getElementById('reload-bar-track').classList.add('hidden');
    document.getElementById('viewmodel').classList.remove('reloading');
  }, w.reloadTime);
}

function playerShoot(now){
  const w = WEAPONS[player.weaponIndex];
  const a = player.ammo[player.weaponIndex];
  if (player.reloading || !player.alive) return;
  if (now - player.lastShot < w.fireRate) return;
  if (a.mag <= 0) { SFX.init(); SFX.empty(); player.isShooting = false; return; }

  player.lastShot = now;
  a.mag--;
  SFX.init(); SFX.shot(w.soundFreq, w.soundDur);
  triggerMuzzleFlash();
  player.viewKick = w.kick;

  const spread = w.spread * (player.ads ? w.adsSpreadMult : 1);
  const angle = player.dir + (Math.random() - 0.5) * spread;
  const wallHit = castRay(player.x, player.y, angle, 24);

  // procura o inimigo mais próximo interceptado pelo raio antes da parede
  const dirX = Math.cos(angle), dirY = Math.sin(angle);
  let best = null;
  for (const en of enemies) {
    if (!en.alive) continue;
    const rx = en.x - player.x, ry = en.y - player.y;
    const forward = rx * dirX + ry * dirY;
    if (forward <= 0 || forward >= wallHit.dist) continue;
    const perp = Math.abs(rx * dirY - ry * dirX);
    if (perp < en.radius + 0.18) {
      if (!best || forward < best.forward) best = { en, forward, perp };
    }
  }

  if (best) {
    const headshot = best.perp < 0.11;
    let dmg = w.damage * (headshot ? w.headshotMult : 1);
    dmg = Math.round(dmg);
    best.en.health -= dmg;
    const sp = worldToScreen(best.en.x, best.en.y);
    spawnBlood(sp.x, sp.y);
    spawnDamageNumber(sp.x, sp.y, dmg, headshot);
    showHitmarker();
    SFX.hit();
    if (best.en.health <= 0 && best.en.alive) killEnemy(best.en);
  } else {
    const sp = worldToScreen(wallHit.hitX, wallHit.hitY);
    spawnSparks(sp.x, sp.y);
  }
}

function killEnemy(en){
  en.alive = false;
  en.state = 'dead';
  en.deathTime = performance.now();
}

function triggerMuzzleFlash(){
  muzzleFlashUntil = performance.now() + 60;
  const vm = document.getElementById('viewmodel');
  vm.classList.add('recoil');
  setTimeout(() => vm.classList.remove('recoil'), 70);
}

function showHitmarker(){
  hitmarkerUntil = performance.now() + 150;
}

/* =========================================================================
   8. IA DOS INIMIGOS
   ========================================================================= */
const ENEMY_SIGHT_RANGE = 9;
const ENEMY_SHOOT_RANGE = 6.5;
const ENEMY_FOV = Math.PI * 0.62; // cone de visão

function updateEnemies(dt, now){
  for (const en of enemies) {
    if (!en.alive) continue;

    const dx = player.x - en.x, dy = player.y - en.y;
    const distToPlayer = Math.hypot(dx, dy);
    const angleToPlayer = Math.atan2(dy, dx);
    let angDiff = Math.abs(normalizeAngle(angleToPlayer - en.dir));

    const canSee = player.alive &&
      distToPlayer < ENEMY_SIGHT_RANGE &&
      angDiff < ENEMY_FOV / 2 &&
      hasLineOfSight(en.x, en.y, player.x, player.y);

    if (canSee) {
      en.lastSeen = now;
      en.state = distToPlayer <= ENEMY_SHOOT_RANGE ? 'attack' : 'chase';
      // gira suavemente em direção ao jogador
      en.dir = lerpAngle(en.dir, angleToPlayer, 0.12);
    } else if (now - en.lastSeen < 3000) {
      en.state = 'chase'; // investiga a última posição conhecida
    } else {
      en.state = 'patrol';
    }

    if (en.state === 'attack') {
      // mantém distância de tiro e atira periodicamente
      if (distToPlayer < ENEMY_SHOOT_RANGE * 0.55) {
        tryMove(en, -Math.cos(en.dir) * en.speed * dt, -Math.sin(en.dir) * en.speed * dt);
      }
      if (now - en.lastShot > 900 + Math.random() * 500) {
        en.lastShot = now;
        enemyShoot(en, distToPlayer);
      }
    } else if (en.state === 'chase') {
      const targetX = player.x, targetY = player.y;
      const a = Math.atan2(targetY - en.y, targetX - en.x);
      tryMove(en, Math.cos(a) * en.speed * dt, Math.sin(a) * en.speed * dt);
    } else { // patrol
      if (!en.waypoint || Math.hypot(en.waypoint.x - en.x, en.waypoint.y - en.y) < 0.3) {
        en.pickWaypoint();
      }
      const a = Math.atan2(en.waypoint.y - en.y, en.waypoint.x - en.x);
      en.dir = lerpAngle(en.dir, a, 0.06);
      tryMove(en, Math.cos(a) * en.speed * 0.55 * dt, Math.sin(a) * en.speed * 0.55 * dt);
    }
  }
}

function enemyShoot(en, dist){
  if (!hasLineOfSight(en.x, en.y, player.x, player.y)) return;
  SFX.init(); SFX.shot(70, 0.08);
  const hitChance = clamp(1 - dist / (ENEMY_SIGHT_RANGE + 2), 0.15, 0.82);
  if (Math.random() < hitChance) {
    const dmg = 6 + Math.floor(Math.random() * 10);
    damagePlayer(dmg);
  }
}

function damagePlayer(dmg){
  if (!player.alive) return;
  player.health = Math.max(0, player.health - dmg);
  player.shakeTime = performance.now() + 200;
  const flash = document.getElementById('damage-flash');
  flash.classList.add('active');
  setTimeout(() => flash.classList.remove('active'), 220);
  if (player.health <= 0) endGame(false);
}

function normalizeAngle(a){ while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; }
function lerpAngle(a, b, t){ return a + normalizeAngle(b - a) * t; }

/* =========================================================================
   9. PARTÍCULAS E NÚMEROS DE DANO (espaço de tela)
   ========================================================================= */
function spawnBlood(x, y){
  for (let i = 0; i < 10; i++) {
    particles.push({
      x, y, vx: (Math.random() - 0.5) * 140, vy: (Math.random() - 0.9) * 140,
      life: 0.5 + Math.random() * 0.3, maxLife: 0.8, color: '200,20,20', size: 3 + Math.random() * 3, grav: 260,
    });
  }
}
function spawnSparks(x, y){
  for (let i = 0; i < 8; i++) {
    particles.push({
      x, y, vx: (Math.random() - 0.5) * 180, vy: (Math.random() - 0.9) * 180,
      life: 0.25 + Math.random() * 0.2, maxLife: 0.4, color: '255,200,90', size: 2 + Math.random() * 2, grav: 320,
    });
  }
}
function spawnDamageNumber(x, y, dmg, headshot){
  dmgNumbers.push({ x, y, text: String(dmg), life: 0.8, maxLife: 0.8, headshot });
}
function updateParticles(dt){
  particles = particles.filter(p => p.life > 0);
  for (const p of particles) {
    p.x += p.vx * dt; p.y += p.vy * dt; p.vy += p.grav * dt;
    p.life -= dt;
  }
  dmgNumbers = dmgNumbers.filter(d => d.life > 0);
  for (const d of dmgNumbers) { d.y -= 32 * dt; d.life -= dt; }
}

/* =========================================================================
   10. PROJEÇÃO — converte um ponto do mundo para coordenadas de tela
   (mesma transformação usada para os sprites dos inimigos)
   ========================================================================= */
function worldToScreen(wx, wy){
  const dirX = Math.cos(player.dir), dirY = Math.sin(player.dir);
  const planeLen = Math.tan(player.fov / 2) * (1 - player.adsAmount * 0.55);
  const planeX = -dirY * planeLen, planeY = dirX * planeLen;

  const spriteX = wx - player.x, spriteY = wy - player.y;
  const invDet = 1 / (planeX * dirY - dirX * planeY);
  const transformX = invDet * (dirY * spriteX - dirX * spriteY);
  const transformY = invDet * (-planeY * spriteX + planeX * spriteY);

  const screenX = (W / 2) * (1 + transformY / (transformX || 0.0001));
  const screenY = H / 2 + player.pitch * RENDER_SCALE;
  return { x: screenX / RENDER_SCALE, y: screenY / RENDER_SCALE, depth: transformX };
}

/* =========================================================================
   11. RENDER
   ========================================================================= */
function render(now){
  // tremor de tela ao levar dano
  let shakeX = 0, shakeY = 0;
  if (now < player.shakeTime) {
    const s = (player.shakeTime - now) / 200;
    shakeX = (Math.random() - 0.5) * 10 * s;
    shakeY = (Math.random() - 0.5) * 10 * s;
  }
  ctx.save();
  ctx.translate(shakeX, shakeY);

  const horizon = H / 2 + player.pitch;

  // céu / chão
  const skyGrad = ctx.createLinearGradient(0, 0, 0, horizon);
  skyGrad.addColorStop(0, '#141a22'); skyGrad.addColorStop(1, '#33404a');
  ctx.fillStyle = skyGrad; ctx.fillRect(0, 0, W, horizon);
  const floorGrad = ctx.createLinearGradient(0, horizon, 0, H);
  floorGrad.addColorStop(0, '#26281f'); floorGrad.addColorStop(1, '#0c0d09');
  ctx.fillStyle = floorGrad; ctx.fillRect(0, horizon, W, H - horizon);

  // paredes por raycasting
  const dirX = Math.cos(player.dir), dirY = Math.sin(player.dir);
  const planeLen = Math.tan(player.fov / 2) * (1 - player.adsAmount * 0.55);
  const planeX = -dirY * planeLen, planeY = dirX * planeLen;

  const numRays = Math.ceil(W / RAY_STEP);
  zbuffer = new Float32Array(numRays);

  for (let i = 0; i < numRays; i++) {
    const x = i * RAY_STEP;
    const cameraX = (2 * x / W) - 1;
    const rayAngle = Math.atan2(dirY + planeY * cameraX, dirX + planeX * cameraX);
    const hit = castRay(player.x, player.y, rayAngle, 26);
    const perp = hit.dist * Math.cos(rayAngle - player.dir); // corrige o efeito olho-de-peixe
    zbuffer[i] = perp;

    const lineHeight = H / Math.max(0.0001, perp);
    const drawStart = horizon - lineHeight / 2;
    const colors = TILE_COLORS[hit.tile] || TILE_COLORS[9];
    let base = hit.side === 1 ? colors.d : colors.l;
    const shade = clamp(1 - perp / 16, 0.18, 1);
    ctx.fillStyle = shadeColor(base, shade);

    // cobertura baixa (tipo 5): desenha só a metade inferior, mostrando céu acima
    if (hit.tile === 5) {
      const half = lineHeight / 2;
      ctx.fillRect(x, horizon - half * 0.15, RAY_STEP + 1, half * 1.15 + (H - horizon));
    } else {
      ctx.fillRect(x, drawStart, RAY_STEP + 1, lineHeight + 1);
    }
  }

  // sprites (inimigos vivos e mortos), ordenados do mais distante ao mais próximo
  const drawables = enemies.map(en => {
    const sp = worldToScreen(en.x + 0.5 * Math.cos(player.dir + 1.57) * 0, en.y);
    return { en, sp: worldToScreen(en.x, en.y) };
  }).sort((a, b) => b.sp.depth - a.sp.depth);

  for (const d of drawables) drawEnemySprite(d.en, d.sp, now);

  // partículas
  for (const p of particles) {
    ctx.globalAlpha = clamp(p.life / p.maxLife, 0, 1);
    ctx.fillStyle = `rgb(${p.color})`;
    ctx.fillRect((p.x * RENDER_SCALE) - p.size / 2, (p.y * RENDER_SCALE) - p.size / 2, p.size, p.size);
  }
  ctx.globalAlpha = 1;

  // números de dano
  ctx.font = 'bold 15px "Share Tech Mono", monospace';
  ctx.textAlign = 'center';
  for (const d of dmgNumbers) {
    ctx.globalAlpha = clamp(d.life / d.maxLife, 0, 1);
    ctx.fillStyle = d.headshot ? '#ffcf3f' : '#ff5a4a';
    ctx.fillText(d.headshot ? d.text + '!' : d.text, d.x * RENDER_SCALE, d.y * RENDER_SCALE);
  }
  ctx.globalAlpha = 1;

  ctx.restore();
  renderMinimap();
}

function shadeColor(hex, factor){
  const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
  return `rgb(${(r * factor) | 0},${(g * factor) | 0},${(b * factor) | 0})`; function drawEnemySprite(en, sp, now){
  if (sp.depth <= 0.15) return;
  const colIndex = Math.floor(clamp(sp.x * RENDER_SCALE, 0, W - 1) / RAY_STEP);
  if (zbuffer[colIndex] !== undefined && sp.depth > zbuffer[colIndex]) return; // oculto atrás de parede

  const scale = H / sp.depth;
  const screenX = sp.x, screenY = sp.y;
  const bodyH = scale * 0.011, bodyW = bodyH * 0.42;

  ctx.save();
  ctx.translate(screenX, screenY);

  if (!en.alive) {
    // animação de morte: achata e escurece
    const t = clamp((now - en.deathTime) / 500, 0, 1);
    ctx.translate(0, bodyH * 0.28 * t);
    ctx.scale(1 + t * 0.3, 1 - t * 0.75);
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = '#5a1f1a';
    ctx.beginPath(); ctx.ellipse(0, bodyH * 0.28, bodyW * 1.3, bodyH * 0.22, 0, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    return;
  }

  // corpo (retângulo verde-oliva hostil)
  ctx.fillStyle = '#7a3030';
  ctx.fillRect(-bodyW / 2, -bodyH * 0.15, bodyW, bodyH * 0.85);
  // cabeça
  ctx.fillStyle = '#d9b58c';
  ctx.beginPath(); ctx.arc(0, -bodyH * 0.32, bodyW * 0.42, 0, Math.PI * 2); ctx.fill();
  // capacete/boné simples
  ctx.fillStyle = '#3d4a32';
  ctx.beginPath(); ctx.arc(0, -bodyH * 0.38, bodyW * 0.45, Math.PI, Math.PI * 2); ctx.fill();

  // barra de vida
  const barW = bodyW * 1.4;
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fillRect(-barW / 2, -bodyH * 0.62, barW, 5);
  ctx.fillStyle = en.health > 40 ? '#6ee06e' : '#ff5a4a';
  ctx.fillRect(-barW / 2, -bodyH * 0.62, barW * (en.health / en.maxHealth), 5);

  ctx.restore();
}

function renderMinimap(){
  miniCtx.clearRect(0, 0, 120, 120);
  const scale = 120 / MAP_W;
  for (let y = 0; y < MAP_H; y++) {
    for (let x = 0; x < MAP_W; x++) {
      const t = MAP[y][x];
      if (t === 0) continue;
      miniCtx.fillStyle = t === 9 ? '#3f453b' : 'rgba(160,150,120,0.55)';
      miniCtx.fillRect(x * scale, y * scale, scale, scale);
    }
  }
  // inimigos
  for (const en of enemies) {
    miniCtx.fillStyle = en.alive ? '#ff5a4a' : '#555';
    miniCtx.beginPath(); miniCtx.arc(en.x * scale, en.y * scale, 3, 0, Math.PI * 2); miniCtx.fill();
  }
  // jogador
  miniCtx.fillStyle = '#ffb020';
  miniCtx.beginPath(); miniCtx.arc(player.x * scale, player.y * scale, 3.2, 0, Math.PI * 2); miniCtx.fill();
  miniCtx.strokeStyle = '#ffb020'; miniCtx.beginPath();
  miniCtx.moveTo(player.x * scale, player.y * scale);
  miniCtx.lineTo((player.x + Math.cos(player.dir) * 1.4) * scale, (player.y + Math.sin(player.dir) * 1.4) * scale);
  miniCtx.stroke();
}

/* =========================================================================
   12. HUD
   ========================================================================= */
function updateHUD(now){
  const w = WEAPONS[player.weaponIndex];
  const a = player.ammo[player.weaponIndex];

  const hp = Math.max(0, player.health);
  document.getElementById('health-fill').style.width = hp + '%';
  document.getElementById('health-fill').style.background = hp > 50
    ? 'linear-gradient(90deg,#3c9e3c,#6ee06e)'
    : (hp > 20 ? 'linear-gradient(90deg,#a97a1c,#ffb020)' : 'linear-gradient(90deg,#a3221a,#ff3b30)');
  document.getElementById('health-text').textContent = hp;

  document.getElementById('weapon-name').textContent = w.name;
  document.getElementById('ammo-mag').textContent = a.mag;
  document.getElementById('ammo-reserve').textContent = a.reserve;

  if (player.reloading) {
    const t = clamp((now - player.reloadStart) / w.reloadTime, 0, 1);
    document.getElementById('reload-bar-fill').style.width = (t * 100) + '%';
  }

  document.getElementById('enemies-left').textContent = enemies.filter(e => e.alive).length;

  const crosshair = document.getElementById('crosshair');
  crosshair.classList.toggle('ads', player.ads);

  const flash = document.querySelector('.muzzle-flash');
  if (now < muzzleFlashUntil) ensureMuzzleFlashEl().classList.add('show');
  else { const el = document.querySelector('.muzzle-flash'); if (el) el.classList.remove('show'); }

  const hm = document.getElementById('hitmarker');
  hm.classList.toggle('show', now < hitmarkerUntil);
}

function ensureMuzzleFlashEl(){
  let el = document.querySelector('.muzzle-flash');
  if (!el) {
    el = document.createElement('div');
    el.className = 'muzzle-flash';
    document.getElementById('viewmodel').appendChild(el);
  }
  return el;
}

/* =========================================================================
   13. LOOP PRINCIPAL
   ========================================================================= */
function updatePlayer(dt, now){
  if (!player.alive) return;

  // suaviza a transição de mira (ADS)
  player.adsAmount += ((player.ads ? 1 : 0) - player.adsAmount) * clamp(dt * 8, 0, 1);
  player.viewKick *= Math.max(0, 1 - dt * 10);

  // movimento: teclado (desktop) + joystick virtual (mobile)
  let moveF = 0, moveS = 0;
  if (keys['KeyW']) moveF += 1;
  if (keys['KeyS']) moveF -= 1;
  if (keys['KeyD']) moveS += 1;
  if (keys['KeyA']) moveS -= 1;
  moveF += -joyVec.y; moveS += joyVec.x;
  moveF = clamp(moveF, -1, 1); moveS = clamp(moveS, -1, 1);

  const speed = player.speed * (player.ads ? 0.55 : 1);
  const dirX = Math.cos(player.dir), dirY = Math.sin(player.dir);
  const rightX = -dirY, rightY = dirX;
  const dx = (dirX * moveF + rightX * moveS) * speed * dt;
  const dy = (dirY * moveF + rightY * moveS) * speed * dt;
  if (dx || dy) tryMove(player, dx, dy);

  // disparo
  const w = WEAPONS[player.weaponIndex];
  if (player.isShooting) {
    if (w.auto) {
      playerShoot(now);
    } else if (!player.shotEdgeUsed) {
      playerShoot(now);
      player.shotEdgeUsed = true;
    }
  }
}

function checkWinLose(){
  if (player.alive && enemies.every(e => !e.alive)) endGame(true);
}

let lastTime = performance.now();
function loop(now){
  const dt = Math.min((now - lastTime) / 1000, 0.05);
  lastTime = now;

  if (gameState === 'playing') {
    updatePlayer(dt, now);
    updateEnemies(dt, now);
    updateParticles(dt);
    render(now);
    updateHUD(now);
    checkWinLose();
  }
  requestAnimationFrame(loop);
}

/* =========================================================================
   14. FLUXO DE TELAS (início / fim / reinício)
   ========================================================================= */
function startGame(){
  document.getElementById('screen-start').classList.add('hidden');
  document.getElementById('screen-end').classList.add('hidden');
  document.getElementById('game-wrap').classList.remove('hidden');
  gameState = 'playing';
  SFX.init();
}

function endGame(victory){
  gameState = 'over';
  document.getElementById('screen-end').classList.remove('hidden');
  document.getElementById('end-title').textContent = victory ? 'MISSÃO CUMPRIDA' : 'VOCÊ CAIU EM COMBATE';
  document.getElementById('end-desc').textContent = victory
    ? 'Todos os hostis do setor foram neutralizados.'
    : 'Os hostis dominaram o setor. Tente novamente.';
}

function resetGame(){
  player.x = 8.5; player.y = 8.5; player.dir = Math.PI; player.pitch = 0;
  player.health = 100; player.weaponIndex = 0; player.reloading = false;
  player.ads = false; player.adsAmount = 0; player.isShooting = false;
  player.ammo = WEAPONS.map(w => ({ mag: w.magSize, reserve: w.reserveMax }));
  player.alive = true;

  const spawns = [[8.5,4.5],[4.5,8.5],[12.5,8.5],[8.5,12.5]];
  enemies.forEach((en, i) => {
    en.x = spawns[i][0]; en.y = spawns[i][1];
    en.health = en.maxHealth; en.alive = true; en.state = 'patrol';
    en.lastSeen = -Infinity; en.dir = Math.random() * Math.PI * 2;
    en.pickWaypoint();
  });

  particles = []; dmgNumbers = [];
}

document.getElementById('btn-start').addEventListener('click', () => { startGame(); });
document.getElementById('btn-restart').addEventListener('click', () => { resetGame(); startGame(); });

requestAnimationFrame(loop);
}
