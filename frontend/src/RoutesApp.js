import React from "react";
import { Routes, Route } from "react-router-dom";
import JuegoPizza from "./JuegoPizza";   
import VerificacionPremio from "./VerificarPremio"; 

function RoutesApp() {
  return (
    <Routes>
      <Route path="/" element={<JuegoPizza />} />
      <Route path="/verificacion" element={<VerificacionPremio />} />
    </Routes>
  );
}

export default RoutesApp;
