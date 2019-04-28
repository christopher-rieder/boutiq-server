
'use strict';
// const currentDate = dateFormat(new Date(), DATE_FORMAT_STRING);
// const turnoDate = dateFormat(new Date(results[0].fechaHoraInicio), DATE_FORMAT_STRING);
// if (currentDate !== turnoDate) {
//   res.status(200).json({});
// }

// Imports
const compression = require('compression');
const express = require('express');
const dateFormat = require('date-fns/format');
const DATE_FORMAT_STRING = 'YYYY/MM/DD';

const app = express();
app.use(compression());
app.use(express.json());

// LOGGER SET UP
var fs = require('fs');
var util = require('util');
var logFile = fs.createWriteStream('log.txt', { flags: 'a' });
// Or 'w' to truncate the file every time the process starts.
var logStdout = process.stdout;

console.log = function () {
  // logFile.write(util.format.apply(null, arguments) + '\n');
  logStdout.write(util.format.apply(null, arguments) + '\n');
};
console.error = console.log;

function LOGGER (...messages) {
  console.log(...messages);
}

const db = require('sqlite');
const Promise = require('bluebird');
const DATABASE_URI = './database/database.db';
const DEFAULT_PORT = 3000;

app.use(function (req, res, next) {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  res.header('Access-Control-Allow-Methods', 'PUT, POST, GET, DELETE, OPTIONS');
  res.setHeader('Content-Type', 'application/json');
  next();
});

app.use(function (req, res, next) {
  // escape text and add quotes `"`
  Object.keys(req.body).forEach(key => {
    if (isNaN(req.body[key]) || req.body[key] === '') {
      req.body[key] = '"' + req.body[key] + '"';
    } else if (req.body[key] !== null) {
      req.body[key] = parseFloat(req.body[key]);
    }
  });
  next();
});

// LOGGER
app.use(function (req, res, next) {
  LOGGER('-'.repeat(40));
  LOGGER('DATETIME', new Date().toLocaleString());
  LOGGER('URL:     ', req.url);
  LOGGER('METHOD:  ', req.method);
  next();
});

function parseColumns (body, table) {
  const cols = Object.keys(body).filter(e => e !== 'id');
  const colValuesInsert = cols.map(col => body[col]);
  const insertStatement = `INSERT INTO ${table} (${cols}) VALUES (${colValuesInsert})`;

  const colValuesUpdate = cols.map(col => `${col}=${body[col]}`);
  const updateStatement = `UPDATE ${table} SET ${colValuesUpdate} WHERE ID = ${body.id}`;

  if (isNaN(body.id)) { // NEW ITEM
    return insertStatement;
  } else {
    return updateStatement;
  }
}

function updateStockStatement (id, cant, suma) {
  return `
    UPDATE ARTICULO
    SET stock=(SELECT stock FROM ARTICULO WHERE id=${id})
    ${suma ? '+' : '-'}
    ${cant} WHERE id=${id}`;
}

/* SIMPLE GET FOR CRUD TABLES */
const crudTables = ['cliente', 'vendedor', 'proveedor'];
const crudEndpoints = crudTables.map(tabla => '/api/' + tabla);
app.get(crudEndpoints, (req, res, next) => {
  const tabla = req.path.split('/')[2];
  res.selectQuery = `SELECT * FROM ${tabla}`;
  next();
});

/* SIMPLE GET ITEM FOR CRUD TABLES */
const crudEndpointsItems = crudEndpoints.map(e => e + '/:id');
app.get(crudEndpointsItems, (req, res, next) => {
  const tabla = req.path.split('/')[2];
  res.selectQuery = `SELECT * FROM ${tabla} WHERE ID=${req.params.id}`;
  next();
});

app.get('/api/factura/last', (req, res, next) => {
  res.selectQuery = `SELECT MAX(numeroFactura) AS lastId FROM FACTURA`;
  next();
});

app.get('/api/compra/last', (req, res, next) => {
  res.selectQuery = `SELECT MAX(numeroCompra) AS lastId FROM COMPRA`;
  next();
});

app.get('/api/se%C3%B1a/last', (req, res, next) => {
  res.selectQuery = `SELECT MAX(numeroSeña) AS lastId FROM SEÑA`;
  next();
});

app.get('/api/retiro/last', (req, res, next) => {
  res.selectQuery = `SELECT MAX(numeroRetiro) AS lastId FROM RETIRO`;
  next();
});

app.get('/api/rawTables/:tabla', (req, res, next) => {
  res.selectQuery = `SELECT * FROM ${req.params.tabla}`;
  next();
});

