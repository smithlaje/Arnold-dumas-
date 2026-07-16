# Inventario Pro

Sistema de inventario, ventas, precios y control de acceso por usuario, listo para desplegar como una app web real (accesible desde PC o teléfono, con tu propio dominio si quieres).

## Qué incluye

- **Login con usuarios y roles** — cada empleado tiene su propia cuenta. `ADMIN` puede todo; `EMPLEADO` puede registrar cargas, descargas y ventas, y ver reportes/pedidos, pero no editar productos, precios ni usuarios.
- **Inventario**: alta de productos, código de barras único (generado o escaneado), importación masiva desde `.csv`/`.xlsx`.
- **Carga / Descarga**: pensado para lector de código de barras USB o Bluetooth (funciona como teclado).
- **Ventas**: ticket por escaneo, descuenta stock y calcula ganancia automáticamente.
- **Precios**: precio de lista, % mínimo, precio mínimo, +50%, márgenes en dólares y conversión a bolívares — todas las columnas editables, y actualizables en lote por archivo.
- **Tasa BCV automática**: el servidor consulta la tasa oficial todos los días a las 8:15am (hora de Venezuela) **aunque nadie tenga la app abierta**, porque corre en el backend con una tarea programada (`node-cron`), no en el navegador. También se puede forzar o ingresar manualmente.
- **Pedidos**: lista automática de productos bajo su stock mínimo, con cantidad sugerida.
- **Reportes**: ganancia total, rotación de productos, valor de inventario.

## Stack técnico

- Backend: Node.js + Express + Knex (query builder, sin binarios nativos) + PostgreSQL
- Autenticación: JWT + contraseñas con bcrypt
- Frontend: HTML/CSS/JS plano servido como archivos estáticos por el mismo servidor (sin paso de build, más fácil de mantener)
- Tarea programada: `node-cron` para la tasa BCV diaria

Todo vive en **un solo servicio** (no necesitas separar frontend y backend), lo que simplifica mucho el hosting gratuito/económico.

---

## Desplegar en Railway (recomendado — más simple)

1. Crea una cuenta en [railway.com](https://railway.com) (tiene plan gratuito con créditos iniciales, luego es de pago por uso — para una app pequeña como esta suele rondar unos pocos dólares al mes).
2. Sube este proyecto a un repositorio de **GitHub** (créalo en github.com/new, luego `git init && git add . && git commit -m "inicial" && git remote add origin <tu-repo> && git push -u origin main`).
3. En Railway: **New Project → Deploy from GitHub repo** → autoriza el acceso y selecciona el repositorio. Railway detecta que es Node.js automáticamente (usa Railpack/Nixpacks) y no necesitas configurar nada de build.
4. Agrega la base de datos: click derecho en el lienzo del proyecto (o el botón **Create**) → **Database → Add PostgreSQL**. Railway la crea en segundos.
5. Ve a tu servicio web → pestaña **Variables** → agrega:
   - `DATABASE_URL` → usa **"Add Reference Variable"** y selecciona la del servicio Postgres (o escribe manualmente `${{Postgres.DATABASE_URL}}`) — así Railway la mantiene sincronizada si la base cambia.
   - `JWT_SECRET` → una cadena larga y aleatoria (genera una con `openssl rand -hex 32` en tu terminal, o cualquier texto largo random).
   - `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `ADMIN_NOMBRE` → datos del primer usuario administrador.
6. Railway construye y despliega solo. En **Deploy Logs** deberías ver `Inventario Pro escuchando en el puerto ...` — eso confirma que `npm start` corrió las migraciones y arrancó el servidor.
7. Crea el primer usuario administrador: abre la terminal del servicio (ícono de terminal en el servicio, o instala el CLI de Railway y corre `railway run npm run seed` desde tu PC) y ejecuta `npm run seed` una sola vez.
8. Genera la URL pública: en tu servicio → **Settings → Networking → Generate Domain**. Te da algo como `algo.up.railway.app` — ábrelo desde tu PC o tu teléfono, es la misma app y los mismos datos en ambos.
9. Opcional: en el mismo panel de **Networking** puedes conectar un dominio propio.

**Nota técnica:** el servidor ya está configurado para escuchar en `0.0.0.0` (requisito de Railway) y para usar conexión segura (SSL) automáticamente contra la base de datos cuando no es local — no necesitas tocar nada de eso.

## Desplegar en Render (alternativa)

1. Sube el proyecto a GitHub, igual que arriba.
2. En [render.com](https://render.com): **New → Web Service**, conecta el repo.
   - Build command: `npm install`
   - Start command: `npm start`
3. **New → PostgreSQL** para crear la base de datos gratuita. Copia su "Internal Database URL".
4. En el Web Service, pestaña **Environment**, agrega `DATABASE_URL` (la que copiaste), `JWT_SECRET`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `ADMIN_NOMBRE`.
5. Al desplegar, `npm start` corre las migraciones solo. Luego corre el seed una vez desde la pestaña **Shell** del servicio: `npm run seed`.
6. Render también te da una URL pública gratis (`algo.onrender.com`); el plan gratuito "duerme" el servicio tras inactividad y tarda unos segundos en despertar — si eso te molesta, el plan pago económico lo evita.

---

## Desarrollo local (para probar cambios antes de subir)

Requiere Node.js 18+ y PostgreSQL instalado.

```bash
npm install
cp .env.example .env      # edita DATABASE_URL con tu Postgres local
npm run migrate           # crea las tablas
npm run seed               # crea el usuario administrador inicial
npm run dev                 # http://localhost:3000
```

## Primer ingreso

Usa el `ADMIN_EMAIL` / `ADMIN_PASSWORD` que configuraste en las variables de entorno. Una vez adentro, ve a la pestaña **Usuarios** para crear una cuenta por cada empleado y cambiar tu propia contraseña (con "Reset clave").

## Notas importantes

- **Accede igual desde PC o teléfono**: es una página web normal — ábrela en cualquier navegador con la URL que te dé Railway/Render. No requiere instalar nada.
- **Lector de código de barras**: conecta el lector USB (PC) o Bluetooth (teléfono/PC); actúa como teclado, así que solo necesitas tener el cursor en el campo de escaneo.
- **Cambia `JWT_SECRET`** por un valor propio y largo antes de ir a producción — si alguien lo conoce, puede falsificar sesiones.
- **Cambia la contraseña del administrador** después del primer ingreso.
- La tasa BCV depende de que el servidor tenga salida a internet hacia `ve.dolarapi.com`; en Railway/Render esto funciona sin configuración adicional.
