// src/components/GameCouponsGallery.js
import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import "./GameCouponsGallery.css";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faWhatsapp, faTiktok } from "@fortawesome/free-brands-svg-icons";
import { faMobileScreenButton } from "@fortawesome/free-solid-svg-icons";

const BACKEND_BASE = (process.env.REACT_APP_BACKEND_URL || "").replace(
  /\/+$/,
  ""
);

const GAME_ID = process.env.REACT_APP_GAME_ID
  ? Number(process.env.REACT_APP_GAME_ID)
  : null;

/* ---------------------- Fetch helpers ---------------------- */

async function fetchCouponsGallery() {
  if (!BACKEND_BASE) {
    throw new Error("REACT_APP_BACKEND_URL is not configured");
  }

  console.log(
    "[GameCouponsGallery] Fetching gallery from:",
    `${BACKEND_BASE}/game/coupons-gallery`
  );

  const res = await fetch(`${BACKEND_BASE}/game/coupons-gallery`, {
    method: "GET",
    headers: { "Content-Type": "application/json" },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `Failed to fetch coupons gallery: ${res.status} ${res.statusText} ${text}`
    );
  }

  const json = await res.json();
  console.log("[GameCouponsGallery] Gallery response:", json);
  return json;
}
async function claimDirectCoupon({ phone, name, type, key, hours, campaign }) {
  if (!BACKEND_BASE) {
    throw new Error("REACT_APP_BACKEND_URL is not configured");
  }

  const payload = {
    phone,
    name,
    type,
    key,
    ...(hours != null ? { hours } : {}),
    ...(campaign != null ? { campaign } : {}),
  };

  console.log(
    "[GameCouponsGallery] POST /game/direct-claim payload:",
    payload
  );

  const res = await fetch(`${BACKEND_BASE}/game/direct-claim`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const text = await res.text().catch(() => "");
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    throw new Error(
      `Invalid response from direct-claim: ${res.status} ${res.statusText}`
    );
  }

  console.log(
    "[GameCouponsGallery] /game/direct-claim response:",
    res.status,
    data
  );
  return data || { ok: false, error: "empty_response" };
}

/**
 * Estado de bloqueo del juego (para countdown)
 * gameStatus[gameId] = {
 *   lockedUntil: Date | null,
 *   remainingMs: number,
 *   isLocked: boolean
 * }
 */
async function fetchGameStatusForIds(gameIds) {
  if (!BACKEND_BASE) return {};

  const uniqueIds = Array.from(new Set(gameIds || [])).filter(
    (id) => id != null
  );
  if (uniqueIds.length === 0) return {};

  const now = Date.now();
  const status = {};

  for (const id of uniqueIds) {
    try {
      let url = null;
      if (id === 1) {
        // Número Ganador
        url = `${BACKEND_BASE}/estado`;
      } else if (id === 2) {
        // Perfect Timing
        url = `${BACKEND_BASE}/perfect/estado`;
      } else {
        continue;
      }

      const res = await fetch(url, {
        method: "GET",
        headers: { "Content-Type": "application/json" },
      });
      if (!res.ok) {
        console.warn(
          "[GameCouponsGallery] Failed to fetch game estado for",
          id,
          res.status
        );
        continue;
      }

      const data = await res.json();
      const lockedRaw = data.lockedUntil || data.lock_until || null;
      if (!lockedRaw) {
        status[id] = {
          lockedUntil: null,
          remainingMs: 0,
          isLocked: false,
        };
        continue;
      }

      const lockedUntil = new Date(lockedRaw);
      const diff = lockedUntil.getTime() - now;
      status[id] = {
        lockedUntil,
        remainingMs: diff > 0 ? diff : 0,
        isLocked: diff > 0,
      };
    } catch (e) {
      console.warn(
        "[GameCouponsGallery] Error fetching game estado for",
        id,
        e
      );
    }
  }

  return status;
}

/* ---------------------- Formatting helpers ---------------------- */

