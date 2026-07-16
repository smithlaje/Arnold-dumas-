const express = require('express');
const db = require('../lib/db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

// GET /api/movimientos?limit=50&tipo=VENTA — historial reciente
router.get('/', async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 50, 500);
  let query = db('movimientos as m')
    .join('productos as p', 'p.id', 'm.producto_id')
    .leftJoin('usuarios as u', 'u.id', 'm.usuario_id')
    .select('m.*', 'p.nombre as producto_nombre', 'p.barcode', 'u.nombre as usuario_nombre')
    .orderBy('m.fecha', 'desc')
    .limit(limit);
  if (req.query.tipo) query = query.where('m.tipo', req.query.tipo);
  const rows = await query;
  res.json(rows);
});

async function registrarMovimiento(trx, { barcode, tipo, cantidad, motivo, usuarioId }) {
  const producto = await trx('productos').where({ barcode, activo: true }).first();
  if (!producto) {
    const err = new Error(`Código no encontrado: ${barcode}`);
    err.status = 404;
    throw err;
  }
  cantidad = Math.max(1, parseInt(cantidad) || 1);

  if ((tipo === 'DESCARGA' || tipo === 'VENTA') && producto.stock < cantidad) {
    const err = new Error(`Stock insuficiente de "${producto.nombre}" (disponible: ${producto.stock})`);
    err.status = 409;
    throw err;
  }

  const nuevoStock = tipo === 'CARGA' ? producto.stock + cantidad : producto.stock - cantidad;
  await trx('productos').where({ id: producto.id }).update({ stock: nuevoStock, actualizado_en: new Date() });

  const precioUnit = tipo === 'VENTA' ? Number(producto.precio_venta) : Number(producto.precio_compra);
  const ganancia = tipo === 'VENTA' ? (Number(producto.precio_venta) - Number(producto.precio_compra)) * cantidad : 0;

  const [mov] = await trx('movimientos').insert({
    producto_id: producto.id,
    usuario_id: usuarioId,
    tipo,
    cantidad,
    precio_unit: precioUnit,
    ganancia,
    motivo: motivo || null
  }).returning('*');

  return { movimiento: mov, producto: { ...producto, stock: nuevoStock } };
}

// POST /api/movimientos — carga o descarga individual (escaneo)
router.post('/', async (req, res) => {
  const { barcode, tipo, cantidad, motivo } = req.body || {};
  if (!barcode || !['CARGA', 'DESCARGA', 'AJUSTE'].includes(tipo)) {
    return res.status(400).json({ error: 'Faltan datos: barcode y tipo (CARGA/DESCARGA/AJUSTE).' });
  }
  try {
    const result = await db.transaction((trx) =>
      registrarMovimiento(trx, { barcode, tipo, cantidad, motivo, usuarioId: req.user.id })
    );
    res.status(201).json(result);
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message || 'Error registrando el movimiento.' });
  }
});

// POST /api/movimientos/venta — finaliza una venta con varias líneas (carrito)
// body: { lineas: [{barcode, cantidad}], motivo }
router.post('/venta', async (req, res) => {
  const lineas = Array.isArray(req.body.lineas) ? req.body.lineas : [];
  if (lineas.length === 0) return res.status(400).json({ error: 'El ticket está vacío.' });

  try {
    const resultados = await db.transaction(async (trx) => {
      const out = [];
      for (const linea of lineas) {
        const r = await registrarMovimiento(trx, {
          barcode: linea.barcode, tipo: 'VENTA', cantidad: linea.cantidad,
          motivo: req.body.motivo || 'Venta mostrador', usuarioId: req.user.id
        });
        out.push(r);
      }
      return out;
    });
    const total = resultados.reduce((s, r) => s + r.movimiento.precio_unit * r.movimiento.cantidad, 0);
    const ganancia = resultados.reduce((s, r) => s + Number(r.movimiento.ganancia), 0);
    res.status(201).json({ resultados, total, ganancia });
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message || 'Error registrando la venta.' });
  }
});

module.exports = router;
