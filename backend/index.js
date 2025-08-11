/*****************************************************************
 *  myCrushPizza – Backend (bloqueo 24h + historial)
 *  – Pool con keep-alive
 *  – Ping preventivo cada 5 min
 *  – Logging sin exponer la contraseña
 *  – Bloqueo global de 24h y tabla de historial
 *****************************************************************/

require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const mysql   = require('mysql2/promise');

const NODE_ENV  = process.env.NODE_ENV || 'development';
const PORT      = process.env.PORT     || 8080;
const FORCE_WIN = process.env.FORCE_WIN === '1';  // <-- modo prueba: ganar siempre
const nodemailer = require('nodemailer');
const LOCK_MINUTES = Number(process.env.LOCK_MINUTES || 24 * 60); // por defecto 24h

const mailer = (() => {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 587);
  const secure = process.env.SMTP_SECURE === '1';
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !user || !pass) {
    console.log('✉️  Email desactivado (faltan variables SMTP).');
    return null;
  }

  const transporter = nodemailer.createTransport({
    host, port, secure, auth: { user, pass }
  });

  async function notifyWin({ numeroGanador, intento, ip, lockedUntil }) {
    try {
      const to = (process.env.MAIL_TO || '').split(',').map(s => s.trim()).filter(Boolean);
      if (!to.length) return;

      const subject = `🍕 ¡Hay ganador! Nº ${numeroGanador}`;
      const text = `Se acertó el número ${numeroGanador}.
Intento: ${intento}
IP: ${ip || '-'}
Bloqueo hasta (UTC): ${lockedUntil || '-'}
Fecha servidor (UTC): ${new Date().toISOString()}`;

      const html = `
        <h2>🍕 ¡Hay ganador!</h2>
        <p><strong>Número ganador:</strong> ${numeroGanador}</p>
        <p><strong>Intento:</strong> ${intento}</p>
        <p><strong>IP:</strong> ${ip || '-'}</p>
        <p><strong>Bloqueo hasta (UTC):</strong> ${lockedUntil || '-'}</p>
        <p style="opacity:.7">Fecha servidor (UTC): ${new Date().toISOString()}</p>
      `;

      await transporter.sendMail({
        from: process.env.MAIL_FROM || 'noreply@local',
        to,
        subject,
        text,
        html
      });
      console.log('✉️  Email de ganador enviado a:', to.join(', '));
    } catch (err) {
      console.warn('⚠️  Falló el envío de email:', err.message);
    }
  }

  return { notifyWin };
})();

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
console.log('⏱️  LOCK_MINUTES =', LOCK_MINUTES);

/*-------------- 2. CREAR EL POOL Y PROBAR CONEXIÓN ---------------*/
let db;

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

    await db.query('SELECT 1');
    console.log(`✅ Conectado a MySQL (${cfg.host || 'via DATABASE_URL'})`);

    // Ping preventivo cada 5 min
    setInterval(() => {
      db.query('SELECT 1').catch(() => {});
    }, 5 * 60 * 1000);

    // Seguridad: asegurar fila única en juego_estado (id=1)
    await db.query('INSERT IGNORE INTO juego_estado (id) VALUES (1)');

    startServer();
  } catch (err) {
    console.error('❌ No se pudo conectar a MySQL:', err.code || err.message);
    process.exit(1);
  }
})();

/*-------------- Helpers ------------------------------------------*/
function getClientIp(req) {
  return (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '')
    .split(',')[0].trim();
}

async function getWinnerNumber() {
  const [[row]] = await db.query('SELECT numero FROM ganador ORDER BY id DESC LIMIT 1');
  return row ? row.numero : null;
}

async function getLock() {
  const [[st]] = await db.query('SELECT lock_until FROM juego_estado WHERE id=1');
  return st ? st.lock_until : null;
}

async function setLock(minutes = LOCK_MINUTES) {
  // calcula la fecha absoluta en UTC ahora + minutes
  const until = new Date(Date.now() + minutes * 60 * 1000);

  const [r] = await db.query(
    `UPDATE juego_estado
       SET lock_until = ?
     WHERE id = 1
       AND (lock_until IS NULL OR lock_until < UTC_TIMESTAMP())`,
    [until]
  );
  return r.affectedRows; // 1 si aplicó el lock
}

async function clearLock() {
  await db.query('UPDATE juego_estado SET lock_until = NULL WHERE id = 1');
}
async function logEvent({ evento, intento_valor = null, resultado = null, numero_ganador = null, ip = null }) {
  try {
    await db.query(
      `INSERT INTO juego_historial (evento, intento_valor, resultado, numero_ganador, ip)
       VALUES (?, ?, ?, ?, ?)`,
      [evento, intento_valor, resultado, numero_ganador, ip]
    );
  } catch (e) {
    // No romper el flujo si el log falla
    console.warn('⚠️  No se pudo escribir en juego_historial:', e.code || e.message);
  }
}

