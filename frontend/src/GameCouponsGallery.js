// src/components/GameCouponsGallery.js
import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

// Backend de VENTAS (parche) → ya lo tienes en REACT_APP_API_URL
const SALES_API_BASE =
  (process.env.REACT_APP_API_URL || "").replace(/\/+$/, "");
const SALES_API_KEY = process.env.REACT_APP_SALES_API_KEY || "";

// Llama directamente al endpoint /api/coupons/gallery del portal de ventas
async function fetchCouponsGallery() {
  if (!SALES_API_BASE) {
    throw new Error("REACT_APP_API_URL is not configured");
  }

  const res = await fetch(`${SALES_API_BASE}/api/coupons/gallery`, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      ...(SALES_API_KEY ? { "x-api-key": SALES_API_KEY } : {})
    }
  });

  const contentType = res.headers.get("content-type") || "";

  if (!contentType.includes("application/json")) {
    const text = await res.text();
    throw new Error(
      `Expected JSON but got: ${text.slice(0, 80)}... (check URL / API key)`
    );
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `Failed to fetch coupons gallery: ${res.status} ${res.statusText} ${text}`
    );
  }

  return res.json();
}

function normalizeGalleryData(raw) {
  if (!raw) return { types: [], groups: [] };

  // Debug inicial para ver qué nos devuelve el backend de ventas
  console.log("Coupons gallery raw:", raw);

  // Caso 1: { types: [...], byType: { ... } }
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

  // Caso 2: array simple [{ type, items, stock, examples }]
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

  return { types: [], groups: [] };
}

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
                {ex}
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
        if (t.length > 0) {
          setActiveType(t[0]);
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

  const handleTypeClick = (type) => {
    setActiveType(type);
  };

  const handleTypeAction = (type) => {
    console.log("Type action clicked:", type);
  };

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

      <section className="gcg-types-row">
        <div className="gcg-types-label">Types:</div>
        <div className="gcg-types-chips">
          {types.map((type) => (
            <button
              key={type}
              type="button"
              className={`gcg-chip ${type === activeType ? "gcg-chip--active" : ""}`}
              onClick={() => handleTypeClick(type)}
            >
              {type}
            </button>
          ))}
        </div>
      </section>

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
          <div className="gcg-gallery-row">
            {groups.map((group) => (
              <CouponTypeCard
                key={group.type}
                group={group}
                isActive={group.type === activeType}
                onClick={() => {
                  handleTypeClick(group.type);
                  handleTypeAction(group.type);
                }}
              />
            ))}
          </div>

          {activeGroup && (
            <div className="gcg-active-info">
              <h2 className="gcg-active-title">{activeGroup.type}</h2>
              <p className="gcg-active-text">
                {activeGroup.items} {activeGroup.items === 1 ? "coupon" : "coupons"}{" "}
                available · total stock {activeGroup.stock}.
              </p>
            </div>
          )}
        </section>
      )}
    </main>
  );
}
