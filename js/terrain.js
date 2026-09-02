/* 程序化山体：高度场生成、采样、着色与网格构建 */
const MAT = { GRASS: 0, DIRT: 1, ROCK: 2, SNOW: 3, ICE: 4 };
const MAT_NAME = ['草地', '碎石坡', '岩壁', '雪面', '冰面'];

function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
function lerp(a, b, t) { return a + (b - a) * t; }
function smoothstep(a, b, x) { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); }
function toLinear(c) { return Math.pow(c, 2.2); }

class Terrain {
  constructor(cfg, seed) {
    this.cfg = cfg;
    this.size = cfg.size;
    this.res = cfg.res;
    this.cell = this.size / this.res;
    this.n = this.res + 1;
    this.radius = cfg.radius;
    this.heights = new Float32Array(this.n * this.n);
    this.mats = new Uint8Array(this.n * this.n);
    this.noise = new Noise.Simplex2D(seed);
    this.rnd = Noise.mulberry32(seed * 7919 + 17);
    this.start = new THREE.Vector3(0, 0, -cfg.radius * 0.97);
    this.camps = [];
    this.crates = [];
    this.summit = new THREE.Vector3();

    // 次级山峰
    this.subPeaks = [];
    const nSub = 3;
    for (let k = 0; k < nSub; k++) {
      const ang = (k / nSub) * Math.PI * 2 + this.rnd() * 1.5 + 0.8; // 避开起点方向(-z)
      const rr = this.radius * (0.4 + this.rnd() * 0.25);
      this.subPeaks.push({ x: Math.cos(ang) * rr, z: Math.sin(ang) * rr, h: cfg.height * (0.18 + this.rnd() * 0.2), w: 55 + this.rnd() * 50 });
    }
  }

  /* ---------- 生成 ---------- */
  rawHeight(x, z) {
    const N = this.noise, cfg = this.cfg, H = cfg.height, R = this.radius;
    const wx = x + 90 * N.fbm(x * 0.0025 + 11.3, z * 0.0025 - 4.7, 3);
    const wz = z + 90 * N.fbm(x * 0.0025 - 8.1, z * 0.0025 + 3.9, 3);
    const ang = Math.atan2(wz, wx);
    const rMod = 1 + 0.2 * N.fbm(Math.cos(ang) * 1.7 + 5, Math.sin(ang) * 1.7 + 5, 2);
    const r = Math.sqrt(wx * wx + wz * wz) / (R * rMod);
    let base = H * Math.pow(Math.max(0, 1 - r), cfg.steep);
    for (const sp of this.subPeaks) {
      const dx = x - sp.x, dz = z - sp.z;
      base += sp.h * Math.exp(-(dx * dx + dz * dz) / (2 * sp.w * sp.w));
    }
    const env = Math.min(1, 0.18 + (base / H) * 1.1);
    const ridge = N.ridged(x * 0.006 + 3, z * 0.006 + 9, 4);
    let h = base + ridge * cfg.ridgeAmp * H * env;
    h += N.fbm(x * 0.0035, z * 0.0035, 3) * cfg.rollAmp;
    h += N.fbm(x * 0.03 + 2, z * 0.03, 3) * 2.0 + N.fbm(x * 0.12, z * 0.12, 2) * 0.45;
    h += H * 0.07 * Math.exp(-(x * x + z * z) / (2 * 30 * 30));
    // 台阶/平台：制造可以休息的岩架
    const tk = cfg.terrace * (0.45 + 0.55 * Math.min(1, (h / H) * 1.4));
    const t = h / cfg.terraceStep, f = Math.floor(t), fr = t - f;
    const q = fr * fr * fr * (fr * (fr * 6 - 15) + 10);
    h = cfg.terraceStep * (f + lerp(fr, q, tk));
    return h;
  }

  beginGenerate() {
    this.startH = Math.max(0, this.rawHeight(this.start.x, this.start.z));
    this.start.y = this.startH;
  }

  /* 分块生成高度场（便于显示进度） */
  generateRows(j0, j1) {
    const n = this.n, H = this.heights;
    const sx = this.start.x, sz = this.start.z;
    const flatDist = 60, startH = this.startH;
    for (let j = j0; j < j1; j++) {
      const z = -this.size / 2 + j * this.cell;
      for (let i = 0; i < n; i++) {
        const x = -this.size / 2 + i * this.cell;
        let h = this.rawHeight(x, z);
        const ds = Math.hypot(x - sx, z - sz);
        if (ds < flatDist) h = lerp(startH, h, smoothstep(flatDist * 0.35, flatDist, ds));
        if (h < 0) h = 0;
        H[j * n + i] = h;
      }
    }
  }

