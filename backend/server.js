const express = require("express");
const path = require("path");
const fs = require("fs");
const multer = require("multer");

const app = express();
const port = 3000;

// ====== STORAGE ======
const DATA_FILE = path.join(__dirname, "data.json");
function ensureDir(p) { if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true }); }
function initDataFile() {
  if (!fs.existsSync(DATA_FILE)) {
    const initial = { users: {}, posts: [], shop: [], challenges: [] };
    fs.writeFileSync(DATA_FILE, JSON.stringify(initial, null, 2));
  }
}
function readData() { initDataFile(); return JSON.parse(fs.readFileSync(DATA_FILE, "utf-8")); }
function writeData(data) { fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2)); }

// ====== CONFIG / HELPERS ======
const START_TIMT = 5;                 // TIMT iniziali
const POST_COST_TIMT = 1;             // costo pubblicazione
const INITIAL_POST_HOURS = 24;        // vita iniziale
const EXTEND_HOURS_PER_TIMT = 6;      // estensione per TIMT
const AUTHOR_EXTEND_HOURS_CAP = 12;   // autore max +12h sul proprio post
const DAILY_EARN_CAP = 5;             // TIMT max/giorno (like/commenti/bonus)

// Soglie “Community Certified”
const CERT_LIKES = 20;
const CERT_COMMENTS = 10;
const CERT_EXT_HOURS_OTHERS = 24;

const nowMs = () => Date.now();
const hoursToMs = (h) => h * 60 * 60 * 1000;
const todayStr = () => new Date().toISOString().slice(0,10);

function ensureUser(data, username) {
  if (!data.users[username]) {
    data.users[username] = {
      tokens: START_TIMT,
      bio: "",
      avatar: "/assets/default-avatar.png",
      createdAt: new Date().toISOString(),
      saves: [],
      daily: { day: todayStr(), earned: 0, claimed: false },
      followers: [],
      following: []
    };
    writeData(data);
  } else {
    const u = data.users[username];
    if (!u.daily || u.daily.day !== todayStr()) {
      u.daily = { day: todayStr(), earned: 0, claimed: false };
      writeData(data);
    }
    if (!Array.isArray(u.saves)) { u.saves = []; writeData(data); }
    if (!Array.isArray(u.followers)) { u.followers = []; writeData(data); }
    if (!Array.isArray(u.following)) { u.following = []; writeData(data); }
  }
  return data.users[username];
}
function pruneExpired(posts) {
  const t = nowMs();
  return posts.filter(p => new Date(p.expiresAt).getTime() > t);
}
function awardTokens(user, amount) {
  const day = todayStr();
  if (!user.daily || user.daily.day !== day) user.daily = { day, earned: 0, claimed: false };
  const room = Math.max(0, DAILY_EARN_CAP - user.daily.earned);
  const add = Math.min(amount, room);
  if (add > 0) { user.tokens += add; user.daily.earned += add; }
  return add;
}
function computedFields(p) {
  const likesCount = (p.likes || []).length;
  const commentsCount = (p.comments || []).length;
  const extHoursByOthers = (p.extendedBy || [])
    .filter(e => e.username !== p.author)
    .reduce((s, e) => s + (e.timt * EXTEND_HOURS_PER_TIMT), 0);
  const certified = (likesCount >= CERT_LIKES)
                 || (commentsCount >= CERT_COMMENTS)
                 || (extHoursByOthers >= CERT_EXT_HOURS_OTHERS);
  const remaining = Math.max(0, new Date(p.expiresAt).getTime() - nowMs());
  return {
    likesCount,
    commentsCount,
    extHoursByOthers,
    certified,
    remainingSeconds: Math.floor(remaining / 1000),
  };
}


// ====== ROI & EXTRAS (Timely+ additions) ======
const ROI_POPULAR_INVEST = 5;       // investimenti totali (TIMT) per considerare popolare
const ROI_POPULAR_SUPPORTERS = 3;   // o almeno 3 supporter
const ROI_POOL_RATE = 0.20;         // 20% pool simbolico da distribuire ai supporter (demo)

