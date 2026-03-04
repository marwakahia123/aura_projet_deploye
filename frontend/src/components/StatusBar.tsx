"use client";

export type AppState =
  | "initializing"
  | "idle"
  | "listening"
  | "thinking"
  | "speaking"
  | "error";

interface StatusBarProps {
  state: AppState;
  fallbackMode?: string;
}

function getIdleMessage(fallbackMode?: string) {
  if (fallbackMode === "custom") return 'Dites "Aura" pour commencer';
  if (fallbackMode === "builtin") return 'Dites "Computer" pour commencer';
  return "Cliquez le bouton pour parler";
}

const STATUS_MESSAGES: Record<AppState, string> = {
  initializing: "Initialisation...",
  idle: "",
  listening: "Je vous écoute...",
  thinking: "Réflexion...",
  speaking: "AURA répond...",
  error: "Erreur",
};

export function StatusBar({ state, fallbackMode }: StatusBarProps) {
  const message =
    state === "idle" ? getIdleMessage(fallbackMode) : STATUS_MESSAGES[state];

  return (
    <div className="text-center">
      <p className="text-lg text-[var(--foreground)]">{message}</p>
      {fallbackMode === "custom" && state === "idle" && (
        <p className="mt-1 text-xs text-[var(--text-muted)]">
          Mot-clé personnalisé actif
        </p>
      )}
      {fallbackMode === "builtin" && state === "idle" && (
        <p className="mt-1 text-xs text-[var(--text-muted)]">
          Mot-clé de secours (keyword &quot;Aura&quot; non trouvé)
        </p>
      )}
      {fallbackMode === "push-to-talk" && state === "idle" && (
        <p className="mt-1 text-xs text-[var(--text-muted)]">
          Mode push-to-talk (wake word indisponible)
        </p>
      )}
    </div>
  );
}
