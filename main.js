'use strict';
// Imports
const compression = require('compression');
const express = require('express');
const app = express();
app.use(compression());
app.use(express.json());

const db = require('sqlite');
const Promise = require('bluebird');
const DATABASE_URI = './database/database.db';
const DEFAULT_PORT = 3000;

app.use(function (req, res, next) {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  next();
});

// Endpoints
app.get('/', (req, res) => {
  res.send('Hello World!');
});

app.get('/api/rawTables/:tabla', async (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  const query = `SELECT * FROM ${req.params.tabla}`;
  try {
    const results = await db.all(query);
    res.send(JSON.stringify(results));
  } catch (err) {
    console.log(err);
  }
});

app.get('/api/articulo/:codigo', async (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  const query = `SELECT * FROM full_articulos WHERE CODIGO = '${req.params.codigo}'`;
  console.log(query);
  try {
    const results = await db.all(query);
    res.send(JSON.stringify(results));
  } catch (err) {
    console.log(err);
  }
});

app.get('/api/factura/last', async (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  const query = `SELECT MAX(NUMERO_FACTURA) AS LAST FROM FACTURA`;
  console.log(query);
  try {
    const results = await db.all(query);
    results[0].LAST = results[0].LAST || 1;
    res.send(JSON.stringify(results[0].LAST));
  } catch (err) {
    console.log(err);
  }
});

app.get('/api/cliente/:id', async (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  const query = `SELECT * FROM CLIENTE WHERE id = ${req.params.id}`;
  console.log(query);
  try {
    const results = await db.all(query);
    res.send(JSON.stringify(results));
  } catch (err) {
    console.log(err);
  }
});

app.get('/api/vendedor/:id', async (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  const query = `SELECT * FROM VENDEDOR WHERE id = ${req.params.id}`;
  console.log(query);
  try {
    const results = await db.all(query);
    res.send(JSON.stringify(results));
  } catch (err) {
    console.log(err);
  }
});

app.post('/api/factura', async (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  try {
    const statement = `INSERT INTO FACTURA (NUMERO_FACTURA, FECHA_HORA, DESCUENTO, CLIENTE_ID, TURNO_ID, ANULADA)
    VALUES (${req.body.NUMERO_FACTURA},${req.body.FECHA_HORA},${req.body.DESCUENTO},${req.body.CLIENTE_ID},${req.body.TURNO_ID},${req.body.ANULADA})`;
    console.log(statement);
    const dbResponse = await db.run(statement);
    const lastId = dbResponse.stmt.lastID;

    console.log('lastId: ' + lastId);
    console.log(req.body);
    return res.status(201).send({ lastId });
  } catch (err) {
    console.log(err);
    return res.status(400).send('ERROR: ' + err);
  }
});

app.post('/api/itemFactura', async (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  try {
    const statement = `INSERT INTO ITEM_FACTURA (FACTURA_ID, CANTIDAD, PRECIO_UNITARIO, DESCUENTO, ARTICULO_ID)
      VALUES (${req.body.FACTURA_ID},${req.body.CANTIDAD},${req.body.PRECIO_UNITARIO},${req.body.DESCUENTO},${req.body.ARTICULO_ID})`;
    const dbResponse = await db.run(statement);
    const lastId = dbResponse.stmt.lastID;

    console.log('lastId: ' + lastId);
    console.log(req.body);
    return res.status(201).send({ lastId });
  } catch (err) {
    console.log(err);
    return res.status(400).send('ERROR: ' + err);
  }
});

app.post('/api/pago', async (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  try {
    const statement = `INSERT INTO PAGO (FACTURA_ID, MONTO, TIPO_PAGO_ID, ESTADO)
      VALUES (${req.body.FACTURA_ID},${req.body.MONTO},${req.body.TIPO_PAGO_ID},"${req.body.ESTADO}")`;
    console.log(statement);
    const dbResponse = await db.run(statement);
    const lastId = dbResponse.stmt.lastID;

    console.log('lastId: ' + lastId);
    console.log(req.body);
    return res.status(201).send({ lastId });
  } catch (err) {
    console.log(err);
    return res.status(400).send('ERROR: ' + err);
  }
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
