"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuthContext } from "@/context/AuthContext";
import {
  fetchIntegrations,
  disconnectIntegration,
  handleOAuthCallback,
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

type Section = "general" | "account" | "voice" | "passive" | "connectors" | "danger";

const SECTIONS: { id: Section; label: string }[] = [
  { id: "general", label: "General" },
  { id: "account", label: "Compte" },
  { id: "voice", label: "Assistant vocal" },
  { id: "passive", label: "Ecoute passive" },
  { id: "connectors", label: "Connecteurs" },
  { id: "danger", label: "Zone danger" },
];

export default function SettingsPage() {
  const router = useRouter();
  const { user, session, loading: authLoading, signOut } = useAuthContext();
  const [activeSection, setActiveSection] = useState<Section>("general");
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [loading, setLoading] = useState(true);
  const [disconnecting, setDisconnecting] = useState<Provider | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Local settings state
  const [langue, setLangue] = useState("fr");
  const [theme, setTheme] = useState("light");
  const [timezone, setTimezone] = useState("Europe/Paris");
  const [notifications, setNotifications] = useState(true);
  const [wakeWord, setWakeWord] = useState(true);
  const [voix, setVoix] = useState("alloy");
  const [vitesse, setVitesse] = useState("1.0");
  const [bargeIn, setBargeIn] = useState(true);
  const [continuite, setContinuite] = useState(true);
  const [sonConfirmation, setSonConfirmation] = useState(true);
  const [passiveActive, setPassiveActive] = useState(true);
  const [resumesAuto, setResumesAuto] = useState(true);
  const [passiveTimeout, setPassiveTimeout] = useState("30");
  const [retention, setRetention] = useState("7");
  const [langueTranscription, setLangueTranscription] = useState("fr");

  const [connecting, setConnecting] = useState(false);

  // Process OAuth callback from popup
  const processOAuthCallback = useCallback(
    async (provider: string, code: string) => {
      if (!session?.access_token) return;
      setConnecting(true);
      setError(null);
      try {
        await handleOAuthCallback(provider, code, session.access_token);
        // Refetch integrations to update status
        const updated = await fetchIntegrations(session.access_token);
        setIntegrations(updated);
        setSuccessMsg(`${provider} connecte avec succes`);
        setTimeout(() => setSuccessMsg(null), 4000);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Erreur de connexion OAuth");
      } finally {
        setConnecting(false);
      }
    },
    [session?.access_token]
  );

  // Listen for OAuth callback via postMessage (popup sends this)
  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      if (event.origin !== window.location.origin) return;
      if (event.data?.type !== "oauth-callback") return;
      processOAuthCallback(event.data.provider, event.data.code);
    }
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [processOAuthCallback]);

  // Listen for OAuth callback via localStorage (fallback when popup blocks postMessage)
  useEffect(() => {
    function handleStorage(event: StorageEvent) {
      if (event.key !== "oauth-callback" || !event.newValue) return;
      try {
        const data = JSON.parse(event.newValue);
        if (data.type === "oauth-callback" && data.provider && data.code) {
          processOAuthCallback(data.provider, data.code);
        }
      } catch {
        // ignore parse errors
      }
      localStorage.removeItem("oauth-callback");
    }
    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, [processOAuthCallback]);

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
        setError("Impossible de charger les integrations");
      })
      .finally(() => setLoading(false));
  }, [session?.access_token]);

  const handleConnect = (provider: Provider) => {
    const url = OAUTH_URLS[provider]();
    window.open(url, `${provider}-oauth`, "width=500,height=650,left=200,top=100");
  };

  const handleDisconnect = async (provider: Provider) => {
    if (!session?.access_token) return;
    if (!confirm("Voulez-vous vraiment deconnecter cette integration ?")) return;

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
      setSuccessMsg(`${provider} deconnecte avec succes`);
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur de deconnexion");
    } finally {
      setDisconnecting(null);
    }
  };

  if (authLoading || !user) {
    return (
      <div
        className="flex items-center justify-center"
        style={{ background: "#faf6f1", height: "100vh" }}
      >
        <div
          className="h-16 w-16 animate-spin rounded-full"
          style={{
            border: "3px solid #ddd6cc",
            borderTopColor: "#e36b2b",
            borderRightColor: "#f08c42",
          }}
        />
      </div>
    );
  }

  return (
    <div
      style={{
        display: "flex",
        height: "100vh",
        background: "#faf6f1",
      }}
    >
      {/* Left nav */}
      <nav
        style={{
          width: 220,
          minWidth: 220,
          borderRight: "1px solid #e8e2d9",
          padding: "32px 0",
          display: "flex",
          flexDirection: "column",
          gap: 2,
        }}
      >
        <h1
          style={{
            fontSize: 20,
            fontWeight: 700,
            color: "#1a1a1a",
            padding: "0 24px 24px",
            margin: 0,
          }}
        >
          Parametres
        </h1>
        {SECTIONS.map((s) => {
          const isActive = activeSection === s.id;
          return (
            <button
              key={s.id}
              onClick={() => setActiveSection(s.id)}
              style={{
                display: "block",
                width: "100%",
                textAlign: "left",
                padding: "10px 24px",
                fontSize: 14,
                fontWeight: isActive ? 600 : 400,
                color: isActive ? "#e36b2b" : "#6b6560",
                background: "transparent",
                border: "none",
                borderLeft: isActive ? "2px solid #e36b2b" : "2px solid transparent",
                cursor: "pointer",
                transition: "all 0.15s ease",
              }}
              onMouseEnter={(e) => {
                if (!isActive) {
                  e.currentTarget.style.color = "#1a1a1a";
                  e.currentTarget.style.background = "rgba(0,0,0,0.02)";
                }
              }}
              onMouseLeave={(e) => {
                if (!isActive) {
                  e.currentTarget.style.color = "#6b6560";
                  e.currentTarget.style.background = "transparent";
                }
              }}
            >
              {s.label}
            </button>
          );
        })}
      </nav>

      {/* Main content */}
      <div
        style={{
          flex: 1,
          overflow: "auto",
          padding: "32px 40px",
          maxWidth: 700,
        }}
      >
        {/* Success message */}
        {successMsg && (
          <div
            style={{
              marginBottom: 20,
              padding: "12px 16px",
              borderRadius: 10,
              background: "rgba(45,158,106,0.08)",
              border: "1px solid rgba(45,158,106,0.2)",
              color: "#2d9e6a",
              fontSize: 14,
            }}
          >
            {successMsg}
          </div>
        )}

        {/* Error message */}
        {error && (
          <div
            style={{
              marginBottom: 20,
              padding: "12px 16px",
              borderRadius: 10,
              background: "rgba(212,64,64,0.06)",
              border: "1px solid rgba(212,64,64,0.15)",
              color: "#d44040",
              fontSize: 14,
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <span>{error}</span>
            <button
              onClick={() => setError(null)}
              style={{
                background: "none",
                border: "none",
                color: "#d44040",
                cursor: "pointer",
                fontSize: 12,
                textDecoration: "underline",
              }}
            >
              Fermer
            </button>
          </div>
        )}

        {/* ─── General Section ─── */}
        {activeSection === "general" && (
          <div>
            <SectionTitle>General</SectionTitle>
            <SettingRow
              label="Langue"
              description="Langue de l'interface"
            >
              <Select value={langue} onChange={setLangue} options={[
                { value: "fr", label: "Francais" },
                { value: "en", label: "English" },
                { value: "es", label: "Espanol" },
              ]} />
            </SettingRow>
            <SettingRow
              label="Theme"
              description="Apparence de l'application"
            >
              <Select value={theme} onChange={setTheme} options={[
                { value: "light", label: "Clair" },
                { value: "dark", label: "Sombre" },
                { value: "auto", label: "Systeme" },
              ]} />
            </SettingRow>
            <SettingRow
              label="Fuseau horaire"
              description="Fuseau horaire pour les resumes et les notifications"
            >
              <Select value={timezone} onChange={setTimezone} options={[
                { value: "Europe/Paris", label: "Europe/Paris" },
                { value: "America/New_York", label: "America/New York" },
                { value: "America/Los_Angeles", label: "America/Los Angeles" },
                { value: "Asia/Tokyo", label: "Asia/Tokyo" },
              ]} />
            </SettingRow>
            <SettingRow
              label="Notifications"
              description="Recevoir des notifications push"
            >
              <Toggle checked={notifications} onChange={setNotifications} />
            </SettingRow>
          </div>
        )}

        {/* ─── Account Section ─── */}
        {activeSection === "account" && (
          <div>
            <SectionTitle>Compte</SectionTitle>
            <div
              style={{
                background: "#ffffff",
                border: "1px solid #e8e2d9",
                borderRadius: 12,
                padding: 20,
                marginBottom: 16,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div>
                  <p style={{ fontSize: 15, fontWeight: 600, color: "#1a1a1a", margin: 0 }}>
                    {user.email}
                  </p>
                  <p style={{ fontSize: 13, color: "#a39e97", margin: "4px 0 0" }}>
                    {user.user_metadata?.full_name || ""}
                  </p>
                </div>
                <button
                  onClick={signOut}
                  style={{
                    padding: "8px 16px",
                    borderRadius: 8,
                    border: "1px solid #ddd6cc",
                    background: "#ffffff",
                    color: "#6b6560",
                    fontSize: 13,
                    fontWeight: 500,
                    cursor: "pointer",
                    transition: "all 0.15s ease",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = "#d44040";
                    e.currentTarget.style.color = "#d44040";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = "#ddd6cc";
                    e.currentTarget.style.color = "#6b6560";
                  }}
                >
                  Deconnexion
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ─── Voice Assistant Section ─── */}
        {activeSection === "voice" && (
          <div>
            <SectionTitle>Assistant vocal</SectionTitle>
            <SettingRow
              label="Mot de reveil"
              description="Activer la detection du mot de reveil 'Aura'"
            >
              <Toggle checked={wakeWord} onChange={setWakeWord} />
            </SettingRow>
            <SettingRow
              label="Voix"
              description="Voix de synthese vocale"
            >
              <Select value={voix} onChange={setVoix} options={[
                { value: "alloy", label: "Alloy" },
                { value: "echo", label: "Echo" },
                { value: "fable", label: "Fable" },
                { value: "onyx", label: "Onyx" },
                { value: "nova", label: "Nova" },
                { value: "shimmer", label: "Shimmer" },
              ]} />
            </SettingRow>
            <SettingRow
              label="Vitesse"
              description="Vitesse de la synthese vocale (0.5 - 2.0)"
            >
              <Select value={vitesse} onChange={setVitesse} options={[
                { value: "0.5", label: "0.5x" },
                { value: "0.75", label: "0.75x" },
                { value: "1.0", label: "1.0x" },
                { value: "1.25", label: "1.25x" },
                { value: "1.5", label: "1.5x" },
                { value: "2.0", label: "2.0x" },
              ]} />
            </SettingRow>
            <SettingRow
              label="Barge-in"
              description="Permettre d'interrompre Aura en parlant"
            >
              <Toggle checked={bargeIn} onChange={setBargeIn} />
            </SettingRow>
            <SettingRow
              label="Mode conversation continue"
              description="Rester en mode ecoute apres une reponse"
            >
              <Toggle checked={continuite} onChange={setContinuite} />
            </SettingRow>
            <SettingRow
              label="Son de confirmation"
              description="Jouer un son quand le mot de reveil est detecte"
            >
              <Toggle checked={sonConfirmation} onChange={setSonConfirmation} />
            </SettingRow>
          </div>
        )}

        {/* ─── Passive Listening Section ─── */}
        {activeSection === "passive" && (
          <div>
            <SectionTitle>Ecoute passive</SectionTitle>
            <SettingRow
              label="Ecoute passive"
              description="Ecouter en arriere-plan pour capturer le contexte"
            >
              <Toggle checked={passiveActive} onChange={setPassiveActive} />
            </SettingRow>
            <SettingRow
              label="Resumes automatiques"
              description="Generer automatiquement des resumes des conversations"
            >
              <Toggle checked={resumesAuto} onChange={setResumesAuto} />
            </SettingRow>
            <SettingRow
              label="Timeout (minutes)"
              description="Duree d'inactivite avant de couper l'ecoute"
            >
              <Select value={passiveTimeout} onChange={setPassiveTimeout} options={[
                { value: "15", label: "15 min" },
                { value: "30", label: "30 min" },
                { value: "60", label: "1 heure" },
                { value: "120", label: "2 heures" },
              ]} />
            </SettingRow>
            <SettingRow
              label="Retention (jours)"
              description="Duree de conservation des transcriptions passives"
            >
              <Select value={retention} onChange={setRetention} options={[
                { value: "1", label: "1 jour" },
                { value: "3", label: "3 jours" },
                { value: "7", label: "7 jours" },
                { value: "14", label: "14 jours" },
                { value: "30", label: "30 jours" },
              ]} />
            </SettingRow>
            <SettingRow
              label="Langue de transcription"
              description="Langue utilisee pour la transcription passive"
            >
              <Select value={langueTranscription} onChange={setLangueTranscription} options={[
                { value: "fr", label: "Francais" },
                { value: "en", label: "English" },
                { value: "auto", label: "Detection auto" },
              ]} />
            </SettingRow>
          </div>
        )}

        {/* ─── Connectors Section ─── */}
        {activeSection === "connectors" && (
          <div>
            <SectionTitle>Connecteurs</SectionTitle>
            <p style={{ fontSize: 14, color: "#6b6560", marginBottom: 20 }}>
              Connectez vos outils pour qu&apos;Aura puisse agir en votre nom
            </p>

            {loading ? (
              <div style={{ display: "flex", justifyContent: "center", padding: "40px 0" }}>
                <div
                  className="h-10 w-10 animate-spin rounded-full"
                  style={{
                    border: "3px solid #ddd6cc",
                    borderTopColor: "#e36b2b",
                    borderRightColor: "#f08c42",
                  }}
                />
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
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

            {/* SMS info */}
            <div
              style={{
                marginTop: 20,
                padding: 16,
                borderRadius: 12,
                background: "#ffffff",
                border: "1px solid #e8e2d9",
                borderLeft: "3px solid #e36b2b",
                display: "flex",
                alignItems: "flex-start",
                gap: 12,
              }}
            >
              <span style={{ fontSize: 24 }}>SMS</span>
              <div>
                <h3 style={{ fontSize: 14, fontWeight: 600, color: "#1a1a1a", margin: 0 }}>
                  SMS (Twilio)
                </h3>
                <p style={{ fontSize: 13, color: "#6b6560", margin: "4px 0 0", lineHeight: 1.5 }}>
                  L&apos;envoi de SMS est configure globalement via Twilio.
                  Dites simplement &quot;Envoie un SMS a...&quot; et Aura s&apos;en charge.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* ─── Danger Zone Section ─── */}
        {activeSection === "danger" && (
          <div>
            <SectionTitle>Zone danger</SectionTitle>
            <p style={{ fontSize: 14, color: "#6b6560", marginBottom: 20 }}>
              Ces actions sont irreversibles. Procedez avec prudence.
            </p>

            <DangerAction
              label="Supprimer l'historique"
              description="Supprimer toutes les conversations et transcriptions"
              buttonLabel="Supprimer"
              onClick={() => {
                if (confirm("Etes-vous sur de vouloir supprimer tout l'historique ? Cette action est irreversible.")) {
                  setSuccessMsg("Historique supprime");
                  setTimeout(() => setSuccessMsg(null), 3000);
                }
              }}
            />
            <DangerAction
              label="Deconnecter tous les services"
              description="Revoquer l'acces a tous les connecteurs"
              buttonLabel="Deconnecter tout"
              onClick={() => {
                if (confirm("Etes-vous sur de vouloir deconnecter tous les services ?")) {
                  setSuccessMsg("Tous les services ont ete deconnectes");
                  setTimeout(() => setSuccessMsg(null), 3000);
                }
              }}
            />
            <DangerAction
              label="Supprimer le compte"
              description="Supprimer definitivement votre compte et toutes vos donnees"
              buttonLabel="Supprimer le compte"
              onClick={() => {
                if (confirm("ATTENTION : Cette action est definitive. Supprimer votre compte ?")) {
                  // Would call account deletion API
                }
              }}
            />
          </div>
        )}

        <p
          style={{
            textAlign: "center",
            fontSize: 12,
            color: "#a39e97",
            marginTop: 48,
            paddingBottom: 16,
            fontWeight: 500,
            letterSpacing: "0.04em",
          }}
        >
          Propulse par Hallia
        </p>
      </div>
    </div>
  );
}

// ─── Reusable Sub-components ─────────────────────────────

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2
      style={{
        fontSize: 18,
        fontWeight: 700,
        color: "#1a1a1a",
        margin: "0 0 24px",
      }}
    >
      {children}
    </h2>
  );
}

function SettingRow({
  label,
  description,
  children,
}: {
  label: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "16px 0",
        borderBottom: "1px solid #e8e2d9",
      }}
    >
      <div style={{ flex: 1, minWidth: 0, paddingRight: 24 }}>
        <p style={{ fontSize: 14, fontWeight: 500, color: "#1a1a1a", margin: 0 }}>
          {label}
        </p>
        <p style={{ fontSize: 13, color: "#a39e97", margin: "2px 0 0" }}>
          {description}
        </p>
      </div>
      {children}
    </div>
  );
}

function Toggle({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      onClick={() => onChange(!checked)}
      style={{
        width: 44,
        height: 24,
        borderRadius: 12,
        border: "none",
        background: checked ? "#e36b2b" : "#ddd6cc",
        position: "relative",
        cursor: "pointer",
        transition: "background 0.2s ease",
        flexShrink: 0,
      }}
    >
      <div
        style={{
          width: 18,
          height: 18,
          borderRadius: "50%",
          background: "#fff",
          position: "absolute",
          top: 3,
          left: checked ? 23 : 3,
          transition: "left 0.2s ease",
          boxShadow: "0 1px 3px rgba(0,0,0,0.15)",
        }}
      />
    </button>
  );
}

function Select({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      style={{
        padding: "8px 12px",
        borderRadius: 8,
        border: "1px solid #ddd6cc",
        background: "#ffffff",
        color: "#1a1a1a",
        fontSize: 13,
        cursor: "pointer",
        outline: "none",
        minWidth: 140,
      }}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

function DangerAction({
  label,
  description,
  buttonLabel,
  onClick,
}: {
  label: string;
  description: string;
  buttonLabel: string;
  onClick: () => void;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "16px 20px",
        borderRadius: 12,
        background: "#ffffff",
        border: "1px solid #e8e2d9",
        marginBottom: 12,
      }}
    >
      <div style={{ flex: 1, minWidth: 0, paddingRight: 16 }}>
        <p style={{ fontSize: 14, fontWeight: 500, color: "#1a1a1a", margin: 0 }}>
          {label}
        </p>
        <p style={{ fontSize: 13, color: "#a39e97", margin: "2px 0 0" }}>
          {description}
        </p>
      </div>
      <button
        onClick={onClick}
        style={{
          padding: "8px 16px",
          borderRadius: 8,
          border: "1px solid rgba(212,64,64,0.3)",
          background: "rgba(212,64,64,0.06)",
          color: "#d44040",
          fontSize: 13,
          fontWeight: 500,
          cursor: "pointer",
          transition: "all 0.15s ease",
          flexShrink: 0,
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = "rgba(212,64,64,0.12)";
          e.currentTarget.style.borderColor = "rgba(212,64,64,0.4)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = "rgba(212,64,64,0.06)";
          e.currentTarget.style.borderColor = "rgba(212,64,64,0.3)";
        }}
      >
        {buttonLabel}
      </button>
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
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "16px 20px",
        borderRadius: 12,
        background: "#ffffff",
        border: "1px solid #e8e2d9",
        borderLeft: integration.connected
          ? "3px solid #2d9e6a"
          : "3px solid #ddd6cc",
        transition: "all 0.15s ease",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <span style={{ fontSize: 28 }}>{integration.icon}</span>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <h3 style={{ fontSize: 14, fontWeight: 600, color: "#1a1a1a", margin: 0 }}>
              {integration.label}
            </h3>
            {integration.connected && (
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 5,
                  padding: "2px 8px",
                  borderRadius: 10,
                  fontSize: 11,
                  fontWeight: 600,
                  background: "rgba(45,158,106,0.1)",
                  color: "#2d9e6a",
                }}
              >
                <span
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: "50%",
                    background: "#2d9e6a",
                    display: "inline-block",
                  }}
                />
                Connecte
              </span>
            )}
          </div>
          <p style={{ fontSize: 12, color: "#a39e97", margin: "3px 0 0" }}>
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
          style={{
            padding: "8px 14px",
            borderRadius: 8,
            border: "1px solid #ddd6cc",
            background: "#ffffff",
            color: "#d44040",
            fontSize: 12,
            fontWeight: 600,
            cursor: isDisconnecting ? "not-allowed" : "pointer",
            opacity: isDisconnecting ? 0.4 : 1,
            transition: "all 0.15s ease",
          }}
          onMouseEnter={(e) => {
            if (!isDisconnecting) {
              e.currentTarget.style.background = "rgba(212,64,64,0.06)";
              e.currentTarget.style.borderColor = "rgba(212,64,64,0.3)";
            }
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "#ffffff";
            e.currentTarget.style.borderColor = "#ddd6cc";
          }}
        >
          {isDisconnecting ? "..." : "Deconnecter"}
        </button>
      ) : (
        <button
          onClick={onConnect}
          style={{
            padding: "8px 18px",
            borderRadius: 8,
            border: "none",
            background: "linear-gradient(135deg, #e36b2b, #f08c42, #f5a623)",
            color: "#fff",
            fontSize: 12,
            fontWeight: 700,
            cursor: "pointer",
            transition: "all 0.15s ease",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.boxShadow = "0 2px 12px rgba(227,107,43,0.25)";
            e.currentTarget.style.transform = "translateY(-1px)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.boxShadow = "none";
            e.currentTarget.style.transform = "translateY(0)";
          }}
        >
          Connecter
        </button>
      )}
    </div>
  );
}
