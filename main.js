'use strict';
// Imports
const compression = require('compression');
const express = require('express');
const app = express();
app.use(compression());
app.use(express.json());

var multer = require('multer'); // v1.0.5
var upload = multer(); // for parsing multipart/form-data
app.use(upload.none());

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

const articuloColumns = ['CODIGO', 'DESCRIPCION', 'PRECIO_LISTA', 'PRECIO_CONTADO', 'PRECIO_COSTO', 'STOCK', 'RUBRO_ID', 'MARCA_ID', 'DESCUENTO'];

const facturaQuery = `
SELECT FACTURA.NUMERO_FACTURA, FACTURA.FECHA_HORA, FACTURA.DESCUENTO, FACTURA.OBSERVACIONES,
       ARTICULO.CODIGO, ARTICULO.DESCRIPCION,
       ITEM_FACTURA.CANTIDAD, ITEM_FACTURA.PRECIO_UNITARIO, ITEM_FACTURA.DESCUENTO AS DESCUENTO_ITEM,
       CLIENTE.id AS CLIENTE_ID, CLIENTE.NOMBRE AS CLIENTE,
       TURNO.id AS TURNO,
       VENDEDOR.id AS VENDEDOR_ID, VENDEDOR.NOMBRE AS VENDEDOR
FROM ARTICULO
INNER JOIN ITEM_FACTURA
  ON ARTICULO.id = ITEM_FACTURA.ARTICULO_ID
INNER JOIN FACTURA
  ON ITEM_FACTURA.FACTURA_ID = FACTURA.id
INNER JOIN CLIENTE
  ON FACTURA.CLIENTE_ID = CLIENTE.id
INNER JOIN TURNO
  ON FACTURA.TURNO_ID = TURNO.id
INNER JOIN VENDEDOR
  ON TURNO.VENDEDOR_ID = VENDEDOR.id
WHERE FACTURA.ANULADA = 0
UNION
SELECT FACTURA.NUMERO_FACTURA, FACTURA.FECHA_HORA, FACTURA.DESCUENTO, FACTURA.OBSERVACIONES,
  "MISCELANEA", ITEM_MISC.DESCRIPCION,
  1, ITEM_MISC.PRECIO, 0 AS DESCUENTO_ITEM,
  CLIENTE.id AS CLIENTE_ID, CLIENTE.NOMBRE AS CLIENTE,
  TURNO.id AS TURNO,
  VENDEDOR.id AS VENDEDOR_ID, VENDEDOR.NOMBRE AS VENDEDOR
FROM FACTURA
INNER JOIN ITEM_MISC
  ON FACTURA.id = ITEM_MISC.FACTURA_ID
  INNER JOIN CLIENTE
  ON FACTURA.CLIENTE_ID = CLIENTE.id
INNER JOIN TURNO
  ON FACTURA.TURNO_ID = TURNO.id
INNER JOIN VENDEDOR
  ON TURNO.VENDEDOR_ID = VENDEDOR.id
WHERE FACTURA.ANULADA = 0
`;

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
    } else {
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
  LOGGER(req.body);

  next();
});

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
  res.selectQuery = `SELECT MAX(NUMERO_FACTURA) AS lastId FROM FACTURA`;
  next();
});

app.get('/api/compra/last', (req, res, next) => {
  res.selectQuery = `SELECT MAX(NUMERO_COMPRA) AS lastId FROM COMPRA`;
  next();
});

app.get('/api/turno/actual', (req, res, next) => {
  res.selectQuery = `SELECT * FROM TURNO WHERE id=(SELECT MAX(id) FROM TURNO)`;
  next();
});

app.get('/api/rawTables/:tabla', (req, res, next) => {
  if (req.params.tabla === 'full_articulos') {
    console.log('fetching articulos');
    console.log('=============================================');
    console.log('=============================================');
    console.log('=============================================');
    console.log('=============================================');
    console.log('=============================================');
  }
  res.selectQuery = `SELECT * FROM ${req.params.tabla}`;
  next();
});

