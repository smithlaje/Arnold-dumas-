require('dotenv').config();
const bcrypt = require('bcryptjs');
const db = require('../src/lib/db');

async function main() {
  const email = (process.env.ADMIN_EMAIL || 'admin@negocio.com').toLowerCase().trim();
  const password = process.env.ADMIN_PASSWORD || 'CambiaEstaClave123';
  const nombre = process.env.ADMIN_NOMBRE || 'Administrador';

  const existente = await db('usuarios').where({ email }).first();
  if (existente) {
    console.log(`Ya existe un usuario con el email ${email}. No se creó ninguno nuevo.`);
    process.exit(0);
  }

  const password_hash = await bcrypt.hash(password, 10);
  await db('usuarios').insert({ nombre, email, password_hash, rol: 'ADMIN' });
  console.log('Usuario administrador creado:');
  console.log(`  Email:    ${email}`);
  console.log(`  Password: ${password}`);
  console.log('Inicia sesión y cambia la contraseña desde la pestaña Usuarios.');
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
