const API = '/api';

let token = localStorage.getItem('token');
let currentUser = null;

let productos = [];
let config = {};
let dashboard = null;
let pedidos = [];
let rotacion = [];
let usuarios = [];

let state = {
  screen: 'loading',
  tab: 'dashboard',
  movMode: 'CARGA',
  cart: [],
  flash: null,
  loginError: null,
  labelProduct: null,
  showAddForm: false,
  showUserForm: false,
};

/* ---------------- API HELPER ---------------- */
async function api(path, opts = {}) {
  const headers = Object.assign({ 'Content-Type': 'application/json' }, opts.headers || {});
  if (token) headers['Authorization'] = 'Bearer ' + token;
  const res = await fetch(API + path, { ...opts, headers });
  let data = null;
  try { data = await res.json(); } catch (e) { /* no body */ }
  if (!res.ok) {
    if (res.status === 401) { logout(); }
    throw new Error((data && data.error) || 'Error de red (' + res.status + ')');
  }
  return data;
}

function money(n) { return '$' + (Number(n) || 0).toFixed(2); }
function fmtDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit' }) + ' ' + d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
}
function genBarcodeClient() {
  const t = Date.now().toString(36).toUpperCase();
  const r = Math.random().toString(36).slice(2, 5).toUpperCase();
  return 'INV' + t + r;
}

/* ---------------- AUTH ---------------- */
async function boot() {
  if (!token) { state.screen = 'login'; render(); return; }
  try {
    const r = await api('/auth/me');
    currentUser = r.usuario;
    state.screen = 'app';
    await loadCore();
  } catch (e) {
    token = null; localStorage.removeItem('token');
    state.screen = 'login';
  }
  render();
}