function formatMoney(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return "";
  return `${n.toFixed(2)} €`;
}

function formatCouponExample(example) {
  if (example == null) return "";
  if (typeof example !== "object") return String(example);

  const {
    kind,
    variant,
    percent,
    percentMin,
    percentMax,
    amount,
    maxAmount,
  } = example;

  const isPercent = kind === "PERCENT";
  const isAmount = kind === "AMOUNT";

  if (isPercent) {
    if (variant === "RANGE" && percentMin != null && percentMax != null) {
      return `${percentMin}-${percentMax}%`;
    }
    if (percent != null) return `${percent}%`;
    return "% discount";
  }

  if (isAmount) {
    if (variant === "RANGE" && amount != null && maxAmount != null) {
      return `${formatMoney(amount)} – ${formatMoney(maxAmount)}`;
    }
    if (amount != null) return formatMoney(amount);
    return "Discount";
  }

  return "Coupon";
}

function mapTypeToTitle(type) {
  switch (type) {
    case "FIXED_PERCENT":
      return "DISCOUNT";
    case "RANDOM_PERCENT":
      return "MYSTERY DISCOUNT";
    case "FIXED_AMOUNT":
      return "CASH DISCOUNT";
    default:
      return type || "Oferta";
  }
}

function makeSubtitle(exampleText) {
  if (!exampleText) return "";
  return exampleText.includes("%")
    ? `${exampleText} de descuento`
    : `${exampleText} en tu pedido`;
}

function classifyBucket(card) {
  const acq = card.acquisition;
  const channel = card.channel;
  const gameId = card.gameId;

  // 🎯 Crea un bucket por cada juego
  if (acq === "GAME" || channel === "GAME") {
    return `game-${gameId || "unknown"}`;
  }

  if (acq === "CLAIM" || acq === "DIRECT") return "direct";
  return "direct";
}

function gameMetaForId(gameId) {
  if (gameId === 1) {
    return {
      label: "Número Ganador (Juego diario)",
      icon: "🎯",
    };
  }
  if (gameId === 2) {
    return {
      label: "Perfect Timing (Reflejos)",
      icon: "⏱️",
    };
  }
  return null;
}

