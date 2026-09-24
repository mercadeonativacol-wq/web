
// Escanea products/001.json, 002.json... hasta que uno no exista.
// Campos opcionales por producto: images (galería completa) y embeds (vistas 3D/iframe).
// El slideshow de "Nosotros" hace lo mismo con homepage/001.jpg, 002.png, etc.

const PRODUCTS_DIR = 'products';
const HOMEPAGE_DIR = 'homepage';
const HOMEPAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp'];
const SLIDE_INTERVAL_MS = 5500;
// Las 3 mini colecciones de lanzamiento, en el orden en que deben mostrarse.
// Si aparece una colección nueva en un JSON que no está en esta lista, se añade
// automáticamente al final (ver buildCollectionFilters).
const COLLECTIONS_ORDER = ['Cayena', 'Nativa', 'Évora'];
let ALL_PRODUCTS = [];
let cart = JSON.parse(localStorage.getItem('nativa_cart') || '[]');
let currentCollection = 'todas';
let currentFilter = 'todos';
let currentGallery = [];
let currentGalleryIndex = 0;
let currentDetailProduct = null;

// ---------- LÍMITES Y PERFILES (mockup) ----------
// Cantidad máxima que el público general puede comprar por producto.
const PUBLIC_QTY_LIMIT = 10;
// Cantidad máxima interna (ventas por mayor, almacenada en los JSON).
const BULK_QTY_LIMIT = 10000;
// Venta por mayor: solo con sesión iniciada en uno de los perfiles internos.
const PROFILES = {
  admin:         { label: 'Administrador',    color: '#5c1a28' },
  internacional: { label: 'Internacional',    color: '#3d5a80' },
  local:         { label: 'Local (Barranquilla)', color: '#5d7a5a' },
  nacional:      { label: 'Nacional (Colombia)',  color: '#b8862e' }
};
const SESSION_STORAGE_KEY = 'nativa_session';
let session = null;
try { session = JSON.parse(localStorage.getItem(SESSION_STORAGE_KEY) || 'null'); } catch (e) { session = null; }

function isBulkAllowed() { return !!session; }

function currentProfileLabel() {
  return session && PROFILES[session.profile] ? PROFILES[session.profile].label : '';
}

// Máximo de unidades permitido para un producto según el estado de la sesión.
function qtyLimitFor(product) {
  if (!product) return PUBLIC_QTY_LIMIT;
  const stockCap = (typeof product.stock === 'number' && product.stock > 0) ? product.stock : BULK_QTY_LIMIT;
  return isBulkAllowed() ? Math.min(BULK_QTY_LIMIT, stockCap) : Math.min(PUBLIC_QTY_LIMIT, stockCap);
}

// ---------- INICIO DE SESIÓN (mockup) ----------
// El perfil se deriva del usuario: admin, internacional, local o nacional.
// La contraseña de cada usuario es su propio nombre (mockup).
const MOCK_USERS = ['admin', 'internacional', 'local', 'nacional'];