function settleAndPrune(data){
  const t = nowMs();
  const keep = [];
  for (const p of data.posts){
    const exp = new Date(p.expiresAt).getTime();
    if (exp > t){ keep.push(p); continue; }
    // post scaduto -> calcolo ROI per chi ha esteso (escluso autore)
    const ext = (p.extendedBy||[]).filter(e => e && e.username && e.timt>0 && e.username !== p.author);
    if (ext.length){
      const totalInvest = ext.reduce((s,e)=> s + (Number(e.timt)||0), 0);
      const supporterSet = new Set(ext.map(e=>e.username));
      const popular = totalInvest >= ROI_POPULAR_INVEST || supporterSet.size >= ROI_POPULAR_SUPPORTERS;
      if (popular && totalInvest > 0){
        const pool = Math.round(totalInvest * ROI_POOL_RATE);
        // Somma per username
        const sums = {};
        for (const e of ext){ sums[e.username] = (sums[e.username]||0) + (Number(e.timt)||0); }
        for (const [uname,amt] of Object.entries(sums)){
          const u = ensureUser(data, uname);
          u.tokens = (u.tokens||0) + Math.floor(pool * (amt/totalInvest));
        }
      }
    }
    // Non tenere il post (scaduto)
  }
  data.posts = keep;
}

// Seed shop/challenges
function ensureSeeds(){
  const data = readData();
  if (!data.shop) data.shop = [];
  if (data.shop.length === 0){
    data.shop.push(
      { id:'theme_ocean', category:'Tema', name:'Tema Ocean', desc:'Palette blu/azzurri', price:10, apply:'theme:ocean' },
      { id:'theme_neon', category:'Tema', name:'Tema Neon', desc:'Accenti fluo', price:12, apply:'theme:neon' },
      { id:'badge_curator', category:'Badge', name:'Badge Curator', desc:'Per chi sostiene i post altrui', price:8, apply:'badge:Curator' },
      { id:'start_boost', category:'Boost', name:'Start Boost +30', desc:'Nuovi post partono con +30 min', price:15, apply:'boost:start30' }
    );
  }
  if (!data.challenges) data.challenges = [];
  const hasQuiz = data.challenges.some(c=>c.id==='ch_quiz_1');
  if (!hasQuiz){
    const nowT = Date.now();
    data.challenges.push({
      id:'ch_quiz_1', type:'quiz',
      title:'Quiz 60 - Attualita',
      description:'5 domande in 60 secondi. Top 10% vince TIMT. (Demo textual)',
      startsAt: new Date(nowT + 30*1000).toISOString(),
      endsAt: new Date(nowT + 60*60*1000).toISOString(),
      rules:{ questions:5, seconds:60 },
      rewards:{ timt:10, timeBonusMinutes:60 },
      participants:[], entries:[], votes:{}, status:'scheduled'
    });
    data.challenges.push({
      id:'ch_duel_1', type:'duel',
      title:'Duel - Meme del giorno',
      description:'1v1: la community vota con Clap (demo voti).',
      startsAt: new Date(nowT + 60*1000).toISOString(),
      endsAt: new Date(nowT + 2*60*60*1000).toISOString(),
      rules:{ maxChars:200 },
      rewards:{ timt:15, timeBonusMinutes:60 },
      participants:[], entries:[], votes:{}, status:'scheduled'
    });
  }
  writeData(data);
}
// Call seeds at startup
ensureSeeds();
// ====== STATIC ======
app.use(express.json());
app.use(express.static(path.join(__dirname, "../frontend")));
app.use("/pages", express.static(path.join(__dirname, "../frontend/pages")));
const UPLOAD_ROOT = path.join(__dirname, "uploads");
const AVATAR_DIR = path.join(UPLOAD_ROOT, "avatars");
const POST_DIR = path.join(UPLOAD_ROOT, "posts");
ensureDir(AVATAR_DIR); ensureDir(POST_DIR);
app.use("/uploads", express.static(UPLOAD_ROOT));

// ====== MULTER (upload immagini) ======
const allowed = new Set(["image/jpeg","image/png","image/webp"]);
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const kind = req.params.kind || req.body.kind;
    const dest = kind === "avatar" ? AVATAR_DIR : POST_DIR;
    cb(null, dest);
  },
  filename: (req, file, cb) => {
    const ext = file.mimetype === "image/png" ? ".png" :
                file.mimetype === "image/webp" ? ".webp" : ".jpg";
    const name = Date.now() + "_" + Math.random().toString(36).slice(2,8) + ext;
    cb(null, name);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => allowed.has(file.mimetype) ? cb(null, true) : cb(new Error("Tipo file non supportato"))
});