function formatCountdown(ms) {
  if (!ms || ms <= 0) return null;
  const totalSec = Math.floor(ms / 1000);
  const hours = Math.floor(totalSec / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  const seconds = totalSec % 60;

  const pad = (n) => String(n).padStart(2, "0");

  if (hours > 0) {
    return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
  }
  return `${pad(minutes)}:${pad(seconds)}`;
}

/* ---------------------- Normalization ---------------------- */

function normalizeGalleryData(raw) {
  if (!raw) return { groups: [] };

  console.log("Coupons gallery raw (normalizeGalleryData):", raw);

  if (Array.isArray(raw.cards)) {
    const groups = raw.cards.map((c) => {
      const bucket = classifyBucket(c);
      const isGameBucket = String(bucket || "").startsWith("game");
      const type = c.type || "";

      const title = c.title || "";
      const exampleText =
        title || formatCouponExample(c.sample || c.sampleAccepted || null);

      const displaySubtitleRaw =
        (c.subtitle && String(c.subtitle).trim()) || "";

      let normalizedSubtitle = displaySubtitleRaw;
      const lowerSubtitle = displaySubtitleRaw.toLowerCase();

      // 🔤 Traducciones rápidas de texto que viene del backend
      if (lowerSubtitle === "gratis") {
        normalizedSubtitle = "Free";
      } else if (lowerSubtitle.includes("jugar")) {
        // para las tarjetas de juego usamos copy gamer en inglés
        normalizedSubtitle = isGameBucket ? "Play to win" : "Play bonus";
      }

      // si no viene nada, usamos el fallback generado en el front
      const displaySubtitle =
        normalizedSubtitle || makeSubtitle(exampleText);

      const items = 1;
      // stock ya viene agregado desde el backend
      const stock = c.remaining != null ? Number(c.remaining || 0) : 0;

      return {
        type,
        bucket,
        items,
        stock,
        examples: title ? [title] : [],
        exampleText,
        displayTitle: mapTypeToTitle(type),
        displaySubtitle,
        displayBadge: isGameBucket ? "PLAY & WIN" : "REWARD",

        // 👇 añadimos el gameId para usarlo al navegar y para el estado
        gameId: c.gameId ?? null,

        rawCard: c,
      };
    });

    console.log("[GameCouponsGallery] Normalized groups:", groups);
    return { groups };
  }

  if (Array.isArray(raw)) {
    const groups = raw.map((g) => {
      const type = g.type || "";
      const title = g.title || "";
      const exampleObj =
        Array.isArray(g.examples) && g.examples.length ? g.examples[0] : null;
      const exampleText = title || formatCouponExample(exampleObj);
      return {
        type,
        bucket: "direct",
        items: g.items ?? g.itemCount ?? 0,
        stock: g.stock ?? g.remaining ?? 0,
        examples: Array.isArray(g.examples) ? g.examples : [],
        exampleText,
        displayTitle: mapTypeToTitle(type),
        displaySubtitle: makeSubtitle(exampleText),
        displayBadge: "REWARD",
        rawCard: g,
        gameId: null,
      };
    });
    console.log("[GameCouponsGallery] Normalized legacy groups:", groups);
    return { groups };
  }

  return { groups: [] };
}

/* ---------------------- Card component ---------------------- */

function CouponCard({ group, isActive, onSelect, onPrimary, gameStatus }) {
  const {
    displayTitle,
    displaySubtitle,
    exampleText,
    displayBadge,
    items,
    stock,
    bucket,
    gameId,
  } = group;

  const isGameBucket = String(bucket || "").startsWith("game");
  const bucketClass = isGameBucket ? "gcg-card--game" : "gcg-card--direct";

  const gameMeta = isGameBucket ? gameMetaForId(gameId) : null;
  const metaLabel = gameMeta?.label || null;
  const metaIcon = gameMeta?.icon || null;

  const status = gameStatus || null;
  const isLocked = isGameBucket && status && status.isLocked;
  const countdownStr =
    isGameBucket && status ? formatCountdown(status.remainingMs) : null;

  // --- Normalización de stock / remaining ---
  let remaining =
    typeof stock === "number"
      ? stock
      : typeof items === "number"
      ? items
      : 0;

  const isUnlimited = stock === null;
  if (isUnlimited) {
    remaining = null;
  }

  const isSoldOut = !isUnlimited && remaining === 0;
  const isLowStock =
    !isUnlimited &&
    !isSoldOut &&
    typeof remaining === "number" &&
    remaining <= 3;

  const hasStock = !isSoldOut && (isUnlimited || (remaining ?? 0) > 0);

  const canInteract = hasStock && !isLocked;

  const ctaLabel = isSoldOut
    ? "Sold out"
    : isGameBucket && isLocked
    ? "Paused"
    : isGameBucket
    ? "Play now"
    : "Claim";

  const cardClassName = [
    "gcg-card",
    bucketClass,
    isActive ? "gcg-card--active" : "",
    isSoldOut ? "gcg-card--soldout" : "",
    isLocked ? "gcg-card--locked" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <article className={cardClassName} onClick={onSelect}>
      <header className="gcg-card-header">
        <span className="gcg-card-badge">{displayBadge}</span>
      </header>

      <div className="gcg-card-body">
        <h2 className="gcg-card-title">{displayTitle}</h2>

        {/* Alegoría del juego justo debajo del título */}
        {isGameBucket && metaLabel && (
          <p className="gcg-card-game-label">
            {metaIcon && (
              <span className="gcg-card-game-label-icon">{metaIcon}</span>
            )}
            {metaLabel}
          </p>
        )}

        {/* Countdown si el juego está bloqueado */}
        {isGameBucket && isLocked && countdownStr && (
          <p className="gcg-card-countdown">
            ⏳ Next round in {countdownStr}
          </p>
        )}

        {exampleText && <p className="gcg-card-example">{exampleText}</p>}

        {displaySubtitle && (
          <p className="gcg-card-subtitle">{displaySubtitle}</p>
        )}
      </div>

      <footer className="gcg-card-footer">
        <div className="gcg-card-stock">
          {isUnlimited && (
            <>
              <span className="gcg-card-stock-label">IN STOCK</span>
              <span className="gcg-card-stock-value">∞</span>
            </>
          )}

          {!isUnlimited && !isSoldOut && (
            <>
              <span className="gcg-card-stock-label">IN STOCK</span>
              <span
                className={
                  "gcg-card-stock-value" +
                  (isLowStock ? " gcg-card-stock-value--low" : "")
                }
              >
                {remaining}
              </span>
            </>
          )}

          {isSoldOut && (
            <span className="gcg-card-stock-empty">SoldOut</span>
          )}
        </div>

        <button
          type="button"
          className="gcg-card-cta"
          disabled={!canInteract}
          onClick={(e) => {
            e.stopPropagation();
            if (!canInteract) return;
            onPrimary();
          }}
        >
          {ctaLabel}
        </button>
      </footer>
    </article>
  );
}

/* ---------------------- Claim modal ---------------------- */

function ClaimModal({ open, onClose, onSubmit, activeGroup, state }) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");

  useEffect(() => {
    if (open) {
      setName("");
      setPhone("");
    }
  }, [open, activeGroup?.type]);

  if (!open) return null;

  const { sending, error, result } = state || {};
  const success = result && result.ok;

  const isGameBucket =
    activeGroup && String(activeGroup.bucket || "").startsWith("game");

  const handleSubmit = (e) => {
    e.preventDefault();
    if (sending) return;

    const trimmedPhone = String(phone || "").trim();
    const trimmedName = String(name || "").trim();

    if (!trimmedPhone || trimmedPhone.length < 6) {
      alert("Por favor indica un número de teléfono válido.");
      return;
    }

    onSubmit({ name: trimmedName || null, phone: trimmedPhone });
  };

  let friendlyError = error || null;
  if (!friendlyError && result && result.ok === false && result.error) {
    if (result.error === "already_has_active") {
      friendlyError =
        "Ya tienes un cupón activo. Úsalo antes de solicitar uno nuevo.";
    } else if (result.error === "out_of_stock") {
      friendlyError = "Ahora mismo no quedan cupones de este tipo.";
    } else if (result.error === "missing_params") {
      friendlyError = "Faltan datos para poder generar tu cupón.";
    } else if (typeof result.error === "string") {
      friendlyError = result.error;
    }
  }

  return (
    <div
      className="gcg-modal-backdrop"
      onClick={sending ? undefined : onClose}
    >
      <div className="gcg-modal" onClick={(e) => e.stopPropagation()}>
        <h2 className="gcg-modal-title">
          {isGameBucket ? "PLAY & WIN" : "REWARD"}
        </h2>

        {!success && (
          <p className="gcg-modal-text">
            Déjanos tus datos y te enviaremos el cupón por SMS.
          </p>
        )}

        {success && (
          <p className="gcg-modal-text gcg-modal-text--success">
            ✅ Hemos enviado tu cupón por SMS al número indicado. ¡Revísalo en
            unos segundos!
          </p>
        )}

        {!success && (
          <form className="gcg-modal-form" onSubmit={handleSubmit}>
            <label className="gcg-modal-field">
              <span>Nombre (opcional)</span>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Tu nombre"
              />
            </label>

            <label className="gcg-modal-field">
              <span>Número de teléfono</span>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="Ej: 612345678"
                required
              />
            </label>

            {friendlyError && (
              <p className="gcg-modal-error">{friendlyError}</p>
            )}

            <div className="gcg-modal-actions">
              <button
                type="button"
                className="gcg-modal-btn gcg-modal-btn--secondary"
                onClick={onClose}
                disabled={sending}
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="gcg-modal-btn gcg-modal-btn--primary"
                disabled={sending}
              >
                {sending ? "Enviando…" : "Enviar cupón por SMS"}
              </button>
            </div>
          </form>
        )}

        {success && (
          <div className="gcg-modal-actions">
            <button
              type="button"
              className="gcg-modal-btn gcg-modal-btn--primary"
              onClick={onClose}
            >
              Cerrar
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------------------- Main component ---------------------- */

export default function GameCouponsGallery() {
  const [groups, setGroups] = useState([]);
  const [activeGroup, setActiveGroup] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const [claimOpen, setClaimOpen] = useState(false);
  const [claimState, setClaimState] = useState({
    sending: false,
    error: null,
    result: null,
  });

  // Estado de bloqueo / countdown por juego
  const [gameStatus, setGameStatus] = useState({});
  const navigate = useNavigate();

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);

      try {
        const raw = await fetchCouponsGallery();
        if (cancelled) return;

        const { groups: g } = normalizeGalleryData(raw);
        console.log("[GameCouponsGallery] Final groups state:", g);
        setGroups(g || []);

        if (g && g.length > 0) {
          setActiveGroup(g[0]);
        }
      } catch (err) {
        if (cancelled) return;
        console.error("Error loading coupons gallery:", err);
        setError(err.message || "Unable to load coupons gallery");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  // Cargar estado de bloqueo de juegos cuando sabemos qué gameIds hay en la galería
  useEffect(() => {
    if (!groups || groups.length === 0) return;

    const gameIds = groups
      .filter((g) => String(g.bucket || "").startsWith("game"))
      .map((g) => g.gameId)
      .filter((id) => id != null);

    if (gameIds.length === 0) return;

    let cancelled = false;

    async function loadStatus() {
      const status = await fetchGameStatusForIds(gameIds);
      if (!cancelled && status && Object.keys(status).length) {
        setGameStatus((prev) => ({ ...prev, ...status }));
      }
    }

    loadStatus();
    return () => {
      cancelled = true;
    };
  }, [groups]);

  // Intervalo de 1s para ir actualizando el countdown
  useEffect(() => {
    const timer = setInterval(() => {
      setGameStatus((prev) => {
        const now = Date.now();
        let changed = false;
        const next = {};

        for (const key of Object.keys(prev)) {
          const s = prev[key];
          if (!s || !s.lockedUntil) {
            next[key] = s;
            continue;
          }
          const diff = s.lockedUntil.getTime() - now;
          const isLocked = diff > 0;
          const remainingMs = isLocked ? diff : 0;

          if (
            s.remainingMs !== remainingMs ||
            Boolean(s.isLocked) !== isLocked
          ) {
            changed = true;
          }

          next[key] = {
            ...s,
            remainingMs,
            isLocked,
          };
        }

        return changed ? next : prev;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  function handlePrimaryActionForGroup(group) {
    console.log("[GameCouponsGallery] Primary action on group:", group);

    if (!group) return;

    const isGameBucket = String(group.bucket || "").startsWith("game");
    const gameId = group.gameId ?? group.rawCard?.gameId ?? null;

    if (isGameBucket) {
      const status = gameId != null ? gameStatus[gameId] : null;
      const isLocked = status && status.isLocked;

      if (isLocked) {
        // ya reflejamos el bloqueo en la tarjeta; por seguridad evitamos navegación
        return;
      }

      // 🔀 Mapea cada gameId a su ruta de juego
      if (gameId === 1) {
        navigate("/jugar"); // juego 1 (el de siempre)
      } else if (gameId === 2) {
        navigate("/perfect-timing"); // segundo juego
      } else {
        // fallback por si llega algo raro
        navigate("/jugar");
      }
      return;
    }

    // direct → open modal for that group
    setActiveGroup(group);
    setClaimState({ sending: false, error: null, result: null });
    setClaimOpen(true);
  }

  const handleSubmitClaim = async ({ name, phone }) => {
    if (!activeGroup) return;

    setClaimState({ sending: true, error: null, result: null });

    try {
      const resp = await claimDirectCoupon({
        phone,
        name,
        type: activeGroup.rawCard?.type,
        key: activeGroup.rawCard?.key,
      });

      if (!resp.ok) {
        setClaimState({
          sending: false,
          error: null,
          result: resp,
        });
      } else {
        setClaimState({
          sending: false,
          error: null,
          result: resp,
        });

        // 🔄 Refrescar la galería para que baje `remaining`
        try {
          const raw = await fetchCouponsGallery();
          const { groups: g } = normalizeGalleryData(raw);
          setGroups(g || []);
          if (g && g.length > 0) {
            const match = g.find(
              (gr) =>
                gr.rawCard?.type === activeGroup.rawCard?.type &&
                gr.rawCard?.key === activeGroup.rawCard?.key
            );
            setActiveGroup(match || g[0]);
          }
        } catch (reloadErr) {
          console.warn("Failed to reload gallery after claim:", reloadErr);
        }
      }
    } catch (e) {
      console.error("Error direct-claim:", e);
      setClaimState({
        sending: false,
        error: e.message || "No se pudo emitir el cupón.",
        result: null,
      });
    }
  };

  return (
    <>
      <main className="gcg-root gcg-root--casino">
        <header className="gcg-header">
          <div className="gcg-header-text">
            <h1 className="gcg-title">Coupon Gallery</h1>
            <p className="gcg-subtitle">
              Choose the type of offer you want to go for: free coupons, game
              rewards, and more from MyCrushPizza.
            </p>
          </div>
        </header>

        {loading && (
          <div className="gcg-state gcg-state--loading">Loading offers…</div>
        )}

        {error && !loading && (
          <div className="gcg-state gcg-state--error">
            Sorry, we could not load the offers right now.
            <br />
            <small>{error}</small>
          </div>
        )}

        {!loading && !error && groups.length === 0 && (
          <div className="gcg-state gcg-state--empty">
            There are no offers available right now.
          </div>
        )}

        {!loading && !error && groups.length > 0 && (
        <section className="gcg-gallery">
          <div className="gcg-carousel">

            {/* Swipe hint inicial 👆 */}
            <div className="gcg-swipe-hint">👆</div>

            <div className="gcg-carousel-inner">
              {groups.map((group) => (
                <div
                  key={`${group.bucket}-${group.type}`}
                  className="gcg-carousel-item"
                >
                  <CouponCard
                    group={group}
                    isActive={activeGroup?.bucket === group.bucket && activeGroup?.type === group.type}
                    onSelect={() => setActiveGroup(group)}
                    onPrimary={() => handlePrimaryActionForGroup(group)}
                    gameStatus={
                      group.gameId != null
                        ? gameStatus[group.gameId] || null
                        : null
                    }
                  />
                </div>
              ))}
            </div>

            {/* sombras laterales + flechas animadas */}
            <div className="gcg-carousel-edge gcg-carousel-edge--left" />
            <div className="gcg-carousel-edge gcg-carousel-edge--right" />

          </div>
        </section>
        )}

        <ClaimModal
          open={claimOpen}
          onClose={() => {
            if (claimState.sending) return;
            setClaimOpen(false);
            setClaimState({ sending: false, error: null, result: null });
          }}
          onSubmit={handleSubmitClaim}
          activeGroup={activeGroup}
          state={claimState}
        />
      </main>

      {/* Footer global */}
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
            <a href="tel:694301433" className="call-link" aria-label="Llamar">
              <FontAwesomeIcon icon={faMobileScreenButton} className="icon" />
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
    </>
  );
}
