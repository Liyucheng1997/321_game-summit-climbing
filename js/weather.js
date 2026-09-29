/* 时钟、天气（风、降雪、暴风雪）与落石 */
class Weather {
  constructor(stage, diff, seed, startHour) {
    this.stage = stage; this.diff = diff;
    this.cfg = stage.weather;
    this.noise = new Noise.Simplex2D(seed + 999);
    this.rnd = Noise.mulberry32(seed + 31);
    this.t = 0;
    this.hour = startHour;
    this.hoursPerSec = 24 / (stage.dayMinutes * 60);
    this.wind = new THREE.Vector3(); this.windSpeed = 0; this.windAngle = 0;
    this.baseAngle = this.rnd() * Math.PI * 2;
    this.blizzard = false; this.blizzardT = 0; this.blizzardDur = 0; this.warned = false;
    const b = this.cfg.blizzard;
    this.nextBlizzard = b ? rrange(this.rnd, b.first[0], b.first[1]) / diff.weather : Infinity;
    this.intensity = 0; this.snowfall = 0;
    this.events = [];
    this.day = 1;
  }
  get night() { const h = this.hour % 24; return h < 5.5 || h > 19.5; }
  get isNight() { return this.night; }

  skipTo(targetHour) {
    let h = this.hour % 24;
    let add = targetHour - h; if (add <= 0) add += 24;
    this.hour += add;
    this.day = 1 + Math.floor(this.hour / 24);
    // 睡觉期间暴风雪过去
    if (this.blizzard) { this.blizzard = false; this.intensity = 0; this.events.push('end'); this.nextBlizzard = 60; }
    return add;
  }

  update(dt, altF) {
    this.t += dt;
    this.hour += dt * this.hoursPerSec;
    this.day = 1 + Math.floor(this.hour / 24);
    const N = this.noise, t = this.t;
    const angle = this.baseAngle + 0.9 * N.noise(t * 0.012, 3.3);
    let gust = 0.5 + 0.5 * N.noise(t * 0.11, 7.7) + 0.14 * N.noise(t * 1.3, 9.1);
    if (this.cfg.gusty) gust += Math.max(0, N.noise(t * 0.05, 1.2)) * 0.8;
    let speed = this.cfg.windMax * this.diff.weather * (0.2 + 0.8 * altF) * (0.3 + 0.7 * clamp(gust, 0, 1.5));
    if (this.blizzard) speed *= 1.9;
    this.windSpeed = Math.max(0, speed);
    this.wind.set(Math.cos(angle) * this.windSpeed, 0, Math.sin(angle) * this.windSpeed);
    this.windAngle = Math.atan2(this.wind.x, this.wind.z);
    const b = this.cfg.blizzard;
    if (b) {
      if (!this.blizzard) {
        this.nextBlizzard -= dt;
        if (this.nextBlizzard < 15 && !this.warned && altF > 0.3) { this.warned = true; this.events.push('warn'); }
        if (this.nextBlizzard <= 0) {
          if (altF > 0.3) { this.blizzard = true; this.blizzardT = 0; this.blizzardDur = rrange(this.rnd, b.dur[0], b.dur[1]) * Math.sqrt(this.diff.weather); this.events.push('start'); }
          else this.nextBlizzard = 25;
        }
      } else {
        this.blizzardT += dt;
        if (this.blizzardT > this.blizzardDur) {
          this.blizzard = false; this.warned = false;
          this.nextBlizzard = rrange(this.rnd, b.gap[0], b.gap[1]) / this.diff.weather;
          this.events.push('end');
        }
      }
    }
    this.intensity = damp(this.intensity, this.blizzard ? 1 : 0, 0.3, dt);
    const snowLine = this.stage.terrain.snowLine;
    const baseSnow = this.cfg.snow ? clamp((altF - (snowLine - 0.1)) / 0.3, 0, 1) * 0.35 : 0;
    this.snowfall = clamp(baseSnow + this.intensity, 0, 1);
  }
}

