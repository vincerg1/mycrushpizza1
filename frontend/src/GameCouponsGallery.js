// src/components/GameCouponsGallery.js
import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

// FontAwesome (para el footer)
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faWhatsapp } from "@fortawesome/free-brands-svg-icons";
import { faTiktok } from "@fortawesome/free-brands-svg-icons";
import { faMobileScreenButton } from "@fortawesome/free-solid-svg-icons";

// 👉 Backend del juego (Express, proxy de /api/coupons/gallery)
const BACKEND_BASE =
  (process.env.REACT_APP_BACKEND_URL || "").replace(/\/+$/, "");

// Opcional: GAME_ID para ayudar a clasificar cupones de juego
const GAME_ID = process.env.REACT_APP_GAME_ID
  ? Number(process.env.REACT_APP_GAME_ID)
  : null;

// ---------------------- Fetch ----------------------
async function fetchCouponsGallery() {
  if (!BACKEND_BASE) {
    throw new Error("REACT_APP_BACKEND_URL is not configured");
  }

  const res = await fetch(`${BACKEND_BASE}/game/coupons-gallery`, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
    },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `Failed to fetch coupons gallery: ${res.status} ${res.statusText} ${text}`
    );
  }

  return res.json();
}

// ---------------------- Helpers de formato ----------------------
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
    if (
      variant === "RANGE" &&
      percentMin != null &&
      percentMax != null
    ) {
      return `${percentMin}-${percentMax}%`;
    }
    if (percent != null) return `${percent}%`;
    return "% discount";
  }

  if (isAmount) {
    if (
      variant === "RANGE" &&
      amount != null &&
      maxAmount != null
    ) {
      return `${formatMoney(amount)} – ${formatMoney(maxAmount)}`;
    }
    if (amount != null) return formatMoney(amount);
    return "Discount";
  }

  return "Coupon";
}

// Mapea el tipo técnico a título amigable
function mapTypeToTitle(type) {
  switch (type) {
    case "FIXED_PERCENT":
      return "Descuento fijo";
    case "RANDOM_PERCENT":
      return "Descuento sorpresa";
    case "FIXED_AMOUNT":
      return "Descuento en €";
    default:
      return type || "Oferta";
  }
}

// Subtítulo según ejemplo
function makeSubtitle(exampleText) {
  if (!exampleText) return "";
  return exampleText.includes("%")
    ? `${exampleText} de descuento`
    : `${exampleText} en tu pedido`;
}

// Decide si algo va a bucket "game" o "direct"
function classifyBucket(card) {
  const acq = card.acquisition;
  const channel = card.channel;
  const gameId = card.gameId;
  const subtitle = (card.subtitle || "").toLowerCase();
  const cta = (card.cta || "").toLowerCase();

  if (acq === "GAME" || channel === "GAME") return "game";
  if (GAME_ID != null && gameId === GAME_ID) return "game";

  if (subtitle.includes("jugar") || cta.includes("jugar")) {
    return "game";
  }

  if (acq === "CLAIM" || acq === "DIRECT") return "direct";

  return "direct";
}

// ---------------------- Normalización ----------------------
function normalizeGalleryData(raw) {
  if (!raw) return { groups: [] };

  console.log("Coupons gallery raw:", raw);

  if (Array.isArray(raw.cards)) {
    const groups = raw.cards.map((c) => {
      const bucket = classifyBucket(c); // "direct" | "game"
      const type = c.type || "";

      const title = c.title || "";
      const exampleText =
        title || formatCouponExample(c.sample || c.sampleAccepted || null);

      const displaySubtitleRaw =
        (c.subtitle && String(c.subtitle).trim()) || "";
      const displaySubtitle = displaySubtitleRaw || makeSubtitle(exampleText);

      const items = 1;
      const stock =
        c.remaining != null ? Number(c.remaining || 0) : 0;

      return {
        type,
        bucket,
        items,
        stock,
        examples: title ? [title] : [],
        exampleText,
        displayTitle: mapTypeToTitle(type),
        displaySubtitle,
        displayBadge:
          bucket === "game" ? "Premio por jugar" : "Cupón directo",
        rawCard: c,
      };
    });

    return { groups };
  }

  if (Array.isArray(raw)) {
    const groups = raw.map((g) => {
      const type = g.type || "";
      const title = g.title || "";
      const exampleObj =
        Array.isArray(g.examples) && g.examples.length
          ? g.examples[0]
          : null;
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
        displayBadge: "Cupón directo",
        rawCard: g,
      };
    });
    return { groups };
  }

  return { groups: [] };
}

