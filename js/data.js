/* 游戏数据：章节、难度、物品、成就、日志文本 */

const TERRAIN_RES = 440;
const QUALITY = {
  low: { label: '低', shadow: 0, pixelRatio: 1.0, post: false, grass: 0, trees: 1400, rocks: 300, snow: 1500, tex: 256 },
  medium: { label: '中', shadow: 2048, pixelRatio: 1.0, post: true, grass: 9000, trees: 2600, rocks: 520, snow: 3000, tex: 512 },
  high: { label: '高', shadow: 2048, pixelRatio: 1.25, post: true, grass: 16000, trees: 3600, rocks: 700, snow: 4500, tex: 512 },
  ultra: { label: '极致', shadow: 4096, pixelRatio: 1.5, post: true, grass: 26000, trees: 4800, rocks: 900, snow: 6000, tex: 512 },
};

const DIFFICULTIES = {
  easy: { key: 'easy', name: '休闲', color: '#6fd08c', desc: '轻松欣赏风景：负面状态积累很慢，坠落伤害低，生命无限。', aff: 0.55, fall: 0.6, drain: 0.8, weather: 0.5, lives: Infinity, score: 1 },
  normal: { key: 'normal', name: '标准', color: '#58a6ff', desc: '推荐体验：需要规划补给、营地与体力。', aff: 1, fall: 1, drain: 1, weather: 1, lives: Infinity, score: 1.5 },
  hard: { key: 'hard', name: '艰难', color: '#ffa94d', desc: '补给紧张、天气恶劣、坠落致命，只有 5 条命。', aff: 1.35, fall: 1.25, drain: 1.15, weather: 1.35, lives: 5, score: 2.2 },
  extreme: { key: 'extreme', name: '极限', color: '#ff5c5c', desc: '真正的死亡地带：3 条命，一切都在和你作对。', aff: 1.7, fall: 1.5, drain: 1.3, weather: 1.7, lives: 3, score: 3.5 },
};

const STAGES = [
  {
    key: 'verdant', chapter: '第一章', name: '青岚山', en: 'VERDANT RIDGE', color: '#7fd67a',
    tagline: '湖畔、松林与花海——一切开始的地方',
    desc: '从湖边的登山口出发，沿着之字形步道穿过松林与高山草甸。学习行走、攀岩与露营，在第一个夜晚来临之前找到营地。',
    seed: 20417, altBase: 1350, altScale: 6,
    terrain: { height: 250, steep: 1.12, ridgeAmp: 0.06, rollAmp: 13, terrace: 0.22, terraceStep: 26, maxSlopeDeg: 68, snowLine: 0.9, treeLine: 0.62, rockLine: 0.5, palette: 'summer', lake: { angle: -0.95, dist: 0.8, radius: 75, depth: 7 }, crevasses: 0, ice: false },
    walls: { count: 2, h: [13, 20], w: [16, 22], style: 'granite', difficulty: 0 },
    camps: [0.42, 0.76], stashes: 6, viewpoints: 3, firewood: 10, journals: [0, 1, 2, 3, 4],
    startHour: 14.5, dayMinutes: 18,
    weather: { windMax: 4, blizzard: null, snow: false },
    rockfall: 0, deathZone: null, cloudSea: null, aurora: false,
    startItems: { bar: 3, thermos: 1, bandage: 2, chalk: 1, piton: 4, tent: 1, wood: 1, noodle: 1, battery: 1 },
    par: 600,
  },
  {
    key: 'eagle', chapter: '第二章', name: '鹰嘴岩', en: 'EAGLE CRAG', color: '#ffb35c',
    tagline: '秋色峡谷与花岗岩巨壁',
    desc: '金黄的秋林之上矗立着巨大的花岗岩壁。步道漫长曲折，岩壁是危险却迅速的捷径。注意松动的岩点与落石。',
    seed: 77031, altBase: 2100, altScale: 6.5,
    terrain: { height: 370, steep: 1.3, ridgeAmp: 0.1, rollAmp: 17, terrace: 0.4, terraceStep: 32, maxSlopeDeg: 72, snowLine: 0.8, treeLine: 0.46, rockLine: 0.36, palette: 'autumn', lake: null, crevasses: 0, ice: false },
    walls: { count: 4, h: [18, 30], w: [18, 28], style: 'granite', difficulty: 1 },
    camps: [0.36, 0.68], stashes: 7, viewpoints: 3, firewood: 8, journals: [5, 6, 7, 8, 9],
    startHour: 9, dayMinutes: 20,
    weather: { windMax: 8, blizzard: null, snow: false, gusty: true },
    rockfall: 0.6, deathZone: null, cloudSea: null, aurora: false,
    startItems: { bar: 3, thermos: 1, bandage: 2, chalk: 2, piton: 6, tent: 1, wood: 1, noodle: 1, battery: 1 },
    par: 1000,
  },
  {
    key: 'frost', chapter: '第三章', name: '霜冠峰', en: 'FROST CROWN', color: '#9fd3ff',
    tagline: '冰川、云海、极光与死亡地带',
    desc: '穿越裂缝纵横的冰川与冰壁，在云海之上迎接风暴。最后的死亡地带缺氧严寒——父亲的足迹在这里终结。',
    seed: 90210, altBase: 4300, altScale: 8.8,
    terrain: { height: 520, steep: 1.48, ridgeAmp: 0.12, rollAmp: 20, terrace: 0.42, terraceStep: 34, maxSlopeDeg: 74, snowLine: 0.4, treeLine: 0.24, rockLine: 0.2, palette: 'alpine', lake: null, crevasses: 4, ice: true },
    walls: { count: 3, h: [16, 26], w: [18, 24], style: 'ice', difficulty: 2 },
    camps: [0.34, 0.64, 0.84], stashes: 8, viewpoints: 3, firewood: 6, journals: [10, 11, 12, 13, 14],
    startHour: 7, dayMinutes: 22,
    weather: { windMax: 12, blizzard: { first: [160, 260], dur: [45, 70], gap: [200, 320] }, snow: true },
    rockfall: 0.35, deathZone: 0.82, cloudSea: 0.46, aurora: true,
    startItems: { bar: 4, thermos: 2, bandage: 2, chalk: 2, piton: 6, tent: 1, wood: 2, noodle: 2, battery: 2, oxygen: 2 },
    par: 1500,
  },
];

