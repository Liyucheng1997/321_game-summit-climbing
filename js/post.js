/* 后期处理：HDR 渲染目标 → 泛光 → ACES 色调映射、调色、暗角、状态滤镜、淡入淡出 */
class PostFX {
  constructor(renderer) {
    this.renderer = renderer;
    this.enabled = true;
    this.cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
    this.quad.frustumCulled = false;
    this.fsScene = new THREE.Scene(); this.fsScene.add(this.quad);
    const vs = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';
    this.brightMat = new THREE.ShaderMaterial({
      uniforms: { tDiffuse: { value: null }, uThreshold: { value: 1.0 } }, vertexShader: vs, depthTest: false, depthWrite: false,
      fragmentShader: `uniform sampler2D tDiffuse; uniform float uThreshold; varying vec2 vUv;
        void main(){ vec3 c = texture2D(tDiffuse, vUv).rgb; float l = max(max(c.r, c.g), c.b); float k = smoothstep(uThreshold, uThreshold * 2.0, l); gl_FragColor = vec4(c * k, 1.0); }`,
    });
    this.blurMat = new THREE.ShaderMaterial({
      uniforms: { tDiffuse: { value: null }, uDir: { value: new THREE.Vector2() } }, vertexShader: vs, depthTest: false, depthWrite: false,
      fragmentShader: `uniform sampler2D tDiffuse; uniform vec2 uDir; varying vec2 vUv;
        void main(){ vec3 s = texture2D(tDiffuse, vUv).rgb * 0.227;
          s += (texture2D(tDiffuse, vUv + uDir * 1.385).rgb + texture2D(tDiffuse, vUv - uDir * 1.385).rgb) * 0.316;
          s += (texture2D(tDiffuse, vUv + uDir * 3.23).rgb + texture2D(tDiffuse, vUv - uDir * 3.23).rgb) * 0.07;
          gl_FragColor = vec4(s, 1.0); }`,
    });
    this.u = {
      tDiffuse: { value: null }, tBloom: { value: null }, tBloom2: { value: null },
      uExposure: { value: 1.0 }, uBloom: { value: 0.35 }, uTime: { value: 0 },
      uCold: { value: 0 }, uHurt: { value: 0 }, uFade: { value: 0 }, uLowStam: { value: 0 }, uHypoxia: { value: 0 },
      uWarm: { value: 0 }, uSat: { value: 1.05 }, uVignette: { value: 0.35 }, uPhoto: { value: 0 }, uFilter: { value: 0 },
      uRes: { value: new THREE.Vector2(1, 1) },
    };
    this.finalMat = new THREE.ShaderMaterial({
      uniforms: this.u, vertexShader: vs, depthTest: false, depthWrite: false,
      fragmentShader: `
        uniform sampler2D tDiffuse, tBloom, tBloom2; uniform float uExposure, uBloom, uTime, uCold, uHurt, uFade, uLowStam, uHypoxia, uWarm, uSat, uVignette, uPhoto, uFilter; uniform vec2 uRes;
        varying vec2 vUv;
        vec3 aces(vec3 x){ x *= 0.6; return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0); }
        vec3 toSRGB(vec3 c){ return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }
        float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
        void main(){
          vec2 uv = vUv;
          // 缺氧：轻微的画面摇晃
          uv += vec2(sin(uTime * 1.7 + uv.y * 6.0), cos(uTime * 1.3 + uv.x * 5.0)) * 0.0025 * uHypoxia;
          vec3 c = texture2D(tDiffuse, uv).rgb;
          vec3 b = texture2D(tBloom, uv).rgb * 0.6 + texture2D(tBloom2, uv).rgb * 0.8;
          c += b * uBloom;
          c *= uExposure;
          c = aces(c);
          // 调色
          float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
          c = mix(vec3(l), c, uSat * (1.0 - uLowStam * 0.55) * (1.0 - uHypoxia * 0.4));
          c *= mix(vec3(1.0), vec3(1.06, 1.0, 0.92), uWarm);
          c = mix(c, c * vec3(0.82, 0.92, 1.12) + vec3(0.02, 0.04, 0.08), uCold * 0.7);
          // 照片滤镜
          if (uFilter > 0.5 && uFilter < 1.5) { float g = dot(c, vec3(0.3, 0.59, 0.11)); c = vec3(g) * vec3(1.07, 0.98, 0.86); }
          else if (uFilter > 1.5 && uFilter < 2.5) { float g = dot(c, vec3(0.3, 0.59, 0.11)); c = vec3(g); c = (c - 0.5) * 1.25 + 0.5; }
          else if (uFilter > 2.5) { c = pow(c, vec3(0.9, 1.0, 1.15)) * vec3(1.08, 1.0, 0.95); c = mix(c, vec3(1.0, 0.8, 0.6), 0.06); }
          // 暗角与状态边缘
          vec2 q = vUv - 0.5; q.x *= uRes.x / uRes.y;
          float r = length(q);
          float vig = smoothstep(0.35, 1.0, r);
          c *= 1.0 - vig * uVignette;
          vec3 frost = vec3(0.75, 0.88, 1.0);
          float fr = smoothstep(0.55 - uCold * 0.25, 1.05, r + hash(floor(vUv * uRes / 3.0)) * 0.08) * uCold;
          c = mix(c, frost, fr * 0.85);
          c = mix(c, vec3(0.55, 0.02, 0.02), smoothstep(0.4, 1.0, r) * uHurt * 0.8);
          c *= 1.0 - smoothstep(0.3, 0.95, r) * uLowStam * 0.35 * (0.8 + 0.2 * sin(uTime * 6.0));
          // 胶片颗粒
          c += (hash(vUv * uRes + uTime) - 0.5) * 0.018;
          c = mix(c, vec3(0.0), uFade);
          gl_FragColor = vec4(toSRGB(clamp(c, 0.0, 1.0)), 1.0);
        }`,
    });
    this.setSize(1, 1, 1);
  }

