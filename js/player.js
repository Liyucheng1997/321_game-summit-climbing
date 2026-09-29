/* 玩家：行走/手脚并用攀爬/滑坠/腾空/攀岩/绳索悬挂 物理，以及负面状态与背包 */
const MODE_NAME = { walk: '行走', scramble: '攀爬', slide: '滑坠！', air: '腾空', wall: '攀岩', rope: '绳索悬挂', mantle: '翻越', camp: '休息', sleep: '睡觉', kneel: '搭帐篷', use: '使用物品', cheer: '登顶！', dead: '倒下' };
const MAT_FRICTION = [0.55, 0.6, 0.68, 0.26, 0.06];
const MAT_BRAKE = [0.85, 0.85, 0.9, 0.9, 0.5];
const MAT_CLIMB_COST = [1.0, 1.0, 1.0, 1.35, 2.0];
const AFF = [
  { key: 'hunger', name: '饥饿', color: '#f0a33a' },
  { key: 'cold', name: '寒冷', color: '#5cb8ff' },
  { key: 'injury', name: '伤势', color: '#ff4d4d' },
  { key: 'fatigue', name: '疲惫', color: '#a77bff' },
  { key: 'hypoxia', name: '缺氧', color: '#9aa5b8' },
];

class Player {
  constructor(game) {
    this.game = game; this.T = game.terrain; this.diff = game.diff; this.stage = game.stage;
    this.pos = new THREE.Vector3(); this.vel = new THREE.Vector3(); this.normal = new THREE.Vector3(0, 1, 0);
    this.facing = new THREE.Vector3(0, 0, 1); this.lunge = new THREE.Vector3();
    this.mode = 'walk';
    this.slope = 0; this.mat = 0; this.uphillDot = 0; this.speed = 0; this.phase = 0;
    this.stamina = 100; this.maxStamina = 100;
    this.aff = { hunger: 0, cold: 0, injury: 0, fatigue: 0, hypoxia: 0 };
    this.inv = Object.assign({ bar: 0, thermos: 0, bandage: 0, chalk: 0, oxygen: 0, noodle: 0, wood: 0, tent: 0, piton: 0, battery: 0 }, this.stage.startItems);
    this.inv.thermos *= 3; this.thermosMax = Math.max(3, this.inv.thermos);
    this.lamp = false; this.battery = 100;
    this.chalkT = 0; this.oxygenT = 0;
    this.walkable = 42; this.climbMax = this.stage.terrain.maxSlopeDeg + 1.5; this.restSlope = 62;
    this.jumpCooldown = 0; this.airTime = 0; this.deadTimer = 0; this.slideTime = 0; this.slideStartY = 0;
    this.sprinting = false; this.braking = false; this.moving = false;
    this.events = [];
    this.stats = { falls: 0, deaths: 0, damage: 0, maxAlt: 0, pitons: 0, walls: 0, dynos: 0, camps: 0, distance: 0 };
    this.atCamp = null; this.nearFire = false;
    this.lastSafe = new THREE.Vector3();
    this.safeTimer = 0;
    this.actionT = 0; this.action = null;
    // 攀岩状态
    this.wall = null; this.hold = null; this.move = null; this.dyno = null;
    this.sessionPitons = [];
    this.pose = { handL: new THREE.Vector3(), handR: new THREE.Vector3(), footL: new THREE.Vector3(), footR: new THREE.Vector3(), poleL: new THREE.Vector3(), poleR: new THREE.Vector3(), kneePoleL: new THREE.Vector3(), kneePoleR: new THREE.Vector3() };
    this.feet = { L: { cur: new THREE.Vector3(), from: new THREE.Vector3(), t: 1 }, R: { cur: new THREE.Vector3(), from: new THREE.Vector3(), t: 1 } };
    this.rope = null;
    this.wallHint = '';
    this._up = new THREE.Vector3(); this._tmp = new THREE.Vector3(); this._n = new THREE.Vector3(); this._a = new THREE.Vector3(); this._b = new THREE.Vector3();
  }

  get alive() { return this.mode !== 'dead'; }
  get animMode() { return this.action && this.action.type === 'use' ? 'use' : this.mode === 'walk' && this.slope > 48 && this.moving ? 'scramble' : this.mode; }
  get affTotal() { const a = this.aff; return a.hunger + a.cold + a.injury + a.fatigue + a.hypoxia; }
  emit(type, data) { this.events.push({ type, data: data || {} }); }

  respawn(p, soft) {
    this.pos.copy(p); this.pos.y = this.T.groundHeight(p.x, p.z) + 0.02;
    this.vel.set(0, 0, 0); this.lunge.set(0, 0, 0);
    this.mode = 'walk'; this.deadTimer = 0; this.airTime = 0;
    this.leaveWall();
    if (!soft) {
      const a = this.aff;
      a.injury = Math.min(a.injury, 15); a.cold = Math.min(a.cold, 10); a.hypoxia = 0; a.hunger = Math.min(a.hunger, 30); a.fatigue = Math.min(a.fatigue, 20);
    }
    this.recomputeMax(); this.stamina = this.maxStamina;
    this.lastSafe.copy(this.pos);
  }

