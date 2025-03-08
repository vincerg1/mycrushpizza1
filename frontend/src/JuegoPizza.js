import React, { useState, useEffect } from "react";
import axios from "axios";
import "./App.css";
import logo from "../src/logo/pizza-box-top-view-01.png";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faInstagram, faWhatsapp,  } from "@fortawesome/free-brands-svg-icons";
import { faMapPin } from '@fortawesome/free-solid-svg-icons'; 
import Confetti from "react-confetti";

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


    console.log("Backend URL en React:", process.env.REACT_APP_BACKEND_URL);

    useEffect(() => {
        axios.get(`${process.env.REACT_APP_BACKEND_URL}/ganador`)
            .then(res => setNumeroGanador(res.data.numeroGanador))
            .catch(err => console.error("Error:", err));
            
    }, []);

    const intentarGanar = async () => {
        if (intentosRestantes === 0) return;

        try {
            const res = await axios.post(`${process.env.REACT_APP_BACKEND_URL}/intentar`);
            setIntento(res.data.intento);
            setEsGanador(res.data.esGanador);
            setIntentosRestantes(prev => prev - 1);

            if (res.data.esGanador) {
                setMensaje("🎉 ¡Ganaste una pizza!");
                setTimeout(() => setModalAbierto(true), 1500); // Abrir modal después de la animación
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

    return (
        <div className="container">
            {esGanador && <Confetti numberOfPieces={300} />}
            <img src={logo} alt="Logo de MyCrushPizza" className="logo" />
            <h1>¡PIZZA GRATIS!</h1>

            {numeroGanador !== null && (
                <div className={`numero-ganador ${shakeGanador ? "shake" : ""}`}>
                    <h2>NÚMERO GANADOR</h2>
                    <div className="numero-casillas">
                        {numeroGanador.toString().padStart(3, "0").split("").map((digit, index) => (
                            <span key={index} className="casilla">{digit}</span>
                        ))}
                    </div>
                </div>
            )}

            <button className="boton-intentar" onClick={intentarGanar} disabled={intentosRestantes === 0}>
                Intentar suerte 🎲🍕
            </button>
            <p className="intentos">Intentos restantes: {intentosRestantes}</p>

            {showToast && (
                <div className="toast-bubble">
                    <p>Tu número: {intento?.toString().padStart(3, "0")}</p>
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
                        <button className="boton-reclamar" onClick={reclamarPizza}>Reclamar Pizza 🎊</button>
                    </div>
                </div>
            )}
            
            <footer className="footer">
            <div className="social-icons">
                <a href="https://wa.me/659087766" target="_blank" rel="noopener noreferrer">
                <FontAwesomeIcon icon={faWhatsapp} className="icon" />
                </a>
                <a href="https://www.instagram.com/volta.pizza/?hl=es" target="_blank" rel="noopener noreferrer">
                <FontAwesomeIcon icon={faInstagram} className="icon" />
                </a>
                <a href="https://www.google.com/maps/d/viewer?mid=1Fws6c7B9qtPUoQXkItl6dnpKLO5JwU4&ll=42.33589135768632%2C-7.856552021396941&z=15" target="_blank" rel="noopener noreferrer">
                <FontAwesomeIcon icon={faMapPin} className="icon" />
                </a>
            </div>
            <p>© {new Date().getFullYear()} MyCrushPizzaSpain. <br /> Todos los derechos reservados.</p>
            </footer>
        </div>
    );
}

export default JuegoPizza;
