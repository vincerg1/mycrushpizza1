import React, { useState, useEffect } from "react";
import axios from "axios";
import "./App.css";
import logo from "./logo/HOYnuevoLogoMyCrushPizza.jpeg";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faWhatsapp, faTiktok } from "@fortawesome/free-brands-svg-icons";
import { faMobileScreenButton } from "@fortawesome/free-solid-svg-icons";
import Confetti from "react-confetti";

/* ========= Config ========= */
const API_BASE = (process.env.REACT_APP_BACKEND_URL || "").replace(/\/+$/, "");

/* ===== Alternancia robusta de destino (1:1 global por dispositivo) ===== */
const TIKTOK_URL    = "https://www.tiktok.com/@luigiroppo?_t=ZN-8whjKa8Moxq&_r=1";
// Si quieres usar el mismo handle del footer, cambia al que prefieras
const INSTAGRAM_URL = "https://www.mycrushpizza.com/venta";

/* Nuevo esquema: contador + lock
   - mcp_redirect_seq: 0,1,2,3,... (pares→TikTok, impares→Instagram)
   - mcp_redirect_lock: evita colisiones entre pestañas simultáneas
*/
const REDIRECT_SEQ_KEY  = "mcp_redirect_seq";
const REDIRECT_LOCK_KEY = "mcp_redirect_lock";

/** Lock muy ligero con localStorage para serializar escrituras entre pestañas */
async function withLocalStorageLock(fn, { timeoutMs = 700 } = {}) {
  const token = `${Date.now()}_${Math.random()}`;
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    try {
      localStorage.setItem(REDIRECT_LOCK_KEY, token);
      // cede el turno para que otras pestañas puedan escribir si les toca
      await new Promise(r => setTimeout(r, 0));
      if (localStorage.getItem(REDIRECT_LOCK_KEY) === token) {
        try {
          return await fn();
        } finally {
          // libera el lock solo si sigue siendo nuestro
          if (localStorage.getItem(REDIRECT_LOCK_KEY) === token) {
            localStorage.removeItem(REDIRECT_LOCK_KEY);
          }
        }
      }
    } catch {
      // storage no disponible (modo incognito duro / bloqueado)
      break;
    }
    // pequeño backoff aleatorio
    await new Promise(r => setTimeout(r, 15 + Math.random() * 35));
  }
  // Fallback sin lock: reparte 50/50 para no sesgar
  return await fn();
}

/** Devuelve URL alternando 1:1: pares→TikTok, impares→Instagram */
async function getNextRedirectUrl() {
  try {
    return await withLocalStorageLock(() => {
      const raw = localStorage.getItem(REDIRECT_SEQ_KEY);
      const n = Number.isInteger(parseInt(raw, 10)) ? parseInt(raw, 10) : 0;
      const nextUrl = n % 2 === 0 ? TIKTOK_URL : INSTAGRAM_URL;
      localStorage.setItem(REDIRECT_SEQ_KEY, String(n + 1));
      return nextUrl;
    });
  } catch {
    // storage no disponible → alterna aleatorio
    return Math.random() < 0.5 ? TIKTOK_URL : INSTAGRAM_URL;
  }
}

/* ====== Helpers countdown ====== */
function formatCountdown(ms) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const hh = String(Math.floor(s / 3600)).padStart(2, "0");
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}

