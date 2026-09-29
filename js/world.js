/* 世界：光照、远景、水面、植被、草地、营地、岩壁、冰裂缝、收集品、粒子、飞鸟 */
const PALETTE = {
  summer: { leaf: [[0.2, 0.42, 0.14], [0.26, 0.5, 0.16], [0.18, 0.36, 0.12]], pine: [[0.1, 0.26, 0.12], [0.12, 0.3, 0.14], [0.09, 0.22, 0.1]], grass: [0.34, 0.56, 0.2], grass2: [0.5, 0.6, 0.22], ground: [0.3, 0.45, 0.17], flowers: [[1, 1, 1], [1, 0.85, 0.25], [0.75, 0.45, 0.95], [1, 0.5, 0.65], [0.4, 0.6, 1]] },
  autumn: { leaf: [[0.9, 0.45, 0.1], [0.95, 0.72, 0.18], [0.75, 0.2, 0.08], [0.85, 0.58, 0.14]], pine: [[0.12, 0.26, 0.13], [0.14, 0.3, 0.15]], grass: [0.62, 0.55, 0.24], grass2: [0.55, 0.42, 0.18], ground: [0.45, 0.4, 0.2], flowers: [[1, 0.8, 0.3], [0.9, 0.4, 0.2]] },
  alpine: { leaf: [[0.2, 0.3, 0.16]], pine: [[0.1, 0.22, 0.13], [0.12, 0.25, 0.15]], grass: [0.5, 0.52, 0.3], grass2: [0.45, 0.42, 0.28], ground: [0.55, 0.57, 0.58], flowers: [[0.8, 0.6, 1], [1, 1, 1]] },
};

class World {
  constructor(scene, T, stage, opts, seed) {
    this.scene = scene; this.T = T; this.stage = stage; this.opts = opts; this.Q = opts.quality;
    this.rnd = Noise.mulberry32(seed + 77);
    this.pal = PALETTE[stage.terrain.palette] || PALETTE.summer;
    this.time = 0;
    this.flags = []; this.prayer = []; this.anims = [];
    this.windU = { uTime: { value: 0 }, uWind: { value: 0.5 } };
    this.tex = opts.tex;
    this.buildLights();
    this.sky = new SkySystem(scene, { seed, H: T.summit.y, cloudSea: stage.cloudSea, aurora: stage.aurora, cloudCount: 26 });
    scene.fog = new THREE.Fog(0xaabbcc, 200, 3000);
    this.buildBackdrop();
    if (T.lake) this.buildWater();
    this.buildVegetation();
    this.buildBoulders();
    if (this.Q.grass > 0) this.buildGrass();
    this.buildTrailProps();
    this.buildCamps();
    this.buildWalls();
    this.buildCrevasses();
    this.buildCollectibles();
    this.buildSummit();
    this.buildParticles();
    this.buildBirds();
  }

  /* ---------------- 光照 ---------------- */
  buildLights() {
    const s = this.scene;
    this.hemi = new THREE.HemisphereLight(0xbcd4f0, 0x4a4436, 1.0); s.add(this.hemi);
    const sun = this.sun = new THREE.DirectionalLight(0xffffff, 3);
    const ss = this.Q.shadow;
    sun.castShadow = ss > 0 && this.opts.shadows;
    if (sun.castShadow) {
      sun.shadow.mapSize.set(ss, ss);
      const sc = sun.shadow.camera; sc.left = -90; sc.right = 90; sc.top = 90; sc.bottom = -90; sc.near = 10; sc.far = 900;
      sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.35;
    }
    s.add(sun); s.add(sun.target);
    // 营地灯（固定数量，避免运行时重编译着色器）
    this.campLights = [];
    for (let k = 0; k < this.T.camps.length + 2; k++) {
      const l = new THREE.PointLight(0xff8a3a, 0, 18, 1.6);
      l.position.set(0, -1000, 0); s.add(l); this.campLights.push(l);
    }
    // 头灯
    const hl = this.headlamp = new THREE.SpotLight(0xfff4e0, 0, 45, 0.5, 0.45, 1.3);
    s.add(hl); s.add(hl.target);
  }

