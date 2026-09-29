/* 界面：HUD、菜单、地图、日志、提示与成就弹窗 */
const $ = (id) => document.getElementById(id);
const SCREENS = ['menu', 'stageSelect', 'settings', 'achScreen', 'albumScreen', 'loading', 'story', 'pause', 'help', 'journalView', 'mapView', 'result'];

class UI {
  constructor(game) {
    this.g = game;
    this.el = {};
    document.querySelectorAll('[id]').forEach(e => { this.el[e.id] = e; });
    this.hudT = 0;
    this.ghost = 100;
    this.buildCompass();
    this.buildAffSegs();
    this.screenStack = [];
  }

  /* ---------------- 屏幕切换 ---------------- */
  show(id, push = false) {
    if (push) { const cur = SCREENS.find(s => !this.el[s].classList.contains('hidden')); if (cur) this.screenStack.push(cur); }
    else this.screenStack = [];
    for (const s of SCREENS) this.el[s].classList.toggle('hidden', s !== id);
  }
  back() {
    const prev = this.screenStack.pop();
    if (prev) { const st = this.screenStack; this.show(prev); this.screenStack = st; } else this.g.onBack();
  }
  hideAll() { for (const s of SCREENS) this.el[s].classList.add('hidden'); this.screenStack = []; }
  anyScreen() { return SCREENS.some(s => !this.el[s].classList.contains('hidden')); }

  /* ---------------- 章节卡片 ---------------- */
  stageArt(st) {
    const pal = { verdant: ['#8ec5ff', '#dff1ff', '#5a8f5a', '#2f5d3a', '#7fb069'], eagle: ['#ffb36b', '#ffe0b0', '#9c6b4e', '#5a3e32', '#d98c3f'], frost: ['#284b7a', '#9fc4ef', '#c9dcf2', '#6b85a8', '#eef6ff'] }[st.key] || ['#89a', '#cde', '#678', '#345', '#9ab'];
    return `<svg class="art" viewBox="0 0 300 250" preserveAspectRatio="xMidYMid slice"><defs><linearGradient id="g${st.key}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${pal[0]}"/><stop offset="1" stop-color="${pal[1]}"/></linearGradient></defs>
      <rect width="300" height="250" fill="url(#g${st.key})"/>
      <circle cx="${st.key === 'frost' ? 230 : 220}" cy="60" r="${st.key === 'frost' ? 14 : 22}" fill="#fff8e0" opacity=".85"/>
      <path d="M0 170 L60 120 L100 140 L160 70 L210 125 L250 95 L300 140 L300 250 L0 250Z" fill="${pal[3]}" opacity=".55"/>
      <path d="M0 200 L50 150 L90 170 L150 60 L175 85 L190 75 L240 150 L300 120 L300 250 L0 250Z" fill="${pal[2]}"/>
      <path d="M150 60 L165 80 L158 84 L150 78 L142 88 L137 82Z" fill="${pal[4]}"/>
      <path d="M0 230 Q80 200 150 215 T300 205 L300 250 L0 250Z" fill="${pal[3]}"/>
      ${st.key === 'frost' ? '<g fill="#fff" opacity=".9"><circle cx="40" cy="30" r="1"/><circle cx="90" cy="50" r="1.2"/><circle cx="130" cy="20" r="0.8"/><circle cx="270" cy="30" r="1"/></g><path d="M0 60 Q80 30 160 55 T300 40" stroke="#6ff0b0" stroke-width="10" fill="none" opacity=".25"/>' : ''}
      ${st.key === 'eagle' ? '<path d="M60 60 q8 -6 16 0 q8 -6 16 0" stroke="#3a2a20" stroke-width="2" fill="none"/>' : ''}
    </svg>`;
  }

