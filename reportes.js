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

module.exports = router;