  /* ---------------- 远景 ---------------- */
  buildBackdrop() {
    const T = this.T, half = T.size / 2, pal = this.pal;
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(16000, 16000), new THREE.MeshStandardMaterial({ color: srgb(...pal.ground), roughness: 1 }));
    ground.rotation.x = -Math.PI / 2; ground.position.y = -0.5;
    this.scene.add(ground);
    // 裙边
    const n = T.n, H = T.heights;
    const edge = [];
    for (let i = 0; i < n; i++) edge.push([i, 0]);
    for (let j = 1; j < n; j++) edge.push([n - 1, j]);
    for (let i = n - 2; i >= 0; i--) edge.push([i, n - 1]);
    for (let j = n - 2; j >= 1; j--) edge.push([0, j]);
    const sp = new Float32Array(edge.length * 6), si = [];
    edge.forEach(([i, j], k) => {
      const [x, z] = T.gridToWorld(i, j), h = H[j * n + i];
      sp.set([x, h, z, x, -40, z], k * 6);
      const k2 = (k + 1) % edge.length;
      si.push(k * 2, k2 * 2, k * 2 + 1, k2 * 2, k2 * 2 + 1, k * 2 + 1);
    });
    const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.BufferAttribute(sp, 3)); sg.setIndex(si); sg.computeVertexNormals();
    this.scene.add(new THREE.Mesh(sg, new THREE.MeshStandardMaterial({ color: srgb(...pal.ground).multiplyScalar(0.8), roughness: 1, side: THREE.DoubleSide })));
    // 远山
    const N = new Noise.Simplex2D(4321 + T.seed % 100);
    const alpine = this.stage.terrain.palette === 'alpine';
    const makeRing = (r0, r1, r2, hMax, off, haze) => {
      const segs = 480, rows = [r0, (r0 + r1) / 2, r1, (r1 + r2) / 2, r2];
      const pos = new Float32Array((segs + 1) * rows.length * 3), col = new Float32Array((segs + 1) * rows.length * 3), idx = [];
      const base = srgb(...pal.ground), rock = srgb(0.42, 0.43, 0.46), snow = srgb(0.93, 0.95, 0.99), hz = srgb(0.62, 0.72, 0.88);
      const cc = new THREE.Color();
      for (let k = 0; k <= segs; k++) {
        const a = k / segs * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
        const rid = N.ridged(c * 3.1 + off, s * 3.1 + off, 5);
        const gate = 0.45 + 0.55 * (0.5 + 0.5 * N.noise(c * 1.3 + off, s * 1.3 - off));
        const crest = (hMax * (0.25 + 0.75 * rid) * (0.75 + 0.25 * N.noise(c * 7 + off, s * 7)) + hMax * 0.06 * N.noise(c * 23 + off, s * 23)) * gate;
        rows.forEach((r, ri) => {
          const h = (ri === 0 || ri === 4) ? -40 : ri === 2 ? crest : crest * (0.45 + 0.2 * N.noise(c * 11 + ri, s * 11 + off));
          const b = (k * rows.length + ri) * 3;
          pos[b] = c * r; pos[b + 1] = h; pos[b + 2] = s * r;
          const t = clamp((h + 40) / (hMax * 0.9), 0, 1);
          cc.copy(base).lerp(rock, smoothstep(0.1, 0.35, t)).lerp(snow, smoothstep(alpine ? 0.35 : 0.62, alpine ? 0.6 : 0.9, t)).lerp(hz, haze);
          col[b] = cc.r; col[b + 1] = cc.g; col[b + 2] = cc.b;
        });
        if (k < segs) for (let ri = 0; ri < rows.length - 1; ri++) { const v = k * rows.length + ri, w = (k + 1) * rows.length + ri; idx.push(v, v + 1, w, w, v + 1, w + 1); }
      }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.setIndex(idx); g.computeVertexNormals();
      this.scene.add(new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, side: THREE.DoubleSide })));
    };
    const Hm = this.T.H;
    makeRing(half + 450, half + 800, half + 1300, Hm * (alpine ? 1.1 : 1.0), 1.7, 0.3);
    makeRing(half + 1300, half + 2000, half + 2900, Hm * (alpine ? 2.6 : 2.0), 9.2, 0.5);
  }

  /* ---------------- 湖面 ---------------- */
  buildWater() {
    const L = this.T.lake;
    this.waterU = Object.assign(THREE.UniformsUtils.clone(THREE.UniformsLib.fog), {
      tNormal: { value: Tex.waterNormal() }, uTime: { value: 0 }, uSunDir: { value: new THREE.Vector3() }, uSunCol: { value: new THREE.Color() },
      uSky: { value: new THREE.Color() }, uHor: { value: new THREE.Color() }, uDeep: { value: srgb(0.05, 0.16, 0.2) },
    });
    const mat = new THREE.ShaderMaterial({
      uniforms: this.waterU, transparent: true, fog: true, depthWrite: false,
      vertexShader: `varying vec3 vW; varying vec2 vUv2;
        #include <fog_pars_vertex>
        void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; vUv2 = w.xz; vec4 mvPosition = viewMatrix * w; gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
        }`,
      fragmentShader: `uniform sampler2D tNormal; uniform float uTime; uniform vec3 uSunDir, uSunCol, uSky, uHor, uDeep; varying vec3 vW; varying vec2 vUv2;
        #include <fog_pars_fragment>
        void main(){
          vec3 n1 = texture2D(tNormal, vUv2 * 0.05 + vec2(uTime * 0.01, uTime * 0.006)).xzy * 2.0 - 1.0;
          vec3 n2 = texture2D(tNormal, vUv2 * 0.13 - vec2(uTime * 0.013, -uTime * 0.009)).xzy * 2.0 - 1.0;
          vec3 n = normalize(vec3(n1.x + n2.x, 6.0, n1.z + n2.z));
          vec3 V = normalize(cameraPosition - vW);
          float fr = 0.03 + 0.97 * pow(1.0 - max(dot(n, V), 0.0), 5.0);
          vec3 R = reflect(-V, n);
          vec3 sky = mix(uHor, uSky, clamp(R.y * 1.6, 0.0, 1.0));
          vec3 col = mix(uDeep, sky, fr);
          float sp = pow(max(dot(R, uSunDir), 0.0), 220.0);
          col += uSunCol * sp * 6.0;
          gl_FragColor = vec4(col, 0.88 + fr * 0.1);
          #include <tonemapping_fragment>
          #include <encodings_fragment>
          #include <fog_fragment>
        }`,
    });
    const m = new THREE.Mesh(new THREE.CircleGeometry(L.r * 1.45, 72), mat);
    m.rotation.x = -Math.PI / 2; m.position.set(L.x, this.T.waterY, L.z);
    this.water = m; this.scene.add(m);
    // 岸边芦苇/石头
    const rm = Models.VC(0.9, { color: 0x7a766f });
    for (let k = 0; k < 16; k++) {
      const a = this.rnd() * Math.PI * 2, r = L.r * (1.0 + this.rnd() * 0.2);
      const x = L.x + Math.cos(a) * r, z = L.z + Math.sin(a) * r;
      const s = new THREE.Mesh(Models.rock(1200 + k, 1), rm); s.scale.setScalar(0.4 + this.rnd() * 0.9);
      s.position.set(x, this.T.getHeight(x, z) - 0.1, z); s.castShadow = true; s.receiveShadow = true; this.scene.add(s);
    }
    // 小码头
    const wood = Models.M(0x7a5634, 0.9);
    const dock = new THREE.Group();
    for (let k = 0; k < 9; k++) { const p = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.06, 0.24), wood); p.position.set(0, 0, k * 0.28); p.castShadow = true; p.receiveShadow = true; dock.add(p); }
    for (const [x, z] of [[-0.8, 0], [0.8, 0], [-0.8, 2.2], [0.8, 2.2]]) { const pl = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.6), wood); pl.position.set(x, -0.6, z); dock.add(pl); }
    const toStart = Math.atan2(this.T.start.x - L.x, this.T.start.z - L.z);
    const dx = Math.sin(toStart), dz = Math.cos(toStart);
    const shoreR = L.r * 0.98;
    dock.position.set(L.x + dx * shoreR, this.T.waterY + 0.35, L.z + dz * shoreR);
    dock.rotation.y = toStart + Math.PI;
    this.scene.add(dock);
  }

  /* ---------------- 树木 ---------------- */
  swayMaterial(base) {
    const m = base;
    m.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = this.windU.uTime; sh.uniforms.uWind = this.windU.uWind;
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uTime; uniform float uWind;')
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          #ifdef USE_INSTANCING
          vec3 ip = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
          #else
          vec3 ip = vec3(0.0);
          #endif
          float sw = uWind * max(0.0, position.y - 0.05) * 0.035;
          transformed.x += sin(uTime * 1.7 + ip.x * 0.31 + ip.z * 0.17 + position.y * 0.4) * sw;
          transformed.z += cos(uTime * 1.3 + ip.x * 0.23 - ip.z * 0.11) * sw * 0.7;`);
    };
    return m;
  }

  buildVegetation() {
    const T = this.T, cfg = this.stage.terrain, Hmax = T.summit.y, pal = this.pal, rnd = this.rnd;
    const treeY = cfg.treeLine * Hmax, snowY = cfg.snowLine * Hmax;
    const N = new Noise.Simplex2D(1234 + T.seed % 1000);
    const spots = [];
    const maxTrees = this.Q.trees;
    const step = 2;
    for (let j = 3; j < T.n - 3; j += step) for (let i = 3; i < T.n - 3; i += step) {
      const h = T.heights[j * T.n + i];
      if (h > treeY + 8) continue;
      if (h < T.waterY + 1.2) continue;
      const sl = T.slopeDegAt(i, j);
      if (sl > 34) continue;
      if (T.trailMask[j * T.n + i] > 0.02) continue;
      const [x0, z0] = T.gridToWorld(i, j);
      const x = x0 + (rnd() - 0.5) * T.cell * step, z = z0 + (rnd() - 0.5) * T.cell * step;
      const dens = N.fbm(x * 0.01, z * 0.01, 3) * 0.9 + 0.32 - (h / treeY) * 0.35;
      if (rnd() > dens * 0.55) continue;
      if (Math.hypot(x - T.start.x, z - T.start.z) < 14) continue;
      if (T.camps.some(c => Math.hypot(c.pos.x - x, c.pos.z - z) < 12)) continue;
      if (T.nearWallFace(x, z)) continue;
      if (T.walls.some(w => { const l = T.wallLocal(w, x, z); return Math.abs(l.a) < w.W / 2 + 3 && l.b > -4 && l.b < w.D; })) continue;
      const nt = T.nearestTrail(x, z, 4); if (nt && nt.dist < 2.5) continue;
      spots.push({ x, z, h: T.getHeight(x, z), alt: h / Hmax });
    }
    // 打乱后截断
    for (let k = spots.length - 1; k > 0; k--) { const j = Math.floor(rnd() * (k + 1)); [spots[k], spots[j]] = [spots[j], spots[k]]; }
    spots.length = Math.min(spots.length, maxTrees);
    const palKey = cfg.palette;
    const species = [];
    const snowyPines = palKey === 'alpine';
    for (let v = 0; v < 3; v++) species.push({ kind: 'pine', geo: Models.pine(100 + v * 17, false), colors: pal.pine });
    if (snowyPines) for (let v = 0; v < 2; v++) species.push({ kind: 'snowpine', geo: Models.pine(200 + v * 13, true), colors: pal.pine });
    if (palKey !== 'alpine') for (let v = 0; v < 3; v++) species.push({ kind: 'leaf', geo: Models.broadleaf(300 + v * 11), colors: pal.leaf });
    species.push({ kind: 'dead', geo: Models.deadTree(400), colors: null });
    const buckets = species.map(() => []);
    for (const s of spots) {
      let k;
      const r = rnd();
      if (palKey === 'alpine') k = s.h > snowY - 25 ? 3 + Math.floor(rnd() * 2) : r < 0.93 ? Math.floor(rnd() * 3) : species.length - 1;
      else if (palKey === 'autumn') k = r < 0.4 ? Math.floor(rnd() * 3) : r < 0.93 ? 3 + Math.floor(rnd() * 3) : species.length - 1;
      else k = (r < 0.62 || s.alt > cfg.treeLine * 0.7) ? Math.floor(rnd() * 3) : r < 0.97 ? 3 + Math.floor(rnd() * 3) : species.length - 1;
      k = Math.min(k, species.length - 1);
      buckets[k].push(s);
    }
    const trunkMat = Models.VC(0.9);
    const crownMat = this.swayMaterial(Models.VC(0.8, { side: THREE.DoubleSide }));
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), p = new THREE.Vector3(), col = new THREE.Color(), up = new THREE.Vector3(0, 1, 0);
    this.treeColliders = [];
    species.forEach((sp, k) => {
      const list = buckets[k];
      if (!list.length) return;
      const tr = new THREE.InstancedMesh(sp.geo.trunk, trunkMat, list.length);
      const cr = sp.geo.crown ? new THREE.InstancedMesh(sp.geo.crown, crownMat, list.length) : null;
      list.forEach((s, i) => {
        const size = (0.75 + rnd() * 0.65) * (1 - Math.max(0, s.alt - cfg.treeLine * 0.6) * 0.8);
        p.set(s.x, s.h - 0.2, s.z);
        q.setFromAxisAngle(up, rnd() * Math.PI * 2);
        sc.set(size, size * (0.85 + rnd() * 0.35), size);
        m4.compose(p, q, sc);
        tr.setMatrixAt(i, m4);
        if (cr) {
          cr.setMatrixAt(i, m4);
          const c = rpick(rnd, sp.colors);
          col.setRGB(toLinear(c[0]), toLinear(c[1]), toLinear(c[2])).multiplyScalar(0.85 + rnd() * 0.3);
          cr.setColorAt(i, col);
        }
        this.treeColliders.push({ x: s.x, z: s.z, r: 0.35 * size });
      });
      for (const im of [tr, cr]) {
        if (!im) continue;
        im.castShadow = true; im.receiveShadow = true; im.instanceMatrix.needsUpdate = true;
        if (im.instanceColor) im.instanceColor.needsUpdate = true;
        im.computeBoundingSphere();
        this.scene.add(im);
      }
    });
    // 灌木
    if (palKey !== 'alpine' || true) {
      const bushGeo = Models.bush(55);
      const bushes = [];
      for (let k = 0; k < this.Q.trees * 0.35; k++) {
        const s = spots[Math.floor(rnd() * spots.length)];
        if (!s) break;
        const a = rnd() * Math.PI * 2, r = 2.5 + rnd() * 4;
        const x = s.x + Math.cos(a) * r, z = s.z + Math.sin(a) * r;
        if (T.trailMaskAt(x, z) > 0.05) continue;
        bushes.push({ x, z, h: T.getHeight(x, z) });
      }
      if (bushes.length) {
        const im = new THREE.InstancedMesh(bushGeo, this.swayMaterial(Models.VC(0.85)), bushes.length);
        bushes.forEach((b, i) => {
          const s = 0.6 + rnd() * 0.8;
          m4.compose(p.set(b.x, b.h - 0.1, b.z), q.setFromAxisAngle(up, rnd() * 6.28), sc.set(s, s * 0.8, s));
          im.setMatrixAt(i, m4);
          const c = rpick(rnd, pal.leaf);
          im.setColorAt(i, col.setRGB(toLinear(c[0]), toLinear(c[1]), toLinear(c[2])).multiplyScalar(0.8 + rnd() * 0.3));
        });
        im.castShadow = true; im.receiveShadow = true; im.computeBoundingSphere();
        this.scene.add(im);
      }
    }
  }

  buildBoulders() {
    const T = this.T, Hmax = T.summit.y, rnd = this.rnd;
    const spots = [];
    for (let j = 3; j < T.n - 3; j += 3) for (let i = 3; i < T.n - 3; i += 3) {
      const h = T.heights[j * T.n + i];
      if (h / Hmax < 0.06 || h < T.waterY + 0.5) continue;
      const sl = T.slopeDegAt(i, j);
      if (sl < 8 || sl > 48) continue;
      if (rnd() > 0.045) continue;
      const [x, z] = T.gridToWorld(i, j);
      if (T.trailMaskAt(x, z) > 0.1 || T.nearWallFace(x, z) || T.inCrevasse(x, z, 2)) continue;
      if (T.camps.some(c => Math.hypot(c.pos.x - x, c.pos.z - z) < 10)) continue;
      spots.push({ x, z, h, snow: h / Hmax > this.stage.terrain.snowLine });
      if (spots.length >= this.Q.rocks) break;
    }
    if (!spots.length) return;
    const variants = [Models.rock(11), Models.rock(23), Models.rock(37)];
    const mat = Terrain.rockMaterial(this.tex, 0xffffff, false);
    const snowMat = Terrain.rockMaterial(this.tex, 0xffffff, false);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), e = new THREE.Euler();
    this.boulders = [];
    variants.forEach((g, vi) => {
      const list = spots.filter((_, k) => k % 3 === vi);
      if (!list.length) return;
      const im = new THREE.InstancedMesh(g, mat, list.length);
      list.forEach((sp, k) => {
        const sc = 0.5 + Math.pow(rnd(), 2) * 2.4;
        p.set(sp.x, sp.h - sc * 0.25, sp.z);
        e.set((rnd() - 0.5) * 0.4, rnd() * Math.PI * 2, (rnd() - 0.5) * 0.4); q.setFromEuler(e);
        s.set(sc, sc, sc);
        m4.compose(p, q, s); im.setMatrixAt(k, m4);
        if (sc > 1.2) this.boulders.push({ x: sp.x, z: sp.z, r: sc * 0.9, top: sp.h + sc * 0.45 });
      });
      im.castShadow = true; im.receiveShadow = true; im.computeBoundingSphere();
      this.scene.add(im);
    });
    snowMat.dispose();
  }

  /* ---------------- 草地（跟随玩家的实例化草丛） ---------------- */
  buildGrass() {
    const count = this.Q.grass;
    this.grassR = 36;
    this.grassCell = Math.sqrt(Math.PI * this.grassR * this.grassR / count) * 0.95;
    const mat = this.swayMaterial(Models.VC(0.9, { side: THREE.DoubleSide }));
    this.grass = new THREE.InstancedMesh(Models.grassTuft(), mat, count);
    this.grass.count = 0; this.grass.frustumCulled = false; this.grass.receiveShadow = true;
    this.scene.add(this.grass);
    const fc = Math.floor(count / 10);
    const fmat = this.swayMaterial(Models.VC(0.7));
    this.flowers = new THREE.InstancedMesh(Models.flower(), fmat, fc);
    this.flowers.count = 0; this.flowers.frustumCulled = false;
    this.scene.add(this.flowers);
    this.grassCenter = new THREE.Vector2(1e9, 1e9);
  }

  updateGrass(px, pz) {
    if (!this.grass) return;
    if (Math.hypot(px - this.grassCenter.x, pz - this.grassCenter.y) < 4) return;
    this.grassCenter.set(px, pz);
    const T = this.T, c = this.grassCell, R = this.grassR, pal = this.pal;
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), col = new THREE.Color(), up = new THREE.Vector3(0, 1, 0);
    const g1 = srgb(...pal.grass), g2 = srgb(...pal.grass2);
    const i0 = Math.floor((px - R) / c), i1 = Math.ceil((px + R) / c), j0 = Math.floor((pz - R) / c), j1 = Math.ceil((pz + R) / c);
    let n = 0, fn = 0;
    const max = this.grass.instanceMatrix.count, fmax = this.flowers.instanceMatrix.count;
    const flowersOn = pal.flowers.length > 0;
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      let h = ((i * 73856093) ^ (j * 19349663)) >>> 0;
      const r1 = ((h = Math.imul(h ^ (h >>> 13), 0x5bd1e995) >>> 0) % 10000) / 10000;
      const r2 = ((h = Math.imul(h ^ (h >>> 15), 0x27d4eb2d) >>> 0) % 10000) / 10000;
      const r3 = ((h = Math.imul(h ^ (h >>> 13), 0x165667b1) >>> 0) % 10000) / 10000;
      const x = (i + r1) * c, z = (j + r2) * c;
      const d = Math.hypot(x - px, z - pz);
      if (d > R) continue;
      const gr = T.grassiness(x, z);
      if (gr < 0.35 || r3 > gr * 1.1) continue;
      if (T.trailMaskAt(x, z) > 0.3) continue;
      const y = T.getHeight(x, z);
      if (y < T.waterY + 0.3) continue;
      const fade = smoothstep(R, R * 0.7, d);
      const sc = (0.7 + r3 * 0.7) * fade * (0.6 + gr * 0.5);
      p.set(x, y - 0.03, z); q.setFromAxisAngle(up, r1 * 6.28); s.set(sc, sc * (0.8 + r2 * 0.6), sc);
      m4.compose(p, q, s);
      if (flowersOn && r2 > 0.9 && fn < fmax) {
        this.flowers.setMatrixAt(fn, m4);
        const fc = pal.flowers[Math.floor(r1 * 97) % pal.flowers.length];
        this.flowers.setColorAt(fn, col.setRGB(toLinear(fc[0]), toLinear(fc[1]), toLinear(fc[2])));
        fn++;
      } else if (n < max) {
        this.grass.setMatrixAt(n, m4);
        col.copy(g1).lerp(g2, r2 * 0.8 + (1 - gr) * 0.3);
        this.grass.setColorAt(n, col);
        n++;
      }
    }
    this.grass.count = n; this.flowers.count = fn;
    this.grass.instanceMatrix.needsUpdate = true; if (this.grass.instanceColor) this.grass.instanceColor.needsUpdate = true;
    this.flowers.instanceMatrix.needsUpdate = true; if (this.flowers.instanceColor) this.flowers.instanceColor.needsUpdate = true;
  }

  /* ---------------- 步道设施 ---------------- */
  buildTrailProps() {
    const T = this.T, tr = T.trail, rnd = this.rnd;
    const markers = [];
    let next = 20, side = 1;
    for (let k = 1; k < tr.length - 3; k++) {
      if (tr[k].s < next) continue;
      next += 22;
      const a = tr[k - 1], b = tr[k + 1];
      const dx = b.x - a.x, dz = b.z - a.z, l = Math.hypot(dx, dz) || 1;
      const x = tr[k].x - dz / l * 1.9 * side, z = tr[k].z + dx / l * 1.9 * side;
      side = -side;
      if (T.inCrevasse(x, z, 1)) continue;
      markers.push({ x, z, y: T.getHeight(x, z) });
    }
    const mk = Models.trailMarker();
    const poleGeo = mk.children[0].geometry, capGeo = mk.children[1].geometry;
    const pm = new THREE.InstancedMesh(poleGeo, Models.VC(0.6), markers.length);
    this.markerCapMat = Models.M(0xffcc33, 0.4, 0, { emissive: 0xffaa00, emissiveIntensity: 0 });
    const cm = new THREE.InstancedMesh(capGeo, this.markerCapMat, markers.length);
    const m4 = new THREE.Matrix4();
    markers.forEach((m, i) => {
      m4.makeTranslation(m.x, m.y - 0.1, m.z); pm.setMatrixAt(i, m4);
      m4.makeTranslation(m.x, m.y - 0.1 + 1.42, m.z); cm.setMatrixAt(i, m4);
    });
    pm.castShadow = true; pm.computeBoundingSphere(); cm.computeBoundingSphere();
    this.scene.add(pm); this.scene.add(cm);
    this.markers = markers;
    // 陡峭路段：固定绳与铁桩
    const postM = Models.M(0x6f757d, 0.4, 0.7), ropeM = new THREE.LineBasicMaterial({ color: 0xe0782f });
    let runPts = [];
    const flush = () => {
      if (runPts.length >= 3) {
        const pts = [];
        runPts.forEach((p, i) => {
          const post = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.035, 1.1, 6), postM);
          post.position.set(p.x, p.y + 0.5, p.z); post.castShadow = true; this.scene.add(post);
          if (i) { const a = runPts[i - 1]; for (let k = 1; k <= 6; k++) { const t = k / 6; pts.push(new THREE.Vector3(lerp(a.x, p.x, t), lerp(a.y, p.y, t) + 1.0 - Math.sin(t * Math.PI) * 0.15, lerp(a.z, p.z, t))); } }
          else pts.push(new THREE.Vector3(p.x, p.y + 1.0, p.z));
        });
        this.scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), ropeM));
      }
      runPts = [];
    };
    for (let k = 3; k < tr.length - 3; k += 2) {
      const g = Math.abs(tr[k + 3].y - tr[k - 3].y) / 12;
      if (g > 0.5 && !T.inCrevasse(tr[k].x, tr[k].z, 3)) {
        const a = tr[k - 1], b = tr[k + 1], l = Math.hypot(b.x - a.x, b.z - a.z) || 1;
        const x = tr[k].x - (b.z - a.z) / l * 1.5, z = tr[k].z + (b.x - a.x) / l * 1.5;
        runPts.push({ x, z, y: T.getHeight(x, z) });
      } else flush();
    }
    flush();
    // 石堆
    for (let s = 90; s < T.trailLength - 40; s += 110) {
      const k = tr.findIndex(p => p.s >= s);
      if (k < 2) continue;
      const a = tr[k - 1], b = tr[k + 1];
      const dx = b.x - a.x, dz = b.z - a.z, l = Math.hypot(dx, dz) || 1;
      const x = tr[k].x + dz / l * 2.6, z = tr[k].z - dx / l * 2.6;
      if (T.inCrevasse(x, z, 1)) continue;
      const c = Models.cairn(rnd, 5 + Math.floor(rnd() * 3));
      c.position.set(x, T.getHeight(x, z) - 0.05, z);
      this.scene.add(c);
    }
    // 登山口
    const s0 = tr[Math.min(6, tr.length - 1)];
    const trailKm = (T.trailLength / 1000).toFixed(1);
    const sign = Models.signpost([{ text: `峰顶 ↑ ${trailKm} km`, angle: 0 }, { text: this.stage.name + ' 登山口', angle: 0.3 }]);
    sign.position.set(s0.x + 2.4, T.getHeight(s0.x + 2.4, s0.z), s0.z);
    sign.rotation.y = Math.atan2(tr[10].x - s0.x, tr[10].z - s0.z) - Math.PI / 2;
    this.scene.add(sign);
    // 起点小营地：帐篷与篝火
    const st = T.start;
    const t0 = Models.tent(0x2f7bd1, 0.9); t0.position.set(st.x - 5, T.getHeight(st.x - 5, st.z - 3), st.z - 3); t0.rotation.y = 0.8; this.scene.add(t0);
    const bench = Models.logBench(); bench.position.set(st.x + 3, T.getHeight(st.x + 3, st.z - 4), st.z - 4); bench.rotation.y = 0.4; this.scene.add(bench);
  }

  /* ---------------- 营地 ---------------- */
  buildCamps() {
    const T = this.T, rnd = this.rnd;
    this.fires = [];
    const tentColors = [0xe8612c, 0xf2b705, 0x2f9e44, 0xd6336c, 0x1c7ed6];
    T.camps.forEach((camp, k) => this.dressCamp(camp, k, tentColors[k % tentColors.length], true));
  }

  dressCamp(camp, k, color, fixed) {
    const T = this.T, rnd = this.rnd;
    const g = new THREE.Group();
    g.position.copy(camp.pos);
    g.rotation.y = camp.dir || 0;
    const tent = Models.tent(color);
    tent.position.set(-3.2, 0, 1.2); tent.rotation.y = 0.5; g.add(tent);
    if (fixed) {
      const tent2 = Models.tent(0x495057, 0.85); tent2.position.set(3.4, 0, -2.2); tent2.rotation.y = 2.6; g.add(tent2);
      for (const [x, z, r] of [[1.9, 0.6, 0.3], [-0.6, 2.0, 1.8], [0.2, -1.9, -1.4]]) { const b = Models.logBench(); b.position.set(x, 0, z); b.rotation.y = r; g.add(b); }
      const sign = Models.signpost([{ text: camp.name, angle: 0 }]);
      sign.position.set(4.5, 0, 3.4); sign.rotation.y = -0.6; g.add(sign);
      const wp = Models.woodPile(rnd); wp.position.set(-1.6, 0, -2.6); wp.rotation.y = 0.8; g.add(wp);
      // 经幡
      const pA = new THREE.Vector3(-5.5, 0, -4), pB = new THREE.Vector3(5.5, 0, -5);
      for (const pp of [pA, pB]) { const pole = Models.mesh(new THREE.CylinderGeometry(0.04, 0.05, 3.4, 6), Models.M(0x888888, 0.5)); pole.position.set(pp.x, 1.7, pp.z); g.add(pole); }
      const pf = Models.prayerFlags(new THREE.Vector3(pA.x, 3.3, pA.z), new THREE.Vector3(pB.x, 3.3, pB.z), 0.7);
      g.add(pf); this.prayer.push(pf);
    }
    const pot = Models.pot(); pot.position.set(0, 0.62, 0); pot.visible = false; g.add(pot);
    const fire = Models.campfire(rnd);
    g.add(fire.group);
    fire.lit = 0; fire.target = fixed ? 0.25 : 0;
    // 贴地：营地组内所有子物体的 y 按地形修正
    for (const ch of g.children) {
      const wp = ch.position.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), g.rotation.y).add(g.position);
      ch.position.y += T.getHeight(wp.x, wp.z) - camp.pos.y;
    }
    this.scene.add(g);
    camp.group = g; camp.fireObj = fire; camp.pot = pot; camp.light = this.campLights[fixed ? k : this.campLights.length - 1];
    camp.light.position.copy(camp.pos).add(new THREE.Vector3(0, 1.3, 0));
    const tw = tent.position.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), g.rotation.y).add(g.position);
    camp.tentPos = tw;
    this.fires.push(camp);
    return camp;
  }

  /* 登山口的营火 */
  addStartFire(pos) {
    const fire = Models.campfire(this.rnd);
    fire.group.position.copy(pos);
    fire.lit = 0; fire.target = 0;
    this.scene.add(fire.group);
    const c = { pos: pos.clone(), fireObj: fire, light: this.campLights[this.campLights.length - 2], fixed: true, start: true, name: '登山口' };
    this.fires.push(c);
    return c;
  }

  /* 玩家自己搭建帐篷 */
  pitchTent(pos, yaw) {
    const T = this.T;
    const old = T.camps.find(c => c.custom);
    if (old) { this.scene.remove(old.group); disposeTree(old.group); T.camps.splice(T.camps.indexOf(old), 1); this.fires.splice(this.fires.indexOf(old), 1); }
    const camp = { pos: pos.clone(), dir: yaw, index: 0, visited: true, fixed: false, custom: true, fire: 0, name: '我的营地' };
    camp.pos.y = T.getHeight(pos.x, pos.z);
    this.dressCamp(camp, 0, 0xff6b35, false);
    // 帐篷放在营火一侧
    T.camps.push(camp);
    return camp;
  }

  /* ---------------- 岩壁 ---------------- */
  buildWalls() {
    const T = this.T;
    this.walls = T.walls.map((site, k) => {
      const w = new ClimbWall(site, T, Noise.mulberry32(T.seed + 900 + k), this.tex, k);
      this.scene.add(w.group);
      // 底部标牌
      const bp = w.point(-w.W / 2 - 1.5, 0, -3.5);
      const sign = Models.signpost([{ text: `${w.icy ? '冰壁' : '攀岩路线'} ${Math.round(w.H)}m`, angle: 0 }]);
      sign.position.set(bp.x, T.getHeight(bp.x, bp.z), bp.z);
      sign.rotation.y = Math.atan2(w.n.x, w.n.z) - Math.PI / 2;
      this.scene.add(sign);
      return w;
    });
  }

  /* ---------------- 冰裂缝与梯子桥 ---------------- */
  buildCrevasses() {
    const T = this.T;
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.25, metalness: 0, side: THREE.DoubleSide });
    for (const cv of T.crevasses) {
      for (const side of [-1, 1]) {
        const segs = 30, pos = [], col = [], idx = [];
        for (let k = 0; k <= segs; k++) {
          const u = -cv.L / 2 + cv.L * k / segs;
          const wd = T.crevWidthAt(cv, u);
          const v = side * wd / 2;
          const x = cv.x + cv.ux * u + cv.vx * v, z = cv.z + cv.uz * u + cv.vz * v;
          const top = T.getHeight(x + cv.vx * side * 0.6, z + cv.vz * side * 0.6) + 0.05;
          for (let r = 0; r <= 4; r++) {
            const t = r / 4;
            const inset = t * wd * 0.35;
            pos.push(x - cv.vx * side * inset, top - t * (cv.depth + 3), z - cv.vz * side * inset);
            const c = srgb(lerp(0.75, 0.02, t), lerp(0.9, 0.08, t), lerp(1.0, 0.18, t));
            col.push(c.r, c.g, c.b);
          }
        }
        for (let k = 0; k < segs; k++) for (let r = 0; r < 4; r++) { const a = k * 5 + r, b = a + 1, c = a + 5, d = c + 1; idx.push(a, c, b, b, c, d); }
        const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.setIndex(idx); g.computeVertexNormals();
        const m = new THREE.Mesh(g, mat); m.receiveShadow = true; this.scene.add(m);
      }
    }
    for (const b of T.bridges) {
      const br = Models.bridge(b.len);
      br.position.set(b.x, (b.y0 + b.y1) / 2 - 0.05, b.z);
      br.rotation.order = 'YXZ';
      br.rotation.y = Math.atan2(b.tx, b.tz) - Math.PI / 2;
      br.rotation.z = Math.atan2(b.y1 - b.y0, b.len);
      this.scene.add(br);
    }
  }

  /* ---------------- 收集品 ---------------- */
  buildCollectibles() {
    const T = this.T, rnd = this.rnd;
    const beamM = new THREE.MeshBasicMaterial({ color: 0xffd27a, transparent: true, opacity: 0.12, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending });
    for (const s of T.stashes) {
      const g = Models.stash(s.bonus);
      g.position.copy(s.pos); g.rotation.y = rnd() * 6.28;
      const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.35, 16, 8, 1, true), beamM.clone());
      beam.position.y = 8; if (s.bonus) beam.material.color.set(0xc9a0ff); g.add(beam);
      s.group = g; s.beam = beam;
      this.scene.add(g);
    }
    for (const j of T.journals) {
      const g = Models.journal(); g.position.copy(j.pos); g.rotation.y = rnd() * 6.28;
      j.group = g; this.scene.add(g);
    }
    for (const v of T.viewpoints) {
      const g = Models.viewpoint(); g.position.copy(v.pos); g.rotation.y = v.dir;
      v.group = g; this.scene.add(g);
    }
    for (const f of T.firewood) {
      const g = Models.woodPile(rnd); g.position.copy(f.pos); g.rotation.y = rnd() * 6.28;
      f.group = g; this.scene.add(g);
    }
  }

  buildSummit() {
    const T = this.T, s = T.summit, rnd = this.rnd;
    const g = new THREE.Group(); g.position.copy(s);
    const cairn = Models.cairn(rnd, 9); cairn.scale.setScalar(2.2); g.add(cairn);
    const pole = Models.mesh(new THREE.CylinderGeometry(0.05, 0.06, 4.8, 8), Models.M(0xdddddd, 0.4, 0.3)); pole.position.y = 2.4; g.add(pole);
    const flag = Models.flag(0xd62828, 1.6, 1.0); flag.mesh.position.set(0, 4.2, 0); g.add(flag.mesh); this.flags.push(flag);
    for (let side = 0; side < 3; side++) {
      const ang = side / 3 * Math.PI * 2 + 0.4;
      const ex = Math.cos(ang) * 6, ez = Math.sin(ang) * 6;
      const eh = T.getHeight(s.x + ex, s.z + ez) - s.y;
      const p2 = Models.mesh(new THREE.CylinderGeometry(0.03, 0.04, 2.4, 6), Models.M(0x999999, 0.5)); p2.position.set(ex, eh + 1.2, ez); g.add(p2);
      const pf = Models.prayerFlags(new THREE.Vector3(0, 4.6, 0), new THREE.Vector3(ex, eh + 2.35, ez), 0.5);
      g.add(pf); this.prayer.push(pf);
    }
    const plaqueTex = Models.textTexture([this.stage.name, `${Math.round(this.stage.altBase + s.y * this.stage.altScale)} m`], 256, 128, '#3b3b3b', '#f5d76e', 40);
    const plaque = Models.mesh(new THREE.BoxGeometry(0.9, 0.45, 0.06), [Models.M(0x333333), Models.M(0x333333), Models.M(0x333333), Models.M(0x333333), new THREE.MeshStandardMaterial({ map: plaqueTex, metalness: 0.4, roughness: 0.5 }), Models.M(0x333333)]);
    plaque.position.set(1.4, 0.7, 0.8); plaque.rotation.set(-0.3, -0.5, 0); g.add(plaque);
    const ring = new THREE.Mesh(new THREE.RingGeometry(3.6, 4.2, 48), new THREE.MeshBasicMaterial({ color: 0xffd479, transparent: true, opacity: 0.4, side: THREE.DoubleSide, depthWrite: false }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.15; g.add(ring);
    this.summitRing = ring;
    this.scene.add(g);
  }

  /* ---------------- 粒子 ---------------- */
  buildParticles() {
    const n = this.Q.snow;
    const pos = new Float32Array(n * 3);
    this.snowSpeed = new Float32Array(n);
    for (let i = 0; i < n; i++) { pos[i * 3] = (Math.random() - 0.5) * 60; pos[i * 3 + 1] = (Math.random() - 0.5) * 50; pos[i * 3 + 2] = (Math.random() - 0.5) * 60; this.snowSpeed[i] = 2 + Math.random() * 3; }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.snowMat = new THREE.PointsMaterial({ size: 0.22, map: Tex.soft(), transparent: true, opacity: 0, depthWrite: false, color: 0xffffff });
    this.snow = new THREE.Points(geo, this.snowMat); this.snow.frustumCulled = false;
    this.scene.add(this.snow);
    // 氛围粒子：萤火虫(夏夜)/落叶(秋)/冰晶(高山)
    const kind = this.stage.terrain.palette;
    const an = 260, ap = new Float32Array(an * 3), ac = new Float32Array(an * 3);
    const cols = kind === 'autumn' ? [[0.95, 0.5, 0.1], [0.9, 0.75, 0.2], [0.8, 0.25, 0.08]] : kind === 'summer' ? [[0.9, 1, 0.4]] : [[0.85, 0.92, 1]];
    for (let i = 0; i < an; i++) {
      ap[i * 3] = (Math.random() - 0.5) * 50; ap[i * 3 + 1] = Math.random() * 12; ap[i * 3 + 2] = (Math.random() - 0.5) * 50;
      const c = cols[i % cols.length]; ac[i * 3] = toLinear(c[0]); ac[i * 3 + 1] = toLinear(c[1]); ac[i * 3 + 2] = toLinear(c[2]);
    }
    const ag = new THREE.BufferGeometry(); ag.setAttribute('position', new THREE.BufferAttribute(ap, 3)); ag.setAttribute('color', new THREE.BufferAttribute(ac, 3));
    this.ambMat = new THREE.PointsMaterial({ size: kind === 'autumn' ? 0.16 : 0.12, map: Tex.soft(), vertexColors: true, transparent: true, opacity: 0, depthWrite: false, blending: kind === 'summer' ? THREE.AdditiveBlending : THREE.NormalBlending });
    this.amb = new THREE.Points(ag, this.ambMat); this.amb.frustumCulled = false; this.ambKind = kind;
    this.scene.add(this.amb);
    // 落石尘土
    this.dust = [];
    const dm = new THREE.SpriteMaterial({ map: Tex.soft(), color: 0x9a8f80, transparent: true, depthWrite: false, opacity: 0 });
    for (let k = 0; k < 12; k++) { const s = new THREE.Sprite(dm.clone()); s.visible = false; this.scene.add(s); this.dust.push({ s, t: 9 }); }
  }

  puff(pos, size = 2, color = 0x9a8f80) {
    const d = this.dust.find(x => x.t >= 1.5) || this.dust[0];
    d.t = 0; d.s.position.copy(pos); d.s.visible = true; d.size = size; d.s.material.color.set(color);
  }

  buildBirds() {
    const T = this.T, n = this.stage.key === 'eagle' ? 3 : this.stage.key === 'verdant' ? 2 : 1;
    this.birds = [];
    for (let k = 0; k < n; k++) {
      const b = Models.eagle();
      const c = T.walls[k % Math.max(1, T.walls.length)];
      const center = c ? new THREE.Vector3(c.B.x, c.topY + 25 + k * 8, c.B.z) : new THREE.Vector3(T.summit.x * 0.5, T.summit.y * 0.8, T.summit.z * 0.5);
      Object.assign(b.userData, { center, r: 30 + k * 12, sp: 0.18 + k * 0.03, ph: k * 2.1 });
      b.scale.setScalar(1.2);
      this.scene.add(b); this.birds.push(b);
    }
  }

  /* ---------------- 每帧 ---------------- */
  update(dt, player, W, camera, pp) {
    this.time += dt;
    const t = this.time, T = this.T;
    this.windU.uTime.value = t;
    this.windU.uWind.value = 0.4 + clamp(W.windSpeed / 8, 0, 1.5);
    const storm = W.intensity;
    this.sky.update(dt, W.hour, storm, camera, t);
    const L = this.sky.light();
    const sun = this.sun;
    sun.color.copy(L.col); sun.intensity = L.I;
    sun.position.copy(pp).addScaledVector(L.dir, 400);
    sun.target.position.copy(pp); sun.target.updateMatrixWorld();
    this.hemi.color.copy(L.hemiSky); this.hemi.groundColor.setRGB(0.42, 0.38, 0.32).multiplyScalar(1 - L.night * 0.75);
    this.hemi.intensity = L.hemiI;
    this.night = L.night;
    // 雾
    const snowHaze = W.snowfall * (1 - storm) * 0.5;
    const nightF = L.night;
    const fogNear = lerp(lerp(lerp(220, 70, snowHaze), 60, nightF * 0.6), 3, storm);
    const fogFar = lerp(lerp(lerp(3200, 1200, snowHaze), 1100, nightF * 0.6), 95, storm);
    const fog = this.scene.fog;
    fog.near = damp(fog.near, fogNear, 0.8, dt); fog.far = damp(fog.far, fogFar, 0.8, dt);
    fog.color.copy(this.sky.fogCol);
    if (this.water) {
      const U = this.waterU; U.uTime.value = t; U.uSunDir.value.copy(this.sky.sunDir); U.uSunCol.value.copy(this.sky.sunCol).multiplyScalar(this.sky.sunDir.y > 0 ? 1 : 0);
      U.uSky.value.copy(this.sky.zen); U.uHor.value.copy(this.sky.hor);
      U.fogColor.value.copy(fog.color); U.fogNear.value = fog.near; U.fogFar.value = fog.far;
    }
    this.markerCapMat.emissiveIntensity = L.night * 2.5 + storm * 1.5;
    this.updateGrass(pp.x, pp.z);
    // 雪
    const sf = W.snowfall;
    this.snowMat.opacity = damp(this.snowMat.opacity, sf * 0.95, 2, dt);
    this.snowMat.size = 0.18 + storm * 0.12;
    if (this.snowMat.opacity > 0.01) {
      const arr = this.snow.geometry.attributes.position.array, cp = camera.position, w = W.wind;
      const n = this.snowSpeed.length, wx = w.x * 0.8 * dt, wz = w.z * 0.8 * dt;
      for (let i = 0; i < n; i++) {
        let x = arr[i * 3], y = arr[i * 3 + 1], z = arr[i * 3 + 2];
        y -= this.snowSpeed[i] * dt * (1 + storm * 0.6);
        x += wx + Math.sin(t * 2 + i) * 0.3 * dt; z += wz + Math.cos(t * 1.7 + i * 0.7) * 0.3 * dt;
        if (y < cp.y - 25) y += 50; else if (y > cp.y + 25) y -= 50;
        if (x < cp.x - 30) x += 60; else if (x > cp.x + 30) x -= 60;
        if (z < cp.z - 30) z += 60; else if (z > cp.z + 30) z -= 60;
        arr[i * 3] = x; arr[i * 3 + 1] = y; arr[i * 3 + 2] = z;
      }
      this.snow.geometry.attributes.position.needsUpdate = true;
    }
    // 氛围粒子
    const low = pp.y < T.summit.y * this.stage.terrain.treeLine + 10;
    let ambT = 0;
    if (this.ambKind === 'summer') ambT = low ? L.night * (1 - storm) : 0;
    else if (this.ambKind === 'autumn') ambT = low ? (1 - L.night * 0.7) * 0.9 : 0;
    else ambT = (1 - storm) * 0.35 * (1 - L.night);
    this.ambMat.opacity = damp(this.ambMat.opacity, ambT, 1, dt);
    if (this.ambMat.opacity > 0.01) {
      const arr = this.amb.geometry.attributes.position.array, cp = pp, n = arr.length / 3;
      for (let i = 0; i < n; i++) {
        let x = arr[i * 3], y = arr[i * 3 + 1], z = arr[i * 3 + 2];
        if (this.ambKind === 'autumn') { y -= (0.6 + (i % 5) * 0.1) * dt; x += (W.wind.x * 0.3 + Math.sin(t * 2 + i) * 0.8) * dt; z += (W.wind.z * 0.3 + Math.cos(t * 1.6 + i) * 0.8) * dt; }
        else { x += Math.sin(t * 0.7 + i * 1.3) * 0.4 * dt; y += Math.cos(t * 0.9 + i) * 0.25 * dt; z += Math.cos(t * 0.6 + i * 0.7) * 0.4 * dt; }
        const gy = T.getHeight(x, z);
        if (y < gy + 0.2) y = gy + 6 + (i % 7);
        if (y > gy + 14) y = gy + 0.5;
        if (x < cp.x - 25) x += 50; else if (x > cp.x + 25) x -= 50;
        if (z < cp.z - 25) z += 50; else if (z > cp.z + 25) z -= 50;
        arr[i * 3] = x; arr[i * 3 + 1] = y; arr[i * 3 + 2] = z;
      }
      this.amb.geometry.attributes.position.needsUpdate = true;
    }
    // 旗帜
    const ws = clamp(W.windSpeed / 10, 0.15, 1.6);
    for (const f of this.flags) {
      f.mesh.rotation.y = W.windAngle - Math.PI / 2 + Math.sin(t * 1.3) * 0.15;
      const pa = f.mesh.geometry.attributes.position, arr = pa.array, base = f.base;
      for (let i = 0; i < pa.count; i++) {
        const u = base[i * 3] / f.w;
        arr[i * 3 + 2] = Math.sin(u * 5 - t * (6 + ws * 6)) * 0.12 * u * ws + Math.sin(u * 9 - t * 11) * 0.03 * u;
        arr[i * 3 + 1] = base[i * 3 + 1] - u * u * 0.12 * (1 - ws * 0.6);
      }
      pa.needsUpdate = true;
    }
    for (const pf of this.prayer) for (const f of pf.userData.flags) f.rotation.x = Math.sin(t * (3 + ws * 4) + f.userData.ph) * 0.35 * ws;
    // 营火
    for (const c of this.fires) {
      const f = c.fireObj;
      f.lit = damp(f.lit, f.target, 1.5, dt);
      f.update(dt, t, W.wind);
      c.light.intensity = f.lit * (2.2 + Math.sin(t * 17) * 0.3 + Math.sin(t * 7.3) * 0.25) * (1 + L.night);
      c.light.position.set(c.pos.x, c.pos.y + 1.2, c.pos.z);
    }
    // 收集品动画
    for (const s of T.stashes) if (s.group && !s.taken) { s.beam.material.opacity = 0.08 + 0.06 * Math.sin(t * 2 + s.pos.x) + L.night * 0.1; }
    for (const j of T.journals) if (j.group && !j.taken) { const gl = j.group.userData.glow; gl.material.opacity = 0.55 + 0.35 * Math.sin(t * 3 + j.pos.x); gl.scale.setScalar(0.8 + 0.2 * Math.sin(t * 2)); }
    this.summitRing.material.opacity = 0.3 + Math.sin(t * 3) * 0.15;
    // 尘土
    for (const d of this.dust) {
      if (d.t >= 1.5) { d.s.visible = false; continue; }
      d.t += dt; const f = d.t / 1.5;
      d.s.scale.setScalar(d.size * (0.5 + f * 1.5)); d.s.material.opacity = 0.5 * (1 - f); d.s.position.y += dt * 0.8;
    }
    // 飞鸟
    for (const b of this.birds) {
      const u = b.userData, a = t * u.sp + u.ph;
      b.position.set(u.center.x + Math.cos(a) * u.r, u.center.y + Math.sin(a * 2.3) * 3, u.center.z + Math.sin(a) * u.r);
      b.rotation.set(0, -a, 0.35);
      const flap = Math.sin(t * 7 + u.ph) > 0.6 ? Math.sin(t * 14) * 0.5 : 0.08;
      b.userData.wings[0].rotation.z = flap; b.userData.wings[1].rotation.z = -flap;
    }
  }

  dispose() { disposeTree(this.scene); }
}
