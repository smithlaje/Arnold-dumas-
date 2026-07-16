const cron = require('node-cron');
const db = require('./db');

const BCV_ENDPOINT = 'https://ve.dolarapi.com/v1/dolares/oficial';

async function fetchAndSaveTasaBCV() {
  const res = await fetch(BCV_ENDPOINT);
  if (!res.ok) throw new Error(`BCV endpoint respondió HTTP ${res.status}`);
  const d = await res.json();
  const tasa = d.promedio || d.venta || d.compra;
  if (!tasa) throw new Error('La respuesta de la fuente no trae una tasa válida');

  await db('config').where({ id: 1 }).update({
    tasa_bcv: tasa,
    tasa_bcv_fecha: d.fechaActualizacion ? new Date(d.fechaActualizacion) : new Date(),
    tasa_bcv_fetched_at: new Date(),
    tasa_bcv_fuente: `${d.fuente || 'BCV'} vía dolarapi.com`
  });
  return tasa;
}

// Se ejecuta todos los días a las 8:15am hora de Venezuela (America/Caracas, UTC-4)
function scheduleDailyBCVUpdate() {
  cron.schedule('15 8 * * *', async () => {
    try {
      const tasa = await fetchAndSaveTasaBCV();
      console.log(`[BCV] Tasa actualizada automáticamente: ${tasa} Bs/USD`);
    } catch (e) {
      console.error('[BCV] Falló la actualización diaria automática:', e.message);
    }
  }, { timezone: 'America/Caracas' });
}

module.exports = { fetchAndSaveTasaBCV, scheduleDailyBCVUpdate };
