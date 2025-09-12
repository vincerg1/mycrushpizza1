import React, { useState, useEffect } from "react";
import axios from "axios";
import "./App.css";
import logo from "../src/logo/nuevoLogoMyCrushPizza.jpeg";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faWhatsapp, faTiktok } from "@fortawesome/free-brands-svg-icons";
import { faMobileScreenButton } from "@fortawesome/free-solid-svg-icons";
import Confetti from "react-confetti";

/*  URLs a las que se redirige tras agotar los 3 intentos  */
const TIKTOK_URL = "https://www.tiktok.com/@luigiroppo?_t=ZN-8whjKa8Moxq&_r=1";
const INSTAGRAM_URL = "https://www.instagram.com/mycrushpizza_/profilecard/?igsh=MTBlNTdlbmt0Z2pobQ%3D%3D";

/* Alterna entre TikTok e Instagram usando localStorage (por dispositivo) */
const REDIRECT_TOGGLE_KEY = "mcp_redirect_toggle"; // "0" o "1"
function getNextRedirectUrl() {
  const current = localStorage.getItem(REDIRECT_TOGGLE_KEY) || "0"; // por defecto 0
  const nextUrl = current === "0" ? TIKTOK_URL : INSTAGRAM_URL;
  localStorage.setItem(REDIRECT_TOGGLE_KEY, current === "0" ? "1" : "0");
  return nextUrl;
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

  /* ---------------- Bloqueo 24h / countdown ---------------- */
  const [lockedUntil, setLockedUntil] = useState(null);    // ISO string o null
  const [serverOffset, setServerOffset] = useState(0);     // desfase cliente-servidor
  const [remainingMs, setRemainingMs] = useState(0);
  const [showLockModal, setShowLockModal] = useState(false);
  const [ultimoNumeroGanado, setUltimoNumeroGanado] = useState(null);

  /* ---------------- Consentimiento legal ---------------- */
  const [showTerms, setShowTerms] = useState(() => !localStorage.getItem("mcp_termsAccepted"));
  const [showCookies, setShowCookies] = useState(() => !localStorage.getItem("mcp_cookiesConsent"));

  /* ---------------- Carga del número ganador + estado bloqueo ------------- */
  useEffect(() => {
    // Usamos /estado para obtener numero, lock y hora del servidor
    axios
      .get(`${process.env.REACT_APP_BACKEND_URL}/estado`)
      .then((res) => {
        const { numeroGanador, lockedUntil, now } = res.data || {};
        if (numeroGanador != null) setNumeroGanador(numeroGanador);

        // sincroniza reloj cliente-servidor
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
        // fallback: si /estado fallara, intentamos /ganador (tu endpoint anterior)
        axios
          .get(`${process.env.REACT_APP_BACKEND_URL}/ganador`)
          .then((r) => setNumeroGanador(r.data.numeroGanador))
          .catch((e) => console.error("Error estado/ganador:", e || err));
      });
  }, []);

  /* --------- Ticker del countdown cuando hay bloqueo --------- */
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

  /* --------- Cuando el contador llega a 0, revalidamos estado --------- */
  useEffect(() => {
    if (!lockedUntil) return;
    if (remainingMs > 0) return;

    axios
      .get(`${process.env.REACT_APP_BACKEND_URL}/estado`)
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
      const res = await axios.post(`${process.env.REACT_APP_BACKEND_URL}/intentar`);
      setIntento(res.data.intento);
      setEsGanador(res.data.esGanador);

      setIntentosRestantes((prev) => {
        const left = prev - 1;
        if (left === 0 && !res.data.esGanador) {
          const url = getNextRedirectUrl(); // ← alterna TikTok/Instagram
          setTimeout(() => {
            window.location.href = url;
          }, 2000);
        }
        return left;
      });

      if (res.data.esGanador) {
        setMensaje("🎉 ¡Ganaste una pizza!");
        // Capturamos lock para que todos vean el countdown,
        // pero no abrimos el modal de bloqueo sobre tu modal de reclamo.
        if (res.data.lockedUntil) {
          setLockedUntil(res.data.lockedUntil);
          setUltimoNumeroGanado(res.data.numeroGanador);
        }
        setTimeout(() => setModalAbierto(true), 1500);
      } else {
        setMensaje("Sigue intentando 🍀");
        setShowToast(true);
      }

      setShakeGanador(!res.data.esGanador);

      setTimeout(() => {
        setShowToast(false);
        setShakeGanador(false);
      }, 2000);
    } catch (error) {
      const status = error?.response?.status;
      const data = error?.response?.data;
      if (status === 423 && data?.lockedUntil) {
        // Juego bloqueado: mostramos modal de bloqueo
        setLockedUntil(data.lockedUntil);
        setUltimoNumeroGanado(numeroGanador);
        setShowLockModal(true);
      } else {
        console.error("Error:", error);
      }
    }
  };

  /* ------------ RECLAMAR PIZZA --------------- */
  const reclamarPizza = async () => {
    if (!contacto) return alert("Por favor, ingresa un número de contacto.");
    try {
      await axios.post(`${process.env.REACT_APP_BACKEND_URL}/reclamar`, { contacto });
      alert("Premio reclamado con éxito 🎉");
      setModalAbierto(false);
    } catch (error) {
      console.error("Error:", error);
    }
  };

  /* ------------- UI ---------------- */
  const botonDeshabilitado =
    intentosRestantes === 0 || showTerms || (lockedUntil && remainingMs > 0);

  return (
    <div className="container">
      {/* --------- MODAL BASES LEGALES (bloqueante) --------- */}
      {showTerms && (
        <div className="overlay">
          <div className="modal-legal">
            <h2 className="pulse-heading">Antes de jugar</h2>
            <p>
              Para participar debes ser mayor de 18 años y aceptar nuestras&nbsp;
              <a href="/bases.html" target="_blank" rel="noopener noreferrer">Bases Legales</a>&nbsp; y&nbsp;
              <a href="/privacidad.html" target="_blank" rel="noopener noreferrer">Política de Privacidad</a>.
            </p>
            <button className="btn-acepto" onClick={aceptarTerminos}>Acepto</button>
          </div>
        </div>
      )}

      {/* ---------------- MODAL BLOQUEO 24H (countdown) ---------------- */}
      {/* ---------------- MODAL BLOQUEO (countdown) ---------------- */}
{showLockModal && (lockedUntil && remainingMs > 0) && !modalAbierto && (
  <div className="overlay">
    <div className="modal-legal lock-modal">
      <h2 className="lock-title">Juego en pausa ⏳</h2>

      <p className="lock-subtitle">
        Hace nada hubo un ganador.
      </p>

      {ultimoNumeroGanado != null && (
        <p className="lock-subtitle">
          Último número ganador:&nbsp;
          <span className="pill">
            {String(ultimoNumeroGanado).padStart(3, "0")}
          </span>
        </p>
      )}

      <p className="lock-caption">Se reanudará en:</p>
      <div className="countdown">{formatCountdown(remainingMs)}</div>

      <p className="lock-eta">
        Hora estimada: {new Date(lockedUntil).toLocaleTimeString()}
      </p>
    </div>
  </div>
)}


      {/* ---------------- BANNER COOKIES -------------------- */}
      {showCookies && (
        <div className="cookie-banner">
          <span>
            Usamos cookies para análisis y personalización. Puedes aceptarlas o rechazar las no esenciales. Más info en nuestra&nbsp;
            <a href="/cookies.html" target="_blank" rel="noopener noreferrer">Política de Cookies</a>.
          </span>
          <div className="cookie-actions">
            <button className="btn-cookies no" onClick={rechazarCookies}>Rechazar</button>
            <button className="btn-cookies yes" onClick={aceptarCookies}>Aceptar</button>
          </div>
        </div>
      )}

      {esGanador && <Confetti numberOfPieces={300} />}
      <img src={logo} alt="Logo de MyCrushPizza" className="logo" />

      {numeroGanador !== null && (
        <div className={`numero-ganador ${shakeGanador ? "shake" : ""}`}>
          <h2>NÚMERO GANADOR</h2>
          <div className="numero-casillas">
            {numeroGanador
              ?.toString()
              .padStart(3, "0")
              .split("")
              .map((d, i) => (
                <span key={i} className="casilla">{d}</span>
              ))}
          </div>
        </div>
      )}

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

      {modalAbierto && (
        <div className="modal">
          <div className="modal-contenido">
            <h2>🎉 ¡Ganaste una pizza! 🎉</h2>
            <p>Ingresa tu número de contacto para reclamarla:</p>
            <input
              type="text"
              placeholder="Tu número"
              value={contacto}
              onChange={(e) => setContacto(e.target.value)}
            />
            <button className="boton-reclamar" onClick={reclamarPizza}>
              Reclamar Pizza 🎊
            </button>
          </div>
        </div>
      )}

      <footer className="footer">
        <p className="info-text">¡Más información aquí!</p>
        <div className="social-icons">
          <a href="https://wa.me/34694301433" target="_blank" rel="noopener noreferrer" aria-label="WhatsApp Chat">
            <FontAwesomeIcon icon={faWhatsapp} className="icon" />
          </a>
          <a href="https://www.tiktok.com/@mycrushpizza1?_t=ZN-8whjKa8Moxq&_r=1" target="_blank" rel="noopener noreferrer">
            <FontAwesomeIcon icon={faTiktok} className="icon" />
          </a>
          <a href="tel:694301433" className="call-link" aria-label="Llamar">
            <FontAwesomeIcon icon={faMobileScreenButton} className="icon" />
          </a>
        </div>
        <p>
          © {new Date().getFullYear()} MyCrushPizza SL.
          <br />
          Todos los derechos reservados.
        </p>
      </footer>
    </div>
  );
}