function openLogin() {
  document.getElementById('loginError').style.display = 'none';
  document.getElementById('loginModal').classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeLogin() {
  document.getElementById('loginModal').classList.remove('open');
  document.body.style.overflow = '';
}

function attemptLogin(ev) {
  if (ev) ev.preventDefault();
  const user = document.getElementById('loginUser').value.trim().toLowerCase();
  const pass = document.getElementById('loginPass').value.trim();

  if (!MOCK_USERS.includes(user) || pass !== user) {
    const err = document.getElementById('loginError');
    err.textContent = 'Usuario o contraseña incorrectos.';
    err.style.display = 'block';
    return false;
  }

  session = { user, profile: user, since: new Date().toLocaleString('es-CO') };
  localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
  closeLogin();
  updateSessionUI();
  showToast('Sesión iniciada: ' + currentProfileLabel());
  return false;
}

function logout() {
  session = null;
  localStorage.removeItem(SESSION_STORAGE_KEY);
  // El carrito bulk se recorta al límite público al perder la sesión.
  clampCartToPublicLimits();
  updateSessionUI();
  showToast('Sesión cerrada');
}

function updateSessionUI() {
  const badge = document.getElementById('sessionBadge');
  const loginBtn = document.getElementById('loginBtn');
  if (session) {
    const prof = PROFILES[session.profile] || { label: session.profile, color: 'var(--gris)' };
    badge.innerHTML = `<span class="session-dot" style="background:${prof.color}"></span>${prof.label} · <span class="session-logout" onclick="logout()">Salir</span>`;
    badge.style.display = 'inline-flex';
    badge.title = 'Sesión iniciada como ' + session.user;
    loginBtn.style.display = 'none';
  } else {
    badge.style.display = 'none';
    loginBtn.style.display = 'inline-flex';
  }
  if (ALL_PRODUCTS.length) renderProducts();
}

function clampCartToPublicLimits() {
  // Al cerrar sesión, el carrito puede exceder el límite público (100).
  // Se recorta para que nadie conserve un carrito bulk sin sesión activa.
  if (isBulkAllowed()) return;
  let changed = false;
  cart = cart.map(item => {
    const p = ALL_PRODUCTS.find(pr => pr.id === item.id);
    const max = qtyLimitFor(p);
    if (item.qty > max) { changed = true; return { ...item, qty: max }; }
    return item;
  });
  if (changed) { saveCart(); updateCartUI(); }
}
function toggleLoginModal() {
  if (session) logout();
  else openLogin();
}

// ---------- CONFIGURACIÓN DE ENVÍOS (estimado en pesos colombianos) ----------
// Peso interno por producto (solo para el cálculo de tarifas; no se muestra).
const PRODUCT_WEIGHT_GRAMS = 220;
// Origen de los envíos.
const SHIPPING_ORIGIN_COUNTRY = 'Colombia';
const ORIGIN_CITY = 'Barranquilla';

// Tarifas NACIONALES por tramo (COP), calibradas POR LO ALTO según los
// estimadores de Servientrega/Coordinadora (1 kg = $10.000-$18.000 según ruta).
// Son un ESTIMADO: el costo final lo confirma el equipo de Nativa.
const LOCAL_AREA_CITIES = ['Barranquilla', 'Soledad', 'Puerto Colombia', 'Galapa', 'Malambo'];
const MAIN_CITIES_CO = ['Bogotá', 'Bogotá D.C.', 'Medellín', 'Cali', 'Cartagena', 'Cúcuta', 'Bucaramanga', 'Ibagué', 'Pereira', 'Santa Marta', 'Villavicencio', 'Bello', 'Valledupar', 'Montería', 'Manizales', 'Neiva', 'Pasto', 'Armenia', 'Popayán', 'Palmira', 'Sincelejo', 'Riohacha', 'Floridablanca', 'Envigado', 'Itagüí', 'Tuluá', 'Tunja', 'Yopal', 'Dosquebradas', 'Buenaventura'];
const DOMESTIC_RATES = [
  { tier: 'local', label: 'Área Metropolitana de Barranquilla', base: 8000, perKg: 3500, days: 2 },
  { tier: 'principal', label: 'Ciudades principales', base: 13000, perKg: 6000, days: 4 },
  { tier: 'municipios', label: 'Municipios y resto del país', base: 18000, perKg: 8000, days: 5 }
];
// Entrega en campus (mockup): gratis, se coordina con el equipo.
const CAMPUS_DELIVERY = {
  enabled: true,
  label: 'Entrega en campus Uninorte (gratis)',
  cost: 0,
  days: 1,
  note: 'Coordina la entrega con el equipo de Nativa al confirmar el pedido.'
};

// Formatea un rango de días hábiles como texto legible.
function daysRangeText(days) {
  return days + (days === 1 ? ' día hábil' : ' días hábiles');
}

// ---------- SELECTOR DE MONEDA (referencia; el cobro siempre es en COP) ----------
// Tasas de respaldo por si la API de TRM falla; se actualizan en vivo.
const REFERENCE_CURRENCIES = [
  { code: 'COP', label: 'Pesos Colombianos (COP)', symbol: '$', fallbackRate: 1 },
  { code: 'USD', label: 'Dólar Americano (USD)', symbol: 'US$', fallbackRate: 3900 },
  { code: 'EUR', label: 'Euro (EUR)', symbol: '€', fallbackRate: 4250 },
  { code: 'AUD', label: 'Dólar Australiano (AUD)', symbol: 'A$', fallbackRate: 2600 }
];
let TRM = { COP: 1, USD: 3900, EUR: 4250, AUD: 2600 }; // 1 unidad = X COP
let TRM_LOADED = false;

// TRM oficial de Colombia (API gratuita y pública del grupo SuperFIN).
async function fetchTRM() {
  try {
    const res = await fetch('https://www.datos.gov.co/resource/32sa-8pi3.json?$limit=1&$order=vigenciadesde%20DESC');
    const data = await res.json();
    if (data && data.length && data[0].valor) {
      TRM.USD = parseFloat(data[0].valor);
      TRM_LOADED = true;
    }
  } catch (e) { console.warn('TRM:', e); }
  // EUR y AUD derivados vía USD con cruces aproximados fijos (mockup).
  TRM.EUR = TRM.USD * 1.09;
  TRM.AUD = TRM.USD * 0.66;
  try { localStorage.setItem('nativa_trm', JSON.stringify({ usd: TRM.USD, at: Date.now() })); } catch (e) {}
}

function refCurrencyFor() {
  return REFERENCE_CURRENCIES.find(c => c.code === DISPLAY_CCY) || REFERENCE_CURRENCIES[0];
}



// ---------- GUARDADO DE PEDIDOS (localStorage) ----------
const ORDERS_KEY = 'nativa_orders';

function saveOrderRecord(order, paymentLabel, status) {
  try {
    const list = JSON.parse(localStorage.getItem(ORDERS_KEY) || '[]');
    const { pdfBuffer, ...rec } = order;
    rec.paymentMethodLabel = paymentLabel || rec.paymentMethodLabel || 'Por definir';
    rec.status = status || rec.status || 'Registrado';
    rec.placedAt = Date.now();
    rec.profile = session ? session.profile : 'publico';
    list.push(rec);
    localStorage.setItem(ORDERS_KEY, JSON.stringify(list));
  } catch (e) { console.warn('No se pudo guardar el pedido:', e); }
}

function updateOrderStatus(number, status) {
  try {
    const list = JSON.parse(localStorage.getItem(ORDERS_KEY) || '[]');
    const rec = list.find(o => o.number === number);
    if (rec) { rec.status = status; localStorage.setItem(ORDERS_KEY, JSON.stringify(list)); }
  } catch (e) {}
}

// ---------- TRACKING SIMULADO (fases de producción y envío) ----------
const TRACKING_PHASES = [
  { key: 'pedido', label: 'Pedido recibido' },
  { key: 'materiales', label: 'Materiales en preparación' },
  { key: 'produccion', label: 'En producción artesanal' },
  { key: 'calidad', label: 'Control de calidad' },
  { key: 'listo', label: 'Listo / en envío' },
  { key: 'entregado', label: 'Entregado' }
];

// Progreso 0..1 comparando el momento del pedido con la fecha estimada de entrega.
function trackingProgressFor(rec) {
  if (!rec || !rec.placedAt || !rec.totalBusinessDays) return 0;
  const elapsed = Date.now() - rec.placedAt;
  const span = rec.totalBusinessDays * 24 * 60 * 60 * 1000;
  return Math.max(0, Math.min(1, elapsed / span));
}

function trackingPhaseIndexFor(rec) {
  const p = trackingProgressFor(rec);
  if (p <= 0) return 0;
  // Fases: pedido (0-15%), materiales (15-35%), producción (35-70%), calidad (70-85%), listo (85-100%), entregado (al completar)
  if (p >= 1) return 5;
  if (p >= 0.85) return 4;
  if (p >= 0.7) return 3;
  if (p >= 0.35) return 2;
  if (p >= 0.15) return 1;
  return 0;
}

function renderTrackingBar(rec, mountId) {
  const mount = document.getElementById(mountId);
  if (!mount || !rec) return;
  const idx = trackingPhaseIndexFor(rec);
  const pct = Math.round(trackingProgressFor(rec) * 100);
  mount.innerHTML = `
    <div class="track-bar"><div class="track-fill" style="width:${pct}%"></div></div>
    <div class="track-phases">
      ${TRACKING_PHASES.map((ph, i) => `
        <span class="track-phase${i <= idx ? ' done' : ''}${i === idx ? ' current' : ''}">${ph.label}</span>
      `).join('')}
    </div>
    <p class="track-note">Simulación de seguimiento según el tiempo estimado del pedido ${rec.number}.</p>
  `;
}

// ---------- VISTA "MIS PEDIDOS" ----------

function openOrders() {
  renderOrdersList();
  document.getElementById('ordersModal').classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeOrders() {
  document.getElementById('ordersModal').classList.remove('open');
  document.body.style.overflow = '';
}

function renderOrdersList() {
  const mount = document.getElementById('ordersList');
  if (!mount) return;
  let list = [];
  try { list = JSON.parse(localStorage.getItem(ORDERS_KEY) || '[]'); } catch (e) {}
  if (!list.length) {
    mount.innerHTML = '<div class="orders-empty">Aún no hay pedidos registrados en este dispositivo.</div>';
    return;
  }
  mount.innerHTML = list.slice().reverse().map(rec => {
    const paid = (rec.status || '').includes('APROBADO') || (rec.status || '').includes('Pagado');
    return `
      <div class="order-card">
        <div class="order-card-head">
          <strong>Pedido ${rec.number}</strong>
          <span class="order-status${paid ? ' ok' : ''}">${rec.status || 'Registrado'}</span>
        </div>
        <div class="order-meta">
          ${rec.items.map(it => `${it.qty}× ${it.title}${it.variant ? ' · ' + it.variant : ''}`).join(' · ')}<br>
          Total ${fmtPrice(rec.total)} · Entrega estimada: ${rec.etaText || 'a coordinar'}<br>
          ${rec.deliveryLabel || ''}
        </div>
        <div id="track-${rec.number}"></div>
        <div class="modal-actions" style="margin-top:10px">
          <button class="btn-secondary" onclick="downloadOrderInvoice(findOrderRecord('${rec.number}'))">Descargar factura</button>
        </div>
      </div>
    `;
  }).join('');
  list.forEach(rec => renderTrackingBar(rec, 'track-' + rec.number));
}

function findOrderRecord(number) {
  try {
    const list = JSON.parse(localStorage.getItem(ORDERS_KEY) || '[]');
    return list.find(o => o.number === String(number)) || null;
  } catch (e) { return null; }
}

// Oculta los campos de dirección cuando se elige entrega en campus.
function updateAddressVisibility() {
  const campus = isCampusSelected();
  const grid = document.querySelector('.addr-grid');
  const map = document.getElementById('mapPreview');
  if (grid) grid.style.display = campus ? 'none' : '';
  if (map && campus) map.style.display = 'none';
}

// Tarifas INTERNACIONALES por zona de destino (COP), estimadas por lo alto.
const SHIPPING_RATE_ZONES = [
  { zone: 'América', countries: ['México', 'Estados Unidos', 'Canadá', 'Brasil', 'Argentina', 'Chile', 'Perú', 'Ecuador', 'Otro país de América'], base: 75000, perKg: 20000, days: 10 },
  { zone: 'Europa', countries: ['España', 'Francia', 'Alemania', 'Italia', 'Reino Unido', 'Países Bajos', 'Otro país de Europa'], base: 95000, perKg: 24000, days: 12 },
  { zone: 'Resto del mundo', countries: ['Australia', 'Japón', 'Emiratos Árabes Unidos', 'Otro país'], base: 120000, perKg: 30000, days: 15 }
];

// Departamentos de Colombia con sus ciudades principales (para los selectores).
const COLOMBIA_STATES = {
  'Atlántico': ['Barranquilla', 'Soledad', 'Malambo', 'Puerto Colombia', 'Galapa', 'Baranoa', 'Sabanagrande', 'Santo Tomás', 'Tubará', 'Usiacurí'],
  'Amazonas': ['Leticia', 'Puerto Nariño'],
  'Antioquia': ['Medellín', 'Envigado', 'Itagüí', 'Bello', 'Rionegro', 'Apartadó', 'Caucasia', 'Sabaneta'],
  'Arauca': ['Arauca', 'Saravena'],
  'Bolívar': ['Cartagena', 'Magangué', 'Turbaco', 'Arjona'],
  'Boyacá': ['Tunja', 'Duitama', 'Sogamoso', 'Chiquinquirá'],
  'Caldas': ['Manizales', 'La Dorada', 'Villamaría'],
  'Caquetá': ['Florencia', 'San Vicente del Caguán'],
  'Casanare': ['Yopal', 'Aguazul'],
  'Cauca': ['Popayán', 'Santander de Quilichao', 'Puerto Tejada'],
  'Cesar': ['Valledupar', 'Aguachica', 'Bosconia'],
  'Chocó': ['Quibdó', 'Istmina'],
  'Córdoba': ['Montería', 'Lorica', 'Planeta Rica', 'Sahagún'],
  'Cundinamarca': ['Soacha', 'Zipaquirá', 'Chía', 'Fusagasugá', 'Girardot', 'Cajicá'],
  'Bogotá D.C.': ['Bogotá', 'Bogotá D.C.'],
  'Guainía': ['Inírida'],
  'Guaviare': ['San José del Guaviare'],
  'Huila': ['Neiva', 'Pitalito', 'Garzón'],
  'La Guajira': ['Riohacha', 'Maicao', 'Uribia'],
  'Magdalena': ['Santa Marta', 'Ciénaga', 'Fundación'],
  'Meta': ['Villavicencio', 'Acacías', 'Granada'],
  'Nariño': ['Pasto', 'Ipiales', 'Tumaco'],
  'Norte de Santander': ['Cúcuta', 'Ocaña', 'Pamplona'],
  'Putumayo': ['Mocoa', 'Puerto Asís', 'Orito'],
  'Quindío': ['Armenia', 'Calarcá', 'La Tebaida'],
  'Risaralda': ['Pereira', 'Dosquebradas', 'Santa Rosa de Cabal'],
  'San Andrés y Providencia': ['San Andrés'],
  'Santander': ['Bucaramanga', 'Floridablanca', 'Barrancabermeja', 'Girón', 'Piedecuesta'],
  'Sucre': ['Sincelejo', 'Corozal', 'Sampués'],
  'Tolima': ['Ibagué', 'Espinal', 'Melgar'],
  'Valle del Cauca': ['Cali', 'Palmira', 'Buenaventura', 'Tuluá', 'Cartago', 'Buga'],
  'Vaupés': ['Mitú'],
  'Vichada': ['Puerto Carreño']
};

// ---------- OPCIONES DE PAGO ----------
const WHATSAPP_NUMBER = '573028303387'; // Teléfono de contacto Nativa (57 + móvil)
const PAYMENT_PROCESSOR_NAME = 'Wompi';
const PAYMENT_PROCESSOR_URL = 'https://checkout.wompi.co/l/';
// Llave pública de Wompi (producción: pub_prod_…).
// Con la llave de prueba los pagos son simulados (mockup); con producción, reales.
const WOMPI_PUBLIC_KEY = 'pub_prod_7YoqsjEcnfNqLqTYefBpwLX2Sj97QzFD';
// CAMBIO A PRUEBAS: poner aquí la llave pub_test_... y WOMPI_TEST = true.
const WOMPI_TEST = false; // false = PRODUCCIÓN: los pagos son con dinero real
// El prefijo de la llave define el ambiente: la consulta de transacciones usa la API correspondiente.
const WOMPI_API_BASE = WOMPI_TEST ? 'https://sandbox.wompi.co/v1' : 'https://production.wompi.co/v1';
const PAYMENT_FEE_NOTE = 'Tarjetas · 2,65% + $700 + IVA · Sin mensualidad · Débito, Crédito, PSE, Nequi, Bancolombia';

// ---------- ENVÍO AUTOMÁTICO DE CORREO (Brevo) ----------
// Brevo (ex Sendinblue) permite enviar correos con adjuntos desde el mismo
// navegador mediante su API v3 (https://developers.brevo.com/reference/sendtransacemail).
// Pega tu llave de Brevo aquí (Brevo → SMTP & API → API Keys).
// Recomendado: crear una llave restringida solo a la aprobación "transactional-email".
// Envío de correo vía función serverless de Cloudflare Pages (/api/enviar-pedido).
// La llave de Brevo vive SOLO en las variables de entorno del proyecto
// (Dashboard → Pages → Settings → Environment variables), nunca en el código.
// En desarrollo local (http://127.0.0.1) la función no existe: Brevo se omite
// y el pedido se coordina igual por WhatsApp o por el pago en línea.
const ORDER_EMAIL_TO = 'produccion@nativacol.shop';
const ORDER_EMAIL_FROM = 'facturacion@nativacol.shop'; // Remitente verificado (DKIM/DMARC) en Brevo
const MERCHANT_NAME = 'Nativa Bisutería';
const MERCHANT_URL = 'nativacol.shop';

// Productos que en realidad son variantes de color de otro producto:
// se consolidan al cargar el catálogo para no mostrar duplicados.
function consolidatedProductsWithVariants(products) {
  const aliases = products.filter(p => p.aliasOf);
  const mainIds = new Set(aliases.map(p => p.aliasOf));
  if (!aliases.length) return products;

  return products
    .filter(p => !p.aliasOf)
    .map(p => {
      if (!mainIds.has(p.id)) return p;
      const mine = aliases.filter(a => a.aliasOf === p.id);
      const variantMap = new Set((p.variants || []).map(v => v.color));
      const extra = mine
        .filter(a => !variantMap.has(a.variant))
        .map(a => ({ color: a.variant || a.title, hex: '', image: a.image || (a.id + '.jpg') }));
      const variants = [...(p.variants || []), ...extra];
      return variants.length ? { ...p, variants } : p;
    });
}

// El carrito guarda la variante de color como parte de la clave, para que
// "Rosa Vino" y "Vino" sean líneas distintas del mismo producto.
function cartKey(id, variant) { return variant ? id + '::' + variant : id; }
function saveCartKey() { localStorage.setItem('nativa_cart_key', '2'); }
function migrateLegacyCart() {
  if (localStorage.getItem('nativa_cart_key') === '2') return;
  cart = cart.filter(i => ALL_PRODUCTS.some(p => p.id === i.id));
  cart.forEach(i => { if (!i.variant) i.variant = ''; });
  saveCartKey();
  saveCart();
}

function swatchStyle(hex) {
  if (hex) return `--sw:${hex}`;
  // Sin hex: derivamos un tono aproximado a partir del nombre (fallback).
  const palette = { dorad: '#c29a3f', vinot: '#8e2c3f', vino: '#781828', ros: '#c76a7c', blan: '#efe9df', negr: '#33302e', azu: '#3d5a80', verd: '#5d7a5a' };
  return `--sw:${'#b9afa3'}`;
}

// Selector de color (swatches) dentro de las tarjetas del catálogo.
// El click se maneja por delegación porque las tarjetas se re-renderizan.
function initShippingUI() {
  // Delegación a nivel de documento: cubre las tarjetas del catálogo y el
  // modal de detalle de producto.
  document.body.addEventListener('click', (ev) => {
    const sw = ev.target.closest('.variant-swatch');
    if (!sw) return;
    ev.preventDefault();
    ev.stopPropagation();
    const { productId, color } = sw.dataset;
    if (productId && color) selectVariant(productId, color, sw);
  });

  // Selector de países del checkout: Colombia primero, luego por zona.
  const sel = document.getElementById('shipCountry');
  if (sel && sel.options.length <= 1) { // solo el placeholder
    const col = document.createElement('option');
    col.value = 'Colombia';
    col.textContent = 'Colombia';
    sel.appendChild(col);
    SHIPPING_RATE_ZONES.forEach(zone => {
      const group = document.createElement('optgroup');
      group.label = zone.zone;
      zone.countries.forEach(c => {
        const opt = document.createElement('option');
        opt.value = c;
        opt.textContent = c;
        group.appendChild(opt);
      });
      sel.appendChild(group);
    });
  }
}

function variantSwatchesHtml(p, selectedColor) {
  const variants = p.variants || [];
  if (variants.length < 2) return '';
  return `
    <div class="variant-picker">
      <span class="variant-label">Color:</span>
      <div class="variant-swatches">
        ${variants.map(v => `
          <button type="button" class="variant-swatch${v.color === selectedColor ? ' active' : ''}"
            style="${swatchStyle(v.hex)}" title="${v.color}"
            data-product-id="${p.id}" data-color="${v.color}"
            aria-label="Color ${v.color}"></button>
        `).join('')}
      </div>
      <span class="variant-label">${selectedColor}</span>
    </div>
  `;
}

function variantImageFor(p, color) {
  if (!color) return p.image || (p.id + '.jpg');
  const v = (p.variants || []).find(v => v.color === color);
  return (v && v.image) || p.image || (p.id + '.jpg');
}

function pad(n) { return String(n).padStart(3, '0'); }

// ---------- MONEDA DE VISUALIZACIÓN ----------
// El cliente puede ver los precios en su moneda (referencia con TRM); los
// cobros y la comunicación con el equipo de Nativa siempre van en COP.
let DISPLAY_CCY = 'COP';

function fmtPrice(cop) {
  const cur = REFERENCE_CURRENCIES.find(c => c.code === DISPLAY_CCY) || REFERENCE_CURRENCIES[0];
  if (cur.code === 'COP') return '$' + Math.round(cop).toLocaleString('es-CO');
  const v = cop / (TRM[cur.code] || cur.fallbackRate);
  return cur.symbol + ' ' + v.toLocaleString('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Formato fijo en pesos: para mensajes al equipo (WhatsApp/correo) y montos internos.
function fmtCOP(cop) { return '$' + Math.round(cop).toLocaleString('es-CO'); }

// Cambia la moneda de la tienda y repinta todo lo visible.
function updateReferenceCurrency() {
  const sel = document.getElementById('refCurrency');
  if (sel) {
    DISPLAY_CCY = sel.value;
    try { localStorage.setItem('nativa_ccy', DISPLAY_CCY); } catch (e) {}
  }
  if (ALL_PRODUCTS.length) renderProducts();
  updateCartUI();
  updateShippingEstimate();
}

// Etiqueta de disponibilidad mostrada en tarjetas y modal.
// Al público se le muestra tope 100; con sesión se ve el stock real del JSON.
function stockLabel(p) {
  if (p.stock === 0) return 'Agotado';
  if (p.stock === undefined) return '';
  return isBulkAllowed()
    ? `${p.stock.toLocaleString('es-CO')} disponibles`
    : `Máx. ${Math.min(PUBLIC_QTY_LIMIT, p.stock).toLocaleString('es-CO')} por cliente`;
}

async function scanProducts() {
  const products = [];
  let i = 1;

  while (true) {
    const id = pad(i);
    try {
      const res = await fetch(`${PRODUCTS_DIR}/${id}.json`);
      if (!res.ok) break; // No más productos
      const data = await res.json();
      products.push(data);
      i++;
    } catch (err) {
      break; // Error de red o CORS = fin del catálogo
    }
  }

  // Los JSON que comparten título se consolidan: los alias (aliasOf) se
  // convierten en variantes de color del producto principal.
  return consolidatedProductsWithVariants(products);
}

// Slideshow de la portada principal
async function findHomepageImage(id) {
  for (const ext of HOMEPAGE_EXTENSIONS) {
    const path = `${HOMEPAGE_DIR}/${id}.${ext}`;
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 4000);
      const res = await fetch(path, { method: 'HEAD', signal: controller.signal });
      clearTimeout(timeoutId);
      if (res.ok) return path;
    } catch (err) {
      // Tiempo agotado, 404, o servidor sin soporte HEAD: sigue con la siguiente extensión
    }
  }
  return null;
}

async function scanHomepageImages() {
  const images = [];
  let i = 1;
  while (true) {
    const id = pad(i);
    const found = await findHomepageImage(id);
    if (!found) break;
    images.push(found);
    i++;
  }
  return images;
}

let corporateSlideTimer = null;

function renderHeroSlides(images) {
  const hero = document.getElementById('heroHome');
  const slidesEl = document.getElementById('heroSlides');
  const dotsEl = document.getElementById('heroDots');

  if (!hero || !slidesEl || !dotsEl) return;

  if (!images.length) {
    hero.classList.add('no-slides');
    dotsEl.innerHTML = '';
    return;
  }

  hero.classList.remove('no-slides');
  slidesEl.innerHTML = images.map((src, i) =>
    `<div class="hero-slide${i === 0 ? ' active' : ''}" style="background-image:url('${src}')"></div>`
  ).join('');

  dotsEl.innerHTML = images.map((_, i) =>
    `<span class="${i === 0 ? 'active' : ''}"></span>`
  ).join('');

  if (images.length > 1) {
    let idx = 0;
    if (corporateSlideTimer) clearInterval(corporateSlideTimer);
    corporateSlideTimer = setInterval(() => {
      const slides = slidesEl.querySelectorAll('.hero-slide');
      const dots = dotsEl.querySelectorAll('span');
      if (!slides.length) return;
      slides[idx].classList.remove('active');
      dots[idx].classList.remove('active');
      idx = (idx + 1) % slides.length;
      slides[idx].classList.add('active');
      dots[idx].classList.add('active');
    }, SLIDE_INTERVAL_MS);
  }
}

// Orden de clasificación: primero por colección (según COLLECTIONS_ORDER),
// luego por el resto (categoría y, por último, id) dentro de cada colección.
function collectionSortIndex(collection) {
  const idx = COLLECTIONS_ORDER.indexOf(collection);
  return idx === -1 ? COLLECTIONS_ORDER.length : idx;
}

function sortProducts(products) {
  return products.slice().sort((a, b) => {
    const ca = collectionSortIndex(a.collection);
    const cb = collectionSortIndex(b.collection);
    if (ca !== cb) return ca - cb;
    const catA = a.category || '';
    const catB = b.category || '';
    if (catA !== catB) return catA.localeCompare(catB, 'es');
    return String(a.id).localeCompare(String(b.id), 'es');
  });
}

function productsInCollection(collection) {
  return collection === 'todas'
    ? ALL_PRODUCTS
    : ALL_PRODUCTS.filter(p => p.collection === collection);
}

function buildCollectionFilters() {
  const container = document.getElementById('collectionFilters');
  const row = document.getElementById('collectionFiltersRow');

  // Colecciones presentes en el catálogo: primero las 3 de lanzamiento (en su
  // orden fijo), y al final cualquier otra que aparezca en los JSON.
  const found = Array.from(new Set(ALL_PRODUCTS.map(p => p.collection).filter(Boolean)));
  const known = COLLECTIONS_ORDER.filter(c => found.includes(c));
  const extra = found.filter(c => !COLLECTIONS_ORDER.includes(c)).sort();
  const collections = [...known, ...extra];

  if (collections.length < 2) {
    // Con 0 o 1 colección no tiene sentido mostrar el selector.
    row.style.display = 'none';
    return;
  }

  let html = `<button class="filter-btn active" data-col="todas" onclick="filterByCollection('todas')">Todas</button>`;
  for (const col of collections) {
    html += `<button class="filter-btn" data-col="${col}" onclick="filterByCollection('${col}')">${col}</button>`;
  }
  container.innerHTML = html;
  row.style.display = 'flex';
}

function buildCategoryFilters() {
  const container = document.getElementById('filters');
  const row = document.getElementById('categoryFiltersRow');

  // Las categorías se calculan sobre los productos de la colección ya
  // seleccionada, no sobre todo el catálogo.
  const cats = Array.from(new Set(productsInCollection(currentCollection).map(p => p.category).filter(Boolean))).sort();

  if (!cats.length) {
    row.style.display = 'none';
    return;
  }

  let html = `<button class="filter-btn active" data-cat="todos" onclick="filterProducts('todos')">Todos</button>`;
  for (const cat of cats) {
    html += `<button class="filter-btn" data-cat="${cat}" onclick="filterProducts('${cat}')">${cat}</button>`;
  }
  container.innerHTML = html;
  row.style.display = 'flex';
}

function filterByCollection(col) {
  currentCollection = col;
  currentFilter = 'todos'; // al cambiar de colección se reinicia el filtro de categoría
  document.querySelectorAll('#collectionFilters .filter-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.col === col);
  });
  buildCategoryFilters();
  renderProducts();
}

function renderProducts() {
  const container = document.getElementById('products');
  let filtered = productsInCollection(currentCollection);
  if (currentFilter !== 'todos') {
    filtered = filtered.filter(p => p.category === currentFilter);
  }
  filtered = sortProducts(filtered);

  container.innerHTML = filtered.map(p => {
    const selected = p._selVariant || (p.variants && p.variants.length ? p.variants[0].color : '');
    const cardImg = variantImageFor(p, selected);
    return `
    <div class="product-card" onclick="showProductDetail('${p.id}')">
      <div class="product-img">
        <img id="card-img-${p.id}" src="${PRODUCTS_DIR}/${cardImg}" alt="${p.title}" loading="lazy"
             onerror="this.outerHTML='<div class=&quot;image-fallback&quot;>Imagen no disponible</div>';">
        ${p.badge ? `<span class="product-badge">${p.badge}</span>` : ''}
      </div>
      <div class="product-info">
        <h3>${p.title}</h3>
        <div class="product-meta">
          ${p.material ? `<span>${p.material}</span>` : ''}
          ${p.dimensions ? `<span>${p.dimensions}</span>` : ''}
        </div>
        <p>${p.description}</p>
        ${variantSwatchesHtml(p, selected)}
        <div class="product-footer">
          <div>
            <span class="price">${fmtPrice(p.price)}</span>
            <div class="stock-tag">${stockLabel(p)}</div>
          </div>
          <button class="add-btn" onclick="event.stopPropagation(); addToCart('${p.id}', 1)" ${p.stock === 0 ? 'disabled' : ''}>
            ${p.stock === 0 ? 'Agotado' : 'Añadir'}
          </button>
        </div>
      </div>
    </div>
  `;
  }).join('');

  container.style.display = 'grid';
}

function filterProducts(cat) {
  currentFilter = cat;
  document.querySelectorAll('#filters .filter-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.cat === cat);
  });
  renderProducts();
}

