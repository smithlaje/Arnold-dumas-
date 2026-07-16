exports.up = function (knex) {
  return knex.schema.alterTable('productos', (t) => {
    t.decimal('pct_descuento', 6, 2).notNullable().defaultTo(0);
    t.decimal('precio_oferta_usd', 12, 2).notNullable().defaultTo(0);
  });
};

exports.down = function (knex) {
  return knex.schema.alterTable('productos', (t) => {
    t.dropColumn('pct_descuento');
    t.dropColumn('precio_oferta_usd');
  });
};
