import React from "react";
import { Routes, Route } from "react-router-dom";

import GameCouponsGallery from "./GameCouponsGallery";  // salón de ofertas
import JuegoPizza from "./JuegoPizza";                  // juego Número Ganador
import VerificacionPremio from "./VerificarPremio";

function RoutesApp() {
  return (
    <Routes>
      {/* Home: cuando entren a https://juego.mycrushpizza.com */}
      <Route path="/" element={<GameCouponsGallery />} />

      {/* Ruta para jugar (luego la enlazaremos desde la galería) */}
      <Route path="/jugar" element={<JuegoPizza />} />

      {/* Ruta que ya tenías para verificar premio */}
      <Route path="/verificacion" element={<VerificacionPremio />} />
    </Routes>
  );
}

export default RoutesApp;
