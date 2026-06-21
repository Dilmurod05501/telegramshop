import { createServer } from "node:http";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env.local
function loadEnvFile(filename) {
  const envPath = path.join(__dirname, filename);
  if (!existsSync(envPath)) return;
  const content = readFileSync(envPath, "utf8");
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const equalsIndex = trimmed.indexOf("=");
    if (equalsIndex === -1) continue;
    const key = trimmed.slice(0, equalsIndex).trim();
    const value = trimmed.slice(equalsIndex + 1).trim();
    if (key && !process.env[key]) process.env[key] = value;
  }
}
loadEnvFile(".env.local");

const PORT = Number(process.env.PORT || 8787);
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "";
const CHAT_ID = process.env.TELEGRAM_CHAT_ID || "";
const CLIENT_BOT_TOKEN = process.env.CLIENT_BOT_TOKEN || "";
const DIST_DIR = path.join(__dirname, "dist");

// Default catalog
const DEFAULT_CATALOG = {
  categories: [
    { name: "Vibroizolyatsiya", sample: "vibro" },
    { name: "Shumoizolyatsiya", sample: "shumo" },
    { name: "Teploizolyatsiya", sample: "teplo" },
    { name: "Vatin", sample: "vatin" },
    { name: "Karpet", sample: "karpet" },
    { name: "Kley va valiklar", sample: "tools" },
  ],
  products: [
    { id: "legend-vibro", name: "Legend Vibroizolyatsiya Gilami", price: 39.99, theme: "purple", favorite: true, category: "Vibroizolyatsiya", widthCm: 120, heightCm: 200, thicknessMm: 10 },
    { id: "aero-gold", name: "Aero Gold Shovqin Gilami", price: 29.99, theme: "gold", favorite: true, category: "Shumoizolyatsiya", widthCm: 100, heightCm: 180, thicknessMm: 8 },
    { id: "serio-red", name: "Serio Qizil Ko'pik", price: 34.99, theme: "red", favorite: false, category: "Vibroizolyatsiya", widthCm: 110, heightCm: 190, thicknessMm: 12 },
    { id: "indigo-noise", name: "Indigo Shovqin Gilami", price: 44.99, theme: "black", favorite: true, category: "Shumoizolyatsiya", widthCm: 90, heightCm: 170, thicknessMm: 15 },
    { id: "thermo-lite", name: "Thermo Lite Izolyatsiya", price: 24.99, theme: "sand", favorite: false, category: "Teploizolyatsiya", widthCm: 120, heightCm: 220, thicknessMm: 6 },
    { id: "soft-vatin", name: "Soft Pro Vatin", price: 18.99, theme: "silver", favorite: false, category: "Vatin", widthCm: 100, heightCm: 150, thicknessMm: 5 },
    { id: "premium-karpet", name: "Premium Karpet Qoplama", price: 21.99, theme: "gray", favorite: true, category: "Karpet", widthCm: 140, heightCm: 200, thicknessMm: 7 },
    { id: "roller-glue-set", name: "Kley va Valik To'plami", price: 14.99, theme: "rose", favorite: false, category: "Kley va valiklar", widthCm: 30, heightCm: 30, thicknessMm: 0 },
  ],
};

// ===== PostgreSQL =====
let pool = null;

async function initDb() {
  if (!process.env.DATABASE_URL) {
    console.log("⚠️ DATABASE_URL yo'q — fayl tizimi ishlatiladi");
    return false;
  }

  try {
    const { default: pg } = await import("pg");
    const { Pool } = pg;

    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false },
    });

    await pool.query(`
      CREATE TABLE IF NOT EXISTS orders (
        id TEXT PRIMARY KEY,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        user_id TEXT,
        customer JSONB,
        items JSONB,
        total NUMERIC
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS catalog (
        id INTEGER PRIMARY KEY DEFAULT 1,
        data JSONB NOT NULL
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS promo_codes (
        code TEXT PRIMARY KEY,
        type TEXT DEFAULT 'wholesale'
      );
    `);

    const exists = await pool.query(
      "SELECT id FROM catalog WHERE id = 1"
    );

    if (exists.rows.length === 0) {
      await pool.query(
        "INSERT INTO catalog (id, data) VALUES (1, $1)",
        [JSON.stringify(DEFAULT_CATALOG)]
      );
    }

    console.log("✅ PostgreSQL database tayyor");
    return true;
  } catch (err) {
    console.error("❌ Database xatosi:", err.message);
    pool = null;
    return false;
  }
}

async function getPromoCodes() {
  if (!pool) return [];

  const result = await pool.query(
    "SELECT * FROM promo_codes ORDER BY code"
  );

  return result.rows;
}

async function savePromoCode(code, type = "wholesale") {
  if (!pool) return;

  await pool.query(
    `INSERT INTO promo_codes(code,type)
     VALUES($1,$2)
     ON CONFLICT(code) DO NOTHING`,
    [code, type]
  );
}
// ===== File fallback =====
const STATE_DIR = path.join(__dirname, ".server-state");
const ORDERS_FILE = path.join(STATE_DIR, "orders.json");
const CATALOG_FILE = path.join(STATE_DIR, "catalog.json");