app.get('/api/pago/pendientes', (req, res, next) => {
  res.selectQuery = `
  SELECT PAGO.*, ESTADO_PAGO.nombre AS estado, TIPO_PAGO.nombre AS tipoPago,
         FACTURA.fechaHora, FACTURA.numeroFactura
  FROM PAGO
  INNER JOIN FACTURA
    ON PAGO.facturaId = FACTURA.id
  INNER JOIN TIPO_PAGO
    ON PAGO.tipoPagoId = TIPO_PAGO.id
  INNER JOIN ESTADO_PAGO
    ON PAGO.estadoId = ESTADO_PAGO.id
  `;
  next();
});

app.get('/api/articulo/codigo/:codigo', (req, res, next) => {
  res.selectQuery = `
  SELECT ARTICULO.*, 
         MARCA.id as marcaId, MARCA.nombre as marcaNombre,
         RUBRO.id as rubroId, RUBRO.nombre as rubroNombre
  FROM ARTICULO
  INNER JOIN MARCA
    ON ARTICULO.marcaId = MARCA.id
  INNER JOIN RUBRO
    ON ARTICULO.rubroId = RUBRO.id
  WHERE codigo = '${req.params.codigo}'`;
  next();
});

app.get('/api/articulo/id/:id', (req, res, next) => {
  res.selectQuery = `
  SELECT ARTICULO.*, 
         MARCA.id as marcaId, MARCA.nombre as marcaNombre,
         RUBRO.id as rubroId, RUBRO.nombre as rubroNombre
  FROM ARTICULO
  INNER JOIN MARCA
    ON ARTICULO.marcaId = MARCA.id
  INNER JOIN RUBRO
    ON ARTICULO.rubroId = RUBRO.id
  WHERE ARTICULO.id = '${req.params.id}'`;
  next();
});

// 'GET' MIDDLEWARE HANDLER
app.use(async (req, res, next) => {
  if (res.selectQuery && req.method === 'GET') {
    LOGGER('DBQUERY: ', res.selectQuery);
    try {
      const results = await db.all(res.selectQuery);
      res.status(200).json(results);
    } catch (err) {
      console.log(err);
      res.status(400).json({message: err.message});
    }
  }
  next();
});

app.get('/api/turno/last', async (req, res, next) => {
  const selectQuery = `
  SELECT *
  FROM TURNO 
  WHERE id=(SELECT MAX(id) FROM TURNO)`;

  try {
    const results = await db.all(selectQuery);
    const vendedorId = results[0].vendedorId;
    delete results[0].vendedorId;
    results[0].cerrado = !!(results[0].fechaHoraCierre);
    const vendedor = await db.all(`SELECT * FROM VENDEDOR WHERE id=${vendedorId}`);
    results[0].vendedor = vendedor[0];
    res.status(200).json(results);
  } catch (err) {
    console.log(err);
    res.status(400).json({message: err.message});
  }
  next();
});

// // complex get queries
app.get('/api/factura/:numero', async (req, res, next) => {
  if (req.params.id === 'last') return; // ignore /api/factura/last, handled before

  const facturasQuery = `
  SELECT numeroFactura, fechaHora, CLIENTE.nombre as cliente, turnoId, VENDEDOR.nombre, descuento, anulada, observaciones
  FROM FACTURA
  INNER JOIN CLIENTE
    ON CLIENTE.id = FACTURA.clienteId
  INNER JOIN TURNO
    ON FACTURA.turnoId = TURNO.id
  INNER JOIN VENDEDOR
    ON TURNO.vendedorId = VENDEDOR.id
  WHERE numeroFactura = ${req.params.numero}
  `;

  const pagosQuery = `
  SELECT PAGO.monto, ESTADO_PAGO.nombre AS estado, FACTURA.numeroFactura, TIPO_PAGO.nombre AS tipoPago
  FROM PAGO
  INNER JOIN FACTURA
    ON PAGO.facturaId = FACTURA.id
  INNER JOIN TIPO_PAGO
    ON PAGO.tipoPagoId = TIPO_PAGO.id
  INNER JOIN ESTADO_PAGO
    ON PAGO.estadoId = ESTADO_PAGO.id
  WHERE numeroFactura = ${req.params.numero}
  `;

  const itemsQuery = `
  SELECT  ARTICULO.codigo, ARTICULO.descripcion,
          ITEM_FACTURA.cantidad, ITEM_FACTURA.precioUnitario, ITEM_FACTURA.descuento AS descuentoItem,
          ITEM_FACTURA.cantidad * ITEM_FACTURA.precioUnitario as precioTotal
  FROM ARTICULO
  INNER JOIN ITEM_FACTURA
    ON ARTICULO.id = ITEM_FACTURA.articuloId
  INNER JOIN FACTURA
    ON ITEM_FACTURA.facturaId = FACTURA.id
  WHERE numeroFactura = ${req.params.numero}
  
  UNION
  
  SELECT  "MISCELANEA" as codigo, ITEM_MISC.descripcion,
          1 as cantidad, ITEM_MISC.precio as precioUnitario, 0 AS descuentoItem,
          ITEM_MISC.precio AS precioTotal
  FROM FACTURA
  INNER JOIN ITEM_MISC
    ON FACTURA.id = ITEM_MISC.facturaId
  WHERE numeroFactura = ${req.params.numero}
`;

  try {
    const factura = await db.all(facturasQuery);
    const pagos = await db.all(pagosQuery);
    const items = await db.all(itemsQuery);
    factura[0].pagos = pagos;
    factura[0].items = items;
    res.status(200).json(factura);
  } catch (err) {
    console.log(err);
    res.status(400).json({message: err.message});
  }

  next();
});

