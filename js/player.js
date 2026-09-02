/* 玩家：坡度驱动的行走 / 攀爬 / 滑坠 / 空中 物理与生存状态 */
const G = 9.81;
const DEG = Math.PI / 180;
const MODE = { WALK: 'walk', CLIMB: 'climb', SLIDE: 'slide', AIR: 'air', DEAD: 'dead' };
const MODE_NAME = { walk: '行走', climb: '攀爬', slide: '滑坠！', air: '腾空', dead: '遇难' };
// 按材质：滑动摩擦 / 制动附加摩擦 / 攀爬体力倍率
const MAT_FRICTION = [0.55, 0.55, 0.68, 0.26, 0.06];
const MAT_BRAKE = [0.85, 0.85, 0.9, 0.9, 0.45];
const MAT_CLIMB_COST = [1.0, 1.05, 1.0, 1.35, 2.0];

class Player {
  constructor(game) {
    this.game = game;
    this.terrain = game.terrain;
    this.diff = game.diff;
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.normal = new THREE.Vector3(0, 1, 0);
    this.moveDir = new THREE.Vector3();
    this.lunge = new THREE.Vector3();
    this.facing = new THREE.Vector3(0, 0, 1);
    this.mode = MODE.WALK;
    this.slope = 0; this.mat = 0; this.uphillDot = 0;
    this.maxStamina = this.diff.stamina; this.stamina = this.maxStamina;
    this.health = 100; this.warmth = 100;
    this.moving = false; this.sprinting = false; this.braking = false; this.gripLost = false; this.freezing = false;
    this.speed = 0; this.phase = 0; this.airTime = 0; this.deadTimer = 0; this.slideTime = 0; this.slideStartY = 0;
    this.walkable = 42; this.climbMax = this.diff.terrain.maxSlopeDeg + 1.5; this.restSlope = 64;
    this.jumpCooldown = 0;
    this.events = [];
    this.stats = { falls: 0, damageTaken: 0, maxAlt: 0, deaths: 0 };
    this.atCamp = false;
    this._up = new THREE.Vector3(); this._down = new THREE.Vector3(); this._tmp = new THREE.Vector3();
  }

  respawn(p) {
    this.pos.copy(p); this.pos.y = this.terrain.getHeight(p.x, p.z) + 0.02;
    this.vel.set(0, 0, 0); this.lunge.set(0, 0, 0);
    this.mode = MODE.WALK; this.stamina = this.maxStamina; this.health = 100; this.warmth = 100;
    this.deadTimer = 0; this.gripLost = false; this.airTime = 0;
  }

  emit(type, data) { this.events.push({ type, data: data || {} }); }

  hurt(amount, why, silent) {
    if (this.mode === MODE.DEAD || amount <= 0) return;
    this.health -= amount;
    this.stats.damageTaken += amount;
    if (!silent) this.emit('damage', { amount, why });
    if (this.health <= 0) { this.health = 0; this.mode = MODE.DEAD; this.deadTimer = 0; this.stats.deaths++; this.emit('dead', { why }); }
  }

  update(dt, input, weather) {
    const n = Math.max(1, Math.ceil(dt / (1 / 120)));
    const sdt = dt / n;
    for (let k = 0; k < n; k++) { this.step(sdt, input, weather); input.jumpPressed = false; }
    this.postUpdate(dt, weather);
  }

