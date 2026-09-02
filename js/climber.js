/* 登山者角色：分层关节模型 + 程序动画 */
class Climber {
  constructor() {
    this.group = new THREE.Group();       // 根：位于脚底，控制朝向
    this.body = new THREE.Group();        // 身体：控制俯仰（贴壁/躺倒）
    this.group.add(this.body);
    this.t = 0;
    this.yaw = 0;
    this.pitch = 0;
    this.build();
    this.cur = {};
    this.tgt = {};
    for (const k of Object.keys(this.joints)) { this.cur[k] = { x: 0, y: 0, z: 0 }; this.tgt[k] = { x: 0, y: 0, z: 0 }; }
    this.bodyOffset = 0; this.bodyOffsetTgt = 0;
  }

  build() {
    const M = (c, r = 0.7, m = 0) => new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: m });
    const matJacket = M(0xe8552a, 0.75), matJacket2 = M(0xb83f1e, 0.75), matPants = M(0x2a3040, 0.8), matBoot = M(0x2b1d14, 0.7);
    const matSkin = M(0xe3b48f, 0.6), matHelmet = M(0xf4f4f0, 0.4), matPack = M(0x2c5aa0, 0.8), matGlove = M(0x1b1b1f, 0.8);
    const matMetal = M(0x9aa0a6, 0.35, 0.8), matWood = M(0x6b4a2b, 0.8), matGoggle = M(0x1a1c22, 0.2, 0.6);
    const mesh = (g, m) => { const o = new THREE.Mesh(g, m); o.castShadow = true; o.receiveShadow = false; return o; };
    const B = this.body;

    // 骨盆与躯干
    const hips = mesh(new THREE.BoxGeometry(0.34, 0.2, 0.22), matPants); hips.position.y = 0.98; B.add(hips);
    const torso = mesh(new THREE.BoxGeometry(0.42, 0.5, 0.27), matJacket); torso.position.y = 1.32; B.add(torso);
    const chest = mesh(new THREE.BoxGeometry(0.44, 0.22, 0.29), matJacket2); chest.position.y = 1.47; B.add(chest);
    const collar = mesh(new THREE.CylinderGeometry(0.11, 0.13, 0.08, 10), matJacket2); collar.position.y = 1.6; B.add(collar);
    // 背包
    const pack = mesh(new THREE.BoxGeometry(0.34, 0.46, 0.22), matPack); pack.position.set(0, 1.32, -0.25); B.add(pack);
    const roll = mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.36, 10), M(0xd9c26a, 0.8)); roll.rotation.z = Math.PI / 2; roll.position.set(0, 1.6, -0.25); B.add(roll);
    const strapL = mesh(new THREE.BoxGeometry(0.06, 0.4, 0.04), matGlove); strapL.position.set(-0.13, 1.35, 0.14); B.add(strapL);
    const strapR = strapL.clone(); strapR.position.x = 0.13; B.add(strapR);

    // 头部
    const headG = new THREE.Group(); headG.position.set(0, 1.63, 0); B.add(headG);
    const head = mesh(new THREE.SphereGeometry(0.125, 16, 12), matSkin); head.position.y = 0.08; headG.add(head);
    const helmet = mesh(new THREE.SphereGeometry(0.145, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.55), matHelmet); helmet.position.y = 0.1; headG.add(helmet);
    const brim = mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.03, 16), matHelmet); brim.position.y = 0.085; headG.add(brim);
    const goggle = mesh(new THREE.BoxGeometry(0.22, 0.06, 0.06), matGoggle); goggle.position.set(0, 0.1, 0.11); headG.add(goggle);
    const neckWarm = mesh(new THREE.CylinderGeometry(0.1, 0.12, 0.08, 10), matJacket2); neckWarm.position.y = -0.02; headG.add(neckWarm);

    // 手臂
    const makeArm = (side) => {
      const sh = new THREE.Group(); sh.position.set(side * 0.25, 1.5, 0); B.add(sh);
      const shoulderPad = mesh(new THREE.SphereGeometry(0.075, 10, 8), matJacket2); sh.add(shoulderPad);
      const upper = mesh(new THREE.CylinderGeometry(0.06, 0.055, 0.3, 10), matJacket); upper.position.y = -0.16; sh.add(upper);
      const el = new THREE.Group(); el.position.y = -0.31; sh.add(el);
      const lower = mesh(new THREE.CylinderGeometry(0.052, 0.045, 0.28, 10), matJacket); lower.position.y = -0.14; el.add(lower);
      const hand = mesh(new THREE.SphereGeometry(0.06, 10, 8), matGlove); hand.position.y = -0.3; el.add(hand);
      return { sh, el, hand };
    };
    const armL = makeArm(-1), armR = makeArm(1);
    // 冰镐（右手）
    const axe = new THREE.Group();
    const shaft = mesh(new THREE.CylinderGeometry(0.018, 0.02, 0.55, 8), matWood); shaft.position.y = 0.2; axe.add(shaft);
    const axeHead = mesh(new THREE.BoxGeometry(0.18, 0.035, 0.03), matMetal); axeHead.position.y = 0.48; axe.add(axeHead);
    const pick = mesh(new THREE.BoxGeometry(0.06, 0.03, 0.025), matMetal); pick.position.set(0.11, 0.46, 0); pick.rotation.z = -0.5; axe.add(pick);
    axe.rotation.z = -0.15; axe.rotation.x = 0.2;
    armR.hand.add(axe);

    // 腿
    const makeLeg = (side) => {
      const hip = new THREE.Group(); hip.position.set(side * 0.11, 0.98, 0); B.add(hip);
      const thigh = mesh(new THREE.CylinderGeometry(0.085, 0.075, 0.45, 10), matPants); thigh.position.y = -0.225; hip.add(thigh);
      const knee = new THREE.Group(); knee.position.y = -0.45; hip.add(knee);
      const kneePad = mesh(new THREE.SphereGeometry(0.075, 8, 8), matPants); knee.add(kneePad);
      const shin = mesh(new THREE.CylinderGeometry(0.07, 0.065, 0.42, 10), matPants); shin.position.y = -0.21; knee.add(shin);
      const gaiter = mesh(new THREE.CylinderGeometry(0.075, 0.08, 0.16, 10), matJacket2); gaiter.position.y = -0.36; knee.add(gaiter);
      const boot = mesh(new THREE.BoxGeometry(0.14, 0.11, 0.27), matBoot); boot.position.set(0, -0.47, 0.04); knee.add(boot);
      return { hip, knee };
    };
    const legL = makeLeg(-1), legR = makeLeg(1);

    this.joints = { shL: armL.sh, shR: armR.sh, elL: armL.el, elR: armR.el, hipL: legL.hip, hipR: legR.hip, kneeL: legL.knee, kneeR: legR.knee, head: headG };
    this.headG = headG;
  }

  setT(k, x, y = 0, z = 0) { const t = this.tgt[k]; t.x = x; t.y = y; t.z = z; }

  /* 根据玩家状态更新姿态 */
  update(dt, player) {
    this.t += dt;
    const t = this.t, p = player;
    const mode = p.mode;
    const spd = p.speed;
    const slopeRad = p.slope * Math.PI / 180;
    const ph = p.phase;
    let pitchTgt = 0, offY = 0;
    const s = Math.sin, c = Math.cos;
    const breathe = s(t * 2.2) * 0.02;

    if (mode === 'walk') {
      const run = p.sprinting;
      const A = clamp(spd / 3.2, 0, 1.4) * (run ? 0.75 : 0.55);
      if (spd > 0.2) {
        this.setT('hipL', -A * s(ph), 0, 0); this.setT('hipR', -A * s(ph + Math.PI), 0, 0);
        this.setT('kneeL', A * 1.3 * Math.max(0, s(ph - 0.9)), 0, 0); this.setT('kneeR', A * 1.3 * Math.max(0, s(ph + Math.PI - 0.9)), 0, 0);
        this.setT('shL', A * 0.9 * s(ph), 0, 0.12); this.setT('shR', -A * 0.9 * s(ph), 0, -0.12);
        this.setT('elL', -0.45 - (run ? 0.5 : 0), 0, 0); this.setT('elR', -0.45 - (run ? 0.5 : 0), 0, 0);
        this.setT('head', 0.05, 0, 0);
        pitchTgt = 0.08 + (run ? 0.12 : 0) + Math.max(0, p.uphillDot) * slopeRad * 0.35;
        offY = Math.abs(s(ph)) * 0.035;
      } else {
        this.setT('hipL', 0, 0, 0.02); this.setT('hipR', 0, 0, -0.02);
        this.setT('kneeL', 0.05, 0, 0); this.setT('kneeR', 0.05, 0, 0);
        this.setT('shL', 0.1 + breathe, 0, 0.14); this.setT('shR', 0.1 + breathe, 0, -0.14);
        this.setT('elL', -0.35, 0, 0); this.setT('elR', -0.35, 0, 0);
        this.setT('head', -0.05 + s(t * 0.7) * 0.05, s(t * 0.5) * 0.15, 0);
        pitchTgt = 0.03 + breathe;
      }
    } else if (mode === 'climb') {
      const moving = spd > 0.15;
      const cp = ph;
      this.setT('shL', -2.55 + 0.4 * s(cp), 0, 0.42); this.setT('shR', -2.55 + 0.4 * s(cp + Math.PI), 0, -0.42);
      this.setT('elL', -0.35 - 0.3 * Math.max(0, s(cp)), 0, -0.1); this.setT('elR', -0.35 - 0.3 * Math.max(0, s(cp + Math.PI)), 0, 0.1);
      this.setT('hipL', -0.95 + 0.4 * s(cp + Math.PI), 0, 0.28); this.setT('hipR', -0.95 + 0.4 * s(cp), 0, -0.28);
      this.setT('kneeL', 1.35 - 0.3 * s(cp + Math.PI), 0, 0); this.setT('kneeR', 1.35 - 0.3 * s(cp), 0, 0);
      this.setT('head', -0.45, 0, 0);
      pitchTgt = slopeRad * 0.78 + (moving ? 0 : breathe * 0.5);
      offY = 0.02;
    } else if (mode === 'slide') {
      this.setT('shL', -2.3, 0, 0.6); this.setT('shR', -2.3, 0, -0.6);
      this.setT('elL', -0.5 - s(t * 9) * 0.3, 0, 0); this.setT('elR', -0.5 + s(t * 9) * 0.3, 0, 0);
      this.setT('hipL', -0.2, 0, 0.35); this.setT('hipR', -0.2, 0, -0.35);
      this.setT('kneeL', 0.3, 0, 0); this.setT('kneeR', 0.3, 0, 0);
      this.setT('head', -0.6, s(t * 7) * 0.2, 0);
      pitchTgt = slopeRad; // 贴着坡面俯卧
      offY = 0;
    } else if (mode === 'air') {
      this.setT('shL', -1.9 + s(t * 9) * 0.4, 0, 0.7); this.setT('shR', -1.9 - s(t * 9) * 0.4, 0, -0.7);
      this.setT('elL', -0.6, 0, 0); this.setT('elR', -0.6, 0, 0);
      this.setT('hipL', -0.6 + s(t * 7) * 0.2, 0, 0.2); this.setT('hipR', -0.5 - s(t * 7) * 0.2, 0, -0.2);
      this.setT('kneeL', 0.9, 0, 0); this.setT('kneeR', 0.9, 0, 0);
      this.setT('head', -0.2, 0, 0);
      pitchTgt = 0.25;
    } else { // dead
      this.setT('shL', 0.3, 0, 1.3); this.setT('shR', 0.3, 0, -1.3);
      this.setT('elL', -0.2, 0, 0); this.setT('elR', -0.2, 0, 0);
      this.setT('hipL', 0.1, 0, 0.25); this.setT('hipR', 0.1, 0, -0.25);
      this.setT('kneeL', 0.1, 0, 0); this.setT('kneeR', 0.1, 0, 0);
      this.setT('head', 0.5, 0.4, 0);
      pitchTgt = -Math.PI / 2 + slopeRad * 0.3;
      offY = 0.1;
    }
    // 沿地面法线抬起，避免身体陷入坡面
    const liftTgt = mode === 'slide' ? 0.24 : mode === 'dead' ? 0.2 : mode === 'climb' ? 0.1 : 0;
    this.lift = (this.lift || 0) + (liftTgt - (this.lift || 0)) * (1 - Math.exp(-dt * 8));

    // 关节插值
    const rate = 1 - Math.exp(-dt * (mode === 'walk' ? 16 : 9));
    for (const k in this.joints) {
      const cu = this.cur[k], tg = this.tgt[k];
      cu.x += (tg.x - cu.x) * rate; cu.y += (tg.y - cu.y) * rate; cu.z += (tg.z - cu.z) * rate;
      this.joints[k].rotation.set(cu.x, cu.y, cu.z);
    }
    this.pitch += (pitchTgt - this.pitch) * (1 - Math.exp(-dt * 7));
    this.body.rotation.x = this.pitch;
    this.bodyOffset += (offY - this.bodyOffset) * (1 - Math.exp(-dt * 10));
    this.body.position.y = this.bodyOffset;

    // 朝向
    const f = p.facing;
    if (f.lengthSq() > 1e-4) {
      const targetYaw = Math.atan2(f.x, f.z);
      let d = targetYaw - this.yaw;
      while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2;
      this.yaw += d * (1 - Math.exp(-dt * (mode === 'walk' ? 12 : 6)));
    }
    this.group.rotation.set(0, this.yaw, 0);
    this.group.position.copy(p.pos).addScaledVector(p.normal, this.lift);
  }
}
