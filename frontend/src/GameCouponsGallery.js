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
    console.error(
      "[GameCouponsGallery] REACT_APP_BACKEND_URL is not configured. BACKEND_BASE=",
      BACKEND_BASE
    );
    throw new Error("REACT_APP_BACKEND_URL is not configured");
  }

  const url = `${BACKEND_BASE}/game/coupons-gallery`;
  console.log("[GameCouponsGallery] Fetching gallery from:", url);

  const res = await fetch(url, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
    },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    console.error(
      "[GameCouponsGallery] Failed to fetch coupons gallery:",
      res.status,
      res.statusText,
      text
    );
    throw new Error(
      `Failed to fetch coupons gallery: ${res.status} ${res.statusText} ${text}`
    );
  }

  const data = await res.json();
  console.log("[GameCouponsGallery] Gallery response:", data);
  return data;
}

// 🔗 Reclamo directo de cupón (proxy al backend del juego)
async function claimDirectCoupon({ phone, name, type, key, hours, campaign }) {
  if (!BACKEND_BASE) {
    console.error(
      "[GameCouponsGallery] REACT_APP_BACKEND_URL is not configured. BACKEND_BASE=",
      BACKEND_BASE
    );
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

  const url = `${BACKEND_BASE}/game/direct-claim`;
  // Log sin mostrar el teléfono completo
  console.log("[GameCouponsGallery] POST /game/direct-claim payload:", {
    ...payload,
    phone: phone ? `${String(phone).slice(0, 3)}******` : null,
  });

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const text = await res.text().catch(() => "");
  let data = null;

  try {
    data = text ? JSON.parse(text) : null;
  } catch (e) {
    console.error(
      "[GameCouponsGallery] Invalid JSON from direct-claim:",
      res.status,
      res.statusText,
      text
    );
    throw new Error(
      `Invalid response from direct-claim: ${res.status} ${res.statusText}`
    );
  }

  console.log(
    "[GameCouponsGallery] /game/direct-claim response:",
    res.status,
    res.statusText,
    data
  );

  // El backend de juego ya normaliza a { ok: true/false, error? }
  // Si por lo que sea viene sin ok, lo forzamos a false para que el modal lo trate como error.
  if (data && typeof data.ok === "undefined") {
    data.ok = false;
    if (!data.error) {
      data.error = "unexpected_response";
    }
  }

  return data || { ok: false, error: "empty_response" };
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

  console.log("Coupons gallery raw (normalizeGalleryData):", raw);

  // Caso API nueva: { cards: [...] }
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
        displayBadge:
          bucket === "game" ? "Premio por jugar" : "Cupón directo",
        rawCard: c,
      };
    });

    console.log("[GameCouponsGallery] Normalized groups:", groups);
    return { groups };
  }

  // Caso legacy: raw = [ ... ]
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
        displayBadge: "Cupón directo",
        rawCard: g,
      };
    });
    console.log("[GameCouponsGallery] Normalized groups (legacy):", groups);
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

