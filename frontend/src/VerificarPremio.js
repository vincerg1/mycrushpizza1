import React, { useState, useEffect } from "react";
import axios from "axios";
import "../src/VerificarPremio.css";

function VerificacionPremio() {
    const [numerosGanadores, setNumerosGanadores] = useState([]);
    const [numeroSeleccionado, setNumeroSeleccionado] = useState("");
    const [estadoPremio, setEstadoPremio] = useState(null);
    const [autenticado, setAutenticado] = useState(false);
    const [clave, setClave] = useState("");

    useEffect(() => {
        // Verificar si la clave está almacenada en localStorage
        const claveGuardada = localStorage.getItem("claveAdmin");
        if (claveGuardada === "admin123") {
            setAutenticado(true);
            cargarListaGanadores();
        }
    }, []);

    const cargarListaGanadores = () => {
        axios.get(`${process.env.REACT_APP_BACKEND_URL}/lista-ganadores`)
            .then(res => setNumerosGanadores(res.data))
            .catch(err => console.error("Error:", err));
    };

    const verificarPremio = async () => {
        if (!numeroSeleccionado) return alert("Selecciona un número ganador.");

        try {
            const res = await axios.get(`${process.env.REACT_APP_BACKEND_URL}/verificar/${numeroSeleccionado}`);
            setEstadoPremio(res.data);
        } catch (error) {
            console.error("Error:", error);
            setEstadoPremio(null);
        }
    };

    const marcarComoEntregado = async () => {
        try {
            await axios.post(`${process.env.REACT_APP_BACKEND_URL}/actualizar-entrega`, { numero: numeroSeleccionado });
            alert("Premio marcado como entregado ✔");
            setEstadoPremio(prev => ({ ...prev, entregado: 1 }));
        } catch (error) {
            console.error("Error:", error);
        }
    };

    const manejarLogin = () => {
        if (clave === "admin123") {
            localStorage.setItem("claveAdmin", clave);
            setAutenticado(true);
            cargarListaGanadores();
        } else {
            alert("Clave incorrecta. Inténtalo de nuevo.");
        }
    };

    const manejarLogout = () => {
        localStorage.removeItem("claveAdmin");
        setAutenticado(false);
        setClave("");
        setNumeroSeleccionado("");
        setEstadoPremio(null);
    };

    /*pendiete con esta pagina*/ 

    return (
        <div className="verificacion-container">
            {!autenticado ? (
                <div className="login-container">
                    <h2>🔒 Ingreso de Administrador</h2>
                    <input
                        type="password"
                        placeholder="Ingrese la clave"
                        value={clave}
                        onChange={(e) => setClave(e.target.value)}
                    />
                    <button className="boton-ingresar" onClick={manejarLogin}>Ingresar</button>
                </div>
            ) : (
                <>
                    <div className="header-admin">
                        <h1>Verificación de Premios</h1>
                        <button className="boton-salir" onClick={manejarLogout}>Salir</button>
                    </div>

                    <label>Selecciona un número ganador:</label>
                    <select value={numeroSeleccionado} onChange={(e) => setNumeroSeleccionado(e.target.value)}>
                        <option value="">-- Seleccionar --</option>
                        {numerosGanadores.map(num => (
                            <option key={num.id} value={num.numero}>{num.numero}</option>
                        ))}
                    </select>

                    <button className="boton-verificar" onClick={verificarPremio}>Consultar</button>

                    {estadoPremio && (
                        <div className="estado-premio">
                            <p><strong>Número:</strong> {estadoPremio.numero}</p>
                            <p><strong>Contacto:</strong> {estadoPremio.contacto || "No disponible"}</p>
                            <p><strong>Reclamado:</strong> {estadoPremio.reclamado ? "Sí" : "No"}</p>
                            <p><strong>Entregado:</strong> {estadoPremio.entregado ? "Sí" : "No"}</p>

                            {!estadoPremio.entregado && (
                                <button className="boton-entregar" onClick={marcarComoEntregado}>
                                    ✅ Marcar como Entregado
                                </button>
                            )}
                        </div>
                    )}
                </>
            )}
        </div>
    );
}

export default VerificacionPremio;