/* ---------------- 落石 ---------------- */
class RockfallSystem {
  constructor(scene, terrain, rate, seed) {
    this.scene = scene; this.T = terrain; this.rate = rate;
    this.rnd = Noise.mulberry32(seed + 555);
    this.rocks = []; this.timer = 40; this.events = [];
    const mat = Models.VC(0.9, { color: 0x7a746c });
    for (let i = 0; i < 8; i++) {
      const r = 0.45 + this.rnd() * 0.5;
      const g = Models.rock(700 + i, 1); g.scale(r, r * 1.4, r);
      const m = new THREE.Mesh(g, mat); m.castShadow = true; m.visible = false;
      scene.add(m);
      this.rocks.push({ mesh: m, r, active: false, vel: new THREE.Vector3(), life: 0, still: 0 });
    }
    this.dust = [];
    this._n = new THREE.Vector3(); this._axis = new THREE.Vector3();
  }
  trySpawn(player) {
    const T = this.T, p = player.pos;
    if (p.y / T.summit.y < 0.18) return false;
    const free = this.rocks.find(r => !r.active);
    if (!free) return false;
    for (let k = 0; k < 40; k++) {
      const ang = this.rnd() * Math.PI * 2, d = 25 + this.rnd() * 55;
      const x = p.x + Math.cos(ang) * d, z = p.z + Math.sin(ang) * d;
      if (Math.abs(x) > 480 || Math.abs(z) > 480) continue;
      const h = T.getHeight(x, z);
      if (h < p.y + 12 || h > p.y + 80) continue;
      const slope = T.getSlopeDeg(x, z);
      if (slope < 34 || slope > 76) continue;
      const mat = T.getMaterial(x, z);
      if (mat !== MAT.ROCK && mat !== MAT.DIRT) continue;
      const n = T.getNormal(x, z, this._n);
      const dx = p.x - x, dz = p.z - z, dl = Math.hypot(dx, dz);
      if ((n.x * dx + n.z * dz) / (Math.hypot(n.x, n.z) * dl + 1e-6) < 0.5) continue;
      free.active = true; free.life = 0; free.still = 0; free.mesh.visible = true;
      free.mesh.position.set(x, h + free.r + 0.5, z);
      free.vel.set(n.x, 0, n.z).normalize().multiplyScalar(2 + this.rnd() * 3);
      this.events.push({ type: 'spawn', pos: free.mesh.position.clone() });
      return true;
    }
    return false;
  }
  update(dt, player, hitCb) {
    if (this.rate <= 0) return;
    this.timer -= dt;
    if (this.timer <= 0) {
      this.timer = (8 + this.rnd() * 14) / this.rate;
      if (player.alive && player.mode !== 'camp') this.trySpawn(player);
    }
    const T = this.T, n = this._n;
    for (const rk of this.rocks) {
      if (!rk.active) continue;
      const m = rk.mesh, v = rk.vel, pos = m.position;
      rk.life += dt;
      v.y -= G * dt;
      pos.addScaledVector(v, dt);
      const h = T.getHeight(pos.x, pos.z);
      if (pos.y - rk.r < h) {
        pos.y = h + rk.r;
        T.getNormal(pos.x, pos.z, n);
        const vn = v.dot(n);
        if (vn < 0) { v.addScaledVector(n, -vn * 1.35); if (-vn > 4) this.events.push({ type: 'bounce', pos: pos.clone(), v: -vn }); }
        v.multiplyScalar(Math.exp(-0.5 * dt));
      }
      const spd = v.length();
      if (spd > 0.05) { this._axis.set(0, 1, 0).cross(v).normalize(); m.rotateOnWorldAxis(this._axis, spd / rk.r * dt); }
      rk.still = spd < 0.6 ? rk.still + dt : 0;
      if (player.alive) {
        const dx = pos.x - player.pos.x, dy = pos.y - (player.pos.y + 0.9), dz = pos.z - player.pos.z;
        if (dx * dx + dy * dy + dz * dz < (rk.r + 0.55) ** 2 && spd > 2) { hitCb(rk, spd); rk.active = false; m.visible = false; }
      }
      if (rk.still > 1.5 || rk.life > 25 || Math.abs(pos.x) > 490 || Math.abs(pos.z) > 490) { rk.active = false; m.visible = false; }
    }
  }
  clear() { for (const r of this.rocks) { r.active = false; r.mesh.visible = false; } }
}
