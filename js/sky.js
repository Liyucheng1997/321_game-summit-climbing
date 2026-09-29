/* 天空：昼夜循环、太阳/月亮/星空、云、云海、极光与光照参数 */
const SKY_KEYS = [
  // e = 太阳高度(sin)，颜色为 sRGB
  { e: -0.35, zen: [0.012, 0.018, 0.045], hor: [0.035, 0.05, 0.1], sun: [0.55, 0.65, 1.0] },
  { e: -0.12, zen: [0.05, 0.07, 0.18], hor: [0.22, 0.2, 0.32], sun: [0.6, 0.55, 0.8] },
  { e: -0.02, zen: [0.16, 0.2, 0.42], hor: [0.9, 0.48, 0.3], sun: [1.0, 0.45, 0.2] },
  { e: 0.08, zen: [0.24, 0.38, 0.66], hor: [1.0, 0.72, 0.48], sun: [1.0, 0.68, 0.4] },
  { e: 0.3, zen: [0.2, 0.42, 0.82], hor: [0.66, 0.78, 0.93], sun: [1.0, 0.93, 0.82] },
  { e: 1.0, zen: [0.16, 0.36, 0.8], hor: [0.6, 0.75, 0.93], sun: [1.0, 0.97, 0.92] },
];

class SkySystem {
  constructor(scene, opts) {
    this.scene = scene; this.opts = opts;
    this.sunDir = new THREE.Vector3(0.5, 0.6, -0.5).normalize();
    this.moonDir = new THREE.Vector3();
    this.zen = new THREE.Color(); this.hor = new THREE.Color(); this.sunCol = new THREE.Color();
    this.fogCol = new THREE.Color();
    this.night = 0; this.elev = 0;
    this.buildDome();
    this.buildMoon();
    this.buildClouds();
    if (opts.cloudSea != null) this.buildCloudSea(opts.cloudSea);
    if (opts.aurora) this.buildAurora();
  }