function selectVariant(id, color, swatchBtn) {
  const product = ALL_PRODUCTS.find(p => p.id === id);
  if (!product || !product.variants) return;

  product._selVariant = color;

  // En las tarjetas: cambia la foto por la del color elegido.
  const img = document.getElementById('card-img-' + id);
  if (img) img.src = `${PRODUCTS_DIR}/${variantImageFor(product, color)}`;

  // En el modal de detalle: repinta swatches y galería con la imagen del color.
  if (currentDetailProduct && currentDetailProduct.id === id) {
    currentGallery = getGalleryItems(product);
    const vIdx = (product.variants || []).findIndex(v => v.color === color);
    currentGalleryIndex = vIdx >= 0 ? vIdx : 0;
    renderProductModal();
  }

  if (swatchBtn && swatchBtn.closest('.variant-picker')) {
    const picker = swatchBtn.closest('.variant-picker');
    picker.querySelectorAll('.variant-swatch').forEach(b => b.classList.toggle('active', b === swatchBtn));
    const labels = picker.querySelectorAll('.variant-label');
    if (labels.length > 1) labels[labels.length - 1].textContent = color;
  }
}

function addToCart(id, qty = 1, variant = '') {
  const product = ALL_PRODUCTS.find(p => p.id === id);
  if (!product) return;
  if (product.stock === 0) { showToast('Producto agotado'); return; }

  // Los botones del modal no pasan el color: usa el seleccionado en la tarjeta.
  if (variant === undefined) variant = '';
  if (!variant && product.variants && product.variants.length) {
    variant = product._selVariant || product.variants[0].color;
  }

  const key = cartKey(id, variant);
  const item = cart.find(i => i.key === key);
  const currentQty = item ? item.qty : 0;

  // Tope según sesión (100 público / 10.000 con sesión) y stock del JSON.
  const maxQty = qtyLimitFor(product);
  const restante = Math.max(0, maxQty - currentQty);
  if (restante <= 0) {
    showToast(isBulkAllowed()
      ? `Máximo ${maxQty} unidades por producto`
      : `Límite de ${PUBLIC_QTY_LIMIT} unidades por producto (venta pública)`);
    return;
  }
  if (qty > restante) {
    qty = restante;
    showToast(isBulkAllowed()
      ? `Se ajustó al máximo de ${maxQty} unidades por producto`
      : `Límite público de ${PUBLIC_QTY_LIMIT}: se ajustó la cantidad`);
    if (item) item.qty += qty; else cart.push({ id, key, variant, qty, price: product.price, title: product.title });
    saveCart();
    updateCartUI();
    return;
  }

  if (item) {
    item.qty += qty;
  } else {
    cart.push({ id, key, variant, qty, price: product.price, title: product.title });
  }
  saveCart();
  updateCartUI();
  showToast(qty > 1 ? `${qty} unidades añadidas al carrito` : 'Producto añadido al carrito');
}

