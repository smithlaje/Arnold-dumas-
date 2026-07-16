exports.up = function (knex) {
  return knex.schema
    .createTable('usuarios', (t) => {
      t.increments('id').primary();
      t.string('nombre').notNullable();
      t.string('email').notNullable().unique();
      t.string('password_hash').notNullable();
      t.enu('rol', ['ADMIN', 'EMPLEADO']).notNullable().defaultTo('EMPLEADO');
      t.boolean('activo').notNullable().defaultTo(true);
      t.timestamp('creado_en').defaultTo(knex.fn.now());
    })
    .createTable('productos', (t) => {
      t.increments('id').primary();
      t.string('barcode').notNullable().unique();
      t.string('nombre').notNullable();
      t.string('categoria').notNullable().defaultTo('General');
      t.decimal('precio_compra', 12, 2).notNullable().defaultTo(0);
      t.decimal('precio_venta', 12, 2).notNullable().defaultTo(0);
      t.integer('stock').notNullable().defaultTo(0);
      t.integer('stock_minimo').notNullable().defaultTo(0);
      t.decimal('precio_lista', 12, 2).notNullable().defaultTo(0);
      t.decimal('pct_minimo', 6, 2).notNullable().defaultTo(30);
      t.decimal('precio_minimo_usd', 12, 2).notNullable().defaultTo(0);
      t.decimal('precio_50_usd', 12, 2).notNullable().defaultTo(0);
      t.boolean('activo').notNullable().defaultTo(true);
      t.timestamp('creado_en').defaultTo(knex.fn.now());
      t.timestamp('actualizado_en').defaultTo(knex.fn.now());
      t.index(['nombre']);
      t.index(['categoria']);
    })
    .createTable('movimientos', (t) => {
      t.increments('id').primary();
      t.integer('producto_id').notNullable().references('id').inTable('productos').onDelete('CASCADE');
      t.integer('usuario_id').references('id').inTable('usuarios').onDelete('SET NULL');
      t.enu('tipo', ['CARGA', 'DESCARGA', 'VENTA', 'AJUSTE']).notNullable();
      t.integer('cantidad').notNullable();
      t.decimal('precio_unit', 12, 2).notNullable().defaultTo(0);
      t.decimal('ganancia', 12, 2).notNullable().defaultTo(0);
      t.string('motivo');
      t.timestamp('fecha').defaultTo(knex.fn.now());
      t.index(['fecha']);
      t.index(['tipo']);
    })
    .createTable('config', (t) => {
      t.integer('id').primary().defaultTo(1);
      t.decimal('pct_minimo_default', 6, 2).notNullable().defaultTo(30);
      t.decimal('tasa_bcv', 12, 4);
      t.timestamp('tasa_bcv_fecha');
      t.timestamp('tasa_bcv_fetched_at');
      t.string('tasa_bcv_fuente');
    })
    .then(() => knex('config').insert({ id: 1 }));
};

exports.down = function (knex) {
  return knex.schema
    .dropTableIfExists('movimientos')
    .dropTableIfExists('productos')
    .dropTableIfExists('usuarios')
    .dropTableIfExists('config');
};