  hurt(amount, why) {
    if (!this.alive || amount <= 0) return;
    amount *= this.diff.fall;
    this.aff.injury += amount;
    this.stats.damage += amount;
    this.emit('damage', { amount, why });
    if (this.aff.injury >= 100) this.die(why);
  }
  die(why) {
    if (!this.alive) return;
    this.leaveWall();
    this.mode = 'dead'; this.deadTimer = 0; this.stats.deaths++;
    this.emit('dead', { why });
  }
  recomputeMax() { this.maxStamina = Math.max(0, 100 - this.affTotal); if (this.stamina > this.maxStamina) this.stamina = this.maxStamina; }

  /* ---------------- 主更新 ---------------- */
  update(dt, input, W) {
    if (this.action) { this.action.t += dt; if (this.action.t >= this.action.dur) { const a = this.action; this.action = null; if (a.done) a.done(); } }
    const n = Math.max(1, Math.ceil(dt / (1 / 120)));
    const sdt = dt / n;
    for (let k = 0; k < n; k++) { this.step(sdt, input, W); input.jumpPressed = false; input.jumpReleased = false; input.interact = false; input.piton = false; }
    this.postUpdate(dt, input, W);
  }

  step(dt, input, W) {
    const T = this.T, p = this.pos, v = this.vel, n = this.normal;
    p.x = clamp(p.x, -490, 490); p.z = clamp(p.z, -490, 490);
    if (this.jumpCooldown > 0) this.jumpCooldown -= dt;
    const mode = this.mode;
    if (mode === 'dead') {
      this.deadTimer += dt; v.multiplyScalar(Math.exp(-4 * dt)); p.addScaledVector(v, dt);
      const h = T.groundHeight(p.x, p.z, p.y); if (p.y < h) p.y = h; return;
    }
    if (mode === 'camp' || mode === 'sleep' || mode === 'kneel' || mode === 'cheer') { v.set(0, 0, 0); return; }
    if (mode === 'wall') return this.stepWall(dt, input, W);
    if (mode === 'mantle') return this.stepMantle(dt);
    if (mode === 'rope') return this.stepRope(dt, input);

    const h = T.groundHeight(p.x, p.z, p.y);
    T.getNormal(p.x, p.z, n);
    if (h > T.getHeight(p.x, p.z) + 0.01) n.set(0, 1, 0); // 桥面
    this.slope = Math.acos(clamp(n.y, -1, 1)) / DEG;
    this.mat = T.getMaterial(p.x, p.z);
    // 相机相对输入
    const yaw = input.camYaw;
    const fx = -Math.sin(yaw), fz = -Math.cos(yaw), rx = Math.cos(yaw), rz = -Math.sin(yaw);
    const mx = fx * input.moveZ + rx * input.moveX, mz = fz * input.moveZ + rz * input.moveX;
    const mlen = Math.hypot(mx, mz);
    this.moving = mlen > 0.01 && !this.action;
    const md = this._a;
    if (this.moving) { md.set(mx / mlen, 0, mz / mlen); md.addScaledVector(n, -md.dot(n)); if (md.lengthSq() > 1e-6) md.normalize(); } else md.set(0, 0, 0);
    const up = this._up.set(-n.x, 0, -n.z); up.addScaledVector(n, -up.dot(n));
    if (up.lengthSq() > 1e-6) up.normalize(); else up.set(0, 0, 1);
    this.uphillDot = this.moving ? md.dot(up) : 0;

    if (mode === 'air') {
      this.airTime += dt;
      v.y -= G * dt;
      v.x += (W.wind.x * 0.1 - v.x * 0.06) * dt; v.z += (W.wind.z * 0.1 - v.z * 0.06) * dt;
      if (this.moving) { v.x += (mx / mlen) * 3.0 * dt; v.z += (mz / mlen) * 3.0 * dt; }
      p.addScaledVector(v, dt);
      this.collideProps(p);
      if (this.rope) this.ropeConstraint(dt);
      if (this.mode !== 'air') return;
      const h2 = T.groundHeight(p.x, p.z, p.y);
      if (p.y <= h2) { p.y = h2; T.getNormal(p.x, p.z, n); this.slope = Math.acos(clamp(n.y, -1, 1)) / DEG; this.mat = T.getMaterial(p.x, p.z); this.land(); }
      this.speed = v.length();
      return;
    }
    const stamOK = this.stamina > 0;
    const iceSteep = this.mat === MAT.ICE && this.slope > 40;
    const walkLim = this.walkLimit();
    let m = mode;
    if (m !== 'slide') {
      if (this.slope <= walkLim) m = 'walk';
      else if (this.slope <= this.climbMax && stamOK && !iceSteep) { if (m !== 'scramble') this.emit('grab'); m = 'scramble'; }
      else {
        if (m === 'scramble') { this.stats.falls++; this.emit('gripLost', { reason: !stamOK ? 'stamina' : iceSteep ? 'ice' : 'steep' }); }
        m = 'slide'; this.slideTime = 0; this.slideStartY = p.y;
      }
    }
    this.mode = m;
    if (m === 'walk') this.stepWalk(dt, input, md, up, W);
    else if (m === 'scramble') this.stepScramble(dt, input, md, up, W);
    else this.stepSlide(dt, input, md, up);
    const ox = p.x, oz = p.z;
    p.addScaledVector(v, dt);
    if (this.lunge.lengthSq() > 1e-4) { p.addScaledVector(this.lunge, dt); this.lunge.multiplyScalar(Math.exp(-4.5 * dt)); }
    // 深水不可进入
    if (T.waterY > -1e8 && T.getHeight(p.x, p.z) < T.waterY - 0.7) { p.x = ox; p.z = oz; v.x = 0; v.z = 0; this.hintWater = 1; }
    this.collideProps(p);
    const h2 = T.groundHeight(p.x, p.z, p.y);
    const gap = p.y - h2;
    if (this.mode === 'air') { }
    else if (gap <= 0) p.y = h2;
    else if (gap < (this.mode === 'walk' ? 0.7 : 1.3)) p.y = h2;
    else { this.mode = 'air'; this.airTime = 0; }
    this.speed = v.length();
    this.stats.distance += Math.hypot(p.x - ox, p.z - oz);
  }

