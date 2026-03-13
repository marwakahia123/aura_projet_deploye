"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuthContext } from "@/context/AuthContext";
import {
  fetchIntegrations,
  disconnectIntegration,
  getGmailOAuthUrl,
  getOutlookOAuthUrl,
  getHubSpotOAuthUrl,
  getSlackOAuthUrl,
  type Integration,
  type Provider,
} from "@/lib/integrations";

const OAUTH_URLS: Record<Provider, () => string> = {
  gmail: getGmailOAuthUrl,
  outlook: getOutlookOAuthUrl,
  hubspot: getHubSpotOAuthUrl,
  slack: getSlackOAuthUrl,
};

export default function SettingsPage() {
  const router = useRouter();
  const { user, session, loading: authLoading, signOut } = useAuthContext();
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [loading, setLoading] = useState(true);
  const [disconnecting, setDisconnecting] = useState<Provider | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Check for callback success message
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const msg = params.get("success");
    if (msg) {
      setSuccessMsg(decodeURIComponent(msg));
      // Clean URL
      window.history.replaceState({}, "", "/settings");
      setTimeout(() => setSuccessMsg(null), 5000);
    }
    const errMsg = params.get("error");
    if (errMsg) {
      setError(decodeURIComponent(errMsg));
      window.history.replaceState({}, "", "/settings");
    }
  }, []);

  // Redirect if not authenticated
  useEffect(() => {
    if (!authLoading && !user) {
      router.replace("/login");
    }
  }, [authLoading, user, router]);

  // Load integrations
  useEffect(() => {
    if (!session?.access_token) return;

    setLoading(true);
    fetchIntegrations(session.access_token)
      .then(setIntegrations)
      .catch((err) => {
        console.error("[settings] Failed to load integrations:", err);
        setError("Impossible de charger les intégrations");
      })
      .finally(() => setLoading(false));
  }, [session?.access_token]);

  const handleConnect = (provider: Provider) => {
    const url = OAUTH_URLS[provider]();
    window.location.href = url;
  };

  const handleDisconnect = async (provider: Provider) => {
    if (!session?.access_token) return;
    if (!confirm("Voulez-vous vraiment déconnecter cette intégration ?")) return;

    setDisconnecting(provider);
    setError(null);
    try {
      await disconnectIntegration(provider, session.access_token);
      setIntegrations((prev) =>
        prev.map((i) =>
          i.provider === provider
            ? { ...i, connected: false, detail: undefined, connectedAt: undefined }
            : i
        )
      );
      setSuccessMsg(`${provider} déconnecté avec succès`);
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur de déconnexion");
    } finally {
      setDisconnecting(null);
    }
  };

  if (authLoading || !user) {
    return (
      <div
        className="flex min-h-screen items-center justify-center"
        style={{ background: "#0a0a0f" }}
      >
        <div
          className="h-16 w-16 animate-spin rounded-full"
          style={{
            border: "3px solid rgba(255,255,255,0.06)",
            borderTopColor: "#ff6b35",
            borderRightColor: "#ff8c42",
          }}
        />
      </div>
    );
  }

  return (
    <div
      className="min-h-screen px-4 py-8"
      style={{ background: "#0a0a0f" }}
    >
      <div className="mx-auto w-full max-w-2xl">
        {/* Header */}
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1
              className="text-3xl font-black tracking-widest"
              style={{
                background: "linear-gradient(135deg, #ff6b35, #ff8c42, #ffa726)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
              }}
            >
              AURA
            </h1>
            <p
              className="mt-1 text-lg font-semibold tracking-wide"
              style={{ color: "#f0f0f0" }}
            >
              Parametres
            </p>
          </div>
          <button
            onClick={() => router.push("/")}
            className="flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-medium transition-all duration-200"
            style={{
              background: "rgba(255,255,255,0.03)",
              border: "1px solid rgba(255,255,255,0.06)",
              backdropFilter: "blur(20px)",
              color: "rgba(255,255,255,0.6)",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "rgba(255,255,255,0.06)";
              e.currentTarget.style.borderColor = "rgba(255,255,255,0.12)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "rgba(255,255,255,0.03)";
              e.currentTarget.style.borderColor = "rgba(255,255,255,0.06)";
            }}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M10 12L6 8L10 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            Retour
          </button>
        </div>

        {/* Success message */}
        {successMsg && (
          <div
            className="mb-6 rounded-2xl px-5 py-4 text-sm font-medium"
            style={{
              background: "rgba(255,255,255,0.03)",
              border: "1px solid rgba(255,255,255,0.06)",
              borderLeft: "4px solid #00d68f",
              backdropFilter: "blur(20px)",
              color: "#00d68f",
            }}
          >
            {successMsg}
          </div>
        )}

        {/* Error message */}
        {error && (
          <div
            className="mb-6 flex items-center justify-between rounded-2xl px-5 py-4 text-sm font-medium"
            style={{
              background: "rgba(255,255,255,0.03)",
              border: "1px solid rgba(255,255,255,0.06)",
              borderLeft: "4px solid #ff4757",
              backdropFilter: "blur(20px)",
              color: "#ff4757",
            }}
          >
            <span>{error}</span>
            <button
              onClick={() => setError(null)}
              className="ml-3 text-xs underline opacity-70 hover:opacity-100 transition-opacity"
              style={{ color: "#ff4757" }}
            >
              Fermer
            </button>
          </div>
        )}

        {/* Account section */}
        <div
          className="mb-6 rounded-2xl p-6"
          style={{
            background: "rgba(255,255,255,0.03)",
            border: "1px solid rgba(255,255,255,0.06)",
            backdropFilter: "blur(20px)",
          }}
        >
          <h2
            className="mb-5 text-xs font-bold uppercase tracking-widest"
            style={{ color: "rgba(255,255,255,0.35)" }}
          >
            Compte
          </h2>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-base font-semibold" style={{ color: "#f0f0f0" }}>
                {user.email}
              </p>
              <p className="mt-0.5 text-sm" style={{ color: "rgba(255,255,255,0.35)" }}>
                {user.user_metadata?.full_name || ""}
              </p>
            </div>
            <button
              onClick={signOut}
              className="rounded-xl px-5 py-2.5 text-sm font-medium transition-all duration-200"
              style={{
                background: "rgba(255,255,255,0.03)",
                border: "1px solid rgba(255,255,255,0.06)",
                backdropFilter: "blur(20px)",
                color: "rgba(255,255,255,0.6)",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "rgba(255,71,87,0.1)";
                e.currentTarget.style.borderColor = "rgba(255,71,87,0.2)";
                e.currentTarget.style.color = "#ff4757";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "rgba(255,255,255,0.03)";
                e.currentTarget.style.borderColor = "rgba(255,255,255,0.06)";
                e.currentTarget.style.color = "rgba(255,255,255,0.6)";
              }}
            >
              Deconnexion
            </button>
          </div>
        </div>

        {/* Integrations section */}
        <div
          className="rounded-2xl p-6"
          style={{
            background: "rgba(255,255,255,0.03)",
            border: "1px solid rgba(255,255,255,0.06)",
            backdropFilter: "blur(20px)",
          }}
        >
          <h2
            className="mb-1 text-xs font-bold uppercase tracking-widest"
            style={{ color: "rgba(255,255,255,0.35)" }}
          >
            Integrations
          </h2>
          <p className="mb-6 text-sm" style={{ color: "rgba(255,255,255,0.6)" }}>
            Connectez vos outils pour qu&apos;Aura puisse agir en votre nom
          </p>

          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div
                className="h-10 w-10 animate-spin rounded-full"
                style={{
                  border: "3px solid rgba(255,255,255,0.06)",
                  borderTopColor: "#ff6b35",
                  borderRightColor: "#ff8c42",
                }}
              />
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {integrations.map((integration) => (
                <IntegrationCard
                  key={integration.provider}
                  integration={integration}
                  onConnect={() => handleConnect(integration.provider)}
                  onDisconnect={() => handleDisconnect(integration.provider)}
                  isDisconnecting={disconnecting === integration.provider}
                />
              ))}
            </div>
          )}
        </div>

        {/* SMS info */}
        <div
          className="mt-6 rounded-2xl p-6"
          style={{
            background: "rgba(255,255,255,0.03)",
            border: "1px solid rgba(255,255,255,0.06)",
            borderLeft: "4px solid",
            borderImage: "linear-gradient(to bottom, #ff6b35, #ffa726) 1",
            backdropFilter: "blur(20px)",
          }}
        >
          <div className="flex items-start gap-4">
            <span className="text-3xl">📱</span>
            <div>
              <h3 className="text-sm font-semibold" style={{ color: "#f0f0f0" }}>
                SMS (Twilio)
              </h3>
              <p className="mt-1.5 text-xs leading-relaxed" style={{ color: "rgba(255,255,255,0.6)" }}>
                L&apos;envoi de SMS est configure globalement via Twilio.
                Dites simplement &quot;Envoie un SMS a...&quot; et Aura s&apos;en charge.
              </p>
            </div>
          </div>
        </div>

        <p
          className="mt-10 pb-4 text-center text-xs font-medium tracking-wider"
          style={{ color: "rgba(255,255,255,0.2)" }}
        >
          Propulse par Hallia
        </p>
      </div>
    </div>
  );
}