// ====== ROUTE PAGINE ======
app.get("/", (_, res) => res.sendFile(path.join(__dirname, "../frontend/index.html")));
app.get("/home", (_, res) => res.sendFile(path.join(__dirname, "../frontend/pages/home.html")));
app.get("/profile", (_, res) => res.sendFile(path.join(__dirname, "../frontend/pages/profile.html")));
app.get("/help", (_, res) => res.sendFile(path.join(__dirname, "../frontend/pages/help.html")));
app.get("/roadmap", (_, res) => res.sendFile(path.join(__dirname, "../frontend/pages/roadmap.html")));
app.get("/board", (_, res) => res.sendFile(path.join(__dirname, "../frontend/pages/board.html")));
app.get("/user", (_, res) => res.sendFile(path.join(__dirname, "../frontend/pages/user.html")));

// ====== API BASE ======
app.post("/api/login", (req, res) => {
  const { username } = req.body || {};
  if (!username) return res.status(400).json({ error: "username richiesto" });
  const data = readData();
  const user = ensureUser(data, username);
  res.json({ username, tokens: user.tokens, avatar: user.avatar, bio: user.bio });
});
app.get("/api/balance", (req, res) => {
  const { username } = req.query;
  if (!username) return res.status(400).json({ error: "username richiesto" });
  const data = readData();
  const user = ensureUser(data, username);
  res.json({ tokens: user.tokens, daily: user.daily, avatar: user.avatar });
});
app.post("/api/daily-claim", (req, res) => {
  const { username } = req.body || {};
  if (!username) return res.status(400).json({ error: "username richiesto" });
  const data = readData();
  const user = ensureUser(data, username);
  if (user.daily.claimed) return res.status(409).json({ error: "Bonus già riscosso oggi" });
  const added = awardTokens(user, 1);
  user.daily.claimed = true;
  writeData(data);
  res.json({ ok: true, added, tokens: user.tokens, daily: user.daily });
});

// ====== PROFILI / FOLLOW ======
app.get("/api/profile", (req, res) => {
  const { username: target, viewer } = req.query || {};
  if (!target) return res.status(400).json({ error: "username richiesto" });
  const data = readData();
  const u = ensureUser(data, target);
  const isFollowing = viewer ? (ensureUser(data, viewer).following || []).includes(target) : false;
  const postsCount = readData().posts.filter(p => p.author === target && new Date(p.expiresAt).getTime() > nowMs()).length;
  res.json({
    username: target,
    avatar: u.avatar,
    bio: u.bio || "",
    createdAt: u.createdAt,
    followersCount: (u.followers || []).length,
    followingCount: (u.following || []).length,
    postsCount,
    isFollowing
  });
});

app.post("/api/follow", (req, res) => {
  const { username, target } = req.body || {};
  if (!username || !target) return res.status(400).json({ error: "username e target obbligatori" });
  if (username === target) return res.status(400).json({ error: "Non puoi seguire te stesso" });
  const data = readData();
  const me = ensureUser(data, username);
  const other = ensureUser(data, target);

  const already = me.following.includes(target);
  if (already) {
    me.following = me.following.filter(x => x !== target);
    other.followers = other.followers.filter(x => x !== username);
  } else {
    me.following.push(target);
    other.followers.push(username);
  }
  writeData(data);
  res.json({
    ok: true,
    isFollowing: !already,
    me: { followingCount: me.following.length },
    other: { followersCount: other.followers.length }
  });
});

// ====== UPLOAD ======
async function isValidImageSignature(filePath) {
  try {
    const fd = fs.openSync(filePath, 'r');
    const buf = Buffer.alloc(12);
    fs.readSync(fd, buf, 0, 12, 0);
    fs.closeSync(fd);
    if (buf[0] === 0xFF && buf[1] === 0xD8 && buf[2] === 0xFF) return true; // JPEG
    if (buf.slice(0,8).equals(Buffer.from([0x89,0x50,0x4E,0x47,0x0D,0x0A,0x1A,0x0A]))) return true; // PNG
    if (buf.slice(0,4).toString() === 'RIFF' && buf.slice(8,12).toString() === 'WEBP') return true; // WEBP
    return false;
  } catch { return false; }
}

