/* 程序化无缝贴图：草地、岩石、雪、泥土、水面法线、粒子与云 */
class TileNoise {
  constructor(seed) {
    const rnd = Noise.mulberry32(seed);
    this.perm = new Uint16Array(512);
    const p = [];
    for (let i = 0; i < 256; i++) p.push(i);
    for (let i = 255; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [p[i], p[j]] = [p[j], p[i]]; }
    for (let i = 0; i < 512; i++) this.perm[i] = p[i & 255];
    this.gx = new Float32Array(256); this.gy = new Float32Array(256);
    for (let i = 0; i < 256; i++) { const a = rnd() * Math.PI * 2; this.gx[i] = Math.cos(a); this.gy[i] = Math.sin(a); }
    this.rv = new Float32Array(256);
    for (let i = 0; i < 256; i++) this.rv[i] = rnd();
  }
  hash(x, y) { return this.perm[(this.perm[x & 255] + y) & 255]; }
  /* 周期为 (px, py) 的梯度噪声，约 [-0.7, 0.7] */
  noise(x, y, px, py) {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
    const x0 = ((xi % px) + px) % px, y0 = ((yi % py) + py) % py, x1 = (x0 + 1) % px, y1 = (y0 + 1) % py;
    const g = (ix, iy, dx, dy) => { const h = this.hash(ix, iy); return this.gx[h] * dx + this.gy[h] * dy; };
    const u = xf * xf * xf * (xf * (xf * 6 - 15) + 10), v = yf * yf * yf * (yf * (yf * 6 - 15) + 10);
    const a = g(x0, y0, xf, yf), b = g(x1, y0, xf - 1, yf), c = g(x0, y1, xf, yf - 1), d = g(x1, y1, xf - 1, yf - 1);
    return lerp(lerp(a, b, u), lerp(c, d, u), v);
  }
  fbm(u, v, p, oct, gain = 0.5) {
    let s = 0, a = 1, n = 0, f = p;
    for (let i = 0; i < oct; i++) { s += a * this.noise(u * f, v * f, f, f); n += a; a *= gain; f *= 2; }
    return s / n;
  }
  ridged(u, v, p, oct) {
    let s = 0, a = 1, n = 0, f = p;
    for (let i = 0; i < oct; i++) { const r = 1 - Math.abs(this.noise(u * f, v * f, f, f) * 1.4); s += a * r * r; n += a; a *= 0.5; f *= 2; }
    return s / n;
  }
  /* 周期 Worley（F1, F2） */
  worley(u, v, p) {
    const x = u * p, y = v * p, xi = Math.floor(x), yi = Math.floor(y);
    let f1 = 9, f2 = 9, id = 0;
    for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
      const cx = xi + i, cy = yi + j;
      const wx = ((cx % p) + p) % p, wy = ((cy % p) + p) % p;
      const h = this.hash(wx, wy), h2 = this.hash(wy + 17, wx + 91);
      const px = cx + this.rv[h], py = cy + this.rv[h2];
      const d = Math.hypot(px - x, py - y);
      if (d < f1) { f2 = f1; f1 = d; id = h; } else if (d < f2) f2 = d;
    }
    return [f1, f2, id];
  }
}

