/* 登山者：分层关节模型 + 程序动画 + 双骨 IK（攀岩时手脚落在岩点上） */
const JACKET_COLORS = [
  { name: '烈焰橙', c: 0xe8552a, a: 0x2a2f3a },
  { name: '冰川蓝', c: 0x2f8fde, a: 0x1f2a3a },
  { name: '松林绿', c: 0x2f9e5a, a: 0x243028 },
  { name: '向日黄', c: 0xf2b134, a: 0x2e2a24 },
  { name: '极光紫', c: 0x7b5cf0, a: 0x24223a },
];

class Climber {
  constructor(colorIdx = 0) {
    this.group = new THREE.Group();
    this.body = new THREE.Group();
    this.group.add(this.body);
    this.t = 0; this.yaw = 0; this.pitch = 0; this.roll = 0; this.lift = 0; this.lower = 0;
    this.L = { upperArm: 0.28, foreArm: 0.27, thigh: 0.44, shin: 0.44 };
    this.build(JACKET_COLORS[colorIdx % JACKET_COLORS.length]);
    this.cur = {}; this.tgt = {};
    for (const k of Object.keys(this.joints)) { this.cur[k] = new THREE.Vector3(); this.tgt[k] = new THREE.Vector3(); }
    this.ikW = 0;
    this._v = [0, 1, 2, 3, 4, 5, 6, 7].map(() => new THREE.Vector3());
    this._q = new THREE.Quaternion(); this._q2 = new THREE.Quaternion(); this._m = new THREE.Matrix4();
  }