/* 物品：SVG 图标（24x24） */
const ITEMS = {
  bar: { name: '能量棒', desc: '饥饿 −25，立刻恢复 20 体力', key: '1', svg: '<rect x="4" y="8" width="16" height="8" rx="2" fill="#c8733a"/><rect x="8" y="8" width="8" height="8" fill="#f2c14e"/><path d="M4 10l-2 2 2 2M20 10l2 2-2 2" stroke="#c8733a" stroke-width="1.5" fill="none"/>' },
  thermos: { name: '热茶', desc: '寒冷 −35（一壶可喝 3 次，营火旁可续满）', key: '2', svg: '<rect x="8" y="5" width="8" height="16" rx="2.5" fill="#d9534f"/><rect x="9" y="2.5" width="6" height="3" rx="1" fill="#555"/><rect x="8" y="10" width="8" height="2" fill="#f4f4f4"/>' },
  bandage: { name: '绷带', desc: '伤势 −30', key: '3', svg: '<rect x="3" y="8" width="18" height="8" rx="4" transform="rotate(-35 12 12)" fill="#f1e3c8"/><rect x="9" y="9" width="6" height="6" transform="rotate(-35 12 12)" fill="#e8b4a0"/>' },
  chalk: { name: '镁粉', desc: '攀岩时 25 秒内握力消耗减半', key: '4', svg: '<path d="M6 8h12l-1.5 12h-9z" fill="#3b6fb6"/><ellipse cx="12" cy="8" rx="6" ry="2" fill="#f5f5f5"/><circle cx="9" cy="5" r="1" fill="#fff"/><circle cx="14" cy="4" r="1.2" fill="#fff"/>' },
  oxygen: { name: '氧气瓶', desc: '60 秒内免疫缺氧，并清除缺氧', key: '5', svg: '<rect x="8" y="6" width="8" height="15" rx="4" fill="#ffb400"/><rect x="10.5" y="2" width="3" height="4" fill="#666"/><rect x="8" y="12" width="8" height="2" fill="#333"/>' },
  noodle: { name: '速食面', desc: '在营火旁烹饪：饥饿 −60、寒冷 −30', key: '', svg: '<path d="M4 11h16a8 8 0 0 1-16 0z" fill="#e85d3a"/><path d="M6 11c1-3 2 0 3-3s2 0 3-3 2 0 3-3" stroke="#f7d774" stroke-width="1.6" fill="none"/>' },
  wood: { name: '柴火', desc: '在营地点燃营火', key: '', svg: '<rect x="3" y="12" width="18" height="4" rx="2" fill="#8a5a33" transform="rotate(-15 12 14)"/><rect x="3" y="12" width="18" height="4" rx="2" fill="#6e4424" transform="rotate(20 12 14)"/><circle cx="19" cy="10" r="1.6" fill="#d9b48a"/>' },
  tent: { name: '帐篷', desc: '在平地按 T 搭建营地：可睡觉、存档', key: 'T', svg: '<path d="M2 20L12 4l10 16z" fill="#e8612c"/><path d="M12 4l3 16H9z" fill="#b8431b"/><path d="M1 20h22" stroke="#555" stroke-width="1.5"/>' },
  piton: { name: '岩钉', desc: '攀岩时按 Q 打入，坠落时绳索会在此拉住你', key: 'Q', svg: '<path d="M11 3h2l1 12h-4z" fill="#b8c2cc"/><circle cx="12" cy="17.5" r="3.2" stroke="#e0a030" stroke-width="1.8" fill="none"/>' },
  battery: { name: '电池', desc: '头灯电量耗尽时自动更换', key: '', svg: '<rect x="4" y="8" width="15" height="8" rx="1.5" fill="#4caf50"/><rect x="19" y="10.5" width="2" height="3" fill="#888"/><path d="M11 9l-2 4h3l-1 3" stroke="#fff" stroke-width="1.3" fill="none"/>' },
};
const HOTBAR = ['bar', 'thermos', 'bandage', 'chalk', 'oxygen'];

