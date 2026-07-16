const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../lib/db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

router.post('/login', async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'Email y contraseña son obligatorios.' });

  const user = await db('usuarios').where({ email: email.toLowerCase().trim() }).first();
  if (!user || !user.activo) return res.status(401).json({ error: 'Credenciales inválidas.' });

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) return res.status(401).json({ error: 'Credenciales inválidas.' });

  const payload = { id: user.id, nombre: user.nombre, email: user.email, rol: user.rol };
  const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '12h' });
  res.json({ token, usuario: payload });
});

router.get('/me', requireAuth, (req, res) => {
  res.json({ usuario: req.user });
});

module.exports = router;
