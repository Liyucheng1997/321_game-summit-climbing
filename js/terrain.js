/* 程序化山体：高度场、步道(A*)、岩壁/冰裂缝雕刻、营地与收集品布置、着色网格 */
const MAT = { GRASS: 0, DIRT: 1, ROCK: 2, SNOW: 3, ICE: 4 };
const MAT_NAME = ['草地', '土路', '岩石', '雪面', '冰面'];

class Terrain {
  constructor(stage, seed, res) {
    const cfg = this.cfg = stage.terrain;
    this.stage = stage;
    this.seed = seed;
    this.size = 1000;
    this.res = res;
    this.cell = this.size / res;
    this.n = res + 1;
    this.radius = 470;
    this.H = cfg.height;
    this.heights = new Float32Array(this.n * this.n);
    this.mats = new Uint8Array(this.n * this.n);
    this.trailMask = new Float32Array(this.n * this.n);
    this.noise = new Noise.Simplex2D(seed);
    this.rnd = Noise.mulberry32(seed * 7919 + 17);
    this.start = new THREE.Vector3(0, 0, -this.radius * 0.95);
    this.summit = new THREE.Vector3();
    this.camps = []; this.walls = []; this.crevasses = []; this.bridges = [];
    this.stashes = []; this.journals = []; this.viewpoints = []; this.firewood = [];
    this.trail = [];
    this.waterY = -Infinity; this.lake = null;
    this.subPeaks = [];
    for (let k = 0; k < 3; k++) {
      const ang = (k / 3) * Math.PI * 2 + this.rnd() * 1.4 + 0.9;
      const rr = this.radius * (0.42 + this.rnd() * 0.25);
      this.subPeaks.push({ x: Math.cos(ang) * rr, z: Math.sin(ang) * rr, h: this.H * (0.16 + this.rnd() * 0.2), w: 50 + this.rnd() * 50 });
    }
  }

  /* ---------------- 高度场 ---------------- */
  rawHeight(x, z) {
    const N = this.noise, cfg = this.cfg, H = this.H, R = this.radius;
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
    h += N.fbm(x * 0.03 + 2, z * 0.03, 3) * 2.0 + N.fbm(x * 0.12, z * 0.12, 2) * 0.4;
    h += H * 0.07 * Math.exp(-(x * x + z * z) / (2 * 30 * 30));
    const tk = cfg.terrace * (0.45 + 0.55 * Math.min(1, (h / H) * 1.4));
    const t = h / cfg.terraceStep, f = Math.floor(t), fr = t - f;
    const q = fr * fr * fr * (fr * (fr * 6 - 15) + 10);
    return cfg.terraceStep * (f + lerp(fr, q, tk));
  }

  beginGenerate() { this.startH = Math.max(0, this.rawHeight(this.start.x, this.start.z)); this.start.y = this.startH; }

  generateRows(j0, j1) {
    const n = this.n, Hs = this.heights, sx = this.start.x, sz = this.start.z, flat = 45, sh = this.startH;
    for (let j = j0; j < j1; j++) {
      const z = -this.size / 2 + j * this.cell;
      for (let i = 0; i < n; i++) {
        const x = -this.size / 2 + i * this.cell;
        let h = this.rawHeight(x, z);
        const ds = Math.hypot(x - sx, z - sz);
        if (ds < flat) h = lerp(sh, h, smoothstep(flat * 0.3, flat, ds));
        Hs[j * n + i] = Math.max(0, h);
      }
    }
  }

