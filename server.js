require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

const { scheduleDailyBCVUpdate } = require('./lib/bcv');

const app = express();
app.use(cors());
app.use(express.json({ limit: '5mb' }));

app.use('/api/auth', require('./routes/auth'));
app.use('/api/usuarios', require('./routes/usuarios'));
app.use('/api/productos', require('./routes/productos'));
app.use('/api/movimientos', require('./routes/movimientos'));
app.use('/api/reportes', require('./routes/reportes'));
app.use('/api/config', require('./routes/config'));

app.get('/api/health', (req, res) => res.json({ ok: true, ts: new Date().toISOString() }));

// Frontend estático
app.use(express.static(path.join(__dirname, '..', 'public')));
app.get('*', (req, res) => {
  if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'Ruta no encontrada.' });
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

// Manejador de errores genérico
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Error interno del servidor.' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Inventario Pro escuchando en el puerto ${PORT}`);
  scheduleDailyBCVUpdate();
});
