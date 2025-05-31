/*****************************************************************
 *  myCrushPizza – Backend
 *  Versión hardening 2025-05-31
 *  – Pool con keep-alive
 *  – Ping preventivo cada 5 min
 *  – Logging sin exponer la contraseña
 *****************************************************************/

require('dotenv').config();        // lee .env.* cuando corres local
const express = require('express');
const cors    = require('cors');
const mysql   = require('mysql2/promise');

const NODE_ENV = process.env.NODE_ENV || 'development';
const PORT     = process.env.PORT     || 8080;

/*-------------- 1. CONFIGURACIÓN DE LA BD -------------------------*/
const cfg = {
  uri      : process.env.DATABASE_URL || process.env.MYSQL_URL,
  host     : process.env.DB_HOST      || process.env.MYSQLHOST,
  port     : process.env.DB_PORT      || process.env.MYSQLPORT,
  user     : process.env.DB_USER      || process.env.MYSQLUSER,
  password : process.env.DB_PASSWORD  || process.env.MYSQLPASSWORD,
  database : process.env.DB_NAME      || process.env.MYSQLDATABASE
};

// Log sin revelar password completa
const safe = { ...cfg, password: cfg.password ? '***' + cfg.password.slice(-4) : undefined };
console.log('🔍 Variables de conexión detectadas:');
console.table(safe);

/*-------------- 2. CREAR EL POOL Y PROBAR CONEXIÓN ---------------*/
let db;                               // será el pool global

(async () => {
  try {
    db = cfg.uri
      ? mysql.createPool({
          uri: cfg.uri,
          waitForConnections: true,
          connectionLimit: 10,
          enableKeepAlive: true,
          keepAliveInitialDelay: 0
        })
      : mysql.createPool({
          ...cfg,
          waitForConnections: true,
          connectionLimit: 10,
          enableKeepAlive: true,
          keepAliveInitialDelay: 0
        });

    await db.query('SELECT 1');       // primer ping
    console.log(`✅ Conectado a MySQL (${cfg.host || 'via DATABASE_URL'})`);

    /* Ping preventivo cada 5 min para evitar idle-timeout */
    setInterval(() => {
      db.query('SELECT 1').catch(() => {}); // ignora error si se reinicia el pool
    }, 5 * 60 * 1000);

    startServer();
  } catch (err) {
    console.error('❌ No se pudo conectar a MySQL:', err.code || err.message);
    process.exit(1);
  }
})();

/*-------------- 3. DEFINICIÓN DE ENDPOINTS -----------------------*/
function startServer () {
  const app = express();
  app.use(cors());
  app.use(express.json());

  app.get('/', (_, res) =>
    res.send(`Servidor funcionando correctamente 🚀 (${new Date().toISOString()})`)
  );

  /* ------- LISTAR GANADORES ENTREGADOS ------- */
  app.get('/lista-ganadores', async (_, res) => {
    try {
      const [rows] = await db.query(
        `SELECT id, numero
         FROM   ganador
         WHERE  reclamado = 1
           AND  entregado = 0
         ORDER  BY id DESC`
      );
      res.json(rows);
    } catch (e) { res.status(500).json(e); }
  });

  /* ------- VERIFICAR UN NÚMERO ------- */
  app.get('/verificar/:numero', async (req, res) => {
    const { numero } = req.params;
    try {
      const [rows] = await db.query(
        `SELECT numero, reclamado, entregado, contacto
         FROM   ganador
         WHERE  numero = ?
           AND  reclamado = 1`,
        [numero]
      );
      if (!rows.length)
        return res.status(404).json({ message: 'Número no encontrado o sin reclamar' });
      res.json(rows[0]);
    } catch (e) { res.status(500).json(e); }
  });

  /* ------- OBTENER Nº GANADOR ACTUAL ------- */
  app.get('/ganador', async (_, res) => {
    try {
      const [rows] = await db.query(
        'SELECT numero FROM ganador ORDER BY id DESC LIMIT 1'
      );
      if (!rows.length)
        return res.status(400).json({ message: 'No hay número ganador generado aún' });
      res.json({ numeroGanador: rows[0].numero });
    } catch (e) { res.status(500).json(e); }
  });

  /* ------- GENERAR NUEVO Nº GANADOR ------- */
  app.post('/generar-ganador', async (_, res) => {
    const n = Math.floor(Math.random() * 900) + 100;          // 100-999
    try {
      await db.query(
        'INSERT INTO ganador (numero, reclamado) VALUES (?, 0)',
        [n]
      );
      res.json({ message: 'Número ganador generado 🎉', numeroGanador: n });
    } catch (e) { res.status(500).json(e); }
  });

  /* ------- INTENTAR GANAR ------- */
  app.post('/intentar', async (_, res) => {
    const intento = Math.floor(Math.random() * 900) + 100;
    try {
      const [[row]] = await db.query(
        'SELECT numero FROM ganador ORDER BY id DESC LIMIT 1'
      );
      if (!row)
        return res.status(400).json({ message: 'No hay número ganador generado aún' });
      res.json({ intento, numeroGanador: row.numero, esGanador: intento === row.numero });
    } catch (e) { res.status(500).json(e); }
  });

  /* ------- RECLAMAR PREMIO ------- */
  app.post('/reclamar', async (req, res) => {
    const { contacto } = req.body;
    try {
      // último ganador no reclamado
      const [[g]] = await db.query(
        'SELECT id FROM ganador WHERE reclamado = 0 ORDER BY id DESC LIMIT 1'
      );
      if (!g)
        return res.status(400).json({ message: 'No hay número ganador activo para reclamar' });

      await db.query(
        `UPDATE ganador
         SET    reclamado   = 1,
                contacto    = ?,
                reclamado_en = CURRENT_TIMESTAMP
         WHERE  id = ?`,
        [contacto, g.id]
      );

      // generar nuevo número
      const nuevo = Math.floor(Math.random() * 900) + 100;
      await db.query(
        'INSERT INTO ganador (numero, reclamado) VALUES (?, 0)',
        [nuevo]
      );

      res.json({
        message: 'Premio reclamado y nuevo número generado 🎊',
        nuevoNumeroGanador: nuevo
      });
    } catch (e) { res.status(500).json(e); }
  });

  /* ------- MARCAR ENTREGA ------- */
  app.post('/actualizar-entrega', async (req, res) => {
    const { numero } = req.body;
    try {
      await db.query(
        'UPDATE ganador SET entregado = 1 WHERE numero = ?',
        [numero]
      );
      res.json({ message: 'Premio marcado como entregado ✔' });
    } catch (e) { res.status(500).json(e); }
  });

  /* ------------------- ARRANQUE ------------------- */
  app.listen(PORT, () =>
    console.log(`🚀 Servidor ${NODE_ENV} corriendo en http://localhost:${PORT}`)
  );
}

/* ---------- INTENTAR GANAR SIEMPRE (PRUEBA) ---------- */
/*
 // Ruta de prueba que forzaba siempre acierto (desactivada)
 // app.post('/intentar', (req, res) => {
 //   db.query("SELECT numero FROM ganador ORDER BY id DESC LIMIT 1", (err, result) => {
 //     if (err) return res.status(500).json(err);
 //
 //     if (result.length > 0) {
 //       const numeroGanador = result[0].numero;
 //       const numeroAleatorio = numeroGanador; // 🔥 Fuerza que siempre gane
 //
 //       res.json({ intento: numeroAleatorio, numeroGanador, esGanador: true });
 //     } else {
 //       res.status(400).json({ message: 'No hay número ganador generado aún' });
 //     }
 //   });
 // });
*/
