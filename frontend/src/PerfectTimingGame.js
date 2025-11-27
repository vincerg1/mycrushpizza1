// PerfectTimingGame.js
import React, { useState, useRef, useEffect } from "react";
import "./PerfectTimingGame.css";
import logo from "./logo/HOYnuevoLogoMyCrushPizza.jpeg";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faWhatsapp, faTiktok } from "@fortawesome/free-brands-svg-icons";
import { faMobileScreenButton } from "@fortawesome/free-solid-svg-icons";
import axios from "axios";

const TARGET_MS = 9990;   // 9,99 s
const TOLERANCE_MS = 40;  // margen de acierto (40 ms ≈ 0,04 s)
const MAX_ATTEMPTS = 10;

/* ========= Backend del juego ========= */
const API_BASE = (process.env.REACT_APP_BACKEND_URL || "").replace(/\/+$/, "");

/* ========= Redirecciones (mismo esquema que JuegoPizza) ========= */
const TIKTOK_URL    = "https://www.tiktok.com/@luigiroppo?_t=ZN-8whjKa8Moxq&_r=1";
const INSTAGRAM_URL = "https://www.mycrushpizza.com/venta";

const REDIRECT_SEQ_KEY  = "mcp_redirect_seq";
const REDIRECT_LOCK_KEY = "mcp_redirect_lock";

/** Lock ligero con localStorage para serializar escrituras entre pestañas */
async function withLocalStorageLock(fn, { timeoutMs = 700 } = {}) {
  const token = `${Date.now()}_${Math.random()}`;
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    try {
      localStorage.setItem(REDIRECT_LOCK_KEY, token);
      await new Promise((r) => setTimeout(r, 0));
      if (localStorage.getItem(REDIRECT_LOCK_KEY) === token) {
        try {
          return await fn();
        } finally {
          if (localStorage.getItem(REDIRECT_LOCK_KEY) === token) {
            localStorage.removeItem(REDIRECT_LOCK_KEY);
          }
        }
      }
    } catch {
      break;
    }
    await new Promise((r) =>
      setTimeout(r, 15 + Math.random() * 35)
    );
  }
  return await fn();
}

/** Alterna 1:1 entre TikTok y la página de ventas */
async function getNextRedirectUrl() {
  try {
    return await withLocalStorageLock(() => {
      const raw = localStorage.getItem(REDIRECT_SEQ_KEY);
      const n = Number.isInteger(parseInt(raw, 10))
        ? parseInt(raw, 10)
        : 0;
      const nextUrl = n % 2 === 0 ? TIKTOK_URL : INSTAGRAM_URL;
      localStorage.setItem(REDIRECT_SEQ_KEY, String(n + 1));
      return nextUrl;
    });
  } catch {
    return Math.random() < 0.5 ? TIKTOK_URL : INSTAGRAM_URL;
  }
}

/* ========= Portal de ventas para aplicar el cupón ========= */
const SALES_URL = "https://www.mycrushpizza.com/venta";
function goToSalesWithCoupon(code) {
  const url = new URL(SALES_URL);
  url.searchParams.set("coupon", code);
  window.location.href = url.toString();
}

/* ---------------- Helpers ---------------- */
function formatTime(ms) {
  const seconds = ms / 1000;
  return seconds.toFixed(2);
}