function ensureStateDir() {
  if (!existsSync(STATE_DIR)) mkdirSync(STATE_DIR, { recursive: true });
}

function readFileJson(filePath, defaultVal) {
  try { return JSON.parse(readFileSync(filePath, "utf8")); } catch { return defaultVal; }
}

// ===== Orders =====
async function getOrders(userId) {
  if (pool) {
    const res = userId
      ? await pool.query("SELECT * FROM orders WHERE user_id=$1 ORDER BY created_at DESC", [String(userId)])
      : await pool.query("SELECT * FROM orders ORDER BY created_at DESC LIMIT 200");
    return res.rows.map(r => ({ id: r.id, createdAt: r.created_at, userId: r.user_id, customer: r.customer, items: r.items, total: Number(r.total) }));
  }
  const all = readFileJson(ORDERS_FILE, []);
  return userId ? all.filter(o => String(o.userId) === String(userId)) : all;
}

async function saveOrder(order) {
  if (pool) {
    await pool.query(
      `INSERT INTO orders (id, created_at, user_id, customer, items, total)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (id) DO UPDATE SET customer=$4, items=$5, total=$6`,
      [order.id, order.createdAt, order.userId, JSON.stringify(order.customer), JSON.stringify(order.items), order.total]
    );
    return;
  }
  ensureStateDir();
  const all = readFileJson(ORDERS_FILE, []);
  all.unshift(order);
  writeFileSync(ORDERS_FILE, JSON.stringify(all.slice(0, 200), null, 2));
}

// ===== Catalog =====
async function getCatalog() {
  if (pool) {
    const res = await pool.query("SELECT data FROM catalog WHERE id=1");
    return res.rows[0]?.data || DEFAULT_CATALOG;
  }
  return readFileJson(CATALOG_FILE, DEFAULT_CATALOG);
}

async function saveCatalog(catalog) {
  if (pool) {
    await pool.query("UPDATE catalog SET data=$1 WHERE id=1", [JSON.stringify(catalog)]);
    return;
  }
  ensureStateDir();
  writeFileSync(CATALOG_FILE, JSON.stringify(catalog, null, 2));
}


// ===== Telegram =====
function formatSom(value) {
  return `${Math.round(Number(value) || 0).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".")} so'm`;
}

function buildTelegramText(order) {
  const lines = [
    `🛒 Yangi buyurtma #${order.id}`,
    `📅 Sana: ${new Date(order.createdAt).toLocaleString("uz-UZ")}`,
    `👤 Mijoz: ${order.customer?.name || "-"}`,
    `📞 Telefon: ${order.customer?.phone || "-"}`,
    `📍 Lokatsiya: ${order.customer?.location || "-"}`,
    "",
    ...((order.items || []).map((item) => {
      let line = `• ${item.name}`;
      if (item.thicknessMm) line += ` (${item.thicknessMm}mm)`;
      line += ` × ${item.qty} = ${formatSom(item.total)}`;
      return line;
    })),
    "",
    `💰 Jami: ${formatSom(order.total)}`,
  ];
  return lines.join("\n");
}

async function sendTelegramOrder(order) {
  if (!BOT_TOKEN || !CHAT_ID) return { ok: false };
  const response = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: CHAT_ID, text: buildTelegramText(order), disable_web_page_preview: true }),
  });
  return response.json();
}