  collideProps(p) {
    const g = this.game;
    for (const w of g.world.walls) {
      const r = w.collide(p);
      if (r === 'edge' && this.mode === 'walk') this.edgeWall = w;
    }
    const trees = g.treesNear(p.x, p.z);
    if (trees) for (const t of trees) {
      const dx = p.x - t.x, dz = p.z - t.z, d = Math.hypot(dx, dz), r = t.r + 0.3;
      if (d < r && d > 1e-4) { p.x = t.x + dx / d * r; p.z = t.z + dz / d * r; }
    }
  }

  /* 步道上有台阶与固定绳，可以走更陡的坡 */
  walkLimit() { return this.onTrail() ? 80 : this.walkable; }
  onTrail() { return this.T.trailDistAt(this.pos.x, this.pos.z) < 2.8; }

  stepWalk(dt, input, md, up, W) {
    const v = this.vel, n = this.normal;
    this.braking = false;
    if (this.moving) {
      const upDot = md.dot(up), sf = Math.min(1.5, this.slope / this.walkable);
      if (this.slope > this.walkable) this.stamina -= (2.5 + (this.slope - this.walkable) * 0.15) * Math.max(0, upDot) * this.diff.drain * dt; // 陡峭台阶/固定绳路段
      let f = Math.max(0.3, 1 - 0.45 * Math.max(0, upDot) * sf + 0.12 * Math.max(0, -upDot) * sf);
      if (this.mat === MAT.SNOW) f *= 0.82; else if (this.mat === MAT.ICE) f *= 0.7; else if (this.mat === MAT.DIRT && this.T.trailMaskAt(this.pos.x, this.pos.z) > 0.5) f *= 1.08;
      // 顶风更慢
      f *= 1 - clamp(-(W.wind.x * md.x + W.wind.z * md.z) / 40, -0.1, 0.3);
      this.sprinting = input.sprint && this.stamina > 2;
      const spd = 3.3 * (this.sprinting ? 1.7 : 1) * f;
      v.lerp(this._tmp.copy(md).multiplyScalar(spd), Math.min(1, 9 * dt));
      if (this.sprinting) this.stamina -= 9 * this.diff.drain * dt; else if (this.slope <= this.walkable) this.stamina += 5 * dt;
      this.facing.set(md.x, 0, md.z);
    } else {
      this.sprinting = false;
      v.multiplyScalar(Math.exp(-14 * dt));
      this.stamina += 12 * dt;
    }
    v.addScaledVector(n, -v.dot(n));
    this.lunge.set(0, 0, 0);
    if (input.jumpPressed && this.jumpCooldown <= 0 && this.stamina > 5 && !this.action) {
      v.y = Math.max(v.y, 0) + 4.8;
      this.jumpCooldown = 0.35; this.mode = 'air'; this.airTime = 0; this.pos.y += 0.05; this.stamina -= 5;
      this.emit('jump');
    }
  }

  climbDrainRate(W, slope = this.slope, mat = this.mat) {
    const steepF = clamp((slope - this.walkable) / (this.climbMax - this.walkable), 0, 1);
    const windF = 1 + (W.windSpeed / 14) * (W.blizzard ? 1.3 : 1);
    return 6 * this.diff.drain * (0.3 + 0.7 * steepF) * MAT_CLIMB_COST[mat] * windF;
  }