app.get('/api/articulo/codigo/:codigo', (req, res, next) => {
  res.selectQuery = `SELECT * FROM ARTICULO WHERE CODIGO = '${req.params.codigo}'`;
  next();
});

app.get('/api/articulo/id/:id', (req, res, next) => {
  res.selectQuery = `SELECT * FROM ARTICULO WHERE id = '${req.params.id}'`;
  next();
});

// 'GET' MIDDLEWARE HANDLER
app.use(async (req, res, next) => {
  if (res.selectQuery && req.method === 'GET') {
    LOGGER('DBQUERY: ', res.selectQuery);
    try {
      const results = await db.all(res.selectQuery);
      if (results.length === 1) {
        res.json(results[0]);
      } else {
        res.json(results);
      }
    } catch (err) {
      console.log(err);
    }
  }
  next();
});

app.get('/api/factura/all', async (req, res, next) => {
  const selectQuery = facturaQuery;
  LOGGER('DBQUERY: ', selectQuery);
  try {
    const results = await db.all(selectQuery);
    const pagos = await db.all(`
    SELECT PAGO.MONTO, ESTADO_PAGO.NOMBRE, FACTURA.NUMERO_FACTURA, TIPO_PAGO.NOMBRE
    FROM PAGO
    INNER JOIN FACTURA
      ON PAGO.FACTURA_ID = FACTURA.id
    INNER JOIN TIPO_PAGO
      ON PAGO.TIPO_PAGO_ID = TIPO_PAGO.id
    INNER JOIN ESTADO_PAGO
      ON PAGO.ESTADO_ID = ESTADO_PAGO.id
    `);

    const resultArray = [];
    results.forEach((item, index) => {
      const {NUMERO_FACTURA, FECHA_HORA, CODIGO, DESCRIPCION, CANTIDAD, PRECIO_UNITARIO, CLIENTE_ID, CLIENTE, TURNO, VENDEDOR_ID, VENDEDOR, DESCUENTO, OBSERVACIONES, DESCUENTO_ITEM} = item;

      let index2 = resultArray.findIndex(item2 => NUMERO_FACTURA === item2.NUMERO_FACTURA);
      if (index2 === -1) {
        resultArray.push({
          NUMERO_FACTURA,
          FECHA_HORA,
          CLIENTE: {CLIENTE_ID, NOMBRE: CLIENTE},
          VENDEDOR: {VENDEDOR_ID, NOMBRE: VENDEDOR},
          TURNO,
          DESCUENTO,
          OBSERVACIONES,
          ITEMS: [],
          PAGOS: []
        });
        index2 = resultArray.length - 1;
      }
      resultArray[index2].ITEMS.push({
        CODIGO,
        DESCRIPCION,
        CANTIDAD,
        PRECIO_UNITARIO,
        PRECIO_TOTAL: PRECIO_UNITARIO * CANTIDAD,
        DESCUENTO_ITEM
      });
    });
    pagos.forEach(pago => {
      const factura = resultArray.find(f => f.NUMERO_FACTURA === pago.NUMERO_FACTURA);
      if (factura) {
        factura.PAGOS.push({
          MONTO: pago.MONTO,
          ESTADO: pago.ESTADO,
          TIPO: pago.NOMBRE
        });
      }
    });
    res.json(resultArray);
  } catch (err) {
    console.log(err);
  }

  next();
});