app.get('/api/compra/:numero', async (req, res, next) => {
  if (req.params.id === 'last') return; // ignore /api/compra/last, handled befor

  const comprasQuery = `
  SELECT COMPRA.numeroCompra, COMPRA.fechaHora, COMPRA.observaciones,
  PROVEEDOR.nombre AS proveedor
  FROM COMPRA
  INNER JOIN PROVEEDOR
    ON COMPRA.proveedorId = PROVEEDOR.id
  WHERE numeroCompra = ${req.params.numero}
  `;

  const itemsQuery = `
  SELECT COMPRA.numeroCompra,
         ARTICULO.codigo, ARTICULO.descripcion,
         ITEM_COMPRA.cantidad
  FROM COMPRA
  INNER JOIN ITEM_COMPRA
    ON COMPRA.id = ITEM_COMPRA.compraId
  INNER JOIN ARTICULO
    ON ITEM_COMPRA.articuloId = ARTICULO.id
  WHERE numeroCompra = ${req.params.numero}
  `;

  try {
    const compras = await db.all(comprasQuery);
    const items = await db.all(itemsQuery);
    compras[0].items = items;
    res.status(200).json(compras);
  } catch (err) {
    console.log(err);
    res.status(400).json({message: err.message});
  }
  next();
});

app.get('/api/se%C3%B1a/:numero', async (req, res, next) => {
  if (req.params.id === 'last') return; // ignore /api/compra/last, handled befor
  console.log('POSADKSPOJAS');
  const señasQuery = `
  SELECT  SEÑA.numeroSeña, SEÑA.monto, SEÑA.fechaHora, SEÑA.observaciones,
          ESTADO_PAGO.nombre as estado,
          CLIENTE.nombre as cliente,
          VENDEDOR.nombre as vendedor
  FROM SEÑA
  INNER JOIN ESTADO_PAGO
    ON SEÑA.estadoId = ESTADO_PAGO.id
  INNER JOIN CLIENTE
    ON SEÑA.clienteId = CLIENTE.id
  INNER JOIN TURNO
    ON SEÑA.turnoId = TURNO.id
  INNER JOIN VENDEDOR
    ON TURNO.vendedorId = VENDEDOR.id
  WHERE numeroSeña = ${req.params.numero}
  `;

  // const pagosQuery = ``;

  const itemsQuery = `
  SELECT SEÑA.numeroSeña,
         ARTICULO.codigo, ARTICULO.descripcion,
         ITEM_SEÑA.cantidad, ITEM_SEÑA.precioUnitario
  FROM SEÑA
  INNER JOIN ITEM_SEÑA
    ON SEÑA.id = ITEM_SEÑA.señaId
  INNER JOIN ARTICULO
    ON ITEM_SEÑA.articuloId = ARTICULO.id
  WHERE numeroSeña = ${req.params.numero}
  `;

  try {
    const señas = await db.all(señasQuery);
    // const pagos = await db.all(pagosQuery);
    const items = await db.all(itemsQuery);
    señas[0].items = items;
    res.status(200).json(señas);
  } catch (err) {
    console.log(err);
    res.status(400).json({message: err.message});
  }
  next();
});

