const express = require('express');
const db = require('../lib/db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

router.get('/dashboard', async (req, res) => {
  const [productos] = await db('productos').where({ activo: true }).count({ n: '*' });
  const valorCompra = await db('productos').where({ activo: true }).sum({ v: db.raw('stock * precio_compra') }).first();
  const valorVenta = await db('productos').where({ activo: true }).sum({ v: db.raw('stock * precio_venta') }).first();
  const bajoMinimo = await db('productos').where('activo', true).whereRaw('stock <= stock_minimo').count({ n: '*' }).first();
  const gananciaTotal = await db('movimientos').where({ tipo: 'VENTA' }).sum({ g: 'ganancia' }).first();

  const hoyInicio = new Date(); hoyInicio.setHours(0, 0, 0, 0);
  const ventasHoy = await db('movimientos').where({ tipo: 'VENTA' }).where('fecha', '>=', hoyInicio);

  const recientes = await db('movimientos as m')
    .join('productos as p', 'p.id', 'm.producto_id')
    .leftJoin('usuarios as u', 'u.id', 'm.usuario_id')
    .select('m.*', 'p.nombre as producto_nombre', 'u.nombre as usuario_nombre')
    .orderBy('m.fecha', 'desc').limit(8);

  res.json({
    totalProductos: Number(productos.n),
    valorInventarioCompra: Number(valorCompra.v) || 0,
    valorInventarioVenta: Number(valorVenta.v) || 0,
    productosBajoMinimo: Number(bajoMinimo.n),
    gananciaTotal: Number(gananciaTotal.g) || 0,
    ventasHoy: ventasHoy.length,
    ingresosHoy: ventasHoy.reduce((s, m) => s + Number(m.precio_unit) * m.cantidad, 0),
    gananciaHoy: ventasHoy.reduce((s, m) => s + Number(m.ganancia), 0),
    movimientosRecientes: recientes
  });
});

router.get('/rotacion', async (req, res) => {
  const rows = await db('movimientos as m')
    .join('productos as p', 'p.id', 'm.producto_id')
    .whereIn('m.tipo', ['VENTA', 'DESCARGA'])
    .groupBy('p.nombre')
    .select('p.nombre')
    .sum({ cantidad: 'm.cantidad' })
    .orderBy('cantidad', 'desc')
    .limit(10);
  res.json(rows.map(r => ({ nombre: r.nombre, cantidad: Number(r.cantidad) })));
});

// GET /api/reportes/historial-ventas?dias=60 — ventas agrupadas por día (para vista tipo calendario)
router.get('/historial-ventas', async (req, res) => {
  const dias = Math.min(parseInt(req.query.dias) || 60, 365);
  const desde = new Date();
  desde.setDate(desde.getDate() - dias);
  desde.setHours(0, 0, 0, 0);

  const ventas = await db('movimientos as m')
    .join('productos as p', 'p.id', 'm.producto_id')
    .leftJoin('usuarios as u', 'u.id', 'm.usuario_id')
    .where('m.tipo', 'VENTA')
    .where('m.fecha', '>=', desde)
    .select('m.*', 'p.nombre as producto_nombre', 'p.barcode', 'u.nombre as usuario_nombre')
    .orderBy('m.fecha', 'desc');

  const porDia = {};
  for (const v of ventas) {
    const dia = new Date(v.fecha).toISOString().slice(0, 10); // YYYY-MM-DD
    if (!porDia[dia]) porDia[dia] = { fecha: dia, monto: 0, ganancia: 0, cantidadVentas: 0, movimientos: [] };
    porDia[dia].monto += Number(v.precio_unit) * v.cantidad;
    porDia[dia].ganancia += Number(v.ganancia);
    porDia[dia].cantidadVentas += 1;
    porDia[dia].movimientos.push(v);
  }
  const lista = Object.values(porDia).sort((a, b) => b.fecha.localeCompare(a.fecha));
  res.json(lista);
});

module.exports = router;