app.post("/api/upload/avatar", upload.single("avatar"), async (req, res) => {
  const { username } = req.body || {};
  if (!username) return res.status(400).json({ error: "username richiesto" });
  if (!req.file) return res.status(400).json({ error: "file mancante" });
  const ok = await isValidImageSignature(req.file.path);
  if (!ok) { fs.unlinkSync(req.file.path); return res.status(400).json({ error: "File non valido" }); }
  const data = readData();
  const user = ensureUser(data, username);
  const url = `/uploads/avatars/${req.file.filename}`;
  user.avatar = url; writeData(data);
  res.json({ ok: true, url });
});

app.post("/api/upload/post-image", (req, res, next) => { req.params.kind = "post"; next(); }, upload.single("image"), async (req, res) => {
  const { username } = req.body || {};
  if (!username) return res.status(400).json({ error: "username richiesto" });
  if (!req.file) return res.status(400).json({ error: "file mancante" });
  const ok = await isValidImageSignature(req.file.path);
  if (!ok) { fs.unlinkSync(req.file.path); return res.status(400).json({ error: "File non valido" }); }
  const url = `/uploads/posts/${req.file.filename}`;
  res.json({ ok: true, url });
});

// ====== POST ======
app.post("/api/post", (req, res) => {
  const { username, content, imageUrl } = req.body || {};
  if (!username || !content || !content.trim())
    return res.status(400).json({ error: "username e content obbligatori" });

  const data = readData();
  const user = ensureUser(data, username);
  if (user.tokens < POST_COST_TIMT)
    return res.status(403).json({ error: "TIMT insufficienti per pubblicare" });

  user.tokens -= POST_COST_TIMT;

  const id = "p_" + Math.random().toString(36).slice(2, 10);
  const createdAt = new Date();
  const expiresAt = new Date(createdAt.getTime() + hoursToMs(INITIAL_POST_HOURS));

  const post = {
    id,
    author: username,
    content: content.trim(),
    imageUrl: imageUrl || null,
    createdAt: createdAt.toISOString(),
    expiresAt: expiresAt.toISOString(),
    extendedBy: [],
    likes: [],
    comments: []
  };

  data.posts.push(post);
  data.posts = (settleAndPrune(data), data.posts);
  writeData(data);

  res.json({ ok: true, post, tokens: user.tokens });
});

// Estensione
app.post("/api/posts/:id/extend", (req, res) => {
  const { id } = req.params;
  const { username, timt = 1 } = req.body || {};
  if (!username) return res.status(400).json({ error: "username richiesto" });

  const data = readData();
  const user = ensureUser(data, username);
  const post = data.posts.find(p => p.id === id);
  if (!post) return res.status(404).json({ error: "post non trovato" });

  const now = nowMs();
  const exp = new Date(post.expiresAt).getTime();
  if (exp <= now) return res.status(410).json({ error: "post scaduto" });

  const need = Number(timt) || 1;
  if (need <= 0) return res.status(400).json({ error: "timt non valido" });
  if (user.tokens < need) return res.status(403).json({ error: "TIMT insufficienti" });

  const author = post.author;
  const authorExtendedHours = (post.extendedBy || [])
    .filter(e => e.username === author)
    .reduce((s, e) => s + (e.timt * EXTEND_HOURS_PER_TIMT), 0);
  const thisAddHours = need * EXTEND_HOURS_PER_TIMT;
  if (username === author && authorExtendedHours + thisAddHours > AUTHOR_EXTEND_HOURS_CAP) {
    return res.status(403).json({ error: "Limite estensione autore (+12h) raggiunto" });
  }

  user.tokens -= need;
  post.expiresAt = new Date(exp + hoursToMs(thisAddHours)).toISOString();
  post.extendedBy.push({ username, timt: need, at: new Date().toISOString() });

  writeData(data);
  res.json({ ok: true, post, tokens: user.tokens });
});

