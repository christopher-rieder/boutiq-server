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
  logFile.write(util.format.apply(null, arguments) + '\n');
  logStdout.write(util.format.apply(null, arguments) + '\n');
};
console.error = console.log;

function LOGGER (...messages) {
  console.log(...messages);
}

const articuloColumns = ['CODIGO', 'DESCRIPCION', 'PRECIO_LISTA', 'PRECIO_CONTADO', 'PRECIO_COSTO', 'STOCK', 'RUBRO_ID', 'MARCA_ID', 'PROMO_BOOL', 'DESCUENTO_PROMO'];

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

// LOGGER
app.use(function (req, res, next) {
  LOGGER('-'.repeat(40));
  LOGGER('DATETIME', new Date().toLocaleString());
  LOGGER('URL:     ', req.url);
  LOGGER('METHOD:  ', req.method);

  next();
});

app.use(function (req, res, next) {
  // escape text and add quotes `"`
  Object.keys(req.body).forEach(key => {
    if (isNaN(req.body[key])) {
      req.body[key] = '"' + req.body[key] + '"';
    } else {
      req.body[key] = parseFloat(req.body[key]);
    }
  });
  next();
});

// Endpoints
app.get('/', (req, res) => {
  res.json('Hello World!');
});

app.get('/api/factura/last', (req, res, next) => {
  res.selectQuery = `SELECT MAX(NUMERO_FACTURA) AS lastId FROM FACTURA`;
  next();
});

app.get('/api/turno/actual', (req, res, next) => {
  res.selectQuery = `SELECT * FROM TURNO WHERE id=(SELECT MAX(id) FROM TURNO)`;
  next();
});

app.get('/api/rawTables/:tabla', (req, res, next) => {
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

app.get('/api/cliente/:id', (req, res, next) => {
  res.selectQuery = `SELECT * FROM CLIENTE WHERE id = ${req.params.id}`;
  next();
});

app.get('/api/vendedor/:id', (req, res, next) => {
  res.selectQuery = `SELECT * FROM VENDEDOR WHERE id = ${req.params.id}`;
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

app.post('/api/articulo', async (req, res, next) => {
  req.body.PROMO_BOOL = !!(req.body.PROMO_BOOL); // CHECK FOR BOOLEAN VALUES, ADD AS FALSE IF NOT EXISTANT
  let statement;
  if (isNaN(req.body.id)) { // NEW ITEM
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
    console.log(err);
    res.status(400).send('ERROR: ' + err);
  }
  next();
});

app.post('/api/factura', async (req, res, next) => {
  try {
    const statement = `INSERT INTO FACTURA (NUMERO_FACTURA, FECHA_HORA, DESCUENTO, CLIENTE_ID, TURNO_ID, ANULADA)
    VALUES (${req.body.NUMERO_FACTURA},${req.body.FECHA_HORA},${req.body.DESCUENTO},${req.body.CLIENTE_ID},${req.body.TURNO_ID},${req.body.ANULADA})`;
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

app.post('/api/pago', async (req, res, next) => {
  try {
    const statement = `INSERT INTO PAGO (FACTURA_ID, MONTO, TIPO_PAGO_ID, ESTADO)
      VALUES (${req.body.FACTURA_ID},${req.body.MONTO},${req.body.TIPO_PAGO_ID},${req.body.ESTADO})`;
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