  step(dt, input, weather) {
    const T = this.terrain, p = this.pos, v = this.vel, n = this.normal;
    const lim = T.size / 2 - 6;
    p.x = clamp(p.x, -lim, lim); p.z = clamp(p.z, -lim, lim);
    if (this.jumpCooldown > 0) this.jumpCooldown -= dt;

    if (this.mode === MODE.DEAD) {
      this.deadTimer += dt;
      v.multiplyScalar(Math.exp(-4 * dt));
      p.addScaledVector(v, dt);
      const h = T.getHeight(p.x, p.z); if (p.y < h) p.y = h;
      return;
    }

    const h = T.getHeight(p.x, p.z);
    T.getNormal(p.x, p.z, n);
    this.slope = Math.acos(clamp(n.y, -1, 1)) / DEG;
    this.mat = T.getMaterial(p.x, p.z);

    // 相机相对的输入方向
    const yaw = input.camYaw;
    const fx = -Math.sin(yaw), fz = -Math.cos(yaw), rx = Math.cos(yaw), rz = -Math.sin(yaw);
    const mx = fx * input.moveZ + rx * input.moveX, mz = fz * input.moveZ + rz * input.moveX;
    const mlen = Math.hypot(mx, mz);
    this.moving = mlen > 0.01;
    const md = this.moveDir;
    if (this.moving) { md.set(mx / mlen, 0, mz / mlen); md.addScaledVector(n, -md.dot(n)); if (md.lengthSq() > 1e-6) md.normalize(); }
    else md.set(0, 0, 0);

    // 上坡方向（切面内）
    const up = this._up.set(-n.x, 0, -n.z);
    up.addScaledVector(n, -up.dot(n));
    if (up.lengthSq() > 1e-6) up.normalize(); else up.set(0, 0, 1);
    this.uphillDot = this.moving ? md.dot(up) : 0;

    const wind = weather.wind, ws = weather.windSpeed;

    if (this.mode === MODE.AIR) {
      this.airTime += dt;
      v.y -= G * dt;
      v.x += (wind.x * 0.12 - v.x * 0.08) * dt; v.z += (wind.z * 0.12 - v.z * 0.08) * dt;
      if (this.moving) { v.x += (mx / mlen) * 3.0 * dt; v.z += (mz / mlen) * 3.0 * dt; }
      p.addScaledVector(v, dt);
      const h2 = T.getHeight(p.x, p.z);
      if (p.y <= h2) { p.y = h2; T.getNormal(p.x, p.z, n); this.slope = Math.acos(clamp(n.y, -1, 1)) / DEG; this.land(); }
      this.speed = v.length();
      return;
    }

    // 地面：决定模式
    const stamOK = this.stamina > 0;
    const iceSteep = (this.mat === MAT.ICE && this.slope > 42);
    let mode = this.mode;
    if (mode !== MODE.SLIDE) {
      if (this.slope <= this.walkable) mode = MODE.WALK;
      else if (this.slope <= this.climbMax && stamOK && !iceSteep) {
        if (mode !== MODE.CLIMB) this.emit('grab');
        mode = MODE.CLIMB;
      } else {
        if (mode === MODE.CLIMB) {
          this.gripLost = true; this.stats.falls++;
          this.emit('gripLost', { reason: !stamOK ? 'stamina' : iceSteep ? 'ice' : 'steep' });
        }
        mode = MODE.SLIDE; this.slideTime = 0; this.slideStartY = p.y;
      }
    }
    this.mode = mode;

    if (mode === MODE.WALK) this.stepWalk(dt, input, md, up);
    else if (mode === MODE.CLIMB) this.stepClimb(dt, input, md, up, ws, weather);
    else this.stepSlide(dt, input, md, up);

    // 积分与贴地
    p.addScaledVector(v, dt);
    if (this.lunge.lengthSq() > 1e-4) { p.addScaledVector(this.lunge, dt); this.lunge.multiplyScalar(Math.exp(-4.5 * dt)); }
    const h2 = T.getHeight(p.x, p.z);
    const gap = p.y - h2;
    if (this.mode === MODE.AIR) { /* 跳跃已切换 */ }
    else if (gap <= 0) p.y = h2;
    else if (gap < (this.mode === MODE.WALK ? 0.75 : 1.3)) p.y = h2;
    else { this.mode = MODE.AIR; this.airTime = 0; }
    this.speed = v.length();
  }