const ACHIEVEMENTS = [
  { id: 'ch1', name: '启程', desc: '完成第一章：登顶青岚山', icon: '⛰' },
  { id: 'ch2', name: '鹰之领域', desc: '完成第二章：登顶鹰嘴岩', icon: '🦅' },
  { id: 'ch3', name: '霜之冠冕', desc: '完成第三章：登顶霜冠峰', icon: '👑' },
  { id: 'first_wall', name: '岩壁初体验', desc: '第一次登顶一面岩壁', icon: '🧗' },
  { id: 'free_solo', name: '徒手独攀', desc: '不打岩钉登顶一面 20 米以上的岩壁', icon: '✋' },
  { id: 'saved_by_rope', name: '绳索救命', desc: '坠落时被岩钉和绳索拉住', icon: '🪢' },
  { id: 'dyno', name: '飞跃', desc: '成功完成一次跳跃抓点（Dyno）', icon: '⚡' },
  { id: 'camper', name: '野营达人', desc: '亲手搭起帐篷并睡上一觉', icon: '⛺' },
  { id: 'stargazer', name: '仰望星空', desc: '在夜晚的营火旁看星星', icon: '✨' },
  { id: 'chef', name: '山顶厨房', desc: '在营地烹饪一顿热饭', icon: '🍜' },
  { id: 'sunrise', name: '日照金山', desc: '在清晨 5:00–7:30 之间登顶', icon: '🌅' },
  { id: 'night', name: '夜行者', desc: '在深夜 22:00–4:00 之间登顶', icon: '🌙' },
  { id: 'journals', name: '父亲的足迹', desc: '收集全部 15 页登山日志', icon: '📖' },
  { id: 'photographer', name: '山野摄影师', desc: '在 9 个观景点拍下照片', icon: '📷' },
  { id: 'flawless', name: '毫发无伤', desc: '不死亡完成任意章节', icon: '🛡' },
  { id: 'speed', name: '疾行者', desc: '在标准用时内完成任意章节', icon: '⏱' },
  { id: 'extreme', name: '极限登山家', desc: '在极限难度登顶任意山峰', icon: '💀' },
  { id: 'blizzard', name: '风雪夜归人', desc: '在野外熬过一整场暴风雪', icon: '🌨' },
  { id: 'aurora', name: '极光之下', desc: '在霜冠峰看到极光', icon: '🌌' },
  { id: 'hoarder', name: '补给专家', desc: '在一章内找到全部补给包', icon: '🎒' },
];

const STORY = {
  intro: [
    '二十年前，父亲林远是这片山脉里最好的向导。',
    '最后一次出发前，他说要把一本日志留在路上——“留给以后想来的人。”',
    '他再也没有回来。',
    '现在，你背上他留下的旧背包，从青岚山的湖边出发。',
  ],
  ending: [
    '峰顶的玛尼堆下压着一面褪色的红旗，和日志的最后一页。',
    '风很大，但阳光很暖。云海在脚下一直铺到天边。',
    '你终于看见了他看过的风景。',
  ],
};