  limitSlopes(maxDeg) {
    const maxD = this.cell * Math.tan(maxDeg * DEG), H = this.heights, n = this.n;
    for (let it = 0; it < 5; it++) {
      for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
        const idx = j * n + i;
        if (i + 1 < n) { const d = H[idx] - H[idx + 1]; if (Math.abs(d) > maxD) { const ex = (Math.abs(d) - maxD) * 0.5 * Math.sign(d); H[idx] -= ex; H[idx + 1] += ex; } }
        if (j + 1 < n) { const d = H[idx] - H[idx + n]; if (Math.abs(d) > maxD) { const ex = (Math.abs(d) - maxD) * 0.5 * Math.sign(d); H[idx] -= ex; H[idx + n] += ex; } }
      }
    }
  }

  carveLake() {
    const L = this.cfg.lake; if (!L) return;
    const cx = this.start.x + Math.cos(L.angle) * 150, cz = this.start.z + 40 + Math.sin(L.angle) * 40;
    const R = L.radius;
    let rim = Infinity;
    for (let k = 0; k < 48; k++) { const a = k / 48 * Math.PI * 2; rim = Math.min(rim, this.getHeight(cx + Math.cos(a) * R * 1.15, cz + Math.sin(a) * R * 1.15)); }
    const wy = rim - 0.35;
    this.waterY = wy;
    this.lake = { x: cx, z: cz, r: R };
    const N = this.noise;
    this.forVerts(cx - R * 1.3, cz - R * 1.3, cx + R * 1.3, cz + R * 1.3, (idx, x, z) => {
      const a = Math.atan2(z - cz, x - cx);
      const rr = R * (1 + 0.18 * N.noise(Math.cos(a) * 1.6 + 7, Math.sin(a) * 1.6 + 7));
      const d = Math.hypot(x - cx, z - cz) / rr;
      if (d > 1.25) return;
      const H = this.heights;
      if (d < 1) H[idx] = Math.min(H[idx], wy - 0.6 - L.depth * (1 - d * d));
      else H[idx] = Math.min(H[idx], lerp(wy - 0.6, H[idx], smoothstep(1, 1.25, d)));
    });
  }

  findSummit() {
    const H = this.heights, n = this.n;
    let best = -1e9, bi = 0, bj = 0;
    for (let j = 4; j < n - 4; j++) for (let i = 4; i < n - 4; i++) { const h = H[j * n + i]; if (h > best) { best = h; bi = i; bj = j; } }
    const [x, z] = this.gridToWorld(bi, bj);
    this.flattenDisc(x, z, best, 4, 9);
    this.summit.set(x, this.getHeight(x, z), z);
  }

  forVerts(x0, z0, x1, z1, fn) {
    const n = this.n, h = this.size / 2, c = this.cell;
    const i0 = Math.max(0, Math.floor((x0 + h) / c)), i1 = Math.min(n - 1, Math.ceil((x1 + h) / c));
    const j0 = Math.max(0, Math.floor((z0 + h) / c)), j1 = Math.min(n - 1, Math.ceil((z1 + h) / c));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) fn(j * n + i, -h + i * c, -h + j * c, i, j);
  }

  flattenDisc(cx, cz, h, r0, r1) {
    const H = this.heights;
    this.forVerts(cx - r1, cz - r1, cx + r1, cz + r1, (idx, x, z) => {
      const d = Math.hypot(x - cx, z - cz);
      if (d < r1) H[idx] = lerp(h, H[idx], smoothstep(r0, r1, d));
    });
  }

  /* 运行时平整一块地面（搭帐篷），并同步更新网格 */
  levelArea(cx, cz, r0, r1) {
    const h = this.getHeight(cx, cz);
    this.flattenDisc(cx, cz, h, r0, r1);
    if (!this.mesh) return;
    const pos = this.mesh.geometry.attributes.position, nor = this.mesh.geometry.attributes.normal, n = this.n, H = this.heights, c = this.cell;
    this.forVerts(cx - r1 - c * 2, cz - r1 - c * 2, cx + r1 + c * 2, cz + r1 + c * 2, (idx, x, z, i, j) => {
      pos.setY(idx, H[idx]);
      const hl = H[j * n + Math.max(0, i - 1)], hr = H[j * n + Math.min(n - 1, i + 1)], hd = H[Math.max(0, j - 1) * n + i], hu = H[Math.min(n - 1, j + 1) * n + i];
      const nx = hl - hr, ny = 2 * c, nz = hd - hu, l = Math.hypot(nx, ny, nz);
      nor.setXYZ(idx, nx / l, ny / l, nz / l);
    });
    pos.needsUpdate = true; nor.needsUpdate = true;
  }

  /* ---------------- 步道：A* 寻路 + 平滑 + 雕刻 ---------------- */
  computeTrail() {
    const Gc = 125, cs = this.size / Gc, nC = Gc + 1, half = this.size / 2;
    const hC = new Float32Array(nC * nC);
    for (let j = 0; j < nC; j++) for (let i = 0; i < nC; i++) hC[j * nC + i] = this.getHeight(-half + i * cs, -half + j * cs);
    const toCell = (x, z) => [clamp(Math.round((x + half) / cs), 1, nC - 2), clamp(Math.round((z + half) / cs), 1, nC - 2)];
    const [si, sj] = toCell(this.start.x, this.start.z), [gi, gj] = toCell(this.summit.x, this.summit.z);
    const S = sj * nC + si, Gl = gj * nC + gi;
    const dirs = [[1, 0], [0, 1], [-1, 0], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1], [2, 1], [1, 2], [-1, 2], [-2, 1], [-2, -1], [-1, -2], [1, -2], [2, -1]];
    const lake = this.lake, wy = this.waterY;
    const ND = dirs.length, NS = ND + 1; // 状态 = 格子 × 来向（含“无方向”）
    const dang = dirs.map(([a, b]) => Math.atan2(b, a));
    const turnOK = [], turnCost = [];
    for (let a = 0; a < NS; a++) for (let b = 0; b < ND; b++) {
      const t = a === ND ? 0 : Math.abs(wrapAngle(dang[b] - dang[a]));
      turnOK[a * ND + b] = t <= 75 * DEG; turnCost[a * ND + b] = 0.35 * (t / (Math.PI / 4)) ** 2;
    }
    const run = (maxGrade) => {
      const NN = nC * nC * NS;
      const g = new Float64Array(NN).fill(Infinity), came = new Int32Array(NN).fill(-1), closed = new Uint8Array(NN);
      const heap = new MinHeap();
      const s0 = S * NS + ND;
      g[s0] = 0; heap.push(0, s0);
      let goalState = -1;
      while (heap.size) {
        const st = heap.pop();
        if (closed[st]) continue;
        closed[st] = 1;
        const cur = (st / NS) | 0, cd = st % NS;
        if (cur === Gl) { goalState = st; break; }
        const ci = cur % nC, cj = (cur / nC) | 0;
        for (let d = 0; d < ND; d++) {
          if (!turnOK[cd * ND + d]) continue;
          const di = dirs[d][0], dj = dirs[d][1];
          const ni = ci + di, nj = cj + dj;
          if (ni < 1 || nj < 1 || ni > nC - 2 || nj > nC - 2) continue;
          const nb = nj * nC + ni, ns = nb * NS + d;
          if (closed[ns]) continue;
          const L = Math.hypot(di, dj) * cs, dh = hC[nb] - hC[cur], grade = Math.abs(dh) / L;
          if (grade > maxGrade) continue;
          // 中点坡度（避免跨过陡坎）
          const mi = (ci + ni) >> 1, mj = (cj + nj) >> 1, hm = hC[mj * nC + mi];
          if (Math.abs(hm - hC[cur]) / (L / 2) > maxGrade * 1.4) continue;
          let c = L * (1 + 8 * grade * grade + (grade > 0.28 ? 160 * (grade - 0.28) * (grade - 0.28) : 0) + turnCost[cd * ND + d]);
          if (lake && hC[nb] < wy + 1 && Math.hypot(-half + ni * cs - lake.x, -half + nj * cs - lake.z) < lake.r * 1.4) c += 2000;
          const ng = g[st] + c;
          if (ng < g[ns]) {
            g[ns] = ng; came[ns] = st;
            heap.push(ng + Math.hypot((gi - ni) * cs, (gj - nj) * cs), ns);
          }
        }
      }
      if (goalState < 0) return null;
      const path = [];
      for (let s = goalState; s !== -1; s = came[s]) path.push((s / NS) | 0);
      return path.reverse();
    };
    let path = null;
    for (const mg of [0.55, 0.7, 0.9, 1.3, 99]) { path = run(mg); if (path) break; }
    let pts = path.map(c => ({ x: -half + (c % nC) * cs, z: -half + ((c / nC) | 0) * cs }));
    pts[0] = { x: this.start.x, z: this.start.z };
    pts[pts.length - 1] = { x: this.summit.x, z: this.summit.z };
    // Chaikin 平滑
    for (let it = 0; it < 3; it++) {
      const o = [pts[0]];
      for (let k = 0; k < pts.length - 1; k++) {
        const a = pts[k], b = pts[k + 1];
        o.push({ x: a.x * 0.75 + b.x * 0.25, z: a.z * 0.75 + b.z * 0.25 }, { x: a.x * 0.25 + b.x * 0.75, z: a.z * 0.25 + b.z * 0.75 });
      }
      o.push(pts[pts.length - 1]);
      pts = o;
    }
    // 等距重采样（2 m）
    const out = [pts[0]];
    let carry = 0;
    for (let k = 1; k < pts.length; k++) {
      const a = pts[k - 1], b = pts[k];
      const seg = Math.hypot(b.x - a.x, b.z - a.z);
      if (seg < 1e-6) continue;
      let pos = 2 - carry;
      while (pos <= seg) { const t = pos / seg; out.push({ x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t }); pos += 2; }
      carry = seg - (pos - 2);
    }
    const last = out[out.length - 1];
    if (Math.hypot(last.x - this.summit.x, last.z - this.summit.z) > 0.5) out.push({ x: this.summit.x, z: this.summit.z });
    let hs = out.map(p => this.getHeight(p.x, p.z));
    for (let pass = 0; pass < 2; pass++) {
      const nh = hs.slice();
      for (let k = 1; k < hs.length - 1; k++) {
        let s = 0, c = 0;
        for (let m = -4; m <= 4; m++) { const q = k + m; if (q >= 0 && q < hs.length) { s += hs[q]; c++; } }
        nh[k] = s / c;
      }
      hs = nh;
    }
    hs[0] = this.startH; hs[hs.length - 1] = this.summit.y;
    let dist = 0;
    this.trail = out.map((p, k) => {
      if (k > 0) dist += Math.hypot(p.x - out[k - 1].x, p.z - out[k - 1].z);
      return { x: p.x, z: p.z, y: hs[k], s: dist };
    });
    this.trailLength = dist;
  }

  carveTrail(final) {
    const tr = this.trail, H = this.heights, n = this.n;
    if (final && this.trailH) tr.forEach((p, k) => { p.y = this.trailH[k]; });
    this.trailH = tr.map(p => p.y);
    const best = new Float32Array(n * n).fill(1e9), th = new Float32Array(n * n);
    const touched = [];
    for (let k = 0; k < tr.length - 1; k++) {
      const a = tr[k], b = tr[k + 1];
      const x0 = Math.min(a.x, b.x) - 7, x1 = Math.max(a.x, b.x) + 7, z0 = Math.min(a.z, b.z) - 7, z1 = Math.max(a.z, b.z) + 7;
      const dx = b.x - a.x, dz = b.z - a.z, L2 = dx * dx + dz * dz || 1;
      this.forVerts(x0, z0, x1, z1, (idx, x, z) => {
        const t = clamp(((x - a.x) * dx + (z - a.z) * dz) / L2, 0, 1);
        const d = Math.hypot(x - (a.x + dx * t), z - (a.z + dz * t));
        if (d < best[idx]) { if (best[idx] > 1e8) touched.push(idx); best[idx] = d; th[idx] = lerp(a.y, b.y, t); }
      });
    }
    this.trailDist = new Float32Array(n * n).fill(99);
    const half = this.size / 2, c = this.cell;
    for (const idx of touched) {
      const d = best[idx];
      this.trailDist[idx] = d;
      if (d > 8) continue;
      const cd = final && this.crevasses.length ? this.crevDepthAt(-half + (idx % n) * c, -half + Math.floor(idx / n) * c) : 0;
      H[idx] = lerp(H[idx], th[idx] - cd, 1 - smoothstep(3.0, 7.5, d));
      this.trailMask[idx] = Math.max(this.trailMask[idx], 1 - smoothstep(0.9, 2.0, d));
    }
    for (const p of this.trail) p.y = this.getHeight(p.x, p.z);
    if (final) this.finalizeBridges();
    // 空间索引
    this.trailGrid = new Map();
    this.trail.forEach((p, k) => {
      const key = Math.floor(p.x / 20) + ',' + Math.floor(p.z / 20);
      if (!this.trailGrid.has(key)) this.trailGrid.set(key, []);
      this.trailGrid.get(key).push(k);
    });
  }

  nearestTrail(x, z, maxR = 40) {
    let best = -1, bd = maxR;
    const cx = Math.floor(x / 20), cz = Math.floor(z / 20), rr = Math.ceil(maxR / 20);
    for (let j = -rr; j <= rr; j++) for (let i = -rr; i <= rr; i++) {
      const list = this.trailGrid.get((cx + i) + ',' + (cz + j));
      if (!list) continue;
      for (const k of list) { const p = this.trail[k]; const d = Math.hypot(p.x - x, p.z - z); if (d < bd) { bd = d; best = k; } }
    }
    return best < 0 ? null : { index: best, dist: bd, p: this.trail[best] };
  }

  trailAtHeight(y) {
    for (let k = 0; k < this.trail.length; k++) if (this.trail[k].y >= y) return k;
    return this.trail.length - 1;
  }

  /* ---------------- 营地 ---------------- */
  placeCamps(fracs) {
    let lastS = -1e9;
    fracs.forEach((fr, k) => {
      let i = this.trailAtHeight(this.summit.y * fr);
      while (i < this.trail.length - 30 && this.trail[i].s - lastS < 80) i++;
      i = Math.min(i, this.trail.length - 25);
      const p = this.trail[i];
      lastS = p.s;
      const a = this.trail[Math.max(0, i - 3)], b = this.trail[Math.min(this.trail.length - 1, i + 3)];
      const dir = Math.atan2(b.x - a.x, b.z - a.z);
      this.flattenDisc(p.x, p.z, p.y, 6, 14);
      this.camps.push({ pos: new THREE.Vector3(p.x, p.y, p.z), dir, index: k + 1, trailIdx: i, visited: false, fixed: true, fire: 0, name: `${k + 1} 号营地` });
    });
  }

  /* ---------------- 岩壁选址与雕刻 ---------------- */
  gradientAt(x, z, e = 4) {
    const dx = (this.getHeight(x + e, z) - this.getHeight(x - e, z)) / (2 * e);
    const dz = (this.getHeight(x, z + e) - this.getHeight(x, z - e)) / (2 * e);
    return { dx, dz, len: Math.hypot(dx, dz) };
  }

  placeWalls(spec) {
    const tr = this.trail, rnd = this.rnd;
    const cands = [];
    for (let i = Math.floor(tr.length * 0.08); i < tr.length * 0.86; i += 4) for (const side of [-1, 1]) for (const off of [0, 14, 24, 36]) cands.push([i, side, off]);
    for (let k = cands.length - 1; k > 0; k--) { const j = Math.floor(rnd() * (k + 1)); [cands[k], cands[j]] = [cands[j], cands[k]]; }
    for (const [i, side, off] of cands) {
      if (this.walls.length >= spec.count) break;
      const P = tr[i], ta = tr[Math.max(0, i - 3)], tb = tr[Math.min(tr.length - 1, i + 3)];
      const tl = Math.hypot(tb.x - ta.x, tb.z - ta.z) || 1;
      const px = -(tb.z - ta.z) / tl * side, pz = (tb.x - ta.x) / tl * side;
      const cx = P.x + px * off, cz = P.z + pz * off;
      const gr = this.gradientAt(cx, cz, 5);
      if (gr.len < 0.22) continue;
      const bx = gr.dx / gr.len, bz = gr.dz / gr.len; // 上坡方向 = 岩壁“里面”
      const B = new THREE.Vector3(cx + bx * 6, 0, cz + bz * 6);
      B.y = this.getHeight(B.x, B.z);
      const W = rrange(rnd, spec.w[0], spec.w[1]);
      const Ht = rrange(rnd, spec.h[0], spec.h[1]);
      let D = -1, Hw = 0;
      for (let d = 6; d <= 46; d += 2) {
        const hh = this.getHeight(B.x + bx * d, B.z + bz * d) - B.y;
        if (hh >= Ht) { D = d; Hw = Math.min(hh, spec.h[1] + 4); break; }
      }
      if (D < 0) continue;
      const site = { B, back: new THREE.Vector3(bx, 0, bz), n: new THREE.Vector3(-bx, 0, -bz), right: new THREE.Vector3(-bz, 0, bx), W, H: Hw, D, baseY: B.y, topY: B.y + Hw, trailIdx: i, style: spec.style, difficulty: spec.difficulty };
      // right = up × n
      site.right.set(site.n.z, 0, -site.n.x);
      if (!this.wallSiteOK(site, i)) continue;
      this.carveWall(site);
      this.walls.push(site);
    }
  }

  wallLocal(site, x, z) {
    const dx = x - site.B.x, dz = z - site.B.z;
    return { a: dx * site.right.x + dz * site.right.z, b: dx * site.back.x + dz * site.back.z };
  }

  wallSiteOK(site, ti) {
    const B = site.B;
    if (Math.hypot(B.x - this.start.x, B.z - this.start.z) < 70) return false;
    if (Math.hypot(B.x - this.summit.x, B.z - this.summit.z) < site.D + 40) return false;
    if (this.lake && Math.hypot(B.x - this.lake.x, B.z - this.lake.z) < this.lake.r * 1.6) return false;
    if (Math.abs(B.x) > 430 || Math.abs(B.z) > 430) return false;
    for (const c of this.camps) {
      const l = this.wallLocal(site, c.pos.x, c.pos.z);
      if (Math.abs(l.a) < site.W / 2 + 30 && l.b > -24 && l.b < site.D + 26) return false;
    }
    for (const w of this.walls) if (Math.hypot(w.B.x - B.x, w.B.z - B.z) < (w.W + site.W) / 2 + w.D + 30) return false;
    for (let j = 0; j < this.trail.length; j++) {
      const p = this.trail[j];
      const l = this.wallLocal(site, p.x, p.z);
      if (Math.abs(l.a) < site.W / 2 + 12 && l.b > -6 && l.b < site.D + 12) return false;
    }
    return true;
  }

  carveWall(s) {
    const H = this.heights, halfW = s.W / 2, ext = halfW + 14;
    const R = Math.max(ext, s.D + 16) + 12;
    this.forVerts(s.B.x - R, s.B.z - R, s.B.x + R, s.B.z + R, (idx, x, z) => {
      const { a, b } = this.wallLocal(s, x, z);
      if (Math.abs(a) > ext || b < -10 || b > s.D + 15) return;
      const wa = 1 - smoothstep(halfW, ext, Math.abs(a));
      const wb = smoothstep(-10, -5, b) * (1 - smoothstep(s.D + 6, s.D + 15, b));
      const w = wa * wb;
      if (w <= 0) return;
      const o = H[idx];
      let t;
      if (b < 2) t = s.baseY;
      else if (b < 3.6) t = lerp(s.baseY, Math.max(o, s.topY), smoothstep(2, 3.6, b));
      else t = Math.max(o, s.topY);
      H[idx] = lerp(o, t, w);
    });
  }

  /* ---------------- 冰裂缝 ---------------- */
  placeCrevasses(count) {
    if (!count) return;
    const tr = this.trail, rnd = this.rnd;
    const snowY = this.summit.y * this.cfg.snowLine;
    let lastS = -1e9;
    for (let i = 10; i < tr.length - 10 && this.crevasses.length < count; i += 3) {
      const p = tr[i];
      if (p.y < snowY + 8 || p.y > this.summit.y * 0.8) continue;
      if (p.s - lastS < 70 + rnd() * 40) continue;
      // 只在平直、平缓的路段上设置裂缝与梯子桥
      if (i < 8 || i > tr.length - 9) continue;
      const pa = tr[i - 7], pb = tr[i + 7];
      if (Math.abs(pb.y - pa.y) / 28 > 0.22) continue;
      const d1 = Math.atan2(p.x - pa.x, p.z - pa.z), d2 = Math.atan2(pb.x - p.x, pb.z - p.z);
      if (Math.abs(wrapAngle(d2 - d1)) > 0.3) continue;
      let ok = true;
      for (const c of this.camps) if (Math.hypot(c.pos.x - p.x, c.pos.z - p.z) < 35) ok = false;
      for (const w of this.walls) { const l = this.wallLocal(w, p.x, p.z); if (Math.abs(l.a) < w.W / 2 + 25 && l.b > -20 && l.b < w.D + 20) ok = false; }
      if (!ok) continue;
      const a = tr[i - 2], b = tr[i + 2];
      const tl = Math.hypot(b.x - a.x, b.z - a.z) || 1;
      const tx = (b.x - a.x) / tl, tz = (b.z - a.z) / tl;
      const L = rrange(rnd, 30, 46), w = rrange(rnd, 3.0, 3.8), depth = rrange(rnd, 9, 13);
      const cv = { x: p.x, z: p.z, ux: -tz, uz: tx, vx: tx, vz: tz, L, w, depth, trailIdx: i, lipY: p.y };
      // 桥（沿步道方向）
      const bl = w + 3.2;
      const y0 = this.getHeight(p.x - tx * bl / 2, p.z - tz * bl / 2), y1 = this.getHeight(p.x + tx * bl / 2, p.z + tz * bl / 2);
      this.carveCrevasse(cv);
      this.crevasses.push(cv);
      this.bridges.push({ x: p.x, z: p.z, tx, tz, len: bl, y0: y0 + 0.08, y1: y1 + 0.08, halfW: 1.05 });
      lastS = p.s;
    }
  }

  crevLocal(cv, x, z) {
    const dx = x - cv.x, dz = z - cv.z;
    return { u: dx * cv.ux + dz * cv.uz, v: dx * cv.vx + dz * cv.vz };
  }

  crevWidthAt(cv, u) { const t = 2 * u / cv.L; return t * t >= 1 ? 0 : cv.w * Math.sqrt(1 - t * t); }

  crevDepthOne(cv, x, z) {
    const { u, v } = this.crevLocal(cv, x, z);
    const wd = this.crevWidthAt(cv, u);
    if (wd <= 0) return 0;
    const t = Math.abs(v) / (wd / 2 + 0.6);
    return t >= 1 ? 0 : cv.depth * (1 - t * t) * Math.min(1, wd / 1.2);
  }
  crevDepthAt(x, z) { let d = 0; for (const cv of this.crevasses) d = Math.max(d, this.crevDepthOne(cv, x, z)); return d; }

  carveCrevasse(cv) {
    const H = this.heights, R = cv.L / 2 + 4;
    this.forVerts(cv.x - R, cv.z - R, cv.x + R, cv.z + R, (idx, x, z) => { H[idx] -= this.crevDepthOne(cv, x, z); });
  }

  /* 最终雕刻步道之后，按实际地形重新确定桥面与裂缝边缘高度 */
  finalizeBridges() {
    this.crevasses.forEach((cv, k) => {
      const b = this.bridges[k];
      const endH = (sgn) => {
        for (let o = b.len / 2; o < b.len / 2 + 4; o += 0.5) {
          const x = b.x + b.tx * o * sgn, z = b.z + b.tz * o * sgn;
          if (this.crevDepthAt(x, z) < 0.05) return this.getHeight(x, z);
        }
        return this.getHeight(b.x + b.tx * b.len / 2 * sgn, b.z + b.tz * b.len / 2 * sgn);
      };
      b.y0 = endH(-1) + 0.08; b.y1 = endH(1) + 0.08;
      cv.lipY = (b.y0 + b.y1) / 2;
      const p = this.trail[cv.trailIdx]; if (p) p.y = cv.lipY;
    });
  }

  /* ---------------- 收集品与补给 ---------------- */
  findSpot(cx, cz, rMin, rMax, maxSlope, tries = 60) {
    for (let k = 0; k < tries; k++) {
      const a = this.rnd() * Math.PI * 2, r = rrange(this.rnd, rMin, rMax);
      const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
      if (Math.abs(x) > 480 || Math.abs(z) > 480) continue;
      if (this.getSlopeDeg(x, z) > maxSlope) continue;
      if (this.getHeight(x, z) < this.waterY + 0.6) continue;
      if (this.inCrevasse(x, z, 3)) continue;
      if (this.nearWallFace(x, z)) continue;
      return new THREE.Vector3(x, this.getHeight(x, z), z);
    }
    return null;
  }

  nearWallFace(x, z) {
    for (const w of this.walls) { const l = this.wallLocal(w, x, z); if (Math.abs(l.a) < w.W / 2 + 14 && l.b > -3 && l.b < 5) return true; }
    return false;
  }

  inCrevasse(x, z, margin = 0) {
    for (const cv of this.crevasses) {
      const { u, v } = this.crevLocal(cv, x, z);
      const wd = this.crevWidthAt(cv, u);
      if (wd > 0 && Math.abs(v) < wd / 2 + margin) return cv;
    }
    return null;
  }

  placeFeatures(stage) {
    const tr = this.trail, rnd = this.rnd, T = this;
    const at = (f) => tr[clamp(Math.floor(tr.length * f), 0, tr.length - 1)];
    // 补给包
    for (let k = 0; k < stage.stashes; k++) {
      const p = at(0.08 + 0.84 * (k + rnd() * 0.6) / stage.stashes);
      const s = this.findSpot(p.x, p.z, 6, 18, 28);
      if (s) this.stashes.push({ pos: s, taken: false, id: 's' + k });
    }
    // 岩壁顶部额外奖励
    this.walls.forEach((w, k) => {
      const x = w.B.x + w.back.x * Math.min(w.D - 3, 9), z = w.B.z + w.back.z * Math.min(w.D - 3, 9);
      this.stashes.push({ pos: new THREE.Vector3(x, this.getHeight(x, z), z), taken: false, id: 'w' + k, bonus: true });
    });
    // 日志
    const ids = stage.journals;
    const spots = [];
    const trailhead = at(0.02);
    spots.push(this.findSpot(trailhead.x, trailhead.z, 4, 8, 25) || new THREE.Vector3(trailhead.x + 3, trailhead.y, trailhead.z));
    if (this.walls.length) {
      const w = this.walls[0];
      const x = w.B.x + w.back.x * 6 + w.right.x * 3, z = w.B.z + w.back.z * 6 + w.right.z * 3;
      spots.push(new THREE.Vector3(x, this.getHeight(x, z), z));
    } else { const p = at(0.3); spots.push(this.findSpot(p.x, p.z, 8, 16, 30)); }
    const c1 = this.camps[0] || { pos: at(0.45) };
    spots.push(this.findSpot(c1.pos.x, c1.pos.z, 3.5, 5.5, 20) || c1.pos.clone());
    const p4 = at(0.78);
    spots.push(this.findSpot(p4.x, p4.z, 10, 22, 32) || new THREE.Vector3(p4.x, p4.y, p4.z));
    spots.push(new THREE.Vector3(this.summit.x + 1.6, this.summit.y, this.summit.z - 1.2));
    spots.forEach((s, k) => { if (s && ids[k] !== undefined) { s.y = this.getHeight(s.x, s.z); this.journals.push({ pos: s, id: ids[k], taken: false }); } });
    // 观景点：挑选外侧落差大的步道点
    for (let k = 0; k < stage.viewpoints; k++) {
      let best = null, bestScore = -1;
      const f0 = 0.22 + k * 0.26;
      for (let f = f0; f < f0 + 0.2; f += 0.01) {
        const p = at(f);
        const gr = this.gradientAt(p.x, p.z, 6);
        if (gr.len < 0.05) continue;
        const ox = -gr.dx / gr.len, oz = -gr.dz / gr.len;
        const drop = p.y - this.getHeight(p.x + ox * 60, p.z + oz * 60);
        if (drop > bestScore) { bestScore = drop; best = { p, ox, oz }; }
      }
      if (!best) continue;
      const s = this.findSpot(best.p.x + best.ox * 5, best.p.z + best.oz * 5, 0, 3, 24) || new THREE.Vector3(best.p.x, best.p.y, best.p.z);
      this.viewpoints.push({ pos: s, dir: Math.atan2(best.ox, best.oz), done: false, id: 'v' + k });
    }
    // 柴火（树线以下）
    const treeY = this.summit.y * this.cfg.treeLine;
    for (let k = 0, tries = 0; k < stage.firewood && tries < 300; tries++) {
      const p = at(0.04 + rnd() * 0.9);
      if (p.y > treeY + 10) continue;
      const s = this.findSpot(p.x, p.z, 5, 16, 26);
      if (!s) continue;
      if (this.firewood.some(f => f.pos.distanceTo(s) < 40)) continue;
      this.firewood.push({ pos: s, taken: false, id: 'f' + k }); k++;
    }
  }

  /* ---------------- 采样 ---------------- */
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

  /* 考虑桥面的地面高度 */
  groundHeight(x, z, y) {
    let h = this.getHeight(x, z);
    for (const b of this.bridges) {
      const dx = x - b.x, dz = z - b.z;
      const s = dx * b.tx + dz * b.tz, q = -dx * b.tz + dz * b.tx;
      if (Math.abs(s) <= b.len / 2 && Math.abs(q) <= b.halfW) {
        const by = lerp(b.y0, b.y1, s / b.len + 0.5);
        if (y === undefined || y > by - 0.9) h = Math.max(h, by);
      }
    }
    return h;
  }

  getNormal(x, z, out) {
    const e = this.cell * 0.6;
    out.set(this.getHeight(x - e, z) - this.getHeight(x + e, z), 2 * e, this.getHeight(x, z - e) - this.getHeight(x, z + e)).normalize();
    return out;
  }

  getSlopeDeg(x, z) {
    const e = this.cell * 0.6;
    const dx = (this.getHeight(x + e, z) - this.getHeight(x - e, z)) / (2 * e);
    const dz = (this.getHeight(x, z + e) - this.getHeight(x, z - e)) / (2 * e);
    return Math.atan(Math.hypot(dx, dz)) / DEG;
  }

  slopeDegAt(i, j) {
    const n = this.n, H = this.heights;
    const i0 = Math.max(0, i - 1), i1 = Math.min(n - 1, i + 1), j0 = Math.max(0, j - 1), j1 = Math.min(n - 1, j + 1);
    const dx = (H[j * n + i1] - H[j * n + i0]) / ((i1 - i0) * this.cell);
    const dz = (H[j1 * n + i] - H[j0 * n + i]) / ((j1 - j0) * this.cell);
    return Math.atan(Math.hypot(dx, dz)) / DEG;
  }

  getMaterial(x, z) {
    const i = clamp(Math.round((x + this.size / 2) / this.cell), 0, this.res);
    const j = clamp(Math.round((z + this.size / 2) / this.cell), 0, this.res);
    return this.mats[j * this.n + i];
  }

  trailMaskAt(x, z) {
    const i = clamp(Math.round((x + this.size / 2) / this.cell), 0, this.res);
    const j = clamp(Math.round((z + this.size / 2) / this.cell), 0, this.res);
    return this.trailMask[j * this.n + i];
  }

  trailDistAt(x, z) {
    if (!this.trailDist) return 99;
    const i = clamp(Math.round((x + this.size / 2) / this.cell), 0, this.res);
    const j = clamp(Math.round((z + this.size / 2) / this.cell), 0, this.res);
    return this.trailDist[j * this.n + i];
  }

  /* 植被/草地用：该点是否是草地 */
  grassiness(x, z) {
    const i = clamp(Math.round((x + this.size / 2) / this.cell), 0, this.res);
    const j = clamp(Math.round((z + this.size / 2) / this.cell), 0, this.res);
    return this.splatArr ? this.splatArr[(j * this.n + i) * 4] : 0;
  }

  /* ---------------- 着色与网格 ---------------- */
  buildMesh(texSet) {
    const n = this.n, res = this.res, N = this.noise, cfg = this.cfg, H = this.heights;
    const Hmax = this.summit.y;
    const count = n * n;
    const pos = new Float32Array(count * 3), col = new Float32Array(count * 3), splat = new Float32Array(count * 4), ice = new Float32Array(count);
    const pal = cfg.palette;
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        const idx = j * n + i;
        const [x, z] = this.gridToWorld(i, j);
        const h = H[idx];
        pos[idx * 3] = x; pos[idx * 3 + 1] = h; pos[idx * 3 + 2] = z;
        const slope = this.slopeDegAt(i, j), hn = h / Hmax;
        const n1 = N.noise(x * 0.02, z * 0.02), n2 = N.noise(x * 0.09 + 3, z * 0.09), n3 = N.noise(x * 0.004 + 9, z * 0.004);
        const rs = cfg.palette === 'summer' ? 36 : 32;
        let rock = smoothstep(rs, rs + 14, slope + n2 * 7);
        const high = smoothstep(cfg.rockLine - 0.08, cfg.rockLine + 0.08, hn + n1 * 0.08);
        let snow = smoothstep(cfg.snowLine - 0.06, cfg.snowLine + 0.04, hn + n1 * 0.07 + n2 * 0.02) * (1 - smoothstep(44, 62, slope + n2 * 5));
        let dirt = Math.max(this.trailMask[idx] * (1 - snow * 0.7), high * (1 - rock) * 0.8 * smoothstep(-0.25, 0.35, n1 + n2 * 0.3));
        if (this.waterY > -1e8) { const shore = 1 - smoothstep(this.waterY + 0.2, this.waterY + 1.6, h); dirt = Math.max(dirt, shore); }
        let grass = Math.max(0, 1 - rock - dirt - snow);
        // 冰：高处中等坡度的雪被吹成冰
        let ic = 0;
        if (cfg.ice && snow > 0.5 && slope > 20 && slope < 50) ic = smoothstep(0.45, 0.62, N.noise(x * 0.025 + 40, z * 0.025 + 40)) * (1 - this.trailMask[idx]);
        // 冰裂缝内壁
        const cv = this.crevasses.length ? this.inCrevasse(x, z, 0.8) : null;
        if (cv) { ic = Math.max(ic, 0.85); }
        // 岩壁附近：纯岩石
        for (const w of this.walls) { const l = this.wallLocal(w, x, z); if (Math.abs(l.a) < w.W / 2 + 6 && l.b > 1.5 && l.b < 4) { rock = 1; } }
        const sum = grass + rock + dirt + snow || 1;
        splat[idx * 4] = grass / sum; splat[idx * 4 + 1] = rock / sum; splat[idx * 4 + 2] = snow / sum; splat[idx * 4 + 3] = dirt / sum;
        ice[idx] = ic;
        // 色调：季节 + 海拔 + 大尺度变化
        let r = 1, g = 1, b = 1;
        const gw = grass / sum;
        if (pal === 'autumn') { const t = smoothstep(-0.3, 0.4, n3 + n1 * 0.3); r = lerp(1.05, 1.45, t); g = lerp(1.0, 0.95, t); b = lerp(0.9, 0.55, t); }
        else if (pal === 'alpine') { r = 1.05; g = 0.95; b = 0.82; }
        else { const t = smoothstep(-0.2, 0.5, n3); r = lerp(0.92, 1.1, t); g = lerp(1.02, 1.0, t); b = lerp(0.95, 0.8, t); }
        const alp = smoothstep(0.3, 0.6, hn);
        r = lerp(1, lerp(r, r * 1.1, alp), gw); g = lerp(1, lerp(g, g * 0.95, alp), gw); b = lerp(1, lerp(b, b * 0.85, alp), gw);
        // 凹处遮蔽
        const ao = this.aoAt(i, j);
        const v = 1 + n2 * 0.05;
        col[idx * 3] = r * ao * v; col[idx * 3 + 1] = g * ao * v; col[idx * 3 + 2] = b * ao * v;
        this.mats[idx] = ic > 0.5 ? MAT.ICE : snow / sum > 0.45 ? MAT.SNOW : rock / sum > 0.5 ? MAT.ROCK : dirt / sum > 0.45 ? MAT.DIRT : MAT.GRASS;
      }
    }
    this.splatArr = splat;
    const index = new Uint32Array(res * res * 6);
    let k = 0;
    for (let j = 0; j < res; j++) for (let i = 0; i < res; i++) {
      const a = j * n + i, b = a + 1, c = a + n, d = c + 1;
      index[k++] = a; index[k++] = c; index[k++] = b; index[k++] = b; index[k++] = c; index[k++] = d;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.setAttribute('splat', new THREE.BufferAttribute(splat, 4));
    geo.setAttribute('ice', new THREE.BufferAttribute(ice, 1));
    geo.setIndex(new THREE.BufferAttribute(index, 1));
    geo.computeVertexNormals();
    geo.computeBoundingSphere();
    const mesh = new THREE.Mesh(geo, Terrain.material(texSet));
    mesh.receiveShadow = true; mesh.castShadow = true;
    this.mesh = mesh;
    return mesh;
  }

  aoAt(i, j) {
    const n = this.n, H = this.heights, r = 3;
    const i0 = Math.max(0, i - r), i1 = Math.min(n - 1, i + r), j0 = Math.max(0, j - r), j1 = Math.min(n - 1, j + r);
    const avg = (H[j * n + i0] + H[j * n + i1] + H[j0 * n + i] + H[j1 * n + i]) / 4;
    const d = avg - H[j * n + i];
    return clamp(1 - d * 0.035, 0.55, 1.08);
  }

  static material(tex) {
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0 });
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.tGrass = { value: tex.grass }; sh.uniforms.tRock = { value: tex.rock };
      sh.uniforms.tSnow = { value: tex.snow }; sh.uniforms.tDirt = { value: tex.dirt };
      sh.uniforms.uBump = { value: 0.35 };
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', `#include <common>
          attribute vec4 splat; attribute float ice; varying vec4 vSplat; varying float vIce; varying vec3 vWPos; varying vec3 vWN;`)
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          vSplat = splat; vIce = ice; vWPos = (modelMatrix * vec4(transformed, 1.0)).xyz; vWN = normalize(mat3(modelMatrix) * objectNormal);`);
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', `#include <common>
          uniform sampler2D tGrass; uniform sampler2D tRock; uniform sampler2D tSnow; uniform sampler2D tDirt; uniform float uBump;
          varying vec4 vSplat; varying float vIce; varying vec3 vWPos; varying vec3 vWN;
          vec4 triRock(vec3 p, vec3 n, float s) {
            vec3 w = pow(abs(n), vec3(4.0)); w /= (w.x + w.y + w.z);
            return texture2D(tRock, p.zy * s) * w.x + texture2D(tRock, p.xz * s) * w.y + texture2D(tRock, p.xy * s) * w.z;
          }
          vec3 perturbT(vec3 pos, vec3 n, float h) {
            vec3 dx = dFdx(pos), dy = dFdy(pos);
            vec3 r1 = cross(dy, n), r2 = cross(n, dx);
            float det = dot(dx, r1);
            vec3 grad = sign(det) * (dFdx(h) * r1 + dFdy(h) * r2);
            return normalize(abs(det) * n - grad);
          }`)
        .replace('#include <map_fragment>', `
          vec3 wn = normalize(vWN);
          vec2 uv1 = vWPos.xz * 0.23;
          vec4 tg = mix(texture2D(tGrass, uv1), texture2D(tGrass, uv1 * 0.19 + 0.37), 0.35);
          vec4 tr = mix(triRock(vWPos, wn, 0.12), triRock(vWPos, wn, 0.028), 0.45);
          vec4 ts = mix(texture2D(tSnow, uv1 * 0.55), texture2D(tSnow, uv1 * 0.12), 0.5);
          vec4 td = mix(texture2D(tDirt, uv1 * 1.25), texture2D(tDirt, uv1 * 0.3), 0.3);
          vec4 hw = vSplat * (vec4(tg.a, tr.a, ts.a, td.a) * 0.9 + 0.3);
          float mx = max(max(hw.x, hw.y), max(hw.z, hw.w)) - 0.16;
          hw = max(hw - mx, 0.0); hw /= max(1e-4, hw.x + hw.y + hw.z + hw.w);
          vec3 tcol = tg.rgb * hw.x + tr.rgb * hw.y + ts.rgb * hw.z + td.rgb * hw.w;
          float tH = tg.a * hw.x * 0.6 + tr.a * hw.y * 1.4 + ts.a * hw.z * 0.35 + td.a * hw.w * 0.9;
          float tRough = 0.96 - hw.z * 0.3;
          tcol = mix(tcol, vec3(0.50, 0.68, 0.84) * (0.75 + 0.35 * ts.a), vIce);
          tRough = mix(tRough, 0.18, vIce);
          tH *= 1.0 - vIce * 0.8;
          diffuseColor.rgb *= tcol;`)
        .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = tRough;')
        .replace('#include <normal_fragment_begin>', `#include <normal_fragment_begin>
          normal = perturbT(-vViewPosition, normal, tH * uBump);`);
    };
    return mat;
  }

  /* 岩壁/巨石共用的三平面岩石材质 */
  static rockMaterial(tex, tint = 0xffffff, icy = false) {
    const mat = new THREE.MeshStandardMaterial({ color: tint, vertexColors: true, roughness: icy ? 0.35 : 0.92, metalness: 0 });
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.tRock = { value: icy ? tex.snow : tex.rock };
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vWPos2; varying vec3 vWN2;')
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          vec4 wp2 = modelMatrix * vec4(transformed, 1.0);
          vWN2 = normalize(mat3(modelMatrix) * objectNormal);
          #ifdef USE_INSTANCING
            wp2 = modelMatrix * instanceMatrix * vec4(transformed, 1.0);
            vWN2 = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * objectNormal);
          #endif
          vWPos2 = wp2.xyz;`);
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', `#include <common>
          uniform sampler2D tRock; varying vec3 vWPos2; varying vec3 vWN2;
          vec3 perturbR(vec3 pos, vec3 n, float h) {
            vec3 dx = dFdx(pos), dy = dFdy(pos); vec3 r1 = cross(dy, n), r2 = cross(n, dx);
            float det = dot(dx, r1); vec3 grad = sign(det) * (dFdx(h) * r1 + dFdy(h) * r2);
            return normalize(abs(det) * n - grad);
          }`)
        .replace('#include <map_fragment>', `
          vec3 nn = normalize(vWN2); vec3 bw = pow(abs(nn), vec3(4.0)); bw /= (bw.x + bw.y + bw.z);
          vec3 P = vWPos2 * ${icy ? '0.18' : '0.2'};
          vec4 rt = texture2D(tRock, P.zy) * bw.x + texture2D(tRock, P.xz) * bw.y + texture2D(tRock, P.xy) * bw.z;
          vec4 rt2 = texture2D(tRock, P.zy * 0.23) * bw.x + texture2D(tRock, P.xz * 0.23) * bw.y + texture2D(tRock, P.xy * 0.23) * bw.z;
          rt = mix(rt, rt2, 0.4);
          float rH = rt.a;
          diffuseColor.rgb *= ${icy ? 'mix(vec3(0.42,0.62,0.8), vec3(0.85,0.93,1.0), rt.r)' : 'rt.rgb * 1.55'};`)
        .replace('#include <normal_fragment_begin>', `#include <normal_fragment_begin>
          normal = perturbR(-vViewPosition, normal, rH * ${icy ? '0.35' : '0.9'});`);
    };
    return mat;
  }
}