// ---------------------- Modal de captura ----------------------
function ClaimModal({ open, onClose, onSubmit, activeGroup, state }) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");

  // Reset campos cuando se abre/cambia el grupo
  useEffect(() => {
    if (open) {
      setName("");
      setPhone("");
    }
  }, [open, activeGroup?.type]);

  if (!open) return null;

  const { sending, error, result } = state || {};

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

  const success = result && result.ok;

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

  // Datos del cupón devueltos por /direct-claim (ventas)
  const couponCode = result?.code || null;
  const couponTitle = result?.title || null;
  const couponExpiresAt = result?.expiresAt || null;
  const couponExpiresText = couponExpiresAt
    ? new Date(couponExpiresAt).toLocaleString("es-ES")
    : null;

  return (
    <div className="gcg-modal-backdrop" onClick={sending ? undefined : onClose}>
      <div
        className="gcg-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="gcg-modal-title">
          {activeGroup?.bucket === "game"
            ? "Premio por jugar"
            : "Cupón directo"}
        </h2>

        {!success && (
          <p className="gcg-modal-text">
            Déjanos tus datos y te enviaremos el cupón por SMS.
          </p>
        )}

        {success && (
          <div className="gcg-modal-success-block">
            <p className="gcg-modal-text gcg-modal-text--success">
              ✅ Hemos enviado tu cupón por SMS al número indicado.
            </p>
            {couponCode && (
              <p className="gcg-modal-text">
                Código de tu cupón:{" "}
                <strong className="gcg-modal-code">{couponCode}</strong>
              </p>
            )}
            {couponTitle && (
              <p className="gcg-modal-text">
                Valor de la oferta: <strong>{couponTitle}</strong>
              </p>
            )}
            {couponExpiresText && (
              <p className="gcg-modal-text">
                Válido hasta: <strong>{couponExpiresText}</strong>
              </p>
            )}
            <p className="gcg-modal-text">
              Si no lo ves, revisa también tu bandeja de SMS bloqueados.
            </p>
          </div>
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

// ---------------------- Componente principal ----------------------
export default function GameCouponsGallery() {
  const [groups, setGroups] = useState([]);
  const [activeGroup, setActiveGroup] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // estado del modal de claim
  const [claimOpen, setClaimOpen] = useState(false);
  const [claimState, setClaimState] = useState({
    sending: false,
    error: null,
    result: null,
  });

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
        } else {
          setActiveGroup(null);
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
    if (!activeGroup) {
      console.warn("[GameCouponsGallery] handlePrimaryAction with no activeGroup");
      return;
    }

    console.log("[GameCouponsGallery] Primary action on group:", activeGroup);

    if (activeGroup.bucket === "game") {
      navigate("/jugar");
      return;
    }

    // Direct: abre modal de captura
    setClaimState({ sending: false, error: null, result: null });
    setClaimOpen(true);
  }

  const handleSubmitClaim = async ({ name, phone }) => {
    if (!activeGroup) {
      console.warn(
        "[GameCouponsGallery] handleSubmitClaim with no activeGroup"
      );
      return;
    }

    setClaimState({ sending: true, error: null, result: null });

    try {
      const type = activeGroup.rawCard?.type;
      const key = activeGroup.rawCard?.key;

      console.log("[GameCouponsGallery] Submitting claim with type/key:", {
        type,
        key,
      });

      const resp = await claimDirectCoupon({
        phone,
        name,
        type,
        key,
        // opcional: podrías pasar hours/campaign si quieres
      });

      if (!resp.ok) {
        console.warn("[GameCouponsGallery] direct-claim returned error:", resp);
        setClaimState({
          sending: false,
          error: null, // se traduce en el modal
          result: resp,
        });
      } else {
        console.log("[GameCouponsGallery] direct-claim success:", resp);

        // Actualizar el stock en memoria (si tenemos stock finito)
        setGroups((prev) => {
          const updated = prev.map((g) => {
            if (
              g.type === activeGroup.type &&
              g.bucket === activeGroup.bucket
            ) {
              const newStock =
                typeof g.stock === "number"
                  ? Math.max(0, (g.stock || 0) - 1)
                  : g.stock;
              return { ...g, stock: newStock };
            }
            return g;
          });
          return updated;
        });

        setActiveGroup((prev) => {
          if (!prev) return prev;
          const newStock =
            typeof prev.stock === "number"
              ? Math.max(0, (prev.stock || 0) - 1)
              : prev.stock;
          return { ...prev, stock: newStock };
        });

        setClaimState({
          sending: false,
          error: null,
          result: resp,
        });
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
                    isActive={
                      activeGroup?.type === group.type &&
                      activeGroup?.bucket === group.bucket
                    }
                    onClick={() => {
                      console.log(
                        "[GameCouponsGallery] Selecting group:",
                        group
                      );
                      setActiveGroup(group);
                    }}
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
                  disabled={
                    activeGroup.bucket === "direct" &&
                    activeGroup.stock <= 0 &&
                    activeGroup.items <= 0
                  }
                >
                  {ctaLabel}
                </button>
              </section>
            )}
          </>
        )}

        {/* Modal de captura para cupones directos */}
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
