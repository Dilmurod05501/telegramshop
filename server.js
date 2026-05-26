import { createServer } from "node:http";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { categoryCards as defaultCategoryCards, products as defaultProducts } from "./src/data/products.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function loadEnvFile(filename) {
  const envPath = path.join(__dirname, filename);

  if (!existsSync(envPath)) {
    return;
  }

  const content = readFileSync(envPath, "utf8");

  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const equalsIndex = trimmed.indexOf("=");
    if (equalsIndex === -1) {
      continue;
    }

    const key = trimmed.slice(0, equalsIndex).trim();
    const value = trimmed.slice(equalsIndex + 1).trim();

    if (key && !process.env[key]) {
      process.env[key] = value;
    }
  }
}

loadEnvFile(".env.local");

const PORT = Number(process.env.PORT || 8787);
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || process.env.VITE_TELEGRAM_BOT_TOKEN || "";
const CHAT_ID = process.env.TELEGRAM_CHAT_ID || process.env.VITE_TELEGRAM_CHAT_ID || "";
const DIST_DIR = path.join(__dirname, "dist");
const STATE_DIR = path.join(__dirname, ".server-state");
const ORDERS_FILE = path.join(STATE_DIR, "orders.json");
const CATALOG_FILE = path.join(STATE_DIR, "catalog.json");

if (!existsSync(STATE_DIR)) {
  mkdirSync(STATE_DIR, { recursive: true });
}

function readOrders() {
  try {
    if (!existsSync(ORDERS_FILE)) {
      return [];
    }

    const parsed = JSON.parse(readFileSync(ORDERS_FILE, "utf8"));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function getDefaultCatalog() {
  return {
    categories: defaultCategoryCards.map((category) => ({ ...category })),
    products: defaultProducts.map((product) => ({ ...product })),
  };
}

function readCatalog() {
  try {
    if (!existsSync(CATALOG_FILE)) {
      return getDefaultCatalog();
    }

    const parsed = JSON.parse(readFileSync(CATALOG_FILE, "utf8"));
    if (!parsed || !Array.isArray(parsed.categories) || !Array.isArray(parsed.products)) {
      return getDefaultCatalog();
    }

    return {
      categories: parsed.categories.map((category) => ({ ...category })),
      products: parsed.products.map((product) => ({ ...product })),
    };
  } catch {
    return getDefaultCatalog();
  }
}

function getOrderOwnerKey(order) {
  if (order?.userId === null || order?.userId === undefined || order?.userId === "") {
    return "browser-preview";
  }

  return String(order.userId);
}

function saveOrders(orders) {
  writeFileSync(ORDERS_FILE, JSON.stringify(orders, null, 2), "utf8");
}

function saveCatalog(nextCatalog) {
  writeFileSync(CATALOG_FILE, JSON.stringify(nextCatalog, null, 2), "utf8");
}

function formatSom(value) {
  const amount = Number(value) || 0;
  return `${Math.round(amount)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ".")} so'm`;
}

function buildTelegramText(order) {
  const lines = [
    `Yangi buyurtma #${order.id}`,
    `Sana: ${new Date(order.createdAt).toLocaleString("uz-UZ")}`,
    `Mijoz: ${order.customer?.name || "-"}`,
    `Telefon: ${order.customer?.phone || "-"}`,
    `Lokatsiya: ${order.customer?.location || "-"}`,
    "",
    ...((order.items || []).map((item) => `- ${item.name} x${item.qty} = ${formatSom(item.total)}`)),
    "",
    `Jami: ${formatSom(order.total)}`,
  ];

  return lines.join("\n");
}

async function sendTelegramOrder(order) {
  if (!BOT_TOKEN || !CHAT_ID) {
    console.log("[order] missing Telegram config");
    return { ok: false, reason: "missing-config", description: "Telegram bot token yoki chat id yo'q" };
  }

  const response = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      chat_id: CHAT_ID,
      text: buildTelegramText(order),
      disable_web_page_preview: true,
    }),
  });

  const payload = await response.json();
  console.log("[telegram] response", JSON.stringify(payload));

  if (!response.ok) {
    return {
      ok: false,
      reason: "telegram-api",
      description: payload?.description || "Telegram API xatosi",
      payload,
    };
  }

  return payload;
}

