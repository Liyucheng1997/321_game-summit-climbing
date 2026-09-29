/* 通用工具：数学、几何合并、格式化 */
const DEG = Math.PI / 180;
const G = 9.81;

function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
function lerp(a, b, t) { return a + (b - a) * t; }
function smoothstep(a, b, x) { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); }
function toLinear(c) { return Math.pow(c, 2.2); }
function damp(a, b, rate, dt) { return a + (b - a) * (1 - Math.exp(-rate * dt)); }
function wrapAngle(a) { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; }
function rrange(rnd, a, b) { return a + (b - a) * rnd(); }
function rpick(rnd, arr) { return arr[Math.floor(rnd() * arr.length) % arr.length]; }
function fmtTime(sec) { sec = Math.max(0, Math.floor(sec)); const m = Math.floor(sec / 60), s = sec % 60; return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`; }
function fmtClock(h) { h = ((h % 24) + 24) % 24; const hh = Math.floor(h), mm = Math.floor((h - hh) * 60); return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`; }
function linColor(hex) { return new THREE.Color(hex); }
function srgb(r, g, b) { return new THREE.Color(toLinear(r), toLinear(g), toLinear(b)); }

/* 给几何体填充顶点色 */
function paintGeo(geo, color, jitter = 0, rnd = Math.random) {
  const n = geo.attributes.position.count;
  const col = new Float32Array(n * 3);
  const c = color instanceof THREE.Color ? color : new THREE.Color(color);
  for (let i = 0; i < n; i++) {
    const j = 1 + (rnd() - 0.5) * jitter;
    col[i * 3] = c.r * j; col[i * 3 + 1] = c.g * j; col[i * 3 + 2] = c.b * j;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return geo;
}

/* 按顶点高度渐变着色（底 → 顶） */
function paintGradient(geo, c0, c1, y0, y1) {
  const p = geo.attributes.position, n = p.count, col = new Float32Array(n * 3);
  const a = new THREE.Color(c0), b = new THREE.Color(c1), t = new THREE.Color();
  for (let i = 0; i < n; i++) {
    t.copy(a).lerp(b, clamp((p.getY(i) - y0) / (y1 - y0), 0, 1));
    col[i * 3] = t.r; col[i * 3 + 1] = t.g; col[i * 3 + 2] = t.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return geo;
}

/* 合并多个几何体（转为非索引，保留 position / normal / color） */
function mergeGeos(list) {
  let total = 0;
  const parts = list.map(g => {
    const ng = g.index ? g.toNonIndexed() : g;
    if (!ng.attributes.normal) ng.computeVertexNormals();
    if (!ng.attributes.color) paintGeo(ng, 0xffffff);
    total += ng.attributes.position.count;
    return ng;
  });
  const pos = new Float32Array(total * 3), nor = new Float32Array(total * 3), col = new Float32Array(total * 3);
  let o = 0;
  for (const g of parts) {
    pos.set(g.attributes.position.array, o * 3);
    nor.set(g.attributes.normal.array, o * 3);
    col.set(g.attributes.color.array, o * 3);
    o += g.attributes.position.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  out.computeBoundingSphere();
  return out;
}

/* 用噪声扰动顶点（制作自然岩石、树冠） */
function jitterGeo(geo, amount, rnd, noise, freq = 1.3) {
  const p = geo.attributes.position;
  const v = new THREE.Vector3();
  // 先合并相同位置的顶点，保证扰动后不出现裂缝
  const key = (x, y, z) => `${x.toFixed(3)},${y.toFixed(3)},${z.toFixed(3)}`;
  const cache = new Map();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const k = key(v.x, v.y, v.z);
    let d = cache.get(k);
    if (d === undefined) {
      d = noise ? noise.noise(v.x * freq + v.z * 0.7, v.y * freq - v.z * 0.4) * amount : (rnd() - 0.5) * 2 * amount;
      cache.set(k, d);
    }
    const len = v.length() || 1;
    v.multiplyScalar((len + d) / len);
    p.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals();
  return geo;
}

function disposeTree(obj) {
  obj.traverse(o => {
    if (o.geometry) o.geometry.dispose();
    if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => { for (const k in m) { const v = m[k]; if (v && v.isTexture && !v.userData.shared) v.dispose(); } m.dispose(); });
  });
}

/* 最小二叉堆（A* 用） */
class MinHeap {
  constructor() { this.k = []; this.v = []; }
  get size() { return this.k.length; }
  push(key, val) {
    const k = this.k, v = this.v; let i = k.length; k.push(key); v.push(val);
    while (i > 0) { const p = (i - 1) >> 1; if (k[p] <= key) break; k[i] = k[p]; v[i] = v[p]; i = p; }
    k[i] = key; v[i] = val;
  }
  pop() {
    const k = this.k, v = this.v; const top = v[0];
    const lk = k.pop(), lv = v.pop();
    if (k.length) {
      let i = 0; const n = k.length;
      while (true) {
        let l = i * 2 + 1, r = l + 1, m = i;
        let mk = lk;
        if (l < n && k[l] < mk) { m = l; mk = k[l]; }
        if (r < n && k[r] < mk) { m = r; }
        if (m === i) break;
        k[i] = k[m]; v[i] = v[m]; i = m;
      }
      k[i] = lk; v[i] = lv;
    }
    return top;
  }
}