function removeFromCart(key) {
  cart = cart.filter(i => i.key !== key);
  saveCart();
  updateCartUI();
}

function changeQty(key, delta) {
  const item = cart.find(i => i.key === key);
  if (!item) return;
  const product = ALL_PRODUCTS.find(p => p.id === item.id);

  // Tope según sesión (100 público / 10.000 con sesión).
  const maxQty = qtyLimitFor(product);
  if (delta > 0 && item.qty >= maxQty) {
    showToast(isBulkAllowed()
      ? `Máximo ${maxQty} unidades por producto`
      : `Límite de ${PUBLIC_QTY_LIMIT} unidades por producto (venta pública)`);
    return;
  }
  if (delta > 0 && item.qty + delta > maxQty) {
    delta = maxQty - item.qty;
    showToast(isBulkAllowed()
      ? `Se ajustó al máximo de ${maxQty} unidades por producto`
      : `Límite público de ${PUBLIC_QTY_LIMIT}: se ajustó la cantidad`);
  }

  item.qty += delta;
  if (item.qty <= 0) removeFromCart(key);
  else { saveCart(); updateCartUI(); }
}

function saveCart() {
  localStorage.setItem('nativa_cart', JSON.stringify(cart));
}

function updateCartUI() {
  const count = cart.reduce((s, i) => s + i.qty, 0);
  const countEl = document.getElementById('cartCount');
  countEl.textContent = count;
  countEl.style.display = count > 0 ? 'flex' : 'none';

  const itemsEl = document.getElementById('cartItems');
  const footerEl = document.getElementById('cartFooter');

  if (cart.length === 0) {
    itemsEl.innerHTML = '<div class="empty-cart">Tu carrito está vacío</div>';
    footerEl.style.display = 'none';
    return;
  }

  footerEl.style.display = 'block';
  const total = cart.reduce((s, i) => s + i.price * i.qty, 0);
  document.getElementById('cartTotal').textContent = fmtPrice(total);

  const canBulk = isBulkAllowed();
  const checkoutBtn = document.querySelector('.checkout-btn');
  if (checkoutBtn) checkoutBtn.textContent = 'Finalizar Compra';
  itemsEl.innerHTML = cart.map(item => {
    const product = ALL_PRODUCTS.find(p => p.id === item.id);
    const shownTitle = item.variant ? `${item.title} · ${item.variant}` : item.title;
    const bulkStep = 1000;
    const stepLabel = '1000';
    return `
      <div class="cart-item">
        <div class="cart-item-img">
          <img src="${PRODUCTS_DIR}/${product ? variantImageFor(product, item.variant) : (item.id + '.jpg')}" alt="${shownTitle}" onerror="this.outerHTML='<div class=&quot;image-fallback&quot;>—</div>'">
        </div>
        <div class="cart-item-info">
          <h4>${shownTitle}</h4>
          <div class="item-price">${fmtPrice(item.price)} c/u</div>
          <div class="qty-controls">
            ${canBulk ? `<button class="qty-btn qty-btn-bulk" onclick="changeQty('${item.key}', -${bulkStep})" title="Restar ${stepLabel}">−${stepLabel}</button>` : ''}
            <button class="qty-btn" onclick="changeQty('${item.key}', -1)">−</button>
            <span>${item.qty}</span>
            <button class="qty-btn" onclick="changeQty('${item.key}', 1)">+</button>
            ${canBulk ? `<button class="qty-btn qty-btn-bulk" onclick="changeQty('${item.key}', ${bulkStep})" title="Sumar ${stepLabel}">+${stepLabel}</button>` : ''}
          </div>
          <button class="remove-item" onclick="removeFromCart('${item.key}')">Eliminar</button>
        </div>
      </div>
    `;
  }).join('');
}

function switchView(view) {
  const storeEl = document.getElementById('storeView');
  const corporateEl = document.getElementById('corporateView');

  storeEl.classList.toggle('active', view === 'store');
  corporateEl.classList.toggle('active', view === 'corporate');

  document.querySelectorAll('.nav-link').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.view === view);
  });

  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function toggleOrgItem(headerBtn) {
  const item = headerBtn.closest('.org-item');
  const body = item.querySelector('.org-item-body');
  const isOpen = item.classList.contains('open');

  if (isOpen) {
    item.classList.remove('open');
    body.style.maxHeight = '0px';
  } else {
    item.classList.add('open');
    body.style.maxHeight = body.scrollHeight + 'px';
  }
}

function toggleTerms() {
  const body = document.getElementById('legalTermsBody');
  const isOpen = body.classList.contains('open');

  if (isOpen) {
    body.classList.remove('open');
    body.style.maxHeight = '0px';
  } else {
    body.classList.add('open');
    body.style.maxHeight = body.scrollHeight + 'px';
  }
}

function toggleCart() {
  document.getElementById('cartOverlay').classList.toggle('open');
  document.getElementById('cartDrawer').classList.toggle('open');
}

function showToast(msg) {
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 2500);
}

// ---------- ESTIMADO DE ENVÍO (dirección estructurada + mapa) ----------

function shippingZoneFor(country) {
  return SHIPPING_RATE_ZONES.find(z => z.countries.includes(country)) || SHIPPING_RATE_ZONES[SHIPPING_RATE_ZONES.length - 1];
}

// Tramo nacional según la ciudad de destino.
function domesticTierFor(city, state) {
  const c = (city || '').trim().toLowerCase();
  if (!c) return DOMESTIC_RATES[DOMESTIC_RATES.length - 1];
  if (LOCAL_AREA_CITIES.some(x => x.toLowerCase() === c)) return DOMESTIC_RATES[0];
  if (MAIN_CITIES_CO.some(x => x.toLowerCase() === c)) return DOMESTIC_RATES[1];
  // Ciudades principales de Bogotá D.C. o listadas en el estado (opcional).
  return DOMESTIC_RATES[2];
}

// Normaliza el formulario a una dirección legible para geocodificar.
function addressTextFromForm() {
  const country = document.getElementById('shipCountry').value;
  const city = document.getElementById('shipCity').value.trim();
  const addr = document.getElementById('customerAddress').value.trim();
  const hood = document.getElementById('shipNeighborhood').value.trim();
  const stateSel = document.getElementById('shipState');
  const state = country === 'Colombia' ? (stateSel.value || '') : document.getElementById('shipStateText').value.trim();
  const parts = [addr, hood, city, state, country].filter(Boolean);
  return parts.join(', ');
}

function addressIsComplete() {
  return !!document.getElementById('shipCountry').value
    && !!document.getElementById('shipCity').value.trim()
    && !!document.getElementById('customerAddress').value.trim();
}

function calcShipping(country, units) {
  const cityEl = document.getElementById('shipCity');
  const city = cityEl ? cityEl.value.trim() : '';
  const campus = isCampusSelected() && country === 'Colombia'
    && LOCAL_AREA_CITIES.some(x => x.toLowerCase() === city.toLowerCase());
  const weightKg = (units * PRODUCT_WEIGHT_GRAMS) / 1000;
  const chargeableKg = Math.max(0.5, Math.ceil(weightKg * 2) / 2); // mín. 0,5 kg, tramos de 0,5 kg
  if (campus) {
    return { zone: { zone: CAMPUS_DELIVERY.label, days: CAMPUS_DELIVERY.days }, weightKg, chargeableKg, cost: 0, campus: true };
  }
  let zoneName, days, base, perKg;
  if (country === 'Colombia') {
    const tier = domesticTierFor(city, '');
    zoneName = tier.label;
    days = tier.days;
    base = tier.base;
    perKg = tier.perKg;
  } else {
    const zone = shippingZoneFor(country);
    zoneName = zone.zone;
    days = zone.days;
    base = zone.base;
    perKg = zone.perKg;
  }
  const cost = Math.round((base + perKg * chargeableKg) / 100) * 100;
  return { zone: { zone: zoneName, days }, weightKg, chargeableKg, cost, campus: false };
}

// ---------- TIEMPOS DE PRODUCCIÓN Y TRÁNSITO ----------
// Producción: 3 días hábiles + 1 día hábil cada 3 productos.
// Con sesión (mayoristas): el número de productos para el cálculo se divide entre 1000.
function productionDaysFor(units) {
  const effective = isBulkAllowed() ? units / 1000 : units;
  return 3 + Math.ceil(effective / 3);
}

// Tránsito base en días hábiles. Con sesión: también dividido entre 1000.
// Público: base - 1 día, y se muestra con +5 días hábiles de rango.
function transitDaysFor(country, units, campus) {
  if (campus) return 1;
  const { zone } = calcShipping(country, units);
  const base = zone.days;
  if (isBulkAllowed()) return Math.max(1, Math.round(base / 1000));
  return Math.max(1, base - 1);
}

// Texto del rango: público "X a X+5 días hábiles"; mayoristas y campus, valor único.
function transitTextFor(days, campus) {
  if (campus || isBulkAllowed()) return daysRangeText(days) + ' (estimado)';
  return `${days} a ${days + 5} días hábiles (estimado)`;
}

// Suma días hábiles a hoy (ignora sábados y domingos).
function businessDateFromToday(days) {
  const d = new Date();
  let added = 0;
  while (added < days) {
    d.setDate(d.getDate() + 1);
    const w = d.getDay();
    if (w !== 0 && w !== 6) added++;
  }
  return d;
}