const JOURNALS = [
  // 第一章
  { title: '第一页 · 湖边', text: '孩子，如果你捡到了这一页，说明你已经站在登山口了。\n\n先别急着往上冲。看看湖面，看看松林。山不会跑，风景也不会。\n\n记住：体力条就是你的命。饿了、冷了、累了、受伤了，它都会变短。' },
  { title: '第二页 · 松林', text: '步道绕得很远，但它总会把你带到山顶。\n\n岩壁是捷径，也是陷阱。第一次攀岩，找那些白色镁粉标记的大把手——手要稳，心要静。\n\n打一颗岩钉，比什么勇气都管用。' },
  { title: '第三页 · 草甸', text: '太阳下山以后，山会变成另一座山。\n\n气温一降，寒冷就会一点点啃掉你的体力。找块平地，搭好帐篷，生一堆火，煮一碗面。\n\n我年轻的时候总想赶夜路，后来才明白，睡一觉，比什么都重要。' },
  { title: '第四页 · 营火', text: '今晚的星星很多。\n\n你妈妈说，山上的星星离人近，是因为想家的人都爬到这么高来看它们。\n\n我不知道这是不是真的。但每次在山上生火，我都会想起你们。' },
  { title: '第五页 · 青岚之巅', text: '青岚山不高，却是我第一次登顶的山。\n\n站在这里往东看，那座灰色的巨岩就是鹰嘴岩。再往后，被云遮住的，是霜冠峰。\n\n一步一步来。' },
  // 第二章
  { title: '第六页 · 秋林', text: '鹰嘴岩的秋天是金色的。\n\n这里的岩壁又高又直，岩点有的结实，有的一碰就碎——褐红色的那些，千万别久留。\n\n够不着的时候，蓄力，跳。可是跳之前，先确认身下有岩钉。' },
  { title: '第七页 · 落石', text: '听到上方有“咔啦”声的时候，不要抬头看，先躲。\n\n老周就是在这里被石头砸伤了腿。那天我们在半山腰的岩架上坐了一夜，他说他再也不爬山了。\n\n第二年春天，他又来了。' },
  { title: '第八页 · 鹰巢', text: '岩壁顶上有一个鹰巢。两只老鹰在头顶盘旋了一下午，好像在确认我不是来偷蛋的。\n\n山上的一切都比我们更早住在这里。我们只是路过。' },
  { title: '第九页 · 风', text: '风从峡谷里灌上来，吹得人站不稳。\n\n风大的时候，攀爬会更费力，体温也掉得更快。别和风较劲，找个背风的地方等一等。\n\n等待，也是登山的一部分。' },
  { title: '第十页 · 鹰嘴之巅', text: '从这里能清楚地看见霜冠峰了。\n\n它比我想象中还要高。冰川像一条白色的河，从山腰一直流到山脚。\n\n我答应过你，等你长大了，带你一起来。对不起，我可能要先去看看路了。' },
  // 第三章
  { title: '第十一页 · 冰川', text: '冰川上到处都是裂缝，有的藏在雪下面。\n\n走梯子桥，别逞能跳。如果一定要跳，就助跑。\n\n冰壁不一样：冰镐砍进去的地方，就是岩点。' },
  { title: '第十二页 · 云海', text: '今天爬到了云的上面。\n\n云海在脚下翻滚，太阳把它染成金色。那一瞬间我忘了寒冷，忘了疲惫，只想让你也看看。\n\n我拍了一张照片。可惜照片装不下这么大的天空。' },
  { title: '第十三页 · 暴风雪', text: '暴风雪来得很突然。\n\n看不见路的时候，就跟着步道的标杆走。如果连标杆也看不见，就搭帐篷，钻进去，等。\n\n活着回去，比登顶更重要。这句话我对每一个队员都说过。' },
  { title: '第十四页 · 死亡地带', text: '空气稀薄得像是被人抽走了一样，每走一步都要喘好几口气。\n\n氧气瓶省着用。缺氧会让人糊涂——我刚才居然想坐下来睡一会儿。\n\n不能睡。还有一点点，就到了。' },
  { title: '最后一页 · 霜冠之巅', text: '孩子，我到了。\n\n这里的风景，和我梦里的一样。我把红旗插在了玛尼堆上，把最后一页日志压在石头下面。\n\n如果有一天你站在这里，读到这些字——那说明你已经比我走得更远了。\n\n回家吧。替我看看湖边的松林。\n\n——爸爸' },
];

const TIPS = {
  move: '【W A S D】移动 ·【鼠标】转动视角 ·【Shift】奔跑 ·【空格】跳跃',
  trail: '沿着步道和路标走最安全；罗盘上的 ▲ 指向峰顶',
  wall: '靠近岩壁按【E】抓住岩点，【W A S D】向对应方向的岩点移动',
  wallTop: '爬到顶端继续按【W】即可翻上岩壁',
  piton: '在岩壁上按【Q】打入岩钉：坠落时绳索会拉住你',
  dyno: '够不着时按住【空格】蓄力，在绿色区域松开跳向更远的岩点',
  camp: '在营地按【E】打开营地菜单：生火、烹饪、睡觉',
  tent: '在平坦处按【T】搭帐篷，建立自己的营地',
  night: '天黑了：按【L】开关头灯，夜晚寒冷会加快，找个地方露营吧',
  afflictions: '体力条右侧的彩色段是负面状态：饥饿、寒冷、伤势、疲惫、缺氧，它们会压缩你的最大体力',
  map: '按【M】打开地图，查看步道、营地与收集品',
  photo: '站在观景点（相机标志）按【F】进入拍照模式',
  slide: '滑坠时按住【空格】用冰镐制动！',
};