  generate() { this.beginGenerate(); this.generateRows(0, this.n); }

  /* 限制最大坡度，保证物理上可攀 */
  limitSlopes(maxDeg) {
    const maxD = this.cell * Math.tan(maxDeg * Math.PI / 180);
    const H = this.heights, n = this.n;
    for (let it = 0; it < 5; it++) {
      for (let j = 0; j < n; j++) {
        for (let i = 0; i < n; i++) {
          const idx = j * n + i;
          if (i + 1 < n) {
            const d = H[idx] - H[idx + 1];
            if (Math.abs(d) > maxD) { const ex = (Math.abs(d) - maxD) * 0.5 * Math.sign(d); H[idx] -= ex; H[idx + 1] += ex; }
          }
          if (j + 1 < n) {
            const d = H[idx] - H[idx + n];
            if (Math.abs(d) > maxD) { const ex = (Math.abs(d) - maxD) * 0.5 * Math.sign(d); H[idx] -= ex; H[idx + n] += ex; }
          }
        }
      }
    }
  }

  findSummit() {
    const H = this.heights, n = this.n;
    let best = -1e9, bi = 0, bj = 0;
    for (let j = 2; j < n - 2; j++) for (let i = 2; i < n - 2; i++) {
      const h = H[j * n + i];
      if (h > best) { best = h; bi = i; bj = j; }
    }
    const [x, z] = this.gridToWorld(bi, bj);
    this.flattenDisc(x, z, best, 3.5, 6.5);
    this.summit.set(x, this.getHeight(x, z), z);
  }

