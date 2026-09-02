/* 世界：天空、光照、植被、营地、补给、雪花、天气与落石 */

/* ---------------- 天气 ---------------- */
class Weather {
  constructor(diff, seed) {
    this.diff = diff;
    this.noise = new Noise.Simplex2D(seed + 999);
    this.rnd = Noise.mulberry32(seed + 31);
    this.t = 0;
    this.wind = new THREE.Vector3();
    this.windSpeed = 0; this.windAngle = 0;
    this.baseAngle = this.rnd() * Math.PI * 2;
    this.blizzard = false; this.blizzardT = 0; this.blizzardDur = 0;
    const b = diff.blizzard;
    this.nextBlizzard = b ? b.first[0] + this.rnd() * (b.first[1] - b.first[0]) : Infinity;
    this.warned = false;
    this.intensity = 0;   // 暴风雪视觉强度 0..1
    this.snowfall = 0;    // 降雪量 0..1
    this.events = [];
  }
  update(dt, altF) {
    this.t += dt;
    const N = this.noise, t = this.t;
    const angle = this.baseAngle + 0.9 * N.noise(t * 0.012, 3.3);
    const gust = 0.5 + 0.5 * N.noise(t * 0.11, 7.7) + 0.12 * N.noise(t * 1.3, 9.1);
    let speed = this.diff.windMax * (0.2 + 0.8 * altF) * (0.3 + 0.7 * clamp(gust, 0, 1.2));
    if (this.blizzard) speed *= 1.9;
    this.windSpeed = Math.max(0, speed);
    this.wind.set(Math.cos(angle) * this.windSpeed, 0, Math.sin(angle) * this.windSpeed);
    this.windAngle = Math.atan2(this.wind.x, this.wind.z);

    const b = this.diff.blizzard;
    if (b) {
      if (!this.blizzard) {
        this.nextBlizzard -= dt;
        if (this.nextBlizzard < 10 && !this.warned && altF > 0.3) { this.warned = true; this.events.push('warn'); }
        if (this.nextBlizzard <= 0) {
          if (altF > 0.3) { this.blizzard = true; this.blizzardT = 0; this.blizzardDur = b.dur[0] + this.rnd() * (b.dur[1] - b.dur[0]); this.events.push('start'); }
          else this.nextBlizzard = 20; // 海拔太低，稍后再试
        }
      } else {
        this.blizzardT += dt;
        if (this.blizzardT > this.blizzardDur) {
          this.blizzard = false; this.warned = false;
          this.nextBlizzard = b.gap[0] + this.rnd() * (b.gap[1] - b.gap[0]);
          this.events.push('end');
        }
      }
    }
    const target = this.blizzard ? 1 : 0;
    this.intensity += (target - this.intensity) * Math.min(1, dt * 0.25);
    const snowLine = this.diff.terrain.snowLine;
    this.snowfall = clamp(clamp((altF - (snowLine - 0.12)) / 0.3, 0, 1) * 0.45 + this.intensity, 0, 1);
  }
}

