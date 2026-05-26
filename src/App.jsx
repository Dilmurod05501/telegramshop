import {
  ArrowLeft,
  BarChart3,
  History,
  Home,
  MapPin,
  Package,
  Search,
  Shield,
  ShoppingBag,
  ShoppingCart,
  Trash2,
  Users,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { categoryCards as defaultCategoryCards, products as defaultProducts } from "./data/products.js";

const ALL_PRODUCTS = "Barcha mahsulotlar";
const GLOBAL_SCOPE = "global";
const DEFAULT_CUSTOMER = {
  name: "",
  phone: "",
  location: "",
};
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "";
const THEME_OPTIONS = ["purple", "gold", "red", "black", "sand", "silver", "gray", "rose"];

function formatSom(value) {
  const amount = Number(value) || 0;
  return `${Math.round(amount)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ".")} so'm`;
}

function getDefaultFavorites() {
  return Object.fromEntries(defaultProducts.map((product) => [product.id, product.favorite]));
}

function getDefaultCatalog() {
  return {
    categories: defaultCategoryCards,
    products: defaultProducts,
  };
}

function createCategoryDraft() {
  return {
    name: "",
    image: "",
  };
}

function createProductDraft(categories) {
  return {
    name: "",
    price: "",
    category: categories[0]?.name ?? "",
    theme: "purple",
    image: "",
    thicknessMm: "",
    widthCm: "",
    heightCm: "",
  };
}

function getTelegramUser() {
  if (typeof window === "undefined") {
    return null;
  }

  return window.Telegram?.WebApp?.initDataUnsafe?.user ?? null;
}

function getPathname() {
  if (typeof window === "undefined") {
    return "/";
  }

  return window.location.pathname.toLowerCase();
}

function usePathname() {
  const [pathname, setPathname] = useState(() => getPathname());

  useEffect(() => {
    function handlePopState() {
      setPathname(getPathname());
    }

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  return pathname;
}

function getStorageScope(user) {
  return user?.id ? `telegram-${user.id}` : "browser-preview";
}

function getStorageKey(scope, name) {
  return `telegram-isolation-market:${scope}:${name}`;
}

function readStoredValue(scope, name, fallback) {
  if (typeof window === "undefined") {
    return fallback;
  }

  try {
    const value = window.localStorage.getItem(getStorageKey(scope, name));
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

function writeStoredValue(scope, name, value) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(getStorageKey(scope, name), JSON.stringify(value));
  } catch {
    // Storage may be unavailable in some embedded browser modes.
  }
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      resolve(typeof reader.result === "string" ? reader.result : "");
    };

    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });
}

function normalizeCategoryInput(category) {
  const name = category.name.trim();

  return {
    name,
    image: category.image || "",
    sample: category.sample || "vibro",
  };
}

function getCoverStyle(image) {
  if (!image) {
    return undefined;
  }

  return {
    backgroundImage: `url(${image})`,
    backgroundPosition: "center",
    backgroundSize: "cover",
  };
}