  stepScramble(dt, input, md, up, W) {
    const v = this.vel, n = this.normal;
    this.braking = false; this.sprinting = false;
    const steepF = clamp((this.slope - this.walkable) / (this.climbMax - this.walkable), 0, 1);
    const matF = MAT_CLIMB_COST[this.mat];
    if (this.moving) {
      const upDot = md.dot(up);
      let spd = 1.5 * (1 - 0.3 * steepF) * (this.mat === MAT.SNOW ? 0.85 : 1);
      if (upDot < -0.3) spd *= 1.3;
      v.lerp(this._tmp.copy(md).multiplyScalar(spd), Math.min(1, 12 * dt));
      let drain = this.climbDrainRate(W);
      if (upDot < 0) drain *= 0.35 + 0.3 * (1 + upDot);
      this.stamina -= drain * dt;
    } else {
      v.multiplyScalar(Math.exp(-16 * dt));
      if (this.slope < this.restSlope) this.stamina += 5 * dt / matF;
      else this.stamina -= 1.5 * this.diff.drain * matF * (0.5 + steepF) * dt;
    }
    if (input.jumpPressed && this.stamina >= 12 && this.lunge.lengthSq() < 0.5) {
      this.lunge.copy(up).multiplyScalar(5.5); this.stamina -= 12; this.emit('lunge');
    }
    v.addScaledVector(n, -v.dot(n));
    this.facing.set(-n.x, 0, -n.z);
    if (this.stamina < 0) this.stamina = 0;
  }

  stepSlide(dt, input, md, up) {
    const v = this.vel, n = this.normal;
    this.slideTime += dt; this.sprinting = false;
    v.y -= G * dt;
    const vn = v.dot(n); if (vn < 0) v.addScaledVector(n, -vn);
    const cosT = Math.max(0.05, n.y);
    let mu = MAT_FRICTION[this.mat];
    this.braking = input.jumpHeld;
    if (this.braking) { mu += MAT_BRAKE[this.mat] * (this.stamina > 0 ? 1 : 0.65); if (this.stamina > 0) this.stamina -= 4 * dt; }
    if (this.moving) v.addScaledVector(md, 2.0 * dt);
    const spd = v.length();
    if (spd > 1e-4) { const dec = mu * G * cosT * dt; if (dec >= spd) v.set(0, 0, 0); else v.multiplyScalar((spd - dec) / spd); }
    const s2 = v.length();
    if (s2 > 13) this.hurt((s2 - 13) * 0.6 * dt, 'slide');
    if (s2 < 0.8) this.stamina += 3 * dt;
    this.facing.set(-n.x, 0, -n.z);
    if (s2 < 2.0) {
      const iceSteep = this.mat === MAT.ICE && this.slope > 40;
      if (this.slope <= this.walkLimit()) { this.mode = 'walk'; this.emit('recover', { drop: this.slideStartY - this.pos.y }); }
      else if (this.slope <= this.climbMax && this.stamina > 6 && !iceSteep && (this.braking || this.moving || this.slideTime > 1.2)) {
        this.mode = 'scramble'; v.set(0, 0, 0); this.emit('regrab', { drop: this.slideStartY - this.pos.y });
      }
    }
    if (this.stamina < 0) this.stamina = 0;
  }

  land() {
    const v = this.vel, n = this.normal;
    const impact = Math.max(0, -v.dot(n));
    v.addScaledVector(n, -v.dot(n));
    let dmg = 0;
    if (impact > 7.5) { dmg = Math.pow(impact - 7.5, 1.3) * 3.2; if (dmg > 10) this.stats.falls++; this.hurt(dmg, 'fall'); }
    this.emit('land', { impact, dmg: dmg * this.diff.fall });
    this.rope = null;
    if (!this.alive) return;
    const iceSteep = this.mat === MAT.ICE && this.slope > 40;
    if (this.slope <= this.walkLimit()) this.mode = 'walk';
    else if (this.slope <= this.climbMax && this.stamina > 6 && impact < 7 && v.length() < 4 && !iceSteep) { this.mode = 'scramble'; v.set(0, 0, 0); }
    else { this.mode = 'slide'; this.slideTime = 0; this.slideStartY = this.pos.y; }
    this.airTime = 0;
  }

  /* ---------------- 攀岩 ---------------- */
  canGrabWall() {
    if (this.mode !== 'walk' && this.mode !== 'scramble') return null;
    for (const w of this.game.world.walls) {
      const l = w.toLocal(this.pos);
      if (Math.abs(l.a) > w.W / 2 - 0.4) continue;
      if (l.y < 1.2 && l.y > -1.5) {
        const fb = w.faceB(l.a, 1.2);
        if (l.b > fb - 1.7 && l.b <= fb) {
          const h = w.nearestHold(l.a, l.y + 1.8, 2.4, (x) => x.y < l.y + 2.6);
          if (h) return { wall: w, hold: h, from: 'bottom' };
        }
      } else if (l.y > w.H - 1.5 && l.b > 2.5 && l.b < 6.5) {
        const h = w.nearestHold(l.a, w.H - 0.45, 1.3, (x) => x.y > w.H - 1.4);
        if (h) return { wall: w, hold: h, from: 'top' };
      }
    }
    return null;
  }

  enterWall(g) {
    this.wall = g.wall; this.hold = g.hold; this.move = null; this.dyno = null; this.qInteract = false; this.qPiton = false;
    this.mode = 'wall'; this.vel.set(0, 0, 0); this.hold.hangT = 0;
    this.sessionPitons = [];
    this.wallStartA = g.hold.a;
    this.rope = null;
    const P = this.pose, w = this.wall;
    this.computeWallPose(0, true);
    this.emit('grab', { wall: true });
    if (g.from === 'top') this.emit('downclimb');
  }