  buildDome() {
    this.u = {
      uZen: { value: new THREE.Color() }, uHor: { value: new THREE.Color() }, uSunDir: { value: this.sunDir }, uSunCol: { value: new THREE.Color() },
      uNight: { value: 0 }, uStorm: { value: 0 }, uTime: { value: 0 }, uMoonDir: { value: this.moonDir },
    };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.u, side: THREE.BackSide, depthWrite: false, fog: false,
      vertexShader: `varying vec3 vDir; void main(){ vDir = position; vec4 p = projectionMatrix * modelViewMatrix * vec4(position,1.0); gl_Position = p.xyww; }`,
      fragmentShader: `
        uniform vec3 uZen, uHor, uSunDir, uSunCol, uMoonDir; uniform float uNight, uStorm, uTime; varying vec3 vDir;
        float hash(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
        float vnoise(vec3 p){ vec3 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
          return mix(mix(mix(hash(i), hash(i+vec3(1,0,0)), f.x), mix(hash(i+vec3(0,1,0)), hash(i+vec3(1,1,0)), f.x), f.y),
                     mix(mix(hash(i+vec3(0,0,1)), hash(i+vec3(1,0,1)), f.x), mix(hash(i+vec3(0,1,1)), hash(i+vec3(1,1,1)), f.x), f.y), f.z); }
        void main(){
          vec3 d = normalize(vDir);
          float h = d.y;
          float hp = max(h, 0.0);
          vec3 col = mix(uHor, uZen, pow(hp, 0.45));
          float sd = max(dot(d, uSunDir), 0.0);
          float horizonBand = exp(-hp * 6.0);
          col += uSunCol * pow(sd, 6.0) * horizonBand * 0.9 * (1.0 - uNight);
          col += uSunCol * pow(sd, 64.0) * 0.5 * (1.0 - uNight);
          col += uSunCol * smoothstep(0.9993, 0.9997, sd) * 30.0 * (1.0 - uStorm) * step(-0.02, uSunDir.y);
          // 地平线以下
          col = mix(col, uHor * 0.7, smoothstep(0.0, -0.08, h));
          // 星空
          float starA = uNight * (1.0 - uStorm) * smoothstep(-0.02, 0.15, h);
          if (starA > 0.01) {
            vec3 sp = d * 220.0; vec3 cell = floor(sp); vec3 f = fract(sp) - 0.5;
            float r = hash(cell);
            float star = step(0.9965, r) * smoothstep(0.32, 0.0, length(f));
            float tw = 0.65 + 0.35 * sin(uTime * (2.0 + r * 5.0) + r * 60.0);
            vec3 sc = mix(vec3(0.8, 0.88, 1.0), vec3(1.0, 0.9, 0.75), fract(r * 91.7));
            // 银河
            vec3 axis = normalize(vec3(0.35, 0.3, 0.88));
            float band = exp(-pow(dot(d, axis) * 4.2, 2.0));
            float mw = band * (0.55 * vnoise(d * 9.0) + 0.45 * vnoise(d * 23.0));
            col += (sc * star * tw * 2.2 + vec3(0.55, 0.6, 0.85) * mw * 0.1) * starA;
            float dense = step(0.985, hash(cell + 7.0)) * smoothstep(0.25, 0.0, length(f)) * band;
            col += vec3(0.9, 0.92, 1.0) * dense * 0.8 * starA;
          }
          // 月晕
          float md = max(dot(d, uMoonDir), 0.0);
          col += vec3(0.55, 0.65, 0.9) * pow(md, 40.0) * 0.15 * uNight;
          // 暴风雪：灰白
          col = mix(col, vec3(0.42, 0.45, 0.5) * (1.0 - uNight * 0.85), uStorm * 0.92);
          gl_FragColor = vec4(col, 1.0);
          #include <tonemapping_fragment>
          #include <encodings_fragment>
        }`,
    });
    this.dome = new THREE.Mesh(new THREE.SphereGeometry(5000, 48, 24), mat);
    this.dome.frustumCulled = false; this.dome.renderOrder = -10;
    this.scene.add(this.dome);
  }

  buildMoon() {
    this.moon = new THREE.Sprite(new THREE.SpriteMaterial({ map: Tex.moon(), color: 0xffffff, transparent: true, depthWrite: false, fog: false, blending: THREE.AdditiveBlending }));
    this.moon.scale.setScalar(300);
    this.scene.add(this.moon);
  }

  buildClouds() {
    const tex = Tex.clouds(), rnd = Noise.mulberry32(this.opts.seed + 3), H = this.opts.H;
    this.clouds = [];
    const count = this.opts.cloudCount || 26;
    for (let k = 0; k < count; k++) {
      const m = new THREE.SpriteMaterial({ map: tex[k % 4], color: 0xffffff, transparent: true, depthWrite: false, fog: true, opacity: 0.9 });
      const s = new THREE.Sprite(m);
      const a = rnd() * Math.PI * 2, r = 500 + rnd() * 1900;
      const low = this.opts.cloudSea != null && k % 3 === 0;
      const y = low ? H * this.opts.cloudSea + 10 + rnd() * 30 : H * (1.15 + rnd() * 0.9) + 60;
      const sc = 260 + rnd() * 420;
      s.scale.set(sc, sc * 0.5, 1);
      s.position.set(Math.cos(a) * r, y, Math.sin(a) * r);
      s.userData.sp = 0.5 + rnd();
      this.scene.add(s); this.clouds.push(s);
    }
  }

  buildCloudSea(frac) {
    const y = this.opts.H * frac;
    this.seaU = { uTime: { value: 0 }, uSun: { value: new THREE.Color() }, uSky: { value: new THREE.Color() }, uShade: { value: new THREE.Color() }, uSunDir: { value: this.sunDir }, uCam: { value: new THREE.Vector3() } };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.seaU, transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: false,
      vertexShader: `varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
      fragmentShader: `
        uniform float uTime; uniform vec3 uSun, uSky, uShade, uSunDir, uCam; varying vec3 vW;
        float h2(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float n2(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f); return mix(mix(h2(i), h2(i+vec2(1,0)), f.x), mix(h2(i+vec2(0,1)), h2(i+vec2(1,1)), f.x), f.y); }
        float fbm(vec2 p){ float s = 0.0, a = 0.5; for (int i = 0; i < 5; i++){ s += a * n2(p); p *= 2.03; a *= 0.5; } return s; }
        void main(){
          vec2 p = vW.xz * 0.004 + vec2(uTime * 0.004, uTime * 0.0015);
          float c = fbm(p) * 0.7 + fbm(p * 2.7 - uTime * 0.003) * 0.3;
          float dens = smoothstep(0.32, 0.62, c);
          float e = 0.02;
          float cx = fbm(p + vec2(e, 0.0)) - fbm(p - vec2(e, 0.0));
          float cz = fbm(p + vec2(0.0, e)) - fbm(p - vec2(0.0, e));
          vec3 n = normalize(vec3(-cx * 6.0, 1.0, -cz * 6.0));
          float lit = clamp(dot(n, uSunDir) * 0.6 + 0.5, 0.0, 1.0);
          vec3 col = mix(uShade, uSun, lit * dens) + uSky * 0.25;
          float d = length(vW.xz - uCam.xz);
          float a = dens * smoothstep(5200.0, 1800.0, d) * 0.95;
          float below = step(uCam.y, vW.y);
          col = mix(col, uShade * 0.8, below * 0.5);
          gl_FragColor = vec4(col, a);
          #include <tonemapping_fragment>
          #include <encodings_fragment>
        }`,
    });
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(12000, 12000, 1, 1), mat);
    plane.rotation.x = -Math.PI / 2; plane.position.y = y; plane.renderOrder = 2;
    this.cloudSea = plane; this.cloudSeaY = y;
    this.scene.add(plane);
  }

  buildAurora() {
    this.aurU = { uTime: { value: 0 }, uAlpha: { value: 0 } };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.aurU, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false,
      vertexShader: `uniform float uTime; varying vec2 vUv; void main(){ vUv = uv; vec3 p = position; p.z += sin(p.x * 0.004 + uTime * 0.1) * 160.0 + sin(p.x * 0.011 - uTime * 0.07) * 60.0; gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0); }`,
      fragmentShader: `uniform float uTime, uAlpha; varying vec2 vUv;
        float h(float x){ return fract(sin(x * 91.3) * 4758.5); }
        float n1(float x){ float i = floor(x), f = fract(x); return mix(h(i), h(i + 1.0), f * f * (3.0 - 2.0 * f)); }
        void main(){
          float rays = n1(vUv.x * 60.0 + uTime * 0.6) * 0.6 + n1(vUv.x * 160.0 - uTime) * 0.4;
          float v = vUv.y;
          float base = smoothstep(0.0, 0.08, v) * smoothstep(1.0, 0.25, v);
          vec3 col = mix(vec3(0.1, 1.0, 0.45), vec3(0.6, 0.2, 0.9), smoothstep(0.35, 0.95, v));
          float a = base * (0.35 + rays * 0.9) * uAlpha * (0.6 + 0.4 * sin(vUv.x * 12.0 + uTime * 0.3));
          gl_FragColor = vec4(col * a * 1.6, a);
          #include <tonemapping_fragment>
          #include <encodings_fragment>
        }`,
    });
    this.aurora = new THREE.Group();
    for (let k = 0; k < 3; k++) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(5200, 700, 160, 1), mat);
      m.position.set(-400 + k * 500, 1300 + k * 120, 2600 + k * 260);
      m.rotation.y = 0.15 * (k - 1);
      this.aurora.add(m);
    }
    this.aurora.visible = false;
    this.scene.add(this.aurora);
  }

  /* 按时间与天气计算颜色 & 光照 */
  update(dt, hour, storm, camera, t) {
    const th = (hour - 6) / 12 * Math.PI;
    this.sunDir.set(Math.cos(th), Math.sin(th) * 0.92, -0.6).normalize();
    this.moonDir.set(-Math.cos(th) * 0.8, -Math.sin(th) * 0.85, -0.35).normalize();
    if (this.moonDir.y < 0.05) this.moonDir.y = 0.05, this.moonDir.normalize();
    const e = this.sunDir.y;
    this.elev = e;
    // 关键帧插值
    let a = SKY_KEYS[0], b = SKY_KEYS[SKY_KEYS.length - 1];
    for (let k = 0; k < SKY_KEYS.length - 1; k++) if (e >= SKY_KEYS[k].e && e <= SKY_KEYS[k + 1].e) { a = SKY_KEYS[k]; b = SKY_KEYS[k + 1]; break; }
    if (e < SKY_KEYS[0].e) b = a;
    const f = a === b ? 0 : smoothstep(0, 1, (e - a.e) / (b.e - a.e));
    const mixc = (ca, cb, out) => out.setRGB(toLinear(lerp(ca[0], cb[0], f)), toLinear(lerp(ca[1], cb[1], f)), toLinear(lerp(ca[2], cb[2], f)));
    mixc(a.zen, b.zen, this.zen); mixc(a.hor, b.hor, this.hor); mixc(a.sun, b.sun, this.sunCol);
    this.night = 1 - smoothstep(-0.2, 0.02, e);
    const u = this.u;
    u.uZen.value.copy(this.zen); u.uHor.value.copy(this.hor);
    u.uSunCol.value.copy(this.sunCol).multiplyScalar(e > -0.1 ? 1 : 0);
    u.uNight.value = this.night; u.uStorm.value = storm; u.uTime.value = t;
    this.dome.position.copy(camera.position);
    // 月亮
    this.moon.position.copy(camera.position).addScaledVector(this.moonDir, 3800);
    this.moon.material.opacity = this.night * (1 - storm);
    this.moon.visible = this.night > 0.02;
    // 云色
    const day = 1 - this.night;
    const cc = new THREE.Color().copy(this.sunCol).multiplyScalar(0.55 + 0.6 * day).lerp(this.hor, 0.35);
    cc.lerp(new THREE.Color(0.08, 0.09, 0.14), this.night * 0.85);
    cc.lerp(new THREE.Color(0.35, 0.37, 0.4), storm * 0.7);
    for (const c of this.clouds) {
      c.material.color.copy(cc);
      c.material.opacity = 0.85 * (1 - storm * 0.5);
      c.position.x += dt * 1.5 * c.userData.sp;
      if (c.position.x > 2600) c.position.x = -2600;
    }
    if (this.cloudSea) {
      const U = this.seaU; U.uTime.value = t;
      U.uSun.value.copy(this.sunCol).multiplyScalar(1.1 * day + 0.08).lerp(new THREE.Color(0.9, 0.92, 0.96), 0.25 * day);
      U.uSky.value.copy(this.zen); U.uShade.value.copy(this.hor).multiplyScalar(0.5 + 0.3 * day).lerp(new THREE.Color(0.25, 0.28, 0.35), 0.3);
      U.uCam.value.copy(camera.position);
    }
    if (this.aurora) {
      const tgt = this.opts.aurora ? this.night * (1 - storm) : 0;
      this.aurU.uAlpha.value = damp(this.aurU.uAlpha.value, tgt, 0.5, dt);
      this.aurU.uTime.value = t;
      this.aurora.visible = this.aurU.uAlpha.value > 0.01;
      this.aurora.position.set(camera.position.x, 0, camera.position.z);
    }
    // 雾色
    this.fogCol.copy(this.hor).lerp(this.zen, 0.25);
    this.fogCol.lerp(new THREE.Color(0.55, 0.58, 0.62).multiplyScalar(1 - this.night * 0.85), storm * 0.9);
  }

  /* 主光源参数 */
  light() {
    const e = this.elev, storm = this.u.uStorm.value;
    const sunUp = smoothstep(-0.06, 0.06, e);
    const dir = sunUp > 0.5 ? this.sunDir : this.moonDir;
    const sunI = lerp(0.6, 2.3, smoothstep(0.0, 0.35, e));
    const moonI = 0.45;
    const sw = Math.abs(sunUp - 0.5) * 2; // 切换处变暗
    const col = new THREE.Color();
    let I;
    if (sunUp > 0.5) { col.copy(this.sunCol); I = sunI * sw; }
    else { col.setRGB(0.55, 0.66, 1.0); I = moonI * sw; }
    I *= 1 - storm * 0.8;
    const hemiSky = new THREE.Color().copy(this.zen).lerp(this.hor, 0.5).multiplyScalar(1.5).lerp(new THREE.Color(0.78, 0.8, 0.84), 0.45 * (1 - this.night));
    hemiSky.lerp(new THREE.Color(0.18, 0.22, 0.35), this.night * 0.7);
    const hemiI = lerp(1.35, 0.55, this.night) * (1 + storm * 0.3);
    return { dir, col, I, hemiSky, hemiI, night: this.night };
  }
}