  stepWalk(dt, input, md, up) {
    const D = this.diff, v = this.vel, n = this.normal;
    this.braking = false;
    if (this.moving) {
      const upDot = md.dot(up);
      const sf = this.slope / this.walkable;
      let f = 1 - 0.5 * Math.max(0, upDot) * sf + 0.15 * Math.max(0, -upDot) * sf;
      if (this.mat === MAT.SNOW) f *= 0.85; else if (this.mat === MAT.ICE) f *= 0.7;
      this.sprinting = input.sprint && this.stamina > 1;
      const spd = D.walkSpeed * (this.sprinting ? 1.65 : 1) * f;
      const t = this._tmp.copy(md).multiplyScalar(spd);
      v.lerp(t, Math.min(1, 9 * dt));
      if (this.sprinting) this.stamina -= 7 * dt; else this.stamina += D.staminaRegen * 0.45 * dt;
      this.facing.set(md.x, 0, md.z);
    } else {
      this.sprinting = false;
      v.multiplyScalar(Math.exp(-14 * dt));
      this.stamina += D.staminaRegen * dt;
    }
    // 保持切向（下坡时轻微贴地）
    v.addScaledVector(n, -v.dot(n));
    this.lunge.set(0, 0, 0);
    if (input.jumpPressed && this.jumpCooldown <= 0 && this.stamina > 4) {
      v.y = Math.max(v.y, 0) + 4.6;
      this.jumpCooldown = 0.35; this.mode = MODE.AIR; this.airTime = 0; this.pos.y += 0.05; this.stamina -= 4;
      this.emit('jump');
    }
  }

  /* 当前地形下向上攀爬每秒消耗的体力（用于 HUD 预览） */
  climbDrainRate(weather, slope = this.slope, mat = this.mat) {
    const D = this.diff;
    const steepF = clamp((slope - this.walkable) / (this.climbMax - this.walkable), 0, 1);
    const windF = 1 + (weather.windSpeed / 14) * (weather.blizzard ? 1.3 : 1);
    return D.climbDrain * (0.3 + 0.7 * steepF) * MAT_CLIMB_COST[mat] * windF;
  }