  flattenDisc(cx, cz, h, r0, r1) {
    const H = this.heights, n = this.n;
    const i0 = Math.max(0, Math.floor((cx - r1 + this.size / 2) / this.cell)), i1 = Math.min(n - 1, Math.ceil((cx + r1 + this.size / 2) / this.cell));
    const j0 = Math.max(0, Math.floor((cz - r1 + this.size / 2) / this.cell)), j1 = Math.min(n - 1, Math.ceil((cz + r1 + this.size / 2) / this.cell));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const [x, z] = this.gridToWorld(i, j);
      const d = Math.hypot(x - cx, z - cz);
      if (d < r1) H[j * n + i] = lerp(h, H[j * n + i], smoothstep(r0, r1, d));
    }
  }

  slopeDegAt(i, j) {
    const n = this.n, H = this.heights;
    const i0 = Math.max(0, i - 1), i1 = Math.min(n - 1, i + 1);
    const j0 = Math.max(0, j - 1), j1 = Math.min(n - 1, j + 1);
    const dx = (H[j * n + i1] - H[j * n + i0]) / ((i1 - i0) * this.cell);
    const dz = (H[j1 * n + i] - H[j0 * n + i]) / ((j1 - j0) * this.cell);
    return Math.atan(Math.hypot(dx, dz)) * 180 / Math.PI;
  }

  /* 营地：按目标海拔比例寻找平缓地点，沿着从起点到峰顶的路线布置 */
  placeCamps(fractions) {
    const Hmax = this.summit.y, n = this.n;
    let prev = this.start.clone();
    this.camps = [];
    fractions.forEach((fr, k) => {
      const target = Hmax * fr;
      let best = null, bestScore = 1e18;
      for (let tol = 0.03, slopeMax = 16; !best && tol < 0.2; tol += 0.03, slopeMax += 4) {
        for (let j = 4; j < n - 4; j += 2) for (let i = 4; i < n - 4; i += 2) {
          const h = this.heights[j * n + i];
          if (Math.abs(h - target) > Hmax * tol) continue;
          if (this.slopeDegAt(i, j) > slopeMax) continue;
          const [x, z] = this.gridToWorld(i, j);
          const d = Math.hypot(x - prev.x, z - prev.z);
          if (d < 40) continue;
          const score = d + Math.abs(h - target) * 3 + this.rnd() * 5;
          if (score < bestScore) { bestScore = score; best = new THREE.Vector3(x, h, z); }
        }
      }
      if (!best) return;
      this.flattenDisc(best.x, best.z, best.y, 6, 11);
      best.y = this.getHeight(best.x, best.z);
      this.camps.push({ pos: best, index: k + 1, visited: false });
      prev = best;
    });
  }

  placeCrates(count) {
    const Hmax = this.summit.y, n = this.n;
    this.crates = [];
    let tries = 0;
    while (this.crates.length < count && tries++ < 4000) {
      const i = 6 + Math.floor(this.rnd() * (n - 12)), j = 6 + Math.floor(this.rnd() * (n - 12));
      const h = this.heights[j * n + i];
      const fr = h / Hmax;
      if (fr < 0.1 || fr > 0.93) continue;
      if (this.slopeDegAt(i, j) > 30) continue;
      const [x, z] = this.gridToWorld(i, j);
      let ok = Math.hypot(x - this.start.x, z - this.start.z) > 40;
      for (const c of this.camps) if (Math.hypot(x - c.pos.x, z - c.pos.z) < 25) ok = false;
      for (const c of this.crates) if (Math.hypot(x - c.pos.x, z - c.pos.z) < 45) ok = false;
      if (!ok) continue;
      this.crates.push({ pos: new THREE.Vector3(x, h, z), taken: false });
    }
  }

  /* ---------- 采样 ---------- */
  gridToWorld(i, j) { return [-this.size / 2 + i * this.cell, -this.size / 2 + j * this.cell]; }

  getHeight(x, z) {
    const gx = (x + this.size / 2) / this.cell, gz = (z + this.size / 2) / this.cell;
    let i = Math.floor(gx), j = Math.floor(gz);
    i = clamp(i, 0, this.res - 1); j = clamp(j, 0, this.res - 1);
    const fx = clamp(gx - i, 0, 1), fz = clamp(gz - j, 0, 1);
    const n = this.n, H = this.heights;
    const h00 = H[j * n + i], h10 = H[j * n + i + 1], h01 = H[(j + 1) * n + i], h11 = H[(j + 1) * n + i + 1];
    if (fx + fz < 1) return h00 + (h10 - h00) * fx + (h01 - h00) * fz;
    return h11 + (h01 - h11) * (1 - fx) + (h10 - h11) * (1 - fz);
  }

  getNormal(x, z, out) {
    const e = this.cell * 0.6;
    const hL = this.getHeight(x - e, z), hR = this.getHeight(x + e, z);
    const hD = this.getHeight(x, z - e), hU = this.getHeight(x, z + e);
    out.set(hL - hR, 2 * e, hD - hU).normalize();
    return out;
  }

  getSlopeDeg(x, z) {
    const e = this.cell * 0.6;
    const dx = (this.getHeight(x + e, z) - this.getHeight(x - e, z)) / (2 * e);
    const dz = (this.getHeight(x, z + e) - this.getHeight(x, z - e)) / (2 * e);
    return Math.atan(Math.hypot(dx, dz)) * 180 / Math.PI;
  }

  getMaterial(x, z) {
    const i = clamp(Math.round((x + this.size / 2) / this.cell), 0, this.res);
    const j = clamp(Math.round((z + this.size / 2) / this.cell), 0, this.res);
    return this.mats[j * this.n + i];
  }

  /* ---------- 网格与着色 ---------- */
  buildMesh() {
    const n = this.n, res = this.res, N = this.noise, cfg = this.cfg;
    const Hmax = this.summit.y;
    const count = n * n;
    const pos = new Float32Array(count * 3);
    const col = new Float32Array(count * 3);
    const uv = new Float32Array(count * 2);
    const rnd = Noise.mulberry32(99);

    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        const idx = j * n + i;
        const [x, z] = this.gridToWorld(i, j);
        const h = this.heights[idx];
        pos[idx * 3] = x; pos[idx * 3 + 1] = h; pos[idx * 3 + 2] = z;
        uv[idx * 2] = i / res * 220; uv[idx * 2 + 1] = j / res * 220;

        const slope = this.slopeDegAt(i, j);
        const hn = h / Hmax;
        const n1 = N.noise(x * 0.02, z * 0.02), n2 = N.noise(x * 0.09 + 3, z * 0.09), n3 = N.noise(x * 0.35, z * 0.35);
        const rockiness = smoothstep(27, 42, slope + n2 * 6);
        const highAlt = smoothstep(0.22, 0.52, hn + n1 * 0.1);
        const snow = smoothstep(cfg.snowLine - 0.07, cfg.snowLine + 0.03, hn + n1 * 0.08 + n2 * 0.02) * (1 - smoothstep(46, 64, slope + n2 * 5));

        // 基础颜色
        const gv = 0.5 + 0.5 * n2;
        let r = lerp(0.30, 0.40, gv), g = lerp(0.44, 0.52, gv), b = lerp(0.17, 0.21, gv); // 草
        const dr = 0.44 + n3 * 0.04, dg = 0.37 + n3 * 0.03, db = 0.27 + n3 * 0.02; // 碎石/泥土
        r = lerp(r, dr, highAlt); g = lerp(g, dg, highAlt); b = lerp(b, db, highAlt);
        const rv = 0.40 + n3 * 0.07 + n1 * 0.04;
        const rr = rv + 0.03, rg = rv, rb = rv - 0.02 + n2 * 0.03; // 岩石
        r = lerp(r, rr, rockiness); g = lerp(g, rg, rockiness); b = lerp(b, rb, rockiness);
        let mat = snow > 0.5 ? MAT.SNOW : rockiness > 0.55 ? MAT.ROCK : highAlt > 0.5 ? MAT.DIRT : MAT.GRASS;

        // 冰面：高海拔中等坡度的雪被吹成冰
        let ice = 0;
        if (cfg.ice && snow > 0.6 && slope > 22 && slope < 52) {
          ice = smoothstep(0.45, 0.62, N.noise(x * 0.025 + 40, z * 0.025 + 40)) ;
          if (ice > 0.5) mat = MAT.ICE;
        }
        const sr = 0.92 + n3 * 0.02, sg = 0.94 + n3 * 0.02, sb = 0.99;
        r = lerp(r, sr, snow); g = lerp(g, sg, snow); b = lerp(b, sb, snow);
        r = lerp(r, 0.68, ice); g = lerp(g, 0.82, ice); b = lerp(b, 0.96, ice);

        // 细微变化
        const v = 1 + (rnd() - 0.5) * 0.06;
        col[idx * 3] = toLinear(clamp(r * v, 0, 1));
        col[idx * 3 + 1] = toLinear(clamp(g * v, 0, 1));
        col[idx * 3 + 2] = toLinear(clamp(b * v, 0, 1));
        this.mats[idx] = mat;
      }
    }

    const index = new Uint32Array(res * res * 6);
    let k = 0;
    for (let j = 0; j < res; j++) {
      for (let i = 0; i < res; i++) {
        const a = j * n + i, b = a + 1, c = a + n, d = c + 1;
        index[k++] = a; index[k++] = c; index[k++] = b;
        index[k++] = b; index[k++] = c; index[k++] = d;
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geo.setIndex(new THREE.BufferAttribute(index, 1));
    geo.computeVertexNormals();
    geo.computeBoundingSphere();

    const tex = Terrain.makeDetailTexture();
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, map: tex, roughness: 0.96, metalness: 0.0 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.receiveShadow = true;
    mesh.castShadow = true;
    this.mesh = mesh;
    return mesh;
  }

  static makeDetailTexture() {
    if (Terrain._detailTex) return Terrain._detailTex;
    const s = 256;
    const cv = document.createElement('canvas'); cv.width = cv.height = s;
    const ctx = cv.getContext('2d');
    const img = ctx.createImageData(s, s);
    const rnd = Noise.mulberry32(4242);
    const nz = new Noise.Simplex2D(77);
    for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
      const i = (y * s + x) * 4;
      // 平铺无缝：用周期性噪声近似（在边缘混合）
      const u = x / s, w = y / s;
      const a = nz.fbm(u * 8, w * 8, 3), b2 = nz.fbm((u + 1) * 8, w * 8, 3), c = nz.fbm(u * 8, (w + 1) * 8, 3), d = nz.fbm((u + 1) * 8, (w + 1) * 8, 3);
      const nv = lerp(lerp(a, b2, u), lerp(c, d, u), w);
      const v = 205 + nv * 28 + (rnd() - 0.5) * 30;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = clamp(v, 0, 255); img.data[i + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    const tex = new THREE.CanvasTexture(cv);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    if ('colorSpace' in tex) tex.colorSpace = THREE.SRGBColorSpace; else tex.encoding = THREE.sRGBEncoding;
    tex.anisotropy = 4;
    Terrain._detailTex = tex;
    return tex;
  }
}
