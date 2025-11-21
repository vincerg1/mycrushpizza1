import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

// 👉 ESTE ES EL BACKEND DEL JUEGO (Express)
const BACKEND_BASE =
  (process.env.REACT_APP_BACKEND_URL || "").replace(/\/+$/, "");

// Usamos al backend del juego como proxy → No necesitamos API key aquí
async function fetchCouponsGallery() {
  if (!BACKEND_BASE) {
    throw new Error("REACT_APP_BACKEND_URL is not configured");
  }

  const res = await fetch(`${BACKEND_BASE}/game/coupons-gallery`, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
    }
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `Failed to fetch coupons gallery: ${res.status} ${res.statusText} ${text}`
    );
  }

  return res.json();
}

// ──────────────────────────────────────────────
// Normalización de datos
// ──────────────────────────────────────────────
function normalizeGalleryData(raw) {
  if (!raw) return { types: [], groups: [] };

  // Debug útil (solo para desarrollo)
  console.log("Coupons gallery raw:", raw);

  // ✅ Caso real actual: { ok, cards: [...], types: [...] }
  if (Array.isArray(raw.cards)) {
    const types =
      Array.isArray(raw.types) && raw.types.length
        ? raw.types
        : raw.cards.map((c) => c.type).filter(Boolean);

    const groups = raw.cards.map((c) => ({
      type: c.type || "",
      // En el backoffice suelen venir como items + stock, pero nos cubrimos:
      items: c.items ?? c.itemCount ?? c.count ?? 0,
      stock: c.stock ?? c.total ?? 0,
      // Ejemplos: pueden ser objetos cupón → los preservamos tal cual
      examples: Array.isArray(c.examples)
        ? c.examples
        : c.sample
        ? [c.sample]
        : [],
    }));

    return { types, groups };
  }

  // 🔁 Caso antiguo 1: { types: [...], byType: { ... } }
  if (Array.isArray(raw.types) && raw.byType && typeof raw.byType === "object") {
    const groups = raw.types
      .map((t) => raw.byType[t])
      .filter(Boolean)
      .map((g) => ({
        type: g.type || "",
        items: g.items ?? g.itemCount ?? 0,
        stock: g.stock ?? 0,
        examples: Array.isArray(g.examples) ? g.examples : [],
      }));

    return { types: raw.types, groups };
  }

  // 🔁 Caso antiguo 2: array simple [{ type, items, stock, examples }]
  if (Array.isArray(raw)) {
    const types = raw.map((g) => g.type).filter(Boolean);
    const groups = raw.map((g) => ({
      type: g.type || "",
      items: g.items ?? g.itemCount ?? 0,
      stock: g.stock ?? 0,
      examples: Array.isArray(g.examples) ? g.examples : [],
    }));
    return { types, groups };
  }

  // Fallback
  return { types: [], groups: [] };
}

// ──────────────────────────────────────────────
// Helper para mostrar ejemplos de cupones
// ──────────────────────────────────────────────
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

  const formatMoney = (v) => {
    const n = Number(v);
    if (!Number.isFinite(n)) return "";
    return `${n.toFixed(2)} €`;
  };

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

  // Fallback genérico
  return "Coupon";
}

// ──────────────────────────────────────────────
// Tarjeta por tipo
// ──────────────────────────────────────────────
function CouponTypeCard({ group, isActive, onClick }) {
  const { type, items, stock, examples } = group;

  return (
    <button
      className={`gcg-type-card ${isActive ? "gcg-type-card--active" : ""}`}
      type="button"
      onClick={onClick}
    >
      <header className="gcg-type-card-header">
        <span className="gcg-pill">{type}</span>
        <span className="gcg-small">
          {items} {items === 1 ? "item" : "items"} · stock {stock}
        </span>
      </header>

      <div className="gcg-type-card-body">
        <div className="gcg-examples-label">Examples:</div>
        {examples && examples.length > 0 ? (
          <div className="gcg-examples">
            {examples.map((ex, idx) => (
              <span key={idx} className="gcg-example">
                {formatCouponExample(ex)}
              </span>
            ))}
          </div>
        ) : (
          <div className="gcg-examples gcg-examples--empty">
            No examples available
          </div>
        )}
      </div>

      <footer className="gcg-type-card-footer">
        <span className="gcg-button-ghost">View coupons</span>
      </footer>
    </button>
  );
}

// ──────────────────────────────────────────────
// Componente principal
// ──────────────────────────────────────────────
export default function GameCouponsGallery() {
  const [types, setTypes] = useState([]);
  const [groups, setGroups] = useState([]);
  const [activeType, setActiveType] = useState(null);
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

        const { types: t, groups: g } = normalizeGalleryData(raw);
        setTypes(t);
        setGroups(g);
        if (t.length > 0) setActiveType(t[0]);

      } catch (err) {
        if (cancelled) return;
        console.error("Error loading coupons gallery:", err);
        setError(err.message || "Unable to load coupons gallery");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();

    return () => { cancelled = true; };
  }, []);

  const activeGroup = groups.find((g) => g.type === activeType) || null;

  return (
    <main className="gcg-root">
      <header className="gcg-header">
        <div>
          <h1 className="gcg-title">Coupon Gallery</h1>
          <p className="gcg-subtitle">
            Choose the type of offer you want to go for: free coupons, game rewards,
            and more from MyCrushPizza.
          </p>
        </div>

        <div className="gcg-header-actions">
          <button
            type="button"
            className="gcg-primary"
            onClick={() => navigate("/jugar")}
          >
            Play now
          </button>
        </div>
      </header>

      {/* Chips de tipos */}
      <section className="gcg-types-row">
        <div className="gcg-types-label">Types:</div>
        <div className="gcg-types-chips">
          {types.map((type) => (
            <button
              key={type}
              className={`gcg-chip ${type === activeType ? "gcg-chip--active" : ""}`}
              onClick={() => setActiveType(type)}
            >
              {type}
            </button>
          ))}
        </div>
      </section>

      {/* Loading */}
      {loading && <div className="gcg-state gcg-state--loading">Loading offers…</div>}

      {/* Error */}
      {error && !loading && (
        <div className="gcg-state gcg-state--error">
          Sorry, we could not load the offers right now.
          <br />
          <small>{error}</small>
        </div>
      )}

      {/* Sin datos */}
      {!loading && !error && groups.length === 0 && (
        <div className="gcg-state gcg-state--empty">
          There are no offers available right now.
        </div>
      )}

      {/* Galería */}
      {!loading && !error && groups.length > 0 && (
        <section className="gcg-gallery">
          <div className="gcg-gallery-row">
            {groups.map((group) => (
              <CouponTypeCard
                key={group.type}
                group={group}
                isActive={group.type === activeType}
                onClick={() => setActiveType(group.type)}
              />
            ))}
          </div>

          {activeGroup && (
            <div className="gcg-active-info">
              <h2 className="gcg-active-title">{activeGroup.type}</h2>
              <p className="gcg-active-text">
                {activeGroup.items} coupons available · total stock {activeGroup.stock}.
              </p>
            </div>
          )}
        </section>
      )}
    </main>
  );
}
