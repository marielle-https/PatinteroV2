(() => {
'use strict';
const MAX_LEVEL = 5, SPRITE = 64, TAG_DIST = 38;
const LINES = [0.75, 0.60, 0.45, 0.30, 0.15];
const S = { MENU:'menu', COUNT:'count', PLAY:'play', PAUSE:'pause', CLEAR:'clear', OVER:'over', WON:'won' };
const ALLOWED = { menu:['count'], count:['play','menu','pause'], play:['pause','clear','over','menu'],
  pause:['play','count','menu'], clear:['count','won','menu'], over:['count','menu'], won:['menu','count'] };

const $ = id => document.getElementById(id);
const stage = $('stage'), overlay = $('overlay');
const esc = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

// ---- safe storage ----
const store = {
  get(k, d) { try { const v = JSON.parse(localStorage.getItem(k)); return v ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} }
};
const board = () => { const b = store.get('patinteroBoard', []); return Array.isArray(b) ? b.filter(p => p && typeof p.name === 'string') : []; };
function record(name, levels, score) {
  const b = board(), e = b.find(p => p.name.toLowerCase() === name.toLowerCase());
  if (e) { e.levels = Math.max(e.levels|0, levels); e.score = Math.max(e.score|0, score); }
  else b.push({ name, levels, score });
  b.sort((a, z) => z.levels - a.levels || z.score - a.score || a.name.localeCompare(z.name));
  store.set('patinteroBoard', b.slice(0, 50));
}

// ---- game state (single source of truth) ----
const G = { state: S.MENU, name: '', level: 1, score: 0, x: 0, y: 0, W: 0, H: 0, levelTime: 0, count: 3, countT: 0, prev: S.COUNT };
let blockers = [], playerEl = null, last = 0;
const keys = new Set(); let joy = { x: 0, y: 0, id: null };

function go(next) {
  if (!ALLOWED[G.state].includes(next)) return false;
  G.state = next; return true;
}
const lineY = i => LINES[i] * G.H;

// ---- DOM helpers ----
function sprite(src, cls) {
  const d = document.createElement('div'); d.className = 'Character ' + (cls || '');
  const img = new Image(); img.className = 'Character_spritesheet face-down'; img.alt = ''; img.src = src; img.draggable = false;
  d.appendChild(img); stage.appendChild(d); return d;
}
const face = (el, dir) => { const i = el.firstChild; if (i && !i.classList.contains(dir)) i.className = 'Character_spritesheet ' + dir; };
const place = (el, x, y) => { el.style.left = x + 'px'; el.style.top = y + 'px'; };
function show(html) { overlay.innerHTML = html; overlay.hidden = false; }
function hide() { overlay.hidden = true; overlay.innerHTML = ''; }
function btn(id, label, cls = 'btn-primary') { return `<button class="btn ${cls}" id="${id}">${label}</button>`; }
function on(id, fn) { const e = $(id); if (e) e.addEventListener('click', fn, { once: true }); }
function hud() { $('hudName').textContent = G.name; $('hudLevel').textContent = G.level; $('hudScore').textContent = G.score; }

// ---- screens ----
function menu() {
  teardown(); G.state = S.MENU; document.body.classList.remove('playing');
  show(`<h2>PATINTERO</h2>
    <p>Relive the Filipino street classic! Slip past the taggers and reach the glowing line without being tagged.</p>
    ${btn('bPlay','▶ PLAY')}${btn('bHow','? HOW TO PLAY','btn-info')}${btn('bLb','🏆 LEADERBOARD','btn-success')}`);
  on('bPlay', askName); on('bHow', howTo); on('bLb', leaderboard);
}
function howTo() {
  show(`<h2>HOW TO PLAY</h2><ul>
    <li>Move: ARROW KEYS / WASD, or the joystick on touch screens (4 directions).</li>
    <li>Level N has N taggers, one on each line from the bottom. They slide along their line toward you.</li>
    <li>Reach the glowing finish line (level N's line) to clear the level.</li>
    <li>Touch a tagger and you are out: the match ends.</li>
    <li>Clear all 5 levels to win. Faster clears score more points.</li>
    <li>Pause: P or Esc (the game also pauses if you switch tabs).</li></ul>${btn('bBack','◀ BACK')}`);
  on('bBack', menu);
}
function leaderboard() {
  const rows = board().slice(0, 10).map((p, i) => `<li>${i+1}. ${esc(p.name)} — ${p.levels|0} lvl, ${p.score|0} pts</li>`).join('') || '<li>No scores yet!</li>';
  show(`<h2>🏆 LEADERBOARD</h2><ul>${rows}</ul>${btn('bBack','◀ BACK')}`);
  on('bBack', menu);
}
function askName() {
  const saved = store.get('patinteroPlayer', {}).name || '';
  show(`<h2>PLAYER NAME</h2><input id="nm" maxlength="20" placeholder="Your name" value="${esc(saved)}" aria-label="Player name"><br>
    ${btn('bGo','▶ START')}${btn('bBack','◀ BACK','btn-secondary')}`);
  const go_ = () => { const n = $('nm').value.trim(); if (!n) { $('nm').focus(); return; } G.name = n; store.set('patinteroPlayer', { name: n }); startMatch(); };
  on('bGo', go_); on('bBack', menu);
  $('nm').addEventListener('keydown', e => { if (e.key === 'Enter') { e.stopPropagation(); go_(); } });
  $('nm').focus();
}

// ---- lifecycle ----
function startMatch() {
  teardown(); G.level = 1; G.score = 0; document.body.classList.add('playing');
  playerEl = sprite('assets/images/player.png', 'player');
  $('hud').hidden = false; $('finish').hidden = false;
  if ('ontouchstart' in window || navigator.maxTouchPoints > 0) $('joystick').hidden = false;
  G.state = S.MENU; startLevel();
}
function startLevel() {
  hide(); layout(true);
  blockers.forEach(b => b.el.remove()); blockers = [];
  for (let i = 0; i < G.level; i++) {
    const el = sprite('assets/images/blocker.png');
    const b = { el, i, x: G.W * (i % 2 ? 0.25 : 0.75), phase: Math.random() * 6.28 };
    blockers.push(b); place(el, b.x, lineY(i));
  }
  G.x = G.W / 2; G.y = G.H - 100; G.levelTime = 0; keys.clear(); joy.x = joy.y = 0;
  place(playerEl, G.x, G.y); face(playerEl, 'face-up');
  $('finish').style.top = lineY(G.level - 1) + 'px'; hud();
  startCountdown();
}
function startCountdown() {
  if (!go('count')) { G.state = S.MENU; go('count'); }
  G.count = 3; G.countT = 0; $('countdown').hidden = false; $('countdown').textContent = 3;
}
function teardown() {
  keys.clear(); joy = { x: 0, y: 0, id: null };
  blockers.forEach(b => b.el.remove()); blockers = [];
  if (playerEl) playerEl.remove(); playerEl = null;
  ['hud','finish','countdown','joystick'].forEach(id => $(id).hidden = true);
}
function pause() {
  if (G.state !== S.PLAY && G.state !== S.COUNT) return;
  G.prev = G.state; go('pause'); keys.clear();
  show(`<h2>PAUSED</h2>${btn('bRes','▶ RESUME')}${btn('bRst','↻ RESTART MATCH','btn-warning')}${btn('bMenu','⌂ MAIN MENU','btn-secondary')}`);
  on('bRes', resume); on('bRst', startMatch); on('bMenu', menu);
}
function resume() { if (G.state !== S.PAUSE) return; hide(); go(G.prev); }
function tagged() {
  if (!go('over')) return;
  record(G.name, G.level - 1, G.score);
  playerEl.classList.add('shake');
  show(`<h2>😵 TAGGED!</h2><p>You were tagged on level ${G.level}.<br>Levels cleared: ${G.level - 1}<br>Score: ${G.score}</p>
    ${btn('bAgain','↻ PLAY AGAIN')}${btn('bLb','🏆 LEADERBOARD','btn-success')}${btn('bMenu','⌂ MENU','btn-secondary')}`);
  on('bAgain', startMatch); on('bLb', leaderboard); on('bMenu', menu);
}
function crossed() {
  const bonus = Math.max(0, Math.round(300 - G.levelTime * 20));
  G.score += 100 * G.level + bonus; hud();
  if (G.level >= MAX_LEVEL) {
    go('clear'); go('won'); record(G.name, MAX_LEVEL, G.score);
    show(`<h2>🎉 YOU WIN!</h2><p>All ${MAX_LEVEL} levels cleared!<br>Final score: ${G.score}</p>
      ${btn('bAgain','↻ PLAY AGAIN')}${btn('bLb','🏆 LEADERBOARD','btn-success')}${btn('bMenu','⌂ MENU','btn-secondary')}`);
    on('bAgain', startMatch); on('bLb', leaderboard); on('bMenu', menu);
    return;
  }
  go('clear');
  show(`<h2>LEVEL ${G.level} CLEAR!</h2><p>Score: ${G.score}</p>${btn('bNext','NEXT LEVEL ▶')}`);
  on('bNext', () => { if (G.state !== S.CLEAR) return; G.level++; startLevel(); });
}

// ---- layout / resize (keeps positions proportional) ----
function layout(initial) {
  const W = innerWidth, H = innerHeight;
  if (!initial && G.W && G.H) {
    G.x *= W / G.W; G.y *= H / G.H; blockers.forEach(b => b.x *= W / G.W);
  }
  G.W = W; G.H = H;
  if (playerEl) { place(playerEl, G.x, G.y); blockers.forEach(b => place(b.el, b.x, lineY(b.i))); $('finish').style.top = lineY(G.level - 1) + 'px'; }
}
addEventListener('resize', () => layout(false));

// ---- input ----
const KEYMAP = { ArrowLeft:[-1,0], a:[-1,0], ArrowRight:[1,0], d:[1,0], ArrowUp:[0,-1], w:[0,-1], ArrowDown:[0,1], s:[0,1] };
addEventListener('keydown', e => {
  if (e.target.tagName === 'INPUT') return;
  const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  if (k === 'p' || k === 'Escape') { G.state === S.PAUSE ? resume() : pause(); return; }
  if (KEYMAP[k]) { e.preventDefault(); keys.add(k); }
});
addEventListener('keyup', e => keys.delete(e.key.length === 1 ? e.key.toLowerCase() : e.key));
addEventListener('blur', () => { keys.clear(); pause(); });
document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });

const joyEl = $('joystick'), knob = $('knob');
function joyMove(e) {
  const r = joyEl.getBoundingClientRect(), max = 36;
  let dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
  const d = Math.hypot(dx, dy) || 1, c = Math.min(d, max);
  dx = dx / d * c; dy = dy / d * c;
  knob.style.transform = `translate(${dx}px,${dy}px)`; joy.x = dx / max; joy.y = dy / max;
}
function joyEnd(e) {
  if (e.pointerId !== joy.id) return;
  joy = { x: 0, y: 0, id: null }; knob.style.transform = '';
}
joyEl.addEventListener('pointerdown', e => { if (joy.id !== null) return; joy.id = e.pointerId; joyEl.setPointerCapture(e.pointerId); joyMove(e); });
joyEl.addEventListener('pointermove', e => { if (e.pointerId === joy.id) joyMove(e); });
joyEl.addEventListener('pointerup', joyEnd); joyEl.addEventListener('pointercancel', joyEnd);
$('pauseBtn').addEventListener('click', pause);

function inputVec() {
  let x = 0, y = 0;
  for (const k of keys) { x += KEYMAP[k][0]; y += KEYMAP[k][1]; }
  if (!x && !y && Math.hypot(joy.x, joy.y) > 0.3) { x = joy.x; y = joy.y; }
  if (Math.abs(x) >= Math.abs(y)) { y = 0; x = Math.sign(x); } else { x = 0; y = Math.sign(y); } // 4-direction only
  return [x, y];
}

