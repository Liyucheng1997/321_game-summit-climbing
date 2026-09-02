/* 2D Simplex 噪声 + 可复现随机数 */
(function (global) {
  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const F2 = 0.5 * (Math.sqrt(3) - 1);
  const G2 = (3 - Math.sqrt(3)) / 6;
  const GRAD = [[1, 1], [-1, 1], [1, -1], [-1, -1], [1, 0], [-1, 0], [0, 1], [0, -1]];

  class Simplex2D {
    constructor(seed) {
      const rnd = mulberry32(seed);
      const p = new Uint8Array(256);
      for (let i = 0; i < 256; i++) p[i] = i;
      for (let i = 255; i > 0; i--) {
        const j = Math.floor(rnd() * (i + 1));
        const t = p[i]; p[i] = p[j]; p[j] = t;
      }
      this.perm = new Uint8Array(512);
      this.permMod8 = new Uint8Array(512);
      for (let i = 0; i < 512; i++) { this.perm[i] = p[i & 255]; this.permMod8[i] = this.perm[i] & 7; }
    }
    noise(xin, yin) {
      const perm = this.perm, pm8 = this.permMod8;
      let n0 = 0, n1 = 0, n2 = 0;
      const s = (xin + yin) * F2;
      const i = Math.floor(xin + s), j = Math.floor(yin + s);
      const t = (i + j) * G2;
      const x0 = xin - (i - t), y0 = yin - (j - t);
      let i1, j1;
      if (x0 > y0) { i1 = 1; j1 = 0; } else { i1 = 0; j1 = 1; }
      const x1 = x0 - i1 + G2, y1 = y0 - j1 + G2;
      const x2 = x0 - 1 + 2 * G2, y2 = y0 - 1 + 2 * G2;
      const ii = i & 255, jj = j & 255;
      let t0 = 0.5 - x0 * x0 - y0 * y0;
      if (t0 > 0) { const g = GRAD[pm8[ii + perm[jj]]]; t0 *= t0; n0 = t0 * t0 * (g[0] * x0 + g[1] * y0); }
      let t1 = 0.5 - x1 * x1 - y1 * y1;
      if (t1 > 0) { const g = GRAD[pm8[ii + i1 + perm[jj + j1]]]; t1 *= t1; n1 = t1 * t1 * (g[0] * x1 + g[1] * y1); }
      let t2 = 0.5 - x2 * x2 - y2 * y2;
      if (t2 > 0) { const g = GRAD[pm8[ii + 1 + perm[jj + 1]]]; t2 *= t2; n2 = t2 * t2 * (g[0] * x2 + g[1] * y2); }
      return 70 * (n0 + n1 + n2);
    }
    /* 分形布朗运动，返回约 [-1,1] */
    fbm(x, y, oct = 4, lac = 2.0, gain = 0.5) {
      let a = 1, f = 1, s = 0, norm = 0;
      for (let i = 0; i < oct; i++) {
        s += a * this.noise(x * f, y * f);
        norm += a; a *= gain; f *= lac;
      }
      return s / norm;
    }
    /* 山脊噪声，返回约 [0,1]，产生尖锐的脊线 */
    ridged(x, y, oct = 4, lac = 2.0, gain = 0.5) {
      let a = 1, f = 1, s = 0, norm = 0, w = 1;
      for (let i = 0; i < oct; i++) {
        let v = 1 - Math.abs(this.noise(x * f, y * f));
        v = v * v * w;
        w = Math.min(1, v * 2);
        s += v * a; norm += a; a *= gain; f *= lac;
      }
      return s / norm;
    }
  }

  global.Noise = { Simplex2D, mulberry32 };
})(window);