  leaveWall() {
    this.wall = null; this.hold = null; this.move = null; this.dyno = null; this.sessionPitons = []; this.rope = null;
  }

  holdHands(h, out1, out2) {
    const w = this.wall;
    out1.copy(h.pos).addScaledVector(w.right, -0.1);
    out2.copy(h.pos).addScaledVector(w.right, 0.1);
  }

  computeWallPose(dt, snap) {
    const w = this.wall, P = this.pose, mv = this.move;
    const hl = this._a, hr = this._b;
    let ca, cy;
    const ease = (x) => x * x * (3 - 2 * x);
    if (mv) {
      const t = mv.t;
      const tb = ease(clamp((t - 0.15) / 0.8, 0, 1));
      ca = lerp(mv.from.a, mv.to.a, tb); cy = lerp(mv.from.y, mv.to.y, tb);
      const lead = mv.lead;
      const tl = ease(clamp(t / 0.6, 0, 1)), tt = ease(clamp((t - 0.55) / 0.45, 0, 1));
      const fa = this._tmp;
      this.holdHands(mv.from, hl, hr);
      const toL = new THREE.Vector3(), toR = new THREE.Vector3();
      this.holdHands(mv.to, toL, toR);
      const nrm = mv.to.nrm;
      const arcL = Math.sin(Math.PI * (lead === 'L' ? tl : tt)) * (mv.dyno ? 0.35 : 0.14);
      const arcR = Math.sin(Math.PI * (lead === 'R' ? tl : tt)) * (mv.dyno ? 0.35 : 0.14);
      P.handL.lerpVectors(hl, toL, lead === 'L' ? tl : tt).addScaledVector(nrm, arcL);
      P.handR.lerpVectors(hr, toR, lead === 'R' ? tl : tt).addScaledVector(nrm, arcR);
    } else {
      ca = this.hold.a; cy = this.hold.y;
      this.holdHands(this.hold, P.handL, P.handR);
    }
    const nrm = w.normalAt(ca, clamp(cy - 0.9, 0, w.H), this._n);
    const handsC = this._tmp.copy(P.handL).add(P.handR).multiplyScalar(0.5);
    const hang = (this.dyno ? 0.1 * this.dyno.charge : 0);
    // 身体（脚底根）位置
    const bodyN = new THREE.Vector3(nrm.x, 0, nrm.z).normalize();
    this.pos.copy(handsC).addScaledVector(bodyN, 0.36).setY(handsC.y - 1.62 - hang);
    this.facing.set(-bodyN.x, 0, -bodyN.z);
    this.normal.set(0, 1, 0);
    this.wallLean = clamp(Math.asin(clamp(nrm.y, -1, 1)) * 0.8 + 0.12, -0.3, 0.6);
    this.lookUp = mv ? 0.5 : 0;
    // 手肘/膝盖方向
    const upv = new THREE.Vector3(0, 1, 0);
    P.poleL.copy(handsC).addScaledVector(upv, -0.9).addScaledVector(w.right, -0.7).addScaledVector(bodyN, 0.4);
    P.poleR.copy(handsC).addScaledVector(upv, -0.9).addScaledVector(w.right, 0.7).addScaledVector(bodyN, 0.4);
    const hipC = this._n.copy(this.pos).setY(this.pos.y + 0.95);
    P.kneePoleL.copy(hipC).addScaledVector(bodyN, 0.9).addScaledVector(w.right, -0.6);
    P.kneePoleR.copy(hipC).addScaledVector(bodyN, 0.9).addScaledVector(w.right, 0.6);
    // 脚：跟随身体，距离理想位置太远时迈步
    const lfA = ca - 0.2, rfA = ca + 0.22, lfY = cy - 1.5, rfY = cy - 1.3;
    const idealL = w.surf(lfA, clamp(lfY, -0.5, w.H)).addScaledVector(bodyN, 0.07);
    const idealR = w.surf(rfA, clamp(rfY, -0.5, w.H)).addScaledVector(bodyN, 0.07);
    for (const [side, ideal] of [['L', idealL], ['R', idealR]]) {
      const f = this.feet[side];
      if (snap) { f.cur.copy(ideal); f.t = 1; }
      else if (f.t >= 1 && f.cur.distanceTo(ideal) > 0.3 && this.feet[side === 'L' ? 'R' : 'L'].t >= 1) { f.from.copy(f.cur); f.t = 0; }
      if (f.t < 1) {
        f.t = Math.min(1, f.t + dt / 0.22);
        f.cur.lerpVectors(f.from, ideal, ease(f.t)).addScaledVector(bodyN, Math.sin(Math.PI * f.t) * 0.12);
        if (f.t >= 1) this.emit('foot');
      }
    }
    P.footL.copy(this.feet.L.cur); P.footR.copy(this.feet.R.cur);
  }