// Feed
app.get("/api/posts", (req, res) => {
  const data = readData();
  const active = (settleAndPrune(data), data.posts)
    .map(p => ({ ...p, ...computedFields(p) }))
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  res.json(active);
});

// Post singolo (con commenti)
app.get("/api/posts/:id", (req, res) => {
  const { id } = req.params;
  const data = readData();
  const p = data.posts.find(x => x.id === id);
  if (!p) return res.status(404).json({ error: "post non trovato" });
  res.json({ ...p, ...computedFields(p) });
});

// Commenti
app.get("/api/comments/:id", (req, res) => {
  const { id } = req.params;
  const data = readData();
  const p = data.posts.find(x => x.id === id);
  if (!p) return res.status(404).json({ error: "post non trovato" });
  res.json({ ok: true, comments: p.comments || [], count: (p.comments || []).length });
});

// Like & Commenti
app.post("/api/like/:id", (req, res) => {
  const { username } = req.body || {};
  const { id } = req.params;
  if (!username) return res.status(400).json({ error: "username richiesto" });

  const data = readData();
  ensureUser(data, username);
  const post = data.posts.find(p => p.id === id);
  if (!post) return res.status(404).json({ error: "post non trovato" });

  post.likes = post.likes || [];
  if (post.likes.includes(username)) return res.status(409).json({ error: "Hai già messo like" });

  post.likes.push(username);
  if (post.author !== username && post.likes.length % 5 === 0) {
    const creator = ensureUser(data, post.author);
    awardTokens(creator, 1);
  }
  writeData(data);
  res.json({ ok: true, likesCount: post.likes.length });
});

app.post("/api/comment/:id", (req, res) => {
  const { username, text } = req.body || {};
  const { id } = req.params;
  if (!username || !text || !text.trim()) return res.status(400).json({ error: "username e text obbligatori" });

  const data = readData();
  ensureUser(data, username);
  const post = data.posts.find(p => p.id === id);
  if (!post) return res.status(404).json({ error: "post non trovato" });

  post.comments = post.comments || [];
  post.comments.push({ username, text: String(text).slice(0, 300).trim(), at: new Date().toISOString() });

  const othersComments = post.comments.filter(c => c.username !== post.author).length;
  if (post.author !== username && othersComments % 2 === 0) {
    const creator = ensureUser(data, post.author);
    awardTokens(creator, 1);
  }

  writeData(data);
  res.json({ ok: true, commentsCount: post.comments.length });
});

// I miei post
app.get("/api/my-posts", (req, res) => {
  const { username } = req.query || {};
  if (!username) return res.status(400).json({ error: "username richiesto" });
  const data = readData();
  const mine = (settleAndPrune(data), data.posts)
    .filter(p => p.author === username)
    .map(p => ({ ...p, ...computedFields(p) }))
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  res.json(mine);
});

// Post di un utente
app.get("/api/user-posts", (req, res) => {
  const { username } = req.query || {};
  if (!username) return res.status(400).json({ error: "username richiesto" });
  const data = readData();
  const list = (settleAndPrune(data), data.posts)
    .filter(p => p.author === username)
    .map(p => ({ ...p, ...computedFields(p) }))
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  res.json(list);
});

// Feed Seguiti (Pulse)
app.get("/api/feed/following", (req, res) => {
  const { username } = req.query || {};
  if (!username) return res.status(400).json({ error: "username richiesto" });
  const data = readData();
  const me = ensureUser(data, username);
  const authors = new Set([username, ...(me.following || [])]);
  const list = (settleAndPrune(data), data.posts)
    .filter(p => authors.has(p.author))
    .map(p => ({ ...p, ...computedFields(p) }))
    .sort((a, b) => (a.remainingSeconds - b.remainingSeconds)); // “da salvare” prima
  res.json(list);
});

// Preferiti
app.post("/api/save/:id", (req, res) => {
  const { username } = req.body || {};
  const { id } = req.params;
  if (!username) return res.status(400).json({ error: "username richiesto" });

  const data = readData();
  const user = ensureUser(data, username);
  const post = data.posts.find(p => p.id === id);
  if (!post) return res.status(404).json({ error: "post non trovato" });

  const idx = user.saves.indexOf(id);
  let saved;
  if (idx === -1) { user.saves.push(id); saved = true; } else { user.saves.splice(idx, 1); saved = false; }
  writeData(data);
  res.json({ ok: true, saved, saves: user.saves });
});