export default function PerfectTimingGame() {
  const [timeMs, setTimeMs] = useState(0);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState(null); // "win" | "lose" | null
  const [deltaMs, setDeltaMs] = useState(null);
  const [attemptsLeft, setAttemptsLeft] = useState(MAX_ATTEMPTS);

  const rafIdRef = useRef(null);
  const startTimeRef = useRef(null);

  /* --- Estados para premio/cupón (similar a JuegoPizza) --- */
  const [winnerModalOpen, setWinnerModalOpen] = useState(false);
  const [contact, setContact] = useState("");
  const [coupon, setCoupon] = useState(null);        // { code, expiresAt }
  const [couponError, setCouponError] = useState(null);
  const [isClaiming, setIsClaiming] = useState(false);
  const [prizeName, setPrizeName] = useState(null);  // nombre del cupón/premio

  // Inicializa el contador de redirecciones (igual que en JuegoPizza)
  useEffect(() => {
    try {
      const raw = localStorage.getItem(REDIRECT_SEQ_KEY);
      if (!Number.isInteger(parseInt(raw, 10))) {
        localStorage.setItem(REDIRECT_SEQ_KEY, "0");
      }
      localStorage.removeItem("mcp_redirect_toggle");
    } catch {}
  }, []);

  // Loop del cronómetro con requestAnimationFrame
  useEffect(() => {
    if (!running) return;

    function tick(now) {
      if (!startTimeRef.current) {
        // empezamos contando desde el estado actual
        startTimeRef.current = now - timeMs;
      }
      const elapsed = now - startTimeRef.current;
      setTimeMs(elapsed);
      rafIdRef.current = requestAnimationFrame(tick);
    }

    rafIdRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafIdRef.current) {
        cancelAnimationFrame(rafIdRef.current);
      }
    };
  }, [running, timeMs]);

  function handleToggle() {
    // Si ya no quedan intentos, no hacemos nada
    if (!running && attemptsLeft === 0) {
      return;
    }

    if (!running) {
      // START
      setResult(null);
      setDeltaMs(null);
      startTimeRef.current = null;
      setTimeMs(0);
      setRunning(true);
    } else {
      // STOP
      setRunning(false);
      if (rafIdRef.current) {
        cancelAnimationFrame(rafIdRef.current);
      }
      const delta = Math.abs(timeMs - TARGET_MS);
      setDeltaMs(delta);
      const isWin = delta <= TOLERANCE_MS;

      if (isWin) {
        setResult("win");
        setPrizeName(null);       // se rellenará si el backend devuelve nombre
        setCoupon(null);
        setCouponError(null);
        setWinnerModalOpen(true); // 👉 abre modal de ganador
      } else {
        setResult("lose");
      }

      // Consumimos intento y, si se acaban sin ganar, redirigimos
      setAttemptsLeft((prev) => {
        if (prev <= 0) return 0;
        const next = prev - 1;

        if (next === 0 && !isWin) {
          (async () => {
            const url = await getNextRedirectUrl();
            setTimeout(() => window.location.assign(url), 2000);
          })();
        }

        return next;
      });
    }
  }

  async function reclamarCupon() {
    if (!contact) {
      alert("Por favor, ingresa un número de contacto.");
      return;
    }
    setIsClaiming(true);
    setCouponError(null);

    try {
      const { data } = await axios.post(`${API_BASE}/reclamar`, {
        contacto: contact,
        gameId: 2, // importante para que el backend asocie al GAME_ID=2
      });

      console.log("[PerfectTime /reclamar] resp:", data);

      if (data.couponIssued && data.coupon?.code) {
        setCoupon({
          code: data.coupon.code,
          expiresAt: data.coupon.expiresAt,
        });
        setPrizeName(
          data.coupon?.name ||
            data.prizeName ||
            data.couponName ||
            prizeName
        );
      } else {
        setCouponError(
          data.couponError ||
            "No se pudo emitir el cupón automáticamente. Si ya tienes el premio, contáctanos para ayudarte."
        );
      }
    } catch (error) {
      console.error("Error PerfectTime /reclamar:", error);
      setCouponError("Error de red/servidor al reclamar el premio.");
    } finally {
      setIsClaiming(false);
    }
  }

  function cerrarModalGanador() {
    setWinnerModalOpen(false);
  }

  const displayTime = formatTime(timeMs);
  const offBySeconds =
    deltaMs != null ? (deltaMs / 1000).toFixed(2) : null;

  return (
    <div className="container ptg-root">
      {/* ======= TARJETA BLANCA: LOGO + TÍTULO (estilo JuegoPizza) ======= */}
      <div className="card ptg-header-card">
        <img
          src={logo}
          alt="MyCrushPizza"
          className="logo logo--in-card"
        />
      </div>

      {/* ======= CUERPO DEL JUEGO ======= */}
      <div className="ptg-card">
        <main className="ptg-main">
          <div
            className={
              "ptg-display" +
              (result === "win" ? " ptg-display--win" : "") +
              (result === "lose" ? " ptg-display--lose" : "")
            }
          >
            <span className="ptg-display-time">{displayTime}</span>
            <span className="ptg-display-unit">sec</span>
          </div>

          <button
            type="button"
            className={
              "ptg-button" +
              (running ? " ptg-button--stop" : " ptg-button--start")
            }
            onClick={handleToggle}
            disabled={!running && attemptsLeft === 0}
          >
            {running ? "STOP" : "START"}
          </button>

          <p className="ptg-attempts">
            Attempts left: {attemptsLeft}
          </p>

          <div className="ptg-hint">
            {result === null && (
              <p>
                <strong>Stop at 9.99 seconds to win.</strong>
                <br />
                Tap START and try to hit exactly 9.99 sec.
              </p>
            )}

            {result === "win" && (
              <p className="ptg-result ptg-result--win">
                🎉 Perfect (or almost)! You stopped at{" "}
                <strong>{displayTime}s</strong>.
              </p>
            )}

            {result === "lose" && (
              <p className="ptg-result ptg-result--lose">
                Not this time… You stopped at{" "}
                <strong>{displayTime}s</strong>{" "}
                {offBySeconds && (
                  <>
                    (off by <strong>{offBySeconds}s</strong>).
                  </>
                )}
              </p>
            )}
          </div>
        </main>
      </div>

      {/* ======= MODAL GANADOR / CUPÓN (Perfect Time) ======= */}
      {winnerModalOpen && (
        <div
          className="modal"
          role="dialog"
          aria-modal="true"
          onClick={cerrarModalGanador}
          style={{ zIndex: 200000 }}
        >
          <div
            className="modal-contenido"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="modal-close"
              aria-label="Cerrar"
              onClick={cerrarModalGanador}
              title="Cerrar"
            >
              ✕
            </button>

            {!coupon ? (
              <>
                <h2>
                  🎉 ¡Ganaste un cupón
                  {prizeName ? ` de ${prizeName}` : ""} 🎉
                </h2>
                <p>Ingresa tu número de contacto para reclamarlo:</p>
                <input
                  type="text"
                  placeholder="Tu número"
                  value={contact}
                  onChange={(e) => setContact(e.target.value)}
                />
                <button
                  className="boton-reclamar"
                  onClick={reclamarCupon}
                  disabled={isClaiming}
                >
                  {isClaiming ? "Procesando…" : "Reclamar cupón 🎊"}
                </button>
                {couponError && (
                  <p style={{ color: "#e63946", marginTop: 12 }}>
                    {couponError}
                  </p>
                )}
              </>
            ) : (
              <>
                <h2>🎟️ ¡Cupón listo!</h2>
                <p>
                  Usa este código en el portal de ventas dentro del tiempo
                  indicado.
                </p>
                <div className="coupon-code">{coupon.code}</div>
                <p>
                  Vence: {new Date(coupon.expiresAt).toLocaleString()}
                </p>

                <div style={{ marginTop: 12 }}>
                  <button
                    className="boton-reclamar"
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(coupon.code);
                        setTimeout(
                          () => goToSalesWithCoupon(coupon.code),
                          80
                        );
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

      {/* ======= FOOTER IGUAL QUE JuegoPizza ======= */}
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
            <a
              href="tel:694301433"
              className="call-link"
              aria-label="Llamar"
            >
              <FontAwesomeIcon
                icon={faMobileScreenButton}
                className="icon"
              />
            </a>
          </div>

          <p className="footer__legal">
            © {new Date().getFullYear()} MyCrushPizza SL.
            <br />
            Todos los derechos reservados.
          </p>

          <p className="footer__links">
            <a
              href="/bases.html"
              target="_blank"
              rel="noopener noreferrer"
            >
              Términos y condiciones
            </a>
            ·
            <a
              href="/privacidad.html"
              target="_blank"
              rel="noopener noreferrer"
            >
              Privacidad
            </a>
            ·
            <a
              href="/cookies.html"
              target="_blank"
              rel="noopener noreferrer"
            >
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