  stepWall(dt, input, W) {
    const w = this.wall, D = this.diff;
    const wind = 1 + W.windSpeed / 20 + (W.blizzard ? 0.3 : 0);
    const lean = Math.max(0, -w.normalAt(this.hold.a, this.hold.y, this._n).y); // 悬垂程度
    const chalk = this.chalkT > 0 ? 0.5 : 1;
    this.wallHint = '';
    if (input.interact) this.qInteract = true;
    if (input.piton) this.qPiton = true;
    if (this.move) {
      const mv = this.move;
      mv.t += dt / mv.dur;
      if (mv.t >= 1) {
        this.hold = mv.to; this.hold.hangT = 0; this.move = null;
        this.emit('grab', { wall: true, dyno: mv.dyno });
        if (mv.dyno) { this.stats.dynos++; this.emit('dynoOK'); }
      }
      this.computeWallPose(dt, false);
      return;
    }
    const h = this.hold, info = HOLD_INFO[h.type];
    h.hangT = (h.hangT || 0) + dt;
    // 持续消耗/恢复
    let drain = info.drain;
    if (h.type === HOLD.SLOPER && h.hangT > 3) drain *= 1.8;
    if (drain > 0) this.stamina -= drain * D.drain * (1 + lean * 1.6) * wind * chalk * dt;
    else if (lean < 0.25) this.stamina = Math.min(this.maxStamina, this.stamina - drain * dt);
    else this.stamina -= 1.2 * lean * dt;
    if (h.type === HOLD.LOOSE && h.hangT > info.crumble) { w.breakHold(h); this.emit('crumble', { pos: h.pos.clone() }); return this.fallFromWall('crumble'); }
    if (this.stamina <= 0) { this.stamina = 0; return this.fallFromWall('stamina'); }
    // 打岩钉
    if (this.qPiton && !this.action && !this.dyno) {
      this.qPiton = false;
      if (this.inv.piton > 0) {
        this.action = { type: 'piton', t: 0, dur: 0.8, done: () => {
          if (!this.wall) return;
          this.inv.piton--; this.stats.pitons++;
          const pp = w.surf(h.a + 0.25, h.y - 0.35);
          const nrm = w.normalAt(h.a + 0.25, h.y - 0.35);
          const pit = { pos: pp.clone().addScaledVector(nrm, 0.02), y: h.y - 0.35, nrm };
          w.pitons.push(pit); this.sessionPitons.push(pit);
          this.emit('piton', { pit, wall: w });
        } };
        this.emit('hammer');
      } else this.emit('noPiton');
    }
    // 松手
    if (this.qInteract && !this.action) {
      this.qInteract = false;
      if (h.y < 2.2) { this.dismountBottom(); return; }
      return this.fallFromWall('letgo');
    }
    const ix = input.moveX, iy = input.moveZ;
    const il = Math.hypot(ix, iy);
    // 跳跃抓点（蓄力）
    if (input.jumpHeld && !this.action) {
      if (!this.dyno) this.dyno = { charge: 0, t: 0 };
      this.dyno.t += dt;
      const ph = (this.dyno.t / 0.9) % 2;
      this.dyno.charge = ph < 1 ? ph : 2 - ph;
      this.stamina -= 3 * dt;
      this.computeWallPose(dt, false);
      return;
    }
    if (this.dyno && !input.jumpHeld) {
      const c = this.dyno.charge; this.dyno = null;
      const dA = il > 0.1 ? ix / il : 0, dY = il > 0.1 ? iy / il : 1;
      const target = w.findHold(h, dA, dY, 2.35, 0.9);
      this.stamina -= 14 * D.drain;
      const perfect = c >= 0.72 && c <= 0.96;
      if (target && (perfect || (c > 0.5 && Math.random() < 0.3))) {
        this.move = { from: h, to: target, t: 0, dur: 0.38, lead: dA >= 0 ? 'R' : 'L', dyno: true };
        this.emit('dyno');
        return;
      }
      this.emit('dynoFail', { noTarget: !target });
      return this.fallFromWall('dyno');
    }
    if (il > 0.3 && !this.action) {
      const dA = ix / il, dY = iy / il;
      // 顶部翻越
      if (dY > 0.5 && h.y > w.H - 1.3) { this.startMantle(); return; }
      const target = w.findHold(h, dA, dY, 1.3);
      if (target) {
        const dist = Math.hypot(target.a - h.a, target.y - h.y);
        const cost = (1.2 + dist * 2.0) * HOLD_INFO[target.type].cost * (1 + lean) * D.drain * chalk;
        this.stamina -= cost * (dY < -0.3 ? 0.5 : 1);
        const lead = Math.abs(dA) > 0.3 ? (dA > 0 ? 'R' : 'L') : (this.lastLead === 'L' ? 'R' : 'L');
        this.lastLead = lead;
        this.move = { from: h, to: target, t: 0, dur: 0.42 + dist * 0.22, lead, dyno: false };
        this.emit('reach');
      } else {
        if (dY < -0.5 && h.y < 2.2) { this.dismountBottom(); return; }
        this.wallHint = dY > 0.3 ? '够不着！按住【空格】蓄力，在绿色区域松开跳过去' : '这个方向没有可抓的岩点';
      }
    }
    this.computeWallPose(dt, false);
  }

  dismountBottom() {
    const w = this.wall, h = this.hold;
    const fb = w.faceB(h.a, 0.5);
    const p = w.point(h.a, 0, fb - 0.9);
    this.leaveWall();
    this.pos.copy(p); this.pos.y = this.T.groundHeight(p.x, p.z) + 0.02;
    this.mode = 'walk'; this.vel.set(0, 0, 0);
    this.emit('dismount');
  }