app.get("/api/saved", (req, res) => {
  const { username, includeExpired } = req.query || {};
  if (!username) return res.status(400).json({ error: "username richiesto" });

  const data = readData();
  const user = ensureUser(data, username);
  const set = new Set(user.saves || []);
  const includeAll = String(includeExpired || "false") === "true";

  let posts = data.posts.filter(p => set.has(p.id));
  if (!includeAll) posts = pruneExpired(posts);

  const mapped = posts.map(p => ({ ...p, ...computedFields(p) }))
    .sort((a,b)=> new Date(b.createdAt) - new Date(a.createdAt));

  res.json({ ok: true, posts: mapped, savedIds: user.saves });
});

// Error handler upload
app.use((err, req, res, next) => {
  if (err && err.name === "MulterError") {
    return res.status(400).json({ error: `Errore upload (${err.code})` });
  }
  if (err) {
    return res.status(400).json({ error: err.message || "Errore richiesta" });
  }
  next();
});



// ====== Achievements ======
app.get("/api/achievements/:username", (req,res)=>{
  const { username } = req.params;
  const data = readData(); ensureUser(data, username);
  const u = data.users[username];
  // primo investimento
  const investedOnce = (data.posts||[]).some(p => (p.extendedBy||[]).some(e => e.username === username && e.username !== p.author));
  const ach = [];
  if ((u.tokens||0) >= 50) ach.push({ id:'rich50', title:'Saver 50', desc:'Hai raggiunto 50 TIMT' });
  if (investedOnce) ach.push({ id:'invest1', title:'Primo Supporto', desc:'Hai investito su un post' });
  if ((u.badges||[]).includes('Curator')) ach.push({ id:'curator', title:'Curator', desc:'Riconosciuto come Curator' });
  res.json(ach);
});

// ====== Shop ======
app.get("/api/shop/items", (req,res)=>{
  const data = readData();
  res.json(data.shop||[]);
});
app.post("/api/shop/buy", (req,res)=>{
  const { userId, itemId } = req.body || {};
  if (!userId || !itemId) return res.status(400).json({ error:'bad request' });
  const data = readData();
  const u = ensureUser(data, userId);
  const it = (data.shop||[]).find(x=>x.id===itemId);
  if (!it) return res.status(404).json({ error:'item not found' });
  if ((u.tokens||0) < it.price) return res.status(403).json({ error:'TIMT insufficienti' });
  u.tokens -= it.price;
  const [kind,val] = String(it.apply||'').split(':');
  let applied = false;
  if (kind==='theme'){ u.theme = val; applied = true; }
  else if (kind==='badge'){ u.badges = u.badges||[]; if (!u.badges.includes(val)) u.badges.push(val); applied = true; }
  else if (kind==='boost'){ u.inventory = u.inventory||[]; u.inventory.push(val); }
  writeData(data);
  res.json({ ok:true, applied, balance: u.tokens });
});



// Create new challenge
app.post("/api/challenges", (req,res)=>{
  const { userId, title, type, description, startsAt, endsAt, timtPrize, timeBonusMinutes } = req.body || {};
  if (!userId || !title || !type || !startsAt || !endsAt) return res.status(400).json({ error:"bad request" });
  const data = readData(); ensureUser(data, userId);
  const id = "ch_" + Date.now().toString(36);
  const c = {
    id, type, title: String(title).slice(0,120),
    description: String(description||'').slice(0,280),
    startsAt, endsAt,
    rules: type==='quiz' ? { questions:5, seconds:60 } : { maxChars:200 },
    rewards: { timt: Number(timtPrize||10), timeBonusMinutes: Number(timeBonusMinutes||60) },
    participants:[], entries:[], votes:{}, status:'scheduled', creator:userId
  };
  data.challenges = data.challenges || [];
  data.challenges.push(c);
  writeData(data);
  res.json({ ok:true, id });
});

