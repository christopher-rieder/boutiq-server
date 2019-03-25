'use strict';
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
    SET STOCK=(SELECT STOCK FROM ARTICULO WHERE ID=${id})
    ${suma ? '+' : '-'}
    ${cant} WHERE ID=${id}`;
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
  res.selectQuery = `SELECT MAX(NUMERO_FACTURA) AS lastId FROM FACTURA`;
  next();
});

app.get('/api/compra/last', (req, res, next) => {
  res.selectQuery = `SELECT MAX(NUMERO_COMPRA) AS lastId FROM COMPRA`;
  next();
});

app.get('/api/se%C3%B1a/last', (req, res, next) => {
  res.selectQuery = `SELECT MAX(NUMERO_SEÑA) AS lastId FROM SEÑA`;
  next();
});

app.get('/api/retiro/last', (req, res, next) => {
  res.selectQuery = `SELECT MAX(NUMERO_RETIRO) AS lastId FROM RETIRO`;
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

app.get('/api/pago/pendientes', (req, res, next) => {
  res.selectQuery = `
  SELECT PAGO.*, ESTADO_PAGO.NOMBRE AS ESTADO, TIPO_PAGO.NOMBRE AS TIPO_PAGO,
         FACTURA.FECHA_HORA, FACTURA.NUMERO_FACTURA
  FROM PAGO
  INNER JOIN FACTURA
    ON PAGO.FACTURA_ID = FACTURA.id
  INNER JOIN TIPO_PAGO
    ON PAGO.TIPO_PAGO_ID = TIPO_PAGO.id
  INNER JOIN ESTADO_PAGO
    ON PAGO.ESTADO_ID = ESTADO_PAGO.id
  `;
  next();
});

app.get('/api/articulo/codigo/:codigo', (req, res, next) => {
  res.selectQuery = `
  SELECT ARTICULO.*, MARCA.NOMBRE AS MARCA_NOMBRE, RUBRO.NOMBRE AS RUBRO_NOMBRE
  FROM ARTICULO
  INNER JOIN MARCA
    ON ARTICULO.MARCA_ID=MARCA.id
  INNER JOIN RUBRO
    ON ARTICULO.RUBRO_ID=RUBRO.id
  WHERE CODIGO = '${req.params.codigo}'`;
  next();
});

app.get('/api/articulo/id/:id', (req, res, next) => {
  res.selectQuery = `
  SELECT ARTICULO.*, MARCA.NOMBRE AS MARCA_NOMBRE, RUBRO.NOMBRE AS RUBRO_NOMBRE
  FROM ARTICULO
  INNER JOIN MARCA
    ON ARTICULO.MARCA_ID=MARCA.id
  INNER JOIN RUBRO
    ON ARTICULO.RUBRO_ID=RUBRO.id
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