// ─── Integration Card Component ─────────────────────────────

function IntegrationCard({
  integration,
  onConnect,
  onDisconnect,
  isDisconnecting,
}: {
  integration: Integration;
  onConnect: () => void;
  onDisconnect: () => void;
  isDisconnecting: boolean;
}) {
  return (
    <div
      className="flex items-center justify-between rounded-2xl px-5 py-4 transition-all duration-200"
      style={{
        background: "rgba(255,255,255,0.02)",
        border: "1px solid rgba(255,255,255,0.06)",
        borderLeft: integration.connected
          ? "4px solid #00d68f"
          : "4px solid rgba(255,255,255,0.08)",
        backdropFilter: "blur(20px)",
      }}
    >
      <div className="flex items-center gap-4">
        <span className="text-3xl">{integration.icon}</span>
        <div>
          <div className="flex items-center gap-2.5">
            <h3 className="text-sm font-bold" style={{ color: "#f0f0f0" }}>
              {integration.label}
            </h3>
            {integration.connected && (
              <span
                className="flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[10px] font-semibold"
                style={{
                  background: "rgba(0,214,143,0.1)",
                  color: "#00d68f",
                }}
              >
                <span
                  className="inline-block h-1.5 w-1.5 rounded-full"
                  style={{ background: "#00d68f" }}
                />
                Connecte
              </span>
            )}
          </div>
          <p className="mt-0.5 text-xs" style={{ color: "rgba(255,255,255,0.35)" }}>
            {integration.connected && integration.detail
              ? integration.detail
              : integration.description}
          </p>
        </div>
      </div>

      {integration.connected ? (
        <button
          onClick={onDisconnect}
          disabled={isDisconnecting}
          className="rounded-xl px-4 py-2 text-xs font-semibold transition-all duration-200 disabled:opacity-40"
          style={{
            background: "rgba(255,255,255,0.03)",
            border: "1px solid rgba(255,255,255,0.06)",
            color: "#ff4757",
          }}
          onMouseEnter={(e) => {
            if (!isDisconnecting) {
              e.currentTarget.style.background = "rgba(255,71,87,0.1)";
              e.currentTarget.style.borderColor = "rgba(255,71,87,0.2)";
            }
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "rgba(255,255,255,0.03)";
            e.currentTarget.style.borderColor = "rgba(255,255,255,0.06)";
          }}
        >
          {isDisconnecting ? "..." : "Deconnecter"}
        </button>
      ) : (
        <button
          onClick={onConnect}
          className="rounded-xl px-5 py-2.5 text-xs font-bold text-white transition-all duration-200"
          style={{
            background: "linear-gradient(135deg, #ff6b35, #ff8c42, #ffa726)",
            boxShadow: "0 0 20px rgba(255,107,53,0.0)",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.boxShadow = "0 0 24px rgba(255,107,53,0.35)";
            e.currentTarget.style.transform = "translateY(-1px)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.boxShadow = "0 0 20px rgba(255,107,53,0.0)";
            e.currentTarget.style.transform = "translateY(0)";
          }}
        >
          Connecter
        </button>
      )}
    </div>
  );
}