  setSize(w, h, pr) {
    const W = Math.max(2, Math.floor(w * pr)), H = Math.max(2, Math.floor(h * pr));
    const opts = { type: THREE.HalfFloatType, depthBuffer: true };
    if (this.rt) { this.rt.dispose(); this.b1.dispose(); this.b2.dispose(); this.b3.dispose(); this.b4.dispose(); }
    this.rt = new THREE.WebGLRenderTarget(W, H, Object.assign({ samples: 4 }, opts));
    const bw = Math.max(2, W >> 1), bh = Math.max(2, H >> 1), qw = Math.max(2, W >> 3), qh = Math.max(2, H >> 3);
    const o2 = { type: THREE.HalfFloatType, depthBuffer: false };
    this.b1 = new THREE.WebGLRenderTarget(bw, bh, o2); this.b2 = new THREE.WebGLRenderTarget(bw, bh, o2);
    this.b3 = new THREE.WebGLRenderTarget(qw, qh, o2); this.b4 = new THREE.WebGLRenderTarget(qw, qh, o2);
    this.bw = bw; this.bh = bh; this.qw = qw; this.qh = qh;
    this.u.uRes.value.set(W, H);
  }

  pass(mat, target) {
    this.quad.material = mat;
    this.renderer.setRenderTarget(target);
    this.renderer.render(this.fsScene, this.cam);
  }

  render(scene, camera) {
    const r = this.renderer;
    r.setRenderTarget(this.rt);
    r.render(scene, camera);
    // 泛光
    this.brightMat.uniforms.tDiffuse.value = this.rt.texture;
    this.pass(this.brightMat, this.b1);
    const bl = this.blurMat.uniforms;
    bl.tDiffuse.value = this.b1.texture; bl.uDir.value.set(1 / this.bw, 0); this.pass(this.blurMat, this.b2);
    bl.tDiffuse.value = this.b2.texture; bl.uDir.value.set(0, 1 / this.bh); this.pass(this.blurMat, this.b1);
    bl.tDiffuse.value = this.b1.texture; bl.uDir.value.set(1 / this.qw, 0); this.pass(this.blurMat, this.b3);
    bl.tDiffuse.value = this.b3.texture; bl.uDir.value.set(0, 1 / this.qh); this.pass(this.blurMat, this.b4);
    bl.tDiffuse.value = this.b4.texture; bl.uDir.value.set(2 / this.qw, 0); this.pass(this.blurMat, this.b3);
    bl.tDiffuse.value = this.b3.texture; bl.uDir.value.set(0, 2 / this.qh); this.pass(this.blurMat, this.b4);
    this.u.tDiffuse.value = this.rt.texture; this.u.tBloom.value = this.b1.texture; this.u.tBloom2.value = this.b4.texture;
    this.pass(this.finalMat, null);
  }
}
