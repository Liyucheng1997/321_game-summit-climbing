/* 存档：设置、章节进度、成就、日志收集、相册与中途存档（localStorage） */
const Save = {
  KEY: 'summit2_save_v1',
  data: null,
  defaults() {
    return {
      settings: { quality: 'medium', shadows: true, fov: 62, sens: 1, invertY: false, master: 0.8, music: 0.5, sfx: 0.8, jacket: 0, difficulty: 'normal', showTips: true, fullscreen: false },
      progress: { unlocked: 1, stages: {} },
      achievements: {},
      journals: {},
      photos: {},
      album: [],
      tips: {},
      run: null,
      stats: { summits: 0, playTime: 0, deaths: 0, walls: 0, camps: 0 },
    };
  },
  load() {
    let d = null;
    try { d = JSON.parse(localStorage.getItem(this.KEY) || 'null'); } catch (e) { d = null; }
    const def = this.defaults();
    if (!d) d = def;
    for (const k in def) if (d[k] === undefined) d[k] = def[k];
    for (const k in def.settings) if (d.settings[k] === undefined) d.settings[k] = def.settings[k];
    for (const k in def.stats) if (d.stats[k] === undefined) d.stats[k] = def.stats[k];
    this.data = d;
    return d;
  },
  write() {
    try { localStorage.setItem(this.KEY, JSON.stringify(this.data)); }
    catch (e) {
      // 空间不足时丢弃最旧的照片
      if (this.data.album.length) { this.data.album.shift(); try { localStorage.setItem(this.KEY, JSON.stringify(this.data)); } catch (e2) { } }
    }
  },
  unlock(id) {
    if (this.data.achievements[id]) return false;
    this.data.achievements[id] = Date.now();
    this.write();
    // Steam 桌面版桥接（Electron preload 注入）
    try { if (window.steamBridge && window.steamBridge.activate) window.steamBridge.activate(id); } catch (e) { }
    return true;
  },
  stageRecord(key) { return this.data.progress.stages[key] || { stars: [false, false, false], best: null, bestScore: 0, cleared: false }; },
  saveStageRecord(key, rec) { this.data.progress.stages[key] = rec; this.write(); },
  addPhoto(dataUrl, meta) {
    this.data.album.push(Object.assign({ img: dataUrl, t: Date.now() }, meta));
    while (this.data.album.length > 24) this.data.album.shift();
    this.write();
  },
  reset() { this.data = this.defaults(); this.write(); },
};