// ---------------------- Tarjeta (selector) ----------------------
function CouponCard({ group, isActive, onClick }) {
  const {
    displayTitle,
    displaySubtitle,
    exampleText,
    displayBadge,
    items,
    stock,
    bucket,
  } = group;

  const bucketClass =
    bucket === "game" ? "gcg-card--game" : "gcg-card--direct";

  const hasStock = items > 0 || stock > 0;

  return (
    <button
      type="button"
      className={`gcg-card ${bucketClass} ${
        isActive ? "gcg-card--active" : ""
      }`}
      onClick={onClick}
      disabled={!hasStock}
    >
      <div className="gcg-card-header">
        <div className="gcg-card-badge">{displayBadge}</div>
      </div>

      <div className="gcg-card-body">
        <div className="gcg-card-title">{displayTitle}</div>

        {exampleText && (
          <div className="gcg-card-example">{exampleText}</div>
        )}

        {displaySubtitle && (
          <div className="gcg-card-subtitle">{displaySubtitle}</div>
        )}
      </div>

      <div className="gcg-card-footer">
        <div className="gcg-card-stock">
          {hasStock ? (
            <>
              <span className="gcg-card-stock-label">Disponibles:</span>
              <span className="gcg-card-stock-value">
                {stock || items}
              </span>
            </>
          ) : (
            <span className="gcg-card-stock-empty">Sin stock</span>
          )}
        </div>
      </div>
    </button>
  );
}

// ---------------------- Componente principal ----------------------
export default function GameCouponsGallery() {
  const [groups, setGroups] = useState([]);
  const [activeGroup, setActiveGroup] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

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

  function handlePrimaryAction() {
    if (!activeGroup) return;

    if (activeGroup.bucket === "game") {
      navigate("/jugar");
      return;
    }

    // Direct: gratis (más adelante conectaremos emisión real)
    console.log("Obtener cupón directo:", activeGroup);
  }

  const ctaLabel =
    activeGroup?.bucket === "game"
      ? "🎮 Pulsa para Jugar"
      : "🎁 Obtener cupón";

  return (
    <>
      <main className="gcg-root gcg-root--casino">
        <header className="gcg-header">
          <div className="gcg-header-text">
            <h1 className="gcg-title">Coupon Gallery</h1>
            <p className="gcg-subtitle">
              Choose the type of offer you want to go for: free coupons,
              game rewards, and more from MyCrushPizza.
            </p>
          </div>
        </header>

        {loading && (
          <div className="gcg-state gcg-state--loading">
            Loading offers…
          </div>
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
          <>
            {/* Galería de tarjetas (selectores) */}
            <section className="gcg-gallery">
              <div className="gcg-cards-container">
                {groups.map((group) => (
                  <CouponCard
                    key={`${group.bucket}-${group.type}`}
                    group={group}
                    isActive={activeGroup?.type === group.type}
                    onClick={() => setActiveGroup(group)}
                  />
                ))}
              </div>
            </section>

            {/* SOLO botón de acción, sin descripción adicional */}
            {activeGroup && (
              <section className="gcg-detail">
                <button
                  type="button"
                  className="gcg-detail-cta"
                  onClick={handlePrimaryAction}
                >
                  {ctaLabel}
                </button>
              </section>
            )}
          </>
        )}
      </main>

      {/* Footer global de la página */}
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
            <a
              href="tel:694301433"
              className="call-link"
              aria-label="Llamar"
            >
              <FontAwesomeIcon
                icon={faMobileScreenButton}
                className="icon"
              />
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
