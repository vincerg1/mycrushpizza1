/*****************************************************************
 *  myCrushPizza – Backend (bloqueo + historial)
 *  – Pool con keep-alive
 *  – Ping preventivo cada 5 min
 *  – Logging sin exponer la contraseña
 *  – Bloqueo global del juego tras ganar
 *  – 🔗 Emisión de cupón FP en proyecto "ventas" al reclamar premio
 *****************************************************************/

require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const mysql   = require('mysql2/promise');
const nodemailer = require('nodemailer');

// 🔗 Ventas: HTTP nativo
const { URL } = require('url');
const https = require('https');
const http  = require('http');

const NODE_ENV  = process.env.NODE_ENV || 'development';
const PORT      = process.env.PORT     || 8080;
const FORCE_WIN = process.env.FORCE_WIN === '1';

/** 🔒 BLOQUEO DEL JUEGO
 *  Queremos bloquear el juego un **minuto** tras un ganador.
 *  Se puede ajustar con la env LOCK_MINUTES (por defecto 1).
 */
const LOCK_MINUTES = Number(
  process.env.LOCK_MINUTES !== undefined ? process.env.LOCK_MINUTES : 1
); // ← por defecto 1 minuto

/* ---------- 🔗 VENTAS: Config de integración ---------- */
const SALES = {
  base     : (process.env.SALES_API_URL || '').trim(),       // ej. https://mycrushpizza-parche-production.up.railway.app
  key      : (process.env.SALES_API_KEY || '').trim(),       // clave compartida
  issuePath: process.env.SALES_COUPON_PATH || '/api/coupons/issue',
  /** ⏱️ Vida del cupón (horas). Por defecto 24 h. */
  hours    : Number(
              process.env.SALES_COUPON_HOURS_TO_EXPIRY !== undefined
                ? process.env.SALES_COUPON_HOURS_TO_EXPIRY
                : 24
            ),
  tenant   : process.env.TENANT_ID || null,                  // opcional
};
const salesEnabled = !!(SALES.base && SALES.key);

/* ---------- Email (opcional) ---------- */
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

  const transporter = nodemailer.createTransport({ host, port, secure, auth: { user, pass } });

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
        to, subject, text, html
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
  const [r] = await db.query(
    `UPDATE juego_estado
       SET lock_until = DATE_ADD(UTC_TIMESTAMP(), INTERVAL ? MINUTE)
     WHERE id = 1
       AND (lock_until IS NULL OR lock_until < UTC_TIMESTAMP())`,
    [minutes]
  );
  return r.affectedRows; // 1 si aplicó el lock, 0 si ya estaba bloqueado
}

async function clearLock() {
  await db.query('UPDATE juego_estado SET lock_until = NULL WHERE id = 1');
}

// Nota: esta versión asume columna "extra" (JSON) en juego_historial.
// Si aún no la tienes, elimina el campo "extra" del INSERT.
async function logEvent({ evento, intento_valor = null, resultado = null, numero_ganador = null, ip = null, extra = null }) {
  try {
    await db.query(
      `INSERT INTO juego_historial (evento, intento_valor, resultado, numero_ganador, ip, extra)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [evento, intento_valor, resultado, numero_ganador, ip, extra ? JSON.stringify(extra) : null]
    );
  } catch (e) {
    console.warn('⚠️  No se pudo escribir en juego_historial:', e.code || e.message);
  }
}

/* ---------- 🔗 VENTAS: cliente HTTP JSON + idempotencia ---------- */
function postJson(urlStr, payload, headers = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(urlStr);
    const body = JSON.stringify(payload);
    const isHttps = u.protocol === 'https:';
    const options = {
      hostname: u.hostname,
      port: u.port || (isHttps ? 443 : 80),
      path: u.pathname + (u.search || ''),
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
        ...headers
      },
      timeout: 8000
    };
    const req = (isHttps ? https : http).request(options, (res) => {
      let raw = '';
      res.on('data', (d) => (raw += d));
      res.on('end', () => {
        let json = null;
        try { json = raw ? JSON.parse(raw) : null; } catch { /* noop */ }
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve({ status: res.statusCode, data: json });
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${raw || '(sin cuerpo)'}`));
        }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(new Error('timeout')); });
    req.write(body);
    req.end();
  });
}