function etaDateText(days) {
  return businessDateFromToday(days).toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

// ¿El cliente eligió recoger en el campus? (solo visible para Barranquilla + área metro.)
function isCampusSelected() {
  const r = document.getElementById('optCampus');
  const wrap = document.getElementById('campusOption');
  return !!(r && r.checked && wrap && wrap.style.display !== 'none');
}

// Muestra u oculta la opción de campus según país + ciudad del área metropolitana.
function updateCampusOption() {
  const wrap = document.getElementById('campusOption');
  if (!wrap) return;
  const country = document.getElementById('shipCountry').value;
  const city = document.getElementById('shipCity').value.trim().toLowerCase();
  const show = country === 'Colombia' && LOCAL_AREA_CITIES.some(x => x.toLowerCase() === city);
  wrap.style.display = show ? 'block' : 'none';
  if (!show) {
    const r = document.getElementById('optCampus');
    if (r) r.checked = false;
    const c = document.getElementById('optCourier');
    if (c) c.checked = true;
  }
}



// Reacciona a cualquier cambio en la dirección: repinta estados, tarifas y mapa.
let mapTimer = null;
function onAddressChange(kind) {
  updateCampusOption();
  const country = document.getElementById('shipCountry').value;
  const stateSel = document.getElementById('shipState');
  const stateText = document.getElementById('shipStateText');
  const stateLabel = document.getElementById('shipStateLabel');

  if (kind === 'country') {
    if (country === 'Colombia') {
      // Colombia: departamento como <select> con todas las ciudades en el datalist.
      stateSel.style.display = 'block';
      stateText.style.display = 'none';
      stateLabel.textContent = 'Departamento';
      if (stateSel.options.length <= 1) {
        Object.keys(COLOMBIA_STATES).sort((a, b) => a.localeCompare(b, 'es')).forEach(dep => {
          const opt = document.createElement('option');
          opt.value = dep;
          opt.textContent = dep;
          stateSel.appendChild(opt);
        });
      }
      updateCitySuggestions();
    } else {
      stateSel.style.display = 'none';
      stateSel.value = '';
      stateText.style.display = 'block';
      stateLabel.textContent = 'Estado / Provincia';
      document.getElementById('cityList').innerHTML = '';
    }
  }

  if (kind === 'state' && country === 'Colombia') {
    updateCitySuggestions();
    // Autocompleta la ciudad si hay una única opción natural para el área local.
    const dep = stateSel.value;
    const cities = COLOMBIA_STATES[dep] || [];
    if (cities.length === 1) document.getElementById('shipCity').value = cities[0];
  }

  updateShippingEstimate();

  // Mapa con debounce: geocodifica 700 ms después de dejar de escribir.
  clearTimeout(mapTimer);
  mapTimer = setTimeout(updateAddressMap, 700);
}

// Sugerencias de ciudad: ciudades del departamento elegido (Colombia) o libre.
function updateCitySuggestions() {
  const dl = document.getElementById('cityList');
  if (!dl) return;
  const dep = document.getElementById('shipState').value;
  const cities = COLOMBIA_STATES[dep] || [];
  dl.innerHTML = cities.map(c => `<option value="${c}">`).join('');
}

// ---------- MAPA DE LA DIRECCIÓN (OpenStreetMap + Nominatim, sin API key) ----------

async function geocodeAddress(text) {
  const url = 'https://nominatim.openstreetmap.org/search?format=json&limit=1&q=' + encodeURIComponent(text);
  const res = await fetch(url, { headers: { 'Accept': 'application/json' } });
  if (!res.ok) throw new Error('geocoder ' + res.status);
  const data = await res.json();
  return (data && data.length) ? { lat: parseFloat(data[0].lat), lon: parseFloat(data[0].lon), display: data[0].display_name } : null;
}

let mapReqSeq = 0; // token anti-carrera: solo pinta la geocodificación más reciente

async function updateAddressMap() {
  const wrap = document.getElementById('mapPreview');
  const frame = document.getElementById('mapFrame');
  const gmaps = document.getElementById('mapGmapsLink');
  if (!wrap || !frame) return;
  const seq = ++mapReqSeq;

  if (!addressIsComplete()) { wrap.style.display = 'none'; return; }

  let loc = null;
  try { loc = await geocodeAddress(addressTextFromForm()); } catch (e) { console.warn('Mapa:', e); }
  if (seq !== mapReqSeq) return; // llegó una dirección más nueva mientras tanto

  if (!loc) {
    // Fallback: mapa del país/ciudad sin dirección exacta.
    const country = document.getElementById('shipCountry').value;
    const city = document.getElementById('shipCity').value.trim();
    try { loc = await geocodeAddress([city, country].filter(Boolean).join(', ')); } catch (e) { /* sin conexión */ }
    if (seq !== mapReqSeq) return;
  }
  if (!loc) { wrap.style.display = 'none'; return; }

  const { lat, lon } = loc;
  const bbox = (lon - 0.006).toFixed(5) + ',' + (lat - 0.0045).toFixed(5) + ',' + (lon + 0.006).toFixed(5) + ',' + (lat + 0.0045).toFixed(5);
  frame.src = 'https://www.openstreetmap.org/export/embed.html?bbox=' + bbox + '&layer=mapnik&marker=' + lat + ',' + lon;
  gmaps.href = 'https://www.google.com/maps/search/?api=1&query=' + lat + ',' + lon;
  wrap.style.display = 'block';
}

function updateShippingEstimate() {
  updateAddressVisibility();
  const sel = document.getElementById('shipCountry');
  const holder = document.getElementById('shippingEstimate');
  if (!sel || !holder) return;
  const units = cart.reduce((s, i) => s + i.qty, 0);
  const subtotal = cart.reduce((s, i) => s + i.price * i.qty, 0);
  const country = sel.value;

  // El "Total" del resumen incluye el envío en cuanto se elige país,
  // para que coincida con lo que muestra el modal de pago.
  const shipRow = document.getElementById('sumShipRow');
  const shipCell = document.getElementById('sumShip');
  const totalCell = document.getElementById('summaryTotal');
  if (shipRow && shipCell && totalCell) {
    if (country) {
      const { cost } = calcShipping(country, units);
      shipRow.style.display = 'flex';
      shipCell.textContent = fmtPrice(cost);
      totalCell.textContent = fmtPrice(subtotal + cost);
    } else {
      shipRow.style.display = 'none';
      totalCell.textContent = fmtPrice(subtotal);
    }
  }

  if (!country) { holder.innerHTML = ''; return; }

  // Bloque de tiempos: producción + tránsito + fecha estimada de entrega.
  const { cost, zone, campus, weightKg } = calcShipping(country, units);
  const city = document.getElementById('shipCity').value.trim();
  const destino = [city, country].filter(Boolean).join(', ');
  const prodDays = productionDaysFor(units);
  const transitDays = transitDaysFor(country, units, campus);
  const etaDays = prodDays + (campus ? CAMPUS_DELIVERY.days : (transitDays + (isBulkAllowed() ? 0 : 5)));

  holder.innerHTML = `
    <div class="ship-block">
      <h4>Envío y tiempos</h4>
      <div class="ship-row"><span>Destino</span><span><em>${destino || country}</em> · ${zone.zone}</span></div>
      <div class="ship-row"><span>Producción</span><span>${daysRangeText(prodDays)} (estimado)</span></div>
      <div class="ship-row"><span>Tránsito</span><span>${campus ? 'Entrega en campus' : transitTextFor(transitDays, campus)}</span></div>
      <div class="ship-row"><span>Entrega estimada</span><span>${etaDateText(etaDays)}</span></div>
      <div class="ship-row summary-subtotal"><span>Costo de envío</span><span>${cost === 0 ? 'Gratis' : fmtPrice(cost)}</span></div>
      <p class="ship-note">Ante cambios o complicaciones te contactaremos por el canal de comunicación que elijas (WhatsApp o correo). Si la tarifa final de envío difiere del estimado, te avisaremos por el mismo canal antes de despachar.</p>
    </div>
  `;
}

// ---------- FIN ESTIMADO DE ENVÍO ----------

function openCheckout() {
  toggleCart();
  const summary = document.getElementById('orderSummary');
  const total = cart.reduce((s, i) => s + i.price * i.qty, 0);
  summary.innerHTML = `
    <h4>Resumen del pedido</h4>
    ${cart.map(i => `
      <div class="summary-item">
        <span>${i.qty}x ${i.title}${i.variant ? ` <em>· ${i.variant}</em>` : ''}</span>
        <span>${fmtPrice(i.price * i.qty)}</span>
      </div>
    `).join('')}
    <div class="summary-item" id="sumShipRow" style="display:none">
      <span>Envío estimado</span>
      <span id="sumShip"></span>
    </div>
    <div class="summary-item" id="sumShipRow" style="display:none">
      <span>Costo de envío</span>
      <span id="sumShip"></span>
    </div>
    <div class="summary-total">
      <span>Total</span>
      <span id="summaryTotal">${fmtPrice(total)}</span>
    </div>
  `;
  summary.dataset.subtotal = String(total);
  updateReferenceCurrency();
  document.getElementById('checkoutModal').classList.add('open');
  // Sincroniza visibilidad departamento/estado por si el país ya estaba elegido.
  onAddressChange('country');
  updateShippingEstimate();
}

function closeCheckout() {
  document.getElementById('checkoutModal').classList.remove('open');
}

// ---------- ENVÍO DEL PEDIDO (correo automático vía Brevo) ----------

function orderEmailHtml(order) {
  const rows = order.items.map(it => `
    <tr>
      <td style="padding:6px 10px;border-bottom:1px solid #eee;">${it.qty} × ${it.title}${it.variant ? ' — ' + it.variant : ''}</td>
      <td style="padding:6px 10px;border-bottom:1px solid #eee;text-align:right;">${fmtPrice(it.price * it.qty)}</td>
    </tr>`).join('');
  return `
  <div style="font-family:Arial,sans-serif;color:#2a2524;max-width:560px">
    <h2 style="color:#5c1a28;font-family:Georgia,serif;">Nuevo pedido ${order.number}</h2>
    <p><b>Cliente:</b> ${order.customer.name}<br>
       <b>Email:</b> ${order.customer.email}<br>
       <b>Teléfono:</b> ${order.customer.phone}</p>
    <p><b>Dirección:</b> ${order.customer.fullAddress || order.customer.address || '—'}</p>
    ${order.customer.notes ? `<p><b>Notas:</b> ${order.customer.notes}</p>` : ''}
    <table style="border-collapse:collapse;width:100%;font-size:13px">${rows}</table>
    <p><b>Entrega:</b> ${order.deliveryLabel || 'Envío por transportadora'}<br>
       <b>Producción:</b> ${daysRangeText(order.prodDays || 3)} · <b>Tránsito:</b> ${order.transitText || '—'}<br>
       <b>Entrega estimada:</b> ${order.etaText || 'a coordinar'}</p>
    <p style="text-align:right;font-size:15px"><b>Subtotal:</b> ${fmtCOP(order.subtotal)}<br>
       <b>Costo de envío:</b> ${order.shippingCost === 0 ? 'Gratis' : fmtCOP(order.shippingCost)}<br>
       <b style="color:#5c1a28">TOTAL: ${fmtCOP(order.total)}</b></p>
    <p style="color:#766d68;font-size:12px">La factura en PDF va adjunta. Enviado desde ${MERCHANT_URL}.</p>
  </div>`;
}

// Envía el pedido (con factura adjunta) a través de la función serverless.
// En producción (nativacol.shop en Cloudflare Pages) la función live usa la
// llave de Brevo guardada como variable de entorno. En local no existe y el
// envío simplemente se omite (allowMissingKey) sin romper el flujo.
async function sendOrderViaBrevo(order, allowMissingKey = false) {
  const pdfBase64 = (() => {
    const bytes = new Uint8Array(order.pdfBuffer);
    let bin = '';
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
      bin += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
    }
    return btoa(bin);
  })();

  const body = {
    number: order.number,
    customerName: order.customer.name,
    customerEmail: order.customer.email,
    totalCOP: fmtCOP(order.total),
    htmlContent: orderEmailHtml(order),
    pdfBase64,
    pdfName: `Factura-${order.number}.pdf`
  };

  const res = await fetch('/api/enviar-pedido', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body)
  }).catch(err => { throw new Error('Sin conexión con el servidor de correo.'); });

  if (res.status === 503) {
    // Función sin BREVO_API_KEY configurada (o preview sin acceso al correo).
    if (allowMissingKey) return { skipped: true };
    throw new Error('El envío de correos no está disponible en este momento.');
  }
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error('Error al enviar el correo (' + res.status + '): ' + (text || res.statusText));
  }
  return res.json();
}

function nextOrderNumber() {
  // Número de pedido aleatorio de 10 cifras (no consecutivo, no deducible).
  let n;
  do { n = Math.floor(1000000000 + Math.random() * 9000000000); } while (n >= 10000000000);
  return String(n);
}

