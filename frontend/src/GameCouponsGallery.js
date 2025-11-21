// src/components/GameCouponsGallery.js
import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

// 👉 Backend del juego (Express, proxy de /api/coupons/gallery)
const BACKEND_BASE =
  (process.env.REACT_APP_BACKEND_URL || "").replace(/\/+$/, "");

// Si quieres, puedes pasar el GAME_ID al front para ayudar a clasificar
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

  // Preferimos la info explícita de juego
  if (acq === "GAME" || channel === "GAME") return "game";
  if (GAME_ID != null && gameId === GAME_ID) return "game";

  // Claim / Direct suelen ser cupones "gratis"
  if (acq === "CLAIM" || acq === "DIRECT") return "direct";

  // Fallback: consideramos direct si no sabemos
  return "direct";
}

// ---------------------- Normalización ----------------------
function normalizeGalleryData(raw) {
  if (!raw) return { groups: [] };

  console.log("Coupons gallery raw:", raw);

  // Caso real actual: { ok, cards: [...], types: [...], debug: {...} }
  if (Array.isArray(raw.cards)) {
    const groups = raw.cards.map((c) => {
      const bucket = classifyBucket(c);
      const type = c.type || "";
      const exampleObj = Array.isArray(c.examples) && c.examples.length
        ? c.examples[0]
        : c.sample || null;
      const exampleText = formatCouponExample(exampleObj);

      return {
        type,
        bucket, // "direct" | "game"
        items: c.items ?? c.itemCount ?? c.count ?? 0,
        stock: c.stock ?? c.total ?? 0,
        examples: Array.isArray(c.examples) ? c.examples : [],
        exampleText,
        displayTitle: mapTypeToTitle(type),
        displaySubtitle: makeSubtitle(exampleText),
        displayBadge:
          bucket === "game" ? "Premio por jugar" : "Cupón directo",
        rawCard: c,
      };
    });

    return { groups };
  }

  // Fallback simple para versiones antiguas
  if (Array.isArray(raw)) {
    const groups = raw.map((g) => {
      const type = g.type || "";
      const exampleObj = Array.isArray(g.examples) && g.examples.length
        ? g.examples[0]
        : null;
      const exampleText = formatCouponExample(exampleObj);
      return {
        type,
        bucket: "direct",
        items: g.items ?? g.itemCount ?? 0,
        stock: g.stock ?? 0,
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

// ---------------------- Card casino ----------------------
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

  return (
    <button
      type="button"
      className={`gcg-card ${bucketClass} ${
        isActive ? "gcg-card--active" : ""
      }`}
      onClick={onClick}
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
          {items > 0 || stock > 0 ? (
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

        // Active por defecto: primero direct, si no hay, primero game
        const direct = g.find((x) => x.bucket === "direct");
        const game = g.find((x) => x.bucket === "game");
        setActiveGroup(direct || game || null);
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

  const directGroups = groups.filter((g) => g.bucket === "direct");
  const gameGroups = groups.filter((g) => g.bucket === "game");

  const handlePlayNow = () => {
    navigate("/jugar");
  };

  const handlePrimaryAction = () => {
    if (!activeGroup) return;
    if (activeGroup.bucket === "game") {
      // Premios por jugar → ir al juego
      navigate("/jugar");
    } else {
      // Cupón directo → más adelante aquí llamaremos a un endpoint de "claim"
      console.log("Direct coupon action for group:", activeGroup);
      alert(
        "En la siguiente fase, aquí conectaremos la emisión real del cupón. 🙂"
      );
    }
  };

  return (
    <main className="gcg-root gcg-root--casino">
      <header className="gcg-header">
        <div className="gcg-header-text">
          <h1 className="gcg-title">Coupon Gallery</h1>
          <p className="gcg-subtitle">
            Choose the type of offer you want to go for: free coupons,
            game rewards, and more from MyCrushPizza.
          </p>
        </div>

        <div className="gcg-header-actions">
          <button
            type="button"
            className="gcg-primary"
            onClick={handlePlayNow}
          >
            🎮 Play now
          </button>
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
          {/* 🔥 Bloque 1: Ofertas directas */}
          {directGroups.length > 0 && (
            <section className="gcg-section">
              <div className="gcg-section-header">
                <h2 className="gcg-section-title">Direct deals</h2>
                <p className="gcg-section-subtitle">
                  Coupons you can get without playing.
                </p>
              </div>

              <div className="gcg-scroll-row">
                {directGroups.map((group) => (
                  <CouponCard
                    key={`direct-${group.type}`}
                    group={group}
                    isActive={activeGroup?.type === group.type}
                    onClick={() => setActiveGroup(group)}
                  />
                ))}
              </div>
            </section>
          )}

          {/* 🎮 Bloque 2: Premios por jugar */}
          {gameGroups.length > 0 && (
            <section className="gcg-section">
              <div className="gcg-section-header">
                <h2 className="gcg-section-title">Rewards for playing</h2>
                <p className="gcg-section-subtitle">
                  Prizes you can win by playing the game.
                </p>
              </div>

              <div className="gcg-scroll-row">
                {gameGroups.map((group) => (
                  <CouponCard
                    key={`game-${group.type}`}
                    group={group}
                    isActive={activeGroup?.type === group.type}
                    onClick={() => setActiveGroup(group)}
                  />
                ))}
              </div>
            </section>
          )}

          {/* Panel de detalle inferior */}
          {activeGroup && (
            <section className="gcg-detail">
              <div className="gcg-detail-card">
                <div className="gcg-detail-badge">
                  {activeGroup.displayBadge}
                </div>
                <h2 className="gcg-detail-title">
                  {activeGroup.displayTitle}
                </h2>

                {activeGroup.exampleText && (
                  <div className="gcg-detail-example">
                    {activeGroup.exampleText}
                  </div>
                )}

                {activeGroup.displaySubtitle && (
                  <p className="gcg-detail-subtitle">
                    {activeGroup.displaySubtitle}
                  </p>
                )}

                <div className="gcg-detail-meta">
                  <span>
                    {activeGroup.items} tipos de cupón · stock{" "}
                    {activeGroup.stock}
                  </span>
                </div>

                <button
                  type="button"
                  className="gcg-detail-cta"
                  onClick={handlePrimaryAction}
                >
                  {activeGroup.bucket === "game"
                    ? "🎮 Jugar para conseguirlo"
                    : "🎁 Obtener cupón"}
                </button>
              </div>
            </section>
          )}
        </>
      )}
    </main>
  );
}
