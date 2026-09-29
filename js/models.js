/* 程序化模型库：树木、岩石、帐篷、营火、路标、收集品、桥梁、飞鸟 */
const Models = {
  M(color, rough = 0.8, metal = 0, extra = {}) { return new THREE.MeshStandardMaterial(Object.assign({ color, roughness: rough, metalness: metal }, extra)); },
  VC(rough = 0.85, extra = {}) { return new THREE.MeshStandardMaterial(Object.assign({ vertexColors: true, roughness: rough, metalness: 0 }, extra)); },
  mesh(g, m, shadow = true) { const o = new THREE.Mesh(g, m); o.castShadow = shadow; o.receiveShadow = true; return o; },

  /* ---------- 植被（返回 {trunk, crown} 几何，树冠为灰度顶点色，由实例色着色） ---------- */
  pine(seed, snowy) {
    const rnd = Noise.mulberry32(seed), nz = new Noise.Simplex2D(seed);
    const trunk = new THREE.CylinderGeometry(0.1, 0.22, 2.2, 7); trunk.translate(0, 1.1, 0);
    paintGradient(trunk, srgb(0.22, 0.14, 0.08), srgb(0.36, 0.24, 0.14), 0, 2.2);
    const tiers = [];
    const nT = 5 + Math.floor(rnd() * 2);
    for (let k = 0; k < nT; k++) {
      const t = k / (nT - 1);
      const r = lerp(1.75, 0.45, t) * (0.9 + rnd() * 0.2), h = lerp(2.0, 1.3, t);
      const g = new THREE.ConeGeometry(r, h, 9, 2, true);
      jitterGeo(g, 0.18, rnd, nz, 2.1);
      const y = 1.3 + t * 5.2;
      g.translate(0, y + h / 2, 0);
      // 内暗外亮
      const p = g.attributes.position, col = new Float32Array(p.count * 3);
      for (let i = 0; i < p.count; i++) {
        const ly = (p.getY(i) - y) / h;
        let v = lerp(0.55, 1.0, ly * 0.3 + 0.6) * (0.9 + rnd() * 0.15);
        let r0 = v, g0 = v, b0 = v;
        col[i * 3] = r0; col[i * 3 + 1] = g0; col[i * 3 + 2] = b0;
      }
      g.setAttribute('color', new THREE.BufferAttribute(col, 3));
      tiers.push(g);
    }
    // 底面封口（避免从下方看穿）
    const crown = mergeGeos(tiers);
    if (snowy) Models.snowCap(crown, 0.3);
    return { trunk, crown, height: 8 };
  },
  broadleaf(seed) {
    const rnd = Noise.mulberry32(seed), nz = new Noise.Simplex2D(seed);
    const parts = [];
    const trunk = new THREE.CylinderGeometry(0.1, 0.2, 3.2, 7); trunk.translate(0, 1.6, 0);
    parts.push(paintGradient(trunk, srgb(0.3, 0.22, 0.16), srgb(0.42, 0.34, 0.26), 0, 3));
    for (let k = 0; k < 3; k++) {
      const br = new THREE.CylinderGeometry(0.03, 0.07, 1.5, 5); br.translate(0, 0.75, 0);
      br.rotateZ((rnd() - 0.5) * 1.6); br.rotateY(rnd() * 6.28); br.translate(0, 2.2 + rnd(), 0);
      parts.push(paintGeo(br, srgb(0.33, 0.25, 0.18)));
    }
    const crowns = [];
    const nB = 4 + Math.floor(rnd() * 3);
    for (let k = 0; k < nB; k++) {
      const r = 1.1 + rnd() * 0.9;
      const g = new THREE.IcosahedronGeometry(r, 2);
      jitterGeo(g, 0.3, rnd, nz, 1.2);
      const a = rnd() * Math.PI * 2, d = k === 0 ? 0 : 0.8 + rnd() * 0.7;
      g.translate(Math.cos(a) * d, 3.6 + rnd() * 1.6 + (k === 0 ? 0.8 : 0), Math.sin(a) * d);
      const p = g.attributes.position, col = new Float32Array(p.count * 3), nm = g.attributes.normal;
      for (let i = 0; i < p.count; i++) { const v = (0.62 + 0.38 * clamp(nm.getY(i) * 0.5 + 0.5, 0, 1)) * (0.9 + rnd() * 0.15); col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = v; }
      g.setAttribute('color', new THREE.BufferAttribute(col, 3));
      crowns.push(g);
    }
    return { trunk: mergeGeos(parts), crown: mergeGeos(crowns), height: 7 };
  },
  deadTree(seed) {
    const rnd = Noise.mulberry32(seed), parts = [];
    const c = srgb(0.42, 0.38, 0.33);
    const t = new THREE.CylinderGeometry(0.06, 0.2, 4.5, 6); t.translate(0, 2.25, 0); parts.push(paintGeo(t, c, 0.1, rnd));
    for (let k = 0; k < 5; k++) {
      const br = new THREE.CylinderGeometry(0.02, 0.06, 1.3 + rnd(), 5); br.translate(0, 0.6, 0);
      br.rotateZ(0.6 + rnd() * 0.6); br.rotateY(rnd() * 6.28); br.translate(0, 1.6 + k * 0.55, 0);
      parts.push(paintGeo(br, c, 0.1, rnd));
    }
    return { trunk: mergeGeos(parts), crown: null, height: 4.5 };
  },
  bush(seed) {
    const rnd = Noise.mulberry32(seed), nz = new Noise.Simplex2D(seed + 3), gs = [];
    for (let k = 0; k < 4; k++) {
      const g = new THREE.IcosahedronGeometry(0.5 + rnd() * 0.35, 1); jitterGeo(g, 0.12, rnd, nz, 2);
      g.translate((rnd() - 0.5) * 0.9, 0.35 + rnd() * 0.2, (rnd() - 0.5) * 0.9);
      const p = g.attributes.position, col = new Float32Array(p.count * 3);
      for (let i = 0; i < p.count; i++) { const v = 0.6 + 0.4 * clamp(p.getY(i), 0, 1); col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = v; }
      g.setAttribute('color', new THREE.BufferAttribute(col, 3));
      gs.push(g);
    }
    return mergeGeos(gs);
  },
  snowCap(geo, amount) {
    const nm = geo.attributes.normal, col = geo.attributes.color;
    for (let i = 0; i < nm.count; i++) {
      const t = smoothstep(0.1, 0.55, nm.getY(i)) * amount * 2.5;
      col.setXYZ(i, lerp(col.getX(i), 3.2, t), lerp(col.getY(i), 3.3, t), lerp(col.getZ(i), 3.5, t));
    }
    return geo;
  },
  rock(seed, detail = 2) {
    const rnd = Noise.mulberry32(seed), nz = new Noise.Simplex2D(seed);
    const g = new THREE.IcosahedronGeometry(1, detail);
    jitterGeo(g, 0.28, rnd, nz, 1.1);
    g.scale(1 + rnd() * 0.4, 0.55 + rnd() * 0.35, 1 + rnd() * 0.3);
    const p = g.attributes.position, nm = g.attributes.normal, col = new Float32Array(p.count * 3);
    for (let i = 0; i < p.count; i++) {
      const top = smoothstep(0.3, 0.8, nm.getY(i));
      const v = 0.85 + rnd() * 0.12;
      col[i * 3] = lerp(v, 0.62, top * 0.5); col[i * 3 + 1] = lerp(v, 0.75, top * 0.5); col[i * 3 + 2] = lerp(v, 0.5, top * 0.5);
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    return g;
  },

  /* 草丛（交叉的弯曲草叶） */
  grassTuft() {
    const blades = [];
    const rnd = Noise.mulberry32(5);
    for (let k = 0; k < 7; k++) {
      const h = 0.35 + rnd() * 0.4, w = 0.05 + rnd() * 0.03;
      const g = new THREE.PlaneGeometry(w, h, 1, 3);
      const p = g.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const y = p.getY(i) + h / 2, t = y / h;
        p.setXYZ(i, p.getX(i) * (1 - t * 0.9), y, t * t * 0.18);
      }
      g.rotateY(rnd() * Math.PI * 2);
      g.translate((rnd() - 0.5) * 0.25, 0, (rnd() - 0.5) * 0.25);
      const col = new Float32Array(p.count * 3);
      for (let i = 0; i < p.count; i++) { const t = p.getY(i) / h; const v = lerp(0.45, 1.05, t); col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = v; }
      g.setAttribute('color', new THREE.BufferAttribute(col, 3));
      blades.push(g);
    }
    const m = mergeGeos(blades);
    // 草叶法线朝上，光照更柔和
    const nm = m.attributes.normal; for (let i = 0; i < nm.count; i++) nm.setXYZ(i, 0, 1, 0);
    return m;
  },
  flower() {
    const parts = [];
    const stem = new THREE.CylinderGeometry(0.008, 0.01, 0.35, 3); stem.translate(0, 0.175, 0); parts.push(paintGeo(stem, srgb(0.25, 0.45, 0.15)));
    for (let k = 0; k < 5; k++) {
      const pt = new THREE.SphereGeometry(0.035, 5, 3); pt.scale(1, 0.3, 0.6);
      pt.translate(0.035, 0.36, 0); pt.rotateY(k / 5 * Math.PI * 2);
      parts.push(paintGeo(pt, 0xffffff));
    }
    const c = new THREE.SphereGeometry(0.02, 5, 3); c.translate(0, 0.37, 0); parts.push(paintGeo(c, srgb(1, 0.85, 0.2)));
    return mergeGeos(parts);
  },

  /* ---------- 帐篷 ---------- */
  tent(color = 0xe8612c, scale = 1) {
    const g = new THREE.Group();
    const fabric = new THREE.SphereGeometry(1.3, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2);
    fabric.scale(1.35, 0.95, 1.05);
    // 布面在支杆之间微微下垂
    const p = fabric.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const a = Math.atan2(z, x);
      const sag = 1 - 0.06 * Math.pow(Math.abs(Math.sin(a * 2)), 1.5) * clamp(y / 1.2, 0, 1);
      p.setXYZ(i, x * sag, y * (1 - 0.04 * Math.abs(Math.cos(a * 2))), z * sag);
    }
    fabric.computeVertexNormals();
    const c = new THREE.Color(color);
    paintGradient(fabric, c.clone().multiplyScalar(0.55), c, 0, 0.9);
    const body = this.mesh(fabric, this.VC(0.75, { side: THREE.DoubleSide }));
    g.add(body);
    // 门（深色拉链门）
    const door = new THREE.SphereGeometry(1.31, 12, 8, -0.45, 0.9, Math.PI * 0.12, Math.PI * 0.38);
    door.scale(1.36, 0.95, 1.06);
    const doorM = this.mesh(door, this.M(new THREE.Color(color).multiplyScalar(0.35), 0.8, 0, { side: THREE.DoubleSide }));
    doorM.rotation.y = Math.PI; g.add(doorM);
    // 支杆
    const poleM = this.M(0x2b2f36, 0.4, 0.6);
    for (const ang of [Math.PI / 4, -Math.PI / 4]) {
      const pts = [];
      for (let k = 0; k <= 16; k++) { const t = k / 16 * Math.PI; pts.push(new THREE.Vector3(Math.cos(t) * 1.36 * 1.35, Math.sin(t) * 0.96 * 1.23, 0)); }
      const tube = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, 0.022, 5, false);
      const m = this.mesh(tube, poleM); m.rotation.y = ang; m.scale.set(0.74, 1, 1); g.add(m);
    }
    // 地钉与拉绳
    const lineM = new THREE.LineBasicMaterial({ color: 0xdddddd });
    for (let k = 0; k < 4; k++) {
      const a = Math.PI / 4 + k * Math.PI / 2;
      const top = new THREE.Vector3(Math.cos(a) * 1.0, 0.85, Math.sin(a) * 0.8), peg = new THREE.Vector3(Math.cos(a) * 2.5, 0.02, Math.sin(a) * 2.1);
      g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([top, peg]), lineM));
      const pg = this.mesh(new THREE.CylinderGeometry(0.015, 0.01, 0.2, 4), poleM); pg.position.copy(peg); g.add(pg);
    }
    // 睡垫从门口露出
    const pad = this.mesh(new THREE.BoxGeometry(0.6, 0.04, 0.5), this.M(0x3a7bd5)); pad.position.set(1.1, 0.03, 0); g.add(pad);
    g.scale.setScalar(scale);
    return g;
  },

  /* ---------- 营火 ---------- */
  campfire(rnd) {
    const g = new THREE.Group();
    const stoneM = this.VC(0.9, { color: 0x7d7872 });
    for (let k = 0; k < 10; k++) {
      const a = k / 10 * Math.PI * 2;
      const s = this.mesh(this.rock(900 + k, 1), stoneM); s.scale.setScalar(0.17 + rnd() * 0.06);
      s.position.set(Math.cos(a) * 0.62, 0.06, Math.sin(a) * 0.62); s.rotation.y = rnd() * 6; g.add(s);
    }
    const ash = this.mesh(new THREE.CircleGeometry(0.55, 16), this.M(0x1c1814, 1)); ash.rotation.x = -Math.PI / 2; ash.position.y = 0.02; g.add(ash);
    const logM = this.M(0x5a3a22, 0.9), charM = this.M(0x1a1410, 1, 0, { emissive: 0xff3300, emissiveIntensity: 0 });
    const logs = [];
    for (let k = 0; k < 5; k++) {
      const lg = this.mesh(new THREE.CylinderGeometry(0.05, 0.065, 0.85, 7), k % 2 ? logM : charM);
      const a = k / 5 * Math.PI * 2;
      lg.position.set(Math.cos(a) * 0.2, 0.3, Math.sin(a) * 0.2);
      lg.lookAt(0, 0.85, 0); lg.rotateX(Math.PI / 2);
      g.add(lg); logs.push(lg);
    }
    // 火焰精灵
    const flames = [];
    const fm = new THREE.SpriteMaterial({ map: Tex.flame(), color: 0xffffff, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: true });
    for (let k = 0; k < 7; k++) {
      const s = new THREE.Sprite(fm.clone()); s.userData = { ph: rnd() * 10, sp: 0.8 + rnd() * 0.8, x: (rnd() - 0.5) * 0.25, z: (rnd() - 0.5) * 0.25 };
      g.add(s); flames.push(s);
    }
    // 火星与烟
    const embN = 30, ep = new Float32Array(embN * 3), eData = [];
    for (let k = 0; k < embN; k++) eData.push({ t: rnd() * 2, sp: 0.6 + rnd() * 1.2, x: 0, z: 0, vx: (rnd() - 0.5) * 0.3, vz: (rnd() - 0.5) * 0.3 });
    const eg = new THREE.BufferGeometry(); eg.setAttribute('position', new THREE.BufferAttribute(ep, 3));
    const embers = new THREE.Points(eg, new THREE.PointsMaterial({ color: 0xffa040, size: 0.05, map: Tex.soft(), blending: THREE.AdditiveBlending, transparent: true, depthWrite: false }));
    embers.frustumCulled = false; g.add(embers);
    const smokeM = new THREE.SpriteMaterial({ map: Tex.soft(), color: 0x8a8a8a, transparent: true, opacity: 0.25, depthWrite: false });
    const smoke = [];
    for (let k = 0; k < 8; k++) { const s = new THREE.Sprite(smokeM.clone()); s.userData = { t: k / 8 * 4 }; g.add(s); smoke.push(s); }
    const fire = { group: g, lit: 0, flames, embers, eData, smoke, charM, logs };
    fire.update = (dt, t, wind) => {
      const L = fire.lit;
      flames.forEach((s, k) => {
        const u = s.userData, f = (t * u.sp + u.ph) % 1;
        const h = (0.35 + 0.55 * (1 - f)) * L;
        s.scale.set(h * 0.75, h * 1.25, 1);
        s.position.set(u.x * (1 - f) + (wind ? wind.x * 0.02 * f : 0), 0.25 + f * 0.55 * L, u.z * (1 - f) + (wind ? wind.z * 0.02 * f : 0));
        s.material.opacity = (1 - f) * L;
        s.visible = L > 0.02;
      });
      charM.emissiveIntensity = L * (1.2 + Math.sin(t * 7) * 0.3);
      const arr = embers.geometry.attributes.position.array;
      eData.forEach((e, k) => {
        e.t += dt * e.sp;
        if (e.t > 2) { e.t = 0; e.x = (Math.random() - 0.5) * 0.3; e.z = (Math.random() - 0.5) * 0.3; }
        arr[k * 3] = e.x + e.vx * e.t + Math.sin(t * 3 + k) * 0.05 + (wind ? wind.x * 0.05 * e.t : 0);
        arr[k * 3 + 1] = L > 0.05 ? 0.3 + e.t * 0.9 : -10;
        arr[k * 3 + 2] = e.z + e.vz * e.t + (wind ? wind.z * 0.05 * e.t : 0);
      });
      embers.geometry.attributes.position.needsUpdate = true;
      embers.material.opacity = L;
      smoke.forEach((s) => {
        const u = s.userData; u.t = (u.t + dt) % 4; const f = u.t / 4;
        s.position.set((wind ? wind.x * 0.12 * f * 4 : 0), 0.9 + f * 3.5, (wind ? wind.z * 0.12 * f * 4 : 0));
        s.scale.setScalar(0.4 + f * 1.8);
        s.material.opacity = 0.22 * Math.sin(f * Math.PI) * Math.max(L, 0.25);
      });
    };
    return fire;
  },

  logBench() {
    const g = new THREE.Group();
    const m = this.M(0x6b4a2b, 0.9);
    const log = this.mesh(new THREE.CylinderGeometry(0.16, 0.18, 1.6, 9), m); log.rotation.z = Math.PI / 2; log.position.y = 0.2; g.add(log);
    const ring = this.mesh(new THREE.CircleGeometry(0.16, 9), this.M(0xc9a36b, 0.9)); ring.position.set(0.8, 0.2, 0); ring.rotation.y = Math.PI / 2; g.add(ring);
    return g;
  },

  pot() {
    const g = new THREE.Group();
    const metal = this.M(0x5f6368, 0.35, 0.8);
    const lathe = new THREE.LatheGeometry([new THREE.Vector2(0, 0), new THREE.Vector2(0.16, 0.01), new THREE.Vector2(0.18, 0.05), new THREE.Vector2(0.18, 0.2), new THREE.Vector2(0.19, 0.21)], 14);
    const pot = this.mesh(lathe, metal); g.add(pot);
    const tripM = this.M(0x333333, 0.5, 0.6);
    for (let k = 0; k < 3; k++) {
      const leg = this.mesh(new THREE.CylinderGeometry(0.012, 0.012, 1.1, 4), tripM);
      const a = k / 3 * Math.PI * 2;
      leg.position.set(Math.cos(a) * 0.3, 0.45 - 0.55, Math.sin(a) * 0.3); leg.lookAt(0, 0.6, 0); leg.rotateX(Math.PI / 2);
      g.add(leg);
    }
    return g;
  },

  /* ---------- 标识 ---------- */
  textTexture(lines, w = 256, h = 128, bg = '#d8c49a', fg = '#3a2a16', size = 40) {
    return (() => {
      const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
      const ctx = cv.getContext('2d');
      ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h);
      // 木纹
      for (let k = 0; k < 14; k++) { ctx.strokeStyle = `rgba(90,60,30,${0.08 + Math.random() * 0.08})`; ctx.lineWidth = 1 + Math.random() * 2; ctx.beginPath(); const y = Math.random() * h; ctx.moveTo(0, y); ctx.bezierCurveTo(w * 0.3, y + 6, w * 0.6, y - 6, w, y + 3); ctx.stroke(); }
      ctx.fillStyle = fg; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.font = `bold ${size}px "Microsoft YaHei","PingFang SC","Noto Sans CJK SC",sans-serif`;
      lines.forEach((l, i) => ctx.fillText(l, w / 2, h / 2 + (i - (lines.length - 1) / 2) * size * 1.15));
      const t = new THREE.CanvasTexture(cv); if ('colorSpace' in t) t.colorSpace = THREE.SRGBColorSpace; else t.encoding = THREE.sRGBEncoding;
      t.anisotropy = 4;
      return t;
    })();
  },
  signpost(texts) {
    const g = new THREE.Group();
    const wood = this.M(0x6b4a2b, 0.85);
    const post = this.mesh(new THREE.CylinderGeometry(0.06, 0.07, 2.3, 8), wood); post.position.y = 1.15; g.add(post);
    texts.forEach((t, k) => {
      const tex = this.textTexture([t.text], 256, 64, '#d9c49a', '#3a2a16', 34);
      const boardM = [wood, wood, wood, wood, new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85 }), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85 })];
      const b = this.mesh(new THREE.BoxGeometry(1.0, 0.24, 0.04), boardM);
      b.position.set(0.35, 1.95 - k * 0.32, 0); g.add(b);
      const pivot = new THREE.Group(); pivot.rotation.y = t.angle || 0; pivot.add(b); pivot.position.y = 0; g.add(pivot);
    });
    return g;
  },
  trailMarker() {
    const g = new THREE.Group();
    const pole = new THREE.CylinderGeometry(0.03, 0.035, 1.5, 6); pole.translate(0, 0.75, 0);
    const p = pole.attributes.position, col = new Float32Array(p.count * 3);
    for (let i = 0; i < p.count; i++) { const band = Math.floor(p.getY(i) / 0.25) % 2; const c = band ? [0.9, 0.1, 0.05] : [0.95, 0.95, 0.95]; col[i * 3] = c[0]; col[i * 3 + 1] = c[1]; col[i * 3 + 2] = c[2]; }
    pole.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.add(this.mesh(pole, this.VC(0.6)));
    const cap = this.mesh(new THREE.BoxGeometry(0.1, 0.1, 0.02), this.M(0xffcc33, 0.4, 0, { emissive: 0xffaa00, emissiveIntensity: 0.0 }));
    cap.position.y = 1.42; g.add(cap);
    g.userData.cap = cap;
    return g;
  },
  cairn(rnd, n = 6) {
    const g = new THREE.Group();
    const m = this.VC(0.9, { color: 0x86817a });
    let y = 0;
    for (let k = 0; k < n; k++) {
      const s = 0.42 * (1 - k / (n + 2));
      const st = this.mesh(this.rock(300 + k * 7 + Math.floor(rnd() * 50), 1), m);
      st.scale.set(s, s * 0.55, s * (0.8 + rnd() * 0.3));
      st.position.set((rnd() - 0.5) * 0.06, y + s * 0.4, (rnd() - 0.5) * 0.06); st.rotation.y = rnd() * 6;
      y += s * 0.75;
      g.add(st);
    }
    return g;
  },

  /* ---------- 收集品 ---------- */
  stash(bonus) {
    const g = new THREE.Group();
    const bagC = bonus ? 0x7b3fe4 : 0xf08a24;
    const bag = new THREE.CapsuleGeometry(0.22, 0.45, 6, 12); bag.rotateZ(Math.PI / 2);
    const bm = this.mesh(bag, this.M(bagC, 0.7)); bm.position.set(0, 0.24, 0); g.add(bm);
    const strapM = this.M(0x222222, 0.8);
    for (const x of [-0.18, 0.18]) { const s = this.mesh(new THREE.TorusGeometry(0.235, 0.022, 6, 16), strapM); s.position.set(x, 0.24, 0); s.rotation.y = Math.PI / 2; g.add(s); }
    const tag = this.mesh(new THREE.BoxGeometry(0.12, 0.08, 0.01), this.M(0xffffff, 0.6)); tag.position.set(0, 0.35, 0.22); g.add(tag);
    // 小旗
    const pole = this.mesh(new THREE.CylinderGeometry(0.01, 0.01, 1.2, 4), this.M(0x999999, 0.5, 0.5)); pole.position.set(0.35, 0.6, 0); g.add(pole);
    const flag = this.mesh(new THREE.PlaneGeometry(0.3, 0.18), this.M(bonus ? 0xb388ff : 0xffd21f, 0.8, 0, { side: THREE.DoubleSide })); flag.position.set(0.5, 1.1, 0); g.add(flag);
    return g;
  },
  journal() {
    const g = new THREE.Group();
    const cover = this.mesh(new THREE.BoxGeometry(0.34, 0.06, 0.26), this.M(0x8b1e1e, 0.7)); cover.position.y = 0.05; g.add(cover);
    const pages = this.mesh(new THREE.BoxGeometry(0.32, 0.045, 0.24), this.M(0xf3ead2, 0.9)); pages.position.set(0.01, 0.05, 0); g.add(pages);
    const band = this.mesh(new THREE.BoxGeometry(0.02, 0.065, 0.265), this.M(0x222222, 0.6)); band.position.set(0.1, 0.05, 0); g.add(band);
    const stone = this.mesh(this.rock(44, 1), this.VC(0.9, { color: 0x7d7872 })); stone.scale.set(0.35, 0.18, 0.3); stone.position.y = -0.05; g.add(stone);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: Tex.soft(), color: 0xffe9a8, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity: 0.8 }));
    glow.scale.setScalar(0.9); glow.position.y = 0.25; g.add(glow);
    g.userData.glow = glow;
    return g;
  },
  viewpoint() {
    const g = new THREE.Group();
    const wood = this.M(0x7a5634, 0.85);
    const post = this.mesh(new THREE.CylinderGeometry(0.05, 0.06, 1.3, 8), wood); post.position.y = 0.65; g.add(post);
    const tex = this.textTexture(['📷 观景点'], 256, 96, '#2f5d8a', '#ffffff', 36);
    const sign = this.mesh(new THREE.BoxGeometry(0.62, 0.24, 0.03), [wood, wood, wood, wood, new THREE.MeshStandardMaterial({ map: tex }), new THREE.MeshStandardMaterial({ map: tex })]);
    sign.position.y = 1.25; sign.rotation.x = -0.35; g.add(sign);
    const bench = new THREE.Group();
    const seat = this.mesh(new THREE.BoxGeometry(1.4, 0.06, 0.36), wood); seat.position.y = 0.45; bench.add(seat);
    for (const x of [-0.6, 0.6]) { const l = this.mesh(new THREE.BoxGeometry(0.08, 0.45, 0.3), wood); l.position.set(x, 0.22, 0); bench.add(l); }
    bench.position.set(0, 0, -1.1); g.add(bench);
    return g;
  },
  woodPile(rnd) {
    const g = new THREE.Group();
    const m = this.M(0x6e4424, 0.9), endM = this.M(0xc9a36b, 0.9);
    for (let k = 0; k < 6; k++) {
      const lg = this.mesh(new THREE.CylinderGeometry(0.07, 0.08, 0.9, 7), [m, endM, endM]);
      lg.rotation.z = Math.PI / 2; lg.rotation.y = (rnd() - 0.5) * 0.3;
      const row = k < 3 ? 0 : k < 5 ? 1 : 2;
      lg.position.set(0, 0.08 + row * 0.13, (k - (row === 0 ? 1 : row === 1 ? 3.5 : 5)) * 0.15);
      g.add(lg);
    }
    return g;
  },
  bridge(len) {
    const g = new THREE.Group();
    const wood = this.M(0x8a6a44, 0.9), metal = this.M(0x9aa0a6, 0.4, 0.7);
    for (const z of [-0.8, 0.8]) { const r = this.mesh(new THREE.BoxGeometry(len, 0.08, 0.07), metal); r.position.set(0, 0.04, z); g.add(r); }
    for (let x = -len / 2 + 0.2; x <= len / 2 - 0.1; x += 0.35) { const s = this.mesh(new THREE.BoxGeometry(0.1, 0.05, 1.7), wood); s.position.set(x, 0.07, 0); g.add(s); }
    // 扶手绳
    const ropeM = new THREE.LineBasicMaterial({ color: 0xd06a2a });
    for (const z of [-0.9, 0.9]) {
      for (const x of [-len / 2, len / 2]) { const p = this.mesh(new THREE.CylinderGeometry(0.025, 0.025, 1.1, 5), metal); p.position.set(x, 0.55, z); g.add(p); }
      const pts = [];
      for (let k = 0; k <= 12; k++) { const t = k / 12; pts.push(new THREE.Vector3(-len / 2 + len * t, 1.05 - Math.sin(t * Math.PI) * 0.15, z)); }
      g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), ropeM));
    }
    return g;
  },
  piton() {
    const g = new THREE.Group();
    const metal = this.M(0xc0c6cf, 0.3, 0.9);
    const spike = this.mesh(new THREE.ConeGeometry(0.025, 0.14, 4), metal); spike.rotation.x = -Math.PI / 2; spike.position.z = -0.05; g.add(spike);
    const ring = this.mesh(new THREE.TorusGeometry(0.04, 0.009, 5, 10), this.M(0xe0a030, 0.35, 0.8)); ring.position.set(0, -0.04, 0.03); g.add(ring);
    return g;
  },
  prayerFlags(a, b, sag = 0.6) {
    const g = new THREE.Group();
    const cols = [0x3b7bff, 0xffffff, 0xff3b3b, 0x3bc35b, 0xffd23b];
    const n = Math.max(5, Math.floor(a.distanceTo(b) / 0.45));
    const pts = [];
    for (let k = 0; k <= 20; k++) { const t = k / 20; pts.push(new THREE.Vector3().lerpVectors(a, b, t).setY(lerp(a.y, b.y, t) - Math.sin(t * Math.PI) * sag)); }
    g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0x999999 })));
    const dir = new THREE.Vector3().subVectors(b, a); const ang = Math.atan2(dir.x, dir.z);
    const flags = [];
    for (let k = 1; k < n; k++) {
      const t = k / n;
      const f = this.mesh(new THREE.PlaneGeometry(0.28, 0.3), this.M(cols[k % 5], 0.9, 0, { side: THREE.DoubleSide }), false);
      f.geometry.translate(0, -0.15, 0);
      f.position.lerpVectors(a, b, t).setY(lerp(a.y, b.y, t) - Math.sin(t * Math.PI) * sag);
      f.rotation.y = ang + Math.PI / 2;
      f.userData.ph = k * 0.7;
      g.add(f); flags.push(f);
    }
    g.userData.flags = flags;
    return g;
  },
  flag(color, w = 1.2, h = 0.75) {
    const geo = new THREE.PlaneGeometry(w, h, 10, 4); geo.translate(w / 2, 0, 0);
    const mesh = this.mesh(geo, this.M(color, 0.8, 0, { side: THREE.DoubleSide }));
    return { mesh, base: geo.attributes.position.array.slice(), w };
  },

  /* ---------- 飞鸟 ---------- */
  eagle() {
    const g = new THREE.Group();
    const dark = this.M(0x3a2c20, 0.8), white = this.M(0xeeeeee, 0.7), beak = this.M(0xe8b020, 0.5);
    const body = this.mesh(new THREE.CapsuleGeometry(0.16, 0.5, 4, 8), dark, false); body.rotation.x = Math.PI / 2; g.add(body);
    const head = this.mesh(new THREE.SphereGeometry(0.13, 8, 6), white, false); head.position.set(0, 0.05, 0.42); g.add(head);
    const bk = this.mesh(new THREE.ConeGeometry(0.04, 0.12, 5), beak, false); bk.rotation.x = Math.PI / 2; bk.position.set(0, 0.03, 0.56); g.add(bk);
    const tail = this.mesh(new THREE.ConeGeometry(0.16, 0.35, 4), white, false); tail.rotation.x = -Math.PI / 2; tail.scale.set(1, 1, 0.2); tail.position.set(0, 0, -0.5); g.add(tail);
    const wingG = new THREE.BufferGeometry();
    wingG.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0.25, 1.3, 0, 0.05, 1.1, 0, -0.25, 0, 0, -0.25], 3));
    wingG.setIndex([0, 1, 2, 0, 2, 3]); wingG.computeVertexNormals();
    const wm = this.M(0x33271c, 0.85, 0, { side: THREE.DoubleSide });
    const wl = new THREE.Mesh(wingG, wm), wr = new THREE.Mesh(wingG, wm);
    wr.scale.x = -1; g.add(wl); g.add(wr);
    g.userData.wings = [wl, wr];
    return g;
  },
};
