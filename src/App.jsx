import {
  BarChart3,
  History,
  Home,
  MapPin,
  Package,
  Pencil,
  Search,
  Shield,
  ShoppingBag,
  ShoppingCart,
  Trash2,
  Users,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState, useCallback, memo } from "react";
import { categoryCards as defaultCategoryCards, products as defaultProducts } from "./data/products.js";
const ALL_PRODUCTS = "Barcha mahsulotlar";
const DEFAULT_CUSTOMER = { name: "", phone: "", location: "" };
const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ??
  (typeof window !== "undefined" && ["localhost", "127.0.0.1"].includes(window.location.hostname)
    ? "http://127.0.0.1:8787" : "");
const THEME_OPTIONS = ["purple", "gold", "red", "black", "sand", "silver", "gray", "rose"];
const CATALOG_CACHE_KEY = "catalog_cache_v2";
const CATALOG_CACHE_TTL = 30000;

function formatSom(value) {
  return `${Math.round(Number(value) || 0).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".")} so'm`;
}
function getDefaultFavorites() {
  return Object.fromEntries(defaultProducts.map((p) => [p.id, p.favorite]));
}
function getDefaultCatalog() {
  return { categories: defaultCategoryCards, products: defaultProducts };
}
function createCategoryDraft() { return { name: "", image: "" }; }
function createProductDraft(categories) {
  return { name: "", price: "", category: categories[0]?.name ?? "", theme: "purple", image: "", thicknessMm: "", widthCm: "", heightCm: "", pricePerMeter: "", availableMeters: "", wholesalePrice: "" };
}
function getTelegramUser() {
  if (typeof window === "undefined") return null;
  return window.Telegram?.WebApp?.initDataUnsafe?.user ?? null;
}
function getPathname() {
  if (typeof window === "undefined") return "/";
  return window.location.pathname.toLowerCase();
}
function usePathname() {
  const [pathname, setPathname] = useState(() => getPathname());
  useEffect(() => {
    function handlePopState() { setPathname(getPathname()); }
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);
  return pathname;
}
function getStorageScope(user) { return user?.id ? `telegram-${user.id}` : "browser-preview"; }
function getStorageKey(scope, name) { return `telegram-isolation-market:${scope}:${name}`; }
function readStoredValue(scope, name, fallback) {
  if (typeof window === "undefined") return fallback;
  try {
    const value = window.localStorage.getItem(getStorageKey(scope, name));
    return value ? JSON.parse(value) : fallback;
  } catch { return fallback; }
}
function writeStoredValue(scope, name, value) {
  if (typeof window === "undefined") return;
  try { window.localStorage.setItem(getStorageKey(scope, name), JSON.stringify(value)); } catch {}
}
function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });
}
function normalizeCategoryInput(category) {
  return { name: category.name.trim(), image: category.image || "", sample: category.sample || "vibro" };
}
function getCoverStyle(image) {
  if (!image) return undefined;
  return { backgroundImage: `url(${image})`, backgroundPosition: "center", backgroundSize: "cover" };
}
function normalizeProductInput(product) {
  const name = product.name.trim();
  const category = product.category.trim();
  const id = String(product.id ?? "").trim() || `product-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
  const thicknessMm = Number(product.thicknessMm) || 0;
  const widthCm = Number(String(product.widthCm ?? "").replace(/[^\d.]/g, "")) || 0;
  const heightCm = Number(String(product.heightCm ?? "").replace(/[^\d.]/g, "")) || 0;
  const price = Number(String(product.price ?? "").replace(/[^\d.]/g, ""));
  const pricePerMeter = Number(String(product.pricePerMeter ?? "").replace(/[^\d.]/g, "")) || 0;
  const availableMeters = Number(String(product.availableMeters ?? "").replace(/[^\d.]/g, "")) || 0;
  const wholesalePrice = Number(String(product.wholesalePrice ?? "").replace(/[^\d.]/g, "")) || 0;
  return {
    id, name, price: Number.isFinite(price) ? price : 0,
    theme: product.theme || "purple", favorite: Boolean(product.favorite),
    category, image: product.image || "", thicknessMm, widthCm, heightCm,
    pricePerMeter, availableMeters, wholesalePrice,
    parameters: [widthCm > 0 && heightCm > 0 ? `${widthCm} x ${heightCm} cm` : null, thicknessMm > 0 ? `${thicknessMm} mm` : null].filter(Boolean),
  };
}
function getCatalogSummary(catalog) {
  return { categoryCount: catalog.categories.length, productCount: catalog.products.length };
}

// ===== API =====
async function sendOrderToBackend(order) {
  const baseUrl = API_BASE_URL.replace(/\/$/, "");
  const response = await fetch(`${baseUrl}/api/orders`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(order) });
  return response.json();
}
async function fetchOrdersFromBackend(userId = "") {
  const baseUrl = API_BASE_URL.replace(/\/$/, "");
  const query = userId ? `?userId=${encodeURIComponent(userId)}` : "";
  const response = await fetch(`${baseUrl}/api/orders${query}`);
  const payload = await response.json();
  return response.ok ? payload.orders ?? [] : [];
}
async function fetchCatalogFromBackend() {
  // 1. Server inject qilgan ma'lumot (eng tez)
  if (window.__CATALOG__) {
    const injected = window.__CATALOG__;
    window.__CATALOG__ = null;
    try { localStorage.setItem(CATALOG_CACHE_KEY, JSON.stringify({ ts: Date.now(), data: injected })); } catch {}
    return injected;
  }
  // 2. Cache dan
  try {
    const cached = JSON.parse(localStorage.getItem(CATALOG_CACHE_KEY) || "null");
    if (cached && Date.now() - cached.ts < CATALOG_CACHE_TTL) return cached.data;
  } catch {}
  // 3. Backend dan
  const baseUrl = API_BASE_URL.replace(/\/$/, "");
  const response = await fetch(`${baseUrl}/api/catalog`, { cache: "no-store" });
  const payload = await response.json();
  const catalog = response.ok ? payload.catalog ?? null : null;
  if (catalog) {
    try { localStorage.setItem(CATALOG_CACHE_KEY, JSON.stringify({ ts: Date.now(), data: catalog })); } catch {}
  }
  return catalog;
}
async function saveCatalogToBackend(catalog) {
  try { localStorage.removeItem(CATALOG_CACHE_KEY); } catch {}
  const baseUrl = API_BASE_URL.replace(/\/$/, "");
  const response = await fetch(`${baseUrl}/api/catalog`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ catalog }) });
  return response.json();
}
function useServerEvents(onEvent) {
  useEffect(() => {
    const baseUrl = API_BASE_URL.replace(/\/$/, "");
    const type = onEvent.isAdmin ? "admin" : "all";
    let es;
    let retryTimer;
    function connect() {
      es = new EventSource(`${baseUrl}/api/events?type=${type}`);
      es.addEventListener("new-order", (e) => {
        try { onEvent.onNewOrder?.(JSON.parse(e.data)); } catch {}
      });
      es.addEventListener("catalog-updated", (e) => {
        try { onEvent.onCatalogUpdated?.(JSON.parse(e.data)); } catch {}
      });
      es.onerror = () => {
        es.close();
        retryTimer = setTimeout(connect, 5000);
      };
    }
    connect();
    return () => { es?.close(); clearTimeout(retryTimer); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onEvent.isAdmin]);
}

async function fetchPromoCodes() {
  const baseUrl = API_BASE_URL.replace(/\/$/, "");

  const response = await fetch(
    `${baseUrl}/api/promocodes`
  );

  const payload = await response.json();

  return payload.promoCodes || [];
}
// ===== MEMO PRODUCT CARD =====
function ImageLightbox({ src, onClose }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="lightbox-overlay" onClick={onClose}>
      <img className="lightbox-img" src={src} alt="" onClick={(e) => e.stopPropagation()} />
    </div>
  );
}

const ProductCard = memo(function ProductCard({ product, qty, meters, changeQty, setQty, setMeters, activePromo, onImageClick }) {
  const hasMeter = product.pricePerMeter > 0;
  const effectiveMeters = hasMeter ? (meters ?? 1) : null;
  const parsedMeters = parseFloat(String(effectiveMeters).replace(",", ".")) || 1;
  const isWholesale = activePromo && product.wholesalePrice > 0;
  const basePrice = isWholesale ? product.wholesalePrice : product.price;
  const baseMeterPrice = isWholesale ? product.wholesalePrice : product.pricePerMeter;
  const displayPrice = hasMeter ? baseMeterPrice * parsedMeters : basePrice;
  const pid = product.id;

  return (
    <article className="product-card">
      <div
        className={`product-image mat ${product.image ? "product-image-uploaded" : product.theme}`}
        style={getCoverStyle(product.image)}
        onClick={product.image ? () => onImageClick(product.image) : undefined}
        role={product.image ? "button" : undefined}
        aria-label={product.image ? `${product.name} rasmini kattalashtirish` : undefined}
      />
      <h2>{product.name}</h2>
      <div className="product-meta-line"><span>{product.category}</span></div>
      {product.widthCm > 0 && product.heightCm > 0 && (
        <div className="product-spec-line"><span className="product-spec-label">Razmeri</span><span className="product-spec-value">{product.widthCm} x {product.heightCm} cm</span></div>
      )}
      {product.thicknessMm > 0 && (
        <div className="product-spec-line"><span className="product-spec-label">Qalinligi</span><span className="product-spec-value">{product.thicknessMm} mm</span></div>
      )}
      {hasMeter && (
        <div className="product-spec-line"><span className="product-spec-label">Narx/metr</span><span className="product-spec-value">{isWholesale ? <><s style={{color:"#aaa",fontSize:11}}>{formatSom(product.pricePerMeter)}</s> <span style={{color:"#2e7d32",fontWeight:700}}>{formatSom(product.wholesalePrice)}</span></> : formatSom(product.pricePerMeter)}</span></div>
      )}
      {hasMeter && product.availableMeters > 0 && (
        <div className="product-spec-line"><span className="product-spec-label">Mavjud</span><span className="product-spec-value">{product.availableMeters} m</span></div>
      )}
      <div className="card-footer">
        <div className="card-price-block">
          {isWholesale && <span className="wholesale-badge">OPTOM</span>}
          {isWholesale && !hasMeter && <s className="card-old-price">{formatSom(product.price)}</s>}
          <strong className="card-price">{formatSom(displayPrice)}</strong>
        </div>
        <div className="stepper" aria-label="Miqdor">
          <button onClick={() => hasMeter ? setMeters(pid, Math.max(0.5, parsedMeters - 0.5)) : changeQty(pid, -1)} type="button">-</button>
          {hasMeter ? (
            <input
              aria-label={`${product.name} uchun metr miqdori`}
              inputMode="decimal"
              type="text"
              value={effectiveMeters}
              onChange={(e) => setMeters(pid, e.target.value.replace(",", "."))}
              onBlur={(e) => {
                const val = parseFloat(e.target.value.replace(",", "."));
                setMeters(pid, isNaN(val) || val <= 0 ? 1 : val);
              }}
              className="meter-stepper-input"
            />
          ) : (
            <input
              aria-label={`${product.name} miqdori`}
              inputMode="numeric"
              onChange={(e) => setQty(pid, e.target.value)}
              onBlur={(e) => { if (e.target.value === "" || e.target.value === "0") setQty(pid, 0); }}
              type="number"
              min="0"
              value={qty === 0 ? "" : qty}
              placeholder="0"
            />
          )}
          <button onClick={() => hasMeter ? setMeters(pid, parsedMeters + 0.5) : changeQty(pid, 1)} type="button">+</button>
        </div>
      </div>
    </article>
  );
});


// JS-driven spinner — CSS animatsiyaga bog'liq emas
function LocSpinner() {
  const [deg, setDeg] = useState(0);
  useEffect(() => {
    let angle = 0;
    const id = setInterval(() => {
      angle = (angle + 18) % 360;
      setDeg(angle);
    }, 50);
    return () => clearInterval(id);
  }, []);
  return (
    <span
      aria-hidden="true"
      style={{
        display: "inline-block",
        width: 14,
        height: 14,
        borderRadius: "50%",
        border: "2.5px solid currentColor",
        borderTopColor: "transparent",
        transform: `rotate(${deg}deg)`,
        flexShrink: 0,
        verticalAlign: "middle",
      }}
    />
  );
}

function ClientOrdersPanel({ adminOrders, formatSom }) {
  const [dateRanges, setDateRanges] = useState({});
  const [comments, setComments] = useState({});
  const [sendStatus, setSendStatus] = useState({});
  const setRange = (key, field, val) =>
    setDateRanges((prev) => ({ ...prev, [key]: { ...prev[key], [field]: val } }));

  async function sendComment(key, userId) {
    const text = (comments[key] || "").trim();
    if (!text || !userId) return;
    setSendStatus((p) => ({ ...p, [key]: "sending" }));
    try {
      const baseUrl = API_BASE_URL.replace(/\/$/, "");
      const res = await fetch(`${baseUrl}/api/notify-client`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, text }),
      });
      const payload = await res.json();
      if (payload.ok) {
        setSendStatus((p) => ({ ...p, [key]: "sent" }));
        setComments((p) => ({ ...p, [key]: "" }));
        setTimeout(() => setSendStatus((p) => ({ ...p, [key]: undefined })), 3000);
      } else {
        setSendStatus((p) => ({ ...p, [key]: "error" }));
      }
    } catch {
      setSendStatus((p) => ({ ...p, [key]: "error" }));
    }
  }

  if (adminOrders.length === 0) {
    return <div className="empty-admin"><History aria-hidden="true" /><h3>Hali buyurtma yo'q</h3><p>Buyurtmalar shu yerda ko'rinadi.</p></div>;
  }

  const clientMap = {};
  for (const order of adminOrders) {
    const key = order.customer.phone || order.customer.name || order.id;
    if (!clientMap[key]) clientMap[key] = { customer: order.customer, orders: [] };
    clientMap[key].orders.push(order);
  }
  const clients = Object.values(clientMap);

  function generateClientPDF(client) {
    const grandTotal = client.orders.reduce((s, o) => s + o.total, 0);
    const loc = client.customer.location
      ? `<a href="${client.customer.location}" style="color:#1565c0">${client.customer.location}</a>`
      : "—";
    const dayMap = {};
    for (const order of client.orders) {
      const day = new Date(order.createdAt).toLocaleDateString("uz-UZ");
      if (!dayMap[day]) dayMap[day] = [];
      for (const item of order.items) dayMap[day].push(item);
    }
    const sortedDays = Object.keys(dayMap).sort((a, b) => {
      const parse = (s) => s.split(".").reverse().join("-");
      return new Date(parse(a)) - new Date(parse(b));
    });
    const dayBlocks = sortedDays.map((day) => {
      const items = dayMap[day];
      const dayTotal = items.reduce((s, i) => s + Number(i.total), 0);
      const rows = items.map((item) => `
        <tr>
          <td style="text-align:left;vertical-align:middle">${item.name}</td>
          <td style="text-align:center;vertical-align:middle">${item.thicknessMm ? item.thicknessMm + " mm" : "—"}</td>
          <td style="text-align:center;vertical-align:middle">${item.qty}</td>
          <td style="text-align:center;vertical-align:middle">${item.meters ? item.meters + " m" : "—"}</td>
          <td style="text-align:right;vertical-align:middle;white-space:nowrap">${Number(item.price).toLocaleString("uz-UZ")} so'm</td>
          <td style="text-align:right;vertical-align:middle;font-weight:600;white-space:nowrap">${Number(item.total).toLocaleString("uz-UZ")} so'm</td>
        </tr>`).join("");
      return `
        <div class="day-block">
          <div class="day-header">📅 ${day}</div>
          <table>
            <thead><tr><th>Mahsulot</th><th>Qalinlik</th><th>Dona</th><th>Metr</th><th>Narx</th><th>Jami</th></tr></thead>
            <tbody>${rows}</tbody>
            <tfoot><tr class="day-total-row"><td colspan="5">Kun jami</td><td style="text-align:right">${dayTotal.toLocaleString("uz-UZ")} so'm</td></tr></tfoot>
          </table>
        </div>`;
    }).join("");

    const html = `<!DOCTYPE html><html lang="uz"><head><meta charset="UTF-8"/>
    <title>${client.customer.name} - Hisobot</title>
    <style>
      body{font-family:Arial,sans-serif;padding:32px;color:#111;font-size:14px;max-width:900px;margin:0 auto}
      h1{font-size:22px;margin-bottom:4px;color:#8f0821}
      .info-grid{display:grid;grid-template-columns:140px 1fr;gap:6px 12px;margin:16px 0 24px;background:#f9f9f9;padding:14px 16px;border-radius:8px}
      .info-grid span{color:#888;font-size:13px}.info-grid strong{font-size:13px}
      .day-block{margin-bottom:24px}
      .day-header{font-size:15px;font-weight:700;color:#8f0821;margin-bottom:6px;padding:6px 0;border-bottom:2px solid #8f0821}
      table{width:100%;border-collapse:collapse;table-layout:fixed}
      th,td{padding:8px 10px;font-size:13px;vertical-align:middle;overflow:hidden}
      th:nth-child(1),td:nth-child(1){width:30%;text-align:left}
      th:nth-child(2),td:nth-child(2){width:12%;text-align:center}
      th:nth-child(3),td:nth-child(3){width:8%;text-align:center}
      th:nth-child(4),td:nth-child(4){width:10%;text-align:center}
      th:nth-child(5),td:nth-child(5){width:20%;text-align:right;white-space:nowrap}
      th:nth-child(6),td:nth-child(6){width:20%;text-align:right;white-space:nowrap}
      th{background:#8f0821;color:#fff}
      td{border-bottom:1px solid #eee}
      tr:nth-child(even) td{background:#fafafa}
      .day-total-row td{font-weight:700;background:#fff3f5;border-top:1.5px solid #e0c0c0;color:#8f0821}
      .grand-total{margin-top:16px;padding:14px 16px;background:#8f0821;color:#fff;border-radius:8px;display:flex;justify-content:space-between;align-items:center;font-size:17px;font-weight:700}
      .footer{margin-top:20px;font-size:12px;color:#aaa;text-align:right}
      @media print{body{padding:16px}}
    </style></head><body>
    <h1>Klient hisoboti</h1>
    <div class="info-grid">
      <span>Ism:</span><strong>${client.customer.name || "—"}</strong>
      <span>Telefon:</span><strong>${client.customer.phone || "—"}</strong>
      <span>Lokatsiya:</span><strong>${loc}</strong>
      <span>Buyurtmalar:</span><strong>${client.orders.length} ta</strong>
      <span>Sana oralig'i:</span><strong>${sortedDays[0]} — ${sortedDays[sortedDays.length - 1]}</strong>
    </div>
    ${dayBlocks}
    <div class="grand-total"><span>Umumiy jami</span><span>${grandTotal.toLocaleString("uz-UZ")} so'm</span></div>
    <div class="footer">Hisobot sanasi: ${new Date().toLocaleString("uz-UZ")}</div>
    </body></html>`;

    const win = window.open("", "_blank");
    if (!win) { alert("Popup bloklangan. Brauzer ruxsat bering."); return; }
    win.document.write(html);
    win.document.close();
    win.focus();
    setTimeout(() => win.print(), 600);
  }

  return (
    <div className="admin-orders-table">
      <div className="admin-orders-head client-head">
        <span>Mijoz</span><span>Telefon</span><span>Buyurtmalar</span><span>Umumiy</span>
      </div>
      {clients.map((client, idx) => {
        const key = client.customer.phone || client.customer.name || idx;
        const range = dateRanges[key] || {};
        const grandTotal = client.orders.reduce((s, o) => s + o.total, 0);
        const totalItems = client.orders.reduce((s, o) => s + o.items.reduce((ss, i) => ss + i.qty, 0), 0);
        const lastDate = new Date(client.orders[0]?.createdAt).toLocaleDateString("uz-UZ");
        const filteredOrders = client.orders.filter((o) => {
          const d = new Date(o.createdAt); d.setHours(0,0,0,0);
          if (range.from) { const f = new Date(range.from); if (d < f) return false; }
          if (range.to)   { const t = new Date(range.to); t.setHours(23,59,59,999); if (d > t) return false; }
          return true;
        });
        const filteredTotal = filteredOrders.reduce((s, o) => s + o.total, 0);
        return (
          <div key={idx} className="client-card">
            <div className="client-card-main">
              <div><strong>{client.customer.name || "—"}</strong><span className="order-date">{lastDate}</span></div>
              <span>{client.customer.phone || "—"}</span>
              <span>{client.orders.length} ta · {totalItems} dona</span>
              <strong className="order-total-sum">{formatSom(grandTotal)}</strong>
            </div>
            <div className="client-card-actions">
              <div className="date-range-row">
                <label><span>Dan</span><input type="date" value={range.from || ""} onChange={(e) => setRange(key, "from", e.target.value)} /></label>
                <span className="date-sep">—</span>
                <label><span>Gacha</span><input type="date" value={range.to || ""} onChange={(e) => setRange(key, "to", e.target.value)} /></label>
                {(range.from || range.to) && (
                  <button className="range-clear-btn" type="button" onClick={() => setDateRanges((p) => ({ ...p, [key]: {} }))}>✕</button>
                )}
              </div>
              <div className="client-pdf-row">
                {(range.from || range.to) && (
                  <span className="range-count">{filteredOrders.length} ta · {formatSom(filteredTotal)}</span>
                )}
                <button className="pdf-btn" type="button" disabled={filteredOrders.length === 0}
                  onClick={() => generateClientPDF({ ...client, orders: filteredOrders })}>
                  📄 PDF
                </button>
              </div>
              <div className="client-comment-row">
                <input
                  type="text"
                  className="client-comment-input"
                  placeholder="Mijozga xabar (masalan: Qachon yana harid qilasiz?)"
                  value={comments[key] || ""}
                  onChange={(e) => setComments((p) => ({ ...p, [key]: e.target.value }))}
                  onKeyDown={(e) => { if (e.key === "Enter") sendComment(key, client.orders[0]?.userId); }}
                />
                <button
                  type="button"
                  className="client-comment-send"
                  disabled={!comments[key]?.trim() || sendStatus[key] === "sending"}
                  onClick={() => sendComment(key, client.orders[0]?.userId)}
                >
                  {sendStatus[key] === "sending" ? "..." : "Yubor"}
                </button>
                {sendStatus[key] === "sent" && <span className="comment-status-ok">✅ Yuborildi</span>}
                {sendStatus[key] === "error" && <span className="comment-status-err">❌ Xato</span>}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function App() {
  const pathname = usePathname();
  const isAdminRoute = pathname === "/admin" || pathname.startsWith("/admin/");
  const initialScope = getStorageScope(getTelegramUser());

  const [telegramUser, setTelegramUser] = useState(() => getTelegramUser());
  const [lightboxSrc, setLightboxSrc] = useState(null);
  const onImageClick = useCallback((src) => setLightboxSrc(src), []);
  const [language, setLanguage] = useState("UZB");
  const [promoInput, setPromoInput] = useState("");
  const [activePromo, setActivePromo] = useState(null); // { code, discount } yoki null
  const [promoCodes, setPromoCodes] = useState([]);
  const [newPromoCode, setNewPromoCode] = useState("");
  const [newPromoDiscount, setNewPromoDiscount] = useState("");
  const [activeCategory, setActiveCategory] = useState(ALL_PRODUCTS);
  const [activeTab, setActiveTab] = useState("products");
  const [query, setQuery] = useState("");
  const [cart, setCart] = useState(() => readStoredValue(initialScope, "cart", {}));
  const [meters, setMeters] = useState(() => readStoredValue(initialScope, "meters", {}));
  const [showAllProducts, setShowAllProducts] = useState(false);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [locationStatus, setLocationStatus] = useState("");
  const [locationLoading, setLocationLoading] = useState(false);
  const [customer, setCustomer] = useState(() => readStoredValue(initialScope, "customer", DEFAULT_CUSTOMER));
  const [favorites, setFavorites] = useState(() => readStoredValue(initialScope, "favorites", getDefaultFavorites()));
  const [orderHistory, setOrderHistory] = useState([]);
  const [adminOrders, setAdminOrders] = useState([]);

  // Catalog — null = yuklanmoqda, keyin haqiqiy ma'lumot
  const [catalog, setCatalog] = useState(() => {
    // Darhol cache dan yoki default dan boshlash
    try {
      const cached = JSON.parse(localStorage.getItem("catalog_cache_v2") || "null");
      if (cached?.data) return cached.data;
    } catch {}
    return null;
  });
  const [catalogLoaded, setCatalogLoaded] = useState(false);

  const [categoryDraft, setCategoryDraft] = useState(() => createCategoryDraft());
  const [productDraft, setProductDraft] = useState(() => createProductDraft(defaultCategoryCards));
  const [editingProduct, setEditingProduct] = useState(null); // edit mode
  const [adminNotice, setAdminNotice] = useState("");
  const [adminTab, setAdminTab] = useState("products");
  const [adminSearch, setAdminSearch] = useState("");

  const storageScope = useMemo(() => getStorageScope(telegramUser), [telegramUser]);
  const orderOwnerKey = useMemo(() => (telegramUser?.id ? String(telegramUser.id) : storageScope), [telegramUser, storageScope]);

  const activeCatalog = useMemo(() => catalog || getDefaultCatalog(), [catalog]);
  const { categories: catalogCategories, products: catalogProducts } = activeCatalog;

  // Telegram init
  useEffect(() => {
    const tg = window.Telegram?.WebApp;
    if (!tg) return;
    tg.ready(); tg.expand();
    tg.setHeaderColor("#8f0821");
    tg.setBackgroundColor("#fffdf8");
    setTelegramUser(tg.initDataUnsafe?.user ?? null);
  }, []);
  useEffect(() => {
    fetchPromoCodes()
      .then(setPromoCodes)
      .catch(console.error);
  }, []);

  // Real-time SSE
  const sseHandlers = useMemo(() => ({
    isAdmin: isAdminRoute,
    onNewOrder: isAdminRoute ? (order) => {
      setAdminOrders((prev) => {
        if (prev.some((o) => o.id === order.id)) return prev;
        return [order, ...prev].slice(0, 200);
      });
    } : undefined,
    onCatalogUpdated: (catalog) => {
      setCatalog(catalog);
      try { localStorage.setItem(CATALOG_CACHE_KEY, JSON.stringify({ ts: Date.now(), data: catalog })); } catch {}
    },
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [isAdminRoute]);
  useServerEvents(sseHandlers);
  // Catalog load — avval cache, keyin backend
  useEffect(() => {
    let cancelled = false;
    async function loadCatalog() {
      // 1. Cache dan tez ko'rsatish
      try {
        const cached = JSON.parse(localStorage.getItem(CATALOG_CACHE_KEY) || "null");
        if (cached?.data && !cancelled) {
          setCatalog(cached.data);
        }
      } catch {}
      // 2. Backend dan yangilash
      try {
        const nextCatalog = await fetchCatalogFromBackend();
        if (!cancelled && nextCatalog) {
          setCatalog(nextCatalog);
        }
      } catch {}
      if (!cancelled) setCatalogLoaded(true);
    }
    loadCatalog();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    setCart(readStoredValue(storageScope, "cart", {}));
    setMeters(readStoredValue(storageScope, "meters", {}));
    setCustomer(readStoredValue(storageScope, "customer", DEFAULT_CUSTOMER));
    setFavorites(readStoredValue(storageScope, "favorites", getDefaultFavorites()));
  }, [storageScope]);
  useEffect(() => { writeStoredValue(storageScope, "cart", cart); }, [cart, storageScope]);
  useEffect(() => { writeStoredValue(storageScope, "meters", meters); }, [meters, storageScope]);
  useEffect(() => { try { localStorage.setItem("admin-promocodes", JSON.stringify(promoCodes)); } catch {} }, [promoCodes]);
  useEffect(() => { writeStoredValue(storageScope, "customer", customer); }, [customer, storageScope]);
  useEffect(() => { writeStoredValue(storageScope, "favorites", favorites); }, [favorites, storageScope]);

  useEffect(() => {
    let cancelled = false;
    async function loadOrders() {
      try {
        const nextOrders = await fetchOrdersFromBackend(isAdminRoute ? "" : orderOwnerKey);
        if (!cancelled) {
          if (isAdminRoute) setAdminOrders(nextOrders);
          else setOrderHistory(nextOrders);
        }
      } catch {}
    }
    loadOrders();
    return () => { cancelled = true; };
  }, [isAdminRoute, orderOwnerKey]);

  useEffect(() => {
    if (catalogCategories.length === 0) { setActiveCategory(ALL_PRODUCTS); return; }
    if (activeCategory !== ALL_PRODUCTS && !catalogCategories.some((c) => c.name === activeCategory)) {
      setActiveCategory(ALL_PRODUCTS);
    }
  }, [activeCategory, catalogCategories]);

  useEffect(() => {
    if (catalogCategories.length === 0) return;
    if (!catalogCategories.some((c) => c.name === productDraft.category)) {
      setProductDraft((cur) => ({ ...cur, category: catalogCategories[0]?.name ?? "" }));
    }
  }, [catalogCategories, productDraft.category]);

  useEffect(() => {
    setCart((current) => {
      const next = {};
      for (const p of catalogProducts) { if (current[p.id]) next[p.id] = current[p.id]; }
      return next;
    });
  }, [catalogProducts]);

  const visibleProducts = useMemo(() => {
    const search = query.trim().toLowerCase();
    return catalogProducts.filter((product) => {
      const name = product.name.toLowerCase();
      const nameRu = (product.nameRu || "").toLowerCase();
      const matchesSearch = search.length === 0 || name.includes(search) || nameRu.includes(search);
      const matchesCategory = search.length > 0 || activeCategory === ALL_PRODUCTS || product.category === activeCategory;
      return matchesSearch && matchesCategory;
    });
  }, [activeCategory, catalogProducts, query]);

  const cartCount = useMemo(() => Object.values(cart).reduce((s, q) => s + q, 0), [cart]);
  const totalRevenue = useMemo(() => adminOrders.reduce((s, o) => s + o.total, 0), [adminOrders]);
  const cartItems = useMemo(() => catalogProducts.map((p) => {
    const qty = cart[p.id] ?? 0;
    const m = p.pricePerMeter > 0 ? (meters[p.id] ?? 1) : null;
    const parsedM = parseFloat(String(m).replace(",", ".")) || 1;
    const basePrice = (activePromo && p.wholesalePrice > 0) ? p.wholesalePrice : p.price;
    const baseMeterPrice = (activePromo && p.wholesalePrice > 0) ? p.wholesalePrice : p.pricePerMeter;
    const unitPrice = p.pricePerMeter > 0 ? baseMeterPrice * parsedM : basePrice;
    return { ...p, qty, meters: p.pricePerMeter > 0 ? parsedM : null, unitPrice };
  }).filter((p) => p.qty > 0), [catalogProducts, cart, meters, activePromo]);
  const cartTotal = useMemo(() => cartItems.reduce((s, p) => s + p.unitPrice * p.qty, 0), [cartItems]);

  const changeQuantity = useCallback(function changeQuantity(productId, delta) {
    setCart((current) => {
      const nextQty = Math.max(0, (current[productId] ?? 0) + delta);
      const next = { ...current };
      if (nextQty === 0) delete next[productId]; else next[productId] = nextQty;
      return next;
    });
  }, []);
  const setQuantity = useCallback(function setQuantity(productId, value) {
    const qty = Math.max(0, Number(String(value).replace(/[^\d]/g, "")) || 0);
    setCart((current) => {
      const next = { ...current };
      if (qty === 0) delete next[productId]; else next[productId] = qty;
      return next;
    });
  }, []);

  const setMetersForProduct = useCallback(function setMetersForProduct(productId, value) {
    const str = String(value).replace(",", ".");
    const num = parseFloat(str);
    const final = isNaN(num) || num <= 0 ? 1 : num;
    if (str === "" || str.endsWith(".") || str.endsWith(",")) {
      setMeters((current) => ({ ...current, [productId]: str === "" ? "" : str }));
    } else {
      setMeters((current) => ({ ...current, [productId]: final }));
      // Metrli mahsulot savatda bo'lishi uchun qty=1 ni ta'minlaymiz
      setCart((current) => current[productId] ? current : { ...current, [productId]: 1 });
    }
  }, []);

  function setDetectedLocation(lat, lng) {
    setCustomer((c) => ({ ...c, location: `https://maps.google.com/?q=${lat},${lng}` }));
    setLocationStatus("✅ Lokatsiya aniqlandi");
    setLocationLoading(false);
  }
  function handleLocationError(msg) {
    setLocationStatus(msg || "❌ Lokatsiyaga ruxsat berilmadi");
    setLocationLoading(false);
  }
  function requestLocation() {
    setCustomer((c) => ({ ...c, location: "" }));
    setLocationStatus("");
    setLocationLoading(true);

    if (!navigator.geolocation) {
      handleLocationError("❌ Lokatsiya qo'llab-quvvatlanmaydi");
      return;
    }

    let watchId;
    const timer = setTimeout(() => {
      navigator.geolocation.clearWatch(watchId);
      handleLocationError("❌ Vaqt tugadi, qayta urining");
    }, 20000);

    watchId = navigator.geolocation.watchPosition(
      (pos) => {
        clearTimeout(timer);
        navigator.geolocation.clearWatch(watchId);
        setDetectedLocation(pos.coords.latitude, pos.coords.longitude);
      },
      (err) => {
        clearTimeout(timer);
        navigator.geolocation.clearWatch(watchId);
        if (err.code === 1) handleLocationError("❌ Lokatsiyaga ruxsat berilmadi");
        else handleLocationError("❌ Lokatsiya aniqlanmadi, qayta urining");
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 }
    );
  }

  async function handleOrderButton() {
    if (!checkoutOpen) {
      setCheckoutOpen(true);
      return;
    }
    if (!customer.name.trim() || !customer.phone.trim() || !customer.location.trim()) {
      setLocationStatus("Ism, telefon va lokatsiyani to'ldiring");
      return;
    }
    const order = {
      id: `order-${Date.now()}`,
      createdAt: new Date().toISOString(),
      userId: orderOwnerKey,
      customer,
      items: cartItems.map((p) => ({
        id: p.id, name: p.name, price: p.unitPrice, qty: p.qty,
        total: Number((p.unitPrice * p.qty).toFixed(2)),
        thicknessMm: p.thicknessMm,
        meters: p.meters ?? null,
        pricePerMeter: p.pricePerMeter ?? 0,
      })),
      total: Number(cartTotal.toFixed(2)),
    };
    setCart({});
    setMeters({});
    setCheckoutOpen(false);
    try {
      const result = await sendOrderToBackend(order);
      const saved = result?.order ?? order;
      setOrderHistory((c) => [saved, ...c].slice(0, 20));
      if (isAdminRoute) setAdminOrders((c) => [saved, ...c].slice(0, 100));
    } catch {}
  }

  function clearScopedStorage() {
    setCart({}); setMeters({}); setCustomer(DEFAULT_CUSTOMER); setFavorites(getDefaultFavorites());
    setOrderHistory([]); setShowAllProducts(false); setCheckoutOpen(false);
    setLocationStatus(""); setLocationLoading(false);
  }

  async function handleCategoryImageChange(e) {
    const file = e.target.files?.[0]; if (!file) return;
    setCategoryDraft((c) => ({ ...c, image: "" }));
    const image = await fileToDataUrl(file);
    setCategoryDraft((c) => ({ ...c, image }));
    e.target.value = "";
  }
  async function addCategory(e) {
    e.preventDefault();
    const next = normalizeCategoryInput(categoryDraft);
    if (!next.name) { setAdminNotice("Kategoriya nomini kiriting"); return; }
    const nextCatalog = (() => {
      const cur = activeCatalog;
      const idx = cur.categories.findIndex((c) => c.name.toLowerCase() === next.name.toLowerCase());
      if (idx >= 0) {
        const cats = [...cur.categories];
        cats[idx] = { ...cats[idx], ...next, image: next.image || cats[idx].image || "" };
        return { ...cur, categories: cats };
      }
      return { ...cur, categories: [...cur.categories, next] };
    })();
    setCatalog(nextCatalog);
    await saveCatalogToBackend(nextCatalog);
    setCategoryDraft(createCategoryDraft());
    setAdminNotice("Kategoriya saqlandi");
  }
  async function removeCategory(name) {
    const nextCatalog = {
      categories: activeCatalog.categories.filter((c) => c.name !== name),
      products: activeCatalog.products.filter((p) => p.category !== name),
    };
    setCatalog(nextCatalog);
    await saveCatalogToBackend(nextCatalog);
  }

  async function handleProductImageChange(e) {
    const file = e.target.files?.[0]; if (!file) return;
    const image = await fileToDataUrl(file);
    setProductDraft((c) => ({ ...c, image }));
    e.target.value = "";
  }
  async function addProduct(e) {
    e.preventDefault();
    const next = normalizeProductInput(productDraft);
    if (!next.name || !next.category || !next.price) { setAdminNotice("Nom, kategoriya va narx kerak"); return; }
    let nextCatalog;
    if (editingProduct) {
      // Edit mode
      nextCatalog = { ...activeCatalog, products: activeCatalog.products.map((p) => p.id === editingProduct ? { ...next, id: editingProduct } : p) };
      setEditingProduct(null);
      setAdminNotice("Mahsulot yangilandi");
    } else {
      nextCatalog = { ...activeCatalog, products: [next, ...activeCatalog.products] };
      setAdminNotice("Mahsulot saqlandi");
    }
    setCatalog(nextCatalog);
    await saveCatalogToBackend(nextCatalog);
    setProductDraft(createProductDraft(catalogCategories));
  }
  function startEditProduct(product) {
    setEditingProduct(product.id);
    setProductDraft({
      name: product.name, price: String(product.price), category: product.category,
      theme: product.theme || "purple", image: product.image || "",
      thicknessMm: String(product.thicknessMm || ""),
      widthCm: String(product.widthCm || ""), heightCm: String(product.heightCm || ""),
      pricePerMeter: String(product.pricePerMeter || ""),
      availableMeters: String(product.availableMeters || ""),
      wholesalePrice: String(product.wholesalePrice || ""),
    });
    setAdminNotice("Mahsulotni tahrirlayapsiz");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  async function removeProduct(id) {
    const nextCatalog = { ...activeCatalog, products: activeCatalog.products.filter((p) => p.id !== id) };
    setCatalog(nextCatalog);
    await saveCatalogToBackend(nextCatalog);
    setCart((c) => { const n = { ...c }; delete n[id]; return n; });
    setFavorites((c) => { const n = { ...c }; delete n[id]; return n; });
    if (editingProduct === id) { setEditingProduct(null); setProductDraft(createProductDraft(catalogCategories)); }
  }

  // ===== ADMIN =====
  if (isAdminRoute) {
    return (
      <div className="admin-frame">
        <div className="admin-layout">
          <header className="admin-topbar">
            <div className="admin-topbar-left">
              <div className="admin-logo"><Shield size={20} /></div>
              <span className="admin-title-text">Admin panel</span>
            </div>
            <div className="admin-topbar-stats">
              <div className="admin-stat-chip"><Package size={14} /><span>{getCatalogSummary(activeCatalog).productCount} mahsulot</span></div>
              <div className="admin-stat-chip"><ShoppingCart size={14} /><span>{adminOrders.length} buyurtma</span></div>
              <div className="admin-stat-chip"><BarChart3 size={14} /><span>{formatSom(totalRevenue)}</span></div>
            </div>
          </header>
          <nav className="admin-tabs-nav">
            {[
              { key: "products", icon: <Package size={16} />, label: "Mahsulotlar" },
              { key: "categories", icon: <BarChart3 size={16} />, label: "Kategoriyalar" },
              { key: "orders", icon: <History size={16} />, label: "Buyurtmalar" },
              { key: "clients", icon: <Users size={16} />, label: "Klientlar" },
            ].map((tab) => (
              <button key={tab.key} className={`admin-tab-btn ${adminTab === tab.key ? "active" : ""}`} onClick={() => setAdminTab(tab.key)} type="button">
                {tab.icon}{tab.label}
              </button>
            ))}
          </nav>
          <main className="admin-main">
            {adminNotice && <div className="admin-notice" onClick={() => setAdminNotice("")}>{adminNotice} ✕</div>}
            {adminTab === "products" && (
              <div className="admin-two-col">
                <div className="admin-card">
                  <div className="admin-card-title">
                    <Package size={18} />
                    <h2>{editingProduct ? "Mahsulotni tahrirlash" : "Mahsulot qo'shish"}</h2>
                    <span className="admin-count">{getCatalogSummary(activeCatalog).productCount} ta</span>
                    {editingProduct && <button onClick={() => { setEditingProduct(null); setProductDraft(createProductDraft(catalogCategories)); setAdminNotice(""); }} style={{marginLeft:"auto",padding:"4px 10px",borderRadius:8,border:"1px solid #e2e8f0",background:"transparent",cursor:"pointer",fontSize:12}} type="button">Bekor qilish</button>}
                  </div>
                  <form className="admin-form" onSubmit={addProduct}>
                    <label><span>Nomi</span><input onChange={(e) => setProductDraft((c) => ({ ...c, name: e.target.value }))} placeholder="Mahsulot nomi" type="text" value={productDraft.name} /></label>
                    <div className="admin-grid-2">
                      <label><span>Kategoriya</span>
                        <select onChange={(e) => setProductDraft((c) => ({ ...c, category: e.target.value }))} value={productDraft.category}>
                          {catalogCategories.map((cat) => <option key={cat.name} value={cat.name}>{cat.name}</option>)}
                        </select>
                      </label>
                      <label><span>Narx</span><input inputMode="decimal" onChange={(e) => setProductDraft((c) => ({ ...c, price: e.target.value }))} placeholder="39 000" type="text" value={productDraft.price} /></label>
                      <label><span>Optom narx</span><input inputMode="decimal" onChange={(e) => setProductDraft((c) => ({ ...c, wholesalePrice: e.target.value }))} placeholder="30 000" type="text" value={productDraft.wholesalePrice} /></label>
                    </div>
                    <div className="admin-grid-2">
                      <label><span>Eni, cm</span><input min="0" onChange={(e) => setProductDraft((c) => ({ ...c, widthCm: e.target.value }))} placeholder="120" type="number" value={productDraft.widthCm} /></label>
                      <label><span>Bo'yi, cm</span><input min="0" onChange={(e) => setProductDraft((c) => ({ ...c, heightCm: e.target.value }))} placeholder="200" type="number" value={productDraft.heightCm} /></label>
                    </div>
                    <div className="admin-grid-2">
                      <label><span>Rasm</span><input accept="image/*" onChange={handleProductImageChange} type="file" /></label>
                      <label><span>Qalinlik (mm)</span><input inputMode="numeric" onChange={(e) => setProductDraft((c) => ({ ...c, thicknessMm: e.target.value }))} placeholder="10" type="text" value={productDraft.thicknessMm} /></label>
                    </div>
                    <div className="admin-grid-2">
                      <label><span>Narx/metr (so'm)</span><input inputMode="decimal" onChange={(e) => setProductDraft((c) => ({ ...c, pricePerMeter: e.target.value }))} placeholder="15000" type="text" value={productDraft.pricePerMeter} /></label>
                      <label><span>Mavjud metr</span><input inputMode="decimal" onChange={(e) => setProductDraft((c) => ({ ...c, availableMeters: e.target.value }))} placeholder="50" type="text" value={productDraft.availableMeters} /></label>
                    </div>
                    <label><span>Theme</span>
                      <select onChange={(e) => setProductDraft((c) => ({ ...c, theme: e.target.value }))} value={productDraft.theme}>
                        {THEME_OPTIONS.map((t) => <option key={t} value={t}>{t}</option>)}
                      </select>
                    </label>
                    <div className="admin-preview">
                      <div className={`admin-preview-thumb ${productDraft.image ? "" : productDraft.theme}`} style={getCoverStyle(productDraft.image)} />
                      <div>
                        <strong>{productDraft.name || "Mahsulot nomi"}</strong>
                        <span>{productDraft.category || "Kategoriya"} · {productDraft.widthCm && productDraft.heightCm ? `${productDraft.widthCm}x${productDraft.heightCm} cm` : "razmer"} · {productDraft.thicknessMm ? `${productDraft.thicknessMm}mm` : ""}</span>
                      </div>
                    </div>
                    <button className="admin-submit" type="submit">{editingProduct ? "Saqlash" : "Mahsulot qo'shish"}</button>
                  </form>
                </div>
                <div className="admin-card">
                  <div className="admin-card-title"><BarChart3 size={18} /><h2>Mahsulotlar ro'yxati</h2></div>
                  <div className="admin-search-row">
                    <Search size={15} className="admin-search-icon" />
                    <input
                      className="admin-search-input"
                      type="text"
                      placeholder="Mahsulot nomini qidiring..."
                      value={adminSearch}
                      onChange={(e) => setAdminSearch(e.target.value)}
                    />
                    {adminSearch && (
                      <button className="admin-search-clear" type="button" onClick={() => setAdminSearch("")}>✕</button>
                    )}
                  </div>
                  <div className="admin-product-list">
                    {catalogProducts
                      .filter((p) => !adminSearch || p.name.toLowerCase().includes(adminSearch.toLowerCase()) || p.category.toLowerCase().includes(adminSearch.toLowerCase()))
                      .map((product) => (
                      <article key={product.id} className={`admin-product-row ${editingProduct === product.id ? "editing" : ""}`}>
                        <div className="admin-product-meta">
                          <div className={`admin-product-thumb ${product.image ? "admin-product-thumb-image" : product.theme}`} style={getCoverStyle(product.image)} />
                          <div>
                            <strong>{product.name}</strong>
                            <span>{product.category} · {product.widthCm && product.heightCm ? `${product.widthCm}x${product.heightCm} cm` : ""} {product.thicknessMm ? `· ${product.thicknessMm}mm` : ""}</span>
                          </div>
                        </div>
                        <div style={{display:"flex",gap:6,flexShrink:0}}>
                          <button className="admin-row-edit" onClick={() => startEditProduct(product)} type="button" title="Tahrirlash"><Pencil size={14} /></button>
                          <button className="admin-row-delete" onClick={() => removeProduct(product.id)} type="button">O'chirish</button>
                        </div>
                      </article>
                    ))}
                    {catalogProducts.filter((p) => !adminSearch || p.name.toLowerCase().includes(adminSearch.toLowerCase()) || p.category.toLowerCase().includes(adminSearch.toLowerCase())).length === 0 && (
                      <p className="admin-search-empty">"{adminSearch}" bo'yicha mahsulot topilmadi</p>
                    )}
                  </div>
                </div>
              </div>
            )}
            {adminTab === "categories" && (
              <div className="admin-two-col">
                <div className="admin-card">
                  <div className="admin-card-title"><Package size={18} /><h2>Kategoriya qo'shish</h2><span className="admin-count">{getCatalogSummary(activeCatalog).categoryCount} ta</span></div>
                  <form className="admin-form" onSubmit={addCategory}>
                    <label><span>Nomi</span><input onChange={(e) => setCategoryDraft((c) => ({ ...c, name: e.target.value }))} placeholder="Masalan: Akustika" type="text" value={categoryDraft.name} /></label>
                    <label><span>Rasm</span><input accept="image/*" onChange={handleCategoryImageChange} type="file" /></label>
                    <div className="admin-preview">
                      <div className={`admin-preview-thumb ${categoryDraft.image ? "" : "admin-category-preview"}`} style={getCoverStyle(categoryDraft.image)} />
                      <div><strong>{categoryDraft.name || "Kategoriya nomi"}</strong><span>{categoryDraft.image ? "Rasm yuklandi" : "Rasm yo'q"}</span></div>
                    </div>
                    <div className="admin-action-row">
                      <button className="admin-submit" type="submit">Kategoriya qo'shish</button>
                      <button className="admin-delete" onClick={() => removeCategory(categoryDraft.name.trim())} type="button">O'chirish</button>
                    </div>
                  </form>
                  <div className="admin-pills">
                    {catalogCategories.map((cat) => (
                      <button key={cat.name} className="admin-pill" onClick={() => setCategoryDraft({ name: cat.name, image: cat.image || "" })} type="button">{cat.name}</button>
                    ))}
                  </div>
                </div>
              </div>
            )}
            {adminTab === "orders" && (
              <div className="admin-card admin-card-full">
                <div className="admin-card-title"><History size={18} /><h2>Buyurtmalar</h2><span className="admin-count">{adminOrders.length} ta</span></div>
                <ClientOrdersPanel adminOrders={adminOrders} formatSom={formatSom} />
              </div>
            )}
            {adminTab === "clients" && (
              <div style={{display:"flex",flexDirection:"column",gap:16}}>
                <div className="admin-card" style={{maxWidth:500}}>
                  <div className="admin-card-title"><Users size={18} /><h2>Klient ma'lumotlari</h2></div>
                  <div className="admin-client-info">
                    <div className="admin-client-row"><span>Ism</span><strong>{customer.name || "—"}</strong></div>
                    <div className="admin-client-row"><span>Telefon</span><strong>{customer.phone || "—"}</strong></div>
                    <div className="admin-client-row"><span>Lokatsiya</span><strong>{customer.location ? "Tayyor" : "—"}</strong></div>
                    <div className="admin-client-row"><span>Scope</span><strong>{storageScope}</strong></div>
                    <div className="admin-client-row"><span>Telegram ID</span><strong>{telegramUser?.id ?? "browser"}</strong></div>
                  </div>
                  <div className="admin-actions">
                    <button className="danger-button" onClick={clearScopedStorage} type="button"><Trash2 aria-hidden="true" />Klient ma'lumotlarini tozalash</button>
                  </div>
                </div>

                <div className="admin-card" style={{maxWidth:500}}>
                  <div className="admin-card-title"><span>🎟️</span><h2>Promocodlar</h2></div>
                  <div className="promo-create-row">
                    <input
                      className="promo-admin-input"
                      type="text"
                      placeholder="Kod (masalan: OPTOM2024)"
                      value={newPromoCode}
                      onChange={(e) => setNewPromoCode(e.target.value.toUpperCase())}
                    />
                    <button
                      className="promo-add-btn"
                      type="button"
                     onClick={async () => {
  const code = newPromoCode.trim().toUpperCase();

  if (!code) return;

  if (promoCodes.find((p) => p.code === code)) return;

  try {
    const baseUrl = API_BASE_URL.replace(/\/$/, "");

    await fetch(`${baseUrl}/api/promocodes`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        code,
        type: "wholesale"
      })
    });

    const updated = await fetchPromoCodes();

    setPromoCodes(updated);

    setNewPromoCode("");
  } catch (err) {
    console.error(err);
  }
}}
                    >+ Qo'shish</button>
                  </div>
                  {promoCodes.length > 0 && (
                    <div className="promo-list">
                      {promoCodes.map((p) => (
                        <div key={p.code} className="promo-list-item">
                          <span className="promo-code-badge">{p.code}</span>
                          <span className="promo-type-label">Optom narx</span>
                          <button className="promo-delete-btn" type="button" onClick={async() => { try {const baseUrl = API_BASE_URL.replace(/\/$/, ""); await fetch( `${baseUrl}/api/promocodes/${encodeURIComponent(p.code)}`, {method:"DELETE"}); const updated = await fetchPromoCodes(); setPromoCodes(updated);} catch(err) { console.error(err);} }}>✕</button>
                        </div>
                      ))}
                    </div>
                  )}
                  {promoCodes.length === 0 && <p style={{fontSize:13,color:"#aaa",margin:"8px 0"}}>Hali promocod yo'q</p>}
                </div>
              </div>
            )}
          </main>
        </div>
      </div>
    );
  }

  // ===== MIJOZ =====
  return (
    <div className="app-frame">
      {lightboxSrc && <ImageLightbox src={lightboxSrc} onClose={() => setLightboxSrc(null)} />}
      <main className="app-shell">
        <header className="top-panel">
          <div className="top-row">
            <div className="promo-input-row">
              <input
                className={`promo-input ${activePromo ? "promo-active" : ""}`}
                type="text"
                placeholder="Promocode"
                value={promoInput}
                onChange={(e) => setPromoInput(e.target.value.toUpperCase())}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    const found = promoCodes.find((p) => p.code === promoInput.trim());
                    if (found) setActivePromo(found);
                    else { setActivePromo(null); }
                  }
                }}
              />
              {activePromo ? (
                <button className="promo-clear-btn" type="button" onClick={() => { setActivePromo(null); setPromoInput(""); }}>✕</button>
              ) : (
                <button className="promo-apply-btn" type="button" onClick={() => {
                  const found = promoCodes.find((p) => p.code === promoInput.trim());
                  if (found) setActivePromo(found); else setActivePromo(null);
                }}>OK</button>
              )}
            </div>
            <div className={`language-switch-mini ${language === "RUS" ? "rus-active" : ""}`} aria-label="Tilni tanlash">
              <span className="switch-thumb-mini" aria-hidden="true" />
              {["UZB", "RUS"].map((item) => (
                <button className={language === item ? "active" : ""} key={item} onClick={() => setLanguage(item)} type="button">{item}</button>
              ))}
            </div>
          </div>
          <div className="search-row">
            <label className="search-box">
              <Search aria-hidden="true" />
              <input onChange={(e) => setQuery(e.target.value)} placeholder={language === "RUS" ? "Поиск товаров..." : "Mahsulotlarni izlash..."} type="search" value={query} />
            </label>
          </div>
        </header>

        {activeTab === "products" && (
          <div className="view-panel" key="products-view">
            <section className="category-grid" aria-label="Mahsulot kategoriyalari">
              <h2>Mahsulotlar turi</h2>
              {catalogCategories.map((category) => (
                <button className={activeCategory === category.name ? "active" : ""} key={category.name} onClick={() => { setActiveCategory(category.name); setShowAllProducts(false); }} type="button">
                  <span className={`category-art ${category.image ? "category-art-image" : `category-art-${category.sample}`}`} style={getCoverStyle(category.image)} />
                  <span>{category.name}</span>
                </button>
              ))}
            </section>
            <section className="section-title">
              <h1>{activeCategory}</h1>
              <button onClick={() => setShowAllProducts((c) => !c)} type="button">{showAllProducts ? "Kamroq ko'rish" : "Hammasini ko'rish"}</button>
            </section>
            <section className={`product-grid ${showAllProducts ? "expanded" : ""}`} aria-label="Mahsulotlar">
              {visibleProducts.map((product) => (
                <ProductCard
                  key={product.id}
                  product={product}
                  qty={cart[product.id] ?? 0}
                  meters={product.pricePerMeter > 0 ? (meters[product.id] ?? 1) : null}
                  changeQty={changeQuantity}
                  setQty={setQuantity}
                  setMeters={setMetersForProduct}
                  activePromo={activePromo}
                  onImageClick={onImageClick}
                />
              ))}
            </section>
          </div>
        )}

        {activeTab === "cart" && (
          <section className="cart-view view-panel" key="cart-view" aria-label="Savat">
            <div className="section-title cart-title"><h1>Savat</h1><button onClick={() => setActiveTab("products")} type="button">Mahsulot qo'shish</button></div>
            {cartItems.length === 0 ? (
              <div className="empty-cart"><ShoppingBag aria-hidden="true" /><h2>Savat bo'sh</h2><p>Mahsulotlardan birini tanlab, + tugmasini bosing.</p></div>
            ) : (
              <>
                <div className="cart-list">
                  {cartItems.map((product) => (
                    <article className="cart-item" key={product.id}>
                      <div className={`cart-thumb mat ${product.image ? "product-image-uploaded" : product.theme}`} style={getCoverStyle(product.image)} />
                      <div className="cart-info">
                        <h2>{product.name}</h2>
                        <p>{formatSom(product.unitPrice)}{product.meters ? ` · ${product.meters} m` : ""}</p>
                        <div className="cart-params">
                          {[...(product.parameters ?? []), product.thicknessMm ? `${product.thicknessMm} mm` : null].filter(Boolean).slice(0, 2).map((p) => (<span key={p}>{p}</span>))}
                          {product.meters && <span>{product.meters} m × {formatSom(product.pricePerMeter)}/m</span>}
                        </div>
                      </div>
                      <div className="cart-actions">
                        <div className="stepper compact" aria-label="Miqdor">
                          <button onClick={() => changeQuantity(product.id, -1)} type="button">-</button>
                          <input aria-label={`${product.name} miqdori`} inputMode="numeric" onChange={(e) => setQuantity(product.id, e.target.value)} type="number" min="0" value={product.qty} />
                          <button onClick={() => changeQuantity(product.id, 1)} type="button">+</button>
                        </div>
                        <strong>{formatSom(product.unitPrice * product.qty)}</strong>
                      </div>
                    </article>
                  ))}
                </div>
                <div className="cart-summary">
                  <div><span>Jami</span><strong>{formatSom(cartTotal)}</strong></div>
                  <button onClick={handleOrderButton} type="button">{checkoutOpen ? "Buyurtmani yuborish" : "Buyurtma berish"}</button>
                </div>
              </>
            )}
          </section>
        )}

        {activeTab === "history" && (
          <section className="history-view view-panel" key="history-view" aria-label="Buyurtmalar tarixi">
            <div className="section-title cart-title"><h1>Tarix</h1></div>
            {orderHistory.length === 0 ? (
              <div className="empty-cart"><History aria-hidden="true" /><h2>Tarix bo'sh</h2><p>Buyurtma yuborilgandan keyin u shu yerda saqlanadi.</p></div>
            ) : (
              <div className="history-list">
                {orderHistory.map((order) => (
                  <article className="history-item" key={order.id}>
                    <div className="history-head">
                      <div><span>{new Date(order.createdAt).toLocaleDateString("uz-UZ")}</span><h2>Buyurtma #{order.id.slice(-6)}</h2></div>
                      <strong>{formatSom(order.total)}</strong>
                    </div>
                    <p>{order.items.length} xil mahsulot, {order.items.reduce((s, i) => s + i.qty, 0)} dona</p>
                    <div className="history-products">{order.items.map((item) => (<span key={item.id}>{item.name} x{item.qty}</span>))}</div>
                  </article>
                ))}
              </div>
            )}
          </section>
        )}
      </main>

      {checkoutOpen && (
        <div className="checkout-overlay" role="dialog" aria-modal="true">
          <button className="checkout-backdrop" onClick={() => setCheckoutOpen(false)} type="button" aria-label="Yopish" />
          <section className="checkout-sheet">
            <div className="sheet-handle" />
            <div className="checkout-head">
              <div><span>Buyurtma</span><h2>Ma'lumotlarni kiriting</h2></div>
              <button className="sheet-close" onClick={() => setCheckoutOpen(false)} type="button"><X aria-hidden="true" /></button>
            </div>
            <form className="checkout-form">
              <label><span>Ism</span><input onChange={(e) => setCustomer((c) => ({ ...c, name: e.target.value }))} placeholder="Ismingiz" type="text" value={customer.name} /></label>
              <label><span>Telefon raqam</span><input inputMode="tel" onChange={(e) => setCustomer((c) => ({ ...c, phone: e.target.value }))} placeholder="+998 90 123 45 67" type="tel" value={customer.phone} /></label>
              <div className="location-field">
                <span>Lokatsiya</span>
                <button
                  onClick={requestLocation}
                  type="button"
                  disabled={locationLoading}
                  style={locationLoading ? { opacity: 0.75, cursor: "not-allowed" } : {}}
                >
                  {locationLoading ? <LocSpinner /> : <MapPin aria-hidden="true" />}
                  {locationLoading ? "Aniqlanmoqda..." : "Lokatsiyani aniqlash"}
                </button>
                {locationLoading && (
                  <p className="location-hint">GPS signal qabul qilinmoqda, biroz kuting...</p>
                )}
                {!locationLoading && customer.location && (
                  <a href={customer.location} target="_blank" rel="noopener noreferrer" className="location-link">
                    📍 Google Maps havolasi tayyor
                  </a>
                )}
                {!locationLoading && locationStatus && (
                  <p className={locationStatus.startsWith("✅") ? "location-ok" : locationStatus.startsWith("❌") ? "location-err" : "location-hint"}>
                    {locationStatus}
                  </p>
                )}
              </div>
            </form>
            <div className="sheet-total"><span>Jami</span><strong>{formatSom(cartTotal)}</strong></div>
            <button className="sheet-submit" onClick={handleOrderButton} type="button">Buyurtmani yuborish</button>
          </section>
        </div>
      )}

      <nav className="bottom-nav" aria-label="Asosiy navigatsiya">
        <button className={activeTab === "products" ? "active" : ""} onClick={() => setActiveTab("products")} type="button"><Home aria-hidden="true" /><span>Mahsulotlar</span></button>
        <button className={activeTab === "cart" ? "active" : ""} onClick={() => setActiveTab("cart")} type="button"><ShoppingCart aria-hidden="true" /><span>Savat</span>{cartCount > 0 && <b className="cart-badge">{cartCount}</b>}</button>
        <button className={activeTab === "history" ? "active" : ""} onClick={() => setActiveTab("history")} type="button"><History aria-hidden="true" /><span>Tarix</span></button>
      </nav>
    </div>
  );
}
export default App;
