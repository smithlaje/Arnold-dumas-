exports.up = function (knex) {
  return knex.schema.alterTable('productos', (t) => {
    t.string('marca').notNullable().defaultTo('');
    t.decimal('pct_proteccion', 6, 2).notNullable().defaultTo(0);
    t.boolean('proteccion_activa').notNullable().defaultTo(false);
    t.decimal('precio_proteccion_usd', 12, 2).notNullable().defaultTo(0);
  });
};

exports.down = function (knex) {
  return knex.schema.alterTable('productos', (t) => {
    t.dropColumn('marca');
    t.dropColumn('pct_proteccion');
    t.dropColumn('proteccion_activa');
    t.dropColumn('precio_proteccion_usd');
  });
};
