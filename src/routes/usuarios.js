const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../lib/db');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth, requireRole('ADMIN'));

router.get('/', async (req, res) => {
  const usuarios = await db('usuarios')
    .select('id', 'nombre', 'email', 'rol', 'activo', 'creado_en')
    .orderBy('nombre');
  res.json(usuarios);
});

router.post('/', async (req, res) => {
  const { nombre, email, password, rol } = req.body || {};
  if (!nombre || !email || !password) return res.status(400).json({ error: 'Nombre, email y contraseña son obligatorios.' });
  if (password.length < 6) return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres.' });

  const existe = await db('usuarios').where({ email: email.toLowerCase().trim() }).first();
  if (existe) return res.status(409).json({ error: 'Ya existe un usuario con ese email.' });

  const password_hash = await bcrypt.hash(password, 10);
  const [row] = await db('usuarios').insert({
    nombre: nombre.trim(),
    email: email.toLowerCase().trim(),
    password_hash,
    rol: rol === 'ADMIN' ? 'ADMIN' : 'EMPLEADO'
  }).returning(['id', 'nombre', 'email', 'rol', 'activo']);

  res.status(201).json(row);
});

router.patch('/:id', async (req, res) => {
  const { activo, rol, nombre } = req.body || {};
  const update = {};
  if (typeof activo === 'boolean') update.activo = activo;
  if (rol === 'ADMIN' || rol === 'EMPLEADO') update.rol = rol;
  if (nombre) update.nombre = nombre.trim();
  if (Object.keys(update).length === 0) return res.status(400).json({ error: 'Nada que actualizar.' });

  if (req.user.id === Number(req.params.id) && update.activo === false) {
    return res.status(400).json({ error: 'No puedes desactivar tu propia cuenta.' });
  }

  const [row] = await db('usuarios').where({ id: req.params.id }).update(update)
    .returning(['id', 'nombre', 'email', 'rol', 'activo']);
  if (!row) return res.status(404).json({ error: 'Usuario no encontrado.' });
  res.json(row);
});

router.post('/:id/reset-password', async (req, res) => {
  const { password } = req.body || {};
  if (!password || password.length < 6) return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres.' });
  const password_hash = await bcrypt.hash(password, 10);
  const count = await db('usuarios').where({ id: req.params.id }).update({ password_hash });
  if (!count) return res.status(404).json({ error: 'Usuario no encontrado.' });
  res.json({ ok: true });
});

module.exports = router;