  buildStageSelect(free) {
    const g = this.g, S = Save.data;
    this.el.ssTitle.textContent = free ? '自由攀登' : '远征模式';
    this.el.freeOpts.classList.toggle('hidden', !free);
    const wrap = this.el.stageCards; wrap.innerHTML = '';
    STAGES.forEach((st, k) => {
      const rec = Save.stageRecord(st.key);
      const locked = !free && k + 1 > S.progress.unlocked;
      const c = document.createElement('div');
      c.className = 'stage-card' + (g.selStage === k ? ' active' : '') + (locked ? ' locked' : '');
      c.style.setProperty('--c', st.color);
      c.innerHTML = this.stageArt(st) + `<div class="shade"></div>
        ${free ? '' : `<div class="stars">${rec.stars.map(s => `<span class="${s ? 'on' : ''}">★</span>`).join('')}</div>`}
        ${rec.best && !free ? `<div class="best">最佳 ${fmtTime(rec.best)}</div>` : ''}
        <div class="info"><div class="chap">${st.chapter}</div><div class="nm">${st.name}</div><div class="en">${st.en}</div><div class="tag">${st.tagline}</div></div>`;
      c.addEventListener('click', () => { if (locked) return; g.selStage = k; g.audio.click(); this.buildStageSelect(free); });
      c.addEventListener('mouseenter', () => g.audio.hover());
      wrap.appendChild(c);
    });
    let desc = wrap.parentNode.querySelector('.stage-desc');
    if (!desc) { desc = document.createElement('div'); desc.className = 'stage-desc'; wrap.after(desc); }
    desc.textContent = STAGES[g.selStage].desc;
    const db = this.el.diffBtns; db.innerHTML = '';
    for (const k in DIFFICULTIES) {
      const d = DIFFICULTIES[k];
      const b = document.createElement('button'); b.textContent = d.name; b.style.setProperty('--c', d.color);
      if (S.settings.difficulty === k) b.classList.add('active');
      b.addEventListener('click', () => { S.settings.difficulty = k; Save.write(); g.audio.click(); this.buildStageSelect(free); });
      db.appendChild(b);
    }
    this.el.diffDesc.textContent = DIFFICULTIES[S.settings.difficulty].desc;
    const jb = this.el.jacketBtns; jb.innerHTML = '';
    JACKET_COLORS.forEach((jc, i) => {
      const s = document.createElement('div'); s.className = 'swatch' + (S.settings.jacket === i ? ' active' : ''); s.title = jc.name;
      s.style.background = '#' + jc.c.toString(16).padStart(6, '0');
      s.addEventListener('click', () => { S.settings.jacket = i; Save.write(); g.audio.click(); if (g.menuClimber) g.menuClimber.setColor(i); this.buildStageSelect(free); });
      jb.appendChild(s);
    });
  }

  buildAchievements() {
    const grid = this.el.achGrid; grid.innerHTML = '';
    let n = 0;
    for (const a of ACHIEVEMENTS) {
      const on = !!Save.data.achievements[a.id]; if (on) n++;
      const d = document.createElement('div'); d.className = 'ach' + (on ? ' on' : '');
      d.innerHTML = `<div class="ic">${a.icon}</div><div><div class="nm">${a.name}</div><div class="ds">${a.desc}</div></div>`;
      grid.appendChild(d);
    }
    this.el.achCount.textContent = `${n} / ${ACHIEVEMENTS.length}`;
  }