  startMantle() {
    const w = this.wall, h = this.hold;
    const a = clamp(h.a, -w.W / 2 + 1, w.W / 2 - 1);
    const top = w.point(a, 0, 5.2); top.y = this.T.getHeight(top.x, top.z);
    this.mantle = { from: this.pos.clone(), to: top, t: 0, wall: w, freeSolo: this.sessionPitons.length === 0 };
    this.mode = 'mantle';
    this.emit('mantle');
  }

  stepMantle(dt) {
    const m = this.mantle;
    m.t += dt / 1.1;
    const t = clamp(m.t, 0, 1);
    const up = smoothstep(0, 0.6, t), fw = smoothstep(0.35, 1, t);
    this.pos.set(lerp(m.from.x, m.to.x, fw), lerp(m.from.y, m.to.y + 0.3, up) - (t > 0.8 ? (t - 0.8) * 1.5 : 0), lerp(m.from.z, m.to.z, fw));
    if (m.t >= 1) {
      this.pos.copy(m.to);
      const w = m.wall;
      this.leaveWall();
      this.mode = 'walk'; this.vel.set(0, 0, 0);
      this.stats.walls++;
      this.emit('topout', { wall: w, freeSolo: m.freeSolo });
      this.mantle = null;
    }
  }

  fallFromWall(reason) {
    const w = this.wall;
    const last = this.sessionPitons.length ? this.sessionPitons[this.sessionPitons.length - 1] : null;
    const bodyN = new THREE.Vector3(w.n.x, 0, w.n.z);
    this.stats.falls++;
    this.emit('wallFall', { reason });
    const pitons = this.sessionPitons.slice();
    const startA = this.wallStartA;
    this.wall = null; this.hold = null; this.move = null; this.dyno = null;
    this.mode = 'air'; this.airTime = 0;
    this.vel.copy(bodyN).multiplyScalar(1.2); this.vel.y = 0.5;
    this.pos.addScaledVector(bodyN, 0.25);
    if (last) {
      const harness = this.pos.clone().setY(this.pos.y + 0.95);
      this.rope = { wall: w, anchor: last.pos.clone(), len: harness.distanceTo(last.pos) + 0.9, caught: false, pitons, startA, stillT: 0 };
    }
  }

  ropeConstraint(dt) {
    const r = this.rope, p = this.pos;
    const harness = this._tmp.copy(p).setY(p.y + 0.95);
    const d = this._a.subVectors(harness, r.anchor);
    const L = d.length();
    if (L > r.len) {
      d.divideScalar(L);
      p.addScaledVector(d, r.len - L);
      const vr = this.vel.dot(d);
      if (vr > 0) {
        if (!r.caught) {
          r.caught = true;
          const sp = this.vel.length();
          this.hurt(Math.max(0, sp - 7) * 1.2, 'rope');
          this.emit('ropeCatch', { speed: sp });
        }
        this.vel.addScaledVector(d, -vr * 1.15);
      }
      this.vel.multiplyScalar(Math.exp(-2.5 * dt));
      // 被墙面挡住
      const w = r.wall; w.collide(p);
      if (this.vel.length() < 1.3) r.stillT += dt; else r.stillT = 0;
      if (r.caught && r.stillT > 0.35) { this.mode = 'rope'; this.vel.set(0, 0, 0); }
    }
  }

  stepRope(dt, input) {
    const r = this.rope, w = r.wall, p = this.pos;
    // 悬挂位置：锚点正下方，离墙一点
    const l = w.toLocal(r.anchor);
    const fb = w.faceB(l.a, clamp(l.y - r.len, 0, w.H));
    const hang = w.point(l.a, l.y - r.len - 0.95 + 0.0, fb - 0.55);
    p.lerp(hang, 1 - Math.exp(-6 * dt));
    this.facing.set(-w.n.x, 0, -w.n.z);
    this.stamina = Math.min(this.maxStamina, this.stamina + 5 * dt);
    this.wallHint = '';
    const ground = this.T.getHeight(p.x, p.z);
    if (input.moveZ > 0.5 || input.interact) {
      const lp = w.toLocal(p);
      const h = w.nearestHold(lp.a, lp.y + 1.9, 1.6);
      if (h && this.stamina > 8) {
        this.stamina -= 6;
        const pitons = r.pitons;
        this.wall = w; this.hold = h; this.hold.hangT = 0; this.mode = 'wall'; this.rope = null; this.move = null;
        this.sessionPitons = pitons; this.wallStartA = r.startA;
        this.computeWallPose(0, true);
        this.emit('grab', { wall: true });
        return;
      } else if (!h) this.wallHint = '附近没有岩点——按【S】放绳下降';
    }
    if (input.moveZ < -0.5) {
      r.len += 1.8 * dt;
      if (p.y <= ground + 0.15) { this.rope = null; this.mode = 'walk'; p.y = ground; this.emit('lowered'); }
    }
    if (p.y < ground) p.y = ground;
  }