function isEmailValid(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email);
}

function whatsappMessageFor(order) {
  const lines = order.items.map(it =>
    `• ${it.qty} × ${it.title}${it.variant ? ' (' + it.variant + ')' : ''} — ${fmtCOP(it.price * it.qty)}`
  );
  return (
    `¡Hola ${encodeURIComponent(MERCHANT_NAME)}! Quiero coordinar mi pedido ${order.number}.%0A%0A` +
    `*Resumen de la compra (COP):*%0A` +
    lines.map(l => encodeURIComponent(l)).join('%0A') + '%0A%0A' +
    `Subtotal: ${encodeURIComponent(fmtCOP(order.subtotal))}%0A` +
    `Costo de envío (${encodeURIComponent(order.customer.city || order.customer.country)}): ${order.shippingCost === 0 ? 'GRATIS' : encodeURIComponent(fmtCOP(order.shippingCost))}%0A` +
    `Entrega estimada: ${encodeURIComponent(order.etaText || 'a coordinar')}%0A` +
    `*TOTAL: ${encodeURIComponent(fmtCOP(order.total))}*%0A%0A` +
    `Mis datos:%0A` +
    `Nombre: ${encodeURIComponent(order.customer.name)}%0A` +
    `Dirección: ${encodeURIComponent(order.customer.fullAddress || order.customer.address)}%0A` +
    `País: ${encodeURIComponent(order.customer.country)}`
  );
}