export default function JuegoPizza() {
  /* ---------------- Estados principales del juego ---------------- */
  const [numeroGanador, setNumeroGanador] = useState(null);
  const [intento, setIntento] = useState(null);
  const [esGanador, setEsGanador] = useState(false);
  const [mensaje, setMensaje] = useState("");
  const [intentosRestantes, setIntentosRestantes] = useState(3);
  const [showToast, setShowToast] = useState(false);
  const [modalAbierto, setModalAbierto] = useState(false);
  const [contacto, setContacto] = useState("");
  const [shakeGanador, setShakeGanador] = useState(false);

  /* --- Estados para el cupón --- */
  const [coupon, setCoupon] = useState(null); // { code, expiresAt }
  const [couponError, setCouponError] = useState(null);
  const [isClaiming, setIsClaiming] = useState(false);

  /* ---------------- Bloqueo / countdown ---------------- */
  const [lockedUntil, setLockedUntil] = useState(null);
  const [serverOffset, setServerOffset] = useState(0);
  const [remainingMs, setRemainingMs] = useState(0);
  const [showLockModal, setShowLockModal] = useState(false);
  const [ultimoNumeroGanado, setUltimoNumeroGanado] = useState(null);

  /* ---------------- Consentimiento legal ---------------- */
  const [showTerms, setShowTerms] = useState(
    () => !localStorage.getItem("mcp_termsAccepted")
  );
  const [showCookies, setShowCookies] = useState(
    () => !localStorage.getItem("mcp_cookiesConsent")
  );

  /* Inicializa el contador si no existe (para que la primera sea TikTok) */
  useEffect(() => {
    try {
      const raw = localStorage.getItem(REDIRECT_SEQ_KEY);
      if (!Number.isInteger(parseInt(raw, 10))) {
        localStorage.setItem(REDIRECT_SEQ_KEY, "0");
      }
      // Limpieza del esquema viejo si existiera
      localStorage.removeItem("mcp_redirect_toggle");
    } catch {}
  }, []);

  /* ---------------- Carga del número ganador + estado bloqueo ------------- */
  useEffect(() => {
    axios
      .get(`${API_BASE}/estado`)
      .then((res) => {
        const { numeroGanador, lockedUntil, now } = res.data || {};
        if (numeroGanador != null) setNumeroGanador(numeroGanador);

        if (now) {
          const offset = Date.now() - new Date(now).getTime();
          setServerOffset(offset);
        }

        if (lockedUntil) {
          setLockedUntil(lockedUntil);
          setShowLockModal(true);
        }
      })
      .catch((err) => {
        axios
          .get(`${API_BASE}/ganador`)
          .then((r) => setNumeroGanador(r.data.numeroGanador))
          .catch((e) => console.error("Error estado/ganador:", e || err));
      });
  }, []);

  /* --------- Ticker del countdown --------- */
  useEffect(() => {
    if (!lockedUntil) return;
    const untilTs = new Date(lockedUntil).getTime();
    const tick = () => {
      const nowAdj = Date.now() - serverOffset;
      const left = untilTs - nowAdj;
      setRemainingMs(left);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [lockedUntil, serverOffset]);

  /* --------- Revalidar estado cuando termina el bloqueo --------- */
  useEffect(() => {
    if (!lockedUntil || remainingMs > 0) return;
    axios
      .get(`${API_BASE}/estado`)
      .then(({ data }) => {
        if (data.lockedUntil) {
          setLockedUntil(data.lockedUntil);
        } else {
          setLockedUntil(null);
          setShowLockModal(false);
        }
        if (data.numeroGanador != null) setNumeroGanador(data.numeroGanador);
      })
      .catch(() => {});
  }, [remainingMs, lockedUntil]);

  /* -------------- Aceptación legal ---------------------- */
  const aceptarTerminos = () => {
    localStorage.setItem("mcp_termsAccepted", "true");
    setShowTerms(false);
  };
  const aceptarCookies = () => {
    localStorage.setItem("mcp_cookiesConsent", "all");
    setShowCookies(false);
  };
  const rechazarCookies = () => {
    localStorage.setItem("mcp_cookiesConsent", "none");
    setShowCookies(false);
  };

  /* ------------ INTENTAR GANAR --------------- */
  const intentarGanar = async () => {
    if (intentosRestantes === 0 || showTerms || (lockedUntil && remainingMs > 0)) return;

    try {
      const { data } = await axios.post(`${API_BASE}/intentar`);
      setIntento(data.intento);
      setEsGanador(Boolean(data.esGanador));

      setIntentosRestantes((prev) => {
        const left = prev - 1;
        if (left === 0 && !data.esGanador) {
          (async () => {
            const url = await getNextRedirectUrl();
            // assign en lugar de href para respetar historia
            setTimeout(() => window.location.assign(url), 2000);
          })();
        }
        return left;
      });

      if (data.esGanador) {
        setMensaje("🎉 ¡Ganaste una pizza!");
        if (data.lockedUntil) {
          setLockedUntil(data.lockedUntil);
          setUltimoNumeroGanado(data.numeroGanador);
        }
        setShowLockModal(false);
        setCoupon(null);
        setCouponError(null);
        setModalAbierto(true);
      } else {
        setMensaje("Sigue intentando 🍀");
        setShowToast(true);
      }

      setShakeGanador(!data.esGanador);
      setTimeout(() => {
        setShowToast(false);
        setShakeGanador(false);
      }, 2000);
    } catch (error) {
      const status = error?.response?.status;
      const resp = error?.response?.data;
      if (status === 423 && resp?.lockedUntil) {
        setLockedUntil(resp.lockedUntil);
        setUltimoNumeroGanado(numeroGanador);
        setShowLockModal(true);
      } else {
        console.error("Error /intentar:", error);
      }
    }
  };

  /* ------------ RECLAMAR PIZZA --------------- */
  const reclamarPizza = async () => {
    if (!contacto) return alert("Por favor, ingresa un número de contacto.");
    setIsClaiming(true);
    setCouponError(null);

    try {
      const { data } = await axios.post(`${API_BASE}/reclamar`, { contacto });

      if (data.couponIssued && data.coupon?.code) {
        setCoupon({
          code: data.coupon.code,
          expiresAt: data.coupon.expiresAt,
        });
      } else {
        setCouponError(
          data.couponError ||
            "No se pudo emitir el cupón automáticamente. Si ya tienes el número ganador, contáctanos para ayudarte."
        );
      }
    } catch (error) {
      console.error("Error /reclamar:", error);
      setCouponError("Error de red/servidor al reclamar el premio.");
    } finally {
      setIsClaiming(false);
    }
  };

  const cerrarModalGanador = () => {
    setModalAbierto(false);
    setEsGanador(false); // apaga confetti
    if (lockedUntil && remainingMs > 0) setShowLockModal(true);
  };

  /* ------------- UI ---------------- */
  const botonDeshabilitado =
    intentosRestantes === 0 || showTerms || (lockedUntil && remainingMs > 0);

  return (
    <div className="container">
      {/* --------- MODAL BASES LEGALES --------- */}
      {showTerms && (
        <div className="overlay">
          <div className="modal-legal">
            <h2 className="pulse-heading">Antes de jugar</h2>
            <p>
              Para participar debes ser mayor de 18 años y aceptar nuestras&nbsp;
              <a href="/bases.html" target="_blank" rel="noopener noreferrer">Bases Legales</a>&nbsp;y&nbsp;
              <a href="/privacidad.html" target="_blank" rel="noopener noreferrer">Política de Privacidad</a>.
            </p>
            <button className="btn-acepto" onClick={aceptarTerminos}>Acepto</button>
          </div>
        </div>
      )}

      {/* --------- MODAL BLOQUEO (countdown) --------- */}
      {showLockModal && lockedUntil && remainingMs > 0 && !modalAbierto && (
        <div className="overlay">
          <div className="modal-legal lock-modal">
            <h2 className="lock-title">Juego en pausa ⏳</h2>
            <p className="lock-subtitle">Hace nada hubo un ganador.</p>
            {ultimoNumeroGanado != null && (
              <p className="lock-subtitle">
                Último número ganador:&nbsp;
                <span className="pill">{String(ultimoNumeroGanado).padStart(3, "0")}</span>
              </p>
            )}
            <p className="lock-caption">Se reanudará en:</p>
            <div className="countdown">{formatCountdown(remainingMs)}</div>
            <p className="lock-eta">Hora estimada: {new Date(lockedUntil).toLocaleTimeString()}</p>
          </div>
        </div>
      )}

      {esGanador && <Confetti numberOfPieces={300} />}

      {/* ======= TARJETA BLANCA: LOGO + NÚMERO ======= */}
      <div className="card">
        <img
          src={logo}
          alt="MyCrushPizza"
          className="logo logo--in-card"
        />
        {numeroGanador !== null && (
          <div className={`numero-ganador ${shakeGanador ? "shake" : ""}`}>
            <h2 className="winner-title">NÚMERO GANADOR</h2>
            <div className="numero-casillas">
              {numeroGanador.toString().padStart(3, "0").split("").map((d, i) => (
                <span key={i} className="casilla">{d}</span>
              ))}
            </div>
          </div>
        )}
      </div>

      <button
        className="boton-intentar shine-button"
        onClick={intentarGanar}
        disabled={botonDeshabilitado}
      >
        Suerte! =) 🎲🍕
      </button>

      <p className="intentos">Intentos restantes: {intentosRestantes}</p>

      {showToast && (
        <div className="toast-bubble">
          <span className="toast-numero">{intento?.toString().padStart(3, "0")}</span>
          <p>{mensaje}</p>
        </div>
      )}

      {/* --------- MODAL GANADOR / CUPÓN --------- */}
      {modalAbierto && (
        <div
          className="modal"
          role="dialog"
          aria-modal="true"
          onClick={() => setModalAbierto(false)}
        >
          <div className="modal-contenido" onClick={(e) => e.stopPropagation()}>
            <button
              className="modal-close"
              aria-label="Cerrar"
              onClick={() => setModalAbierto(false)}
              title="Cerrar"
            >
              ✕
            </button>

            {!coupon ? (
              <>
                <h2>🎉 ¡Ganaste una pizza! 🎉</h2>
                <p>Ingresa tu número de contacto para reclamarla:</p>
                <input
                  type="text"
                  placeholder="Tu número"
                  value={contacto}
                  onChange={(e) => setContacto(e.target.value)}
                />
                <button
                  className="boton-reclamar"
                  onClick={reclamarPizza}
                  disabled={isClaiming}
                >
                  {isClaiming ? "Procesando…" : "Reclamar Pizza 🎊"}
                </button>
                {couponError && (
                  <p style={{ color: "#e63946", marginTop: 12 }}>{couponError}</p>
                )}
              </>
            ) : (
              <>
                <h2>🎟️ ¡Cupón listo!</h2>
                <p>Usa este código en el portal de ventas dentro del tiempo indicado.</p>
                <div className="coupon-code">{coupon.code}</div>
                <p>Vence: {new Date(coupon.expiresAt).toLocaleString()}</p>

                <div style={{ marginTop: 12 }}>
                  <button
                    className="boton-reclamar"
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(coupon.code);
                        alert("Código copiado ✅");
                      } catch {}
                    }}
                  >
                    Copiar código
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* --------- Banner cookies simple --------- */}
      {showCookies && (
        <div className="cookie-banner">
          <span>
            Usamos cookies para análisis y personalización. Más info en nuestra&nbsp;
            <a href="/cookies.html" target="_blank" rel="noopener noreferrer">Política de Cookies</a>.
          </span>
          <div className="cookie-actions">
            <button
              className="btn-cookies no"
              onClick={() => {
                localStorage.setItem("mcp_cookiesConsent", "none");
                setShowCookies(false);
              }}
            >
              Rechazar
            </button>
            <button className="btn-cookies yes" onClick={aceptarCookies}>
              Aceptar
            </button>
          </div>
        </div>
      )}

      <footer className="footer">
        <div className="footer__inner">
          <p className="info-text">¡Más información aquí!</p>

          <div className="social-icons">
            <a
              href="https://wa.me/34694301433"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="WhatsApp Chat"
            >
              <FontAwesomeIcon icon={faWhatsapp} className="icon" />
            </a>
            <a
              href="https://www.tiktok.com/@mycrushpizza1?_t=ZN-8whjKa8Moxq&_r=1"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="TikTok"
            >
              <FontAwesomeIcon icon={faTiktok} className="icon" />
            </a>
            <a href="tel:694301433" className="call-link" aria-label="Llamar">
              <FontAwesomeIcon icon={faMobileScreenButton} className="icon" />
            </a>
          </div>

          <p className="footer__legal">
            © {new Date().getFullYear()} MyCrushPizza SL.
            <br />
            Todos los derechos reservados.
          </p>

          <p className="footer__links">
            <a href="/bases.html" target="_blank" rel="noopener noreferrer">
              Términos y condiciones
            </a>
            ·
            <a href="/privacidad.html" target="_blank" rel="noopener noreferrer">
              Privacidad
            </a>
            ·
            <a href="/cookies.html" target="_blank" rel="noopener noreferrer">
              Política de cookies
            </a>
            ·
            <a
              href="#"
              onClick={(e) => {
                e.preventDefault();
                localStorage.setItem("mcp_cookiesConsent", "");
                window.location.reload();
              }}
            >
              Preferencias de cookies
            </a>
          </p>
        </div>
      </footer>
    </div>
  );
}
