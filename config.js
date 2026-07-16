const express = require('express');
const db = require('../lib/db');
const { requireAuth, requireRole } = require('../middleware/auth');
const { fetchAndSaveTasaBCV } = require('../lib/bcv');

const router = express.Router();
router.use(requireAuth);

router.get('/', async (req, res) => {
  const config = await db('config').where({ id: 1 }).first();
  res.json(config);
});

router.patch('/', requireRole('ADMIN'), async (req, res) => {
  const update = {};
  if (req.body.pctMinimoDefault !== undefined) update.pct_minimo_default = req.body.pctMinimoDefault;
  if (req.body.tasaBCV !== undefined) {
    update.tasa_bcv = req.body.tasaBCV;
    update.tasa_bcv_fecha = new Date();
    update.tasa_bcv_fetched_at = new Date();
    update.tasa_bcv_fuente = 'Ingresada manualmente';
  }
  if (Object.keys(update).length === 0) return res.status(400).json({ error: 'Nada que actualizar.' });
  const [row] = await db('config').where({ id: 1 }).update(update).returning('*');
  res.json(row);
});

// POST /api/config/tasa-bcv/actualizar — fuerza la consulta a la fuente ahora mismo (ADMIN)
router.post('/tasa-bcv/actualizar', requireRole('ADMIN'), async (req, res) => {
  try {
    const tasa = await fetchAndSaveTasaBCV();
    const config = await db('config').where({ id: 1 }).first();
    res.json({ ok: true, tasa, config });
  } catch (e) {
    res.status(502).json({ error: 'No se pudo conectar con la fuente de la tasa BCV: ' + e.message });
  }
});

module.exports = router;
