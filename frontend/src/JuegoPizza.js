import React, { useState, useEffect } from "react";
import axios from "axios";
import "./App.css";
import logo from "../src/logo/LogoMyCrushPizza.png";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faWhatsapp, faTiktok } from "@fortawesome/free-brands-svg-icons";
import { faMobileScreenButton } from "@fortawesome/free-solid-svg-icons";


import Confetti from "react-confetti";

/*  URL a la que se redirige tras agotar los 3 intentos  */
const TIKTOK_URL =
  "https://www.tiktok.com/@mycrushpizza1?_t=ZN-8whjKa8Moxq&_r=1";

function JuegoPizza() {
  const [numeroGanador, setNumeroGanador] = useState(null);
  const [intento, setIntento] = useState(null);
  const [esGanador, setEsGanador] = useState(false);
  const [mensaje, setMensaje] = useState("");
  const [intentosRestantes, setIntentosRestantes] = useState(3);
  const [showToast, setShowToast] = useState(false);
  const [modalAbierto, setModalAbierto] = useState(false);
  const [contacto, setContacto] = useState("");
  const [shakeGanador, setShakeGanador] = useState(false);

  useEffect(() => {
    axios
      .get(`${process.env.REACT_APP_BACKEND_URL}/ganador`)
      .then(res => setNumeroGanador(res.data.numeroGanador))
      .catch(err => console.error("Error:", err));
  }, []);

  /* ------------ INTENTAR GANAR --------------- */
  const intentarGanar = async () => {
    if (intentosRestantes === 0) return;

    try {
      const res = await axios.post(
        `${process.env.REACT_APP_BACKEND_URL}/intentar`
      );
      setIntento(res.data.intento);
      setEsGanador(res.data.esGanador);

      /* ↓ Actualiza contador y, si se acaban, redirige ↓ */
      setIntentosRestantes(prev => {
        const left = prev - 1;

        if (left === 0 && !res.data.esGanador) {
          /* Espera 2 s para que el usuario vea el toast final */
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
      await axios.post(`${process.env.REACT_APP_BACKEND_URL}/reclamar`, {
        contacto
      });
      alert("Premio reclamado con éxito 🎉");
      setModalAbierto(false);
    } catch (error) {
      console.error("Error:", error);
    }
  };

  /* ------------- UI ---------------- */
  return (
    <div className="container">
      {esGanador && <Confetti numberOfPieces={300} />}
      <img src={logo} alt="Logo de MyCrushPizza" className="logo" />

      {numeroGanador !== null && (
        <div className={`numero-ganador ${shakeGanador ? "shake" : ""}`}>
          <h2>NÚMERO GANADOR</h2>
          <div className="numero-casillas">
            {numeroGanador
              .toString()
              .padStart(3, "0")
              .split("")
              .map((digit, index) => (
                <span key={index} className="casilla">
                  {digit}
                </span>
              ))}
          </div>
        </div>
      )}

      <button
        className="boton-intentar"
        onClick={intentarGanar}
        disabled={intentosRestantes === 0}
      >
        Suerte! =) 🎲🍕
      </button>

      <p className="intentos">Intentos restantes: {intentosRestantes}</p>

      {showToast && (
        <div className="toast-bubble">
          <span className="toast-numero">
            {intento?.toString().padStart(3, "0")}
          </span>
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
              onChange={e => setContacto(e.target.value)}
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
    >
      <FontAwesomeIcon icon={faTiktok} className="icon" />
    </a>

    <a href="tel:694301433" className="call-link">
      <FontAwesomeIcon icon={faMobileScreenButton} className="icon" />
    </a>
  </div>

  <p>
    © {new Date().getFullYear()} MyCrushPizzaSL.
    <br />
    Todos los derechos reservados.
  </p>
</footer>
    </div>
  );
}

export default JuegoPizza;
