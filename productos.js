const express = require('express');
const db = require('../lib/db');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

function genBarcode() {
  const t = Date.now().toString(36).toUpperCase();
  const r = Math.random().toString(36).slice(2, 5).toUpperCase();
  return 'INV' + t + r;
}

function recomputeSuggested(producto, pctMinimoDefault) {
  const lista = Number(producto.precio_lista) || 0;
  const pct = producto.pct_minimo != null ? Number(producto.pct_minimo) : pctMinimoDefault;
  return {
    precio_minimo_usd: +(lista * (1 + pct / 100)).toFixed(2),
    precio_50_usd: +(lista * 1.5).toFixed(2)
  };
}

function recomputeOferta(producto) {
  const venta = Number(producto.precio_venta) || 0;
  const pct = Number(producto.pct_descuento) || 0;
  return { precio_oferta_usd: +(venta * (1 - pct / 100)).toFixed(2) };
}

// GET /api/productos — listado completo (ambos roles)
router.get('/', async (req, res) => {
  const productos = await db('productos').where({ activo: true }).orderBy('nombre');
  res.json(productos);
});

// GET /api/productos/:barcode — buscar uno por código (para escaneo)
router.get('/:barcode', async (req, res) => {
  const producto = await db('productos').where({ barcode: req.params.barcode, activo: true }).first();
  if (!producto) return res.status(404).json({ error: 'Código no encontrado.' });
  res.json(producto);
});

// POST /api/productos — crear (solo ADMIN)
router.post('/', requireRole('ADMIN'), async (req, res) => {
  const { nombre, categoria, precioCompra, precioVenta, stock, stockMinimo, barcode } = req.body || {};
  if (!nombre || !nombre.trim()) return res.status(400).json({ error: 'El nombre es obligatorio.' });

  const code = (barcode && barcode.trim()) || genBarcode();
  const existe = await db('productos').where({ barcode: code }).first();
  if (existe) return res.status(409).json({ error: `Ese código ya existe: ${code}` });

  const config = await db('config').where({ id: 1 }).first();
  const [row] = await db('productos').insert({
    barcode: code,
    nombre: nombre.trim(),
    categoria: (categoria || 'General').trim(),
    precio_compra: Number(precioCompra) || 0,
    precio_venta: Number(precioVenta) || 0,
    stock: parseInt(stock) || 0,
    stock_minimo: parseInt(stockMinimo) || 0,
    pct_minimo: config.pct_minimo_default
  }).returning('*');
  res.status(201).json(row);
});

// PATCH /api/productos/:id — editar campos (solo ADMIN)
router.patch('/:id', requireRole('ADMIN'), async (req, res) => {
  const allowed = ['nombre', 'categoria', 'precioCompra', 'precioVenta', 'stock', 'stockMinimo',
    'precioLista', 'pctMinimo', 'precioMinimoUSD', 'precio50USD', 'pctDescuento', 'precioOfertaUSD'];
  const map = {
    nombre: 'nombre', categoria: 'categoria', precioCompra: 'precio_compra', precioVenta: 'precio_venta',
    stock: 'stock', stockMinimo: 'stock_minimo', precioLista: 'precio_lista', pctMinimo: 'pct_minimo',
    precioMinimoUSD: 'precio_minimo_usd', precio50USD: 'precio_50_usd',
    pctDescuento: 'pct_descuento', precioOfertaUSD: 'precio_oferta_usd'
  };
  const update = {};
  for (const key of allowed) {
    if (req.body[key] !== undefined) update[map[key]] = req.body[key];
  }
  if (Object.keys(update).length === 0) return res.status(400).json({ error: 'Nada que actualizar.' });

  const tocaSugerido = update.precio_lista !== undefined || update.pct_minimo !== undefined;
  const tocaOferta = update.precio_venta !== undefined || update.pct_descuento !== undefined;
  if (tocaSugerido || tocaOferta) {
    const actual = await db('productos').where({ id: req.params.id }).first();
    if (!actual) return res.status(404).json({ error: 'Producto no encontrado.' });
    const merged = { ...actual, ...update };
    if (tocaSugerido) {
      const config = await db('config').where({ id: 1 }).first();
      const suggested = recomputeSuggested(merged, config.pct_minimo_default);
      if (req.body.precioMinimoUSD === undefined) update.precio_minimo_usd = suggested.precio_minimo_usd;
      if (req.body.precio50USD === undefined) update.precio_50_usd = suggested.precio_50_usd;
    }
    if (tocaOferta) {
      const oferta = recomputeOferta(merged);
      if (req.body.precioOfertaUSD === undefined) update.precio_oferta_usd = oferta.precio_oferta_usd;
    }
  }
  update.actualizado_en = new Date();

  const [row] = await db('productos').where({ id: req.params.id }).update(update).returning('*');
  if (!row) return res.status(404).json({ error: 'Producto no encontrado.' });
  res.json(row);
});