  stepClimb(dt, input, md, up, ws, weather) {
    const D = this.diff, v = this.vel, n = this.normal;
    this.braking = false; this.sprinting = false;
    const steepF = clamp((this.slope - this.walkable) / (this.climbMax - this.walkable), 0, 1);
    const windF = 1 + (ws / 14) * (weather.blizzard ? 1.3 : 1);
    const matF = MAT_CLIMB_COST[this.mat];
    if (this.moving) {
      const upDot = md.dot(up);
      let spd = D.climbSpeed * (1 - 0.3 * steepF) * (this.mat === MAT.SNOW ? 0.85 : 1);
      if (upDot < -0.3) spd *= 1.3; // 下攀更快
      const t = this._tmp.copy(md).multiplyScalar(spd);
      v.lerp(t, Math.min(1, 12 * dt));
      let drain = this.climbDrainRate(weather);
      if (upDot < 0) drain *= 0.35 + 0.3 * (1 + upDot);
      this.stamina -= drain * dt;
    } else {
      v.multiplyScalar(Math.exp(-16 * dt));
      if (this.slope < this.restSlope) this.stamina += D.staminaRegen * 0.5 * dt / matF;
      else this.stamina -= D.holdDrain * matF * windF * (0.5 + steepF) * dt;
    }
    if (input.jumpPressed && this.stamina >= 12 && this.lunge.lengthSq() < 0.5) {
      this.lunge.copy(up).multiplyScalar(5.5);
      this.stamina -= 12;
      this.emit('lunge');
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
    // 自我制动：即使体力耗尽也能制动，只是效果打折
    this.braking = input.jumpHeld;
    if (this.braking) {
      mu += MAT_BRAKE[this.mat] * (this.stamina > 0 ? 1 : 0.65);
      if (this.stamina > 0) this.stamina -= 4 * dt;
    }
    if (this.moving) v.addScaledVector(md, 2.0 * dt);
    const spd = v.length();
    if (spd > 1e-4) {
      const dec = mu * G * cosT * dt;
      if (dec >= spd) v.set(0, 0, 0); else v.multiplyScalar((spd - dec) / spd);
    }
    v.multiplyScalar(Math.exp(-0.012 * spd * dt));
    const s2 = v.length();
    if (s2 > 13) this.hurt((s2 - 13) * 0.7 * dt, 'slide', true);
    if (s2 < 0.8) this.stamina += this.diff.staminaRegen * 0.4 * dt; // 制动停住后可以喘口气
    this.facing.set(-n.x, 0, -n.z);
    if (s2 < 2.0) {
      const iceSteep = (this.mat === MAT.ICE && this.slope > 42);
      if (this.slope <= this.walkable) { this.mode = MODE.WALK; this.gripLost = false; this.emit('recover', { drop: this.slideStartY - this.pos.y }); }
      else if (this.slope <= this.climbMax && this.stamina > 6 && !iceSteep && (this.braking || this.moving || this.slideTime > 1.2)) {
        this.mode = MODE.CLIMB; v.set(0, 0, 0); this.gripLost = false; this.emit('regrab', { drop: this.slideStartY - this.pos.y });
      }
    }
    if (this.stamina < 0) this.stamina = 0;
  }

  land() {
    const v = this.vel, n = this.normal, D = this.diff;
    const impact = Math.max(0, -v.dot(n));
    v.addScaledVector(n, -v.dot(n));
    let dmg = 0;
    if (impact > 8) {
      dmg = Math.pow(impact - 8, 1.25) * 2.6 * D.fallDmg;
      if (dmg > 12) this.stats.falls++;
      this.hurt(dmg, 'fall');
    }
    this.emit('land', { impact, dmg });
    const iceSteep = (this.mat === MAT.ICE && this.slope > 42);
    if (this.slope <= this.walkable) this.mode = MODE.WALK;
    else if (this.slope <= this.climbMax && this.stamina > 6 && impact < 7 && v.length() < 4 && !iceSteep) { this.mode = MODE.CLIMB; v.set(0, 0, 0); }
    else { this.mode = MODE.SLIDE; this.slideTime = 0; this.slideStartY = this.pos.y; }
    this.airTime = 0;
  }

  postUpdate(dt, weather) {
    const D = this.diff, T = this.terrain;
    this.stamina = clamp(this.stamina, 0, this.maxStamina);
    // 动画相位
    if (this.mode === MODE.WALK) this.phase += this.speed * dt * (this.sprinting ? 2.4 : 2.9);
    else if (this.mode === MODE.CLIMB) this.phase += this.speed * dt * 3.2;
    // 体温
    const Hmax = T.summit.y;
    const altF = this.pos.y / Hmax;
    const cold = Math.max(0, (altF - D.coldLine) / (1 - D.coldLine));
    let rate;
    if (this.atCamp) rate = 30;
    else if (cold <= 0) rate = 3;
    else {
      const drain = D.coldRate * (0.25 + 1.75 * cold) * (1 + weather.windSpeed / 10) * (weather.blizzard ? 2.0 : 1) * (this.mat === MAT.SNOW ? 1.15 : 1);
      const exert = (this.moving && this.mode !== MODE.SLIDE) ? 0.7 : 0;
      rate = exert - drain;
    }
    this.warmth = clamp(this.warmth + rate * dt, 0, 100);
    this.freezing = this.warmth <= 0;
    if (this.freezing && this.mode !== MODE.DEAD) this.hurt(2.5 * dt, 'cold', true);
    // 生命恢复
    if (this.mode !== MODE.DEAD) {
      if (this.atCamp) this.health += 12 * dt;
      else if (this.warmth > 40 && (this.mode === MODE.WALK || this.mode === MODE.CLIMB)) this.health += 0.8 * dt;
      this.health = Math.min(100, this.health);
    }
    this.stats.maxAlt = Math.max(this.stats.maxAlt, this.pos.y);
  }
}