async function login(email, password) {
  try {
    const r = await api('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
    token = r.token; currentUser = r.usuario;
    localStorage.setItem('token', token);
    state.screen = 'app'; state.loginError = null;
    await loadCore();
    render();
  } catch (e) {
    state.loginError = e.message;
    render();
  }
}
function logout() {
  token = null; currentUser = null;
  localStorage.removeItem('token');
  state.screen = 'login'; state.tab = 'dashboard';
  render();
}

async function loadCore() {
  const [p, c] = await Promise.all([api('/productos'), api('/config')]);
  productos = p; config = c;
}
async function loadDashboard() { dashboard = await api('/reportes/dashboard'); }
async function loadPedidos() { pedidos = await api('/productos/reportes/pedidos'); }
async function loadRotacion() { rotacion = await api('/reportes/rotacion'); }
async function loadUsuarios() { usuarios = await api('/usuarios'); }

function isAdmin() { return currentUser && currentUser.rol === 'ADMIN'; }

/* ---------------- TABS ---------------- */
async function setTab(t) {
  state.tab = t; state.flash = null;
  render();
  try {
    if (t === 'dashboard') { await loadDashboard(); }
    if (t === 'inventario') { productos = await api('/productos'); }
    if (t === 'precios') { productos = await api('/productos'); config = await api('/config'); }
    if (t === 'pedidos') { await loadPedidos(); }
    if (t === 'reportes') { await loadDashboard(); await loadRotacion(); }
    if (t === 'usuarios' && isAdmin()) { await loadUsuarios(); }
  } catch (e) { state.flash = { type: 'err', msg: e.message }; }
  render();
}

/* ---------------- PRODUCTOS ---------------- */
async function addProduct(data) {
  try {
    await api('/productos', { method: 'POST', body: JSON.stringify(data) });
    productos = await api('/productos');
    state.showAddForm = false;
    state.flash = { type: 'ok', msg: 'Producto agregado.' };
  } catch (e) { state.flash = { type: 'err', msg: e.message }; }
  render();
}
async function deleteProduct(id, nombre) {
  if (!confirm('¿Eliminar "' + nombre + '" del inventario?')) return;
  try {
    await api('/productos/' + id, { method: 'DELETE' });
    productos = await api('/productos');
  } catch (e) { state.flash = { type: 'err', msg: e.message }; }
  render();
}
async function updatePriceField(id, field, value) {
  try {
    await api('/productos/' + id, { method: 'PATCH', body: JSON.stringify({ [field]: parseFloat(value) || 0 }) });
    productos = await api('/productos');
  } catch (e) { state.flash = { type: 'err', msg: e.message }; }
  render();
}
async function recalcRow(id) {
  const p = productos.find(x => x.id === id);
  try {
    await api('/productos/' + id, {
      method: 'PATCH',
      body: JSON.stringify({ precioLista: p.precio_lista, pctDescuento: p.pct_descuento })
    });
    productos = await api('/productos');
  } catch (e) { state.flash = { type: 'err', msg: e.message }; }
  render();
}
async function recalcAll() {
  try {
    await api('/productos/acciones/recalcular', { method: 'POST' });
    productos = await api('/productos');
    state.flash = { type: 'ok', msg: 'Precios recalculados para todos los productos.' };
  } catch (e) { state.flash = { type: 'err', msg: e.message }; }
  render();
}

function normalizeKey(k) {
  return k.toString().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');
}
async function readRowsFromFile(file) {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array' });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json(sheet, { defval: '' });
}
async function importProductsFromFile(file) {
  try {
    const raw = await readRowsFromFile(file);
    const filas = raw.map(row => {
      const n = {}; Object.keys(row).forEach(k => n[normalizeKey(k)] = row[k]);
      return {
        codigo: n['codigo'] || n['codigodebarras'] || n['codigobarras'] || n['barcode'] || n['sku'] || n['ean'] || '',
        nombre: n['nombre'] || n['producto'] || n['descripcion'] || '',
        categoria: n['categoria'] || '',
        precioCompra: n['preciocompra'] || '',
        precioVenta: n['precioventa'] || n['precio'] || '',
        stock: n['stock'] || '',
        stockMinimo: n['stockminimo'] || n['minimo'] || ''
      };
    });
    const r = await api('/productos/acciones/importar', { method: 'POST', body: JSON.stringify({ filas }) });
    productos = await api('/productos');
    state.flash = { type: 'ok', msg: `Importación completa: ${r.creados} nuevos, ${r.actualizados} actualizados${r.omitidos ? `, ${r.omitidos} omitidos` : ''}.` };
  } catch (e) { state.flash = { type: 'err', msg: e.message }; }
  render();
}
async function importPreciosFromFile(file) {
  try {
    const raw = await readRowsFromFile(file);
    const filas = raw.map(row => {
      const n = {}; Object.keys(row).forEach(k => n[normalizeKey(k)] = row[k]);
      return {
        codigo: n['codigo'] || n['codigodebarras'] || n['codigobarras'] || n['barcode'] || n['sku'] || n['ean'] || '',
        nombre: n['nombre'] || n['producto'] || n['descripcion'] || '',
        precioLista: n['preciolista'] || n['preciodelista'] || n['precio'] || n['pvp'] || n['listprice'] || n['precioventa'] || ''
      };
    });
    const r = await api('/productos/acciones/precios', { method: 'POST', body: JSON.stringify({ filas }) });
    productos = await api('/productos');
    let msg = `Precio de lista actualizado en ${r.actualizados} producto(s).`;
    if (r.noEncontrados.length) msg += ` No encontrados: ${r.noEncontrados.slice(0, 5).join(', ')}${r.noEncontrados.length > 5 ? '…' : ''}`;
    state.flash = { type: r.actualizados ? 'ok' : 'err', msg };
  } catch (e) { state.flash = { type: 'err', msg: e.message }; }
  render();
}

/* ---------------- MOVIMIENTOS / VENTAS ---------------- */
async function registrarMovimiento(barcode, tipo, cantidad, motivo) {
  try {
    const r = await api('/movimientos', { method: 'POST', body: JSON.stringify({ barcode, tipo, cantidad, motivo }) });
    state.flash = { type: 'ok', msg: (tipo === 'CARGA' ? 'Entrada' : 'Salida') + ` registrada: ${cantidad} × ${r.producto.nombre} (stock: ${r.producto.stock})` };
    productos = await api('/productos');
    return true;
  } catch (e) { state.flash = { type: 'err', msg: e.message }; render(); return false; }
}
async function addToCart(barcode) {
  try {
    const p = await api('/productos/' + encodeURIComponent(barcode));
    const existing = state.cart.find(l => l.barcode === barcode);
    const already = existing ? existing.cantidad : 0;
    if (p.stock <= already) { state.flash = { type: 'err', msg: `Sin stock suficiente de "${p.nombre}"` }; render(); return; }
    if (existing) existing.cantidad++;
    else state.cart.push({ barcode, nombre: p.nombre, cantidad: 1, precioVenta: Number(p.precio_venta), precioCompra: Number(p.precio_compra) });
    state.flash = { type: 'ok', msg: 'Agregado: ' + p.nombre };
  } catch (e) { state.flash = { type: 'err', msg: e.message }; }
  render();
}
async function finalizarVenta() {
  if (state.cart.length === 0) return;
  try {
    const lineas = state.cart.map(l => ({ barcode: l.barcode, cantidad: l.cantidad }));
    await api('/movimientos/venta', { method: 'POST', body: JSON.stringify({ lineas }) });
    state.cart = [];
    state.flash = { type: 'ok', msg: 'Venta finalizada correctamente.' };
    productos = await api('/productos');
  } catch (e) { state.flash = { type: 'err', msg: e.message }; }
  render();
}

/* ---------------- CONFIG / BCV ---------------- */
async function fetchTasaBCV() {
  try {
    await api('/config/tasa-bcv/actualizar', { method: 'POST' });
    config = await api('/config');
    state.flash = { type: 'ok', msg: 'Tasa BCV actualizada: ' + Number(config.tasa_bcv).toFixed(2) + ' Bs/USD' };
  } catch (e) { state.flash = { type: 'err', msg: e.message }; }
  render();
}
async function saveManualTasa(v) {
  try {
    config = await api('/config', { method: 'PATCH', body: JSON.stringify({ tasaBCV: v }) });
    state.flash = { type: 'ok', msg: 'Tasa guardada manualmente.' };
  } catch (e) { state.flash = { type: 'err', msg: e.message }; }
  render();
}
async function saveDefaultPct(v) {
  try { config = await api('/config', { method: 'PATCH', body: JSON.stringify({ pctMinimoDefault: v }) }); }
  catch (e) { state.flash = { type: 'err', msg: e.message }; }
  render();
}

/* ---------------- USUARIOS ---------------- */
async function createUser(data) {
  try {
    await api('/usuarios', { method: 'POST', body: JSON.stringify(data) });
    usuarios = await api('/usuarios');
    state.showUserForm = false;
    state.flash = { type: 'ok', msg: 'Usuario creado.' };
  } catch (e) { state.flash = { type: 'err', msg: e.message }; }
  render();
}
async function toggleUserActive(id, activo) {
  try { await api('/usuarios/' + id, { method: 'PATCH', body: JSON.stringify({ activo }) }); usuarios = await api('/usuarios'); }
  catch (e) { state.flash = { type: 'err', msg: e.message }; }
  render();
}
async function resetUserPassword(id) {
  const pass = prompt('Nueva contraseña temporal (mínimo 6 caracteres):');
  if (!pass) return;
  try {
    await api('/usuarios/' + id + '/reset-password', { method: 'POST', body: JSON.stringify({ password: pass }) });
    state.flash = { type: 'ok', msg: 'Contraseña actualizada.' };
  } catch (e) { state.flash = { type: 'err', msg: e.message }; }
  render();
}

/* ---------------- DERIVADOS ---------------- */
function listProductos() { return [...productos].sort((a, b) => a.nombre.localeCompare(b.nombre)); }

/* ---------------- RENDER ---------------- */
function render() {
  const app = document.getElementById('app');
  if (state.screen === 'loading') { app.innerHTML = '<div class="login-wrap"><div class="empty">Cargando…</div></div>'; return; }
  if (state.screen === 'login') { app.innerHTML = renderLogin(); attachLoginHandlers(); return; }

  const bajo = pedidos.length;
  app.innerHTML = `
    <div class="topbar">
      <div class="brand">
        <img src="/img/logo-dumas.jpg" alt="Repuestos Dumas" class="brand-logo">
        <div><h1>Inventario Pro</h1><div class="sub">carga · descarga · ventas · rotación · precios</div></div>
      </div>
      <div class="userbox">
        <span>${currentUser.nombre}</span>
        <span class="rolechip">${currentUser.rol}</span>
        <button id="logoutBtn">Salir</button>
      </div>
    </div>
    <nav class="tabs">
      ${tabBtn('dashboard', 'Panel')}
      ${tabBtn('inventario', 'Inventario')}
      ${tabBtn('movimientos', 'Carga / Descarga')}
      ${tabBtn('ventas', 'Ventas')}
      ${isAdmin() ? tabBtn('precios', 'Precios') : ''}
      ${tabBtn('pedidos', 'Pedidos' + (bajo ? ` <span class="badge">${bajo}</span>` : ''))}
      ${tabBtn('reportes', 'Reportes')}
      ${isAdmin() ? tabBtn('usuarios', 'Usuarios') : ''}
    </nav>
    <div id="tabContent"></div>
  `;
  const c = document.getElementById('tabContent');
  if (state.tab === 'dashboard') c.innerHTML = renderDashboard();
  else if (state.tab === 'inventario') c.innerHTML = renderInventario();
  else if (state.tab === 'movimientos') c.innerHTML = renderMovimientos();
  else if (state.tab === 'ventas') c.innerHTML = renderVentas();
  else if (state.tab === 'precios' && isAdmin()) c.innerHTML = renderPrecios();
  else if (state.tab === 'pedidos') c.innerHTML = renderPedidos();
  else if (state.tab === 'reportes') c.innerHTML = renderReportes();
  else if (state.tab === 'usuarios' && isAdmin()) c.innerHTML = renderUsuarios();

  document.getElementById('logoutBtn').onclick = logout;
  attachHandlers();
  if (state.labelProduct) renderLabelModal();
}

function tabBtn(id, label) { return `<button class="${state.tab === id ? 'active' : ''}" data-tab="${id}">${label}</button>`; }
function flashHtml() { return state.flash ? `<div class="flash ${state.flash.type === 'ok' ? 'ok' : 'err'}">${state.flash.msg}</div>` : ''; }

function renderLogin() {
  return `
  <div class="login-wrap">
    <div class="login-card">
      <img src="/img/logo-dumas.jpg" alt="Repuestos Dumas" class="login-logo">
      <h1>Inventario Pro</h1>
      <div class="sub">Inicia sesión para continuar</div>
      <label>Email</label><input id="loginEmail" type="email" placeholder="tu@negocio.com">
      <label>Contraseña</label><input id="loginPassword" type="password" placeholder="••••••••">
      <div class="btn-row"><button class="btn" id="loginBtn" style="width:100%;">Entrar</button></div>
      ${state.loginError ? `<div class="login-error">${state.loginError}</div>` : ''}
    </div>
  </div>`;
}
function attachLoginHandlers() {
  const go = () => login(document.getElementById('loginEmail').value.trim(), document.getElementById('loginPassword').value);
  document.getElementById('loginBtn').onclick = go;
  document.getElementById('loginPassword').onkeydown = (e) => { if (e.key === 'Enter') go(); };
}

function renderDashboard() {
  if (!dashboard) { loadDashboard().then(render); return '<div class="empty">Cargando panel…</div>'; }
  const d = dashboard;
  return `
  <div class="grid-cards">
    <div class="card"><div class="lbl">Productos</div><div class="val">${d.totalProductos}</div></div>
    <div class="card"><div class="lbl">Valor inventario (costo)</div><div class="val">${money(d.valorInventarioCompra)}</div></div>
    <div class="card"><div class="lbl">Valor inventario (venta)</div><div class="val">${money(d.valorInventarioVenta)}</div></div>
    <div class="card good"><div class="lbl">Ganancia histórica</div><div class="val">${money(d.gananciaTotal)}</div></div>
    <div class="card ${d.productosBajoMinimo ? 'warn' : ''}"><div class="lbl">Bajo stock mínimo</div><div class="val">${d.productosBajoMinimo}</div></div>
    <div class="card"><div class="lbl">Ventas de hoy</div><div class="val">${d.ventasHoy}</div></div>
  </div>
  <div class="panel">
    <h2>Movimientos recientes</h2>
    ${d.movimientosRecientes.length === 0 ? '<div class="empty">Aún no hay movimientos registrados.</div>' : `
    <table><thead><tr><th>Fecha</th><th>Producto</th><th>Tipo</th><th>Cant.</th><th>Usuario</th><th>Motivo</th></tr></thead>
    <tbody>${d.movimientosRecientes.map(m => `
      <tr><td class="mono">${fmtDate(m.fecha)}</td><td>${m.producto_nombre}</td>
      <td><span class="tag ${m.tipo.toLowerCase()}">${m.tipo}</span></td>
      <td class="num">${m.cantidad}</td><td>${m.usuario_nombre || '—'}</td><td>${m.motivo || '—'}</td></tr>
    `).join('')}</tbody></table>`}
  </div>`;
}

function renderInventario() {
  const list = listProductos();
  return `
  ${flashHtml()}
  <div class="panel">
    <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;">
      <div><h2>Inventario</h2><div class="hint" style="margin-bottom:0;">${list.length} productos registrados</div></div>
      ${isAdmin() ? `
      <div style="display:flex;gap:8px;">
        <label class="btn ghost" style="cursor:pointer;margin:0;">Importar archivo
          <input type="file" id="importFile" accept=".csv,.xlsx,.xls" style="display:none;">
        </label>
        <button class="btn" id="toggleAdd">${state.showAddForm ? 'Cancelar' : '+ Nuevo producto'}</button>
      </div>` : ''}
    </div>
    ${isAdmin() ? `<div class="hint" style="margin-top:8px;">Importar acepta .csv/.xlsx con columnas: código, nombre, categoría, precio_compra, precio_venta, stock, stock_minimo (solo "nombre" es obligatoria).</div>` : ''}
    ${state.showAddForm ? `
    <div style="margin-top:14px;border-top:1px solid var(--border);padding-top:14px;">
      <div class="row c2">
        <div><label>Nombre</label><input id="f_nombre" placeholder="Ej. Camiseta azul talla M"></div>
        <div><label>Categoría</label><input id="f_categoria" placeholder="Ej. Ropa"></div>
      </div>
      <div class="row c4">
        <div><label>Precio de compra</label><input id="f_precioCompra" type="number" step="0.01" placeholder="0.00"></div>
        <div><label>Precio de venta</label><input id="f_precioVenta" type="number" step="0.01" placeholder="0.00"></div>
        <div><label>Stock inicial</label><input id="f_stock" type="number" placeholder="0"></div>
        <div><label>Stock mínimo</label><input id="f_stockMinimo" type="number" placeholder="0"></div>
      </div>
      <label>Código de barras <span style="text-transform:none;color:var(--dim);">(vacío = se genera automático)</span></label>
      <input id="f_barcode" class="mono" placeholder="Escanear o dejar en blanco">
      <div class="btn-row"><button class="btn green" id="saveProduct">Guardar producto</button></div>
    </div>` : ''}
  </div>
  <div class="panel">
    ${list.length === 0 ? '<div class="empty">No hay productos todavía.</div>' : `
    <table><thead><tr>
      <th>Código</th><th>Nombre</th><th>Categoría</th><th>Compra</th><th>Venta</th><th>Stock</th><th>Mínimo</th>${isAdmin() ? '<th></th>' : ''}
    </tr></thead><tbody>
    ${list.map(p => `
      <tr>
        <td class="code mono">${p.barcode}</td>
        <td>${p.nombre}</td>
        <td>${p.categoria}</td>
        <td class="num">${money(p.precio_compra)}</td>
        <td class="num">${money(p.precio_venta)}</td>
        <td class="num ${p.stock <= p.stock_minimo ? 'low' : ''}">${p.stock}</td>
        <td class="num">${p.stock_minimo}</td>
        ${isAdmin() ? `<td style="white-space:nowrap;">
          <button class="btn ghost small" data-label="${p.barcode}">Etiqueta</button>
          <button class="btn red small" data-del="${p.id}" data-name="${p.nombre}">Eliminar</button>
        </td>` : ''}
      </tr>
    `).join('')}
    </tbody></table>`}
  </div>`;
}

function renderMovimientos() {
  const modeNames = { CARGA: 'Carga (entrada)', DESCARGA: 'Descarga (salida)' };
  return `
  ${flashHtml()}
  <div class="panel">
    <h2>Registrar carga o descarga</h2>
    <div class="hint">Selecciona el modo, luego escanea el código (o escríbelo) y presiona Enter. Un lector de código de barras USB o Bluetooth funciona como teclado.</div>
    <div class="mode-toggle">
      <button class="${state.movMode === 'CARGA' ? 'on carga' : ''}" data-mode="CARGA">Carga · entrada</button>
      <button class="${state.movMode === 'DESCARGA' ? 'on descarga' : ''}" data-mode="DESCARGA">Descarga · salida</button>
    </div>
    <div class="scanbox"><div class="scanline"></div>
      <input id="scanInput" class="mono" placeholder="Escanear código…" autofocus>
    </div>
    <div class="row c2" style="margin-top:4px;">
      <div><label>Cantidad</label><input id="movCantidad" type="number" min="1" value="1"></div>
      <div><label>Motivo (opcional)</label><input id="movMotivo" placeholder="Ej. compra a proveedor, merma, ajuste"></div>
    </div>
    <div class="btn-row"><button class="btn ${state.movMode === 'CARGA' ? 'green' : 'red'}" id="movSubmit">Registrar ${modeNames[state.movMode]}</button></div>
  </div>`;
}

function renderVentas() {
  const totalVenta = state.cart.reduce((s, l) => s + l.cantidad * l.precioVenta, 0);
  const totalGanancia = state.cart.reduce((s, l) => s + l.cantidad * (l.precioVenta - l.precioCompra), 0);
  return `
  ${flashHtml()}
  <div class="panel">
    <h2>Punto de venta</h2>
    <div class="hint">Escanea cada artículo — se agrega al ticket. Al terminar, presiona "Finalizar venta" para descontar el stock y registrar la ganancia.</div>
    <div class="scanbox"><div class="scanline"></div>
      <input id="ventaScan" class="mono" placeholder="Escanear código…" autofocus>
    </div>
    <div style="margin-top:16px;">
      ${state.cart.length === 0 ? '<div class="empty">Ticket vacío.</div>' : state.cart.map(l => `
        <div class="cart-line"><span>${l.nombre}</span><span class="qty">${l.cantidad} × ${money(l.precioVenta)} = ${money(l.cantidad * l.precioVenta)}</span></div>
      `).join('')}
    </div>
    ${state.cart.length ? `
    <div style="margin-top:14px;display:flex;justify-content:space-between;font-family:var(--mono);">
      <span>Total</span><strong>${money(totalVenta)}</strong>
    </div>
    <div style="display:flex;justify-content:space-between;font-family:var(--mono);color:var(--green);font-size:12px;">
      <span>Ganancia estimada</span><span>${money(totalGanancia)}</span>
    </div>
    <div class="btn-row">
      <button class="btn green" id="finVenta">Finalizar venta</button>
      <button class="btn ghost" id="clearCart">Vaciar ticket</button>
    </div>` : ''}
  </div>`;
}

function priceInput(id, field, value) {
  const v = (value === undefined || value === null || isNaN(value)) ? 0 : value;
  return `<input class="mono cellinput" type="number" step="0.01" data-pricefield="${field}" data-id="${id}" value="${v}">`;
}
function renderPrecios() {
  const list = listProductos();
  const tasa = config.tasa_bcv ? Number(config.tasa_bcv) : null;
  return `
  ${flashHtml()}
  <div class="panel">
    <h2>Tasa del dólar — Banco Central de Venezuela</h2>
    <div class="hint">El servidor intenta actualizarla solo, todos los días a las 8:15am (hora de Venezuela), aunque nadie tenga la app abierta — corre en el backend, no en tu navegador. Fuente: dolarapi.com, que replica la tasa oficial del BCV.</div>
    <div class="grid-cards" style="margin-bottom:6px;">
      <div class="card good"><div class="lbl">Tasa BCV actual</div><div class="val">${tasa ? tasa.toFixed(2) + ' Bs' : '—'}</div></div>
      <div class="card"><div class="lbl">Publicada por el BCV</div><div class="val" style="font-size:13px;">${fmtDate(config.tasa_bcv_fecha)}</div></div>
      <div class="card"><div class="lbl">Última verificación</div><div class="val" style="font-size:13px;">${fmtDate(config.tasa_bcv_fetched_at)}</div></div>
    </div>
    <div class="row c2">
      <div><label>Ingresar / corregir tasa manualmente (Bs por USD)</label><input id="manualTasa" type="number" step="0.01" value="${tasa || ''}"></div>
      <div style="display:flex;align-items:flex-end;gap:8px;">
        <button class="btn" id="fetchTasaBtn">Actualizar tasa BCV ahora</button>
        <button class="btn ghost" id="saveManualTasa">Guardar manual</button>
      </div>
    </div>
  </div>
  <div class="panel">
    <h2>Cargar precios de lista desde archivo</h2>
    <div class="hint">Sube un .csv o .xlsx con una columna de código de barras (o nombre) y una columna de precio de lista.</div>
    <input type="file" id="priceFile" accept=".csv,.xlsx,.xls">
  </div>
  <div class="panel">
    <div style="display:flex;justify-content:space-between;align-items:flex-end;flex-wrap:wrap;gap:10px;">
      <div>
        <h2 style="margin-bottom:8px;">Lista de precios</h2>
        <label style="margin-top:0;">% mínimo por defecto <input id="defaultPct" type="number" step="1" style="width:70px;display:inline-block;margin-left:6px;" value="${config.pct_minimo_default}"></label>
      </div>
      <button class="btn ghost" id="recalcAll">Recalcular todos</button>
    </div>
    <div class="hint">Todas las columnas de precio son editables directamente en la tabla.</div>
    ${list.length === 0 ? '<div class="empty">No hay productos todavía.</div>' : `
    <table class="pricing"><thead><tr>
      <th>Código</th><th>Nombre</th>
      <th>Precio lista (USD)</th><th>% mínimo</th>
      <th>Precio mínimo (USD)</th><th>Margen mín. ($)</th>
      <th>Precio +50% (USD)</th><th>Margen 50% ($)</th>
      <th>% descuento</th><th>Precio oferta (USD)</th><th>Ahorro ($)</th>
      <th>Precio lista (Bs)</th><th></th>
    </tr></thead><tbody>
    ${list.map(p => {
      const margenMin = (Number(p.precio_minimo_usd) || 0) - (Number(p.precio_lista) || 0);
      const margen50 = (Number(p.precio_50_usd) || 0) - (Number(p.precio_lista) || 0);
      const ahorro = (Number(p.precio_venta) || 0) - (Number(p.precio_oferta_usd) || 0);
      const bs = tasa ? (Number(p.precio_lista) || 0) * tasa : null;
      return `<tr>
        <td class="code mono">${p.barcode}</td>
        <td>${p.nombre}</td>
        <td>${priceInput(p.id, 'precioLista', p.precio_lista)}</td>
        <td>${priceInput(p.id, 'pctMinimo', p.pct_minimo)}</td>
        <td>${priceInput(p.id, 'precioMinimoUSD', p.precio_minimo_usd)}</td>
        <td class="num">${money(margenMin)}</td>
        <td>${priceInput(p.id, 'precio50USD', p.precio_50_usd)}</td>
        <td class="num">${money(margen50)}</td>
        <td>${priceInput(p.id, 'pctDescuento', p.pct_descuento)}</td>
        <td>${priceInput(p.id, 'precioOfertaUSD', p.precio_oferta_usd)}</td>
        <td class="num">${money(ahorro)}</td>
        <td class="num">${bs !== null ? 'Bs ' + bs.toFixed(2) : '—'}</td>
        <td><button class="btn ghost small" data-recalcrow="${p.id}" title="Recalcular desde precio de lista">↺</button></td>
      </tr>`;
    }).join('')}
    </tbody></table>`}
  </div>`;
}

function renderPedidos() {
  return `
  <div class="panel">
    <h2>Lista de pedidos por hacer</h2>
    <div class="hint">Productos en o por debajo de su stock mínimo. Cantidad sugerida = 2× mínimo − stock actual.</div>
    ${pedidos.length === 0 ? '<div class="empty">No hay productos por debajo del stock mínimo. Todo en orden.</div>' : `
    <table><thead><tr><th>Código</th><th>Producto</th><th>Stock actual</th><th>Mínimo</th><th>Sugerido a pedir</th></tr></thead>
    <tbody>${pedidos.map(p => `
      <tr><td class="mono">${p.barcode}</td><td>${p.nombre}</td>
      <td class="num low">${p.stock}</td><td class="num">${p.stock_minimo}</td>
      <td class="num" style="color:var(--amber);font-weight:700;">${p.sugerido}</td></tr>
    `).join('')}</tbody></table>
    <div class="btn-row"><button class="btn ghost" id="copyPedido">Copiar lista de pedidos</button></div>
    `}
  </div>`;
}

function renderReportes() {
  const d = dashboard || {};
  const max = rotacion.length ? rotacion[0].cantidad : 1;
  const list = listProductos();
  return `
  <div class="grid-cards">
    <div class="card good"><div class="lbl">Ganancia total</div><div class="val">${money(d.gananciaTotal)}</div></div>
    <div class="card"><div class="lbl">Valor inventario (costo)</div><div class="val">${money(d.valorInventarioCompra)}</div></div>
    <div class="card"><div class="lbl">Productos activos</div><div class="val">${d.totalProductos ?? '—'}</div></div>
  </div>
  <div class="panel">
    <h2>Rotación — productos más movidos (ventas + salidas)</h2>
    ${rotacion.length === 0 ? '<div class="empty">Aún no hay datos de rotación.</div>' : rotacion.map(r => `
      <div class="bar-row"><span class="barname">${r.nombre}</span>
        <div class="bar-track"><div class="bar-fill" style="width:${(r.cantidad / max * 100).toFixed(0)}%"></div></div>
        <span class="mono">${r.cantidad}</span>
      </div>
    `).join('')}
  </div>
  <div class="panel">
    <h2>Valor por producto (costo × stock)</h2>
    ${list.length === 0 ? '<div class="empty">Sin productos.</div>' : `
    <table><thead><tr><th>Producto</th><th>Stock</th><th>Costo unit.</th><th>Valor total</th></tr></thead>
    <tbody>${list.slice().sort((a, b) => b.stock * b.precio_compra - a.stock * a.precio_compra).map(p => `
      <tr><td>${p.nombre}</td><td class="num">${p.stock}</td><td class="num">${money(p.precio_compra)}</td><td class="num">${money(p.stock * p.precio_compra)}</td></tr>
    `).join('')}</tbody></table>`}
  </div>`;
}

function renderUsuarios() {
  return `
  ${flashHtml()}
  <div class="panel">
    <div style="display:flex;justify-content:space-between;align-items:center;">
      <div><h2>Usuarios</h2><div class="hint" style="margin-bottom:0;">${usuarios.length} cuentas registradas</div></div>
      <button class="btn" id="toggleUserForm">${state.showUserForm ? 'Cancelar' : '+ Nuevo usuario'}</button>
    </div>
    ${state.showUserForm ? `
    <div style="margin-top:14px;border-top:1px solid var(--border);padding-top:14px;">
      <div class="row c2">
        <div><label>Nombre</label><input id="u_nombre" placeholder="Nombre completo"></div>
        <div><label>Email</label><input id="u_email" type="email" placeholder="empleado@negocio.com"></div>
      </div>
      <div class="row c2">
        <div><label>Contraseña temporal</label><input id="u_password" type="password" placeholder="Mínimo 6 caracteres"></div>
        <div><label>Rol</label><select id="u_rol"><option value="EMPLEADO">Empleado</option><option value="ADMIN">Administrador</option></select></div>
      </div>
      <div class="btn-row"><button class="btn green" id="saveUser">Crear usuario</button></div>
    </div>` : ''}
  </div>
  <div class="panel">
    <table><thead><tr><th>Nombre</th><th>Email</th><th>Rol</th><th>Estado</th><th></th></tr></thead>
    <tbody>${usuarios.map(u => `
      <tr>
        <td>${u.nombre}</td><td class="mono">${u.email}</td>
        <td><span class="tag ${u.rol.toLowerCase()}">${u.rol}</span></td>
        <td>${u.activo ? '<span style="color:var(--green)">Activo</span>' : '<span style="color:var(--red)">Desactivado</span>'}</td>
        <td style="white-space:nowrap;">
          <button class="btn ghost small" data-resetpw="${u.id}">Reset clave</button>
          <button class="btn ${u.activo ? 'red' : 'green'} small" data-toggleactive="${u.id}" data-active="${u.activo}">${u.activo ? 'Desactivar' : 'Activar'}</button>
        </td>
      </tr>
    `).join('')}</tbody></table>
  </div>`;
}

function renderLabelModal() {
  const p = productos.find(x => x.barcode === state.labelProduct);
  if (!p) return;
  const bg = document.createElement('div');
  bg.className = 'modal-bg';
  bg.innerHTML = `
    <div class="modal">
      <div id="printArea" class="label-ticket">
        <div class="pname">${p.nombre}</div>
        <svg id="barcodeSvg"></svg>
        <div class="pprice">${money(p.precio_venta)}</div>
      </div>
      <div class="btn-row">
        <button class="btn" id="printLabel">Imprimir</button>
        <button class="btn ghost" id="closeLabel">Cerrar</button>
      </div>
    </div>`;
  document.body.appendChild(bg);
  try { JsBarcode('#barcodeSvg', p.barcode, { format: 'CODE128', width: 2, height: 50, fontSize: 12, margin: 6 }); } catch (e) {}
  bg.querySelector('#closeLabel').onclick = () => { state.labelProduct = null; bg.remove(); };
  bg.querySelector('#printLabel').onclick = () => window.print();
  bg.addEventListener('click', (e) => { if (e.target === bg) { state.labelProduct = null; bg.remove(); } });
}

/* ---------------- HANDLERS ---------------- */
function attachHandlers() {
  document.querySelectorAll('nav.tabs button').forEach(b => { b.onclick = () => setTab(b.dataset.tab); });

  if (state.tab === 'inventario') {
    const toggle = document.getElementById('toggleAdd');
    if (toggle) toggle.onclick = () => { state.showAddForm = !state.showAddForm; render(); };
    const importInput = document.getElementById('importFile');
    if (importInput) importInput.onchange = (e) => { if (e.target.files[0]) importProductsFromFile(e.target.files[0]); };
    const save = document.getElementById('saveProduct');
    if (save) save.onclick = () => {
      const nombre = document.getElementById('f_nombre').value.trim();
      if (!nombre) { state.flash = { type: 'err', msg: 'El nombre es obligatorio' }; render(); return; }
      addProduct({
        nombre,
        categoria: document.getElementById('f_categoria').value,
        precioCompra: document.getElementById('f_precioCompra').value,
        precioVenta: document.getElementById('f_precioVenta').value,
        stock: document.getElementById('f_stock').value,
        stockMinimo: document.getElementById('f_stockMinimo').value,
        barcode: document.getElementById('f_barcode').value,
      });
    };
    document.querySelectorAll('[data-del]').forEach(b => { b.onclick = () => deleteProduct(b.dataset.del, b.dataset.name); });
    document.querySelectorAll('[data-label]').forEach(b => { b.onclick = () => { state.labelProduct = b.dataset.label; render(); }; });
  }

  if (state.tab === 'movimientos') {
    document.querySelectorAll('[data-mode]').forEach(b => { b.onclick = () => { state.movMode = b.dataset.mode; render(); }; });
    const input = document.getElementById('scanInput');
    const doMove = async () => {
      const code = input.value.trim();
      if (!code) return;
      const qty = document.getElementById('movCantidad').value;
      const motivo = document.getElementById('movMotivo').value;
      const ok = await registrarMovimiento(code, state.movMode, qty, motivo);
      render();
      if (ok) { const el = document.getElementById('scanInput'); if (el) { el.value = ''; el.focus(); } }
    };
    if (input) { input.focus(); input.onkeydown = (e) => { if (e.key === 'Enter') doMove(); }; }
    const submit = document.getElementById('movSubmit');
    if (submit) submit.onclick = doMove;
  }

  if (state.tab === 'ventas') {
    const input = document.getElementById('ventaScan');
    if (input) {
      input.focus();
      input.onkeydown = (e) => { if (e.key === 'Enter') { addToCart(input.value.trim()); input.value = ''; } };
    }
    const fin = document.getElementById('finVenta');
    if (fin) fin.onclick = finalizarVenta;
    const clear = document.getElementById('clearCart');
    if (clear) clear.onclick = () => { state.cart = []; render(); };
  }

  if (state.tab === 'precios') {
    const fetchBtn = document.getElementById('fetchTasaBtn');
    if (fetchBtn) fetchBtn.onclick = fetchTasaBCV;
    const saveManual = document.getElementById('saveManualTasa');
    if (saveManual) saveManual.onclick = () => {
      const v = parseFloat(document.getElementById('manualTasa').value) || 0;
      if (!v) { state.flash = { type: 'err', msg: 'Ingresa un valor de tasa válido.' }; render(); return; }
      saveManualTasa(v);
    };
    const fileInput = document.getElementById('priceFile');
    if (fileInput) fileInput.onchange = (e) => { if (e.target.files[0]) importPreciosFromFile(e.target.files[0]); };
    const defaultPct = document.getElementById('defaultPct');
    if (defaultPct) defaultPct.onchange = () => saveDefaultPct(parseFloat(defaultPct.value) || 0);
    const recalcAllBtn = document.getElementById('recalcAll');
    if (recalcAllBtn) recalcAllBtn.onclick = recalcAll;
    document.querySelectorAll('[data-pricefield]').forEach(inp => {
      inp.onchange = () => updatePriceField(inp.dataset.id, inp.dataset.pricefield, inp.value);
    });
    document.querySelectorAll('[data-recalcrow]').forEach(b => { b.onclick = () => recalcRow(b.dataset.recalcrow); });
  }

  if (state.tab === 'pedidos') {
    const copy = document.getElementById('copyPedido');
    if (copy) copy.onclick = () => {
      const text = pedidos.map(p => `${p.nombre} (${p.barcode}) — pedir ${p.sugerido}`).join('\n');
      navigator.clipboard.writeText(text || 'Sin pedidos pendientes.').then(() => {
        state.flash = { type: 'ok', msg: 'Lista copiada al portapapeles.' };
        render();
      });
    };
  }

  if (state.tab === 'usuarios') {
    const toggle = document.getElementById('toggleUserForm');
    if (toggle) toggle.onclick = () => { state.showUserForm = !state.showUserForm; render(); };
    const save = document.getElementById('saveUser');
    if (save) save.onclick = () => createUser({
      nombre: document.getElementById('u_nombre').value.trim(),
      email: document.getElementById('u_email').value.trim(),
      password: document.getElementById('u_password').value,
      rol: document.getElementById('u_rol').value
    });
    document.querySelectorAll('[data-resetpw]').forEach(b => { b.onclick = () => resetUserPassword(b.dataset.resetpw); });
    document.querySelectorAll('[data-toggleactive]').forEach(b => {
      b.onclick = () => toggleUserActive(b.dataset.toggleactive, b.dataset.active !== 'true');
    });
  }
}

boot();
