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

const messages = {
  resultadoVacio: 'Sin resultados'
};

app.use(function (req, res, next) {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  next();
});

function chequearResultado (results) {
  if (results.length !== 0) {
    console.log(JSON.stringify(results, null, 2));
    return JSON.stringify(results);
  } else {
    return messages.resultadoVacio;
  }
}

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

Promise.resolve()
// First, try to open the database
  .then(() => db.open(DATABASE_URI, { Promise })) // <=
// Display error message if something went wrong
  .catch((err) => console.error(err.stack));

app.listen(process.env.PORT || DEFAULT_PORT, _ => {
  process.env.PORT && console.log(`listening in port ${process.env.PORT}...`);
  process.env.PORT || console.log(`listening in port ${DEFAULT_PORT}...`);
});