/*-------------- 3. DEFINICIÓN DE ENDPOINTS -----------------------*/
function startServer () {
  const app = express();
  app.use(cors());
  app.use(express.json());

  app.get('/', async (_, res) =>
    res.send(`Servidor funcionando correctamente 🚀 (${new Date().toISOString()})`)
  );

  /* ------- ESTADO (para countdown en frontend) ------- */
  app.get('/estado', async (_, res) => {
    try {
      const numeroGanador = await getWinnerNumber();
      const lockedUntil   = await getLock();
      res.json({
        numeroGanador,
        lockedUntil,                 // puede ser null o fecha
        now: new Date().toISOString()// hora del servidor (node) en ISO
      });
    } catch (e) { res.status(500).json(e); }
  });

  /* ------- LISTAR GANADORES ENTREGADOS ------- */
  app.get('/lista-ganadores', async (_, res) => {
    try {
      const [rows] = await db.query(
        `SELECT id, numero
           FROM ganador
          WHERE reclamado = 1
            AND entregado = 0
       ORDER BY id DESC`
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
           FROM ganador
          WHERE numero = ?
            AND reclamado = 1`,
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
      const numeroGanador = await getWinnerNumber();
      if (numeroGanador == null)
        return res.status(400).json({ message: 'No hay número ganador generado aún' });
      res.json({ numeroGanador });
    } catch (e) { res.status(500).json(e); }
  });

  /* ------- GENERAR NUEVO Nº GANADOR ------- */
  app.post('/generar-ganador', async (_, res) => {
    const n = Math.floor(Math.random() * 900) + 100; // 100-999
    try {
      await db.query('INSERT INTO ganador (numero, reclamado) VALUES (?, 0)', [n]);
      res.json({ message: 'Número ganador generado 🎉', numeroGanador: n });
    } catch (e) { res.status(500).json(e); }
  });

  /* ------- INTENTAR GANAR (con bloqueo 24 h y log) ------- */
    app.post('/intentar', async (req, res) => {
      const ip = getClientIp(req);

      try {
        // 1) ¿Juego bloqueado?
        const lock = await getLock();
        const now  = new Date();
        if (lock && new Date(lock) > now) {
          return res.status(423).json({ reason: 'LOCKED_24H', lockedUntil: lock });
        }

        // 2) Obtener ganador actual
        const numeroGanador = await getWinnerNumber();
        if (numeroGanador == null) {
          return res.status(400).json({ message: 'No hay número ganador generado aún' });
        }

        // 3) Intento y resultado
        let intento = Math.floor(Math.random() * 900) + 100;
        if (FORCE_WIN) intento = numeroGanador; // modo prueba

        const esGanador = intento === numeroGanador;

        // 4) Log attempt
        await logEvent({
          evento: 'attempt',
          intento_valor: intento,
          resultado: esGanador ? 'win' : 'lose',
          numero_ganador: numeroGanador,
          ip
        });

        // 5) Si gana, bloquear 24 h, log win y (si aplica) enviar email
        let lockedUntil = null;
        if (esGanador) {
          const applied = await setLock();     // ← devuelve 1 si aplicó el lock (aún no estaba)
          lockedUntil   = await getLock();

          await logEvent({
            evento: 'win',
            intento_valor: intento,
            resultado: 'win',
            numero_ganador: numeroGanador,
            ip
          });

          // Notificar SOLO si este proceso aplicó el lock (evita duplicados)
          if (applied === 1 && mailer) {
            mailer.notifyWin({ numeroGanador, intento, ip, lockedUntil }).catch(() => {});
          }
        }

        res.json({ intento, numeroGanador, esGanador, lockedUntil });
      } catch (e) {
        res.status(500).json(e);
      }
    });

  /* ------- RECLAMAR PREMIO (log claim) ------- */
  app.post('/reclamar', async (req, res) => {
    const { contacto } = req.body;
    const ip = getClientIp(req);

    try {
      // último ganador no reclamado
      const [[g]] = await db.query(
        'SELECT id, numero FROM ganador WHERE reclamado = 0 ORDER BY id DESC LIMIT 1'
      );
      if (!g)
        return res.status(400).json({ message: 'No hay número ganador activo para reclamar' });

      await db.query(
        `UPDATE ganador
            SET reclamado = 1,
                contacto = ?,
                reclamado_en = CURRENT_TIMESTAMP
          WHERE id = ?`,
        [contacto, g.id]
      );

      // log claim
      await logEvent({
        evento: 'claim',
        intento_valor: null,
        resultado: null,
        numero_ganador: g.numero,
        ip
      });

      // generar nuevo número
      const nuevo = Math.floor(Math.random() * 900) + 100;
      await db.query('INSERT INTO ganador (numero, reclamado) VALUES (?, 0)', [nuevo]);

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
      await db.query('UPDATE ganador SET entregado = 1 WHERE numero = ?', [numero]);
      res.json({ message: 'Premio marcado como entregado ✔' });
    } catch (e) { res.status(500).json(e); }
  });

  /* ------- Herramientas de desarrollo ------- */
  if (NODE_ENV !== 'production') {
    // limpiar bloqueo para pruebas rápidas
    app.post('/__dev__/unlock', async (_, res) => {
      await clearLock();
      const lock = await getLock();
      res.json({ message: 'Bloqueo limpiado', lockedUntil: lock });
    });

    console.log(`🧪 Modo prueba FORCE_WIN=${FORCE_WIN ? 'ON' : 'OFF'}`);
  }

  /* ------------------- ARRANQUE ------------------- */
  app.listen(PORT, () =>
    console.log(`🚀 Servidor ${NODE_ENV} corriendo en http://localhost:${PORT}`)
  );
}

/* ---------- INTENTAR GANAR SIEMPRE (PRUEBA) ---------- */
/*
  Mantienes esta sección por si prefieres activarla manualmente.
  Ahora la ruta /intentar ya fuerza el acierto si pones FORCE_WIN=1 en .env
  Ejemplo:
    FORCE_WIN=1 NODE_ENV=development node index.js
*/
