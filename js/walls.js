/* 攀岩墙：岩面网格、岩点生成、局部坐标查询与碰撞 */
const HOLD = { JUG: 0, CRIMP: 1, SLOPER: 2, LOOSE: 3, ICE: 4 };
const HOLD_INFO = [
  { name: '大把手', drain: -8, cost: 1.0, color: 0xd9d2c0, chalk: true },
  { name: '小岩点', drain: 3.0, cost: 1.35, color: 0xb9b1a2, chalk: true },
  { name: '斜面点', drain: 5.0, cost: 1.5, color: 0x9e978b, chalk: false },
  { name: '松动岩块', drain: 2.5, cost: 1.2, color: 0x9a5b3c, chalk: false, crumble: 1.6 },
  { name: '冰镐点', drain: 2.8, cost: 1.3, color: 0x2e5f86, chalk: false },
];

class ClimbWall {
  constructor(site, terrain, rnd, texSet, index) {
    this.site = site; this.T = terrain; this.rnd = rnd; this.index = index;
    this.B = site.B; this.n = site.n; this.back = site.back; this.right = site.right;
    this.W = site.W; this.H = site.H; this.baseY = site.baseY; this.topY = site.topY;
    this.icy = site.style === 'ice';
    this.difficulty = site.difficulty || 0;
    this.noise = new Noise.Simplex2D(Math.floor(rnd() * 1e6));
    // 悬垂：困难岩壁中上部外倾
    this.ov = this.difficulty >= 1 && rnd() < 0.7 ? rrange(rnd, 0.6, 1.5) : this.difficulty >= 2 ? 0.5 : 0.15;
    this.ovY0 = this.H * rrange(rnd, 0.35, 0.5); this.ovY1 = this.H * rrange(rnd, 0.75, 0.92);
    this.pitons = [];
    this.group = new THREE.Group();
    this.buildMesh(texSet);
    this.buildHolds();
    this.name = `${this.icy ? '冰壁' : '岩壁'} · ${Math.round(this.H)}m`;
    this.topped = false;
  }

  /* 面的 b 偏移（负值=向外） */
  faceB(a, y) {
    const H = this.H, N = this.noise;
    const slab = -1.1 * (1 - clamp(y / H, 0, 1));
    const t = clamp((y - this.ovY0) / (this.ovY1 - this.ovY0), 0, 1);
    const lean = this.ov * Math.sin(Math.PI * t);
    const bump = (N.fbm(a * 0.35, y * 0.35, 3) * 0.5 + 0.5) * 0.35 + (N.noise(a * 1.6, y * 1.6) * 0.5 + 0.5) * 0.08;
    return slab - lean - bump;
  }
  /* 局部坐标 → 世界 */
  point(a, y, b, out = new THREE.Vector3()) {
    return out.copy(this.B).addScaledVector(this.right, a).addScaledVector(this.back, b).setY(this.baseY + y);
  }
  surf(a, y, out = new THREE.Vector3()) { return this.point(a, y, this.faceB(a, y), out); }
  normalAt(a, y, out = new THREE.Vector3()) {
    const e = 0.15;
    const pa = this.surf(a + e, y), pb = this.surf(a - e, y), pc = this.surf(a, y + e), pd = this.surf(a, y - e);
    const ta = pa.sub(pb), tb = pc.sub(pd);
    return out.crossVectors(ta, tb).normalize(); // right × up = 指向墙外
  }
  toLocal(p) {
    const dx = p.x - this.B.x, dz = p.z - this.B.z;
    return { a: dx * this.right.x + dz * this.right.z, b: dx * this.back.x + dz * this.back.z, y: p.y - this.baseY };
  }
  colTop(a) { return this.T.getHeight(this.B.x + this.right.x * a + this.back.x * 4.6, this.B.z + this.right.z * a + this.back.z * 4.6) - this.baseY; }
  colBottom(a) { return this.T.getHeight(this.B.x + this.right.x * a - this.back.x * 1.8, this.B.z + this.right.z * a - this.back.z * 1.8) - this.baseY - 1.4; }

