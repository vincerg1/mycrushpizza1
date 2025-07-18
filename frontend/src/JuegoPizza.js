import React, { useState, useEffect } from "react";
import axios from "axios";
import "./App.css";
import logo from "../src/logo/LogoMyCrushPizza.png";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faWhatsapp, faTiktok } from "@fortawesome/free-brands-svg-icons";
import { faMobileScreenButton } from "@fortawesome/free-solid-svg-icons";
import Confetti from "react-confetti";

/*  URL a la que se redirige tras agotar los 3 intentos  */
const TIKTOK_URL = "https://www.tiktok.com/@mycrushpizza1?_t=ZN-8whjKa8Moxq&_r=1";

/**
 * LINKS LEGALES: coloca bases.html, privacidad.html y cookies.html dentro de
 * public/.  CRA y Railway los servirán directamente.  Apuntamos a esos
 * nombres exactos para evitar que react-router intercepte la ruta.
 */

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

  /* ---------------- Consentimiento legal ---------------- */
  const [showTerms, setShowTerms] = useState(() => !localStorage.getItem("mcp_termsAccepted"));
  const [showCookies, setShowCookies] = useState(() => !localStorage.getItem("mcp_cookiesConsent"));

  /* ---------------- Carga del número ganador ------------- */
  useEffect(() => {
    axios
      .get(`${process.env.REACT_APP_BACKEND_URL}/ganador`)
      .then((res) => setNumeroGanador(res.data.numeroGanador))
      .catch((err) => console.error("Error:", err));
  }, []);

  /* -------------- Aceptación legal ---------------------- */
  const aceptarTerminos = () => {
    localStorage.setItem("mcp_termsAccepted", "true");
    setShowTerms(false);
  };

  const aceptarCookies = () => {
    localStorage.setItem("mcp_cookiesConsent", "all");
    setShowCookies(false);
    // aquí inicializar analytics si procede
  };

  const rechazarCookies = () => {
    localStorage.setItem("mcp_cookiesConsent", "none");
    setShowCookies(false);
  };

  /* ------------ INTENTAR GANAR --------------- */
  const intentarGanar = async () => {
    if (intentosRestantes === 0 || showTerms) return;

    try {
      const res = await axios.post(`${process.env.REACT_APP_BACKEND_URL}/intentar`);
      setIntento(res.data.intento);
      setEsGanador(res.data.esGanador);

      setIntentosRestantes((prev) => {
        const left = prev - 1;
        if (left === 0 && !res.data.esGanador) {
          setTimeout(() => {
            window.location.href = TIKTOK_URL;
          }, 2000);
        }
        return left;
      });

      if (res.data.esGanador) {
        setMensaje("🎉 ¡Ganaste una pizza!");
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
      console.error("Error:", error);
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
  return (
    <div className="container">
      {/* --------- MODAL BASES LEGALES (bloqueante) --------- */}
      {showTerms && (
        <div className="overlay">
          <div className="modal-legal">
            <h2>Antes de jugar</h2>
            <p>
              Para participar debes ser mayor de 18 años y aceptar nuestras&nbsp;
              <a href="/bases.html" target="_blank" rel="noopener noreferrer">Bases Legales</a>&nbsp; y&nbsp;
              <a href="/privacidad.html" target="_blank" rel="noopener noreferrer">Política de Privacidad</a>.
            </p>
            <button className="btn-acepto" onClick={aceptarTerminos}>Acepto</button>
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

      <button className="boton-intentar" onClick={intentarGanar} disabled={intentosRestantes === 0 || showTerms}>
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
            <input type="text" placeholder="Tu número" value={contacto} onChange={(e) => setContacto(e.target.value)} />
            <button className="boton-reclamar" onClick={reclamarPizza}>Reclamar Pizza 🎊</button>
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