// complex get queries
app.get('/api/factura/:id', async (req, res, next) => {
  if (req.params.id === 'last') return; // ignore /api/factura/last, handled befor
  const selectQuery = `
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
  WHERE FACTURA.ANULADA = 0 ${isNaN(req.params.id) ? '' : 'AND FACTURA.id=' + parseInt(req.params.id)}
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
  WHERE FACTURA.ANULADA = 0 ${isNaN(req.params.id) ? '' : 'AND FACTURA.id=' + parseInt(req.params.id)}
  `;

  try {
    const results = await db.all(selectQuery);
    const pagos = await db.all(`
    SELECT PAGO.*, ESTADO_PAGO.NOMBRE AS ESTADO, FACTURA.NUMERO_FACTURA, TIPO_PAGO.NOMBRE AS TIPO_PAGO
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
      const {NUMERO_FACTURA, FECHA_HORA, CODIGO, DESCRIPCION, CANTIDAD, PRECIO_UNITARIO, CLIENTE_ID, CLIENTE,
        TURNO, VENDEDOR_ID, VENDEDOR, DESCUENTO, OBSERVACIONES, DESCUENTO_ITEM} = item;

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
          id: pago.id,
          MONTO: pago.MONTO,
          NUMERO_FACTURA: pago.FACTURA_ID,
          ESTADO: {id: pago.ESTADO_ID, NOMBRE: pago.ESTADO},
          TIPO_PAGO: {id: pago.TIPO_PAGO_ID, NOMBRE: pago.TIPO_PAGO}
        });
      }
    });
    res.status(200).json(resultArray);
  } catch (err) {
    console.log(err);
    res.status(400).json({message: err.message});
  }

  next();
});

app.get('/api/compra/all', async (req, res, next) => {
  if (req.params.id === 'last') return; // ignore /api/compra/last, handled befor

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
  WHERE COMPRA.ANULADA = 0 ${isNaN(req.params.id) ? '' : 'AND COMPRA.id=' + parseInt(req.params.id)}
  `;

  try {
    const results = await db.all(selectQuery);
    const resultArray = [];
    results.forEach((item, index) => {
      const {NUMERO_COMPRA, FECHA_HORA, OBSERVACIONES, PROVEEDOR_ID, PROVEEDOR,
        CODIGO, DESCRIPCION, CANTIDAD} = item;

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
    res.status(200).json(resultArray);
  } catch (err) {
    console.log(err);
    res.status(400).json({message: err.message});
  }
  next();
});

app.get('/api/se%C3%B1a/all', async (req, res, next) => {
  if (req.params.id === 'last') return; // ignore /api/compra/last, handled befor

  const selectQuery = `
  SELECT SEÑA.NUMERO_SEÑA, SEÑA.FECHA_HORA, SEÑA.OBSERVACIONES, SEÑA.MONTO,
         CLIENTE.id AS CLIENTE_ID, CLIENTE.NOMBRE AS CLIENTE,
         VENDEDOR.id AS VENDEDOR_ID, VENDEDOR.NOMBRE AS VENDEDOR,
         ARTICULO.CODIGO, ARTICULO.DESCRIPCION, ARTICULO.PRECIO_LISTA,
         ITEM_SEÑA.CANTIDAD, ITEM_SEÑA.PRECIO_UNITARIO AS PRECIO_UNITARIO_SEÑA,
         ESTADO_PAGO.id AS ESTADO_ID, ESTADO_PAGO.NOMBRE AS ESTADO
  FROM SEÑA
  INNER JOIN ITEM_SEÑA
    ON SEÑA.id = ITEM_SEÑA.SEÑA_ID
  INNER JOIN ARTICULO
    ON ITEM_SEÑA.ARTICULO_ID = ARTICULO.id
  INNER JOIN CLIENTE
    ON SEÑA.CLIENTE_ID = CLIENTE.id
  INNER JOIN TURNO
    ON SEÑA.TURNO_ID = TURNO.id
  INNER JOIN ESTADO_PAGO
    ON SEÑA.ESTADO_ID = ESTADO_PAGO.id
  INNER JOIN VENDEDOR
    ON TURNO.VENDEDOR_ID = VENDEDOR.id
  ${isNaN(req.params.id) ? '' : 'WHERE RETIRO.id=' + parseInt(req.params.id)}
  `;

  try {
    const results = await db.all(selectQuery);
    const resultArray = [];
    results.forEach((item, index) => {
      const {NUMERO_SEÑA, FECHA_HORA, MONTO, OBSERVACIONES, CLIENTE_ID, CLIENTE, VENDEDOR_ID, VENDEDOR,
        ESTADO_ID, ESTADO, CODIGO, DESCRIPCION, CANTIDAD, PRECIO_UNITARIO_SEÑA, PRECIO_LISTA} = item;

      let index2 = resultArray.findIndex(item2 => NUMERO_SEÑA === item2.NUMERO_SEÑA);
      if (index2 === -1) {
        resultArray.push({
          NUMERO_SEÑA,
          FECHA_HORA,
          VENDEDOR: {id: VENDEDOR_ID, NOMBRE: VENDEDOR},
          CLIENTE: {id: CLIENTE_ID, NOMBRE: CLIENTE},
          ESTADO: {id: ESTADO_ID, NOMBRE: ESTADO},
          OBSERVACIONES,
          MONTO,
          ITEMS: []
        });
        index2 = resultArray.length - 1;
      }
      resultArray[index2].ITEMS.push({
        CODIGO,
        DESCRIPCION,
        CANTIDAD,
        PRECIO_LISTA,
        PRECIO_UNITARIO_SEÑA
      });
    });
    res.status(200).json(resultArray);
  } catch (err) {
    console.log(err);
    res.status(400).json({message: err.message});
  }
  next();
});

app.get('/api/retiro/all', async (req, res, next) => {
  if (req.params.id === 'last') return; // ignore /api/seña/last, handled befor

  const selectQuery = `
  SELECT RETIRO.NUMERO_RETIRO, RETIRO.FECHA_HORA, RETIRO.OBSERVACIONES,
         ARTICULO.CODIGO, ARTICULO.DESCRIPCION,
         VENDEDOR.id AS VENDEDOR_ID, VENDEDOR.NOMBRE AS VENDEDOR,
         ITEM_RETIRO.CANTIDAD
  FROM RETIRO
  INNER JOIN ITEM_RETIRO
    ON RETIRO.id = ITEM_RETIRO.RETIRO_ID
  INNER JOIN ARTICULO
    ON ITEM_RETIRO.ARTICULO_ID = ARTICULO.id
  INNER JOIN TURNO
    ON RETIRO.TURNO_ID=TURNO.id
  INNER JOIN VENDEDOR
    ON TURNO.VENDEDOR_ID=VENDEDOR.id
  ${isNaN(req.params.id) ? '' : 'WHERE RETIRO.id=' + parseInt(req.params.id)}
  `;

  try {
    const results = await db.all(selectQuery);
    const resultArray = [];
    results.forEach((item, index) => {
      const {NUMERO_RETIRO, FECHA_HORA, OBSERVACIONES, VENDEDOR_ID, VENDEDOR,
        CODIGO, DESCRIPCION, CANTIDAD} = item;

      let index2 = resultArray.findIndex(item2 => NUMERO_RETIRO === item2.NUMERO_RETIRO);
      if (index2 === -1) {
        resultArray.push({
          NUMERO_RETIRO,
          FECHA_HORA,
          OBSERVACIONES,
          VENDEDOR: {id: VENDEDOR_ID, NOMBRE: VENDEDOR},
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
    res.status(200).json(resultArray);
  } catch (err) {
    console.log(err);
    res.status(400).json({message: err.message});
  }
  next();
});

app.get('/api/caja/actual', async (req, res, next) => {
  const currentDate = dateFormat(new Date(), DATE_FORMAT_STRING);
  console.log('currDate', currentDate);
  const selectQuery = `
  SELECT *
  FROM CAJA
  WHERE FECHA = '${currentDate}'
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

app.post('/api/crud/:table', async (req, res, next) => {
  const statement = parseColumns(req.body, req.params.table);
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

app.post('/api/itemFactura', async (req, res, next) => {
  const statement = parseColumns(req.body, 'ITEM_FACTURA');
  console.log(statement);
  try {
    const dbResponse = await db.run(statement);
    const lastId = dbResponse.stmt.lastID;
    await db.run(updateStockStatement(req.body.ARTICULO_ID, req.body.CANTIDAD, false));
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
    await db.run(updateStockStatement(req.body.ARTICULO_ID, req.body.CANTIDAD, true));

    res.status(201).send({ lastId });
  } catch (err) {
    console.log(err);
    res.status(400).send({message: err.message});
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
    res.status(400).send({message: err.message});
  }
  next();
});

app.post('/api/pago/:id', async (req, res, next) => {
  try {
    const statement = `UPDATE PAGO SET ESTADO_ID=${req.body.ESTADO_ID} WHERE id=${req.body.id}`;
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
    await db.run(updateStockStatement(req.body.ARTICULO_ID, req.body.CANTIDAD, false));

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