function openPaymentModal(order) {
  document.getElementById('pmOrderNumber').textContent = order.number;
  document.getElementById('pmOrderTotal').textContent = fmtPrice(order.total);
  document.getElementById('paymentStatus').innerHTML = '';
  document.getElementById('paymentModal').classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closePaymentModal() {
  document.getElementById('paymentModal').classList.remove('open');
  document.body.style.overflow = '';
}

async function choosePaymentMethod(method) {
  const order = window._lastOrder;
  if (!order) return;
  const status = document.getElementById('paymentStatus');

  if (method === 'whatsapp') {
    order.paymentMethodLabel = 'Coordinación por WhatsApp (pago a contra entrega)';
    order.refCurrency = refCurrencyFor();
    await regenerateInvoiceWithPaymentInfo(order);
    saveOrderRecord(order, order.paymentMethodLabel, 'Coordinando por WhatsApp');
    window.open(`https://wa.me/${WHATSAPP_NUMBER}?text=${whatsappMessageFor(order)}`, '_blank');
    status.innerHTML = 'Abrimos WhatsApp con el resumen de tu compra. También te enviamos la factura a tu correo.';
    sendOrderViaBrevo(order, true).catch(err => console.warn('Correo:', err));
    finishOrderAfterPaymentChoice(order);
    return;
  }

  if (method === 'email') {
    order.paymentMethodLabel = 'Coordinación por correo (transferencia bancaria)';
    order.refCurrency = refCurrencyFor();
    await regenerateInvoiceWithPaymentInfo(order);
    saveOrderRecord(order, order.paymentMethodLabel, 'Registrado — pago por coordinar');
    status.innerHTML = 'Enviando tu pedido por correo…';
    try {
      await sendOrderViaBrevo(order, true);
      status.innerHTML = 'Pedido recibido. Te escribiremos a ' + order.customer.email + ' para coordinar el pago. La factura va adjunta.';
      finishOrderAfterPaymentChoice(order);
    } catch (err) {
      console.error(err);
      status.innerHTML = 'No se pudo enviar el correo. Puedes coordinar el pago por WhatsApp o intentar de nuevo.';
    }
    return;
  }

  if (method === 'wompi') {
    order.paymentMethodLabel = 'Pago inmediato en línea con ' + PAYMENT_PROCESSOR_NAME;
    order.refCurrency = refCurrencyFor();
    await regenerateInvoiceWithPaymentInfo(order);
    // Se guarda como pedido pendiente: se confirma automáticamente al volver
    // del checkout de Wompi (redirect-url añade ?id=TRANSACCION).
    saveOrderRecord(order, order.paymentMethodLabel, 'Esperando pago');
    const { pdfBuffer, ...orderToStore } = order;
    localStorage.setItem('nativa_pending_wompi_order', JSON.stringify(orderToStore));
    const status = document.getElementById('paymentStatus');
    status.innerHTML = 'Abriendo ' + PAYMENT_PROCESSOR_NAME + '…';
    setTimeout(() => {
      window.open(buildWompiUrl(order), '_blank');
      if (isLocalHost()) {
        // En local no hay retorno automático (Wompi lo bloquea): confirmación manual.
        status.innerHTML = 'Abrimos ' + PAYMENT_PROCESSOR_NAME + ' en otra pestaña para pagar ' + fmtPrice(order.total) + '.<br>Al terminar, ingresa el <strong>ID de transacción</strong> que aparece en Wompi para confirmar tu pedido.' +
          '<div class="wompi-manual"><input type="text" id="wompiTxInput" placeholder="Ej: WOM-123456-789012"><button class="btn-primary" onclick="confirmManualWompi()">Confirmar pago</button></div>' +
          (WOMPI_TEST ? '<p style="margin-top:8px;font-size:9px">(Ambiente de pruebas de Wompi: usa la tarjeta de prueba.)</p>' : '');
      } else {
        closePaymentModal();
      }
    }, 400);
    // El carrito NO se vacía todavía: solo cuando el pago sale APROBADO.
    return;
  }
}

// Confirmación manual (modo local): el usuario pega el ID de la transacción.
function confirmManualWompi() {
  const input = document.getElementById('wompiTxInput');
  const id = ((input && input.value) || '').trim();
  if (!id) { showToast('Pega el ID de la transacción que te mostró Wompi'); return; }
  confirmWompiReturn(id);
}

// ---------- CONFIRMACIÓN DE PAGO (retorno de Wompi con ?id=TRANSACCION) ----------

let lastWompiTxId = null;

// ¿Estamos en un entorno local? Wompi (CloudFront) BLOQUEA redirect-url hacia
// localhost/IPs privadas con un 403, así que en local se omite el redirect y
// la confirmación se hace manual (pegando el ID de la transacción).
function isLocalHost() {
  const h = window.location.hostname;
  return h === 'localhost' || h === '127.0.0.1' || /^(10|192\.168)\./.test(h) || /^172\.(1[6-9]|2\d|3[01])\./.test(h);
}

// Arma la URL del checkout de Wompi (llave pública + monto + retorno + datos del cliente).
function buildWompiUrl(order) {
  const amountInCents = Math.round(order.total) * 100;
  let url = 'https://checkout.wompi.co/p/?public-key=' + encodeURIComponent(WOMPI_PUBLIC_KEY) +
    '&currency=COP&amount-in-cents=' + amountInCents +
    '&reference=' + encodeURIComponent(order.number) +
    '&customer-data-email=' + encodeURIComponent(order.customer.email) +
    '&customer-data-phone-number=' + encodeURIComponent((order.customer.phone || '').replace(/\D/g, '')) +
    '&customer-data-full-name=' + encodeURIComponent(order.customer.name);
  if (!isLocalHost()) {
    // En producción: Wompi devuelve a la tienda con ?id=TRANSACCION y confirmamos solo.
    const returnUrl = window.location.origin + window.location.pathname;
    url += '&redirect-url=' + encodeURIComponent(returnUrl);
  }
  return url;
}

function openWompiReturnModal() {
  document.getElementById('wompiReturnModal').classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeWompiReturnModal() {
  document.getElementById('wompiReturnModal').classList.remove('open');
  document.body.style.overflow = '';
  // Limpia ?id= de la URL para que un refresh no re-consulte la transacción.
  history.replaceState(null, '', window.location.pathname);
}

function downloadOrderInvoice(order) {
  if (typeof window.jspdf === 'undefined') { showToast('El generador de PDF aún carga...'); return; }
  order.pdfBuffer = generateInvoicePdfPdf(order);
  const blob = new Blob([order.pdfBuffer], { type: 'application/pdf' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'Factura-' + order.number + '.pdf';
  a.click();
  URL.revokeObjectURL(a.href);
}

function renderWompiReturn(order, state, txId, detail) {
  const title = document.getElementById('wrTitle');
  const status = document.getElementById('wrStatus');
  const actions = document.getElementById('wrActions');
  document.getElementById('wrOrder').textContent = order.number;

  const baseInfo = `<div class="wompi-line"><span>Monto pagado</span><strong>${fmtPrice(order.total)}</strong></div>` +
    `<div class="wompi-line"><span>ID de transacción</span><strong>${txId}</strong></div>`;

  if (state === 'approved') {
    title.textContent = 'Pago aprobado';
    status.className = 'wompi-status ok';
    status.innerHTML = baseInfo +
      `<p>Enviamos la factura <strong>${order.number}</strong> a ${order.customer.email} y tu pedido ya está en producción (15 días de elaboración + tránsito).</p>`;
    actions.innerHTML = `<button class="btn-secondary" onclick="closeWompiReturnModal()">Seguir comprando</button>` +
      `<button class="btn-primary" onclick='downloadOrderInvoice(${JSON.stringify(JSON.stringify(order)).replace(/'/g, "&#39;")})'>Descargar factura</button>`;
    return;
  }
  if (state === 'declined') {
    title.textContent = 'Pago rechazado';
    status.className = 'wompi-status bad';
    status.innerHTML = baseInfo + `<p>${PAYMENT_PROCESSOR_NAME} rechazó la transacción. Tu carrito sigue intacto: puedes intentarlo de nuevo con otro medio de pago.</p>`;
    actions.innerHTML = `<button class="btn-secondary" onclick="closeWompiReturnModal()">Cerrar</button>` +
      `<button class="btn-primary" onclick="retryWompiPayment()">Intentar de nuevo</button>`;
    return;
  }
  if (state === 'pending') {
    title.textContent = 'Pago en proceso…';
    status.className = 'wompi-status warn';
    status.innerHTML = baseInfo + `<p>La transacción quedó pendiente (por ejemplo, con PSE). Vuelve a verificar en unos minutos.</p>`;
    actions.innerHTML = `<button class="btn-secondary" onclick="closeWompiReturnModal()">Cerrar</button>` +
      `<button class="btn-primary" onclick="confirmWompiReturn()">Verificar de nuevo</button>`;
    return;
  }
  if (state === 'mismatch') {
    title.textContent = 'Revisión manual requerida';
    status.className = 'wompi-status warn';
    status.innerHTML = baseInfo + `<p>El pago fue aprobado pero el monto o la referencia no coinciden con el pedido. Contáctanos por WhatsApp con el ID de la transacción.</p>`;
    actions.innerHTML = `<button class="btn-primary" onclick="closeWompiReturnModal()">Entendido</button>`;
    return;
  }
  // voided / error / notfound / network
  title.textContent = 'No pudimos confirmar el pago';
  status.className = 'wompi-status bad';
  status.innerHTML = `<div class="wompi-line"><span>ID consultado</span><strong>${txId}</strong></div>` +
    `<p>${detail || 'La transacción no se encontró. Verifica que el ID copiado sea el completo (WOM-…) e intenta de nuevo.'}</p>`;
  actions.innerHTML = `<button class="btn-secondary" onclick="closeWompiReturnModal()">Cerrar</button>` +
    `<button class="btn-primary" onclick="confirmWompiReturn()">Verificar de nuevo</button>`;
}

function retryWompiPayment() {
  const raw = localStorage.getItem('nativa_pending_wompi_order');
  if (!raw) { closeWompiReturnModal(); return; }
  window.open(buildWompiUrl(JSON.parse(raw)), '_blank');
}

// Al volver de Wompi (o con ID manual): consulta la transacción con la llave pública.
async function confirmWompiReturn(txIdArg) {
  const txId = txIdArg || lastWompiTxId || new URLSearchParams(window.location.search).get('id');
  if (!txId) return;
  lastWompiTxId = txId;
  const raw = localStorage.getItem('nativa_pending_wompi_order');
  if (!raw) return;
  let order;
  try { order = JSON.parse(raw); } catch (e) { localStorage.removeItem('nativa_pending_wompi_order'); return; }

  renderWompiReturn(order, 'checking-placeholder');
  const status = document.getElementById('wrStatus');
  status.className = 'wompi-status';
  status.innerHTML = '<div class="wompi-spinner"></div><p>Consultando el estado de tu pago con ' + PAYMENT_PROCESSOR_NAME + '…</p>';
  document.getElementById('wrTitle').textContent = 'Confirmando tu pago…';
  document.getElementById('wrOrder').textContent = order.number;
  document.getElementById('wrActions').innerHTML = '';
  openWompiReturnModal();

  try {
    const res = await fetch(WOMPI_API_BASE + '/transactions/' + encodeURIComponent(txId), {
      headers: { 'Authorization': 'Bearer ' + WOMPI_PUBLIC_KEY }
    });
    const json = await res.json().catch(() => null);
    const tx = json && json.data;
    if (!tx) { renderWompiReturn(order, 'notfound', txId); return; }

    const amountOk = tx.amount_in_cents === Math.round(order.total) * 100;
    const refOk = !tx.reference || tx.reference === order.number;

    if (tx.status === 'APPROVED' && amountOk && refOk) {
      order.paymentMethodLabel = 'Pago en línea ' + PAYMENT_PROCESSOR_NAME + ' · APROBADO · ID ' + txId;
      updateOrderStatus(order.number, 'Pagado — APROBADO');
      if (typeof window.jspdf !== 'undefined') {
        try { order.pdfBuffer = generateInvoicePdfPdf(order); } catch (e) { console.warn('PDF:', e); }
      }
      sendOrderViaBrevo(order, true).catch(err => console.warn('Correo:', err));
      cart = [];
      saveCart();
      updateCartUI();
      localStorage.removeItem('nativa_pending_wompi_order');
      renderWompiReturn(order, 'approved', txId);
    } else if (tx.status === 'APPROVED') {
      renderWompiReturn(order, 'mismatch', txId);
    } else if (tx.status === 'DECLINED') {
      renderWompiReturn(order, 'declined', txId);
    } else if (tx.status === 'PENDING') {
      renderWompiReturn(order, 'pending', txId);
    } else {
      renderWompiReturn(order, tx.status === 'VOIDED' ? 'voided' : 'error', txId);
    }
  } catch (err) {
    console.error('Wompi:', err);
    renderWompiReturn(order, 'error', txId, 'Error de red al consultar la transacción.');
  }
}

// Regenera la factura incluyendo el método de pago elegido en la página 2.
async function regenerateInvoiceWithPaymentInfo(order) {
  if (typeof window.jspdf === 'undefined') return;
  try { order.pdfBuffer = generateInvoicePdfPdf(order); } catch (e) { console.warn('PDF:', e); }
}

// Tras elegir método de pago: limpia el carrito y cierra los modales.
function finishOrderAfterPaymentChoice(order) {
  cart = [];
  saveCart();
  updateCartUI();
  setTimeout(() => {
    closeCheckout();
    closePaymentModal();
    document.body.style.overflow = '';
  }, 3500);
}

async function sendOrder() {
  const name = document.getElementById('customerName').value.trim();
  const email = document.getElementById('customerEmail').value.trim();
  const phone = document.getElementById('customerPhone').value.trim();
  const address = document.getElementById('customerAddress').value.trim();
  const neighborhood = document.getElementById('shipNeighborhood').value.trim();
  const city = document.getElementById('shipCity').value.trim();
  const postal = document.getElementById('shipPostal').value.trim();
  const country = document.getElementById('shipCountry').value;
  const stateSel = document.getElementById('shipState');
  const stateText = document.getElementById('shipStateText');
  const state = country === 'Colombia' ? (stateSel.value || '') : (stateText.value.trim());
  const notes = document.getElementById('customerNotes').value.trim();

  if (!name || !email || !phone || !address || !city || !country) {
    showToast('Completa nombre, correo, teléfono, país, ciudad y dirección');
    return;
  }
  if (!isEmailValid(email)) {
    showToast('El correo electrónico no parece válido');
    return;
  }
  if (!cart.length) {
    showToast('Tu carrito está vacío');
    return;
  }

  const btn = document.getElementById('sendOrderBtn');
  btn.disabled = true;
  btn.textContent = 'Generando factura...';

  const units = cart.reduce((s, i) => s + i.qty, 0);
  const { cost: shippingCost, zone, campus } = calcShipping(country, units);
  const prodDays = productionDaysFor(units);
  const transitDays = transitDaysFor(country, units, campus);
  const etaDays = prodDays + (campus ? CAMPUS_DELIVERY.days : (transitDays + (isBulkAllowed() ? 0 : 5)));
  const subtotal = cart.reduce((s, i) => s + i.price * i.qty, 0);

  // Dirección completa y legible para factura/correo/WhatsApp.
  const fullAddress = [address, neighborhood, city, state, postal, country].filter(Boolean).join(', ');

  const order = {
    number: nextOrderNumber(),
    date: new Date().toLocaleString('es-CO'),
    customer: { name, email, phone, address, neighborhood, city, state, postal, country, fullAddress, notes },
    items: cart.map(i => ({ title: i.title, variant: i.variant || '', qty: i.qty, price: i.price })),
    units,
    subtotal,
    shippingCost,
    total: subtotal + shippingCost,
    zone: zone.zone,
    campus,
    deliveryLabel: campus ? CAMPUS_DELIVERY.label : 'Envío por transportadora a ' + [city, country].filter(Boolean).join(', '),
    prodDays,
    transitDays,
    transitText: campus ? 'Entrega en campus (' + daysRangeText(CAMPUS_DELIVERY.days) + ' + producción)' : transitTextFor(transitDays, campus),
    etaText: etaDateText(etaDays),
    totalBusinessDays: etaDays,
    refCurrency: refCurrencyFor(),
    contactChannel: 'el canal de contacto elegido por el cliente (WhatsApp o correo)'
  };

  try {
    if (typeof window.jspdf === 'undefined') throw new Error('No se pudo cargar el generador de PDF (jsPDF).');
    order.pdfBuffer = generateInvoicePdfPdf(order);
  } catch (err) {
    console.error('Error al generar la factura:', err);
    showToast('No se pudo generar la factura: ' + err.message);
    btn.disabled = false;
    btn.textContent = 'Continuar al pago';
    return;
  }

  window._lastOrder = order;
  btn.disabled = false;
  btn.textContent = 'Continuar al pago';
  // El modal de pago se abre solo (cerramos el checkout para que no quede debajo).
  closeCheckout();
  openPaymentModal(order);
}

// ---------- FACTURA COMERCIAL (formato visual de la referencia) ----------

function generateInvoicePdfPdf(order) {

  const doc = new window.jspdf.jsPDF({ unit: 'mm', format: 'letter' });
  const W = doc.internal.pageSize.getWidth();
  const M = 15;

  // Paleta visual de la referencia.
  const VINO = [92, 26, 40];
  const BERRY = [128, 42, 58];    // fondo del encabezado de la tabla
  const ROSE = [243, 207, 212];   // banda de cliente y TOTAL A PAGAR
  const ROSE_SOFT = [249, 227, 230]; // filas alternas
  const GRAY_TXT = [90, 84, 82];

  // --- Encabezado: NATIVA (izq.) + FACTURA COMERCIAL y No./Fecha/Moneda (der.) ---
  doc.setFont('times', 'bold');
  doc.setFontSize(26);
  doc.setTextColor(...VINO);
  doc.text('NATIVA', M, 24);

  doc.setFont('times', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(...GRAY_TXT);
  doc.text('NATIVA BISUTERIA S.A.S.', M, 30);
  doc.text('NIT: 901.842.109-5', M, 34.2);
  doc.text('Km 5, antigua Vía a Puerto Colombia, Barranquilla - Colombia', M, 38.4);
  doc.text('Tel: 3028303387 | finanzas@nativacol.shop', M, 42.6);

  doc.setFont('times', 'bold');
  doc.setFontSize(15);
  doc.setTextColor(...VINO);
  doc.text('FACTURA COMERCIAL', W - M, 21, { align: 'right' });
  doc.setFont('times', 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(42, 37, 36);
  const currencyLabel = order.refCurrency ? order.refCurrency.label : 'Pesos Colombianos (COP)';
  // (La moneda impresa corresponde a la elegida por el cliente en la tienda.)
  doc.text('No: ' + order.number, W - M, 28.5, { align: 'right' });
  doc.text('Fecha: ' + order.date.split(',')[0], W - M, 33.3, { align: 'right' });
  doc.text('Moneda: ' + currencyLabel, W - M, 38.1, { align: 'right' });

  // --- Banda rosa: INFORMACIÓN DEL CLIENTE / SHIP TO ---
  const bandY = 50;
  doc.setFillColor(...ROSE);
  doc.rect(M, bandY, W - 2 * M, 24, 'F');
  doc.setFont('times', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(...VINO);
  doc.text('INFORMACIÓN DEL CLIENTE / SHIP TO:', M + 3, bandY + 6.5);
  doc.setFont('times', 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(74, 22, 34);
  const info = [
    'Cliente: ' + order.customer.name,
    'Dirección: ' + (order.customer.fullAddress || order.customer.address || '—'),
    'Contacto: ' + order.customer.email + ' · ' + order.customer.phone + (order.customer.notes ? ('  ·  Notas: ' + order.customer.notes) : '')
  ];
  info.forEach((line, i) => doc.text(line, M + 3, bandY + 12.5 + i * 5.2));

  // --- La factura se emite en la moneda elegida por el cliente (con total COP de referencia) ---
  const rc = order.refCurrency || REFERENCE_CURRENCIES[0];
  const rate = (TRM && TRM[rc.code]) || rc.fallbackRate || 1;
  const inRef = rc.code !== 'COP';
  const fmtMoney = n => {
    if (!inRef) return n.toLocaleString('es-CO', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
    const v = n / rate;
    return v.toLocaleString('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };
  const fmtQty = n => n.toLocaleString('es-CO');
  const moneyTag = inRef ? (' ' + rc.code) : ' COP';
  const copRefLine = inRef
    ? 'COP ' + Math.round(order.total).toLocaleString('es-CO') + '  (tasa: 1 ' + rc.code + ' = ' + rate.toLocaleString('es-CO', { maximumFractionDigits: 2 }) + ' COP)'
    : '';

  // --- Tabla: encabezado vino con texto blanco + filas zebra rosa ---
  const cols = { it: M + 3, desc: M + 14, cant: W - M - 58, unit: W - M - 30, tot: W - M - 3 };
  let y = bandY + 24 + 8;
  const headH = 9;
  doc.setFillColor(...BERRY);
  doc.rect(M, y - 5.5, W - 2 * M, headH, 'F');
  doc.setFont('times', 'bold');
  doc.setFontSize(9.5);
  // Quirk de jsPDF: la primera setTextColor no se emite; forzamos la transición
  // negro→blanco para que el texto del encabezado quede blanco de verdad.
  doc.setTextColor(0, 0, 0);
  doc.setTextColor(255, 255, 255);
  doc.text('Ít.', cols.it, y);
  doc.text('Descripción del Producto / Servicio', cols.desc, y);
  doc.text('Cant.', cols.cant, y, { align: 'right' });
  doc.text('V. Unit' + moneyTag, cols.unit, y, { align: 'right' });
  doc.text('Total' + moneyTag, cols.tot, y, { align: 'right' });
  y += headH - 1.2;

  const rowH = 8.2;
  const drawRow = (idx, cells, zebra) => {
    if (y + rowH > 245) { doc.addPage(); y = 30; }
    if (zebra) {
      doc.setFillColor(...ROSE_SOFT);
      doc.rect(M, y - 4.6, W - 2 * M, rowH, 'F');
    }
    doc.setFont('times', 'normal');
    doc.setFontSize(9.5);
    doc.setTextColor(42, 37, 36);
    doc.text(String(idx), cols.it, y);
    doc.text(cells[0], cols.desc, y);
    doc.text(cells[1], cols.cant, y, { align: 'right' });
    doc.text(cells[2], cols.unit, y, { align: 'right' });
    doc.text(cells[3], cols.tot, y, { align: 'right' });
    y += rowH;
  };

  order.items.forEach((it, idx) => {
    const name = it.variant ? `${it.title} — ${it.variant}` : it.title;
    drawRow(idx + 1, [name, fmtQty(it.qty), fmtMoney(it.price), fmtMoney(it.price * it.qty)], idx % 2 === 1);
  });

  // Envío (o entrega en campus) como última línea de la tabla.
  const shipName = order.campus ? CAMPUS_DELIVERY.label : 'Costo de envío a ' + (order.customer.city || order.customer.country);
  const shipVal = fmtMoney(order.shippingCost);
  drawRow(order.items.length + 1, [shipName, '1', shipVal, shipVal], order.items.length % 2 === 1);

  // --- Totales alineados a la derecha (como la referencia) ---
  y += 6;
  doc.setFont('times', 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(42, 37, 36);
  doc.text('Total Bruto:', W - M - 40, y, { align: 'right' });
  doc.text(fmtMoney(order.total) + moneyTag, W - M, y, { align: 'right' });
  y += 7;
  doc.text('Impuestos / IVA (Exportación Exenta 0%):', W - M - 40, y, { align: 'right' });
  doc.text('0' + moneyTag, W - M, y, { align: 'right' });
  y += 8;

  // Banda rosa del TOTAL A PAGAR.
  doc.setFillColor(...ROSE);
  doc.rect(M, y - 5.5, W - 2 * M, 10.5, 'F');
  doc.setFont('times', 'bold');
  doc.setFontSize(11.5);
  doc.setTextColor(...VINO);
  doc.text('TOTAL A PAGAR:', M + 3, y + 1.8);
  doc.text(fmtMoney(order.total) + moneyTag, W - M - 3, y + 1.8, { align: 'right' });
  y += 12;

  // Referencia en COP (cuando la factura se emite en otra moneda).
  if (copRefLine) {
    doc.setFont('times', 'italic');
    doc.setFontSize(8.5);
    doc.setTextColor(...GRAY_TXT);
    doc.text('Importe de referencia: ' + copRefLine + '. El pago se procesa en pesos colombianos.', M, y + 2);
    doc.setFont('times', 'normal');
  }

  // --- Página 2: panel rosa con términos y datos bancarios (como la referencia) ---
  doc.addPage();
  doc.setFont('times', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(42, 37, 36);
  let y2 = 45;
  const terms = [
    'Pedido No.: ' + order.number,
    'Método de pago: ' + (order.paymentMethodLabel || 'Por definir (el cliente elige al confirmar el pedido)'),
    'Método de entrega: ' + (order.deliveryLabel || 'Envío por transportadora'),
    'Tiempo de producción: ' + daysRangeText(order.prodDays || 3) + ' (estimado).',
    'Tiempo de tránsito: ' + (order.transitText || daysRangeText(order.transitDays || 3)) + '.',
    'Fecha estimada de entrega: ' + (order.etaText || 'a coordinar') + '.',
    'Comunicaciones: ante cambios o complicaciones nos comunicaremos por ' + (order.contactChannel || 'el canal de contacto elegido') + '.',
    'Medio de pago: Transferencia Bancaria | Banco: Bancolombia | Titular: NATIVA BISUTERIA S.A.S.',
    'Cuenta No.: 487-000087-36',
    'Observaciones: Exportación exenta de IVA en Colombia (Tarifa 0%). Validez de la oferta: 15 días.'
  ];
  const panelH = 14 + terms.length * 6.2 + 4;
  doc.setFillColor(...ROSE);
  doc.rect(M, y2, W - 2 * M, panelH, 'F');
  doc.setFont('times', 'bold');
  doc.setFontSize(10.5);
  doc.setTextColor(...VINO);
  doc.text('TÉRMINOS COMERCIALES Y DATOS BANCARIOS:', M + 4, y2 + 8);
  doc.setFont('times', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(74, 22, 34);
  terms.forEach((line, i) => doc.text('• ' + line, M + 4, y2 + 15.5 + i * 6.2));

  doc.setFont('times', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(118, 109, 104);
  const y3 = y2 + panelH + 10;
  doc.text('El costo de envío es un estimado; si la tarifa final difiere, el cliente será notificado por su canal de contacto antes del despacho.', M, y3);
  doc.setFontSize(8.5);
  doc.text('Documento generado automáticamente por la tienda en línea de ' + MERCHANT_NAME + '.', M, y3 + 12);

  return doc.output('arraybuffer');
}

function getGalleryItems(p) {
  const items = [];
  // Con variantes de color: una imagen por color (la del color elegido al frente).
  const imgs = (p.variants && p.variants.length)
    ? (p.variants.map(v => v.image).filter(Boolean).length ? p.variants.map(v => v.image).filter(Boolean) : [p.image || (p.id + '.jpg')])
    : ((p.images && p.images.length) ? p.images : [p.image || (p.id + '.jpg')]);
  imgs.forEach(img => items.push({ type: 'image', src: `${PRODUCTS_DIR}/${img}` }));

  if (p.embeds && p.embeds.length) {
    p.embeds.forEach(e => {
      if (typeof e === 'string') {
        items.push({ type: 'embed', src: e, title: p.title });
      } else if (e && e.url) {
        items.push({ type: 'embed', src: e.url, title: e.title || p.title });
      }
    });
  }
  return items;
}

function renderGalleryItem(item) {
  if (item.type === 'embed') {
    return `<iframe src="${item.src}" title="${item.title || ''}"
      allow="autoplay; fullscreen; xr-spatial-tracking; accelerometer; gyroscope"
      allowfullscreen loading="lazy"></iframe>`;
  }
  return `<img src="${item.src}" alt=""
    onerror="this.outerHTML='<div class=&quot;image-fallback&quot;>Imagen no disponible</div>';">`;
}

function selectGalleryItem(idx) {
  currentGalleryIndex = idx;
  document.getElementById('productModalMain').innerHTML = renderGalleryItem(currentGallery[idx]);
  document.querySelectorAll('#productModalThumbs .gallery-thumb').forEach((btn, i) => {
    btn.classList.toggle('active', i === idx);
  });
}

function renderProductModal() {
  const p = currentDetailProduct;

  document.getElementById('productModalMain').innerHTML = renderGalleryItem(currentGallery[currentGalleryIndex]);

  document.getElementById('productModalThumbs').innerHTML = currentGallery.map((item, idx) => `
    <button class="gallery-thumb${idx === currentGalleryIndex ? ' active' : ''}" onclick="selectGalleryItem(${idx})">
      ${item.type === 'embed'
        ? `<span class="thumb-3d-badge">3D</span>`
        : `<img src="${item.src}" alt="" onerror="this.style.display='none';">`}
    </button>
  `).join('');

  document.getElementById('productModalInfo').innerHTML = `
    ${p.badge ? `<span class="product-badge" style="position:static; display:inline-block; margin-bottom:14px;">${p.badge}</span>` : ''}
    <h3>${p.title}</h3>
    <div class="product-meta">
      ${p.material ? `<span>${p.material}</span>` : ''}
      ${p.dimensions ? `<span>${p.dimensions}</span>` : ''}
    </div>
    <p>${p.description}</p>
    ${variantSwatchesHtml(p, p._selVariant || (p.variants && p.variants.length ? p.variants[0].color : ''))}
    <div class="product-modal-footer">
      <div>
        <span class="price">${fmtPrice(p.price)}</span>            <div class="stock-tag">${stockLabel(p)}</div>
      </div>
      <div class="modal-actions-buttons">
        <button class="add-btn" onclick="addToCart('${p.id}')" ${p.stock === 0 ? 'disabled' : ''}>
          ${p.stock === 0 ? 'Agotado' : 'Añadir al carrito'}
        </button>
      </div>
    </div>
  `;
}

function showProductDetail(id) {
  const product = ALL_PRODUCTS.find(p => p.id === id);
  if (!product) return;

  currentDetailProduct = product;
  currentGallery = getGalleryItems(product);
  currentGalleryIndex = 0;

  renderProductModal();
  document.getElementById('productModal').classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeProductModal() {
  document.getElementById('productModal').classList.remove('open');
  document.body.style.overflow = '';
}

async function init() {
  // El slideshow de homepage/ va aparte para que, si falla o tarda, no bloquee la tienda
  scanHomepageImages()
    .then(renderHeroSlides)
    .catch(err => console.warn('No se pudo cargar el slideshow de homepage/:', err));

  // TRM para el selector de moneda de referencia (con caché de respaldo).
  try { const t = JSON.parse(localStorage.getItem('nativa_trm') || 'null'); if (t && t.usd) TRM.USD = t.usd; } catch (e) {}
  try { const c = localStorage.getItem('nativa_ccy'); if (c && REFERENCE_CURRENCIES.some(x => x.code === c)) DISPLAY_CCY = c; } catch (e) {}
  const ccySel = document.getElementById('refCurrency');
  if (ccySel) ccySel.value = DISPLAY_CCY;
  fetchTRM().then(() => { if (DISPLAY_CCY !== 'COP') updateReferenceCurrency(); }).catch(() => {});

  let products = [];
  try {
    products = await scanProducts();
  } catch (err) {
    console.error('Error al escanear products/:', err);
  }

  ALL_PRODUCTS = products;

  document.getElementById('loading').style.display = 'none';

  if (ALL_PRODUCTS.length === 0) {
    document.getElementById('products').style.display = 'block';
    document.getElementById('products').innerHTML = `
      <div style="text-align:center; padding:80px 24px; color:var(--gris); grid-column:1/-1;">
        <p style="font-family:'Cormorant Garamond',Georgia,serif; font-size:28px; color:var(--vino);">Catálogo en preparación</p>
        <p style="margin-top:10px; font-size:10px; letter-spacing:.6px;">Vuelve pronto para descubrir las piezas disponibles.</p>
      </div>
    `;
    return;
  }  buildCollectionFilters();
  buildCategoryFilters();
  renderProducts();

  migrateLegacyCart();
  initShippingUI();
  clampCartToPublicLimits();
  updateCartUI();
  updateSessionUI();

  // Si venimos de volver de Wompi (?id=TRANSACCION), confirmamos el pago.
  if (new URLSearchParams(window.location.search).get('id')) {
    confirmWompiReturn();
  }
}

init();


(function () {
  var wrap = document.getElementById('nativaSymbolWrap');
  if (!wrap) return;

  function updateFromEvent(clientX, clientY) {
    var rect = wrap.getBoundingClientRect();
    var cx = Math.max(0, Math.min(100, ((clientX - rect.left) / rect.width) * 100));
    var cy = Math.max(0, Math.min(100, ((clientY - rect.top) / rect.height) * 100));

    // La luz "viene" del cursor: la linea de brillo se desplaza hacia el mouse
    // y las sombras (abajo y arriba) en sentido contrario.
    var dx = (cx - 50) / 50; // -1 a 1
    var dy = (cy - 50) / 50;
    wrap.style.setProperty('--sx', (-dx * 7).toFixed(1) + 'px');
    wrap.style.setProperty('--sy', (-dy * 5).toFixed(1) + 'px');
    wrap.style.setProperty('--shine-shift', (dx * 60).toFixed(1) + '%');
  }

  // El brillo metalico reacciona al mover el mouse por toda la pagina
  window.addEventListener('mousemove', function (e) {
    updateFromEvent(e.clientX, e.clientY);
  }, { passive: true });

  // Soporte táctil
  wrap.addEventListener('touchmove', function (e) {
    if (e.touches && e.touches[0]) {
      updateFromEvent(e.touches[0].clientX, e.touches[0].clientY);
    }
  }, { passive: true });
})();