// DELETE /api/productos/:id — baja lógica (solo ADMIN)
router.delete('/:id', requireRole('ADMIN'), async (req, res) => {
  const count = await db('productos').where({ id: req.params.id }).update({ activo: false });
  if (!count) return res.status(404).json({ error: 'Producto no encontrado.' });
  res.json({ ok: true });
});

// GET /api/productos-meta/pedidos — productos bajo stock mínimo
router.get('/reportes/pedidos', async (req, res) => {
  const productos = await db('productos')
    .where('activo', true)
    .whereRaw('stock <= stock_minimo')
    .orderBy('nombre');
  const conSugerido = productos.map(p => ({
    ...p,
    sugerido: Math.max(p.stock_minimo * 2 - p.stock, p.stock_minimo || 1)
  }));
  res.json(conSugerido);
});

// POST /api/productos/importar — creación/actualización masiva desde archivo (solo ADMIN)
// Espera un array ya parseado en el cliente: [{codigo,nombre,categoria,precioCompra,precioVenta,stock,stockMinimo}]
router.post('/acciones/importar', requireRole('ADMIN'), async (req, res) => {
  const filas = Array.isArray(req.body.filas) ? req.body.filas : [];
  const config = await db('config').where({ id: 1 }).first();
  let creados = 0, actualizados = 0, omitidos = 0;

  await db.transaction(async (trx) => {
    for (const fila of filas) {
      const nombre = (fila.nombre || '').toString().trim();
      if (!nombre) { omitidos++; continue; }
      let codigo = (fila.codigo || '').toString().trim() || genBarcode();
      const existente = await trx('productos').where({ barcode: codigo }).first();

      const values = {
        nombre,
        categoria: (fila.categoria || 'General').toString().trim() || 'General'
      };
      if (fila.precioCompra !== undefined && fila.precioCompra !== '') values.precio_compra = Number(fila.precioCompra) || 0;
      if (fila.precioVenta !== undefined && fila.precioVenta !== '') values.precio_venta = Number(fila.precioVenta) || 0;
      if (fila.stock !== undefined && fila.stock !== '') values.stock = parseInt(fila.stock) || 0;
      if (fila.stockMinimo !== undefined && fila.stockMinimo !== '') values.stock_minimo = parseInt(fila.stockMinimo) || 0;

      if (existente) {
        await trx('productos').where({ id: existente.id }).update({ ...values, actualizado_en: new Date() });
        actualizados++;
      } else {
        await trx('productos').insert({ barcode: codigo, pct_minimo: config.pct_minimo_default, ...values });
        creados++;
      }
    }
  });

  res.json({ creados, actualizados, omitidos });
});

// POST /api/productos/acciones/precios — actualización masiva de precio de lista (solo ADMIN)
// Espera: [{codigo, nombre, precioLista}]
router.post('/acciones/precios', requireRole('ADMIN'), async (req, res) => {
  const filas = Array.isArray(req.body.filas) ? req.body.filas : [];
  const config = await db('config').where({ id: 1 }).first();
  let actualizados = 0;
  const noEncontrados = [];

  await db.transaction(async (trx) => {
    for (const fila of filas) {
      const precio = parseFloat(String(fila.precioLista).replace(',', '.'));
      if (!precio || isNaN(precio)) continue;
      let producto = null;
      if (fila.codigo) producto = await trx('productos').where({ barcode: fila.codigo.toString().trim() }).first();
      if (!producto && fila.nombre) {
        producto = await trx('productos').whereRaw('LOWER(nombre) = LOWER(?)', [fila.nombre.toString().trim()]).first();
      }
      if (!producto) { noEncontrados.push(fila.codigo || fila.nombre || '(fila sin identificar)'); continue; }

      const suggested = recomputeSuggested({ ...producto, precio_lista: precio }, config.pct_minimo_default);
      await trx('productos').where({ id: producto.id }).update({
        precio_lista: precio,
        precio_minimo_usd: suggested.precio_minimo_usd,
        precio_50_usd: suggested.precio_50_usd,
        actualizado_en: new Date()
      });
      actualizados++;
    }
  });

  res.json({ actualizados, noEncontrados });
});

// POST /api/productos/acciones/recalcular — recalcula precio mínimo y +50% de todos (solo ADMIN)
router.post('/acciones/recalcular', requireRole('ADMIN'), async (req, res) => {
  const config = await db('config').where({ id: 1 }).first();
  const productos = await db('productos').where({ activo: true });
  await db.transaction(async (trx) => {
    for (const p of productos) {
      const suggested = recomputeSuggested(p, config.pct_minimo_default);
      const oferta = recomputeOferta(p);
      await trx('productos').where({ id: p.id }).update({
        precio_minimo_usd: suggested.precio_minimo_usd,
        precio_50_usd: suggested.precio_50_usd,
        precio_oferta_usd: oferta.precio_oferta_usd
      });
    }
  });
  res.json({ ok: true, actualizados: productos.length });
});

module.exports = router;