app.get('/api/compra/all', async (req, res, next) => {
  const selectQuery = `
  SELECT COMPRA.NUMERO_COMPRA, COMPRA.FECHA_HORA, COMPRA.OBSERVACIONES,
         PROVEEDOR.id AS PROVEEDOR_ID, PROVEEDOR.NOMBRE AS PROVEEDOR,
         ARTICULO.CODIGO, ARTICULO.DESCRIPCION,
         ITEM_COMPRA.CANTIDAD
  FROM COMPRA
  INNER JOIN ITEM_COMPRA
    ON COMPRA.id = ITEM_COMPRA.COMPRA_ID
  INNER JOIN ARTICULO
    ON ITEM_COMPRA.ARTICULO_ID = ARTICULO.id
  INNER JOIN PROVEEDOR
    ON COMPRA.PROVEEDOR_ID = PROVEEDOR.id
  WHERE COMPRA.ANULADA = 0
  `;
  LOGGER('DBQUERY: ', selectQuery);
  try {
    const results = await db.all(selectQuery);
    const resultArray = [];
    results.forEach((item, index) => {
      const {NUMERO_COMPRA, FECHA_HORA, OBSERVACIONES, PROVEEDOR_ID, PROVEEDOR, CODIGO, DESCRIPCION, CANTIDAD} = item;

      let index2 = resultArray.findIndex(item2 => NUMERO_COMPRA === item2.NUMERO_COMPRA);
      if (index2 === -1) {
        resultArray.push({
          NUMERO_COMPRA,
          FECHA_HORA,
          PROVEEDOR: {PROVEEDOR_ID, NOMBRE: PROVEEDOR},
          OBSERVACIONES,
          ITEMS: []
        });
        index2 = resultArray.length - 1;
      }
      resultArray[index2].ITEMS.push({
        CODIGO,
        DESCRIPCION,
        CANTIDAD
      });
    });
    res.json(resultArray);
  } catch (err) {
    console.log(err);
  }
  next();
});

app.post('/api/articulo', async (req, res, next) => {
  let statement;
  if (isNaN(req.body.id) || req.body.id === 0) { // NEW ITEM
    let cols = articuloColumns.map(col => req.body[col]);
    cols.unshift();
    statement = `INSERT INTO ARTICULO (${articuloColumns}) VALUES (${cols})`;
    LOGGER('INSERT: ', statement);
  } else { // UPDATE EXISTING ITEM
    let cols = articuloColumns.map(col => `${col}=${req.body[col]}`);
    statement = `UPDATE ARTICULO SET ${cols} WHERE ID = ${req.body.id}`;
    LOGGER('UPDATE: ', statement);
  }
  try {
    const dbResponse = await db.run(statement);
    const lastId = dbResponse.stmt.lastID || req.body.id;
    res.status(201).send({ lastId });
  } catch (err) {
    res.status(400).send({message: err.message});
  }
  next();
});

app.post('/api/crud/:table', async (req, res, next) => {
  let statement;
  let cols = Object.keys(req.body).filter(e => e !== 'id');

  if (isNaN(req.body.id)) { // NEW ITEM
    let colValues = cols.map(col => req.body[col]);
    statement = `INSERT INTO MARCA (${cols}) VALUES (${colValues})`;
    console.log(statement);
    LOGGER('INSERT: ', statement);
  } else { // UPDATE EXISTING ITEM
    let colValues = cols.map(col => `${col}=${req.body[col]}`);
    statement = `UPDATE MARCA SET ${colValues} WHERE ID = ${req.body.id}`;
    console.log(statement);
    LOGGER('UPDATE: ', statement);
  }
  try {
    const dbResponse = await db.run(statement);
    const lastId = dbResponse.stmt.lastID || req.body.id;
    console.log('lastid', lastId);
    res.status(201).send({ lastId });
  } catch (err) {
    console.log(err);
    res.status(400).send('ERROR: ' + err);
  }
  next();
});