const Tex = {
  cache: {},
  makeData(size, fn) {
    const data = new Uint8Array(size * size * 4);
    const c = [0, 0, 0, 1];
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      fn(x / size, y / size, c);
      const i = (y * size + x) * 4;
      data[i] = clamp(c[0] * 255, 0, 255); data[i + 1] = clamp(c[1] * 255, 0, 255); data[i + 2] = clamp(c[2] * 255, 0, 255); data[i + 3] = clamp(c[3] * 255, 0, 255);
    }
    return data;
  },
  toTexture(data, size, srgbColor = true) {
    const t = new THREE.DataTexture(data, size, size, THREE.RGBAFormat, THREE.UnsignedByteType);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true;
    t.anisotropy = 8;
    if (srgbColor) { if ('colorSpace' in t) t.colorSpace = THREE.SRGBColorSpace; else t.encoding = THREE.sRGBEncoding; }
    t.needsUpdate = true;
    t.userData.shared = true;
    return t;
  },

  /* 地表四件套：rgb=颜色，a=高度 */
  terrainSet(size) {
    const k = 'terrain' + size;
    if (this.cache[k]) return this.cache[k];
    const N = new TileNoise(1337), N2 = new TileNoise(4242), rnd = Noise.mulberry32(9);
    const grass = this.makeData(size, (u, v, c) => {
      const big = N.fbm(u, v, 3, 4) * 1.4;
      const mid = N.fbm(u, v, 16, 3);
      const fine = N2.noise(u * 96, v * 96, 96, 96) + N2.noise(u * 192, v * 192, 192, 192) * 0.6;
      const blade = clamp(0.5 + fine * 0.9 + mid * 0.4, 0, 1);
      const dry = smoothstep(0.1, 0.45, big + mid * 0.3);
      let r = lerp(0.20, 0.36, blade), g = lerp(0.33, 0.52, blade), b = lerp(0.10, 0.17, blade);
      r = lerp(r, r * 1.35 + 0.08, dry); g = lerp(g, g * 1.05 + 0.03, dry); b = lerp(b, b * 0.9, dry);
      const gap = smoothstep(0.25, -0.1, fine);
      r *= 1 - gap * 0.45; g *= 1 - gap * 0.45; b *= 1 - gap * 0.4;
      // 小花
      if (rnd() > 0.9993) { r = 0.95; g = 0.9; b = 0.4; }
      c[0] = r; c[1] = g; c[2] = b; c[3] = blade;
    });
    const rock = this.makeData(size, (u, v, c) => {
      const warp = N.fbm(u, v, 4, 3) * 0.6;
      const strata = 0.5 + 0.5 * Math.sin((v + warp * 0.25) * Math.PI * 2 * 9 + N2.fbm(u, v, 8, 2) * 2);
      const body = N.fbm(u + 0.3, v, 6, 5);
      const crack = N2.ridged(u, v, 5, 3);
      const cr = smoothstep(0.88, 0.97, crack);
      const grain = N2.noise(u * 128, v * 128, 128, 128) * 0.5 + (rnd() - 0.5) * 0.1;
      let base = 0.34 + body * 0.14 + strata * 0.05 + grain * 0.08;
      let r = base * 1.04, g = base, b = base * 0.95;
      const warm = N.fbm(u, v, 2, 3);
      r += warm * 0.04; b -= warm * 0.03;
      // 地衣斑点
      const lic = smoothstep(0.42, 0.55, N2.fbm(u + 0.7, v + 0.2, 10, 3));
      r = lerp(r, 0.46, lic * 0.3); g = lerp(g, 0.45, lic * 0.25); b = lerp(b, 0.28, lic * 0.3);
      r *= 1 - cr * 0.35; g *= 1 - cr * 0.35; b *= 1 - cr * 0.32;
      c[0] = r; c[1] = g; c[2] = b; c[3] = clamp(0.55 + body * 0.5 + strata * 0.15 - cr * 0.35 + grain * 0.2, 0, 1);
    });
    const snow = this.makeData(size, (u, v, c) => {
      const d = N.fbm(u, v, 3, 5);
      const rip = Math.sin((u * 0.4 + v + N2.fbm(u, v, 3, 3) * 0.3) * Math.PI * 2 * 14);
      const sp = N2.noise(u * 200, v * 200, 200, 200);
      const h = clamp(0.55 + d * 0.6 + rip * 0.06, 0, 1);
      const s = 0.88 + d * 0.1 + rip * 0.015 + sp * 0.03;
      c[0] = s * 0.97; c[1] = s * 0.985; c[2] = Math.min(1, s * 1.03); c[3] = h;
    });
    const dirt = this.makeData(size, (u, v, c) => {
      const b = N.fbm(u, v, 5, 4);
      const [f1, f2, id] = N2.worley(u, v, 40);
      const stone = smoothstep(0.4, 0.25, f1) * 0.8;
      const edge = smoothstep(0.02, 0.1, f2 - f1);
      const fine = N2.noise(u * 160, v * 160, 160, 160);
      const sv = 0.4 + (id / 255) * 0.18;
      let r = 0.43 + b * 0.1 + fine * 0.05, g = 0.35 + b * 0.08 + fine * 0.04, bb = 0.26 + b * 0.06 + fine * 0.03;
      r = lerp(r, sv * 1.02, stone); g = lerp(g, sv * 0.97, stone); bb = lerp(bb, sv * 0.9, stone);
      const shade = lerp(1, 0.75, (1 - edge) * stone);
      c[0] = r * shade; c[1] = g * shade; c[2] = bb * shade; c[3] = clamp(0.35 + stone * 0.55 * edge + fine * 0.1, 0, 1);
    });
    const out = {
      grass: this.toTexture(grass, size), rock: this.toTexture(rock, size),
      snow: this.toTexture(snow, size), dirt: this.toTexture(dirt, size),
    };
    this.cache[k] = out;
    return out;
  },

  /* 水面法线（线性） */
  waterNormal(size = 256) {
    if (this.cache.water) return this.cache.water;
    const N = new TileNoise(77);
    const hs = new Float32Array(size * size);
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) hs[y * size + x] = N.fbm(x / size, y / size, 6, 4);
    const data = new Uint8Array(size * size * 4);
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const l = hs[y * size + ((x - 1 + size) % size)], r = hs[y * size + ((x + 1) % size)];
      const d = hs[((y - 1 + size) % size) * size + x], u = hs[((y + 1) % size) * size + x];
      const nx = (l - r) * 6, ny = (d - u) * 6, nz = 1; const len = Math.hypot(nx, ny, nz);
      const i = (y * size + x) * 4;
      data[i] = (nx / len * 0.5 + 0.5) * 255; data[i + 1] = (ny / len * 0.5 + 0.5) * 255; data[i + 2] = (nz / len * 0.5 + 0.5) * 255; data[i + 3] = 255;
    }
    const t = this.toTexture(data, size, false);
    this.cache.water = t;
    return t;
  },

  canvas(size, draw) {
    const cv = document.createElement('canvas'); cv.width = cv.height = size;
    draw(cv.getContext('2d'), size);
    const t = new THREE.CanvasTexture(cv);
    if ('colorSpace' in t) t.colorSpace = THREE.SRGBColorSpace; else t.encoding = THREE.sRGBEncoding;
    t.userData.shared = true;
    return t;
  },
  soft() {
    return this.cache.soft || (this.cache.soft = this.canvas(64, (ctx, s) => {
      const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
      g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.35, 'rgba(255,255,255,0.55)'); g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, s, s);
    }));
  },
  flame() {
    return this.cache.flame || (this.cache.flame = this.canvas(64, (ctx, s) => {
      const g = ctx.createRadialGradient(s / 2, s * 0.62, 0, s / 2, s * 0.6, s * 0.48);
      g.addColorStop(0, 'rgba(255,250,220,1)'); g.addColorStop(0.25, 'rgba(255,190,80,0.95)'); g.addColorStop(0.6, 'rgba(255,90,20,0.45)'); g.addColorStop(1, 'rgba(120,20,0,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(s / 2, s * 0.58, s * 0.3, s * 0.42, 0, 0, Math.PI * 2); ctx.fill();
    }));
  },
  /* 云朵：由多个柔和圆斑组成，4 种变体 */
  clouds() {
    if (this.cache.clouds) return this.cache.clouds;
    const list = [];
    for (let k = 0; k < 4; k++) {
      const rnd = Noise.mulberry32(500 + k);
      list.push(this.canvas(256, (ctx, s) => {
        for (let i = 0; i < 26; i++) {
          const x = s * (0.22 + rnd() * 0.56), y = s * (0.42 + rnd() * 0.22 - Math.abs(x / s - 0.5) * 0.25);
          const r = s * (0.08 + rnd() * 0.14) * (1 - Math.abs(x / s - 0.5));
          const g = ctx.createRadialGradient(x, y - r * 0.2, 0, x, y, r);
          const top = 0.28 + rnd() * 0.2;
          g.addColorStop(0, `rgba(255,255,255,${top})`); g.addColorStop(0.6, `rgba(240,244,250,${top * 0.6})`); g.addColorStop(1, 'rgba(230,236,245,0)');
          ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
        }
        // 底部稍暗
        const lg = ctx.createLinearGradient(0, s * 0.3, 0, s * 0.8);
        lg.addColorStop(0, 'rgba(0,0,0,0)'); lg.addColorStop(1, 'rgba(90,100,120,0.25)');
        ctx.globalCompositeOperation = 'source-atop'; ctx.fillStyle = lg; ctx.fillRect(0, 0, s, s);
      }));
    }
    this.cache.clouds = list;
    return list;
  },
  moon() {
    return this.cache.moon || (this.cache.moon = this.canvas(128, (ctx, s) => {
      const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
      g.addColorStop(0, 'rgba(255,255,245,1)'); g.addColorStop(0.2, 'rgba(250,250,235,1)'); g.addColorStop(0.24, 'rgba(200,215,255,0.35)'); g.addColorStop(1, 'rgba(120,150,255,0)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, s, s);
      ctx.fillStyle = 'rgba(180,180,170,0.35)';
      [[0.46, 0.45, 0.04], [0.54, 0.52, 0.03], [0.5, 0.56, 0.025], [0.44, 0.54, 0.02]].forEach(([x, y, r]) => { ctx.beginPath(); ctx.arc(x * s, y * s, r * s, 0, Math.PI * 2); ctx.fill(); });
    }));
  },
};