  buildMesh(texSet) {
    const W = this.W, ext = W / 2 + 13;
    const cols = Math.ceil(ext * 2 / 0.55), faceRows = Math.max(16, Math.ceil(this.H / 0.5)), lipRows = 6;
    const rows = faceRows + lipRows;
    const pos = new Float32Array((cols + 1) * (rows + 1) * 3), col = new Float32Array((cols + 1) * (rows + 1) * 3);
    const N = this.noise, p = new THREE.Vector3();
    const base = this.icy ? new THREE.Color(0.8, 0.9, 1.0) : new THREE.Color(1, 1, 1);
    for (let i = 0; i <= cols; i++) {
      const a = -ext + (i / cols) * ext * 2;
      const top = Math.max(0.2, this.colTop(a)), bot = Math.min(this.colBottom(a), top - 0.5);
      const fb = this.faceB(a, top);
      for (let r = 0; r <= rows; r++) {
        let y, b;
        if (r <= faceRows) { y = lerp(bot, top, r / faceRows); b = this.faceB(a, y); }
        else {
          const t = (r - faceRows) / lipRows; // 圆润的顶部边缘
          const ang = t * Math.PI / 2;
          b = lerp(fb, 4.9, 1 - Math.cos(ang) * 0.999) ;
          y = top + Math.sin(ang) * 0.35 - t * t * 0.45;
          if (r === rows) y = top - 0.25;
        }
        this.point(a, y, b, p);
        const k = (i * (rows + 1) + r) * 3;
        pos[k] = p.x; pos[k + 1] = p.y; pos[k + 2] = p.z;
        // 颜色：竖向水痕、地衣与顶部风化
        const streak = N.fbm(a * 0.8, 3.3, 2) * 0.5 + 0.5;
        const lich = smoothstep(0.35, 0.6, N.noise(a * 0.3 + 5, y * 0.3));
        let c = new THREE.Color().copy(base);
        if (this.icy) c.lerp(new THREE.Color(0.35, 0.55, 0.78), clamp(0.3 + streak * 0.5 - y / this.H * 0.3, 0, 1));
        else {
          c.multiplyScalar(0.72 + streak * 0.35);
          c.lerp(new THREE.Color(0.55, 0.6, 0.35), lich * 0.25 * (1 - y / this.H));
          if (r > faceRows) c.lerp(new THREE.Color(0.55, 0.62, 0.4), 0.35);
        }
        col[k] = c.r; col[k + 1] = c.g; col[k + 2] = c.b;
      }
    }
    const idx = [];
    for (let i = 0; i < cols; i++) for (let r = 0; r < rows; r++) {
      const a = i * (rows + 1) + r, b = a + 1, c = a + rows + 1, d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    // 法线方向检查：保证朝外
    const nrm = geo.attributes.normal;
    const test = new THREE.Vector3(nrm.getX(Math.floor(rows / 2)), nrm.getY(Math.floor(rows / 2)), nrm.getZ(Math.floor(rows / 2)));
    if (test.dot(this.n) < 0) { for (let k = 0; k < idx.length; k += 3) { const t = idx[k + 1]; idx[k + 1] = idx[k + 2]; idx[k + 2] = t; } geo.setIndex(idx); geo.computeVertexNormals(); }
    const mesh = new THREE.Mesh(geo, Terrain.rockMaterial(texSet, 0xffffff, this.icy));
    mesh.castShadow = true; mesh.receiveShadow = true;
    this.mesh = mesh;
    this.group.add(mesh);
  }

  buildHolds() {
    const rnd = this.rnd, W = this.W, H = this.H, d = this.difficulty;
    const list = [];
    const minD = 0.42;
    const ok = (a, y) => list.every(h => Math.hypot(h.a - a, h.y - y) > minD);
    const pickType = () => {
      if (this.icy) return rnd() < 0.12 ? HOLD.JUG : HOLD.ICE;
      const r = rnd();
      if (d === 0) return r < 0.55 ? HOLD.JUG : r < 0.9 ? HOLD.CRIMP : HOLD.SLOPER;
      return r < 0.34 ? HOLD.JUG : r < 0.66 ? HOLD.CRIMP : r < 0.84 ? HOLD.SLOPER : HOLD.LOOSE;
    };
    const add = (a, y, type) => { if (Math.abs(a) > W / 2 - 0.6 || y < 0.7 || y > H - 0.35) return; if (!ok(a, y)) return; list.push({ a, y, type, broken: false }); };
    // 路线
    const routes = Math.max(2, Math.round(W / 7));
    for (let r = 0; r < routes; r++) {
      let a = -W / 2 + 1.5 + (W - 3) * (r + 0.5) / routes + (rnd() - 0.5) * 1.5;
      let y = 0.9 + rnd() * 0.4;
      let dynoDone = false;
      while (y < H - 0.4) {
        add(a, y, y < 2 ? HOLD.JUG : pickType());
        let step = rrange(rnd, 0.55, 0.9 + d * 0.1);
        if (d >= 1 && !dynoDone && r === 0 && y > H * 0.35 && y < H * 0.7) { step = rrange(rnd, 1.55, 1.85); dynoDone = true; }
        y += step;
        a = clamp(a + (rnd() - 0.5) * 1.0, -W / 2 + 1, W / 2 - 1);
      }
      add(a, H - 0.45, HOLD.JUG);
    }
    // 底部起步点
    for (let a = -W / 2 + 0.9; a < W / 2 - 0.7; a += 1.4 + rnd() * 0.6) add(a, 1.0 + rnd() * 0.6, HOLD.JUG);
    // 中段休息点
    const ry = H * rrange(rnd, 0.42, 0.58);
    for (let r = 0; r < routes; r++) { const a = -W / 2 + (W) * (r + 0.5) / routes; add(a + 0.3, ry, HOLD.JUG); }
    // 散布
    const scatter = Math.floor(W * H * (0.13 - d * 0.025));
    for (let k = 0; k < scatter; k++) add((rnd() - 0.5) * (W - 1.2), 0.8 + rnd() * (H - 1.2), pickType());
    // 顶部边缘保证可翻越
    for (let a = -W / 2 + 1; a < W / 2 - 0.8; a += 1.6 + rnd()) add(a, H - 0.4, HOLD.JUG);
    // 连通性：每个岩点上方都要有可够到的岩点（避免死路）
    const upOK = (h) => list.some(o => { const dy = o.y - h.y, L = Math.hypot(o.a - h.a, dy); return o !== h && dy > 0.3 && L <= 1.2 && dy / L > 0.62; });
    for (let pass = 0; pass < 6; pass++) {
      let added = 0;
      for (const h of list.slice()) {
        if (h.y > H - 1.25 || upOK(h)) continue;
        const a = clamp(h.a + (rnd() - 0.5) * 0.5, -W / 2 + 0.7, W / 2 - 0.7), y = Math.min(H - 0.4, h.y + rrange(rnd, 0.6, 0.95));
        list.push({ a, y, type: y < 2 ? HOLD.JUG : pickType(), broken: false }); added++;
      }
      if (!added) break;
    }
    this.holds = list;
    const nrm = new THREE.Vector3();
    for (const h of list) {
      h.pos = this.surf(h.a, h.y);
      this.normalAt(h.a, h.y, nrm);
      h.nrm = nrm.clone();
      h.pos.addScaledVector(nrm, 0.05);
    }
    // 实例化网格
    const geos = [
      jitterGeo(new THREE.SphereGeometry(0.14, 10, 7), 0.02, rnd),
      jitterGeo(new THREE.SphereGeometry(0.11, 8, 6), 0.012, rnd),
      jitterGeo(new THREE.SphereGeometry(0.19, 10, 8), 0.02, rnd),
      jitterGeo(new THREE.DodecahedronGeometry(0.15, 0), 0.03, rnd),
      jitterGeo(new THREE.SphereGeometry(0.1, 7, 5), 0.02, rnd),
    ];
    const scales = [[1.35, 0.6, 0.85], [1.6, 0.3, 0.7], [1.2, 0.85, 0.6], [1.1, 0.8, 0.9], [1.1, 0.5, 0.4]];
    this.holdMeshes = [];
    const m = new THREE.Matrix4(), bx = new THREE.Vector3(), by = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
    const chalkTex = Tex.soft();
    const chalkList = list.filter(h => HOLD_INFO[h.type].chalk);
    for (let t = 0; t < 5; t++) {
      const of = list.filter(h => h.type === t);
      if (!of.length) continue;
      const mat = new THREE.MeshStandardMaterial({ color: HOLD_INFO[t].color, roughness: t === HOLD.ICE ? 0.3 : 0.85, metalness: 0 });
      const im = new THREE.InstancedMesh(geos[t], mat, of.length);
      of.forEach((h, k) => {
        by.copy(up).addScaledVector(h.nrm, -up.dot(h.nrm)).normalize();
        bx.crossVectors(by, h.nrm).normalize();
        m.makeBasis(bx, by, h.nrm);
        q.setFromRotationMatrix(m);
        const sc = scales[t], j = (0.85 + rnd() * 0.3) * 0.8;
        s.set(sc[0] * j, sc[1] * j, sc[2] * j);
        m.compose(h.pos, q, s);
        im.setMatrixAt(k, m);
        h.mesh = im; h.inst = k;
      });
      im.castShadow = true; im.receiveShadow = true;
      this.group.add(im);
      this.holdMeshes.push(im);
    }
    // 镁粉痕迹
    if (chalkList.length) {
      const cg = new THREE.PlaneGeometry(0.34, 0.26);
      const cm = new THREE.MeshBasicMaterial({ map: chalkTex, color: 0xffffff, transparent: true, opacity: this.icy ? 0.25 : 0.42, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
      const ci = new THREE.InstancedMesh(cg, cm, chalkList.length);
      chalkList.forEach((h, k) => {
        by.copy(up).addScaledVector(h.nrm, -up.dot(h.nrm)).normalize();
        bx.crossVectors(by, h.nrm).normalize();
        m.makeBasis(bx, by, h.nrm); q.setFromRotationMatrix(m);
        s.set(1 + rnd() * 0.4, 1 + rnd() * 0.3, 1);
        const p = h.pos.clone().addScaledVector(h.nrm, -0.03).addScaledVector(by, 0.06);
        m.compose(p, q, s); ci.setMatrixAt(k, m);
      });
      this.group.add(ci);
    }
    // 顶部锚点（金属环）+ 底部标牌
    const anchorMat = new THREE.MeshStandardMaterial({ color: 0xc9ced6, metalness: 0.9, roughness: 0.3 });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.09, 0.018, 6, 14), anchorMat);
    this.point(0, this.H - 0.15, this.faceB(0, this.H - 0.15) - 0.03, ring.position);
    ring.lookAt(ring.position.clone().add(this.n));
    this.group.add(ring);
  }

  breakHold(h) {
    if (h.broken) return;
    h.broken = true;
    const m = new THREE.Matrix4().makeScale(0, 0, 0);
    h.mesh.setMatrixAt(h.inst, m);
    h.mesh.instanceMatrix.needsUpdate = true;
  }

  /* 在方向 dir(2D, 已归一化) 上寻找可达的岩点 */
  findHold(from, dirA, dirY, reach, minReach = 0.3) {
    let best = null, bestScore = 1e9;
    for (const h of this.holds) {
      if (h === from || h.broken) continue;
      const da = h.a - from.a, dy = h.y - from.y, L = Math.hypot(da, dy);
      if (L < minReach || L > reach) continue;
      const cos = (da * dirA + dy * dirY) / L;
      if (cos < 0.55) continue;
      const score = (1 - cos) * 3 + Math.abs(L - reach * 0.6) * 0.6 + (h.type === HOLD.JUG ? -0.15 : 0);
      if (score < bestScore) { bestScore = score; best = h; }
    }
    return best;
  }

  nearestHold(a, y, maxDist, filter) {
    let best = null, bd = maxDist;
    for (const h of this.holds) {
      if (h.broken || (filter && !filter(h))) continue;
      const d = Math.hypot(h.a - a, h.y - y);
      if (d < bd) { bd = d; best = h; }
    }
    return best;
  }

  /* 玩家碰撞：不能穿入岩面，也不能从顶部边缘直接掉进墙体 */
  collide(p) {
    const l = this.toLocal(p);
    if (Math.abs(l.a) > this.W / 2 + 0.5 || l.b > 5.5 || l.b < -4) return false;
    if (l.y < this.H - 0.6) {
      const fb = this.faceB(l.a, clamp(l.y + 0.9, 0, this.H)) - 0.38;
      if (l.b > fb && l.b < 2.5) { p.addScaledVector(this.back, fb - l.b); return 'face'; }
    } else if (l.b < 4.3 && l.b > -1) {
      p.addScaledVector(this.back, 4.3 - l.b);
      return 'edge';
    }
    return false;
  }
}