/* ---------------- 落石 ---------------- */
class RockfallSystem {
  constructor(scene, terrain, rate, seed) {
    this.scene = scene; this.terrain = terrain; this.rate = rate;
    this.rnd = Noise.mulberry32(seed + 555);
    this.rocks = [];
    this.timer = 25;
    this.events = [];
    const mat = new THREE.MeshStandardMaterial({ color: 0x5e5a55, roughness: 0.9 });
    for (let i = 0; i < 10; i++) {
      const r = 0.55 + this.rnd() * 0.6;
      const geo = new THREE.DodecahedronGeometry(r, 0);
      const pa = geo.attributes.position;
      for (let k = 0; k < pa.count; k++) pa.setXYZ(k, pa.getX(k) * (0.85 + this.rnd() * 0.3), pa.getY(k) * (0.85 + this.rnd() * 0.3), pa.getZ(k) * (0.85 + this.rnd() * 0.3));
      geo.computeVertexNormals();
      const m = new THREE.Mesh(geo, mat); m.castShadow = true; m.visible = false;
      scene.add(m);
      this.rocks.push({ mesh: m, r, active: false, vel: new THREE.Vector3(), life: 0, still: 0 });
    }
    this._n = new THREE.Vector3(); this._axis = new THREE.Vector3();
  }
  trySpawn(player) {
    const T = this.terrain, p = player.pos;
    const Hmax = T.summit.y;
    if (p.y / Hmax < 0.22) return false;
    const free = this.rocks.find(r => !r.active);
    if (!free) return false;
    for (let k = 0; k < 40; k++) {
      const ang = this.rnd() * Math.PI * 2, d = 25 + this.rnd() * 60;
      const x = p.x + Math.cos(ang) * d, z = p.z + Math.sin(ang) * d;
      if (Math.abs(x) > T.size / 2 - 10 || Math.abs(z) > T.size / 2 - 10) continue;
      const h = T.getHeight(x, z);
      if (h < p.y + 12 || h > p.y + 80) continue;
      const slope = T.getSlopeDeg(x, z);
      if (slope < 36 || slope > 72) continue;
      const mat = T.getMaterial(x, z);
      if (mat !== MAT.ROCK && mat !== MAT.DIRT) continue;
      // 落石大致朝玩家方向滚下：要求玩家在下坡方向附近
      const n = T.getNormal(x, z, this._n);
      const dx = p.x - x, dz = p.z - z, dl = Math.hypot(dx, dz);
      const dot = (n.x * dx + n.z * dz) / (Math.hypot(n.x, n.z) * dl + 1e-6);
      if (dot < 0.5) continue;
      free.active = true; free.life = 0; free.still = 0;
      free.mesh.visible = true;
      free.mesh.position.set(x, h + free.r + 0.5, z);
      free.vel.set(n.x, 0, n.z).normalize().multiplyScalar(2 + this.rnd() * 3);
      this.events.push('spawn');
      return true;
    }
    return false;
  }
  update(dt, player, hitCb) {
    if (this.rate <= 0) return;
    this.timer -= dt;
    if (this.timer <= 0) {
      this.timer = (7 + this.rnd() * 12) / this.rate;
      if (player.mode !== MODE.DEAD) this.trySpawn(player);
    }
    const T = this.terrain, n = this._n;
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
        if (vn < 0) v.addScaledVector(n, -vn * 1.35);
        v.multiplyScalar(Math.exp(-0.5 * dt));
      }
      const spd = v.length();
      if (spd > 0.05) {
        this._axis.set(0, 1, 0).cross(v).normalize();
        m.rotateOnWorldAxis(this._axis, spd / rk.r * dt);
      }
      if (spd < 0.6) rk.still += dt; else rk.still = 0;
      // 命中玩家
      if (player.mode !== MODE.DEAD) {
        const dx = pos.x - player.pos.x, dy = pos.y - (player.pos.y + 0.9), dz = pos.z - player.pos.z;
        if (dx * dx + dy * dy + dz * dz < (rk.r + 0.55) * (rk.r + 0.55) && spd > 2) {
          hitCb(rk, spd);
          rk.active = false; m.visible = false;
        }
      }
      if (rk.still > 1.5 || rk.life > 25 || Math.abs(pos.x) > T.size / 2 - 5 || Math.abs(pos.z) > T.size / 2 - 5) { rk.active = false; m.visible = false; }
    }
  }
  clear() { for (const r of this.rocks) { r.active = false; r.mesh.visible = false; } }
}

/* ---------------- 世界 ---------------- */
class World {
  constructor(scene, terrain, diff, seed, opts) {
    this.scene = scene; this.terrain = terrain; this.diff = diff; this.opts = opts;
    this.rnd = Noise.mulberry32(seed + 77);
    this.flags = [];
    this.crateMeshes = [];
    this.clouds = [];
    this.time = 0;
    this.buildSky();
    this.buildLights();
    this.buildBackdrop();
    this.buildVegetation();
    this.buildRocks();
    this.buildCamps();
    this.buildCrates();
    this.buildSummit();
    this.buildSnow();
    this.buildClouds();
  }