  /* ---------------- 状态与生存 ---------------- */
  temperature(W) {
    const st = this.stage;
    const disp = st.altBase + this.pos.y * st.altScale;
    const night = this.game.world ? this.game.world.night : 0;
    return 26 - disp / 1000 * 6.5 - night * 9 - W.windSpeed * 0.55 - W.intensity * 12;
  }

  postUpdate(dt, input, W) {
    const a = this.aff, D = this.diff, T = this.T;
    this.chalkT = Math.max(0, this.chalkT - dt);
    this.oxygenT = Math.max(0, this.oxygenT - dt);
    // 动画相位
    if (this.mode === 'walk') this.phase += this.speed * dt * (this.sprinting ? 2.4 : 2.9);
    else if (this.mode === 'scramble') this.phase += this.speed * dt * 3.2;
    if (!this.alive) return;
    const exert = (this.mode === 'scramble' || this.mode === 'wall' || this.sprinting) ? 1 : this.moving ? 0.4 : 0;
    const resting = this.mode === 'camp' || this.mode === 'sleep';
    // 饥饿
    a.hunger += (0.03 + exert * 0.03) * D.aff * dt * (resting ? 0.5 : 1);
    // 寒冷
    const temp = this.tempC = this.temperature(W);
    let coldRate = 0;
    if (this.nearFire) coldRate = -3.5;
    else if (this.mode === 'sleep') coldRate = -2;
    else if (temp < 4) coldRate = (4 - temp) * 0.011 * D.aff * (1 - exert * 0.3) * (this.mat === MAT.SNOW ? 1.1 : 1);
    else if (temp > 10) coldRate = -0.25;
    a.cold += coldRate * dt;
    // 伤势自然恢复
    if (a.cold < 25 && exert < 0.5) a.injury -= (resting ? 0.4 : 0.04) * dt;
    // 疲惫
    const h = W.hour % 24, late = (h > 22 || h < 5) ? 2 : 1;
    if (this.mode === 'camp') a.fatigue -= 0.08 * dt;
    else if (this.mode !== 'sleep') a.fatigue += 0.011 * late * D.aff * dt;
    // 缺氧
    const dz = this.stage.deathZone;
    if (dz && this.pos.y > T.summit.y * dz && this.oxygenT <= 0) a.hypoxia += 0.22 * D.aff * (1 + exert * 0.5) * dt;
    else a.hypoxia -= (this.oxygenT > 0 ? 4 : 1) * dt;
    for (const k in a) a[k] = clamp(a[k], 0, 100);
    this.recomputeMax();
    this.stamina = clamp(this.stamina, 0, this.maxStamina);
    if (this.affTotal >= 99.5) {
      let worst = 'hunger'; for (const k in a) if (a[k] > a[worst]) worst = k;
      this.die(worst);
    }
    // 头灯电量
    if (this.lamp) {
      this.battery -= dt / 2.4;
      if (this.battery <= 0) {
        if (this.inv.battery > 0) { this.inv.battery--; this.battery = 100; this.emit('battery'); }
        else { this.battery = 0; this.lamp = false; this.emit('lampDead'); }
      }
    }
    // 冰裂缝
    const cv = T.crevasses.length ? T.inCrevasse(this.pos.x, this.pos.z) : null;
    if (cv && this.pos.y < cv.lipY - 2.2 && this.mode !== 'wall') { this.emit('crevasse'); }
    else if ((this.mode === 'walk') && this.slope < 30) {
      this.safeTimer += dt;
      if (this.safeTimer > 1.5 && !T.inCrevasse(this.pos.x, this.pos.z, 2)) { this.safeTimer = 0; this.lastSafe.copy(this.pos); }
    }
    this.stats.maxAlt = Math.max(this.stats.maxAlt, this.pos.y);
    this.axeOut = this.mode === 'slide' || this.mode === 'scramble' || (this.mode === 'wall' && this.wall && this.wall.icy);
  }

  /* ---------------- 物品 ---------------- */
  useItem(key) {
    if (!this.alive || this.action) return false;
    const inv = this.inv, a = this.aff;
    if (!inv[key]) { this.emit('noItem', { key }); return false; }
    const busyModes = ['air', 'slide', 'rope', 'mantle', 'sleep'];
    if (busyModes.includes(this.mode)) return false;
    const onWall = this.mode === 'wall';
    switch (key) {
      case 'bar': inv.bar--; a.hunger = Math.max(0, a.hunger - 25); this.recomputeMax(); this.stamina = Math.min(this.maxStamina, this.stamina + 20); break;
      case 'thermos': inv.thermos--; a.cold = Math.max(0, a.cold - 35); break;
      case 'bandage': if (onWall) return false; inv.bandage--; a.injury = Math.max(0, a.injury - 30); break;
      case 'chalk': inv.chalk--; this.chalkT = 25; break;
      case 'oxygen': inv.oxygen--; this.oxygenT = 60; a.hypoxia = 0; break;
      default: return false;
    }
    this.emit('used', { key });
    if (!onWall && this.mode === 'walk') { this.action = { type: 'use', t: 0, dur: 0.9 }; }
    return true;
  }
}