function contentType(filePath) {
  const ext = path.extname(filePath).toLowerCase();

  return (
    {
      ".html": "text/html; charset=utf-8",
      ".js": "text/javascript; charset=utf-8",
      ".css": "text/css; charset=utf-8",
      ".svg": "image/svg+xml",
      ".png": "image/png",
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
      ".webmanifest": "application/manifest+json",
      ".json": "application/json; charset=utf-8",
    }[ext] || "application/octet-stream"
  );
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
  });
  res.end(JSON.stringify(payload));
}

async function readBody(req) {
  const chunks = [];

  for await (const chunk of req) {
    chunks.push(chunk);
  }

  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : {};
}

const orders = readOrders();
let catalog = readCatalog();

const server = createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);

  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    });
    res.end();
    return;
  }

  if (url.pathname === "/api/health") {
    sendJson(res, 200, { ok: true });
    return;
  }

  if (url.pathname === "/api/orders" && req.method === "GET") {
    const userId = url.searchParams.get("userId");
    const filteredOrders =
      userId === null || userId === ""
        ? orders
        : orders.filter((order) => getOrderOwnerKey(order) === String(userId));

    sendJson(res, 200, { ok: true, orders: filteredOrders });
    return;
  }

  if (url.pathname === "/api/catalog" && req.method === "GET") {
    sendJson(res, 200, { ok: true, catalog });
    return;
  }

  if (url.pathname === "/api/catalog" && req.method === "POST") {
    try {
      const body = await readBody(req);
      const nextCatalog = body.catalog || body;

      if (!nextCatalog || !Array.isArray(nextCatalog.categories) || !Array.isArray(nextCatalog.products)) {
        sendJson(res, 400, { ok: false, error: "Invalid catalog payload" });
        return;
      }

      catalog = {
        categories: nextCatalog.categories.map((category) => ({ ...category })),
        products: nextCatalog.products.map((product) => ({ ...product })),
      };

      saveCatalog(catalog);
      sendJson(res, 200, { ok: true, catalog });
    } catch (error) {
      sendJson(res, 400, { ok: false, error: error instanceof Error ? error.message : "Bad request" });
    }
    return;
  }

  if (url.pathname === "/api/orders" && req.method === "POST") {
    try {
      const body = await readBody(req);
      const order = {
        id: body.id || `order-${Date.now()}`,
        createdAt: body.createdAt || new Date().toISOString(),
        userId: body.userId ?? "browser-preview",
        customer: body.customer || {},
        items: Array.isArray(body.items) ? body.items : [],
        total: Number(body.total) || 0,
      };

      orders.unshift(order);
      while (orders.length > 100) {
        orders.pop();
      }
      saveOrders(orders);
      console.log("[order] received", JSON.stringify(order));

      const telegramResult = await sendTelegramOrder(order);
      console.log(
        "[order] telegram result",
        JSON.stringify({
          ok: Boolean(telegramResult?.ok),
          reason: telegramResult?.reason || null,
          description: telegramResult?.description || null,
        }),
      );
      sendJson(res, 200, {
        ok: true,
        telegramOk: Boolean(telegramResult?.ok),
        telegramReason: telegramResult?.reason || null,
        telegramDescription: telegramResult?.description || null,
        order,
      });
    } catch (error) {
      sendJson(res, 400, { ok: false, error: error instanceof Error ? error.message : "Bad request" });
    }
    return;
  }

  if (req.method === "GET") {
    const safePath = url.pathname === "/" ? "/index.html" : url.pathname;
    const filePath = path.join(DIST_DIR, safePath);

    if (existsSync(filePath) && !filePath.endsWith(path.sep)) {
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

server.listen(PORT, () => {
  console.log(`Server running on http://127.0.0.1:${PORT}`);
});