app.post('/api/factura', async (req, res, next) => {
  req.body.ANULADA = !!(req.body.ANULADA); // CHECK FOR BOOLEAN VALUES, ADD AS FALSE IF NOT EXISTANT
  try {
    const statement = `INSERT INTO FACTURA (NUMERO_FACTURA, FECHA_HORA, DESCUENTO, CLIENTE_ID, TURNO_ID, OBSERVACIONES)
    VALUES (${req.body.NUMERO_FACTURA},${req.body.FECHA_HORA},${req.body.DESCUENTO},${req.body.CLIENTE_ID},${req.body.TURNO_ID},${req.body.OBSERVACIONES})`;
    const dbResponse = await db.run(statement);
    const lastId = dbResponse.stmt.lastID;
    res.status(201).send({ lastId });
  } catch (err) {
    console.log(err);
    next();
    res.status(400).send('ERROR: ' + err);
  }
  next();
});

app.post('/api/itemFactura', async (req, res, next) => {
  try {
    const statement = `INSERT INTO ITEM_FACTURA (FACTURA_ID, CANTIDAD, PRECIO_UNITARIO, DESCUENTO, ARTICULO_ID)
      VALUES (${req.body.FACTURA_ID},${req.body.CANTIDAD},${req.body.PRECIO_UNITARIO},${req.body.DESCUENTO},${req.body.ARTICULO_ID})`;
    console.log(statement);
    const dbResponse = await db.run(statement);
    const lastId = dbResponse.stmt.lastID;
    const updateStock = `UPDATE ARTICULO SET STOCK=(SELECT STOCK FROM ARTICULO WHERE ID=${req.body.ARTICULO_ID})-${req.body.CANTIDAD} WHERE ID=${req.body.ARTICULO_ID}`;
    const dbResponse2 = await db.run(updateStock);
    res.status(201).send({ lastId });
  } catch (err) {
    console.log(err);
    res.status(400).send('ERROR: ' + err);
  }
  next();
});

app.post('/api/compra', async (req, res, next) => {
  try {
    const statement = `INSERT INTO COMPRA (NUMERO_COMPRA, FECHA_HORA, PROVEEDOR_ID, OBSERVACIONES)
    VALUES (${req.body.NUMERO_COMPRA},${req.body.FECHA_HORA},${req.body.PROVEEDOR_ID},${req.body.OBSERVACIONES})`;
    const dbResponse = await db.run(statement);
    const lastId = dbResponse.stmt.lastID;
    res.status(201).send({ lastId });
  } catch (err) {
    console.log(err);
    next();
    res.status(400).send('ERROR: ' + err);
  }
  next();
});

app.post('/api/itemCompra', async (req, res, next) => {
  try {
    const statement = `INSERT INTO ITEM_COMPRA (COMPRA_ID, CANTIDAD, ARTICULO_ID)
      VALUES (${req.body.COMPRA_ID},${req.body.CANTIDAD},${req.body.ARTICULO_ID})`;
    console.log(statement);
    const dbResponse = await db.run(statement);
    const lastId = dbResponse.stmt.lastID;
    const updateStock = `UPDATE ARTICULO SET STOCK=(SELECT STOCK FROM ARTICULO WHERE ID=${req.body.ARTICULO_ID})+${req.body.CANTIDAD} WHERE ID=${req.body.ARTICULO_ID}`;
    const dbResponse2 = await db.run(updateStock);
    console.log(dbResponse2.stmt);

    res.status(201).send({ lastId });
  } catch (err) {
    console.log(err);
    res.status(400).send('ERROR: ' + err);
  }
  next();
});

app.post('/api/pago', async (req, res, next) => {
  try {
    const statement = `INSERT INTO PAGO (FACTURA_ID, MONTO, TIPO_PAGO_ID, ESTADO_ID)
      VALUES (${req.body.FACTURA_ID},${req.body.MONTO},${req.body.TIPO_PAGO_ID},${req.body.ESTADO_ID})`;
    const dbResponse = await db.run(statement);
    const lastId = dbResponse.stmt.lastID;
    res.status(201).send({ lastId });
  } catch (err) {
    console.log(err);
    res.status(400).send('ERROR: ' + err);
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