// ====== Challenges ======
function chNow(){ return Date.now(); }
function chStatus(c){ const t=chNow(); if (t< Date.parse(c.startsAt)) return 'scheduled'; if (t> Date.parse(c.endsAt)) return 'finished'; return 'live'; }

app.get("/api/challenges", (req,res)=>{
  const data = readData();
  const list = (data.challenges||[]).map(c => ({ id:c.id, type:c.type, title:c.title, description:c.description, startsAt:c.startsAt, endsAt:c.endsAt, status: chStatus(c) }));
  res.json(list);
});

app.get("/api/challenges/:id", (req,res)=>{
  const data = readData();
  const c = (data.challenges||[]).find(x=>x.id===req.params.id);
  if (!c) return res.status(404).json({ error:'not found' });
  const userId = req.query.userId || 'demo';
  const myVotes = c.votes && c.votes[userId] ? c.votes[userId].count : 0;
  res.json({ ...c, status: chStatus(c), myVotes });
});

app.post("/api/challenges/:id/submit", (req,res)=>{
  const { userId, content } = req.body || {};
  if (!userId || !content) return res.status(400).json({ error:'bad request' });
  const data = readData(); ensureUser(data, userId);
  const c = (data.challenges||[]).find(x=>x.id===req.params.id);
  if (!c) return res.status(404).json({ error:'not found' });
  const st = chStatus(c); if (st==='finished') return res.status(400).json({ error:'challenge finita' });
  c.entries = c.entries||[]; c.entries.push({ id: String(Date.now())+Math.random().toString(36).slice(2,6), author:userId, content: String(content).slice(0,280), votes:0 });
  writeData(data); res.json({ ok:true });
});

app.post("/api/challenges/:id/vote", (req,res)=>{
  const { userId, entryId } = req.body || {};
  if (!userId || !entryId) return res.status(400).json({ error:'bad request' });
  const data = readData(); ensureUser(data, userId);
  const c = (data.challenges||[]).find(x=>x.id===req.params.id);
  if (!c) return res.status(404).json({ error:'not found' });
  if (chStatus(c) !== 'live') return res.status(400).json({ error:'challenge non live' });
  c.votes = c.votes || {};
  if (!c.votes[userId]) c.votes[userId] = { count:0 };
  if (c.votes[userId].count >= 6) return res.status(400).json({ error:'limite voti giornalieri raggiunto' });
  const e = c.entries.find(e => e.id===entryId);
  if (!e) return res.status(404).json({ error:'entry non trovata' });
  e.votes = (e.votes||0) + 1;
  c.votes[userId].count += 1;
  writeData(data); res.json({ ok:true });
});

app.post("/api/challenges/cron", (req,res)=>{
  const data = readData();
  let closed = 0;
  (data.challenges||[]).forEach(c => {
    if (chStatus(c)==='finished' && c.status!=='finished'){
      c.status='finished'; closed++;
      const winner = (c.entries||[]).slice().sort((a,b)=> (b.votes||0)-(a.votes||0))[0];
      if (winner){
        const u = ensureUser(data, winner.author);
        const prize = c.rewards?.timt || 0; u.tokens = (u.tokens||0) + prize;
        // bonus tempo al post più recente dell'utente
        const posts = (data.posts||[]).filter(p => p.author===winner.author).sort((a,b)=> new Date(b.createdAt)-new Date(a.createdAt));
        if (posts.length){ const post = posts[0]; const mins = c.rewards?.timeBonusMinutes || 0; post.expiresAt = new Date(new Date(post.expiresAt).getTime() + mins*60*1000).toISOString(); }
      }
    }
  });
  writeData(data);
  res.json({ ok:true, closed });
});

// ====== Cron globale (decadimento + ROI + finalize challenges) ======
app.post("/api/cron", (req,res)=>{
  const data = readData();
  settleAndPrune(data);
  // finalize challenges pass
  let closed = 0;
  (data.challenges||[]).forEach(c => { if (chStatus(c)==='finished' && c.status!=='finished'){ c.status='finished'; closed++; } });
  writeData(data);
  res.json({ ok:true, closed });
});
// ====== 404 API ======
app.use("/api/*", (_, res) => res.status(404).json({ error: "API non trovata" }));

app.listen(port, () => {
  console.log(`✅ Timely attivo su http://localhost:${port}`);
});
