/**
 * Shop routes for Timely_V2
 * Endpoints:
 *  GET    /api/shop/items
 *  GET    /api/shop/user/:userId
 *  POST   /api/shop/purchase
 */
const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const router = express.Router();

const DATA_PATH = path.resolve(process.cwd(), 'backend', 'data.json');
let writeInProgress = false;

async function readData() {
  try {
    const buf = await fs.readFile(DATA_PATH, 'utf-8');
    const data = JSON.parse(buf);
    data.users = data.users || {};
    data.shop = data.shop || {};
    data.shop.items = data.shop.items || [];
    return data;
  } catch (err) {
    if (err.code === 'ENOENT') return { users: {}, shop: { items: [] } };
    throw err;
  }
}
async function writeData(data) {
  while (writeInProgress) await new Promise(r => setTimeout(r, 15));
  writeInProgress = true;
  try {
    const tmp = DATA_PATH + '.tmp';
    await fs.writeFile(tmp, JSON.stringify(data, null, 2));
    await fs.rename(tmp, DATA_PATH);
  } finally { writeInProgress = false; }
}
function defaultItems() {
  return [
    { id:'theme_ocean', type:'theme', name:'Ocean Theme', description:'Interfaccia fresca ispirata al mare.', priceTIMT:20, payload:{themeKey:'ocean'}, oneTimePurchase:true },
    { id:'theme_neon',  type:'theme', name:'Neon Theme',  description:'Look neon brillante per la UI.',      priceTIMT:20, payload:{themeKey:'neon'},  oneTimePurchase:true },
    { id:'badge_curator', type:'badge', name:'Curator Badge', description:'Badge profilo "Curator".', priceTIMT:35, payload:{badgeKey:'curator'}, oneTimePurchase:true },
    { id:'boost_start_30', type:'boost', name:'Boost: Start +30', description:'+30 min al prossimo post.', priceTIMT:12, payload:{boostKey:'start_plus_30', minutes:30}, oneTimePurchase:false }
  ];
}
function ensureUserShape(user) {
  if (!user.inventory) user.inventory = {};
  user.inventory.themes = user.inventory.themes || [];
  user.inventory.badges = user.inventory.badges || [];
  user.inventory.boosts = user.inventory.boosts || [];
  if (typeof user.tokens !== 'number') user.tokens = 0;
  return user;
}

router.use(express.json());

router.get('/items', async (_req, res) => {
  const data = await readData();
  if (!data.shop.items || data.shop.items.length === 0) {
    data.shop.items = defaultItems();
    await writeData(data);
  }
  res.json({ ok: true, items: data.shop.items });
});

router.get('/user/:userId', async (req, res) => {
  const { userId } = req.params;
  if (!userId) return res.status(400).json({ ok:false, error:'Missing userId' });
  const data = await readData();
  data.users[userId] = ensureUserShape(data.users[userId] || { tokens: 50, inventory: {} });
  await writeData(data);
  res.json({ ok:true, user: data.users[userId] });
});

router.post('/purchase', async (req, res) => {
  const { userId, itemId } = req.body || {};
  if (!userId || !itemId) return res.status(400).json({ ok:false, error:'Missing userId or itemId' });
  const data = await readData();
  data.users[userId] = ensureUserShape(data.users[userId] || { tokens: 50, inventory: {} });
  const u = data.users[userId];
  const item = (data.shop.items || []).find(i => i.id === itemId) || defaultItems().find(i=>i.id===itemId);
  if (!item) return res.status(404).json({ ok:false, error:'Item not found' });

  if (item.oneTimePurchase) {
    const alreadyOwned =
      (item.type==='theme' && u.inventory.themes.includes(item.payload.themeKey)) ||
      (item.type==='badge' && u.inventory.badges.includes(item.payload.badgeKey));
    if (alreadyOwned) return res.status(409).json({ ok:false, error:'Già acquistato' });
  }
  if (u.tokens < item.priceTIMT) return res.status(402).json({ ok:false, error:'Fondi TIMT insufficienti' });

  u.tokens -= item.priceTIMT;
  if (item.type==='theme') {
    if (!u.inventory.themes.includes(item.payload.themeKey)) u.inventory.themes.push(item.payload.themeKey);
  } else if (item.type==='badge') {
    if (!u.inventory.badges.includes(item.payload.badgeKey)) u.inventory.badges.push(item.payload.badgeKey);
  } else if (item.type==='boost') {
    const key = item.payload.boostKey;
    const existing = u.inventory.boosts.find(b => b.key === key);
    if (existing) existing.count += 1; else u.inventory.boosts.push({ key, minutes:item.payload.minutes, count:1 });
  }

  data.shop.history = data.shop.history || [];
  data.shop.history.push({ id:`p_${Date.now()}`, userId, itemId, at:new Date().toISOString(), priceTIMT:item.priceTIMT });
  await writeData(data);
  res.json({ ok:true, user:u, item });
});

module.exports = router;