// ---- main loop (one rAF loop for the page lifetime; time-based) ----
function frame(t) {
  const dt = Math.min(0.05, (t - last) / 1000 || 0); last = t;
  if (G.state === S.COUNT) {
    G.countT += dt;
    const n = 3 - Math.floor(G.countT);
    if (n <= 0) { $('countdown').hidden = true; go('play'); }
    else if (n !== G.count) { G.count = n; $('countdown').textContent = n; }
  } else if (G.state === S.PLAY) update(dt);
  requestAnimationFrame(frame);
}
function update(dt) {
  G.levelTime += dt;
  const [ix, iy] = inputVec(), speed = G.H * 0.45;
  G.x = Math.max(SPRITE / 2, Math.min(G.W - SPRITE / 2, G.x + ix * speed * dt));
  G.y = Math.max(SPRITE / 2, Math.min(G.H - SPRITE / 2, G.y + iy * speed * dt));
  place(playerEl, G.x, G.y);
  playerEl.classList.toggle('moving', !!(ix || iy));
  if (ix || iy) face(playerEl, ix < 0 ? 'face-left' : ix > 0 ? 'face-right' : iy < 0 ? 'face-up' : 'face-down');

  const bs = (110 + G.level * 25) * (G.H / 800) * (matchMedia('(pointer:coarse)').matches ? 0.7 : 1);
  let hit = false;
  for (const b of blockers) {
    const dx = G.x - b.x, step = bs * dt;
    b.x = Math.max(SPRITE / 2, Math.min(G.W - SPRITE / 2, b.x + Math.sign(dx) * Math.min(Math.abs(dx), step)));
    b.phase += dt * 3;
    const y = lineY(b.i) + Math.sin(b.phase) * G.H * 0.02;
    place(b.el, b.x, y); b.el.classList.add('moving');
    face(b.el, Math.abs(G.y - y) > Math.abs(dx) ? (G.y > y ? 'face-down' : 'face-up') : (dx > 0 ? 'face-right' : 'face-left'));
    if (Math.hypot(G.x - b.x, G.y - y) < TAG_DIST) hit = true;
  }
  if (hit) return tagged();                       // tag takes priority over crossing in the same frame
  if (G.y <= lineY(G.level - 1)) crossed();
}

menu();
requestAnimationFrame(frame);
})();
