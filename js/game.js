/* 主游戏：难度、输入、相机、HUD、流程 */
const TERRAIN_COMMON = { size: 1000, res: 600, radius: 470 };
const QUALITY = {
  low: { res: 340, shadowSize: 1024, pixelRatio: 1.0, snow: 2000, maxTrees: 1500, maxRocks: 350 },
  medium: { res: 480, shadowSize: 2048, pixelRatio: 1.25, snow: 3500, maxTrees: 2600, maxRocks: 550 },
  high: { res: 600, shadowSize: 4096, pixelRatio: 1.5, snow: 5000, maxTrees: 3500, maxRocks: 700 },
};

const DIFFICULTIES = [
  {
    key: 'easy', name: '简单', sub: '徒步登山', color: '#5ec26a',
    desc: '缓坡为主，天气温和，营地充足。适合熟悉操作与攀爬节奏。',
    terrain: { height: 240, steep: 1.2, ridgeAmp: 0.07, rollAmp: 14, terrace: 0.3, terraceStep: 30, snowLine: 0.66, treeLine: 0.42, maxSlopeDeg: 72, ice: false },
    stamina: 130, staminaRegen: 14, climbDrain: 5, holdDrain: 1.2, walkSpeed: 3.3, climbSpeed: 1.5,
    windMax: 4, rockfall: 0, blizzard: null, camps: [0.24, 0.46, 0.66, 0.84], crates: 14, fallDmg: 0.6, coldRate: 1.2, coldLine: 0.55, lives: Infinity, scoreMul: 1,
  },
  {
    key: 'normal', name: '普通', sub: '经典攀登', color: '#4fa3ff',
    desc: '山体更陡，出现落石与偶发暴风雪，需要规划路线与体力。',
    terrain: { height: 340, steep: 1.3, ridgeAmp: 0.09, rollAmp: 18, terrace: 0.38, terraceStep: 32, snowLine: 0.6, treeLine: 0.38, maxSlopeDeg: 74, ice: false },
    stamina: 110, staminaRegen: 11, climbDrain: 6.5, holdDrain: 1.5, walkSpeed: 3.2, climbSpeed: 1.45,
    windMax: 8, rockfall: 0.45, blizzard: { first: [150, 260], dur: [30, 45], gap: [180, 300] }, camps: [0.3, 0.56, 0.8], crates: 12, fallDmg: 0.85, coldRate: 1.8, coldLine: 0.5, lives: Infinity, scoreMul: 1.5,
  },
  {
    key: 'hard', name: '困难', sub: '高山攀登', color: '#ffa63d',
    desc: '陡峭岩壁与冰面，频繁暴风雪与落石，只有两个营地，生命有限。',
    terrain: { height: 440, steep: 1.42, ridgeAmp: 0.11, rollAmp: 20, terrace: 0.42, terraceStep: 34, snowLine: 0.55, treeLine: 0.34, maxSlopeDeg: 76, ice: true },
    stamina: 95, staminaRegen: 9, climbDrain: 8, holdDrain: 1.8, walkSpeed: 3.1, climbSpeed: 1.4,
    windMax: 12, rockfall: 0.8, blizzard: { first: [70, 130], dur: [40, 70], gap: [100, 180] }, camps: [0.36, 0.7], crates: 9, fallDmg: 1.1, coldRate: 2.5, coldLine: 0.45, lives: 5, scoreMul: 2.2,
  },
  {
    key: 'extreme', name: '极限', sub: '死亡地带', color: '#ff4d4d',
    desc: '巨型高山，狂风暴雪与密集落石，仅一个营地、三条生命。真正的考验。',
    terrain: { height: 540, steep: 1.55, ridgeAmp: 0.12, rollAmp: 22, terrace: 0.45, terraceStep: 36, snowLine: 0.5, treeLine: 0.3, maxSlopeDeg: 78, ice: true },
    stamina: 85, staminaRegen: 7.5, climbDrain: 9.5, holdDrain: 2.2, walkSpeed: 3.0, climbSpeed: 1.35,
    windMax: 16, rockfall: 1.2, blizzard: { first: [50, 100], dur: [50, 80], gap: [70, 130] }, camps: [0.5], crates: 6, fallDmg: 1.4, coldRate: 3.2, coldLine: 0.4, lives: 3, scoreMul: 3.5,
  },
];