function salesUrl(pathname) {
  const base = SALES.base.replace(/\/+$/, '');
  const path = pathname.startsWith('/') ? pathname : `/${pathname}`;
  return `${base}${path}`;
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

  /* ------- LISTAR GANADORES RECLAMADOS Y NO ENTREGADOS ------- */
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

  /* ------- INTENTAR GANAR (con bloqueo y log) ------- */
  app.post('/intentar', async (req, res) => {
    const ip = getClientIp(req);

    try {
      // 1) ¿Juego bloqueado?
      const lock = await getLock();
      const now  = new Date();
      if (lock && new Date(lock) > now) {
        return res.status(423).json({ reason: 'LOCKED', lockedUntil: lock });
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

      // 5) Si gana, bloquear (LOCK_MINUTES), log y (si aplica) email
      let lockedUntil = null;
      if (esGanador) {
        const applied = await setLock();     // 1 si aplicó el lock
        lockedUntil   = await getLock();

        await logEvent({
          evento: 'win',
          intento_valor: intento,
          resultado: 'win',
          numero_ganador: numeroGanador,
          ip
        });

        if (applied === 1 && mailer) {
          mailer.notifyWin({ numeroGanador, intento, ip, lockedUntil }).catch(() => {});
        }
      }

      res.json({ intento, numeroGanador, esGanador, lockedUntil });
    } catch (e) {
      res.status(500).json(e);
    }
  });

  /* ------- RECLAMAR PREMIO (log claim + 🔗 emitir cupón en VENTAS) ------- */
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

      // LOG: claim
      await logEvent({
        evento: 'claim',
        resultado: 'ok',
        numero_ganador: g.numero,
        ip,
        extra: { contacto }
      });

      /* ---------- 🔗 VENTAS: emitir cupón FP (24 h por defecto) ---------- */
      let couponResp = null;
      let couponErr  = null;

      if (salesEnabled) {
        const url  = salesUrl(SALES.issuePath);
        const idem = `claim-${g.id}`; // idempotencia por reclamo

        const hoursForCoupon = Number.isFinite(SALES.hours) && SALES.hours > 0 ? SALES.hours : 24;

        const payload = {
          hours: hoursForCoupon,
          prefix: 'MCP-FP',
          source: 'game',
          gameNumber: g.numero,
          contact: contacto,
          tenant: SALES.tenant
        };

        try {
          const { data } = await postJson(url, payload, {
            'x-api-key': SALES.key,
            'x-idempotency-key': idem
          });
          couponResp = data || null;

          // LOG OK
          await logEvent({
            evento: 'coupon_issue',
            resultado: 'ok',
            numero_ganador: g.numero,
            ip,
            extra: { idem, returned: couponResp }
          });
        } catch (err) {
          couponErr = err.message || String(err);
          console.warn('⚠️  Emisión de cupón en VENTAS falló:', couponErr);

          // LOG FAIL
          await logEvent({
            evento: 'coupon_issue',
            resultado: 'fail',
            numero_ganador: g.numero,
            ip,
            extra: { idem, error: couponErr }
          });
        }
      } else {
        console.log('ℹ️  Integración con VENTAS deshabilitada (faltan SALES_API_URL / SALES_API_KEY).');
      }

      // generar nuevo número (independiente del cupón)
      const nuevo = Math.floor(Math.random() * 900) + 100;
      await db.query('INSERT INTO ganador (numero, reclamado) VALUES (?, 0)', [nuevo]);

      res.json({
        message: 'Premio reclamado y nuevo número generado 🎊',
        nuevoNumeroGanador: nuevo,
        couponIssued: !!couponResp,
        coupon: couponResp && {
          code: couponResp.code || couponResp.coupon?.code || null,
          expiresAt: couponResp.expiresAt || couponResp.coupon?.expiresAt || null
        },
        couponError: couponErr
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