  buildAlbum(tab = 'photos') {
    const S = Save.data;
    document.querySelectorAll('#albumScreen .tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tab));
    this.el.albumPhotos.classList.toggle('hidden', tab !== 'photos');
    this.el.albumJournal.classList.toggle('hidden', tab !== 'journal');
    const pg = this.el.albumPhotos; pg.innerHTML = '';
    if (!S.album.length) pg.innerHTML = '<div class="empty">还没有照片。在游戏中按 F 进入拍照模式。</div>';
    S.album.slice().reverse().forEach((p, i) => {
      const d = document.createElement('div'); d.className = 'photo'; d.style.setProperty('--r', ((i * 37) % 7 - 3) + 'deg');
      d.innerHTML = `<img src="${p.img}"><div>${p.caption || ''}</div>`;
      pg.appendChild(d);
    });
    const jl = this.el.albumJournal; jl.innerHTML = '';
    let n = 0;
    JOURNALS.forEach((j, i) => {
      const got = !!S.journals[i]; if (got) n++;
      const d = document.createElement('div'); d.className = 'jitem' + (got ? '' : ' locked');
      d.textContent = got ? j.title : `第 ${i + 1} 页 · 未找到`;
      if (got) d.addEventListener('click', () => this.showJournal(i, true));
      jl.appendChild(d);
    });
    this.el.jCount.textContent = `${n}/${JOURNALS.length}`;
  }

  showJournal(id, fromAlbum) {
    const j = JOURNALS[id];
    this.el.jTitle.textContent = j.title; this.el.jText.textContent = j.text; this.el.jNum.textContent = `${id + 1} / ${JOURNALS.length}`;
    this.show('journalView', !!fromAlbum);
    this.journalFromAlbum = !!fromAlbum;
  }

  /* ---------------- 剧情 ---------------- */
  playStory(lines, done) {
    this.show('story');
    const box = this.el.storyText; box.innerHTML = '';
    let i = 0, timer = null;
    const next = () => {
      clearTimeout(timer);
      if (i >= lines.length) { this.el.story.onclick = null; this.storyKey = null; done(); return; }
      const p = document.createElement('p'); p.textContent = lines[i++]; box.appendChild(p);
      timer = setTimeout(next, 2600);
    };
    this.el.story.onclick = next;
    this.storyKey = next;
    next();
  }

  /* ---------------- HUD ---------------- */
  buildCompass() {
    const strip = this.el.compassStrip;
    this.compassItems = [];
    const dirs = ['北', '东北', '东', '东南', '南', '西南', '西', '西北'];
    for (let k = 0; k < 24; k++) {
      const a = k * 15 * DEG;
      if (k % 3 === 0) { const d = document.createElement('div'); d.className = 'dir'; d.textContent = dirs[k / 3]; if (k === 0) d.style.color = '#ff8a6b'; strip.appendChild(d); this.compassItems.push({ el: d, ang: a }); }
      else { const t = document.createElement('div'); t.className = 'tick'; strip.appendChild(t); this.compassItems.push({ el: t, ang: a }); }
    }
    this.compassMarks = [];
  }
  setCompassMarks(list) {
    for (const m of this.compassMarks) m.el.remove();
    this.compassMarks = list.map(m => { const e = document.createElement('div'); e.className = 'mk'; e.innerHTML = `${m.icon}<small></small>`; this.el.compassStrip.appendChild(e); return Object.assign({ el: e, sm: e.querySelector('small') }, m); });
  }
  updateCompass(heading, px, pz) {
    const W = this.el.compass.clientWidth || 460, half = W / 2, span = Math.PI * 0.55;
    const place = (el, ang) => {
      const rel = wrapAngle(ang - heading);
      if (Math.abs(rel) > span) { el.style.display = 'none'; return; }
      el.style.display = ''; el.style.left = (half + rel / span * half) + 'px';
    };
    for (const c of this.compassItems) place(c.el, c.ang);
    for (const m of this.compassMarks) {
      if (m.hidden && m.hidden()) { m.el.style.display = 'none'; continue; }
      const p = m.pos();
      const dx = p.x - px, dz = p.z - pz;
      place(m.el, Math.atan2(-dx, dz));
      const d = Math.hypot(dx, dz);
      m.sm.textContent = d > 1000 ? (d / 1000).toFixed(1) + 'km' : Math.round(d) + 'm';
    }
  }

  buildAffSegs() {
    const wrap = this.el.affSegs; wrap.innerHTML = '';
    this.affSegEls = AFF.map(a => { const d = document.createElement('div'); d.style.background = a.color; d.style.width = '0%'; wrap.appendChild(d); return d; });
  }

  buildHotbar(P) {
    const hb = this.el.hotbar; hb.innerHTML = '';
    this.slots = {};
    const add = (key, label, sep) => {
      const it = ITEMS[key];
      const s = document.createElement('div'); s.className = 'slot' + (sep ? ' sep' : ''); s.title = `${it.name}：${it.desc}`;
      s.innerHTML = `<span class="k">${label}</span><svg viewBox="0 0 24 24">${it.svg}</svg><span class="n"></span>`;
      hb.appendChild(s); this.slots[key] = { el: s, n: s.querySelector('.n') };
    };
    HOTBAR.forEach((k, i) => { if (k === 'oxygen' && !this.g.stage.deathZone) return; add(k, String(i + 1)); });
    add('piton', 'Q', true); add('tent', 'T'); add('wood', ''); add('noodle', '');
  }
  flashSlot(key) { const s = this.slots && this.slots[key]; if (!s) return; s.el.classList.remove('flash'); void s.el.offsetWidth; s.el.classList.add('flash'); }

  setupAltTrack(T, stage) {
    const tr = this.el.altTrack;
    tr.querySelectorAll('.mark,.summit-mark').forEach(e => e.remove());
    const H = T.summit.y;
    for (const c of T.camps) if (c.fixed) { const m = document.createElement('div'); m.className = 'mark camp'; m.style.bottom = (c.pos.y / H * 100) + '%'; tr.appendChild(m); }
    if (stage.deathZone) { const m = document.createElement('div'); m.className = 'mark dz'; m.style.bottom = (stage.deathZone * 100) + '%'; m.title = '死亡地带'; tr.appendChild(m); }
    const s = document.createElement('div'); s.className = 'summit-mark'; s.textContent = '⛳'; tr.appendChild(s);
  }

  prompt(html) {
    const p = this.el.prompt;
    if (!html) { if (!p.classList.contains('hidden')) p.classList.add('hidden'); this._prompt = null; return; }
    if (this._prompt !== html) { p.innerHTML = html; this._prompt = html; }
    p.classList.remove('hidden');
  }
  hint(html) {
    const h = this.el.hint;
    if (!html) { h.classList.add('hidden'); this._hint = null; return; }
    if (this._hint !== html) { h.innerHTML = html; this._hint = html; }
    h.classList.remove('hidden');
  }

  tip(key) {
    const S = Save.data;
    if (!S.settings.showTips || S.tips[key] || !TIPS[key]) return;
    S.tips[key] = 1; Save.write();
    const b = this.el.tipBox;
    b.innerHTML = '💡 ' + TIPS[key].replace(/【(.+?)】/g, '<b>$1</b>');
    b.classList.remove('hidden');
    clearTimeout(this._tipT);
    this._tipT = setTimeout(() => b.classList.add('hidden'), 9000);
  }

  msg(text, cls = 'info') {
    const el = document.createElement('div'); el.className = 'msg ' + cls; el.textContent = text;
    const f = this.el.msgFeed; f.appendChild(el);
    while (f.children.length > 6) f.removeChild(f.firstChild);
    setTimeout(() => el.remove(), 6000);
  }
  big(main, sub = '') {
    const b = this.el.bigMsg; this.el.bigMain.textContent = main; this.el.bigSub.textContent = sub;
    b.classList.remove('hidden'); b.style.animation = 'none'; void b.offsetWidth; b.style.animation = '';
    clearTimeout(this._bigT); this._bigT = setTimeout(() => b.classList.add('hidden'), 3000);
  }
  toast(a) {
    const t = document.createElement('div'); t.className = 'toast';
    t.innerHTML = `<div class="ic">${a.icon}</div><div><div class="t1">成就解锁</div><div class="t2">${a.name}</div><div class="t3">${a.desc}</div></div>`;
    this.el.toasts.appendChild(t); setTimeout(() => t.remove(), 5000);
  }

  updateHud(dt) {
    const g = this.g, P = g.player, T = g.terrain, W = g.weather, el = this.el;
    // 体力条（每帧）
    const aff = P.aff;
    el.stamFill.style.width = clamp(P.stamina, 0, 100) + '%';
    el.stamFill.classList.toggle('low', P.stamina < 20);
    this.ghost = Math.max(P.stamina, this.ghost - dt * 25);
    el.stamGhost.style.width = clamp(this.ghost, 0, 100) + '%';
    AFF.forEach((a, i) => { this.affSegEls[i].style.width = clamp(aff[a.key], 0, 100) + '%'; });
    // 指南针
    const yaw = g.cam.yaw;
    this.updateCompass(Math.atan2(Math.sin(yaw), -Math.cos(yaw)), P.pos.x, P.pos.z);
    el.altMarker.style.bottom = clamp(P.pos.y / T.summit.y * 100, 0, 100) + '%';
    // 蓄力
    if (P.dyno) {
      el.dynoMeter.classList.remove('hidden');
      el.dynoArc.style.strokeDashoffset = 264 * (1 - P.dyno.charge);
    } else el.dynoMeter.classList.add('hidden');
    // 低画质屏幕效果
    if (!g.post || !g.post.enabled) {
      el.coldFx.style.opacity = clamp((aff.cold - 30) / 50, 0, 1);
      el.hurtFx.style.opacity = clamp(g.hurtFlash, 0, 1);
    } else { el.coldFx.style.opacity = 0; el.hurtFx.style.opacity = 0; }

    this.hudT -= dt;
    if (this.hudT > 0) return;
    this.hudT = 0.12;
    const st = g.stage;
    el.altVal.textContent = Math.round(st.altBase + P.pos.y * st.altScale);
    const dz = st.deathZone && P.pos.y > T.summit.y * st.deathZone;
    el.altHint.textContent = dz ? '⚠ 死亡地带' : `距峰顶 ${Math.round((T.summit.y - P.pos.y) * st.altScale)} m`;
    el.altHint.style.color = dz ? '#ffb3b3' : '';
    const h = W.hour % 24;
    el.clockIcon.textContent = (h > 5.5 && h < 19.5) ? '☀' : '☾';
    el.clockVal.textContent = fmtClock(W.hour);
    el.dayVal.textContent = `第 ${W.day} 天`;
    el.tempVal.textContent = `${Math.round(P.tempC || 0)}°C`;
    let wt = W.blizzard ? '<span class="storm">暴风雪</span>' : W.snowfall > 0.3 ? '降雪' : W.windSpeed > 9 ? '大风' : g.world.night > 0.5 ? '夜晚' : '晴朗';
    el.weatherVal.innerHTML = wt;
    el.windVal.textContent = `风 ${W.windSpeed.toFixed(0)} m/s`;
    // 模式
    el.modeTag.textContent = MODE_NAME[P.mode] + (P.mode === 'slide' && P.braking ? '（制动）' : P.mode === 'walk' && P.sprinting ? '（奔跑）' : '');
    el.modeTag.className = 'mode-tag ' + P.mode;
    let s = '';
    if (P.mode === 'walk' || P.mode === 'scramble') s = `坡度 ${Math.round(P.slope)}° · ${MAT_NAME[P.mat]}` + (P.mode === 'scramble' ? ` · −${P.climbDrainRate(W).toFixed(1)}/s` : '');
    else if (P.mode === 'wall' && P.hold) s = `${HOLD_INFO[P.hold.type].name} · 高 ${Math.max(0, P.hold.y).toFixed(1)} / ${P.wall ? Math.round(P.wall.H) : 0} m` + (P.sessionPitons.length ? ` · 岩钉 ${P.sessionPitons.length}` : ' · 无保护');
    el.slopeVal.textContent = s;
    el.slopeVal.style.display = s ? '' : 'none';
    // 负面状态列表
    el.affList.innerHTML = AFF.filter(a => aff[a.key] >= 3).map(a => `<span><i style="background:${a.color}"></i>${a.name} ${Math.round(aff[a.key])}</span>`).join('');
    // Buff
    const buffs = [];
    if (P.chalkT > 0) buffs.push(`🤍 镁粉 ${Math.ceil(P.chalkT)}s`);
    if (P.oxygenT > 0) buffs.push(`🫧 氧气 ${Math.ceil(P.oxygenT)}s`);
    if (P.lamp) buffs.push(`🔦 头灯 ${Math.round(P.battery)}%`);
    if (P.nearFire) buffs.push('🔥 取暖中');
    el.buffs.innerHTML = buffs.map(b => `<span>${b}</span>`).join('');
    // 物品栏
    if (this.slots) for (const k in this.slots) {
      const n = P.inv[k] || 0; const sl = this.slots[k];
      sl.n.textContent = n; sl.el.classList.toggle('empty', n <= 0);
    }
    // 目标
    const obs = g.objectiveList();
    el.objectives.innerHTML = '<div class="ob-title">目标</div>' + obs.map(o => `<div class="ob ${o.done ? 'done' : ''}">${o.text} <b>${o.val}</b>${o.done ? ' ✓' : ''}</div>`).join('');
    el.livesBox.textContent = g.lives === Infinity ? '' : '❤'.repeat(Math.max(0, g.lives)) + ` 剩余生命 ${g.lives}`;
  }

  /* ---------------- 地图 ---------------- */
  buildMapBase(T) {
    const S = 450, cv = document.createElement('canvas'); cv.width = cv.height = S;
    const ctx = cv.getContext('2d'), img = ctx.createImageData(S, S);
    const H = T.summit.y, cfg = T.cfg;
    const lx = -0.6, ly = 0.7, lz = 0.4; // 光照（西北）
    for (let py = 0; py < S; py++) for (let px = 0; px < S; px++) {
      const x = 500 - (px + 0.5) / S * 1000, z = 500 - (py + 0.5) / S * 1000;
      const h = T.getHeight(x, z), e = 2.2;
      const nx = T.getHeight(x - e, z) - T.getHeight(x + e, z), nz = T.getHeight(x, z - e) - T.getHeight(x, z + e);
      const nl = Math.hypot(nx, 2 * e, nz);
      const shade = clamp(((nx * lx + 2 * e * ly + nz * lz) / nl) * 0.9 + 0.25, 0.25, 1.15);
      const f = h / H;
      let r, gg, b;
      if (h < T.waterY) { r = 90; gg = 150; b = 200; }
      else if (f > cfg.snowLine) { r = 240; gg = 244; b = 250; }
      else if (f > cfg.rockLine) { const t = (f - cfg.rockLine) / (cfg.snowLine - cfg.rockLine); r = lerp(186, 200, t); gg = lerp(170, 196, t); b = lerp(140, 190, t); }
      else if (f > cfg.treeLine * 0.9) { r = 170; gg = 176; b = 120; }
      else { r = cfg.palette === 'autumn' ? 196 : 150; gg = cfg.palette === 'autumn' ? 170 : 186; b = cfg.palette === 'autumn' ? 110 : 120; }
      const tm = T.trailMaskAt(x, z);
      const i = (py * S + px) * 4;
      img.data[i] = r * shade; img.data[i + 1] = gg * shade; img.data[i + 2] = b * shade; img.data[i + 3] = 255;
      // 等高线
      const step = 20, c0 = Math.floor(h / step), c1 = Math.floor(T.getHeight(x - 2.2, z) / step), c2 = Math.floor(T.getHeight(x, z - 2.2) / step);
      if (c0 !== c1 || c0 !== c2) { const k = c0 % 5 === 0 ? 0.55 : 0.78; img.data[i] *= k; img.data[i + 1] *= k; img.data[i + 2] *= k; }
    }
    ctx.putImageData(img, 0, 0);
    this.mapBase = cv;
  }

  drawMap(g) {
    const cv = this.el.mapCanvas, ctx = cv.getContext('2d'), W = cv.width, T = g.terrain, P = g.player;
    const tp = (x, z) => [(500 - x) / 1000 * W, (500 - z) / 1000 * W];
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(this.mapBase, 0, 0, W, W);
    // 纸张质感
    ctx.fillStyle = 'rgba(240,225,190,0.12)'; ctx.fillRect(0, 0, W, W);
    // 步道
    ctx.strokeStyle = '#c0392b'; ctx.lineWidth = 3; ctx.setLineDash([8, 6]); ctx.beginPath();
    T.trail.forEach((p, k) => { const [x, y] = tp(p.x, p.z); if (k) ctx.lineTo(x, y); else ctx.moveTo(x, y); });
    ctx.stroke(); ctx.setLineDash([]);
    // 冰裂缝
    ctx.strokeStyle = '#1d3557'; ctx.lineWidth = 4;
    for (const c of T.crevasses) { const [x1, y1] = tp(c.x - c.ux * c.L / 2, c.z - c.uz * c.L / 2), [x2, y2] = tp(c.x + c.ux * c.L / 2, c.z + c.uz * c.L / 2); ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); }
    // 岩壁
    ctx.strokeStyle = '#495057'; ctx.lineWidth = 7; ctx.lineCap = 'round';
    for (const w of g.world.walls) { const a = w.point(-w.W / 2, 0, 0), b = w.point(w.W / 2, 0, 0); const [x1, y1] = tp(a.x, a.z), [x2, y2] = tp(b.x, b.z); ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); }
    ctx.lineCap = 'butt';
    const dot = (x, z, col, r = 7, label, faded) => {
      const [px, py] = tp(x, z);
      ctx.globalAlpha = faded ? 0.45 : 1;
      ctx.beginPath(); ctx.arc(px, py, r, 0, Math.PI * 2); ctx.fillStyle = col; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = '#fff'; ctx.stroke();
      if (label) { ctx.font = 'bold 13px sans-serif'; ctx.fillStyle = '#1b1b1b'; ctx.textAlign = 'center'; ctx.fillText(label, px, py - r - 5); }
      ctx.globalAlpha = 1;
    };
    for (const f of T.firewood) if (!f.taken && f.seen) dot(f.pos.x, f.pos.z, '#8b5a2b', 5);
    for (const s of T.stashes) if (!s.taken && s.seen) dot(s.pos.x, s.pos.z, '#f7b733', 6);
    for (const v of T.viewpoints) if (v.seen || v.done) dot(v.pos.x, v.pos.z, '#3a86ff', 6, v.done ? '✓' : '', v.done);
    for (const j of T.journals) if (j.seen || j.taken) dot(j.pos.x, j.pos.z, '#c0392b', 6, j.taken ? '' : '?', j.taken);
    for (const c of T.camps) dot(c.pos.x, c.pos.z, '#ff9f1c', 8, c.name);
    dot(T.start.x, T.start.z, '#2a9d8f', 6, '登山口');
    const [sx, sy] = tp(T.summit.x, T.summit.z);
    ctx.font = '26px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('⛳', sx, sy + 8);
    // 玩家
    const [px, py] = tp(P.pos.x, P.pos.z);
    const ang = Math.atan2(-P.facing.x, P.facing.z);
    ctx.save(); ctx.translate(px, py); ctx.rotate(ang);
    ctx.beginPath(); ctx.moveTo(0, -13); ctx.lineTo(9, 10); ctx.lineTo(0, 5); ctx.lineTo(-9, 10); ctx.closePath();
    ctx.fillStyle = '#ff3b30'; ctx.fill(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke(); ctx.restore();
    // 指北
    ctx.font = 'bold 20px sans-serif'; ctx.fillStyle = '#222'; ctx.fillText('N ↑', W - 40, 34);
    // 比例尺
    ctx.fillRect(24, W - 30, 100 / 1000 * W, 4); ctx.font = '12px sans-serif'; ctx.textAlign = 'left'; ctx.fillText('100 m', 24, W - 36);
    this.el.mapTitle.textContent = g.stage.name;
  }
}