app.get('/api/retiro/:numero', async (req, res, next) => {
  if (req.params.id === 'last') return; // ignore /api/seña/last, handled befor

  const retirosQuery = `
    SELECT numeroRetiro, fechaHora, observaciones,
           VENDEDOR.nombre as vendedor
    FROM RETIRO
    INNER JOIN TURNO
      ON RETIRO.turnoId = TURNO.id
    INNER JOIN VENDEDOR
      ON TURNO.vendedorId = vendedor.id
    WHERE numeroRetiro = ${req.params.numero}
  `;

  const itemsQuery = `
  SELECT RETIRO.numeroRetiro,
         ARTICULO.codigo, ARTICULO.descripcion,
         ITEM_RETIRO.cantidad
  FROM RETIRO
  INNER JOIN ITEM_RETIRO
    ON RETIRO.id = ITEM_RETIRO.retiroId
  INNER JOIN ARTICULO
    ON ITEM_RETIRO.articuloId = ARTICULO.id
    WHERE numeroRetiro = ${req.params.numero}
  `;

  try {
    const retiros = await db.all(retirosQuery);
    const items = await db.all(itemsQuery);
    retiros[0].items = items;
    res.status(200).json(retiros);
  } catch (err) {
    console.log(err);
    res.status(400).json({message: err.message});
  }
  next();
});

app.get('/api/caja/actual', async (req, res, next) => {
  const currentDate = dateFormat(new Date(), DATE_FORMAT_STRING);
  const selectQuery = `
  SELECT *
  FROM CAJA
  WHERE fecha = '${currentDate}'
  `;

  try {
    const results = await db.all(selectQuery);
    console.log('currsession', results);
    res.status(200).json(results);
  } catch (err) {
    console.log(err);
    res.status(400).json({message: err.message});
  }
  next();
});

app.get('/api/caja/resumen/:id', async (req, res, next) => {
  const selectQuery = `
  SELECT documento, numero, descripcion, cantidad, valor
  FROM RESUMEN_CAJA WHERE cajaId=${req.params.id}
  `;

  try {
    const results = await db.all(selectQuery);
    res.status(200).json(results);
  } catch (err) {
    console.log(err);
    res.status(400).json({message: err.message});
  }
  next();
});

app.get('/api/turno/resumen/:id', async (req, res, next) => {
  const itemsQuery = `
  SELECT documento, numero, descripcion, cantidad, valor
  FROM RESUMEN_CAJA WHERE turnoId=${req.params.id}
  `;

  try {
    const items = await db.all(itemsQuery);
    const results = {
      items
    };
    res.status(200).json(results);
  } catch (err) {
    console.log(err);
    res.status(400).json({message: err.message});
  }
  next();
});

app.post('/api/crud/:table', async (req, res, next) => {
  const statement = parseColumns(req.body, req.params.table);
  console.log(statement);
  try {
    const dbResponse = await db.run(statement);
    const lastId = req.body.id || dbResponse.stmt.lastID;
    console.log('lastid', lastId);
    res.status(201).send({ lastId });
  } catch (err) {
    console.log(err);
    res.status(400).send({message: err.message});
  }
  next();
});

app.post('/api/caja', async (req, res, next) => {
  const statement = parseColumns(req.body, 'CAJA');
  console.log(statement);
  try {
    const dbResponse = await db.run(statement);
    const lastId = dbResponse.stmt.lastID || req.body.id;
    console.log('lastid', lastId);
    res.status(201).send({ lastId });
  } catch (err) {
    console.log(err);
    res.status(400).send({message: err.message});
  }
  next();
});

app.post('/api/turno', async (req, res, next) => {
  const statement = parseColumns(req.body, 'TURNO');
  console.log(statement);
  try {
    const dbResponse = await db.run(statement);
    const lastId = dbResponse.stmt.lastID || req.body.id;
    console.log('lastid', lastId);
    res.status(201).send({ lastId });
  } catch (err) {
    console.log(err);
    res.status(400).send({message: err.message});
  }
  next();
});

app.post('/api/factura', async (req, res, next) => {
  const statement = parseColumns(req.body, 'FACTURA');
  console.log(statement);
  try {
    const dbResponse = await db.run(statement);
    const lastId = dbResponse.stmt.lastID;
    res.status(201).send({ lastId });
  } catch (err) {
    console.log(err);
    res.status(400).send({message: err.message});
  }
  next();
});

app.post('/api/anular/factura/:numero', async (req, res, next) => {
  const statement = `
    UPDATE factura
    SET ANULADA = 1
    WHERE numeroFactura = ${req.params.numero}
  `;

  try {
    const dbResponse = await db.run(statement);
    const lastId = dbResponse.stmt.lastID;
    res.status(201).send({ lastId });
  } catch (err) {
    console.log(err);
    res.status(400).send({message: err.message});
  }
  next();
});

