/* 主流程：菜单、加载、输入、相机、互动、营地、拍照、成就、结算 */
const LOAD_TIPS = [
  '步道绕得远，但坡度平缓、体力消耗少；岩壁是捷径，却要冒坠落的风险。',
  '白色镁粉标记的大把手可以休息；褐红色的松动岩块抓住后很快就会碎。',
  '在岩壁上按 Q 打岩钉——坠落时绳索会在最后一颗岩钉处拉住你。',
  '夜晚气温骤降。生一堆火、煮一碗面、钻进帐篷睡一觉，第二天又是一条好汉。',
  '体力条被压缩了？看看右侧的彩色段：饥饿、寒冷、伤势、疲惫、缺氧。',
  '暴风雪中看不清路时，跟着红白相间的路标杆走，它们在夜里会发光。',
  '按 M 打开地图。靠近过的日志、补给包和观景点会被标记在地图上。',
  '滑坠时按住空格用冰镐制动：岩石和雪面容易停住，冰面几乎停不住。',
  '观景点有相机标志，站在那里按 F 拍照就能完成目标。',
  '在清晨登顶，可以看到“日照金山”。',
];

class Game {
  constructor() {
    Save.load();
    this.S = Save.data.settings;
    this.canvas = $('c');
    const r = this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, powerPreference: 'high-performance' });
    r.setSize(window.innerWidth, window.innerHeight);
    r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFSoftShadowMap;
    r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 1.0;
    if ('outputColorSpace' in r) r.outputColorSpace = THREE.SRGBColorSpace; else r.outputEncoding = THREE.sRGBEncoding;
    this.camera = new THREE.PerspectiveCamera(this.S.fov, window.innerWidth / window.innerHeight, 0.1, 9000);
    this.post = new PostFX(r);
    this.audio = new AudioSys();
    this.ui = new UI(this);
    this.state = 'boot'; this.overlay = null;
    this.keys = {}; this.pressed = new Set();
    this.input = { moveX: 0, moveZ: 0, jumpPressed: false, jumpReleased: false, jumpHeld: false, sprint: false, camYaw: Math.PI, interact: false, piton: false };
    this.cam = { yaw: Math.PI, pitch: 0.3, dist: 6.5, curDist: 6.5, target: new THREE.Vector3(), fov: this.S.fov, idleT: 0 };
    this.selStage = Math.min(STAGES.length - 1, Math.max(0, Save.data.progress.unlocked - 1));
    this.clock = new THREE.Clock();
    this.hurtFlash = 0; this.time = 0;
    this.applySettings();
    this.bindUI();
    this.bindInput();
    window.addEventListener('resize', () => this.onResize());
    this.onResize();
    this.loop = this.loop.bind(this);
    requestAnimationFrame(this.loop);
    this.bootMenu();
  }

  /* ================= 设置 ================= */
  applySettings() {
    const S = this.S;
    this.audio.vol = { master: S.master, music: S.music, sfx: S.sfx };
    this.audio.applyVolumes();
    this.camera.fov = S.fov; this.camera.updateProjectionMatrix();
    this.quality = QUALITY[S.quality] || QUALITY.medium;
    this.post.enabled = this.quality.post;
    this.onResize();
  }
  onResize() {
    const w = window.innerWidth, h = window.innerHeight;
    const pr = Math.min(window.devicePixelRatio || 1, this.quality ? this.quality.pixelRatio : 1);
    this.renderer.setPixelRatio(pr);
    this.renderer.setSize(w, h);
    if (this.post) this.post.setSize(w, h, pr);
    this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
  }

  /* ================= UI 绑定 ================= */
  bindUI() {
    const u = this.ui.el, A = this.audio;
    const on = (id, fn) => { const e = $(id); if (!e) return; e.addEventListener('click', (ev) => { A.init(); A.resume(); A.click(); fn(ev); }); e.addEventListener('mouseenter', () => A.hover()); };
    on('btnContinue', () => { const run = Save.data.run; if (run) this.startStage(run.stageIdx, { resume: run, free: run.free, seed: run.seed }); });
    on('btnCampaign', () => { this.freeMode = false; this.ui.buildStageSelect(false); this.ui.show('stageSelect', true); });
    on('btnFree', () => { this.freeMode = true; this.ui.buildStageSelect(true); this.ui.show('stageSelect', true); });
    on('btnAchievements', () => { this.ui.buildAchievements(); this.ui.show('achScreen', true); });
    on('btnAlbum', () => { this.ui.buildAlbum('photos'); this.ui.show('albumScreen', true); });
    on('btnSettings', () => { this.openSettings(); });
    on('btnQuit', () => { if (window.steamBridge && window.steamBridge.quit) window.steamBridge.quit(); else { window.close(); this.ui.msg('浏览器版本请直接关闭标签页'); } });
    on('randSeed', () => { u.seedInput.value = 1 + Math.floor(Math.random() * 999999); });
    on('btnStart', () => {
      let seed = STAGES[this.selStage].seed;
      if (this.freeMode) { const v = parseInt(u.seedInput.value, 10); seed = v > 0 ? v : 1 + Math.floor(Math.random() * 999999); u.seedInput.value = seed; }
      this.startStage(this.selStage, { free: this.freeMode, seed });
    });
    document.querySelectorAll('[data-back]').forEach(b => b.addEventListener('click', () => { A.click(); this.ui.back(); }));
    document.querySelectorAll('#albumScreen .tab').forEach(t => t.addEventListener('click', () => { A.click(); this.ui.buildAlbum(t.dataset.tab); }));
    on('btnResume', () => this.resume());
    on('btnPauseMap', () => { this.ui.hideAll(); this.openMap(true); });
    on('btnPauseSettings', () => this.openSettings());
    on('btnPauseHelp', () => this.ui.show('help', true));
    on('btnRestart', () => { Save.data.run = null; Save.write(); this.startStage(this.stageIdx, { free: this.freeMode, seed: this.seed }); });
    on('btnToMenu', () => { this.saveRun(); this.toMenu(); });
    on('btnNext', () => { if (this.stageIdx < STAGES.length - 1) { this.selStage = this.stageIdx + 1; this.startStage(this.selStage, { free: this.freeMode, seed: this.freeMode ? 1 + Math.floor(Math.random() * 999999) : STAGES[this.selStage].seed }); } });
    on('btnAgain', () => this.startStage(this.stageIdx, { free: this.freeMode, seed: this.seed }));
    on('btnResMenu', () => this.toMenu());
    on('btnCloseJournal', () => this.closeJournal());
    on('btnLeaveCamp', () => this.closeCamp());
    on('btnResetSave', () => { if (confirm('确定清除所有存档、成就与照片吗？')) { Save.reset(); this.S = Save.data.settings; this.applySettings(); this.openSettings(); } });
    // 设置控件
    const bindSet = (id, key, type = 'value', after) => {
      const e = $(id);
      e.addEventListener(type === 'checked' ? 'change' : 'input', () => {
        this.S[key] = type === 'checked' ? e.checked : (e.type === 'range' ? parseFloat(e.value) : e.value);
        Save.write(); this.applySettings(); if (after) after();
      });
    };
    bindSet('setQuality', 'quality', 'value', () => this.ui.msg('画质将在下次载入山体时完全生效'));
    bindSet('setShadows', 'shadows', 'checked');
    bindSet('setFov', 'fov', 'value', () => { u.fovVal.textContent = this.S.fov; });
    bindSet('setMaster', 'master'); bindSet('setMusic', 'music'); bindSet('setSfx', 'sfx');
    bindSet('setSens', 'sens', 'value', () => { u.sensVal.textContent = this.S.sens.toFixed(2); });
    bindSet('setInvert', 'invertY', 'checked'); bindSet('setTips', 'showTips', 'checked');
    bindSet('setFullscreen', 'fullscreen', 'checked', () => this.setFullscreen(this.S.fullscreen));
  }

  openSettings() {
    const S = this.S, u = this.ui.el;
    u.setQuality.value = S.quality; u.setShadows.checked = S.shadows; u.setFov.value = S.fov; u.fovVal.textContent = S.fov;
    u.setMaster.value = S.master; u.setMusic.value = S.music; u.setSfx.value = S.sfx; u.setSens.value = S.sens; u.sensVal.textContent = S.sens.toFixed(2);
    u.setInvert.checked = S.invertY; u.setTips.checked = S.showTips; u.setFullscreen.checked = !!document.fullscreenElement;
    this.ui.show('settings', true);
  }
  setFullscreen(on) {
    try {
      if (window.steamBridge && window.steamBridge.fullscreen) window.steamBridge.fullscreen(on);
      else if (on && !document.fullscreenElement) document.documentElement.requestFullscreen();
      else if (!on && document.fullscreenElement) document.exitFullscreen();
    } catch (e) { }
  }

  onBack() {
    if (this.state === 'pause') this.ui.show('pause');
    else if (this.state === 'menu') this.ui.show('menu');
    else if (this.state === 'play' && this.ui.journalFromAlbum) this.ui.hideAll();
    else this.ui.show('menu');
  }

  /* ================= 输入 ================= */
  bindInput() {
    const cv = this.canvas;
    window.addEventListener('keydown', (e) => {
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.code)) e.preventDefault();
      if (e.repeat) return;
      this.keys[e.code] = true;
      this.pressed.add(e.code);
      this.audio.init(); this.audio.resume();
      if (this.state === 'story' && (e.code === 'Space' || e.code === 'Enter') && this.ui.storyKey) this.ui.storyKey();
      if (e.code === 'Escape') this.onEscape();
    });
    window.addEventListener('keyup', (e) => { this.keys[e.code] = false; if (e.code === 'Space') this.input.jumpReleased = true; });
    window.addEventListener('blur', () => { this.keys = {}; });
    cv.addEventListener('mousedown', (e) => {
      this.audio.init(); this.audio.resume();
      if (this.state !== 'play' && this.state !== 'summit') return;
      if (this.overlay === 'photo' && document.pointerLockElement === cv && e.button === 0) { this.takePhoto(); return; }
      if (this.overlay === 'camp') return;
      this.lockPointer();
      this.dragging = true;
    });
    window.addEventListener('mouseup', () => { this.dragging = false; });
    window.addEventListener('mousemove', (e) => {
      const locked = document.pointerLockElement === cv;
      if (!(locked || this.dragging)) return;
      if (this.state !== 'play') return;
      if (this.overlay && this.overlay !== 'photo') return;
      const s = 0.0024 * this.S.sens, dx = e.movementX || 0, dy = (e.movementY || 0) * (this.S.invertY ? -1 : 1);
      const c = this.overlay === 'photo' ? this.photo : this.cam;
      c.yaw -= dx * s;
      c.pitch = clamp(c.pitch + dy * s, this.overlay === 'photo' ? -0.6 : -0.35, 1.35);
      this.cam.idleT = 0;
    });
    cv.addEventListener('wheel', (e) => {
      if (this.overlay === 'photo') { this.photo.fov = clamp(this.photo.fov + Math.sign(e.deltaY) * 3, 15, 90); }
      else this.cam.dist = clamp(this.cam.dist * (1 + Math.sign(e.deltaY) * 0.12), 2.2, 16);
      e.preventDefault();
    }, { passive: false });
    cv.addEventListener('contextmenu', (e) => e.preventDefault());
  }
  lockPointer() { const cv = this.canvas; if (cv.requestPointerLock && document.pointerLockElement !== cv) { try { const r = cv.requestPointerLock(); if (r && r.catch) r.catch(() => { }); } catch (e) { } } }
  unlockPointer() { if (document.pointerLockElement) try { document.exitPointerLock(); } catch (e) { } }
  take(code) { if (this.pressed.has(code)) { this.pressed.delete(code); return true; } return false; }

  onEscape() {
    if (this.state === 'play') {
      if (this.overlay === 'photo') return this.closePhoto();
      if (this.overlay === 'map') return this.closeMap();
      if (this.overlay === 'journal') return this.closeJournal();
      if (this.overlay === 'camp') return this.closeCamp();
      return this.pause();
    }
    if (this.state === 'pause') { if (this.ui.screenStack.length) this.ui.back(); else this.resume(); return; }
    if (this.state === 'menu' && this.ui.screenStack.length) this.ui.back();
  }

  pollGamepad() {
    const gp = navigator.getGamepads ? Array.from(navigator.getGamepads()).find(g => g) : null;
    this.pad = null;
    if (!gp) return;
    const dz = (v) => Math.abs(v) < 0.18 ? 0 : v;
    const prev = this.padPrev || [];
    const btn = gp.buttons.map(b => b.pressed);
    const edge = (i) => btn[i] && !prev[i];
    this.pad = { lx: dz(gp.axes[0]), ly: dz(gp.axes[1]), rx: dz(gp.axes[2] || 0), ry: dz(gp.axes[3] || 0), a: btn[0], rb: btn[5] || btn[10] };
    const map = { 0: 'Space', 1: 'KeyE', 2: 'KeyQ', 3: 'KeyF', 4: 'KeyL', 8: 'KeyM', 12: 'Digit1', 13: 'Digit2', 14: 'Digit3', 15: 'Digit4', 6: 'KeyT' };
    for (const i in map) if (edge(+i)) { this.pressed.add(map[i]); this.audio.init(); }
    if (edge(9)) this.onEscape();
    if (!btn[0] && prev[0]) this.input.jumpReleased = true;
    this.padPrev = btn;
    if (this.state === 'play' && !this.overlay) { this.cam.yaw -= this.pad.rx * 0.045 * this.S.sens; this.cam.pitch = clamp(this.cam.pitch + this.pad.ry * 0.035 * this.S.sens, -0.35, 1.35); }
  }

  gatherInput() {
    const k = this.keys, i = this.input, p = this.pad;
    i.moveX = (k.KeyD || k.ArrowRight ? 1 : 0) - (k.KeyA || k.ArrowLeft ? 1 : 0);
    i.moveZ = (k.KeyW || k.ArrowUp ? 1 : 0) - (k.KeyS || k.ArrowDown ? 1 : 0);
    i.jumpHeld = !!k.Space;
    i.sprint = !!(k.ShiftLeft || k.ShiftRight);
    if (p) { if (p.lx || p.ly) { i.moveX = p.lx; i.moveZ = -p.ly; } i.jumpHeld = i.jumpHeld || p.a; i.sprint = i.sprint || p.rb; }
    if (this.take('Space')) i.jumpPressed = true;
    if (this.take('KeyE')) i.interact = true;
    if (this.take('KeyQ')) i.piton = true;
    i.camYaw = this.cam.yaw;
  }

  /* ================= 世界构建 ================= */
  async buildWorld(stage, seed, forMenu, progress) {
    const Q = this.quality;
    const setP = progress || (() => { });
    const tick = () => new Promise(r => setTimeout(r, 0));
    const res = TERRAIN_RES; // 所有画质使用相同的地形分辨率，保证关卡布局一致
    const T = new Terrain(stage, seed, res);
    setP(0.02, '计算高度场'); await tick();
    T.beginGenerate();
    for (let j0 = 0; j0 < T.n; j0 += 50) { T.generateRows(j0, Math.min(T.n, j0 + 50)); setP(0.03 + 0.4 * j0 / T.n); await tick(); }
    setP(0.45, '侵蚀山体、放置湖泊'); await tick();
    T.limitSlopes(stage.terrain.maxSlopeDeg);
    T.carveLake();
    T.findSummit();
    setP(0.5, '规划之字形步道'); await tick();
    T.computeTrail(); T.carveTrail();
    setP(0.56, '搭建营地、雕刻岩壁与冰裂缝'); await tick();
    T.placeCamps(stage.camps);
    T.placeWalls(stage.walls);
    T.placeCrevasses(stage.terrain.crevasses);
    T.carveTrail(true);
    T.placeFeatures(stage);
    setP(0.62, '生成地表材质'); await tick();
    const tex = Tex.terrainSet(Q.tex);
    setP(0.7, '构建山体网格'); await tick();
    const scene = new THREE.Scene();
    scene.add(T.buildMesh(tex));
    setP(0.8, '种植森林、点燃营火'); await tick();
    const q = forMenu ? Object.assign({}, Q, { grass: Math.min(Q.grass, 6000) }) : Q;
    const world = new World(scene, T, stage, { quality: q, shadows: this.S.shadows, tex }, seed);
    setP(0.95, '整理背包'); await tick();
    return { T, scene, world };
  }

  disposeWorld() {
    if (this.world) this.world.dispose();
    this.scene = null; this.world = null; this.terrain = null; this.player = null; this.climber = null;
    this.ropeMesh = null;
  }

  /* ================= 主菜单 ================= */
  async bootMenu() {
    this.state = 'loading';
    const u = this.ui.el;
    u.loadChapter.textContent = ''; u.loadTitle.textContent = '巅峰攀登';
    u.loadTip.textContent = LOAD_TIPS[Math.floor(Math.random() * LOAD_TIPS.length)];
    this.ui.show('loading');
    const idx = Math.min(Save.data.progress.unlocked - 1, STAGES.length - 1);
    const stage = STAGES[idx];
    const setP = (p, t) => { u.loadFill.style.width = Math.round(p * 100) + '%'; if (t) u.loadText.textContent = t; };
    this.disposeWorld();
    const { T, scene, world } = await this.buildWorld(stage, stage.seed, true, setP);
    this.terrain = T; this.scene = scene; this.world = world; this.stage = stage;
    this.weather = new Weather(stage, DIFFICULTIES.normal, stage.seed, 17.6);
    this.weather.hoursPerSec = 0.004;
    // 营地篝火旁坐着的登山者，远眺山谷
    const cl = this.menuClimber = new Climber(this.S.jacket);
    scene.add(cl.group);
    const camp = T.camps[0];
    camp.fireObj.target = 1;
    const gr = T.gradientAt(camp.pos.x, camp.pos.z, 12);
    const gl = gr.len || 1;
    const down = new THREE.Vector3(-gr.dx / gl, 0, -gr.dz / gl);
    const seat = camp.pos.clone().addScaledVector(down, 1.5);
    seat.y = T.getHeight(seat.x, seat.z);
    this.menuView = { camp: camp.pos.clone(), down };
    this.menuDummy = { mode: 'sit', animMode: 'sit', speed: 0, slope: 0, phase: 0, stamina: 100, maxStamina: 100, facing: down.clone(), pos: seat, normal: new THREE.Vector3(0, 1, 0), warmingHands: false };
    this.menuT = 0;
    this.state = 'menu';
    this.updateContinue();
    this.ui.show('menu');
    this.audio.setMood('menu');
  }

  updateContinue() {
    const run = Save.data.run, b = $('btnContinue');
    b.classList.toggle('hidden', !run);
    if (run) $('continueInfo').textContent = `${STAGES[run.stageIdx].name}${run.free ? '（自由）' : ''} · ${run.campName || ''} · 第 ${Math.floor((run.hour || 0) / 24) + 1} 天`;
  }

  updateMenu(dt) {
    this.menuT += dt;
    const T = this.terrain, st = T.start, t = this.menuT;
    this.weather.update(dt, 0.1);
    const V = this.menuView, d = V.down;
    const side = new THREE.Vector3(-d.z, 0, d.x);
    const sw = Math.sin(t * 0.05) * 1.5;
    const cp = this.camera.position;
    cp.copy(V.camp).addScaledVector(d, -5.5).addScaledVector(side, 2.5 + sw);
    cp.y = Math.max(T.getHeight(cp.x, cp.z), V.camp.y) + 2.6;
    const look = V.camp.clone().addScaledVector(d, 60).addScaledVector(side, -8);
    look.y = V.camp.y - 6;
    this.camera.lookAt(look);
    this.menuClimber.update(dt, this.menuDummy, 0);
    this.world.update(dt, null, this.weather, this.camera, this.menuView.camp);
    this.audio.setAmbience(0.15, 0, 0.6, 0.3);
    this.audio.updateMusic();
    this.audio.ambientTick(dt, { forest: true, night: this.world.night > 0.5 });
    this.post.u.uWarm.value = 0.5; this.post.u.uExposure.value = 1.0; this.post.u.uCold.value = 0; this.post.u.uHurt.value = 0; this.post.u.uLowStam.value = 0; this.post.u.uHypoxia.value = 0; this.post.u.uFilter.value = 0;
  }

  toMenu() {
    this.unlockPointer();
    this.overlay = null;
    $('campMenu').classList.add('hidden'); $('photoUI').classList.add('hidden'); $('hud').classList.add('hidden');
    this.bootMenu();
  }

  /* ================= 开始章节 ================= */
  fadeTo(v, dur = 0.6) {
    const f = $('fade'); f.style.transition = `opacity ${dur}s`; f.style.opacity = v;
    return new Promise(r => setTimeout(r, dur * 1000));
  }

  async startStage(idx, opts = {}) {
    this.audio.init(); this.audio.resume();
    await this.fadeTo(1, 0.4);
    this.unlockPointer();
    this.state = 'loading'; this.overlay = null;
    $('hud').classList.add('hidden'); $('campMenu').classList.add('hidden'); $('photoUI').classList.add('hidden');
    const base = STAGES[idx];
    const free = !!opts.free, seed = opts.seed || base.seed;
    const stage = free ? Object.assign({}, base, { name: base.name + '·野', chapter: '自由攀登', journals: [] }) : base;
    this.stageIdx = idx; this.freeMode = free; this.seed = seed; this.stage = stage;
    this.diff = DIFFICULTIES[opts.resume ? opts.resume.difficulty : this.S.difficulty] || DIFFICULTIES.normal;
    const u = this.ui.el;
    u.loadChapter.textContent = stage.chapter; u.loadTitle.textContent = stage.name;
    u.loadTip.textContent = '💡 ' + LOAD_TIPS[Math.floor(Math.random() * LOAD_TIPS.length)];
    this.ui.show('loading');
    await this.fadeTo(0, 0.3);
    const setP = (p, t) => { u.loadFill.style.width = Math.round(p * 100) + '%'; if (t) u.loadText.textContent = t; };
    this.disposeWorld();
    this.menuClimber = null;
    const { T, scene, world } = await this.buildWorld(stage, seed, false, setP);
    this.terrain = T; this.scene = scene; this.world = world;
    this.weather = new Weather(stage, this.diff, seed, stage.startHour);
    this.rockfall = new RockfallSystem(scene, T, stage.rockfall * this.diff.weather, seed);
    this.climber = new Climber(this.S.jacket);
    scene.add(this.climber.group);
    this.player = new Player(this);
    const st = T.start;
    this.startFire = world.addStartFire(new THREE.Vector3(st.x + 1.5, T.getHeight(st.x + 1.5, st.z - 0.5), st.z - 0.5));
    this.startFire.fireObj.target = 1;
    this.player.respawn(new THREE.Vector3(st.x, st.y, st.z + 2));
    this.respawnCamp = null; this.respawnPoint = this.player.pos.clone();
    this.lives = this.diff.lives; this.time = 0; this.won = false; this.hurtFlash = 0;
    this.blizzOut = 0; this.seenT = 0; this.campCloseT = 0; this.tentFlag = false; this.stepIdx = 0;
    this.cam.yaw = Math.PI; this.cam.pitch = 0.28; this.cam.dist = 6.5; this.cam.curDist = 6.5;
    this.cam.target.copy(this.player.pos).add(new THREE.Vector3(0, 1.4, 0));
    this.buildTreeGrid();
    this.ropeMesh = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshStandardMaterial({ color: 0xe8702a, roughness: 0.7 }));
    this.ropeMesh.castShadow = true; this.ropeMesh.frustumCulled = false; scene.add(this.ropeMesh);
    setP(0.97, '绘制地图');
    await new Promise(r => setTimeout(r, 0));
    this.ui.buildMapBase(T);
    this.ui.buildHotbar(this.player);
    this.ui.setupAltTrack(T, stage);
    this.setupCompass();
    $('hudChapter').textContent = stage.chapter; $('hudStage').textContent = stage.name;
    if (opts.resume) this.applyRun(opts.resume);
    setP(1, '出发！');
    const begin = async () => {
      await this.fadeTo(1, 0.3);
      this.ui.hideAll();
      $('hud').classList.remove('hidden');
      this.state = 'play';
      this.clock.getDelta();
      this.fadeTo(0, 1.2);
      this.ui.big(stage.name, stage.chapter);
      if (!opts.resume) {
        this.ui.msg(`${stage.tagline}`, 'info');
        this.ui.msg(`难度「${this.diff.name}」· 峰顶海拔 ${Math.round(stage.altBase + T.summit.y * stage.altScale)} m`, 'info');
      } else this.ui.msg('从营地继续远征', 'good');
      setTimeout(() => this.ui.tip('move'), 2500);
      setTimeout(() => this.ui.tip('trail'), 12000);
    };
    if (idx === 0 && !free && !opts.resume && !Save.data.tips.introSeen) {
      Save.data.tips.introSeen = 1; Save.write();
      this.state = 'story';
      this.ui.playStory(STORY.intro, begin);
    } else begin();
  }

  buildTreeGrid() {
    this.treeGrid = new Map();
    for (const t of this.world.treeColliders || []) {
      const k = Math.floor(t.x / 8) + ',' + Math.floor(t.z / 8);
      if (!this.treeGrid.has(k)) this.treeGrid.set(k, []);
      this.treeGrid.get(k).push(t);
    }
  }
  treesNear(x, z) { return this.treeGrid ? this.treeGrid.get(Math.floor(x / 8) + ',' + Math.floor(z / 8)) : null; }

  setupCompass() {
    const T = this.terrain, P = () => this.player;
    const marks = [{ icon: '⛳', pos: () => T.summit }];
    marks.push({ icon: '⛺', pos: () => { const c = this.nextCamp(); return c ? c.pos : T.summit; }, hidden: () => !this.nextCamp() });
    marks.push({ icon: '📖', pos: () => { const j = this.nearestOf(T.journals, x => !x.taken && x.seen); return j ? j.pos : T.summit; }, hidden: () => !this.nearestOf(T.journals, x => !x.taken && x.seen) });
    marks.push({ icon: '📷', pos: () => { const v = this.nearestOf(T.viewpoints, x => !x.done && x.seen); return v ? v.pos : T.summit; }, hidden: () => !this.nearestOf(T.viewpoints, x => !x.done && x.seen) });
    this.ui.setCompassMarks(marks);
  }
  nextCamp() { const T = this.terrain, P = this.player; return T.camps.filter(c => c.fixed && !c.visited).sort((a, b) => a.trailIdx - b.trailIdx)[0] || null; }
  nearestOf(list, filter) {
    const p = this.player.pos; let best = null, bd = 1e9;
    for (const it of list) { if (!filter(it)) continue; const d = Math.hypot(it.pos.x - p.x, it.pos.z - p.z); if (d < bd) { bd = d; best = it; } }
    return best;
  }

  objectiveList() {
    const T = this.terrain, st = this.stage;
    const list = [{ text: '登顶', val: this.won ? '' : '', done: this.won }];
    if (T.journals.length) list.push({ text: '日志', val: `${T.journals.filter(j => j.taken).length}/${T.journals.length}`, done: T.journals.every(j => j.taken) });
    list.push({ text: '观景点', val: `${T.viewpoints.filter(v => v.done).length}/${T.viewpoints.length}`, done: T.viewpoints.every(v => v.done) });
    list.push({ text: '补给包', val: `${T.stashes.filter(s => s.taken).length}/${T.stashes.length}`, done: T.stashes.every(s => s.taken) });
    list.push({ text: '用时', val: `${fmtTime(this.time)} / ${fmtTime(st.par)}`, done: false });
    return list;
  }

  /* ================= 主循环 ================= */
  loop() {
    requestAnimationFrame(this.loop);
    const dt = Math.min(0.05, this.clock.getDelta());
    this.pollGamepad();
    if (this.state === 'menu' && this.world) this.updateMenu(dt);
    else if (this.state === 'play') this.updatePlay(dt);
    else if (this.state === 'summit') this.updateSummit(dt);
    if (this.scene) {
      if (this.post.enabled) this.post.render(this.scene, this.camera);
      else this.renderer.render(this.scene, this.camera);
    }
    if (this.photoPending) { this.photoPending = false; this.capturePhoto(); }
  }

  pause() { if (this.state !== 'play') return; this.state = 'pause'; this.unlockPointer(); this.fillPauseStats(); this.ui.show('pause'); this.audio.setAmbience(0, 0, 0, 0); this.audio.setSlide(0); }
  resume() { if (this.state !== 'pause') return; this.ui.hideAll(); this.state = 'play'; this.clock.getDelta(); }
  fillPauseStats() {
    const P = this.player, st = this.stage;
    $('pauseStats').innerHTML = [['章节', `${st.chapter} · ${st.name}`], ['难度', this.diff.name], ['用时', fmtTime(this.time)], ['最高海拔', `${Math.round(st.altBase + P.stats.maxAlt * st.altScale)} m`], ['坠落', P.stats.falls], ['登顶岩壁', P.stats.walls], ['行走距离', `${(P.stats.distance / 1000).toFixed(2)} km`], ['生命', this.lives === Infinity ? '∞' : this.lives]].map(([k, v]) => `<div><span>${k}</span><b>${v}</b></div>`).join('');
  }

  updatePlay(dt) {
    if (this.overlay === 'map' || this.overlay === 'journal') { if (this.take('KeyM') && this.overlay === 'map') this.closeMap(); if (this.take('KeyE') && this.overlay === 'journal') this.closeJournal(); return; }
    if (this.overlay === 'photo') return this.updatePhoto(dt);
    const P = this.player, T = this.terrain, W = this.weather, u = this.ui;
    if (!this.won) this.time += dt;
    this.gatherInput();
    // 快捷键
    if (this.overlay !== 'camp') for (let k = 0; k < HOTBAR.length; k++) if (this.take('Digit' + (k + 1)) || this.take('Numpad' + (k + 1))) this.useHotbar(HOTBAR[k]);
    if (this.take('KeyL')) this.toggleLamp();
    if (this.take('KeyM')) return this.openMap();
    if (this.take('KeyF')) return this.openPhoto();
    if (this.take('KeyT')) this.tryPitchTent();
    if (this.take('KeyR')) this.returnToCamp();
    // 天气
    const altF = P.pos.y / T.summit.y;
    W.update(dt, altF);
    for (const ev of W.events) {
      if (ev === 'warn') { u.msg('远处传来呼啸声……暴风雪即将来临！尽快找营地或搭帐篷', 'warn'); this.audio.warn(); }
      if (ev === 'start') { u.big('暴风雪', '能见度极低'); u.msg('暴风雪来袭：跟着路标走，或者原地扎营', 'warn'); this.blizzOut = 0; this.blizzAtCamp = false; }
      if (ev === 'end') { u.msg('暴风雪过去了', 'good'); if (this.blizzOut > 30 && !this.blizzAtCamp) this.achieve('blizzard'); }
    }
    W.events.length = 0;
    if (W.blizzard) { if (P.mode === 'camp' || P.mode === 'sleep') this.blizzAtCamp = true; else this.blizzOut += dt; }
    // 营地/营火检测
    this.detectCamps(dt);
    // 玩家
    this.handleInteract(dt);
    P.update(dt, this.input, W);
    this.input.jumpPressed = false; this.input.jumpReleased = false; this.input.interact = false; this.input.piton = false;
    this.handlePlayerEvents();
    // 落石
    this.rockfall.update(dt, P, (rk, spd) => {
      P.hurt(14 + rk.r * 14 + spd * 0.5, 'rock');
      if (P.mode === 'wall') P.fallFromWall('rock');
      else if (P.alive && P.mode !== 'camp') { P.vel.copy(rk.vel).multiplyScalar(0.5); P.vel.y += 3; P.mode = 'air'; P.pos.y += 0.1; }
      u.msg('被落石击中！', 'warn');
    });
    for (const ev of this.rockfall.events) {
      if (ev.type === 'spawn') { u.big('落石！'); u.msg('⚠ 上方有落石滚下，注意躲避！', 'warn'); this.audio.rockWarn(); }
      if (ev.type === 'bounce') { this.world.puff(ev.pos, 2.5); if (ev.pos.distanceTo(P.pos) < 40) this.audio.land(clamp(ev.v / 10, 0, 1)); }
    }
    this.rockfall.events.length = 0;
    this.checkPickups(dt);
    // 登顶
    if (!this.won && P.alive && Math.hypot(P.pos.x - T.summit.x, P.pos.z - T.summit.z) < 5 && Math.abs(P.pos.y - T.summit.y) < 3 && P.mode !== 'wall') this.reachSummit();
    // 死亡
    if (P.mode === 'dead' && P.deadTimer > 2.8 && !this.respawning) this.handleDeath();
    this.climber.update(dt, P, this.cam.yaw);
    this.climber.setLamp(P.lamp);
    this.updateCamera(dt);
    this.updateLamp();
    this.updateRope();
    this.world.update(dt, P, W, this.camera, P.pos);
    this.updateAudio(dt);
    this.updatePost(dt);
    this.updatePrompts();
    this.ui.updateHud(dt);
    this.checkTips(dt);
    if (this.overlay === 'camp') this.updateCampMenu(dt);
    if (this.stage.aurora && this.world.sky.aurU && this.world.sky.aurU.uAlpha.value > 0.5 && P.pos.y > T.summit.y * 0.3) this.achieve('aurora');
  }

  /* ================= 营地 ================= */
  detectCamps(dt) {
    const P = this.player, T = this.terrain;
    P.atCamp = null; P.nearFire = false;
    for (const c of this.world.fires) {
      const d = Math.hypot(P.pos.x - c.pos.x, P.pos.z - c.pos.z);
      if (d < 4.5 && Math.abs(P.pos.y - c.pos.y) < 3 && c.fireObj.lit > 0.5) P.nearFire = true;
    }
    for (const c of T.camps) {
      const d = Math.hypot(P.pos.x - c.pos.x, P.pos.z - c.pos.z);
      if (d < 7.5 && Math.abs(P.pos.y - c.pos.y) < 4) {
        P.atCamp = c;
        if (!c.visited) {
          c.visited = true; P.stats.camps++;
          this.ui.big(c.name, '营地'); this.ui.msg(`到达${c.name}：复活点已更新`, 'good'); this.audio.camp();
          this.ui.tip('camp');
        }
        if (P.alive) { this.respawnCamp = c; this.respawnPoint.copy(c.pos).add(new THREE.Vector3(1.5, 0, 2.5)); }
      }
    }
    // 离开后火慢慢熄灭
    for (const c of this.world.fires) {
      if (c.fireObj.target > 0.3 && P.atCamp !== c) { c.fireT = (c.fireT || 0) + dt; if (c.fireT > 60) { c.fireObj.target = c.fixed ? 0.25 : 0.1; c.fireT = 0; } }
      else c.fireT = 0;
    }
  }

  openCamp(camp) {
    const P = this.player;
    this.overlay = 'camp'; this.campRef = camp;
    this.unlockPointer();
    const f = camp.pos;
    const ang = Math.atan2(P.pos.x - f.x, P.pos.z - f.z);
    P.pos.set(f.x + Math.sin(ang) * 1.5, 0, f.z + Math.cos(ang) * 1.5); P.pos.y = this.terrain.getHeight(P.pos.x, P.pos.z);
    P.facing.set(-Math.sin(ang), 0, -Math.cos(ang));
    P.mode = 'camp'; P.warmingHands = true; P.vel.set(0, 0, 0);
    $('campMenu').classList.remove('hidden'); $('hud').classList.add('camp-open');
    this.campAng = ang;
    this.buildCampMenu();
    this.audio.setMood('camp');
  }
  closeCamp() {
    if (this.overlay !== 'camp') return;
    this.overlay = null; $('campMenu').classList.add('hidden'); $('hud').classList.remove('camp-open');
    const P = this.player; if (P.mode === 'camp') P.mode = 'walk';
    P.stargazing = false; P.warmingHands = false;
    this.campRef.pot.visible = false;
  }
  buildCampMenu() {
    const c = this.campRef, P = this.player, W = this.weather, f = c.fireObj;
    const lit = f.target > 0.8;
    const night = this.world.night > 0.5;
    const h = W.hour % 24;
    const sleepLabel = (h >= 17 || h < 5) ? '睡到天亮（06:00）' : '小睡两小时';
    const acts = [
      { ic: '🔥', t: lit ? '营火正旺' : '生火', s: lit ? '靠近营火可以驱寒' : (c.fixed ? '营地有现成的柴火' : `消耗 1 柴火（剩余 ${P.inv.wood}）`), en: !lit && (c.fixed || P.inv.wood > 0), fn: () => this.lightFire(c) },
      { ic: '🍜', t: '煮一碗速食面', s: `饥饿 −60 · 寒冷 −30（剩余 ${P.inv.noodle}）`, en: lit && P.inv.noodle > 0, fn: () => this.cook(c) },
      { ic: '🫖', t: '烧水续满热茶', s: `热茶 ${P.inv.thermos}/${P.thermosMax}`, en: lit && P.inv.thermos < P.thermosMax, fn: () => { P.inv.thermos = P.thermosMax; this.audio.drink(); this.ui.msg('保温壶续满了热茶', 'good'); this.buildCampMenu(); } },
      { ic: '🩹', t: '处理伤口', s: `伤势 −30（绷带 ${P.inv.bandage}）`, en: P.inv.bandage > 0 && P.aff.injury > 1, fn: () => { P.useItem('bandage'); this.buildCampMenu(); } },
      { ic: '⛺', t: sleepLabel, s: '清除疲惫与寒冷，恢复伤势，并存档', en: true, fn: () => this.sleep(c) },
      { ic: '✨', t: '仰望星空', s: night ? (this.stage.aurora ? '今晚也许能看到极光' : '夜空中的银河') : '等天黑以后再来', en: night && W.intensity < 0.5, fn: () => this.stargaze() },
    ];
    const wrap = $('campActions'); wrap.innerHTML = '';
    acts.forEach((a, i) => {
      const b = document.createElement('button'); b.className = 'cact'; b.disabled = !a.en;
      b.innerHTML = `<span class="ic">${a.ic}</span><span>${a.t}<small>${a.s}</small></span><kbd>${i + 1}</kbd>`;
      b.addEventListener('click', () => { this.audio.click(); a.fn(); });
      wrap.appendChild(b);
    });
    this.campActs = acts;
    $('campTitle').textContent = c.name; $('campSub').textContent = `${fmtClock(W.hour)} · 第 ${W.day} 天 · ${Math.round(P.tempC || 0)}°C`;
    this.campMenuT = 0.5;
  }
  updateCampMenu(dt) {
    for (let k = 1; k <= 6; k++) if (this.pressed.has('Digit' + k)) { this.pressed.delete('Digit' + k); const a = this.campActs && this.campActs[k - 1]; if (a && a.en) { this.audio.click(); a.fn(); } }
    this.campMenuT -= dt;
    if (this.campMenuT <= 0) this.buildCampMenu();
    const P = this.player;
    $('campStatus').textContent = P.nearFire ? '🔥 正在取暖' : '';
  }
  lightFire(c) {
    const P = this.player;
    if (!c.fixed) { if (P.inv.wood <= 0) return; P.inv.wood--; }
    c.fireObj.target = 1; c.fireT = 0;
    this.audio.ignite(); this.ui.msg('营火噼啪作响，温暖起来了', 'good');
    this.buildCampMenu();
  }
  cook(c) {
    const P = this.player;
    if (P.inv.noodle <= 0) return;
    P.inv.noodle--; P.aff.hunger = Math.max(0, P.aff.hunger - 60); P.aff.cold = Math.max(0, P.aff.cold - 30);
    c.pot.visible = true;
    this.audio.eat(); this.ui.msg('热腾腾的一碗面下肚，浑身都暖和了', 'good');
    this.achieve('chef');
    this.buildCampMenu();
  }
  async sleep(c) {
    const P = this.player, W = this.weather;
    $('campMenu').classList.add('hidden');
    this.audio.zip();
    await this.fadeTo(1, 1.0);
    const h = W.hour % 24;
    const added = (h >= 17 || h < 5) ? W.skipTo(6) : (W.hour += 2, 2);
    P.aff.fatigue = 0; P.aff.cold = 0; P.aff.injury = Math.max(0, P.aff.injury - 35); P.aff.hunger = Math.min(90, P.aff.hunger + added * 1.6); P.aff.hypoxia = 0;
    P.recomputeMax(); P.stamina = P.maxStamina;
    if (c.custom) this.achieve('camper');
    this.respawnCamp = c;
    this.saveRun();
    this.ui.big(`${fmtClock(W.hour)}`, `第 ${W.day} 天`);
    await new Promise(r => setTimeout(r, 900));
    this.fadeTo(0, 1.4);
    $('campMenu').classList.remove('hidden');
    this.ui.msg(`睡了 ${Math.round(added)} 小时，精神焕发。进度已保存`, 'good');
    this.buildCampMenu();
  }
  stargaze() {
    const P = this.player;
    P.stargazing = true; this.stargazeT = 9;
    this.achieve('stargazer');
    this.ui.msg(this.stage.aurora ? '极光在夜空中缓缓舞动……' : '银河横跨夜空，星星多得数不清', 'info');
  }
  tryPitchTent() {
    const P = this.player, T = this.terrain;
    if (P.mode !== 'walk' || this.overlay) return;
    if (P.inv.tent <= 0) { this.ui.msg('你没有帐篷', 'warn'); return; }
    const base = Math.atan2(P.facing.x, P.facing.z);
    let cx = 0, cz = 0, fx = 0, fz = 0, reason = 'steep';
    for (const off of [0, 0.8, -0.8, 1.6, -1.6, 2.4, -2.4, Math.PI]) {
      const a = base + off;
      fx = Math.sin(a); fz = Math.cos(a);
      const x = P.pos.x + fx * 2.8, z = P.pos.z + fz * 2.8;
      let maxS = 0;
      for (const [ox, oz] of [[0, 0], [2.5, 0], [-2.5, 0], [0, 2.5], [0, -2.5]]) maxS = Math.max(maxS, T.getSlopeDeg(x + ox, z + oz));
      if (maxS > 26) continue;
      if (T.camps.some(c => !c.custom && Math.hypot(c.pos.x - x, c.pos.z - z) < 25)) { reason = 'camp'; continue; }
      if (T.inCrevasse(x, z, 4) || T.nearWallFace(x, z) || T.getHeight(x, z) < T.waterY + 0.5 || T.trailMaskAt(x, z) > 0.5) { reason = 'bad'; continue; }
      cx = x; cz = z; reason = null; break;
    }
    if (reason) { this.ui.msg(reason === 'camp' ? '附近已经有营地了' : reason === 'bad' ? '这里不适合扎营（离开步道、冰裂缝和岩壁）' : '这里太陡了，找块平缓些的地方再搭帐篷', 'warn'); return; }
    P.mode = 'kneel'; this.audio.tent();
    this.ui.msg('正在搭帐篷……', 'info');
    setTimeout(() => {
      if (!this.player || this.player !== P) return;
      const camp = this.world.pitchTent(new THREE.Vector3(cx, 0, cz), Math.atan2(fx, fz));
      P.pos.y = T.groundHeight(P.pos.x, P.pos.z);
      P.mode = 'walk';
      this.respawnCamp = camp; this.respawnPoint.copy(camp.pos).add(new THREE.Vector3(1.5, 0, 1.5));
      this.ui.big('我的营地', '帐篷已搭好');
      this.tentFlag = true;
      this.openCamp(camp);
    }, 2200);
  }

  returnToCamp() {
    const P = this.player;
    if (!P.alive || this.overlay || P.mode === 'kneel') return;
    P.respawn(this.respawnPoint, true);
    this.weather.hour += 1; P.aff.fatigue = Math.min(100, P.aff.fatigue + 5);
    this.ui.msg('回到了营地（时间流逝 1 小时）', 'info');
  }

  /* ================= 互动 ================= */
  handleInteract(dt) {
    const P = this.player, T = this.terrain, i = this.input;
    if (this.overlay === 'camp') {
      if (this.stargazeT > 0) { this.stargazeT -= dt; if (this.stargazeT <= 0) P.stargazing = false; }
      if (i.interact) { i.interact = false; this.closeCamp(); }
      return;
    }
    if (!i.interact || !P.alive) return;
    if (P.mode === 'wall' || P.mode === 'rope') return; // 交给玩家逻辑
    const j = this.nearJournal();
    if (j) { i.interact = false; return this.readJournal(j); }
    if (P.atCamp && (P.mode === 'walk')) { i.interact = false; return this.openCamp(P.atCamp); }
    const g = P.canGrabWall();
    if (g) { i.interact = false; P.enterWall(g); this.ui.tip('piton'); }
  }
  nearJournal() { const P = this.player; return this.terrain.journals.find(j => !j.taken && Math.hypot(j.pos.x - P.pos.x, j.pos.z - P.pos.z) < 2.4 && Math.abs(j.pos.y - P.pos.y) < 2.5); }
  readJournal(j) {
    j.taken = true; j.group.visible = false;
    Save.data.journals[j.id] = 1; Save.write();
    this.audio.page();
    this.overlay = 'journal'; this.unlockPointer();
    this.ui.showJournal(j.id, false);
    if (Object.keys(Save.data.journals).length >= JOURNALS.length) this.achieve('journals');
  }
  closeJournal() {
    if (this.ui.journalFromAlbum) { this.ui.journalFromAlbum = false; this.ui.back(); return; }
    this.ui.hideAll(); this.overlay = null; this.clock.getDelta();
  }

  updatePrompts() {
    const P = this.player, u = this.ui;
    let pr = null, hint = null;
    if (!P.alive) { u.prompt(null); u.hint(null); return; }
    if (this.overlay === 'camp') pr = null;
    else if (P.mode === 'wall') {
      pr = `<kbd>WASD</kbd>移动 <kbd>Q</kbd>岩钉 ×${P.inv.piton} <kbd>空格</kbd>蓄力跳 <kbd>E</kbd>${P.hold && P.hold.y < 2.2 ? '下到地面' : '松手'}`;
      hint = P.wallHint || (P.hold && P.hold.type === HOLD.LOOSE ? '⚠ 松动的岩块！快移开' : P.hold && P.hold.type === HOLD.SLOPER && P.hold.hangT > 2.5 ? '斜面点快抓不住了！' : P.hold && P.hold.type === HOLD.JUG && P.stamina < P.maxStamina - 1 ? '大把手：可以在这里休息恢复体力' : null);
      if (P.action && P.action.type === 'piton') hint = '正在打岩钉……';
    } else if (P.mode === 'rope') { pr = '<kbd>W</kbd>重新抓岩 <kbd>S</kbd>放绳下降'; hint = P.wallHint || '被绳索拉住了！可以在这里喘口气'; }
    else if (P.mode === 'slide') hint = '按住 <kbd>空格</kbd> 用冰镐制动！';
    else if (P.mode === 'scramble' && P.stamina < P.maxStamina * 0.25) hint = '体力告急！找个缓一点的地方休息';
    else {
      if (this.nearJournal()) pr = '<kbd>E</kbd>拾起并阅读日志';
      else if (P.atCamp && P.mode === 'walk') pr = `<kbd>E</kbd>进入营地 · ${P.atCamp.name}`;
      else { const g = (P.mode === 'walk' || P.mode === 'scramble') && P.canGrabWall(); if (g) pr = g.from === 'top' ? '<kbd>E</kbd>从岩壁顶端向下攀爬' : `<kbd>E</kbd>开始攀岩 · ${g.wall.name}`; }
      const vp = this.nearViewpoint();
      if (!pr && vp) pr = '<kbd>F</kbd>在观景点拍照';
      if (P.freezing) hint = '冻僵了！';
      else if (P.aff.cold > 45 && !P.nearFire) hint = '太冷了！喝热茶（2）或者找营地生火';
      else if (P.aff.hunger > 45) hint = '好饿……吃点东西（1）';
      else if (P.aff.hypoxia > 25) hint = '缺氧！使用氧气瓶（5）或尽快下撤';
    }
    u.prompt(pr); u.hint(hint);
  }
  nearViewpoint() { const P = this.player; return this.terrain.viewpoints.find(v => !v.done && Math.hypot(v.pos.x - P.pos.x, v.pos.z - P.pos.z) < 7); }

  checkPickups(dt) {
    const P = this.player, T = this.terrain, u = this.ui;
    if (!P.alive) return;
    for (const s of T.stashes) {
      if (s.taken) continue;
      if (Math.hypot(P.pos.x - s.pos.x, P.pos.z - s.pos.z) < 1.8 && Math.abs(P.pos.y - s.pos.y) < 2.5) {
        s.taken = true; s.group.visible = false;
        const loot = this.rollLoot(s.bonus);
        for (const k in loot) { P.inv[k] = (P.inv[k] || 0) + loot[k]; this.ui.flashSlot(k); }
        u.msg('补给包：' + Object.entries(loot).map(([k, n]) => `${ITEMS[k].name} ×${n}`).join('，'), 'good');
        this.audio.pickup();
        if (T.stashes.every(x => x.taken)) this.achieve('hoarder');
      }
    }
    for (const f of T.firewood) {
      if (f.taken) continue;
      if (Math.hypot(P.pos.x - f.pos.x, P.pos.z - f.pos.z) < 1.8 && Math.abs(P.pos.y - f.pos.y) < 2.5) {
        f.taken = true; f.group.visible = false; P.inv.wood += 2; this.ui.flashSlot('wood');
        u.msg('捡到柴火 ×2', 'good'); this.audio.pickup();
      }
    }
    // 发现
    this.seenT -= dt;
    if (this.seenT <= 0) {
      this.seenT = 0.5;
      for (const list of [T.journals, T.stashes, T.viewpoints, T.firewood]) for (const it of list) if (!it.seen && it.pos.distanceTo(P.pos) < 70) it.seen = true;
      if (this.nearViewpoint()) u.tip('photo');
    }
  }
  rollLoot(bonus) {
    const st = this.stage, rnd = Math.random;
    const table = [['bar', 4], ['bandage', 2], ['chalk', 2], ['piton', 3], ['noodle', 2], ['battery', 1], ['wood', 1]];
    if (st.key === 'frost') table.push(['oxygen', 2]);
    const P = this.player; if (P.inv.thermos < P.thermosMax) table.push(['thermos', 2]);
    const total = table.reduce((s, x) => s + x[1], 0);
    const loot = {};
    const n = bonus ? 4 : 2 + (rnd() < 0.4 ? 1 : 0);
    for (let k = 0; k < n; k++) {
      let r = rnd() * total;
      for (const [key, w] of table) { r -= w; if (r <= 0) { loot[key] = (loot[key] || 0) + (key === 'piton' ? 2 : 1); break; } }
    }
    if (loot.thermos) { loot.thermos = Math.min(loot.thermos * 3, P.thermosMax - P.inv.thermos); if (loot.thermos <= 0) delete loot.thermos; }
    return loot;
  }

  useHotbar(key) {
    const P = this.player;
    if (this.overlay === 'camp') return;
    if (P.useItem(key)) {
      this.ui.flashSlot(key);
      const A = this.audio;
      if (key === 'bar') A.eat(); else if (key === 'thermos') A.drink(); else if (key === 'oxygen') A.burst(1500, 0.5, 0.8, 0.2, 'highpass', 0.1); else A.zip();
      this.ui.msg(`使用了${ITEMS[key].name}`, 'good');
    }
  }
  toggleLamp() {
    const P = this.player;
    if (!P.lamp && P.battery <= 0) { if (P.inv.battery > 0) { P.inv.battery--; P.battery = 100; } else { this.ui.msg('头灯没电了', 'warn'); return; } }
    P.lamp = !P.lamp; this.audio.click();
  }

  handlePlayerEvents() {
    const P = this.player, u = this.ui, A = this.audio;
    for (const ev of P.events) {
      const d = ev.data;
      switch (ev.type) {
        case 'grab': A.grab(); break;
        case 'reach': A.reach(); break;
        case 'foot': A.step(2, false); break;
        case 'hammer': A.hammer(); break;
        case 'piton': {
          const m = Models.piton(); m.position.copy(d.pit.pos); m.lookAt(d.pit.pos.clone().add(d.pit.nrm)); this.scene.add(m);
          u.msg(`岩钉已打入（剩余 ${P.inv.piton}）`, 'good'); this.ui.flashSlot('piton');
          if (P.stats.pitons === 1) setTimeout(() => u.tip('dyno'), 4000);
          break;
        }
        case 'noPiton': u.msg('没有岩钉了', 'warn'); break;
        case 'crumble': A.crumble(); this.world.puff(d.pos, 1.2); u.msg('岩块碎了！', 'warn'); break;
        case 'wallFall': A.gripLost(); u.big('坠落！'); u.msg(d.reason === 'stamina' ? '体力耗尽，手滑了！' : d.reason === 'dyno' ? '跳跃失手了！' : d.reason === 'crumble' ? '抓着的岩块碎了！' : d.reason === 'letgo' ? '松开了岩壁' : '从岩壁上掉了下来！', 'warn'); break;
        case 'ropeCatch': A.ropeCatch(); u.msg('绳索拉住了你！', 'good'); this.achieve('saved_by_rope'); break;
        case 'lowered': u.msg('安全回到地面', 'good'); break;
        case 'dyno': A.dyno(); break;
        case 'dynoOK': u.msg('漂亮的飞跃！', 'good'); this.achieve('dyno'); break;
        case 'dynoFail': if (d.noTarget) u.msg('那个方向没有可以跳过去的岩点', 'warn'); break;
        case 'mantle': A.grab(); break;
        case 'topout': {
          u.big('登顶岩壁', d.wall.name); A.camp(); this.achieve('first_wall');
          if (d.freeSolo && d.wall.H >= 20) this.achieve('free_solo');
          Save.data.stats.walls++; Save.write();
          break;
        }
        case 'dismount': break;
        case 'downclimb': u.msg('小心地向下攀爬', 'info'); break;
        case 'gripLost': u.big('滑坠！'); A.gripLost(); u.msg(d.reason === 'stamina' ? '体力耗尽，脱手滑坠！按住空格制动' : d.reason === 'ice' ? '冰面打滑！按住空格制动' : '太陡了，抓不住！按住空格制动', 'warn'); u.tip('slide'); break;
        case 'regrab': A.grab(); if (d.drop > 3) u.msg(`重新抓稳了，滑落 ${Math.round(d.drop)} 米`, 'good'); break;
        case 'recover': if (d.drop > 3) u.msg(`滑落了 ${Math.round(d.drop)} 米后停了下来`, 'info'); break;
        case 'land': if (d.dmg > 0) u.msg(`摔伤了 −${Math.round(d.dmg)}`, 'warn'); else if (d.impact > 3) A.land(d.impact / 12); break;
        case 'damage': this.hurtFlash = 1; A.hit(d.amount / 40); break;
        case 'dead': {
          u.big('倒下了'); A.death();
          const why = { cold: '体温过低，冻僵了……', hunger: '饥饿和虚弱让你倒下了……', fatigue: '筋疲力尽，倒在了雪地里……', hypoxia: '严重缺氧，失去了意识……', rock: '被落石击中……', slide: '高速滑坠撞上了岩石……', fall: '坠落伤势过重……', rope: '绳索冲击伤势过重……' }[d.why] || '伤势过重……';
          u.msg(why, 'warn'); Save.data.stats.deaths++; Save.write();
          break;
        }
        case 'jump': A.burst(600, 1, 0.1, 0.12, 'lowpass'); break;
        case 'lunge': A.lunge(); break;
        case 'crevasse': this.fallCrevasse(); break;
        case 'battery': u.msg('换上了新电池', 'info'); break;
        case 'lampDead': u.msg('头灯没电了！', 'warn'); break;
        case 'used': break;
        case 'noItem': u.msg(`没有${ITEMS[d.key].name}了`, 'warn'); break;
      }
    }
    P.events.length = 0;
  }

  async fallCrevasse() {
    if (this.respawning) return;
    this.respawning = true;
    const P = this.player;
    this.ui.big('掉进冰裂缝！'); this.audio.death();
    P.hurt(32, 'fall');
    await this.fadeTo(1, 0.5);
    if (P.alive) { P.respawn(P.lastSafe, true); this.ui.msg('艰难地爬出了冰裂缝……下次走梯子桥吧', 'warn'); }
    this.respawning = false;
    this.fadeTo(0, 0.8);
  }

  async handleDeath() {
    this.respawning = true;
    await this.fadeTo(1, 1.0);
    if (this.lives !== Infinity) this.lives--;
    if (this.lives <= 0) { this.respawning = false; this.finish(false); this.fadeTo(0, 0.5); return; }
    this.player.respawn(this.respawnPoint);
    this.ui.msg(`在${this.respawnCamp ? this.respawnCamp.name : '登山口'}醒来${this.lives === Infinity ? '' : `（剩余生命 ${this.lives}）`}`, 'warn');
    this.respawning = false;
    this.fadeTo(0, 1.2);
  }

  /* ================= 登顶 ================= */
  reachSummit() {
    this.won = true;
    const P = this.player, W = this.weather;
    P.mode = 'cheer'; P.leaveWall();
    this.state = 'summit'; this.summitT = 0; this.overlay = null;
    $('campMenu').classList.add('hidden');
    this.unlockPointer();
    this.audio.summit(); this.audio.setMood('summit');
    this.ui.big(this.stage.name, '登顶成功');
    const h = W.hour % 24;
    if (h >= 5 && h <= 7.5) this.achieve('sunrise');
    if (h >= 22 || h <= 4) this.achieve('night');
    const dx = P.pos.x - this.terrain.summit.x, dz = P.pos.z - this.terrain.summit.z;
    this.summitYaw = Math.atan2(dx, dz);
  }
  updateSummit(dt) {
    this.summitT += dt;
    const P = this.player, T = this.terrain, t = this.summitT;
    this.weather.update(dt * 0.3, 1);
    this.climber.update(dt, P, this.cam.yaw);
    const a = this.summitYaw + t * 0.12, r = 9 + t * 0.6;
    const cp = this.camera.position;
    cp.set(P.pos.x + Math.sin(a) * r, P.pos.y + 3 + t * 0.35, P.pos.z + Math.cos(a) * r);
    this.camera.lookAt(P.pos.x, P.pos.y + 1.4, P.pos.z);
    this.world.update(dt, P, this.weather, this.camera, P.pos);
    this.audio.updateMusic();
    this.updatePost(dt);
    if (t > 8 && !this.finishing) {
      this.finishing = true;
      const done = () => { this.finishing = false; this.finish(true); };
      if (this.stageIdx === STAGES.length - 1 && !this.freeMode) {
        this.fadeTo(1, 1.5).then(() => { this.state = 'story'; this.ui.playStory(STORY.ending, () => { this.fadeTo(0, 0.5); done(); }); });
      } else done();
    }
  }

  finish(won) {
    const P = this.player, st = this.stage, D = this.diff, T = this.terrain;
    this.state = 'result'; this.unlockPointer();
    $('hud').classList.add('hidden'); $('campMenu').classList.add('hidden');
    Save.data.run = null;
    const journalsAll = T.journals.length ? T.journals.every(j => j.taken) : true;
    const viewsAll = T.viewpoints.every(v => v.done);
    const stars = [won, won && journalsAll && viewsAll, won && this.time <= st.par && P.stats.deaths === 0];
    let score = 0;
    if (won) score = Math.max(0, Math.round((5000 + Math.max(0, st.par * 1.5 - this.time) * 3 + T.stashes.filter(s => s.taken).length * 150 + T.journals.filter(j => j.taken).length * 300 + T.viewpoints.filter(v => v.done).length * 250 + P.stats.walls * 400 - P.stats.falls * 120 - P.stats.deaths * 800) * D.score));
    if (!this.freeMode && won) {
      const rec = Save.stageRecord(st.key);
      rec.stars = rec.stars.map((s, i) => s || stars[i]);
      rec.best = rec.best ? Math.min(rec.best, this.time) : this.time;
      rec.bestScore = Math.max(rec.bestScore || 0, score);
      rec.cleared = true;
      Save.saveStageRecord(st.key, rec);
      Save.data.progress.unlocked = Math.max(Save.data.progress.unlocked, Math.min(STAGES.length, this.stageIdx + 2));
      this.achieve(['ch1', 'ch2', 'ch3'][this.stageIdx]);
    }
    if (won) {
      Save.data.stats.summits++;
      if (P.stats.deaths === 0) this.achieve('flawless');
      if (this.time <= st.par) this.achieve('speed');
      if (D.key === 'extreme') this.achieve('extreme');
    }
    Save.write();
    const u = this.ui.el;
    u.resChapter.textContent = `${st.chapter} · ${D.name}`;
    u.resTitle.textContent = won ? `登顶 ${st.name}！` : '远征失败';
    u.resStars.innerHTML = stars.map((s, i) => `<span class="${s ? 'on' : ''}" style="animation-delay:${0.3 + i * 0.35}s">★</span>`).join('') +
      `<div class="res-stars-labels"><span class="${stars[0] ? 'on' : ''}">登顶</span><span class="${stars[1] ? 'on' : ''}">全部日志与观景点</span><span class="${stars[2] ? 'on' : ''}">标准用时内无死亡</span></div>`;
    u.resStats.innerHTML = [
      ['用时', `${fmtTime(this.time)}（标准 ${fmtTime(st.par)}）`], ['山中度过', `${this.weather.day} 天`],
      ['最高海拔', `${Math.round(st.altBase + P.stats.maxAlt * st.altScale)} m`], ['行走距离', `${(P.stats.distance / 1000).toFixed(2)} km`],
      ['登顶岩壁', P.stats.walls], ['使用岩钉', P.stats.pitons], ['坠落 / 滑坠', P.stats.falls], ['死亡', P.stats.deaths],
      ['日志', `${T.journals.filter(j => j.taken).length}/${T.journals.length}`], ['观景点', `${T.viewpoints.filter(v => v.done).length}/${T.viewpoints.length}`],
      ['补给包', `${T.stashes.filter(s => s.taken).length}/${T.stashes.length}`], ['得分', score],
    ].map(([k, v]) => `<div><span>${k}</span><b>${v}</b></div>`).join('');
    $('btnNext').classList.toggle('hidden', !(won && this.stageIdx < STAGES.length - 1));
    this.ui.show('result');
    this.audio.setMood(won ? 'summit' : 'night');
  }

  achieve(id) {
    if (!id || !Save.unlock(id)) return;
    const a = ACHIEVEMENTS.find(x => x.id === id);
    if (a) { this.ui.toast(a); this.audio.achievement(); }
  }

  /* ================= 存档 ================= */
  saveRun() {
    const P = this.player, T = this.terrain, W = this.weather;
    if (!P || this.won || this.state === 'result') return;
    const custom = T.camps.find(c => c.custom);
    Save.data.run = {
      stageIdx: this.stageIdx, free: this.freeMode, seed: this.seed, difficulty: this.diff.key,
      pos: this.respawnPoint.toArray(), inv: Object.assign({}, P.inv), aff: Object.assign({}, P.aff), thermosMax: P.thermosMax, battery: P.battery,
      hour: W.hour, time: this.time, lives: this.lives === Infinity ? -1 : this.lives,
      taken: { j: T.journals.filter(x => x.taken).map(x => x.id), s: T.stashes.filter(x => x.taken).map(x => x.id), f: T.firewood.filter(x => x.taken).map(x => x.id), v: T.viewpoints.filter(x => x.done).map(x => x.id) },
      camps: T.camps.filter(c => c.fixed && c.visited).map(c => c.index),
      custom: custom ? { pos: custom.pos.toArray(), dir: custom.dir } : null,
      campName: this.respawnCamp ? this.respawnCamp.name : '登山口',
      stats: Object.assign({}, P.stats),
    };
    Save.write();
  }
  applyRun(r) {
    const P = this.player, T = this.terrain, W = this.weather;
    Object.assign(P.inv, r.inv); Object.assign(P.aff, r.aff); P.thermosMax = r.thermosMax; P.battery = r.battery;
    W.hour = r.hour; W.day = 1 + Math.floor(r.hour / 24);
    this.time = r.time; this.lives = r.lives < 0 ? Infinity : r.lives;
    const hide = (list, ids, key = 'taken') => list.forEach(x => { if (ids.includes(x.id)) { x[key] = true; if (key === 'taken' && x.group) x.group.visible = false; } });
    hide(T.journals, r.taken.j); hide(T.stashes, r.taken.s); hide(T.firewood, r.taken.f); hide(T.viewpoints, r.taken.v, 'done');
    T.camps.forEach(c => { if (c.fixed && r.camps.includes(c.index)) c.visited = true; });
    if (r.custom) { const c = this.world.pitchTent(new THREE.Vector3().fromArray(r.custom.pos), r.custom.dir); this.respawnCamp = c; }
    else this.respawnCamp = T.camps.find(c => c.name === r.campName) || null;
    Object.assign(P.stats, r.stats);
    this.respawnPoint.fromArray(r.pos);
    P.respawn(this.respawnPoint, true);
    P.recomputeMax(); P.stamina = P.maxStamina;
  }

  /* ================= 地图与拍照 ================= */
  openMap(fromPause) {
    this.overlay = 'map'; this.mapFromPause = !!fromPause; this.unlockPointer();
    if (fromPause) this.state = 'play';
    this.ui.drawMap(this);
    this.ui.show('mapView');
  }
  closeMap() {
    this.ui.hideAll(); this.overlay = null; this.clock.getDelta();
    if (this.mapFromPause) { this.mapFromPause = false; this.pause(); }
  }

  openPhoto() {
    const P = this.player;
    if (!P.alive || ['air', 'slide', 'mantle'].includes(P.mode)) return;
    this.overlay = 'photo';
    this.photo = { yaw: this.cam.yaw, pitch: this.cam.pitch, dist: Math.max(3, this.cam.curDist), fov: this.camera.fov, filter: 0, hide: false };
    $('hud').classList.add('hidden'); $('photoUI').classList.remove('hidden'); $('polaroid').classList.add('hidden');
    const vp = this.nearViewpoint();
    $('photoTarget').textContent = vp ? '📷 观景点：拍下眼前的风景！' : '';
    $('photoFilter').textContent = '原色';
    this.lockPointer();
  }
  closePhoto() {
    this.overlay = null;
    $('hud').classList.remove('hidden'); $('photoUI').classList.add('hidden');
    this.camera.fov = this.S.fov; this.camera.updateProjectionMatrix();
    this.climber.group.visible = true;
    this.post.u.uFilter.value = 0;
    this.clock.getDelta();
  }
  updatePhoto(dt) {
    const ph = this.photo, P = this.player;
    const names = ['原色', '胶片', '黑白', '暖阳'];
    for (let k = 1; k <= 4; k++) if (this.take('Digit' + k)) { ph.filter = k - 1; $('photoFilter').textContent = names[k - 1]; }
    if (this.take('KeyH')) ph.hide = !ph.hide;
    if (this.take('Enter') || this.take('Space')) this.takePhoto();
    if (this.take('KeyF')) return this.closePhoto();
    if (this.pad) { ph.yaw -= this.pad.rx * 0.04; ph.pitch = clamp(ph.pitch + this.pad.ry * 0.03, -0.6, 1.35); }
    this.climber.group.visible = !ph.hide;
    this.post.u.uFilter.value = ph.filter;
    const tgt = new THREE.Vector3(P.pos.x, P.pos.y + 1.3, P.pos.z);
    const off = new THREE.Vector3(Math.sin(ph.yaw) * Math.cos(ph.pitch), Math.sin(ph.pitch), Math.cos(ph.yaw) * Math.cos(ph.pitch));
    const cp = this.camera.position.copy(tgt).addScaledVector(off, ph.dist);
    const hc = this.terrain.getHeight(cp.x, cp.z) + 0.4; if (cp.y < hc) cp.y = hc;
    this.camera.lookAt(tgt);
    this.camera.fov = ph.fov; this.camera.updateProjectionMatrix();
  }
  takePhoto() { if (this.overlay !== 'photo' || this.photoPending) return; this.photoPending = true; }
  capturePhoto() {
    const src = this.canvas;
    const cv = document.createElement('canvas'); cv.width = 480; cv.height = 300;
    const ctx = cv.getContext('2d');
    const sw = src.width, sh = src.height, ar = 480 / 300;
    let w = sw, h = sw / ar; if (h > sh) { h = sh; w = sh * ar; }
    ctx.drawImage(src, (sw - w) / 2, (sh - h) / 2, w, h, 0, 0, 480, 300);
    const url = cv.toDataURL('image/jpeg', 0.82);
    this.audio.shutter();
    const fl = $('shutterFlash'); fl.classList.remove('go'); void fl.offsetWidth; fl.classList.add('go');
    const vp = this.nearViewpoint();
    const st = this.stage, W = this.weather;
    const caption = `${st.name} · ${Math.round(st.altBase + this.player.pos.y * st.altScale)} m · ${fmtClock(W.hour)}`;
    Save.addPhoto(url, { caption, stage: st.key });
    $('polaroidImg').src = url; $('polaroidCap').textContent = caption;
    const pol = $('polaroid'); pol.classList.remove('hidden'); pol.style.animation = 'none'; void pol.offsetWidth; pol.style.animation = '';
    clearTimeout(this._polT); this._polT = setTimeout(() => pol.classList.add('hidden'), 3500);
    if (vp) {
      vp.done = true;
      this.ui.msg('观景点照片已记录！', 'good');
      $('photoTarget').textContent = '✓ 观景点完成';
      const key = st.key + ':' + vp.id;
      Save.data.photos[key] = 1; Save.write();
      if (Object.keys(Save.data.photos).length >= 9) this.achieve('photographer');
    }
  }

  /* ================= 相机 ================= */
  updateCamera(dt) {
    const P = this.player, T = this.terrain, c = this.cam, cam = this.camera;
    const mode = P.mode;
    let headY = (mode === 'slide' || mode === 'dead') ? 0.8 : mode === 'camp' ? 0.9 : 1.45;
    let dist = c.dist, pitch = c.pitch, yaw = c.yaw;
    c.idleT += dt;
    if (mode === 'wall' || mode === 'rope' || mode === 'mantle') {
      headY = 1.2; dist = Math.max(c.dist, 5.5);
      const w = P.wall || (P.rope && P.rope.wall) || (P.mantle && P.mantle.wall);
      if (w && c.idleT > 1.2) { const ty = Math.atan2(w.n.x, w.n.z); c.yaw += wrapAngle(ty - c.yaw) * (1 - Math.exp(-dt * 1.2)); yaw = c.yaw; }
      pitch = Math.max(pitch, 0.05);
    }
    if (this.overlay === 'camp') {
      const cp = this.campRef.pos, a = this.campAng + 0.9;
      const gaze = P.stargazing;
      const tgt = new THREE.Vector3(cp.x, cp.y + (gaze ? 6 : 0.8), cp.z);
      const pos = new THREE.Vector3(cp.x + Math.sin(a) * (gaze ? 3 : 5.2), cp.y + (gaze ? 1.2 : 2.1), cp.z + Math.cos(a) * (gaze ? 3 : 5.2));
      cam.position.lerp(pos, 1 - Math.exp(-dt * 2));
      c.target.lerp(tgt, 1 - Math.exp(-dt * 2));
      cam.lookAt(c.target);
      return;
    }
    const overview = !!this.keys.Tab;
    c.ov = damp(c.ov || 0, overview ? 1 : 0, 4, dt);
    pitch = lerp(pitch, 1.0, c.ov); dist = lerp(dist, 80, c.ov);
    const tp = new THREE.Vector3(P.pos.x, P.pos.y + headY, P.pos.z);
    c.target.lerp(tp, 1 - Math.exp(-dt * (mode === 'wall' ? 8 : 12)));
    const off = new THREE.Vector3(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));
    let d = dist;
    const probe = new THREE.Vector3();
    for (let k = 1; k <= 16; k++) {
      const f = k / 16;
      probe.copy(c.target).addScaledVector(off, dist * f);
      if (probe.y < T.getHeight(probe.x, probe.z) + 0.6) { d = Math.max(1.2, dist * f - 0.5); break; }
    }
    if (d < c.curDist) c.curDist = d; else c.curDist += (d - c.curDist) * Math.min(1, dt * 2.5);
    cam.position.copy(c.target).addScaledVector(off, c.curDist);
    const hc = T.getHeight(cam.position.x, cam.position.z) + 0.4;
    if (cam.position.y < hc) cam.position.y = hc;
    // 摄像机抖动（受伤/落石）
    if (this.hurtFlash > 0.5) { cam.position.x += (Math.random() - 0.5) * 0.08 * this.hurtFlash; cam.position.y += (Math.random() - 0.5) * 0.08 * this.hurtFlash; }
    cam.lookAt(c.target);
    if (cam.fov !== this.S.fov) { cam.fov = this.S.fov; cam.updateProjectionMatrix(); }
  }

  updateLamp() {
    const P = this.player, L = this.world.headlamp;
    L.intensity = P.lamp ? 3.2 : 0;
    if (!P.lamp) return;
    this.climber.lampAnchor.getWorldPosition(L.position);
    const dir = new THREE.Vector3();
    this.camera.getWorldDirection(dir);
    if (P.mode === 'wall') dir.set(-P.wall.n.x, 0.3, -P.wall.n.z);
    L.target.position.copy(L.position).addScaledVector(dir, 10);
    L.target.updateMatrixWorld();
  }

  updateRope() {
    const P = this.player, m = this.ropeMesh;
    let pts = null;
    if (P.mode === 'wall' && P.sessionPitons.length) {
      const w = P.wall;
      pts = [w.point(P.wallStartA, 0.05, w.faceB(P.wallStartA, 0.5) - 0.6)].concat(P.sessionPitons.map(p => p.pos));
    } else if ((P.mode === 'air' || P.mode === 'rope') && P.rope) {
      const w = P.rope.wall;
      pts = [w.point(P.rope.startA, 0.05, w.faceB(P.rope.startA, 0.5) - 0.6)].concat(P.rope.pitons.map(p => p.pos));
    }
    if (!pts) { m.visible = false; return; }
    const harness = P.pos.clone().setY(P.pos.y + 0.95);
    const last = pts[pts.length - 1];
    const mid = last.clone().lerp(harness, 0.5); mid.y -= P.mode === 'wall' ? Math.min(1.2, last.distanceTo(harness) * 0.25) : 0;
    pts.push(mid, harness);
    const curve = new THREE.CatmullRomCurve3(pts);
    m.geometry.dispose();
    m.geometry = new THREE.TubeGeometry(curve, Math.min(120, pts.length * 12), 0.018, 5, false);
    m.visible = true;
  }

  /* ================= 声音与后期 ================= */
  updateAudio(dt) {
    const A = this.audio, P = this.player, W = this.weather, T = this.terrain;
    if (!A.ctx) return;
    let fire = 0;
    for (const c of this.world.fires) { const d = c.pos.distanceTo(P.pos); fire = Math.max(fire, c.fireObj.lit * clamp(1 - d / 14, 0, 1)); }
    const water = T.lake ? clamp(1 - (Math.hypot(P.pos.x - T.lake.x, P.pos.z - T.lake.z) - T.lake.r) / 60, 0, 1) : 0;
    const shelter = this.overlay === 'camp' ? 0.6 : 1;
    A.setAmbience(clamp(W.windSpeed / 18, 0, 1) * shelter, W.intensity, fire, water);
    A.setSlide(P.mode === 'slide' ? clamp(P.speed / 12, 0, 1) : 0);
    if ((P.mode === 'walk' || P.mode === 'scramble') && P.speed > 0.3) {
      const s = Math.floor(P.phase / Math.PI);
      if (s !== this.stepIdx) { this.stepIdx = s; A.step(P.mat, P.sprinting); }
    }
    const mood = this.won ? 'summit' : W.blizzard ? 'storm' : this.overlay === 'camp' ? 'camp' : this.world.night > 0.6 ? 'night' : 'day';
    A.setMood(mood);
    A.updateMusic();
    const forest = P.pos.y < T.summit.y * this.stage.terrain.treeLine;
    A.ambientTick(dt, { forest, night: this.world.night > 0.5, eagle: this.stage.key === 'eagle' });
  }

  updatePost(dt) {
    const P = this.player, u = this.post.u, W = this.weather;
    this.hurtFlash = Math.max(0, this.hurtFlash - dt * 1.5);
    u.uTime.value += dt;
    u.uCold.value = damp(u.uCold.value, clamp((P.aff.cold - 25) / 55, 0, 1), 2, dt);
    u.uHurt.value = Math.max(this.hurtFlash, clamp((P.aff.injury - 60) / 40, 0, 1) * 0.5);
    u.uLowStam.value = damp(u.uLowStam.value, P.maxStamina < 30 ? 1 - P.maxStamina / 30 : 0, 2, dt);
    u.uHypoxia.value = damp(u.uHypoxia.value, clamp(P.aff.hypoxia / 50, 0, 1), 1, dt);
    const sky = this.world.sky;
    const golden = clamp(1 - Math.abs(sky.elev - 0.08) / 0.15, 0, 1);
    u.uWarm.value = Math.max(golden * 0.8, P.nearFire ? 0.5 : 0);
    u.uExposure.value = lerp(1.0, 1.45, this.world.night) * (1 + W.intensity * 0.1);
    u.uSat.value = 1.08 - W.intensity * 0.3;
    this.renderer.toneMappingExposure = u.uExposure.value;
  }

  checkTips(dt) {
    const P = this.player, u = this.ui;
    this.tipT = (this.tipT || 0) + dt;
    if (this.world.night > 0.6) { u.tip('night'); if (this.tipT > 5) u.tip('tent'); }
    if (P.affTotal > 15) u.tip('afflictions');
    if (this.time > 70) u.tip('map');
    if (P.mode === 'wall' && P.hold && P.hold.y > P.wall.H - 1.5) u.tip('wallTop');
    if ((P.mode === 'walk') && P.canGrabWall && this.tipT > 1) { this.tipT = 0; if (P.canGrabWall()) u.tip('wall'); }
  }
}

window.addEventListener('DOMContentLoaded', () => { window.game = new Game(); });