function normalizeProductInput(product) {
  const name = product.name.trim();
  const category = product.category.trim();
  const id = String(product.id ?? "").trim() || `product-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
  const thicknessMm = Number(product.thicknessMm) || 0;
  const widthCm = Number(String(product.widthCm ?? "").replace(/[^\d.]/g, "")) || 0;
  const heightCm = Number(String(product.heightCm ?? "").replace(/[^\d.]/g, "")) || 0;
  const priceText = String(product.price ?? "").replace(/[^\d.]/g, "");
  const price = Number(priceText);

  return {
    id,
    name,
    price: Number.isFinite(price) ? price : 0,
    theme: product.theme || "purple",
    favorite: Boolean(product.favorite),
    category,
    image: product.image || "",
    thicknessMm,
    widthCm,
    heightCm,
    parameters: [
      widthCm > 0 && heightCm > 0 ? `${widthCm} x ${heightCm} cm` : null,
      thicknessMm > 0 ? `${thicknessMm} mm` : null,
    ].filter(Boolean),
  };
}

function getCatalogSummary(catalog) {
  return {
    categoryCount: catalog.categories.length,
    productCount: catalog.products.length,
  };
}

async function sendOrderToBackend(order) {
  const baseUrl = API_BASE_URL.replace(/\/$/, "");
  const response = await fetch(`${baseUrl}/api/orders`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(order),
  });

  return response.json();
}

function App() {
  const pathname = usePathname();
  const isAdminRoute = pathname === "/admin" || pathname.startsWith("/admin/");
  const initialCatalog = readStoredValue(GLOBAL_SCOPE, "catalog", getDefaultCatalog());
  const initialScope = getStorageScope(getTelegramUser());
  const [telegramUser, setTelegramUser] = useState(() => getTelegramUser());
  const [language, setLanguage] = useState("UZB");
  const [activeCategory, setActiveCategory] = useState(ALL_PRODUCTS);
  const [activeTab, setActiveTab] = useState("products");
  const [query, setQuery] = useState("");
  const [cart, setCart] = useState(() => readStoredValue(initialScope, "cart", {}));
  const [showAllProducts, setShowAllProducts] = useState(false);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [locationStatus, setLocationStatus] = useState("");
  const [customer, setCustomer] = useState(() => readStoredValue(initialScope, "customer", DEFAULT_CUSTOMER));
  const [favorites, setFavorites] = useState(() => readStoredValue(initialScope, "favorites", getDefaultFavorites()));
  const [orderHistory, setOrderHistory] = useState(() => readStoredValue(initialScope, "orders", []));
  const [catalog, setCatalog] = useState(() => initialCatalog);
  const [categoryDraft, setCategoryDraft] = useState(() => createCategoryDraft());
  const [productDraft, setProductDraft] = useState(() => createProductDraft(initialCatalog.categories));
  const [adminNotice, setAdminNotice] = useState("");

  const storageScope = useMemo(() => getStorageScope(telegramUser), [telegramUser]);
  const { categories: catalogCategories, products: catalogProducts } = catalog;

  useEffect(() => {
    const tg = window.Telegram?.WebApp;

    if (!tg) {
      return;
    }

    tg.ready();
    tg.expand();
    tg.setHeaderColor("#8f0821");
    tg.setBackgroundColor("#fffdf8");
    setTelegramUser(tg.initDataUnsafe?.user ?? null);
  }, []);

  useEffect(() => {
    writeStoredValue(GLOBAL_SCOPE, "catalog", catalog);
  }, [catalog]);

  useEffect(() => {
    setCart(readStoredValue(storageScope, "cart", {}));
    setCustomer(readStoredValue(storageScope, "customer", DEFAULT_CUSTOMER));
    setFavorites(readStoredValue(storageScope, "favorites", getDefaultFavorites()));
    setOrderHistory(readStoredValue(storageScope, "orders", []));
  }, [storageScope]);

  useEffect(() => {
    writeStoredValue(storageScope, "cart", cart);
  }, [cart, storageScope]);

  useEffect(() => {
    writeStoredValue(storageScope, "customer", customer);
  }, [customer, storageScope]);

  useEffect(() => {
    writeStoredValue(storageScope, "favorites", favorites);
  }, [favorites, storageScope]);

  useEffect(() => {
    writeStoredValue(storageScope, "orders", orderHistory);
  }, [orderHistory, storageScope]);

  useEffect(() => {
    if (catalogCategories.length === 0) {
      setActiveCategory(ALL_PRODUCTS);
      return;
    }

    if (activeCategory !== ALL_PRODUCTS && !catalogCategories.some((category) => category.name === activeCategory)) {
      setActiveCategory(ALL_PRODUCTS);
    }
  }, [activeCategory, catalogCategories]);

  useEffect(() => {
    if (catalogCategories.length === 0) {
      return;
    }

    if (!catalogCategories.some((category) => category.name === productDraft.category)) {
      setProductDraft((current) => ({ ...current, category: catalogCategories[0]?.name ?? "" }));
    }
  }, [catalogCategories, productDraft.category]);

  useEffect(() => {
    setFavorites((current) => {
      const nextFavorites = { ...current };

      for (const product of catalogProducts) {
        if (typeof nextFavorites[product.id] === "undefined") {
          nextFavorites[product.id] = product.favorite;
        }
      }

      for (const key of Object.keys(nextFavorites)) {
        if (!catalogProducts.some((product) => product.id === key)) {
          delete nextFavorites[key];
        }
      }

      return nextFavorites;
    });
  }, [catalogProducts]);

  useEffect(() => {
    setCart((current) => {
      const nextCart = {};

      for (const product of catalogProducts) {
        if (current[product.id]) {
          nextCart[product.id] = current[product.id];
        }
      }

      return nextCart;
    });
  }, [catalogProducts]);

  const visibleProducts = useMemo(() => {
    const search = query.trim().toLowerCase();

    return catalogProducts.filter((product) => {
      const matchesSearch = product.name.toLowerCase().includes(search);
      const matchesCategory = activeCategory === ALL_PRODUCTS || product.category === activeCategory;
      return matchesSearch && matchesCategory;
    });
  }, [activeCategory, catalogProducts, query]);

  const displayedProducts = visibleProducts;

  const cartCount = Object.values(cart).reduce((sum, qty) => sum + qty, 0);
  const totalRevenue = orderHistory.reduce((sum, order) => sum + order.total, 0);
  const totalItems = orderHistory.reduce(
    (sum, order) => sum + order.items.reduce((orderSum, item) => orderSum + item.qty, 0),
    0,
  );
  const cartItems = catalogProducts
    .map((product) => ({
      ...product,
      qty: cart[product.id] ?? 0,
    }))
    .filter((product) => product.qty > 0);
  const cartTotal = cartItems.reduce((sum, product) => sum + product.price * product.qty, 0);

  function changeQuantity(productId, delta) {
    setCart((current) => {
      const nextQty = Math.max(0, (current[productId] ?? 0) + delta);
      const nextCart = { ...current };

      if (nextQty === 0) {
        delete nextCart[productId];
      } else {
        nextCart[productId] = nextQty;
      }

      return nextCart;
    });
  }

  function setQuantity(productId, value) {
    const parsedQty = Number(String(value).replace(/[^\d]/g, ""));
    const nextQty = Number.isFinite(parsedQty) ? Math.max(0, parsedQty) : 0;

    setCart((current) => {
      const nextCart = { ...current };

      if (nextQty === 0) {
        delete nextCart[productId];
      } else {
        nextCart[productId] = nextQty;
      }

      return nextCart;
    });
  }

  function setDetectedLocation(latitude, longitude) {
    const locationUrl = `https://maps.google.com/?q=${latitude},${longitude}`;
    setCustomer((current) => ({ ...current, location: locationUrl }));
    setLocationStatus("Lokatsiya aniqlandi");
  }

  function requestBrowserLocation() {
    if (!navigator.geolocation) {
      setLocationStatus("Bu qurilmada lokatsiya qo'llab-quvvatlanmaydi");
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setDetectedLocation(position.coords.latitude, position.coords.longitude);
      },
      () => {
        setLocationStatus("Lokatsiya olishga ruxsat berilmadi");
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 },
    );
  }

  function requestLocation() {
    const locationManager = window.Telegram?.WebApp?.LocationManager ?? window.Telegram?.WebApp?.locationManager;

    setLocationStatus("Lokatsiya olinmoqda...");

    if (locationManager?.getLocation) {
      const getLocation = () => {
        locationManager.getLocation((location) => {
          if (location?.latitude && location?.longitude) {
            setDetectedLocation(location.latitude, location.longitude);
          } else {
            requestBrowserLocation();
          }
        });
      };

      if (locationManager.init && !locationManager.isInited) {
        locationManager.init(getLocation);
      } else {
        getLocation();
      }
      return;
    }

    requestBrowserLocation();
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
      userId: telegramUser?.id ?? null,
      customer,
      items: cartItems.map((product) => ({
        id: product.id,
        name: product.name,
        price: product.price,
        qty: product.qty,
        total: Number((product.price * product.qty).toFixed(2)),
      })),
      total: Number(cartTotal.toFixed(2)),
    };

    setOrderHistory((current) => [order, ...current].slice(0, 20));
    setCart({});
    setCheckoutOpen(false);

    try {
      const telegramResult = await sendOrderToBackend(order);

      if (telegramResult?.telegramOk) {
        setLocationStatus("Buyurtma botga yuborildi");
      } else if (telegramResult?.telegramDescription) {
        setLocationStatus(`Bot xatosi: ${telegramResult.telegramDescription}`);
      } else if (telegramResult?.telegramReason === "missing-config") {
        setLocationStatus("Bot sozlamalari backendda yo'q");
      } else {
        setLocationStatus("Buyurtma saqlandi, lekin botga yuborishda muammo bo'ldi");
      }
    } catch {
      setLocationStatus("Buyurtma saqlandi, lekin botga yuborishda muammo bo'ldi");
    }
  }

  function clearScopedStorage() {
    setCart({});
    setCustomer(DEFAULT_CUSTOMER);
    setFavorites(getDefaultFavorites());
    setOrderHistory([]);
    setShowAllProducts(false);
    setCheckoutOpen(false);
    setLocationStatus("");
  }

  async function handleCategoryImageChange(event) {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    const image = await fileToDataUrl(file);
    setCategoryDraft((current) => ({ ...current, image }));
    event.target.value = "";
  }

  function addCategory(event) {
    event.preventDefault();
    const nextCategory = normalizeCategoryInput(categoryDraft);

    if (!nextCategory.name) {
      setAdminNotice("Kategoriya nomini kiriting");
      return;
    }

    setCatalog((current) => {
      const matchIndex = current.categories.findIndex(
        (category) => category.name.toLowerCase() === nextCategory.name.toLowerCase(),
      );

      if (matchIndex >= 0) {
        const updatedCategories = [...current.categories];
        const existingCategory = updatedCategories[matchIndex];
        updatedCategories[matchIndex] = {
          ...existingCategory,
          ...nextCategory,
          image: nextCategory.image || existingCategory.image || "",
        };

        return { ...current, categories: updatedCategories };
      }

      return { ...current, categories: [...current.categories, nextCategory] };
    });

    setCategoryDraft(createCategoryDraft());
    setAdminNotice("Kategoriya saqlandi");
  }

  function removeCategory(name) {
    setCatalog((current) => {
      const nextCategories = current.categories.filter((category) => category.name !== name);
      const nextProducts = current.products.filter((product) => product.category !== name);
      return {
        categories: nextCategories,
        products: nextProducts,
      };
    });
  }

  async function handleProductImageChange(event) {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    const image = await fileToDataUrl(file);
    setProductDraft((current) => ({ ...current, image }));
    event.target.value = "";
  }

  function addProduct(event) {
    event.preventDefault();
    const nextProduct = normalizeProductInput(productDraft);

    if (!nextProduct.name || !nextProduct.category || !nextProduct.price) {
      setAdminNotice("Product uchun nom, kategoriya va narx kerak");
      return;
    }

    const nextProductId = nextProduct.id;

    setCatalog((current) => ({
      ...current,
      products: [nextProduct, ...current.products],
    }));

    setFavorites((current) => ({
      ...current,
      [nextProductId]: nextProduct.favorite,
    }));

    setProductDraft(createProductDraft(catalogCategories));
    setAdminNotice("Product saqlandi");
  }

  function removeProduct(id) {
    setCatalog((current) => ({
      ...current,
      products: current.products.filter((product) => product.id !== id),
    }));
    setCart((current) => {
      const next = { ...current };
      delete next[id];
      return next;
    });
    setFavorites((current) => {
      const next = { ...current };
      delete next[id];
      return next;
    });
  }

  if (isAdminRoute) {
    return (
      <div className="app-frame admin-frame">
        <main className="app-shell admin-shell">
          <header className="top-panel admin-top">
            <div className="top-row admin-top-row">
              <div className="icon-button admin-icon" aria-hidden="true">
                <Shield />
              </div>

              <div className="admin-badge">Admin panel</div>

              <div className="admin-mini-stat">
                <span>Scope</span>
                <strong>{storageScope}</strong>
              </div>
            </div>

            <div className="admin-hero">
              <div>
                <span>Boshqaruv markazi</span>
                <h1>Catalog & orders</h1>
              </div>
              <div className="admin-hero-card">
                <BarChart3 aria-hidden="true" />
                <strong>{orderHistory.length}</strong>
                <span>buyurtma</span>
              </div>
            </div>
          </header>

          <section className="admin-content view-panel" aria-label="Admin panel">
            {adminNotice && <div className="admin-notice">{adminNotice}</div>}
            <div className="admin-stats">
              <article>
                <Users aria-hidden="true" />
                <span>User</span>
                <strong>{telegramUser?.id ?? "browser"}</strong>
              </article>
              <article>
                <ShoppingCart aria-hidden="true" />
                <span>Savat</span>
                <strong>{cartCount}</strong>
              </article>
              <article>
                <Package aria-hidden="true" />
                <span>Mahsulot</span>
                <strong>{catalogProducts.length}</strong>
              </article>
              <article>
                <BarChart3 aria-hidden="true" />
                <span>Jami tushum</span>
                <strong>{formatSom(totalRevenue)}</strong>
              </article>
            </div>

            <div className="admin-grid">
              <section className="admin-panel">
                <div className="section-title admin-title">
                  <h2>Kategoriya qo'shish</h2>
                  <span>{getCatalogSummary(catalog).categoryCount} ta</span>
                </div>

                <form className="admin-form" onSubmit={addCategory}>
                  <label>
                    <span>Nomi</span>
                    <input
                      onChange={(event) => setCategoryDraft((current) => ({ ...current, name: event.target.value }))}
                      placeholder="Masalan: Akustika"
                      type="text"
                      value={categoryDraft.name}
                    />
                  </label>

                  <label>
                    <span>Rasm</span>
                    <input accept="image/*" onChange={handleCategoryImageChange} type="file" />
                  </label>

                  <div className="admin-preview">
                    <div
                      className={`admin-preview-thumb ${categoryDraft.image ? "" : "admin-category-preview"}`}
                      style={getCoverStyle(categoryDraft.image)}
                    />
                    <div>
                      <strong>{categoryDraft.name || "Kategoriya nomi"}</strong>
                      <span>{categoryDraft.image ? "Rasm yuklandi" : "Rasm yo'q"}</span>
                    </div>
                  </div>

                  <div className="admin-action-row">
                    <button className="admin-submit" type="submit">
                      Kategoriya qo'shish
                    </button>
                    <button className="admin-delete" onClick={() => removeCategory(categoryDraft.name.trim())} type="button">
                      Delete
                    </button>
                  </div>
                </form>

                <div className="admin-pills">
                  {catalogCategories.map((category) => (
                    <button key={category.name} className="admin-pill" onClick={() => setCategoryDraft({ name: category.name, image: category.image || "" })} type="button">
                      {category.name}
                    </button>
                  ))}
                </div>
              </section>

              <section className="admin-panel">
                <div className="section-title admin-title">
                  <h2>Product qo'shish</h2>
                  <span>{getCatalogSummary(catalog).productCount} ta</span>
                </div>

                <form className="admin-form" onSubmit={addProduct}>
                  <label>
                    <span>Nomi</span>
                    <input
                      onChange={(event) => setProductDraft((current) => ({ ...current, name: event.target.value }))}
                      placeholder="Mahsulot nomi"
                      type="text"
                      value={productDraft.name}
                    />
                  </label>

                  <div className="admin-grid-2">
                    <label>
                      <span>Kategoriya</span>
                      <select
                        onChange={(event) => setProductDraft((current) => ({ ...current, category: event.target.value }))}
                        value={productDraft.category}
                      >
                        {catalogCategories.map((category) => (
                          <option key={category.name} value={category.name}>
                            {category.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      <span>Narx</span>
                      <input
                        inputMode="decimal"
                        onChange={(event) => setProductDraft((current) => ({ ...current, price: event.target.value }))}
                        placeholder="39 000"
                        type="text"
                        value={productDraft.price}
                      />
                    </label>
                  </div>

                  <div className="admin-grid-2">
                    <label>
                      <span>Eni, cm</span>
                      <input
                        min="0"
                        onChange={(event) => setProductDraft((current) => ({ ...current, widthCm: event.target.value }))}
                        placeholder="120"
                        type="number"
                        value={productDraft.widthCm}
                      />
                    </label>
                    <label>
                      <span>Bo'yi, cm</span>
                      <input
                        min="0"
                        onChange={(event) => setProductDraft((current) => ({ ...current, heightCm: event.target.value }))}
                        placeholder="200"
                        type="number"
                        value={productDraft.heightCm}
                      />
                    </label>
                  </div>

                  <div className="admin-grid-2">
                    <label>
                      <span>Rasm</span>
                      <input accept="image/*" onChange={handleProductImageChange} type="file" />
                    </label>
                    <label>
                      <span>Qalinlik (mm)</span>
                      <input
                        inputMode="numeric"
                        onChange={(event) => setProductDraft((current) => ({ ...current, thicknessMm: event.target.value }))}
                        placeholder="10"
                        type="text"
                        value={productDraft.thicknessMm}
                      />
                    </label>
                  </div>

                  <label>
                    <span>Theme</span>
                    <select
                      onChange={(event) => setProductDraft((current) => ({ ...current, theme: event.target.value }))}
                      value={productDraft.theme}
                    >
                      {THEME_OPTIONS.map((theme) => (
                        <option key={theme} value={theme}>
                          {theme}
                        </option>
                      ))}
                    </select>
                  </label>

                  <div className="admin-preview">
                    <div
                      className={`admin-preview-thumb ${productDraft.image ? "" : productDraft.theme}`}
                      style={getCoverStyle(productDraft.image)}
                    />
                    <div>
                      <strong>{productDraft.name || "Product nomi"}</strong>
                      <span>
                        {productDraft.category || "Kategoriya"} -{" "}
                        {productDraft.widthCm && productDraft.heightCm
                          ? `${productDraft.widthCm} x ${productDraft.heightCm} cm`
                          : "razmer"}
                      </span>
                    </div>
                  </div>

                  <button className="admin-submit" type="submit">
                    Product qo'shish
                  </button>
                </form>

                <div className="admin-product-list">
                  {catalogProducts.map((product) => (
                    <article key={product.id} className="admin-product-row">
                      <div className="admin-product-meta">
                        <div
                          className={`admin-product-thumb ${product.image ? "admin-product-thumb-image" : product.theme}`}
                          style={getCoverStyle(product.image)}
                        />
                        <div>
                          <strong>{product.name}</strong>
                          <span>
                            {product.category} - {product.widthCm && product.heightCm ? `${product.widthCm} x ${product.heightCm} cm` : "razmer yo'q"}
                          </span>
                        </div>
                      </div>
                      <button className="admin-row-delete" onClick={() => removeProduct(product.id)} type="button">
                        O'chirish
                      </button>
                    </article>
                  ))}
                </div>
              </section>

              <section className="admin-panel">
                <div className="section-title admin-title">
                  <h2>So'nggi buyurtmalar</h2>
                  <span>{totalItems} dona</span>
                </div>

                {orderHistory.length === 0 ? (
                  <div className="empty-admin">
                    <History aria-hidden="true" />
                    <h3>Hali buyurtma yo'q</h3>
                    <p>Tarix bo'limidagi ma'lumotlar shu yerda ham ko'rinadi.</p>
                  </div>
                ) : (
                  <div className="admin-list">
                    {orderHistory.map((order) => (
                      <article className="admin-item" key={order.id}>
                        <div className="admin-item-head">
                          <div>
                            <span>{new Date(order.createdAt).toLocaleString("uz-UZ")}</span>
                            <h3>{order.customer.name || "Ism kiritilmagan"}</h3>
                          </div>
                          <strong>{formatSom(order.total)}</strong>
                        </div>
                        <p>
                          {order.items.reduce((sum, item) => sum + item.qty, 0)} dona - {order.items.length} xil mahsulot
                        </p>
                      </article>
                    ))}
                  </div>
                )}
              </section>

              <section className="admin-panel">
                <div className="section-title admin-title">
                  <h2>User ma'lumotlari</h2>
                  <span>Scopega bog'langan</span>
                </div>

                <div className="admin-data">
                  <div>
                    <span>Ism</span>
                    <strong>{customer.name || "-"}</strong>
                  </div>
                  <div>
                    <span>Telefon</span>
                    <strong>{customer.phone || "-"}</strong>
                  </div>
                  <div>
                    <span>Lokatsiya</span>
                    <strong>{customer.location ? "Tayyor" : "-"}</strong>
                  </div>
                </div>

                <div className="admin-actions">
                  <button className="danger-button" onClick={clearScopedStorage} type="button">
                    <Trash2 aria-hidden="true" />
                    Shu user data tozalash
                  </button>
                </div>
              </section>
            </div>
          </section>
        </main>
      </div>
    );
  }

    return (
      <div className="app-frame">
        <main className="app-shell">
        <header className="top-panel">
          <div className="top-row">
            <button className="icon-button" aria-label="Orqaga" type="button">
              <ArrowLeft aria-hidden="true" />
            </button>

            <div className={`language-switch ${language === "RUS" ? "rus-active" : ""}`} aria-label="Tilni tanlash">
              <span className="switch-thumb" aria-hidden="true" />
              {["UZB", "RUS"].map((item) => (
                <button
                  className={language === item ? "active" : ""}
                  key={item}
                  onClick={() => setLanguage(item)}
                  type="button"
                >
                  {item}
                </button>
              ))}
            </div>
          </div>

          <label className="search-box">
            <Search aria-hidden="true" />
            <input
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Mahsulotlarni izlash..."
              type="search"
              value={query}
            />
          </label>
        </header>

        {activeTab === "products" && (
          <div className="view-panel" key="products-view">
            <section className="category-grid" aria-label="Mahsulot kategoriyalari">
              <h2>Mahsulotlar turi</h2>
              {catalogCategories.map((category) => (
                <button
                  className={activeCategory === category.name ? "active" : ""}
                  key={category.name}
                  onClick={() => {
                    setActiveCategory(category.name);
                    setShowAllProducts(false);
                  }}
                  type="button"
                >
                  <span
                    className={`category-art ${category.image ? "category-art-image" : `category-art-${category.sample}`}`}
                    style={getCoverStyle(category.image)}
                  />
                  <span>{category.name}</span>
                </button>
              ))}
            </section>

            <section className="section-title">
              <h1>{activeCategory}</h1>
              <button onClick={() => setShowAllProducts((current) => !current)} type="button">
                {showAllProducts ? "Kamroq ko'rish" : "Hammasini ko'rish"}
              </button>
            </section>

            <section className={`product-grid ${showAllProducts ? "expanded" : ""}`} key={activeCategory} aria-label="Mahsulotlar">
              {displayedProducts.map((product) => (
                <article className="product-card" key={product.id}>
                  <div
                    className={`product-image mat ${product.image ? "product-image-uploaded" : product.theme}`}
                    style={getCoverStyle(product.image)}
                  />
                  <h2>{product.name}</h2>
                  <div className="product-meta-line">
                    <span>{product.category}</span>
                  </div>
                  <div className="product-spec-line">
                    <span className="product-spec-label">Razmeri</span>
                    <span className="product-spec-value">{product.widthCm && product.heightCm ? `${product.widthCm} x ${product.heightCm} cm` : "yo'q"}</span>
                  </div>
                  <div className="product-spec-line">
                    <span className="product-spec-label">Qalinligi</span>
                    <span className="product-spec-value">{product.thicknessMm ? `${product.thicknessMm} mm` : "yo'q"}</span>
                  </div>

                  <div className="card-footer">
                    <strong>{formatSom(product.price)}</strong>
                    <div className="stepper" aria-label="Miqdor">
                      <button onClick={() => changeQuantity(product.id, -1)} type="button">
                        -
                      </button>
                      <input
                        aria-label={`${product.name} miqdori`}
                        inputMode="numeric"
                        onChange={(event) => setQuantity(product.id, event.target.value)}
                        type="number"
                        min="0"
                        value={cart[product.id] ?? 0}
                      />
                      <button onClick={() => changeQuantity(product.id, 1)} type="button">
                        +
                      </button>
                    </div>
                  </div>
                </article>
              ))}
            </section>
          </div>
        )}

        {activeTab === "cart" && (
          <section className="cart-view view-panel" key="cart-view" aria-label="Savat">
            <div className="section-title cart-title">
              <h1>Savat</h1>
              <button onClick={() => setActiveTab("products")} type="button">
                Mahsulot qo'shish
              </button>
            </div>

            {cartItems.length === 0 ? (
              <div className="empty-cart">
                <ShoppingBag aria-hidden="true" />
                <h2>Savat bo'sh</h2>
                <p>Mahsulotlardan birini tanlab, + tugmasini bosing.</p>
              </div>
            ) : (
              <>
                <div className="cart-list">
                  {cartItems.map((product) => (
                    <article className="cart-item" key={product.id}>
                      <div
                        className={`cart-thumb mat ${product.image ? "product-image-uploaded" : product.theme}`}
                        style={getCoverStyle(product.image)}
                      />
                      <div className="cart-info">
                        <h2>{product.name}</h2>
                        <p>{formatSom(product.price)}</p>
                        <div className="cart-params">
                          {[
                            ...(product.parameters ?? []),
                            product.thicknessMm ? `${product.thicknessMm} mm` : null,
                          ]
                            .filter(Boolean)
                            .slice(0, 2)
                            .map((param) => (
                              <span key={param}>{param}</span>
                            ))}
                        </div>
                      </div>
                      <div className="cart-actions">
                        <div className="stepper compact" aria-label="Miqdor">
                          <button onClick={() => changeQuantity(product.id, -1)} type="button">
                            -
                          </button>
                          <input
                            aria-label={`${product.name} miqdori`}
                            inputMode="numeric"
                            onChange={(event) => setQuantity(product.id, event.target.value)}
                            type="number"
                            min="0"
                            value={product.qty}
                          />
                          <button onClick={() => changeQuantity(product.id, 1)} type="button">
                            +
                          </button>
                        </div>
                        <strong>{formatSom(product.price * product.qty)}</strong>
                      </div>
                    </article>
                  ))}
                </div>

                <div className="cart-summary">
                  <div>
                    <span>Jami</span>
                    <strong>{formatSom(cartTotal)}</strong>
                  </div>
                  <button onClick={handleOrderButton} type="button">
                    {checkoutOpen ? "Buyurtmani yuborish" : "Buyurtma berish"}
                  </button>
                </div>
              </>
            )}
          </section>
        )}

        {activeTab === "history" && (
          <section className="history-view view-panel" key="history-view" aria-label="Buyurtmalar tarixi">
            <div className="section-title cart-title">
              <h1>Tarix</h1>
            </div>
            {orderHistory.length === 0 ? (
              <div className="empty-cart">
                <History aria-hidden="true" />
                <h2>Tarix bo'sh</h2>
                <p>Buyurtma yuborilgandan keyin u shu yerda saqlanadi.</p>
              </div>
            ) : (
              <div className="history-list">
                {orderHistory.map((order) => (
                  <article className="history-item" key={order.id}>
                    <div className="history-head">
                      <div>
                        <span>{new Date(order.createdAt).toLocaleDateString("uz-UZ")}</span>
                        <h2>Buyurtma #{order.id.slice(-6)}</h2>
                      </div>
                      <strong>{formatSom(order.total)}</strong>
                    </div>
                    <p>
                      {order.items.length} xil mahsulot, {order.items.reduce((sum, item) => sum + item.qty, 0)} dona
                    </p>
                    <div className="history-products">
                      {order.items.map((item) => (
                        <span key={item.id}>
                          {item.name} x{item.qty}
                        </span>
                      ))}
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        )}
      </main>

      {checkoutOpen && (
        <div className="checkout-overlay" role="dialog" aria-modal="true" aria-label="Buyurtma ma'lumotlari">
          <button className="checkout-backdrop" onClick={() => setCheckoutOpen(false)} type="button" aria-label="Yopish" />
          <section className="checkout-sheet">
            <div className="sheet-handle" />
            <div className="checkout-head">
              <div>
                <span>Buyurtma</span>
                <h2>Ma'lumotlarni kiriting</h2>
              </div>
              <button className="sheet-close" onClick={() => setCheckoutOpen(false)} type="button" aria-label="Yopish">
                <X aria-hidden="true" />
              </button>
            </div>

            <form className="checkout-form">
              <label>
                <span>Ism</span>
                <input
                  onChange={(event) => setCustomer((current) => ({ ...current, name: event.target.value }))}
                  placeholder="Ismingiz"
                  type="text"
                  value={customer.name}
                />
              </label>
              <label>
                <span>Telefon raqam</span>
                <input
                  inputMode="tel"
                  onChange={(event) => setCustomer((current) => ({ ...current, phone: event.target.value }))}
                  placeholder="+998 90 123 45 67"
                  type="tel"
                  value={customer.phone}
                />
              </label>
              <div className="location-field">
                <span>Lokatsiya</span>
                <button onClick={requestLocation} type="button">
                  <MapPin aria-hidden="true" />
                  Lokatsiyani aniqlash
                </button>
                {customer.location && <a href={customer.location}>Google Maps havolasi tayyor</a>}
                {locationStatus && <p>{locationStatus}</p>}
              </div>
            </form>

            <div className="sheet-total">
              <span>Jami</span>
              <strong>{formatSom(cartTotal)}</strong>
            </div>
            <button className="sheet-submit" onClick={handleOrderButton} type="button">
              Buyurtmani yuborish
            </button>
          </section>
        </div>
      )}

      <nav className="bottom-nav" aria-label="Asosiy navigatsiya">
        <button className={activeTab === "products" ? "active" : ""} onClick={() => setActiveTab("products")} type="button">
          <Home aria-hidden="true" />
          <span>Mahsulotlar</span>
        </button>
        <button className={activeTab === "cart" ? "active" : ""} onClick={() => setActiveTab("cart")} type="button">
          <ShoppingCart aria-hidden="true" />
          <span>Savat</span>
          {cartCount > 0 && <b className="cart-badge">{cartCount}</b>}
        </button>
        <button
          className={activeTab === "history" ? "active" : ""}
          onClick={() => setActiveTab("history")}
          type="button"
        >
          <History aria-hidden="true" />
          <span>Tarix</span>
        </button>
      </nav>
    </div>
  );
}

export default App;