  build(scheme) {
    const M = (c, r = 0.75, m = 0) => new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: m });
    const jacket = this.jacketMat = M(scheme.c, 0.7), accent = M(scheme.a, 0.75), pants = M(0x2b3140, 0.85), pants2 = M(0x3a4254, 0.85);
    const boot = M(0x3b2a1e, 0.7), sole = M(0x151515, 0.9), skin = M(0xe0b08c, 0.6), helmetM = M(0xf2f2ee, 0.35), glove = M(0x1d1f24, 0.8);
    const metal = M(0xb8bec6, 0.3, 0.9), wood = M(0x6b4a2b, 0.7), packM = M(0x31405a, 0.8), packM2 = M(0x22304a, 0.8), rope = M(0xe07b2a, 0.8), pad = M(0x3a9bd9, 0.7), buff = M(0x1f8a8a, 0.8), lens = M(0xff9a1f, 0.15, 0.6);
    const add = (parent, geo, mat, x = 0, y = 0, z = 0) => { const o = new THREE.Mesh(geo, mat); o.position.set(x, y, z); o.castShadow = true; parent.add(o); return o; };
    const B = this.body;
    // 骨盆
    const hips = this.hips = new THREE.Group(); hips.position.y = 0.95; B.add(hips);
    const pel = add(hips, new THREE.CapsuleGeometry(0.13, 0.12, 4, 10), pants); pel.rotation.z = Math.PI / 2; pel.scale.set(1, 1, 0.85);
    const belt = add(hips, new THREE.TorusGeometry(0.155, 0.022, 6, 18), accent, 0, 0.06, 0); belt.rotation.x = Math.PI / 2; belt.scale.set(1.05, 0.8, 1);
    add(hips, new THREE.BoxGeometry(0.06, 0.05, 0.03), metal, 0, 0.06, 0.13);
    for (const x of [-0.12, 0.12]) { const cb = add(hips, new THREE.TorusGeometry(0.025, 0.006, 4, 10), metal, x, -0.0, 0.1); cb.rotation.y = 0.4; }
    // 躯干
    const spine = this.spine = new THREE.Group(); spine.position.y = 0.08; hips.add(spine);
    const torso = add(spine, new THREE.CapsuleGeometry(0.155, 0.26, 6, 14), jacket, 0, 0.22, 0); torso.scale.set(1.18, 1, 0.8);
    add(spine, new THREE.CylinderGeometry(0.19, 0.185, 0.07, 16), accent, 0, 0.02, 0).scale.set(1, 1, 0.78);
    const yoke = add(spine, new THREE.CapsuleGeometry(0.162, 0.06, 4, 14), accent, 0, 0.37, 0); yoke.scale.set(1.2, 1, 0.83);
    add(spine, new THREE.BoxGeometry(0.012, 0.36, 0.01), M(0x111111, 0.4, 0.5), 0, 0.22, 0.128);
    for (const x of [-0.08, 0.08]) add(spine, new THREE.BoxGeometry(0.08, 0.09, 0.02), accent, x, 0.16, 0.12);
    const chest = this.chest = new THREE.Group(); chest.position.y = 0.3; spine.add(chest);
    // 兜帽与领口
    const hood = add(chest, new THREE.TorusGeometry(0.1, 0.045, 6, 14, Math.PI), jacket, 0, 0.16, -0.05); hood.rotation.set(-0.3, 0, Math.PI); hood.scale.set(1, 1, 0.9);
    add(chest, new THREE.CylinderGeometry(0.085, 0.1, 0.1, 12), buff, 0, 0.19, 0);
    // 头部
    const head = this.head = new THREE.Group(); head.position.y = 0.23; chest.add(head);
    const face = add(head, new THREE.SphereGeometry(0.105, 16, 12), skin, 0, 0.1, 0); face.scale.set(0.92, 1.05, 1);
    add(head, new THREE.CylinderGeometry(0.098, 0.09, 0.09, 14), buff, 0, 0.045, 0.004);
    add(head, new THREE.SphereGeometry(0.018, 6, 5), skin, 0, 0.1, 0.1);
    for (const x of [-0.038, 0.038]) add(head, new THREE.SphereGeometry(0.012, 6, 5), M(0x1a1a1a, 0.3), x, 0.125, 0.092);
    const helmet = add(head, new THREE.SphereGeometry(0.128, 18, 10, 0, Math.PI * 2, 0, Math.PI * 0.52), helmetM, 0, 0.13, -0.005); helmet.scale.set(1, 0.95, 1.08);
    add(head, new THREE.TorusGeometry(0.125, 0.008, 5, 24), accent, 0, 0.13, -0.005).rotation.x = Math.PI / 2;
    for (let k = -1; k <= 1; k++) add(head, new THREE.BoxGeometry(0.02, 0.01, 0.07), accent, k * 0.04, 0.255, -0.01);
    // 护目镜（推在头盔上）
    const gog = add(head, new THREE.CapsuleGeometry(0.035, 0.1, 4, 8), lens, 0, 0.2, 0.1); gog.rotation.z = Math.PI / 2; gog.rotation.y = 0; gog.scale.set(1, 1, 0.6);
    // 头灯
    const lamp = add(head, new THREE.BoxGeometry(0.05, 0.035, 0.03), M(0x333333, 0.5), 0, 0.16, 0.128);
    this.lampLens = add(head, new THREE.CircleGeometry(0.013, 10), new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff2cc, emissiveIntensity: 0 }), 0, 0.16, 0.144);
    this.lampAnchor = new THREE.Object3D(); this.lampAnchor.position.set(0, 0.16, 0.16); head.add(this.lampAnchor);
    // 背包
    const pack = this.pack = new THREE.Group(); pack.position.set(0, 0.22, -0.2); spine.add(pack);
    const pb = add(pack, new THREE.CapsuleGeometry(0.14, 0.3, 6, 12), packM, 0, 0, 0); pb.scale.set(1.45, 1, 0.85);
    const lid = add(pack, new THREE.CapsuleGeometry(0.09, 0.2, 4, 10), packM2, 0, 0.26, 0.01); lid.rotation.z = Math.PI / 2; lid.scale.set(1, 1, 0.8);
    for (const x of [-0.12, 0.12]) add(pack, new THREE.BoxGeometry(0.03, 0.4, 0.01), accent, x, 0.02, -0.12);
    const padRoll = add(pack, new THREE.CylinderGeometry(0.075, 0.075, 0.46, 12), pad, 0, -0.26, -0.02); padRoll.rotation.z = Math.PI / 2;
    const coil = add(pack, new THREE.TorusGeometry(0.1, 0.024, 6, 18), rope, 0, 0.33, -0.02); coil.rotation.x = Math.PI / 2; coil.scale.set(1.3, 1, 1);
    for (const x of [-0.13, 0.13]) { const s = add(spine, new THREE.BoxGeometry(0.05, 0.36, 0.02), accent, x, 0.28, 0.12); s.rotation.x = -0.12; }
    // 冰镐（背上 / 手中）
    const makeAxe = () => {
      const a = new THREE.Group();
      add(a, new THREE.CylinderGeometry(0.014, 0.017, 0.55, 8), wood, 0, 0.22, 0);
      add(a, new THREE.BoxGeometry(0.2, 0.03, 0.025), metal, 0.01, 0.5, 0);
      const pk = add(a, new THREE.BoxGeometry(0.08, 0.025, 0.02), metal, 0.12, 0.48, 0); pk.rotation.z = -0.5;
      add(a, new THREE.ConeGeometry(0.014, 0.05, 6), metal, 0, -0.07, 0).rotation.x = Math.PI;
      return a;
    };
    this.axeBack = makeAxe(); this.axeBack.position.set(0.08, -0.05, -0.15); this.axeBack.rotation.set(0, 0, 0.25); pack.add(this.axeBack);
    // 手臂
    const makeArm = (side) => {
      const sh = new THREE.Group(); sh.position.set(side * 0.215, 0.12, 0); chest.add(sh);
      add(sh, new THREE.SphereGeometry(0.068, 10, 8), jacket);
      add(sh, new THREE.CapsuleGeometry(0.056, 0.17, 4, 10), jacket, 0, -0.14, 0);
      const el = new THREE.Group(); el.position.y = -this.L.upperArm; sh.add(el);
      add(el, new THREE.CapsuleGeometry(0.05, 0.16, 4, 10), jacket, 0, -0.12, 0);
      add(el, new THREE.CylinderGeometry(0.052, 0.05, 0.05, 10), accent, 0, -0.22, 0);
      const hand = new THREE.Group(); hand.position.y = -this.L.foreArm; el.add(hand);
      const palm = add(hand, new THREE.BoxGeometry(0.075, 0.09, 0.04), glove, 0, -0.03, 0.005);
      add(hand, new THREE.CapsuleGeometry(0.018, 0.035, 3, 6), glove, side * -0.042, -0.02, 0.02).rotation.z = side * 0.6;
      add(hand, new THREE.BoxGeometry(0.07, 0.04, 0.035), glove, 0, -0.085, 0.012).rotation.x = 0.4;
      return { sh, el, hand };
    };
    const aL = makeArm(-1), aR = makeArm(1);
    this.axeHand = makeAxe(); this.axeHand.position.set(0, -0.04, 0.02); this.axeHand.rotation.set(Math.PI / 2 + 0.3, 0, 0); aR.hand.add(this.axeHand);
    this.axeHand.visible = false;
    // 腿
    const makeLeg = (side) => {
      const hip = new THREE.Group(); hip.position.set(side * 0.095, -0.03, 0); hips.add(hip);
      add(hip, new THREE.CapsuleGeometry(0.078, 0.3, 4, 10), pants, 0, -0.21, 0);
      add(hip, new THREE.BoxGeometry(0.06, 0.1, 0.02), pants2, side * 0.075, -0.2, 0.01);
      const knee = new THREE.Group(); knee.position.y = -this.L.thigh; hip.add(knee);
      add(knee, new THREE.SphereGeometry(0.07, 8, 6), pants2, 0, 0, 0.02);
      add(knee, new THREE.CapsuleGeometry(0.062, 0.28, 4, 10), pants, 0, -0.2, 0);
      add(knee, new THREE.CylinderGeometry(0.07, 0.078, 0.14, 10), accent, 0, -0.34, 0);
      const ankle = new THREE.Group(); ankle.position.y = -this.L.shin; knee.add(ankle);
      add(ankle, new THREE.CylinderGeometry(0.065, 0.07, 0.12, 10), boot, 0, 0.0, 0);
      const bt = add(ankle, new THREE.CapsuleGeometry(0.058, 0.14, 4, 10), boot, 0, -0.04, 0.05); bt.rotation.x = Math.PI / 2;
      add(ankle, new THREE.BoxGeometry(0.12, 0.03, 0.29), sole, 0, -0.085, 0.05);
      add(ankle, new THREE.BoxGeometry(0.1, 0.01, 0.06), M(0xd04020, 0.6), 0, 0.02, 0.09);
      return { hip, knee, ankle };
    };
    const lL = makeLeg(-1), lR = makeLeg(1);
    this.limbs = { armL: aL, armR: aR, legL: lL, legR: lR };
    this.joints = { shL: aL.sh, shR: aR.sh, elL: aL.el, elR: aR.el, hipL: lL.hip, hipR: lR.hip, kneeL: lL.knee, kneeR: lR.knee, ankL: lL.ankle, ankR: lR.ankle, head: head, spine: spine, hand: aR.hand };
  }

  setColor(idx) { this.jacketMat.color.set(JACKET_COLORS[idx % JACKET_COLORS.length].c); }
  setLamp(on) { this.lampLens.material.emissiveIntensity = on ? 4 : 0; }
  S(k, x, y = 0, z = 0) { this.tgt[k].set(x, y, z); }

  /* 双骨 IK */
  ik2(root, mid, target, pole, l1, l2, sign, w) {
    if (w <= 0.001) return;
    const v = this._v;
    const rp = v[0].setFromMatrixPosition(root.matrixWorld);
    const d = v[1].subVectors(target, rp);
    let dist = d.length();
    const maxL = (l1 + l2) * 0.999;
    dist = clamp(dist, 0.05, maxL);
    const dirT = d.normalize();
    const cosA = clamp((l1 * l1 + dist * dist - l2 * l2) / (2 * l1 * dist), -1, 1), sinA = Math.sqrt(1 - cosA * cosA);
    const bend = v[2].subVectors(pole, rp); bend.addScaledVector(dirT, -bend.dot(dirT));
    if (bend.lengthSq() < 1e-6) bend.set(0, 0, 1).addScaledVector(dirT, -dirT.z);
    bend.normalize();
    const elbow = v[3].copy(rp).addScaledVector(dirT, cosA * l1).addScaledVector(bend, sinA * l1);
    const upper = v[4].subVectors(elbow, rp).normalize();
    const tgt = v[5].copy(rp).addScaledVector(dirT, dist);
    const lower = v[6].subVectors(tgt, elbow).normalize();
    const Y = v[7].copy(upper).negate();
    const Z = v[5].copy(lower).addScaledVector(upper, -lower.dot(upper));
    if (Z.lengthSq() < 1e-6) Z.copy(bend).multiplyScalar(sign > 0 ? 1 : -1);
    Z.normalize(); if (sign > 0) Z.negate();
    const X = v[3].crossVectors(Y, Z).normalize();
    this._m.makeBasis(X, Y, Z);
    const qW = this._q.setFromRotationMatrix(this._m);
    root.parent.getWorldQuaternion(this._q2);
    qW.premultiply(this._q2.invert());
    root.quaternion.slerp(qW, w);
    const ang = Math.acos(clamp(upper.dot(lower), -1, 1));
    this._q2.setFromAxisAngle(v[0].set(1, 0, 0), sign > 0 ? ang : -ang);
    mid.quaternion.slerp(this._q2, w);
  }

  update(dt, p, camYaw) {
    this.t += dt;
    const t = this.t, mode = p.animMode || p.mode, spd = p.speed;
    const s = Math.sin;
    const slopeRad = p.slope * DEG;
    const ph = p.phase;
    const tired = 1 - clamp(p.stamina / Math.max(1, p.maxStamina), 0, 1);
    const breathe = s(t * (2.2 + tired * 3)) * (0.02 + tired * 0.03);
    let pitchTgt = 0, offY = 0, liftTgt = 0, rollTgt = 0, lowerTgt = 0, ikTgt = 0;
    this.axeHand.visible = !!p.axeOut; this.axeBack.visible = !p.axeOut;
    this.group.visible = mode !== 'sleep';

    if (mode === 'walk' || mode === 'scramble') {
      if (mode === 'walk' && spd > 0.2) {
        const run = p.sprinting;
        const A = clamp(spd / 3.3, 0, 1.4) * (run ? 0.8 : 0.55);
        this.S('hipL', -A * s(ph)); this.S('hipR', -A * s(ph + Math.PI));
        this.S('kneeL', A * 1.4 * Math.max(0, s(ph - 0.9)) + 0.08); this.S('kneeR', A * 1.4 * Math.max(0, s(ph + Math.PI - 0.9)) + 0.08);
        this.S('ankL', -0.1); this.S('ankR', -0.1);
        this.S('shL', A * 0.9 * s(ph), 0, 0.1); this.S('shR', -A * 0.9 * s(ph), 0, -0.1);
        this.S('elL', -0.35 - (run ? 0.7 : 0.15)); this.S('elR', -0.35 - (run ? 0.7 : 0.15));
        this.S('head', 0.08 - (run ? 0.1 : 0), 0, 0); this.S('spine', 0.05 + (run ? 0.12 : 0) + tired * 0.15, s(ph) * 0.08, 0);
        pitchTgt = Math.max(0, p.uphillDot) * slopeRad * 0.4 + tired * 0.1;
        offY = Math.abs(s(ph)) * 0.035 - 0.01;
      } else if (mode === 'scramble') {
        const cp = ph;
        this.S('shL', -1.9 + 0.5 * s(cp), 0, 0.35); this.S('shR', -1.9 + 0.5 * s(cp + Math.PI), 0, -0.35);
        this.S('elL', -0.5 - 0.3 * Math.max(0, s(cp))); this.S('elR', -0.5 - 0.3 * Math.max(0, s(cp + Math.PI)));
        this.S('hipL', -0.9 + 0.45 * s(cp + Math.PI), 0, 0.15); this.S('hipR', -0.9 + 0.45 * s(cp), 0, -0.15);
        this.S('kneeL', 1.2 - 0.35 * s(cp + Math.PI)); this.S('kneeR', 1.2 - 0.35 * s(cp));
        this.S('ankL', 0.3); this.S('ankR', 0.3);
        this.S('head', -0.4); this.S('spine', 0.2);
        pitchTgt = slopeRad * 0.75; liftTgt = 0.12; offY = 0;
      } else {
        // 站立 & 呼吸
        this.S('hipL', 0, 0, 0.03); this.S('hipR', 0, 0, -0.03);
        this.S('kneeL', 0.06 + tired * 0.2); this.S('kneeR', 0.06 + tired * 0.2);
        this.S('ankL', -0.03); this.S('ankR', -0.03);
        this.S('shL', 0.08 + breathe, 0, 0.14); this.S('shR', 0.08 + breathe, 0, -0.14);
        this.S('elL', -0.3); this.S('elR', -0.3);
        this.S('head', -0.05 + s(t * 0.7) * 0.05, clamp(wrapAngle(camYaw + Math.PI - this.yaw) * 0.4, -0.7, 0.7), 0);
        this.S('spine', breathe * 0.8 + tired * 0.3);
        pitchTgt = tired * 0.12;
        offY = -tired * 0.04;
      }
    } else if (mode === 'slide') {
      this.S('shL', -2.4, 0, 0.5); this.S('shR', -2.6, 0, -0.3);
      this.S('elL', -0.4 - s(t * 9) * 0.3); this.S('elR', -0.6);
      this.S('hipL', -0.1, 0, 0.3); this.S('hipR', -0.25, 0, -0.3);
      this.S('kneeL', 0.4); this.S('kneeR', 0.6); this.S('ankL', 0.6); this.S('ankR', 0.6);
      this.S('head', -0.5, s(t * 7) * 0.2); this.S('spine', 0);
      pitchTgt = slopeRad + (p.braking ? 0.1 : 0.25); liftTgt = 0.22;
    } else if (mode === 'air') {
      this.S('shL', -1.8 + s(t * 9) * 0.4, 0, 0.7); this.S('shR', -1.8 - s(t * 9) * 0.4, 0, -0.7);
      this.S('elL', -0.6); this.S('elR', -0.6);
      this.S('hipL', -0.7 + s(t * 7) * 0.2, 0, 0.15); this.S('hipR', -0.4 - s(t * 7) * 0.2, 0, -0.15);
      this.S('kneeL', 1.0); this.S('kneeR', 0.7); this.S('ankL', 0.2); this.S('ankR', 0.2);
      this.S('head', -0.2); this.S('spine', 0.1);
      pitchTgt = 0.2;
    } else if (mode === 'wall' || mode === 'mantle') {
      // FK 基础姿态 + IK
      this.S('shL', -2.6, 0, 0.3); this.S('shR', -2.6, 0, -0.3);
      this.S('elL', -0.4); this.S('elR', -0.4);
      this.S('hipL', -0.7, 0, 0.35); this.S('hipR', -0.7, 0, -0.35);
      this.S('kneeL', 1.3); this.S('kneeR', 1.3); this.S('ankL', 0.4); this.S('ankR', 0.4);
      this.S('head', mode === 'mantle' ? 0.3 : -0.35 - (p.lookUp || 0) * 0.3); this.S('spine', mode === 'mantle' ? 0.6 : 0.1);
      pitchTgt = p.wallLean || 0; ikTgt = mode === 'wall' ? 1 : 0.6;
      if (mode === 'mantle') { this.S('shL', -0.6, 0, 0.3); this.S('shR', -0.6, 0, -0.3); this.S('elL', -0.2); this.S('elR', -0.2); this.S('hipL', -1.4); this.S('kneeL', 2.0); pitchTgt = 0.4; }
    } else if (mode === 'rope') {
      this.S('shL', -2.9, 0, 0.1); this.S('shR', -2.9, 0, -0.1);
      this.S('elL', -0.3); this.S('elR', -0.3);
      this.S('hipL', -0.5 + s(t * 1.3) * 0.1, 0, 0.15); this.S('hipR', -0.3, 0, -0.15);
      this.S('kneeL', 0.7); this.S('kneeR', 0.5); this.S('ankL', 0.3); this.S('ankR', 0.3);
      this.S('head', -0.4); this.S('spine', 0.05);
      pitchTgt = -0.15 + s(t * 0.9) * 0.05; rollTgt = s(t * 0.7) * 0.06;
    } else if (mode === 'sit' || mode === 'camp') {
      this.S('hipL', -1.45, 0, 0.12); this.S('hipR', -1.45, 0, -0.12);
      this.S('kneeL', 1.7); this.S('kneeR', 1.6); this.S('ankL', -0.1); this.S('ankR', -0.1);
      const warm = p.warmingHands ? 1 : 0;
      this.S('shL', -0.9 - warm * 0.4, 0, 0.1); this.S('shR', -0.9 - warm * 0.4, 0, -0.1);
      this.S('elL', -0.9 - warm * 0.5, 0, 0); this.S('elR', -0.9 - warm * 0.5);
      this.S('head', p.stargazing ? -0.9 : 0.1 + s(t * 0.5) * 0.05, s(t * 0.3) * 0.2); this.S('spine', p.stargazing ? -0.35 : 0.18 + breathe);
      lowerTgt = 0.55; pitchTgt = 0;
    } else if (mode === 'kneel') {
      this.S('hipL', -1.5, 0, 0.1); this.S('hipR', 0.1, 0, -0.1);
      this.S('kneeL', 1.6); this.S('kneeR', 1.7); this.S('ankL', 0.2); this.S('ankR', 0.5);
      this.S('shL', -1.2 + s(t * 8) * 0.3, 0, 0.2); this.S('shR', -1.1 - s(t * 8) * 0.3, 0, -0.2);
      this.S('elL', -0.5); this.S('elR', -0.5); this.S('head', 0.5); this.S('spine', 0.5);
      lowerTgt = 0.42;
    } else if (mode === 'cheer') {
      this.S('shL', -2.9 + s(t * 6) * 0.15, 0, 0.35); this.S('shR', -3.0 - s(t * 6) * 0.15, 0, -0.35);
      this.S('elL', -0.2); this.S('elR', -0.2);
      this.S('hipL', 0, 0, 0.1); this.S('hipR', 0, 0, -0.1); this.S('kneeL', 0.05); this.S('kneeR', 0.05); this.S('ankL', 0); this.S('ankR', 0);
      this.S('head', -0.35); this.S('spine', -0.1);
      offY = Math.abs(s(t * 5)) * 0.06;
    } else if (mode === 'use') {
      this.S('shL', 0.1, 0, 0.12); this.S('shR', -1.9, 0, 0.3); this.S('elL', -0.3); this.S('elR', -1.9);
      this.S('hipL', 0, 0, 0.03); this.S('hipR', 0, 0, -0.03); this.S('kneeL', 0.05); this.S('kneeR', 0.05); this.S('ankL', 0); this.S('ankR', 0);
      this.S('head', -0.25); this.S('spine', 0);
    } else { // dead / 倒地
      this.S('shL', 0.3, 0, 1.3); this.S('shR', 0.3, 0, -1.3); this.S('elL', -0.2); this.S('elR', -0.2);
      this.S('hipL', 0.1, 0, 0.25); this.S('hipR', 0.1, 0, -0.25); this.S('kneeL', 0.1); this.S('kneeR', 0.1); this.S('ankL', 0); this.S('ankR', 0);
      this.S('head', 0.5, 0.4); this.S('spine', 0);
      pitchTgt = -Math.PI / 2 + slopeRad * 0.3; liftTgt = 0.2;
    }
    this.lift = damp(this.lift, liftTgt, 8, dt);
    this.lower = damp(this.lower, lowerTgt, 6, dt);
    this.ikW = damp(this.ikW, ikTgt, 12, dt);
    const rate = mode === 'walk' ? 16 : mode === 'wall' ? 14 : 9;
    for (const k in this.joints) {
      const cu = this.cur[k], tg = this.tgt[k];
      cu.x = damp(cu.x, tg.x, rate, dt); cu.y = damp(cu.y, tg.y, rate, dt); cu.z = damp(cu.z, tg.z, rate, dt);
      this.joints[k].rotation.set(cu.x, cu.y, cu.z);
    }
    this.pitch = damp(this.pitch, pitchTgt, 7, dt);
    this.roll = damp(this.roll, rollTgt, 4, dt);
    this.body.rotation.set(this.pitch, 0, this.roll);
    this.body.position.y = offY - this.lower;
    // 朝向
    const f = p.facing;
    if (f.lengthSq() > 1e-4) {
      const ty = Math.atan2(f.x, f.z);
      this.yaw += wrapAngle(ty - this.yaw) * (1 - Math.exp(-dt * (mode === 'walk' ? 12 : 8)));
    }
    this.group.rotation.set(0, this.yaw, 0);
    this.group.position.copy(p.pos).addScaledVector(p.normal, this.lift);
    // IK
    if (this.ikW > 0.01 && p.pose) {
      this.group.updateMatrixWorld(true);
      const P = p.pose, Lm = this.limbs, L = this.L;
      this.ik2(Lm.armL.sh, Lm.armL.el, P.handL, P.poleL, L.upperArm, L.foreArm + 0.05, -1, this.ikW);
      this.ik2(Lm.armR.sh, Lm.armR.el, P.handR, P.poleR, L.upperArm, L.foreArm + 0.05, -1, this.ikW);
      this.ik2(Lm.legL.hip, Lm.legL.knee, P.footL, P.kneePoleL, L.thigh, L.shin + 0.06, 1, this.ikW);
      this.ik2(Lm.legR.hip, Lm.legR.knee, P.footR, P.kneePoleR, L.thigh, L.shin + 0.06, 1, this.ikW);
    }
  }
}