  buildSky() {
    const geo = new THREE.SphereGeometry(4500, 32, 16);
    this.skyUniforms = {
      topColor: { value: new THREE.Color(0.10, 0.28, 0.75) },
      bottomColor: { value: new THREE.Color(0.55, 0.70, 0.92) },
      sunDir: { value: new THREE.Vector3(0.55, 0.62, 0.35).normalize() },
      sunColor: { value: new THREE.Color(1.0, 0.92, 0.75) },
      exponent: { value: 0.9 },
    };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.skyUniforms,
      vertexShader: `varying vec3 vWorldPosition; void main(){ vec4 wp = modelMatrix * vec4(position,1.0); vWorldPosition = wp.xyz; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `uniform vec3 topColor; uniform vec3 bottomColor; uniform vec3 sunDir; uniform vec3 sunColor; uniform float exponent; varying vec3 vWorldPosition;
        void main(){ vec3 dir = normalize(vWorldPosition - cameraPosition); float h = dir.y; vec3 col = mix(bottomColor, topColor, pow(clamp(h * 1.15, 0.0, 1.0), exponent));
        col = mix(bottomColor, col, smoothstep(-0.02, 0.06, h));
        float sd = max(dot(dir, sunDir), 0.0); col += sunColor * (pow(sd, 800.0)*3.0 + pow(sd, 16.0)*0.22 + pow(sd, 3.0)*0.06);
        gl_FragColor = vec4(col, 1.0); }`,
      side: THREE.BackSide, depthWrite: false, fog: false,
    });
    this.sky = new THREE.Mesh(geo, mat);
    this.sky.frustumCulled = false;
    this.scene.add(this.sky);
    this.clearTop = new THREE.Color(0.10, 0.28, 0.75); this.clearBottom = new THREE.Color(0.55, 0.70, 0.92);
    this.stormTop = new THREE.Color(0.30, 0.32, 0.36); this.stormBottom = new THREE.Color(0.52, 0.54, 0.58);
    this.fogColor = new THREE.Color();
    this.scene.fog = new THREE.Fog(0xffffff, 180, 2800);
  }

  buildLights() {
    this.hemi = new THREE.HemisphereLight(0xb8d4f5, 0x7a7d6a, 1.0);
    this.scene.add(this.hemi);
    const sun = this.sun = new THREE.DirectionalLight(0xfff1d6, 1.75);
    sun.position.copy(this.skyUniforms.sunDir.value).multiplyScalar(400);
    sun.castShadow = !!this.opts.shadows;
    const ss = this.opts.shadowSize || 2048;
    sun.shadow.mapSize.set(ss, ss);
    const sc = sun.shadow.camera;
    sc.left = -140; sc.right = 140; sc.top = 140; sc.bottom = -140; sc.near = 20; sc.far = 900;
    sun.shadow.bias = -0.0008; sun.shadow.normalBias = 0.5;
    this.scene.add(sun); this.scene.add(sun.target);
    this.ambient = new THREE.AmbientLight(0xb0b8c4, 0.4);
    this.scene.add(this.ambient);
  }

  /* 远景：延伸地面 + 远山剪影 + 地形裙边，消除世界边缘 */
  buildBackdrop() {
    const T = this.terrain, half = T.size / 2;
    const lin = (r, g, b) => new THREE.Color(toLinear(r), toLinear(g), toLinear(b));
    // 延伸地面
    const gtex = Terrain.makeDetailTexture().clone(); gtex.needsUpdate = true; gtex.repeat.set(3080, 3080);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(14000, 14000), new THREE.MeshStandardMaterial({ color: lin(0.35, 0.48, 0.19), map: gtex, roughness: 1 }));
    ground.rotation.x = -Math.PI / 2; ground.position.y = -0.4; ground.receiveShadow = false;
    this.scene.add(ground);
    // 裙边：沿地形四周向下延伸（顶部沿用地形顶点颜色）
    const n = T.n, H = T.heights, tcol = T.mesh.geometry.attributes.color.array;
    const edge = [];
    for (let i = 0; i < n; i++) edge.push([i, 0]);
    for (let j = 1; j < n; j++) edge.push([n - 1, j]);
    for (let i = n - 2; i >= 0; i--) edge.push([i, n - 1]);
    for (let j = n - 2; j >= 1; j--) edge.push([0, j]);
    const sp = new Float32Array(edge.length * 2 * 3), sc = new Float32Array(edge.length * 2 * 3), si = [];
    edge.forEach(([i, j], k) => {
      const [x, z] = T.gridToWorld(i, j), vi = j * n + i, h = H[vi];
      sp[k * 6] = x; sp[k * 6 + 1] = h; sp[k * 6 + 2] = z;
      sp[k * 6 + 3] = x; sp[k * 6 + 4] = -60; sp[k * 6 + 5] = z;
      sc[k * 6] = tcol[vi * 3]; sc[k * 6 + 1] = tcol[vi * 3 + 1]; sc[k * 6 + 2] = tcol[vi * 3 + 2];
      sc[k * 6 + 3] = toLinear(0.3); sc[k * 6 + 4] = toLinear(0.26); sc[k * 6 + 5] = toLinear(0.2);
      const k2 = (k + 1) % edge.length;
      si.push(k * 2, k2 * 2, k * 2 + 1, k2 * 2, k2 * 2 + 1, k * 2 + 1);
    });
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(sp, 3)); sg.setAttribute('color', new THREE.BufferAttribute(sc, 3)); sg.setIndex(si); sg.computeVertexNormals();
    const skirt = new THREE.Mesh(sg, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, side: THREE.DoubleSide }));
    this.scene.add(skirt);
    // 远山剪影（两圈，带高度渐变着色：山脚草地 → 岩石 → 雪顶）
    const N = new Noise.Simplex2D(4321);
    const makeRing = (r0, r1, r2, hMax, seedOff, haze) => {
      const segs = 420, rows = [r0, (r0 + r1) / 2, r1, (r1 + r2) / 2, r2];
      const pos = new Float32Array((segs + 1) * rows.length * 3), col = new Float32Array((segs + 1) * rows.length * 3), idx = [];
      const base = lin(0.31, 0.43, 0.19), rock = lin(0.44, 0.45, 0.47), snow = lin(0.93, 0.95, 0.99);
      const hazeCol = lin(0.62, 0.72, 0.9);
      for (let k = 0; k <= segs; k++) {
        const a = k / segs * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
        const rid = N.ridged(c * 3.1 + seedOff, s * 3.1 + seedOff, 4);
        const gate = 0.4 + 0.6 * (0.5 + 0.5 * N.noise(c * 1.3 + seedOff, s * 1.3 - seedOff)); // 某些方向是低矮的山口
        const crest = (hMax * (0.25 + 0.75 * rid) * (0.75 + 0.25 * N.noise(c * 7 + seedOff, s * 7)) + hMax * 0.06 * N.noise(c * 23 + seedOff, s * 23)) * gate;
        rows.forEach((r, ri) => {
          let h;
          if (ri === 0 || ri === 4) h = -40;
          else if (ri === 2) h = crest;
          else h = crest * (0.45 + 0.2 * N.noise(c * 11 + ri, s * 11 + seedOff)) ;
          const b = (k * rows.length + ri) * 3;
          pos[b] = c * r; pos[b + 1] = h; pos[b + 2] = s * r;
          const t = clamp((h + 40) / (hMax * 0.9), 0, 1);
          const cc = new THREE.Color().copy(base).lerp(rock, smoothstep(0.12, 0.4, t)).lerp(snow, smoothstep(0.68, 0.95, t)).lerp(hazeCol, haze);
          col[b] = cc.r; col[b + 1] = cc.g; col[b + 2] = cc.b;
        });
        if (k < segs) {
          for (let ri = 0; ri < rows.length - 1; ri++) {
            const v = k * rows.length + ri, w = (k + 1) * rows.length + ri;
            idx.push(v, v + 1, w, w, v + 1, w + 1);
          }
        }
      }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.setIndex(idx); g.computeVertexNormals();
      const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, flatShading: false, side: THREE.DoubleSide }));
      this.scene.add(m);
      return m;
    };
    makeRing(half + 450, half + 800, half + 1300, 320, 1.7, 0.35);
    makeRing(half + 1200, half + 1800, half + 2700, 700, 9.2, 0.5);
  }

  buildVegetation() {
    const T = this.terrain, cfg = this.diff.terrain, Hmax = T.summit.y;
    const spots = [];
    const maxTrees = this.opts.maxTrees || 3500;
    const N = new Noise.Simplex2D(1234);
    for (let j = 3; j < T.n - 3; j += 2) for (let i = 3; i < T.n - 3; i += 2) {
      const h = T.heights[j * T.n + i];
      if (h / Hmax > cfg.treeLine) continue;
      if (T.slopeDegAt(i, j) > 32) continue;
      const [x, z] = T.gridToWorld(i, j);
      const dens = N.fbm(x * 0.012, z * 0.012, 2) + 0.15 - (h / Hmax) / cfg.treeLine * 0.5;
      if (this.rnd() > dens * 0.9) continue;
      if (Math.hypot(x - T.start.x, z - T.start.z) < 12) continue;
      spots.push({ x, z, h });
      if (spots.length >= maxTrees) break;
    }
    const cnt = spots.length;
    if (!cnt) return;
    const trunkG = new THREE.CylinderGeometry(0.13, 0.22, 1.8, 6); trunkG.translate(0, 0.9, 0);
    const cone1G = new THREE.ConeGeometry(1.5, 3.4, 7); cone1G.translate(0, 3.1, 0);
    const cone2G = new THREE.ConeGeometry(1.05, 2.6, 7); cone2G.translate(0, 5.1, 0);
    const trunkM = new THREE.MeshStandardMaterial({ color: 0x5a3d25, roughness: 0.9 });
    const leafM = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85 });
    const trunk = new THREE.InstancedMesh(trunkG, trunkM, cnt);
    const c1 = new THREE.InstancedMesh(cone1G, leafM, cnt);
    const c2 = new THREE.InstancedMesh(cone2G, leafM, cnt);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), col = new THREE.Color();
    spots.forEach((sp, k) => {
      const sc = 0.7 + this.rnd() * 0.8;
      p.set(sp.x + (this.rnd() - 0.5) * 2, sp.h - 0.15, sp.z + (this.rnd() - 0.5) * 2);
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), this.rnd() * Math.PI * 2);
      s.set(sc, sc * (0.9 + this.rnd() * 0.3), sc);
      m.compose(p, q, s);
      trunk.setMatrixAt(k, m); c1.setMatrixAt(k, m); c2.setMatrixAt(k, m);
      const g = 0.30 + this.rnd() * 0.16, snowy = clamp((sp.h / Hmax - cfg.snowLine + 0.2) / 0.2, 0, 0.6);
      col.setRGB(toLinear(0.10 + this.rnd() * 0.08), toLinear(g), toLinear(0.10 + this.rnd() * 0.06)).lerp(new THREE.Color(toLinear(0.85), toLinear(0.88), toLinear(0.92)), snowy);
      c1.setColorAt(k, col); c2.setColorAt(k, col);
    });
    for (const im of [trunk, c1, c2]) { im.castShadow = true; im.receiveShadow = true; im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true; this.scene.add(im); }
  }

  buildRocks() {
    const T = this.terrain, Hmax = T.summit.y;
    const spots = [];
    for (let j = 3; j < T.n - 3; j += 3) for (let i = 3; i < T.n - 3; i += 3) {
      const h = T.heights[j * T.n + i];
      const fr = h / Hmax;
      if (fr < 0.12) continue;
      const sl = T.slopeDegAt(i, j);
      if (sl < 12 || sl > 50) continue;
      if (this.rnd() > 0.05) continue;
      const [x, z] = T.gridToWorld(i, j);
      spots.push({ x, z, h, snow: fr > this.diff.terrain.snowLine });
      if (spots.length >= (this.opts.maxRocks || 700)) break;
    }
    if (!spots.length) return;
    const geo = new THREE.DodecahedronGeometry(1, 0);
    const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.92 });
    const im = new THREE.InstancedMesh(geo, mat, spots.length);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), col = new THREE.Color(), e = new THREE.Euler();
    spots.forEach((sp, k) => {
      const sc = 0.5 + this.rnd() * 1.6;
      p.set(sp.x, sp.h - sc * 0.35, sp.z);
      e.set(this.rnd() * Math.PI, this.rnd() * Math.PI, this.rnd() * Math.PI); q.setFromEuler(e);
      s.set(sc * (0.7 + this.rnd() * 0.6), sc * (0.6 + this.rnd() * 0.5), sc * (0.7 + this.rnd() * 0.6));
      m.compose(p, q, s); im.setMatrixAt(k, m);
      const v = 0.36 + this.rnd() * 0.16;
      col.setRGB(toLinear(v + 0.03), toLinear(v), toLinear(v - 0.02)); if (sp.snow) col.lerp(new THREE.Color(toLinear(0.8), toLinear(0.83), toLinear(0.88)), 0.35);
      im.setColorAt(k, col);
    });
    im.castShadow = true; im.receiveShadow = true; im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true;
    this.scene.add(im);
  }

  makeFlag(color, w = 1.2, h = 0.75) {
    const geo = new THREE.PlaneGeometry(w, h, 8, 3);
    geo.translate(w / 2, 0, 0);
    const mat = new THREE.MeshStandardMaterial({ color, side: THREE.DoubleSide, roughness: 0.8 });
    const mesh = new THREE.Mesh(geo, mat); mesh.castShadow = true;
    const base = geo.attributes.position.array.slice();
    return { mesh, base, w };
  }

  buildCamps() {
    const T = this.terrain;
    this.campGroups = [];
    T.camps.forEach((camp) => {
      const g = new THREE.Group(); g.position.copy(camp.pos);
      const M = (c, r = 0.8) => new THREE.MeshStandardMaterial({ color: c, roughness: r });
      // 帐篷
      const tentG = new THREE.ConeGeometry(1.7, 1.5, 4); tentG.rotateY(Math.PI / 4);
      const tent = new THREE.Mesh(tentG, M(0xd8442b, 0.7)); tent.position.set(-2.2, 0.75, 0.6); tent.castShadow = true; tent.receiveShadow = true; g.add(tent);
      const tent2 = new THREE.Mesh(tentG, M(0xe9a62a, 0.7)); tent2.position.set(2.4, 0.75, -1.0); tent2.rotation.y = 0.6; tent2.castShadow = true; g.add(tent2);
      // 地垫
      const mat = new THREE.Mesh(new THREE.CylinderGeometry(6, 6, 0.06, 20), M(0x6a6255, 0.95)); mat.position.y = 0.02; mat.receiveShadow = true; g.add(mat);
      // 石圈与火堆
      for (let k = 0; k < 8; k++) {
        const a = k / 8 * Math.PI * 2;
        const st = new THREE.Mesh(new THREE.DodecahedronGeometry(0.22, 0), M(0x555049, 0.9));
        st.position.set(Math.cos(a) * 0.6, 0.15, Math.sin(a) * 0.6); st.rotation.set(this.rnd(), this.rnd(), this.rnd()); st.castShadow = true; g.add(st);
      }
      const fire = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.6, 6), new THREE.MeshStandardMaterial({ color: 0xff7a1a, emissive: 0xff5a00, emissiveIntensity: 1.4, roughness: 1 }));
      fire.position.y = 0.35; g.add(fire);
      const light = new THREE.PointLight(0xff8a3a, 1.2, 14, 2); light.position.set(0, 1.2, 0); g.add(light);
      camp.fire = fire; camp.light = light;
      // 旗杆与旗
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 3.2, 8), M(0x888888, 0.4)); pole.position.set(0.5, 1.6, 2.4); pole.castShadow = true; g.add(pole);
      const flag = this.makeFlag(0xffd21f); flag.mesh.position.set(0.5, 2.9, 2.4); g.add(flag.mesh); this.flags.push(flag);
      // 补给桶
      const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.6, 12), M(0x2f7bd1, 0.6)); barrel.position.set(1.6, 0.3, 2.2); barrel.castShadow = true; g.add(barrel);
      // 营地标号牌
      const sign = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.5, 0.06), M(0xd9c8a3, 0.8)); sign.position.set(-1.0, 1.1, 2.8); sign.castShadow = true; g.add(sign);
      const signPole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.1, 6), M(0x6b4a2b)); signPole.position.set(-1.0, 0.55, 2.8); g.add(signPole);
      this.scene.add(g);
      this.campGroups.push(g);
    });
  }

  buildCrates() {
    const T = this.terrain;
    const wood = new THREE.MeshStandardMaterial({ color: 0xb5843c, roughness: 0.85 });
    const strap = new THREE.MeshStandardMaterial({ color: 0x3b3b3b, roughness: 0.6 });
    const glowMat = new THREE.MeshBasicMaterial({ color: 0x7ee787, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false });
    T.crates.forEach((cr) => {
      const g = new THREE.Group(); g.position.copy(cr.pos);
      const box = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.7, 0.7), wood); box.position.y = 0.45; box.castShadow = true; g.add(box);
      const s1 = new THREE.Mesh(new THREE.BoxGeometry(0.74, 0.12, 0.74), strap); s1.position.y = 0.45; g.add(s1);
      const s2 = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.74, 0.74), strap); s2.position.y = 0.45; g.add(s2);
      const ring = new THREE.Mesh(new THREE.RingGeometry(1.0, 1.4, 24), glowMat); ring.rotation.x = -Math.PI / 2; ring.position.y = 0.08; g.add(ring);
      const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.5, 14, 10, 1, true), new THREE.MeshBasicMaterial({ color: 0x9fffa8, transparent: true, opacity: 0.12, depthWrite: false, side: THREE.DoubleSide }));
      beam.position.y = 7; g.add(beam);
      cr.group = g; cr.box = box; cr.ring = ring;
      this.scene.add(g);
    });
  }

  buildSummit() {
    const T = this.terrain, s = T.summit;
    const g = new THREE.Group(); g.position.copy(s);
    const M = (c, r = 0.8) => new THREE.MeshStandardMaterial({ color: c, roughness: r });
    // 玛尼堆
    for (let k = 0; k < 14; k++) {
      const st = new THREE.Mesh(new THREE.DodecahedronGeometry(0.3 + this.rnd() * 0.25, 0), M(0x6b665e, 0.9));
      const a = this.rnd() * Math.PI * 2, r = this.rnd() * 0.7;
      st.position.set(Math.cos(a) * r, 0.2 + k * 0.11, Math.sin(a) * r); st.scale.y = 0.6; st.rotation.y = this.rnd() * 3; st.castShadow = true; g.add(st);
    }
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 4.5, 8), M(0xdddddd, 0.4)); pole.position.y = 2.2; pole.castShadow = true; g.add(pole);
    const flag = this.makeFlag(0xff2d2d, 1.6, 1.0); flag.mesh.position.set(0, 3.9, 0); g.add(flag.mesh); this.flags.push(flag);
    // 经幡
    const colors = [0x3b8bff, 0xffffff, 0xff3b3b, 0x3bd35b, 0xffd23b];
    for (let side = 0; side < 3; side++) {
      const ang = side / 3 * Math.PI * 2 + 0.4;
      const ex = Math.cos(ang) * 5, ez = Math.sin(ang) * 5;
      const eh = T.getHeight(s.x + ex, s.z + ez) - s.y;
      const p2 = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.04, 2.2, 6), M(0x999999, 0.5)); p2.position.set(ex, eh + 1.1, ez); g.add(p2);
      for (let k = 0; k < 7; k++) {
        const t = (k + 0.5) / 7;
        const f = new THREE.Mesh(new THREE.PlaneGeometry(0.32, 0.26), new THREE.MeshStandardMaterial({ color: colors[k % 5], side: THREE.DoubleSide, roughness: 0.9 }));
        const y = lerp(4.2, eh + 2.1, t) - Math.sin(t * Math.PI) * 0.5;
        f.position.set(ex * t, y, ez * t); f.rotation.y = ang + Math.PI / 2; f.castShadow = true; g.add(f);
      }
    }
    const ring = new THREE.Mesh(new THREE.RingGeometry(3.2, 3.8, 32), new THREE.MeshBasicMaterial({ color: 0xffd479, transparent: true, opacity: 0.45, side: THREE.DoubleSide, depthWrite: false }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.1; g.add(ring);
    this.summitRing = ring;
    this.scene.add(g);
  }

  buildSnow() {
    const n = this.opts.snow || 5000;
    const pos = new Float32Array(n * 3);
    this.snowSpeed = new Float32Array(n);
    for (let i = 0; i < n; i++) { pos[i * 3] = (Math.random() - 0.5) * 60; pos[i * 3 + 1] = (Math.random() - 0.5) * 50; pos[i * 3 + 2] = (Math.random() - 0.5) * 60; this.snowSpeed[i] = 2.5 + Math.random() * 3; }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const cv = document.createElement('canvas'); cv.width = cv.height = 32;
    const ctx = cv.getContext('2d'); const gr = ctx.createRadialGradient(16, 16, 0, 16, 16, 16); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.5, 'rgba(255,255,255,0.6)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = gr; ctx.fillRect(0, 0, 32, 32);
    const tex = new THREE.CanvasTexture(cv);
    this.snowMat = new THREE.PointsMaterial({ size: 0.28, map: tex, transparent: true, opacity: 0, depthWrite: false, sizeAttenuation: true, color: 0xffffff });
    this.snow = new THREE.Points(geo, this.snowMat); this.snow.frustumCulled = false;
    this.scene.add(this.snow);
  }

  buildClouds() {
    const Hmax = this.terrain.summit.y;
    const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, transparent: true, opacity: 0.9 });
    for (let c = 0; c < 14; c++) {
      const g = new THREE.Group();
      const parts = 5 + Math.floor(this.rnd() * 5);
      const size = 25 + this.rnd() * 40;
      for (let k = 0; k < parts; k++) {
        const s = new THREE.Mesh(new THREE.SphereGeometry(size * (0.35 + this.rnd() * 0.4), 10, 8), mat);
        s.position.set((this.rnd() - 0.5) * size * 1.6, (this.rnd() - 0.5) * size * 0.3, (this.rnd() - 0.5) * size * 0.9);
        s.scale.y = 0.45; g.add(s);
      }
      const a = this.rnd() * Math.PI * 2, r = 200 + this.rnd() * 700;
      g.position.set(Math.cos(a) * r, Hmax * 1.25 + this.rnd() * 220, Math.sin(a) * r);
      this.scene.add(g); this.clouds.push(g);
    }
  }

  /* 每帧更新 */
  update(dt, player, weather, camera) {
    this.time += dt;
    const t = this.time;
    // 太阳/阴影跟随玩家
    const sd = this.skyUniforms.sunDir.value;
    this.sun.position.copy(player.pos).addScaledVector(sd, 420);
    this.sun.target.position.copy(player.pos);
    this.sun.target.updateMatrixWorld();
    this.sky.position.copy(camera.position);

    // 天气 → 天空/雾/光
    const k = weather.intensity;
    const altF = player.pos.y / this.terrain.summit.y;
    this.skyUniforms.topColor.value.copy(this.clearTop).lerp(this.stormTop, k);
    this.skyUniforms.bottomColor.value.copy(this.clearBottom).lerp(this.stormBottom, k);
    this.skyUniforms.sunColor.value.setRGB(1.0, 0.92, 0.75).multiplyScalar(1 - k * 0.9);
    const snowHaze = weather.snowfall * (1 - k) * 0.6;
    const fogNear = lerp(lerp(180, 60, snowHaze), 4, k);
    const fogFar = lerp(lerp(2800, 1100, snowHaze), 110, k);
    this.scene.fog.near += (fogNear - this.scene.fog.near) * Math.min(1, dt * 0.8);
    this.scene.fog.far += (fogFar - this.scene.fog.far) * Math.min(1, dt * 0.8);
    this.fogColor.copy(this.clearBottom).lerp(new THREE.Color(0.7, 0.72, 0.76), k * 0.9 + snowHaze * 0.3);
    this.scene.fog.color.copy(this.fogColor);
    this.sun.intensity = lerp(1.75, 0.45, k);
    this.hemi.intensity = lerp(1.0, 1.1, k);

    // 雪花
    const sf = weather.snowfall;
    this.snowMat.opacity += (sf * 0.9 - this.snowMat.opacity) * Math.min(1, dt * 2);
    if (this.snowMat.opacity > 0.01) {
      const pa = this.snow.geometry.attributes.position, arr = pa.array, cp = camera.position, w = weather.wind;
      const n = this.snowSpeed.length;
      const wx = w.x * 0.7 * dt, wz = w.z * 0.7 * dt;
      for (let i = 0; i < n; i++) {
        let x = arr[i * 3], y = arr[i * 3 + 1], z = arr[i * 3 + 2];
        y -= this.snowSpeed[i] * dt * (1 + k);
        x += wx + Math.sin(t * 2 + i) * 0.3 * dt; z += wz + Math.cos(t * 1.7 + i * 0.7) * 0.3 * dt;
        if (y < cp.y - 25) y += 50; if (y > cp.y + 25) y -= 50;
        if (x < cp.x - 30) x += 60; else if (x > cp.x + 30) x -= 60;
        if (z < cp.z - 30) z += 60; else if (z > cp.z + 30) z -= 60;
        arr[i * 3] = x; arr[i * 3 + 1] = y; arr[i * 3 + 2] = z;
      }
      pa.needsUpdate = true;
    }

    // 旗帜飘动
    const ws = clamp(weather.windSpeed / 12, 0.15, 1.5);
    for (const f of this.flags) {
      f.mesh.rotation.y = weather.windAngle - Math.PI / 2 + Math.sin(t * 1.3) * 0.15;
      const pa = f.mesh.geometry.attributes.position, arr = pa.array, base = f.base;
      for (let i = 0; i < pa.count; i++) {
        const x = base[i * 3];
        const u = x / f.w;
        arr[i * 3 + 2] = Math.sin(u * 5 - t * (6 + ws * 6)) * 0.12 * u * ws + Math.sin(u * 9 - t * 11) * 0.03 * u;
        arr[i * 3 + 1] = base[i * 3 + 1] - u * u * 0.1 * (1 - ws * 0.6);
      }
      pa.needsUpdate = true;
    }

    // 营火闪烁
    for (const c of this.terrain.camps) {
      if (c.fire) { c.fire.scale.set(1 + Math.sin(t * 13) * 0.12, 1 + Math.sin(t * 9 + 1) * 0.2, 1 + Math.cos(t * 11) * 0.12); c.light.intensity = 1.1 + Math.sin(t * 17) * 0.25; }
    }
    // 补给箱浮动
    for (const cr of this.terrain.crates) {
      if (!cr.group || cr.taken) continue;
      cr.box.position.y = 0.45 + Math.sin(t * 2 + cr.pos.x) * 0.08;
      cr.box.rotation.y = t * 0.8;
      cr.ring.rotation.z = t * 0.5;
    }
    this.summitRing.material.opacity = 0.35 + Math.sin(t * 3) * 0.15;
    // 云漂移
    for (const c of this.clouds) {
      c.position.x += weather.wind.x * 0.25 * dt + 0.4 * dt; c.position.z += weather.wind.z * 0.25 * dt;
      if (c.position.x > 1200) c.position.x = -1200; if (c.position.x < -1200) c.position.x = 1200;
      if (c.position.z > 1200) c.position.z = -1200; if (c.position.z < -1200) c.position.z = 1200;
    }
  }

  dispose() {
    this.scene.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) { if (Array.isArray(o.material)) o.material.forEach(m => m.dispose()); else o.material.dispose(); } });
  }
}