app.post('/api/itemFactura', async (req, res, next) => {
  const statement = parseColumns(req.body, 'ITEM_FACTURA');
  console.log(statement);
  try {
    const dbResponse = await db.run(statement);
    const lastId = dbResponse.stmt.lastID;
    await db.run(updateStockStatement(req.body.articuloId, req.body.cantidad, false));
    res.status(201).send({ lastId });
  } catch (err) {
    console.log(err);
    res.status(400).send({message: err.message});
  }
  next();
});

app.post('/api/compra', async (req, res, next) => {
  const statement = parseColumns(req.body, 'COMPRA');
  console.log(statement);
  try {
    const dbResponse = await db.run(statement);
    const lastId = dbResponse.stmt.lastID;
    res.status(201).send({ lastId });
  } catch (err) {
    console.log(err);
    next();
    res.status(400).send({message: err.message});
  }
  next();
});

app.post('/api/itemCompra', async (req, res, next) => {
  const statement = parseColumns(req.body, 'ITEM_COMPRA');
  console.log(statement);
  try {
    const dbResponse = await db.run(statement);
    const lastId = dbResponse.stmt.lastID;
    await db.run(updateStockStatement(req.body.articuloId, req.body.cantidad, true));

    res.status(201).send({ lastId });
  } catch (err) {
    console.log(err);
    res.status(400).send({message: err.message});
  }
  next();
});

app.post('/api/pago', async (req, res, next) => {
  try {
    const statement = `INSERT INTO PAGO (facturaId, monto, tipoPagoId, estadoId)
      VALUES (${req.body.facturaId},${req.body.monto},${req.body.tipoPagoId},${req.body.estadoId})`;
    const dbResponse = await db.run(statement);
    const lastId = dbResponse.stmt.lastID;
    res.status(201).send({ lastId });
  } catch (err) {
    console.log(err);
    res.status(400).send({message: err.message});
  }
  next();
});

app.post('/api/pago/:id', async (req, res, next) => {
  try {
    const statement = `UPDATE PAGO SET estadoId=${req.body.estadoId} WHERE id=${req.body.id}`;
    const dbResponse = await db.run(statement);
    const lastId = dbResponse.stmt.lastID;
    res.status(201).send({ lastId });
  } catch (err) {
    console.log(err);
    res.status(400).send({message: err.message});
  }
  next();
});

app.post('/api/se%C3%B1a', async (req, res, next) => {
  const statement = parseColumns(req.body, 'SEÑA');
  console.log(statement);
  try {
    const dbResponse = await db.run(statement);
    const lastId = dbResponse.stmt.lastID;
    res.status(201).send({ lastId });
  } catch (err) {
    console.log(err);
    next();
    res.status(400).send({message: err.message});
  }
  next();
});

app.post('/api/itemSe%C3%B1a', async (req, res, next) => {
  const statement = parseColumns(req.body, 'ITEM_SEÑA');
  console.log(statement);
  try {
    const dbResponse = await db.run(statement);
    const lastId = dbResponse.stmt.lastID;
    res.status(201).send({ lastId });
  } catch (err) {
    console.log(err);
    res.status(400).send({message: err.message});
  }
  next();
});

app.post('/api/retiro', async (req, res, next) => {
  const statement = parseColumns(req.body, 'RETIRO');
  console.log(statement);
  try {
    const dbResponse = await db.run(statement);
    const lastId = dbResponse.stmt.lastID;
    res.status(201).send({ lastId });
  } catch (err) {
    console.log(err);
    next();
    res.status(400).send({message: err.message});
  }
  next();
});

app.post('/api/itemRetiro', async (req, res, next) => {
  const statement = parseColumns(req.body, 'ITEM_RETIRO');
  console.log(statement);
  try {
    const dbResponse = await db.run(statement);
    const lastId = dbResponse.stmt.lastID;
    await db.run(updateStockStatement(req.body.articuloId, req.body.cantidad, false));

    res.status(201).send({ lastId });
  } catch (err) {
    console.log(err);
    res.status(400).send({message: err.message});
  }
  next();
});

// LOGGER
app.use(function (req, res, next) {
  if (/POST|PUT|DELETE/i.test(req.method)) {
    LOGGER('BODY:\n', req.body);
  }
  next();
});

Promise.resolve()
// First, try to open the database
  .then(() => db.open(DATABASE_URI, { Promise })) // <=
// Display error message if something went wrong
  .catch((err) => console.error(err.stack));

app.listen(process.env.PORT || DEFAULT_PORT, _ => {
  process.env.PORT && console.log(`listening in port ${process.env.PORT}...`);
  process.env.PORT || console.log(`listening in port ${DEFAULT_PORT}...`);
});
