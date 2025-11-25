import React from "react";
import { Routes, Route } from "react-router-dom";
import GameCouponsGallery from "./GameCouponsGallery";  
import JuegoPizza from "./JuegoPizza";                  
import VerificacionPremio from "./VerificarPremio";
import PerfectTimingGame from "./PerfectTimingGame";    // ← Nuevo juego

function RoutesApp() {
  return (
    <Routes>
      <Route path="/" element={<GameCouponsGallery />} />

      <Route path="/jugar" element={<JuegoPizza />} />

      <Route path="/perfect-timing" element={<PerfectTimingGame />} />  {/* ← Nuevo */}

      <Route path="/verificacion" element={<VerificacionPremio />} />
    </Routes>
  );
}

export default RoutesApp;
