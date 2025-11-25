//PerfectTimingGame.js
import React, { useState, useRef, useEffect } from "react";
import "./PerfectTimingGame.css";
import logo from "../../logo/HOYnuevoLogoMyCrushPizza.jpeg"; // ajusta la ruta si hace falta

const TARGET_MS = 9990;   // 9,99 s
const TOLERANCE_MS = 40;  // margen de acierto (40 ms ≈ 0,04 s)

function formatTime(ms) {
  const seconds = ms / 1000;
  return seconds.toFixed(2);
}

export default function PerfectTimingGame() {
  const [timeMs, setTimeMs] = useState(0);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState(null); // "win" | "lose" | null
  const [deltaMs, setDeltaMs] = useState(null);

  const rafIdRef = useRef(null);
  const startTimeRef = useRef(null);

  // Loop del cronómetro con requestAnimationFrame
  useEffect(() => {
    if (!running) return;

    function tick(now) {
      if (!startTimeRef.current) {
        // empezamos contando desde el estado actual (por si en el futuro quieres reanudar)
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
      if (delta <= TOLERANCE_MS) {
        setResult("win");
      } else {
        setResult("lose");
      }
    }
  }

  const displayTime = formatTime(timeMs);
  const offBySeconds =
    deltaMs != null ? (deltaMs / 1000).toFixed(2) : null;

  return (
    <div className="ptg-root">
      <div className="ptg-card">
        <div className="ptg-card-bg-logo" />
        <header className="ptg-header">
          <img
            src={logo}
            alt="MyCrushPizza"
            className="ptg-logo"
          />
          <h1 className="ptg-title">Perfect Timing</h1>
          <p className="ptg-subtitle">
            Stop at <strong>9.99</strong> seconds to win.
          </p>
        </header>

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
              "ptg-button" + (running ? " ptg-button--stop" : " ptg-button--start")
            }
            onClick={handleToggle}
          >
            {running ? "STOP" : "START"}
          </button>

          <div className="ptg-hint">
            {result === null && (
              <p>Tap START and try to hit exactly 9.99 sec.</p>
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
    </div>
  );
}