class Game {
  constructor() {
    this.canvas = document.getElementById('c');
    const renderer = this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    if ('outputColorSpace' in renderer) renderer.outputColorSpace = THREE.SRGBColorSpace; else renderer.outputEncoding = THREE.sRGBEncoding;

    this.camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 8000);
    this.scene = null;
    this.audio = new AudioSys();
    this.state = 'menu';
    this.input = { moveX: 0, moveZ: 0, jumpPressed: false, jumpHeld: false, sprint: false, camYaw: Math.PI };
    this.keys = {};
    this.cam = { yaw: Math.PI, pitch: 0.32, targetDist: 7, curDist: 7, target: new THREE.Vector3(), dragging: false };
    this.diffKey = 'normal';
    this.seed = 0;
    this.time = 0;
    this.flashT = 0;
    this.lastStep = 0;
    this.hudTimer = 0;
    this.cacheUI();
    this.buildMenu();
    this.bindInput();
    this.clock = new THREE.Clock();
    window.addEventListener('resize', () => this.onResize());
    this.loop = this.loop.bind(this);
    requestAnimationFrame(this.loop);
  }

  cacheUI() {
    const ids = ['hud', 'menu', 'loading', 'pause', 'result', 'hpBar', 'stBar', 'wmBar', 'hpVal', 'stVal', 'wmVal', 'modeTag', 'slopeVal', 'surfVal', 'altVal', 'altMax', 'timeVal', 'weatherTag',
      'compassArrow', 'distVal', 'windArrow', 'windVal', 'livesVal', 'cratesVal', 'cratesMax', 'altTrack', 'altMarker', 'hint', 'msgLog', 'flash', 'coldOverlay', 'bigMsg',
      'diffGrid', 'seedInput', 'randSeed', 'audioToggle', 'shadowToggle', 'qualitySel', 'startBtn', 'loadFill', 'loadText', 'resumeBtn', 'restartBtn', 'menuBtn', 'resultTitle', 'resultRank', 'resultStats', 'againBtn', 'menuBtn2'];
    this.ui = {};
    for (const id of ids) this.ui[id] = document.getElementById(id);
  }

  buildMenu() {
    const grid = this.ui.diffGrid;
    grid.innerHTML = '';
    for (const d of DIFFICULTIES) {
      const card = document.createElement('div');
      card.className = 'diff-card' + (d.key === this.diffKey ? ' active' : '');
      card.style.setProperty('--col', d.color);
      const weather = d.blizzard ? '暴风雪' : '温和';
      card.innerHTML = `<div class="name">${d.name}</div><div class="sub">${d.sub}</div><div class="desc">${d.desc}</div>
        <div class="meta">峰高 ${d.terrain.height}m · 营地 ${d.camps.length} · 天气 ${weather}<br>落石 ${d.rockfall ? '有' : '无'} · 生命 ${d.lives === Infinity ? '无限' : d.lives}</div>`;
      card.addEventListener('click', () => { this.diffKey = d.key; grid.querySelectorAll('.diff-card').forEach(c => c.classList.remove('active')); card.classList.add('active'); });
      grid.appendChild(card);
    }
    this.ui.randSeed.addEventListener('click', () => { this.ui.seedInput.value = 1 + Math.floor(Math.random() * 999999); });
    this.ui.startBtn.addEventListener('click', () => this.startFromMenu());
    this.ui.resumeBtn.addEventListener('click', () => this.resume());
    this.ui.restartBtn.addEventListener('click', () => this.start(this.diffKey, this.seed));
    this.ui.menuBtn.addEventListener('click', () => this.toMenu());
    this.ui.againBtn.addEventListener('click', () => this.start(this.diffKey, this.seed));
    this.ui.menuBtn2.addEventListener('click', () => this.toMenu());
  }

  startFromMenu() {
    const v = parseInt(this.ui.seedInput.value, 10);
    const seed = (v > 0) ? v : 1 + Math.floor(Math.random() * 999999);
    this.ui.seedInput.value = seed;
    this.audio.enabled = this.ui.audioToggle.checked;
    this.start(this.diffKey, seed);
  }

  /* ---------------- 流程 ---------------- */
  async start(diffKey, seed) {
    this.diffKey = diffKey; this.seed = seed;
    this.diff = DIFFICULTIES.find(d => d.key === diffKey);
    this.setState('loading');
    this.audio.init(); this.audio.resume();
    if (this.scene) this.teardown();
    const setLoad = (p, text) => { this.ui.loadFill.style.width = Math.round(p * 100) + '%'; if (text) this.ui.loadText.textContent = text; };
    const tick = () => new Promise(r => setTimeout(r, 0));
    setLoad(0.02, '计算高度场'); await tick();

    const Q = this.quality = QUALITY[this.ui.qualitySel.value] || QUALITY.medium;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, Q.pixelRatio));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    const cfg = Object.assign({}, TERRAIN_COMMON, this.diff.terrain, { res: Q.res });
    const T = this.terrain = new Terrain(cfg, seed);
    T.beginGenerate();
    const rows = T.n, chunk = 60;
    for (let j0 = 0; j0 < rows; j0 += chunk) {
      T.generateRows(j0, Math.min(rows, j0 + chunk));
      setLoad(0.05 + 0.5 * (j0 / rows)); await tick();
    }
    setLoad(0.58, '限制坡度与放置营地'); await tick();
    T.limitSlopes(cfg.maxSlopeDeg);
    T.findSummit();
    T.placeCamps(this.diff.camps);
    T.placeCrates(this.diff.crates);
    setLoad(0.7, '构建山体网格'); await tick();
    const scene = this.scene = new THREE.Scene();
    scene.background = new THREE.Color(0x9fc2e8);
    scene.add(T.buildMesh());
    setLoad(0.82, '生成植被、营地与天气'); await tick();
    this.world = new World(scene, T, this.diff, seed, { shadows: this.ui.shadowToggle.checked, shadowSize: Q.shadowSize, snow: Q.snow, maxTrees: Q.maxTrees, maxRocks: Q.maxRocks });
    this.renderer.shadowMap.enabled = this.ui.shadowToggle.checked;
    this.weather = new Weather(this.diff, seed);
    this.rockfall = new RockfallSystem(scene, T, this.diff.rockfall, seed);
    this.climber = new Climber();
    scene.add(this.climber.group);
    this.player = new Player(this);
    this.player.respawn(T.start);
    this.respawnPoint = T.start.clone();
    this.lives = this.diff.lives;
    this.cratesCollected = 0;
    this.time = 0; this.hudTimer = 0; this.lastStep = 0; this.won = false;
    this.cam.yaw = Math.PI; this.cam.pitch = 0.32; this.cam.targetDist = 7; this.cam.curDist = 7;
    this.cam.target.copy(this.player.pos).add(new THREE.Vector3(0, 1.3, 0));
    setLoad(1, '完成'); await tick();
    this.setupHud();
    this.ui.msgLog.innerHTML = '';
    this.setState('playing');
    this.addMsg(`难度「${this.diff.name}」· 峰顶海拔 ${Math.round(T.summit.y)} m · 种子 ${seed}`, 'info');
    this.addMsg('鼠标拖拽旋转视角，W 前进。找到缓坡与岩架，合理分配体力。', 'info');
  }

  teardown() {
    if (this.world) this.world.dispose();
    this.scene = null; this.world = null; this.player = null; this.terrain = null;
  }

  setState(s) {
    this.state = s;
    const u = this.ui;
    u.menu.classList.toggle('hidden', s !== 'menu');
    u.loading.classList.toggle('hidden', s !== 'loading');
    u.pause.classList.toggle('hidden', s !== 'paused');
    u.result.classList.toggle('hidden', s !== 'result');
    u.hud.classList.toggle('hidden', !(s === 'playing' || s === 'paused'));
    if (s !== 'playing' && document.pointerLockElement) { try { document.exitPointerLock(); } catch (e) { } }
    if (s !== 'playing' && this.audio.ctx) { this.audio.setWind(0, 0); this.audio.setSlide(0); }
  }
  pause() { if (this.state === 'playing') this.setState('paused'); }
  resume() { if (this.state === 'paused') { this.setState('playing'); this.clock.getDelta(); } }
  toMenu() { this.teardown(); this.setState('menu'); }

  setupHud() {
    const u = this.ui, T = this.terrain;
    u.altMax.textContent = Math.round(T.summit.y);
    u.cratesMax.textContent = T.crates.length;
    u.livesVal.textContent = this.lives === Infinity ? '∞' : this.lives;
    u.altTrack.querySelectorAll('.camp-mark,.summit-mark,.crate-mark').forEach(e => e.remove());
    const Hmax = T.summit.y;
    for (const c of T.camps) { const m = document.createElement('div'); m.className = 'camp-mark'; m.style.bottom = (c.pos.y / Hmax * 100) + '%'; m.title = `${c.index}号营地`; u.altTrack.appendChild(m); }
    for (const c of T.crates) { const m = document.createElement('div'); m.className = 'crate-mark'; m.style.bottom = (c.pos.y / Hmax * 100) + '%'; u.altTrack.appendChild(m); }
    const s = document.createElement('div'); s.className = 'summit-mark'; s.textContent = '⛰'; u.altTrack.appendChild(s);
  }

  /* ---------------- 输入 ---------------- */
  bindInput() {
    const cv = this.canvas;
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Space' && !e.repeat) this.input.jumpPressed = true;
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.code)) e.preventDefault();
      if (e.repeat) return;
      this.keys[e.code] = true;
      if (e.code === 'Escape') { if (this.state === 'playing') this.pause(); else if (this.state === 'paused') this.resume(); }
      if (e.code === 'KeyM') { this.audio.setMuted(!this.audio.muted); this.addMsg(this.audio.muted ? '已静音' : '已开启声音', 'info'); }
      if (e.code === 'KeyR' && this.state === 'playing' && this.player && this.player.mode !== MODE.DEAD) {
        this.player.respawn(this.respawnPoint); this.time += 20; this.addMsg('回到上一营地（+20 秒）', 'warn');
      }
    });
    window.addEventListener('keyup', (e) => { this.keys[e.code] = false; });
    window.addEventListener('blur', () => { this.keys = {}; });
    cv.addEventListener('mousedown', (e) => {
      this.cam.dragging = true;
      if (this.state === 'playing' && cv.requestPointerLock && !document.pointerLockElement) { try { const r = cv.requestPointerLock(); if (r && r.catch) r.catch(() => { }); } catch (err) { } }
      this.audio.resume();
    });
    window.addEventListener('mouseup', () => { this.cam.dragging = false; });
    window.addEventListener('mousemove', (e) => {
      const locked = document.pointerLockElement === cv;
      if (!(locked || this.cam.dragging) || this.state !== 'playing') return;
      const dx = e.movementX || 0, dy = e.movementY || 0;
      this.cam.yaw -= dx * 0.0028;
      this.cam.pitch = clamp(this.cam.pitch + dy * 0.0028, -0.3, 1.35);
    });
    cv.addEventListener('wheel', (e) => { this.cam.targetDist = clamp(this.cam.targetDist * (1 + Math.sign(e.deltaY) * 0.12), 2.5, 16); e.preventDefault(); }, { passive: false });
    cv.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  gatherInput() {
    const k = this.keys, i = this.input;
    i.moveX = (k.KeyD || k.ArrowRight ? 1 : 0) - (k.KeyA || k.ArrowLeft ? 1 : 0);
    i.moveZ = (k.KeyW || k.ArrowUp ? 1 : 0) - (k.KeyS || k.ArrowDown ? 1 : 0);
    i.jumpHeld = !!k.Space;
    i.sprint = !!(k.ShiftLeft || k.ShiftRight);
    i.camYaw = this.cam.yaw;
  }

  /* ---------------- 主循环 ---------------- */
  loop() {
    requestAnimationFrame(this.loop);
    const dt = Math.min(0.05, this.clock.getDelta());
    if (this.state === 'playing') this.update(dt);
    if (this.scene) this.renderer.render(this.scene, this.camera);
  }

  update(dt) {
    const P = this.player, T = this.terrain, W = this.weather;
    this.time += dt;
    this.gatherInput();
    const altF = P.pos.y / T.summit.y;
    W.update(dt, altF);
    for (const ev of W.events) {
      if (ev === 'warn') { this.addMsg('远处传来风声……暴风雪即将来临！尽快找营地或缓坡躲避', 'warn'); this.audio.warn(); }
      if (ev === 'start') { this.bigMsg('暴风雪'); this.addMsg('暴风雪来袭：视野极差、风更大、体温流失加快', 'warn'); }
      if (ev === 'end') this.addMsg('暴风雪过去了，天空重新放晴', 'good');
    }
    W.events.length = 0;

    // 营地检测
    P.atCamp = false;
    for (const c of T.camps) {
      const d = Math.hypot(P.pos.x - c.pos.x, P.pos.z - c.pos.z);
      if (d < 7 && Math.abs(P.pos.y - c.pos.y) < 4) {
        P.atCamp = true; this.respawnPoint.copy(c.pos);
        if (!c.visited) { c.visited = true; this.bigMsg(`${c.index} 号营地`); this.addMsg(`到达 ${c.index} 号营地：恢复状态，进度已保存`, 'good'); this.audio.camp(); }
      }
    }

    P.update(dt, this.input, W);
    this.handlePlayerEvents();

    // 落石
    this.rockfall.update(dt, P, (rk, spd) => {
      P.hurt(16 + rk.r * 14 + spd * 0.6, 'rock');
      P.vel.copy(rk.vel).multiplyScalar(0.5); P.vel.y += 3; if (P.mode !== MODE.DEAD) { P.mode = MODE.AIR; P.pos.y += 0.1; }
      this.addMsg('被落石击中！', 'warn');
    });
    for (const ev of this.rockfall.events) { if (ev === 'spawn') { this.bigMsg('落石！'); this.addMsg('⚠ 上方有落石滚下，注意躲避！', 'warn'); this.audio.rockWarn(); } }
    this.rockfall.events.length = 0;

    // 补给箱
    for (const cr of T.crates) {
      if (cr.taken) continue;
      if (Math.hypot(P.pos.x - cr.pos.x, P.pos.z - cr.pos.z) < 1.7 && Math.abs(P.pos.y - cr.pos.y) < 2.5) {
        cr.taken = true; cr.group.visible = false; this.cratesCollected++;
        P.stamina = Math.min(P.maxStamina, P.stamina + 50); P.warmth = Math.min(100, P.warmth + 40); P.health = Math.min(100, P.health + 20);
        this.addMsg(`获得补给：体力 +50，体温 +40，生命 +20（${this.cratesCollected}/${T.crates.length}）`, 'good'); this.audio.pickup();
      }
    }

    // 登顶
    if (!this.won && Math.hypot(P.pos.x - T.summit.x, P.pos.z - T.summit.z) < 4.5 && Math.abs(P.pos.y - T.summit.y) < 3.5 && P.mode !== MODE.DEAD) {
      this.won = true; this.finish(true); return;
    }
    // 死亡处理
    if (P.mode === MODE.DEAD && P.deadTimer > 2.6) {
      if (this.lives !== Infinity) this.lives--;
      if (this.lives <= 0) { this.finish(false); return; }
      P.respawn(this.respawnPoint);
      this.addMsg(`在营地重新出发${this.lives === Infinity ? '' : `（剩余生命 ${this.lives}）`}`, 'warn');
      this.ui.livesVal.textContent = this.lives === Infinity ? '∞' : this.lives;
    }

    this.climber.update(dt, P);
    this.updateCamera(dt);
    this.world.update(dt, P, W, this.camera);
    this.updateAudio(dt);
    this.updateHud(dt);
  }

  handlePlayerEvents() {
    const P = this.player;
    for (const ev of P.events) {
      const d = ev.data;
      switch (ev.type) {
        case 'grab': this.audio.grab(); break;
        case 'gripLost':
          this.bigMsg('滑坠！'); this.audio.gripLost();
          this.addMsg(d.reason === 'stamina' ? '体力耗尽，脱手滑坠！按住空格制动' : d.reason === 'ice' ? '冰面打滑，抓不住！按住空格制动' : '坡度过陡，抓不住！按住空格制动', 'warn');
          break;
        case 'regrab': this.audio.grab(); this.addMsg(`重新抓住了${MAT_NAME[P.mat]}${d.drop > 3 ? `，滑落了 ${Math.round(d.drop)} 米` : ''}`, 'good'); break;
        case 'recover': if (d.drop > 3) this.addMsg(`滑落了 ${Math.round(d.drop)} 米后停了下来`, 'info'); break;
        case 'land': if (d.dmg > 0) this.addMsg(`坠落受伤 −${Math.round(d.dmg)}`, 'warn'); else if (d.impact > 3) this.audio.land(d.impact / 12); break;
        case 'damage': this.flashT = 0.6; this.audio.hit(d.amount / 40); break;
        case 'dead':
          this.bigMsg('遇难'); this.audio.death();
          this.addMsg(d.why === 'cold' ? '体温耗尽，冻僵了……' : d.why === 'rock' ? '被落石击中，失去了意识……' : d.why === 'slide' ? '高速滑坠，撞上了岩石……' : '坠落伤势过重……', 'warn');
          break;
        case 'jump': this.audio.burst(600, 1, 0.1, 0.15, 'lowpass'); break;
        case 'lunge': this.audio.lunge(); break;
      }
    }
    P.events.length = 0;
  }

  updateCamera(dt) {
    const P = this.player, T = this.terrain, c = this.cam, cam = this.camera;
    const headY = (P.mode === MODE.SLIDE || P.mode === MODE.DEAD) ? 0.9 : 1.35;
    const tp = new THREE.Vector3(P.pos.x, P.pos.y + headY, P.pos.z);
    c.target.lerp(tp, 1 - Math.exp(-dt * 12));
    // 按住 Tab：拉远俯瞰，方便规划路线
    const overview = !!this.keys.Tab;
    c.overview = (c.overview || 0) + ((overview ? 1 : 0) - (c.overview || 0)) * (1 - Math.exp(-dt * 4));
    const pitch = lerp(c.pitch, 1.0, c.overview);
    const dist = lerp(c.targetDist, 70, c.overview);
    const off = new THREE.Vector3(Math.sin(c.yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(c.yaw) * Math.cos(pitch));
    let d = dist;
    const probe = new THREE.Vector3();
    for (let k = 1; k <= 16; k++) {
      const f = k / 16;
      probe.copy(c.target).addScaledVector(off, dist * f);
      const h = T.getHeight(probe.x, probe.z) + 0.8;
      if (probe.y < h) { d = Math.max(1.2, dist * f - 0.5); break; }
    }
    if (d < c.curDist) c.curDist = d; else c.curDist += (d - c.curDist) * Math.min(1, dt * 2.5);
    cam.position.copy(c.target).addScaledVector(off, c.curDist);
    const hc = T.getHeight(cam.position.x, cam.position.z) + 0.5;
    if (cam.position.y < hc) cam.position.y = hc;
    cam.lookAt(c.target);
  }

  updateAudio(dt) {
    const A = this.audio, P = this.player, W = this.weather;
    if (!A.ctx) return;
    A.setWind(clamp(W.windSpeed / 18, 0, 1) * (P.atCamp ? 0.6 : 1), W.intensity);
    A.setSlide(P.mode === MODE.SLIDE ? clamp(P.speed / 12, 0, 1) : 0);
    if ((P.mode === MODE.WALK || P.mode === MODE.CLIMB) && P.speed > 0.3) {
      const stepIdx = Math.floor(P.phase / Math.PI);
      if (stepIdx !== this.lastStep) { this.lastStep = stepIdx; A.step(P.mat, P.sprinting); }
    }
  }

  /* ---------------- HUD ---------------- */
  updateHud(dt) {
    const u = this.ui, P = this.player, T = this.terrain, W = this.weather;
    u.hpBar.style.width = clamp(P.health, 0, 100) + '%';
    u.stBar.style.width = clamp(P.stamina / P.maxStamina * 100, 0, 100) + '%';
    u.stBar.classList.toggle('low', P.stamina < P.maxStamina * 0.2);
    u.wmBar.style.width = clamp(P.warmth, 0, 100) + '%';
    if (this.flashT > 0) { this.flashT -= dt; u.flash.style.opacity = clamp(this.flashT / 0.6, 0, 1); } else u.flash.style.opacity = 0;
    u.coldOverlay.style.opacity = P.warmth < 35 ? (1 - P.warmth / 35) * 0.85 : 0;
    // 指南针与风
    const phiC = this.cam.yaw + Math.PI;
    const phiS = Math.atan2(T.summit.x - P.pos.x, T.summit.z - P.pos.z);
    u.compassArrow.style.transform = `rotate(${(phiC - phiS) * 180 / Math.PI}deg)`;
    u.windArrow.style.transform = `rotate(${(phiC - W.windAngle) * 180 / Math.PI - 90}deg)`;
    u.altMarker.style.bottom = clamp(P.pos.y / T.summit.y * 100, 0, 100) + '%';

    this.hudTimer -= dt;
    if (this.hudTimer > 0) return;
    this.hudTimer = 0.1;
    u.hpVal.textContent = Math.round(P.health);
    u.stVal.textContent = Math.round(P.stamina);
    u.wmVal.textContent = Math.round(P.warmth);
    u.modeTag.textContent = MODE_NAME[P.mode] + (P.mode === MODE.SLIDE && P.braking ? '（制动中）' : P.mode === MODE.WALK && P.sprinting ? '（冲刺）' : '');
    u.modeTag.className = 'mode-tag ' + P.mode;
    let slopeText = `坡度 ${Math.round(P.slope)}°`;
    if (P.mode === MODE.CLIMB) slopeText += ` · 攀爬 −${P.climbDrainRate(W).toFixed(1)}/s`;
    else if (P.mode === MODE.WALK && P.slope > 30) slopeText += ' · 接近攀爬坡度';
    u.slopeVal.textContent = slopeText;
    u.surfVal.textContent = MAT_NAME[P.mat] || '';
    u.altVal.textContent = Math.round(P.pos.y);
    const t = Math.floor(this.time); u.timeVal.textContent = `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
    u.windVal.textContent = W.windSpeed.toFixed(1);
    u.distVal.textContent = Math.round(Math.hypot(T.summit.x - P.pos.x, T.summit.z - P.pos.z));
    u.cratesVal.textContent = this.cratesCollected;
    let wt = '晴朗', storm = false;
    if (W.blizzard) { wt = '暴风雪 ' + Math.max(0, Math.round(W.blizzardDur - W.blizzardT)) + 's'; storm = true; }
    else if (W.snowfall > 0.3) wt = '降雪';
    else if (W.windSpeed > 9) wt = '大风';
    if (P.atCamp) wt += ' · 营地内';
    u.weatherTag.textContent = wt; u.weatherTag.classList.toggle('storm', storm);
    // 提示
    let hint = '';
    if (P.mode === MODE.SLIDE) hint = '滑坠中！按住【空格】制动，用 A/D 微调方向';
    else if (P.mode === MODE.CLIMB) hint = P.stamina < P.maxStamina * 0.25 ? '体力告急！找一块 ≤64° 的地方停下休息，或下攀到岩架' : P.slope >= P.restSlope ? '攀爬中 · 此处太陡无法休息 · 【空格】向上猛冲(−12 体力)' : '攀爬中 · 静止可缓慢回复 · 【空格】向上猛冲(−12 体力)';
    else if (P.mode === MODE.WALK) hint = P.freezing ? '体温耗尽！正在受冻，尽快到营地或补给箱' : P.warmth < 30 ? '体温很低，尽快到营地取暖' : this.time < 25 ? '沿指南针方向前往峰顶，黄色标记是营地' : '';
    else if (P.mode === MODE.DEAD) hint = '……';
    u.hint.textContent = hint;
    u.hint.style.display = hint ? 'inline-block' : 'none';
  }

  addMsg(text, cls) {
    const el = document.createElement('div');
    el.className = 'msg ' + (cls || '');
    el.textContent = text;
    this.ui.msgLog.appendChild(el);
    while (this.ui.msgLog.children.length > 5) this.ui.msgLog.removeChild(this.ui.msgLog.firstChild);
    setTimeout(() => { if (el.parentNode) el.parentNode.removeChild(el); }, 5000);
  }
  bigMsg(text) {
    const b = this.ui.bigMsg;
    b.textContent = text; b.classList.remove('hidden');
    b.style.animation = 'none'; void b.offsetWidth; b.style.animation = '';
    clearTimeout(this._bigT); this._bigT = setTimeout(() => b.classList.add('hidden'), 2200);
  }

  finish(won) {
    const P = this.player, T = this.terrain, u = this.ui, D = this.diff;
    this.setState('result');
    const time = this.time;
    const par = 200 + D.terrain.height * 0.9;
    let score = 0, rank = '—';
    if (won) {
      score = Math.round((6000 + Math.max(0, par * 2 - time) * 4 + this.cratesCollected * 250 - P.stats.falls * 300 - P.stats.damageTaken * 6 - P.stats.deaths * 800) * D.scoreMul);
      score = Math.max(0, score);
      rank = (time < par * 0.7 && P.stats.deaths === 0 && P.stats.falls <= 1) ? 'S' : (time < par && P.stats.deaths === 0) ? 'A' : time < par * 1.5 ? 'B' : 'C';
      this.audio.summit();
    }
    u.resultTitle.textContent = won ? `登顶成功！海拔 ${Math.round(T.summit.y)} m` : '遇难……生命耗尽';
    u.resultRank.textContent = rank;
    const mm = Math.floor(time / 60), ss = Math.floor(time % 60);
    u.resultStats.innerHTML = [
      ['难度', D.name], ['用时', `${mm}分${ss}秒`], ['最高海拔', `${Math.round(P.stats.maxAlt)} m`], ['滑坠 / 坠落', `${P.stats.falls} 次`],
      ['受到伤害', `${Math.round(P.stats.damageTaken)}`], ['死亡次数', `${P.stats.deaths}`], ['补给箱', `${this.cratesCollected} / ${T.crates.length}`], ['地形种子', `${this.seed}`],
      ['得分', `${score}`],
    ].map(([k, v]) => `<div><span>${k}</span><b>${v}</b></div>`).join('');
  }

  onResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }
}

window.addEventListener('DOMContentLoaded', () => { window.game = new Game(); });