async function sendClientMessage(chatId, text) {
  if (!CLIENT_BOT_TOKEN) return { ok: false, error: "CLIENT_BOT_TOKEN yo'q" };
  const response = await fetch(`https://api.telegram.org/bot${CLIENT_BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text }),
  });
  return response.json();
}

// ===== SSE broadcast =====
const sseClients = new Set();

function broadcast(event, data, target = "all") {
  const msg = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const client of sseClients) {
    if (target === "all" || client.type === target) {
      try { client.res.write(msg); } catch {}
    }
  }
}

// ===== HTTP =====
function contentType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return ({ ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webmanifest": "application/manifest+json", ".json": "application/json" }[ext] || "application/octet-stream");
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8", "Access-Control-Allow-Origin": "*" });
  res.end(JSON.stringify(payload));
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : {};
}

// ===== Server =====
const server = createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);

  if (req.method === "OPTIONS") {
    res.writeHead(204, { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET,POST,DELETE,OPTIONS", "Access-Control-Allow-Headers": "Content-Type" });
    res.end();
    return;
  }

  if (url.pathname === "/api/health") {
    sendJson(res, 200, { ok: true, db: !!pool });
    return;
  }

  // SSE — real-time events
  if (url.pathname === "/api/events" && req.method === "GET") {
    const clientType = url.searchParams.get("type") === "admin" ? "admin" : "all";
    res.writeHead(200, {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
      "Access-Control-Allow-Origin": "*",
    });
    res.write(": connected\n\n");
    const client = { res, type: clientType };
    sseClients.add(client);
    const heartbeat = setInterval(() => {
      try { res.write(": ping\n\n"); } catch {}
    }, 25000);
    req.on("close", () => {
      clearInterval(heartbeat);
      sseClients.delete(client);
    });
    return;
  }

  if (url.pathname === "/api/orders" && req.method === "GET") {
    try {
      const orders = await getOrders(url.searchParams.get("userId"));
      sendJson(res, 200, { ok: true, orders });
    } catch (err) {
      sendJson(res, 500, { ok: false, error: err.message });
    }
    return;
  }

  if (url.pathname === "/api/orders" && req.method === "POST") {
    try {
      const body = await readBody(req);
      const order = {
        id: body.id || `order-${Date.now()}`,
        createdAt: body.createdAt || new Date().toISOString(),
        userId: body.userId ?? "browser",
        customer: body.customer || {},
        items: Array.isArray(body.items) ? body.items : [],
        total: Number(body.total) || 0,
      };
      await saveOrder(order);
      broadcast("new-order", order, "admin");
      const telegramResult = await sendTelegramOrder(order);
      sendJson(res, 200, { ok: true, telegramOk: Boolean(telegramResult?.ok), order });
    } catch (err) {
      sendJson(res, 400, { ok: false, error: err.message });
    }
    return;
  }

  if (url.pathname === "/api/catalog" && req.method === "GET") {
    try {
      sendJson(res, 200, { ok: true, catalog: await getCatalog() });
    } catch (err) {
      sendJson(res, 500, { ok: false, error: err.message });
    }
    return;
  }

  if (url.pathname === "/api/catalog" && req.method === "POST") {
    try {
      const body = await readBody(req);
      const nextCatalog = body.catalog || body;
      if (!Array.isArray(nextCatalog.categories) || !Array.isArray(nextCatalog.products)) {
        sendJson(res, 400, { ok: false, error: "Invalid catalog" });
        return;
      }
      await saveCatalog(nextCatalog);
      broadcast("catalog-updated", nextCatalog, "all");
      sendJson(res, 200, { ok: true, catalog: nextCatalog });
    } catch (err) {
      sendJson(res, 400, { ok: false, error: err.message });
    }
    return;
  }
  if (url.pathname === "/api/notify-client" && req.method === "POST") {
    try {
      const body = await readBody(req);
      const chatId = String(body.userId || "").trim();
      const text = String(body.text || "").trim();
      if (!chatId || !text) {
        sendJson(res, 400, { ok: false, error: "userId va text talab qilinadi" });
        return;
      }
      const result = await sendClientMessage(chatId, text);
      sendJson(res, 200, { ok: Boolean(result?.ok), result });
    } catch (err) {
      sendJson(res, 400, { ok: false, error: err.message });
    }
    return;
  }

  // SHU YERDAN BOSHLAB QO'SHING

if (url.pathname === "/api/promocodes" && req.method === "GET") {
  try {
    const promoCodes = await getPromoCodes();

    sendJson(res, 200, {
      ok: true,
      promoCodes
    });
  } catch (err) {
    sendJson(res, 500, {
      ok: false,
      error: err.message
    });
  }
  return;
}

if (url.pathname === "/api/promocodes" && req.method === "POST") {
  try {
    const body = await readBody(req);

    await savePromoCode(
      body.code,
      body.type || "wholesale"
    );

    sendJson(res, 200, {
      ok: true
    });
  } catch (err) {
    sendJson(res, 500, {
      ok: false,
      error: err.message
    });
  }
  return;
}
if (
  url.pathname.startsWith("/api/promocodes/") &&
  req.method === "DELETE"
) {
  try {
    const code = decodeURIComponent(
      url.pathname.replace("/api/promocodes/", "")
    );

    await pool.query(
      "DELETE FROM promo_codes WHERE code = $1",
      [code]
    );

    sendJson(res, 200, {
      ok: true
    });
  } catch (err) {
    sendJson(res, 500, {
      ok: false,
      error: err.message
    });
  }
  return;
}
  if (req.method === "GET") {
    const safePath = url.pathname === "/" ? "/index.html" : url.pathname;
    const filePath = path.join(DIST_DIR, safePath);
    if (existsSync(filePath)) {
      res.writeHead(200, { "Content-Type": contentType(filePath) });
      res.end(readFileSync(filePath));
      return;
    }
    const indexPath = path.join(DIST_DIR, "index.html");
    if (existsSync(indexPath)) {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(readFileSync(indexPath));
      return;
    }
  }

  sendJson(res, 404, { ok: false, error: "Not found" });
});

initDb().then(() => {
  server.listen(PORT, () => {
    console.log(`✅ Server ishga tushdi: http://127.0.0.1:${PORT}`);
  });
});
