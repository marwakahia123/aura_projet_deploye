"use client";

export type AppState =
  | "initializing"
  | "idle"
  | "listening"
  | "thinking"
  | "speaking"
  | "conversing"
  | "error";

interface StatusBarProps {
  state: AppState;
  fallbackMode?: string;
}

function getIdleMessage(fallbackMode?: string) {
  if (fallbackMode === "custom") return 'Dites "Aura test" pour commencer';
  if (fallbackMode === "builtin") return 'Dites "Computer" pour commencer';
  return "Cliquez le bouton pour parler";
}

const STATUS_MESSAGES: Record<AppState, string> = {
  initializing: "Initialisation...",
  idle: "",
  listening: "Je vous ecoute...",
  thinking: "Reflexion...",
  speaking: "AURA repond...",
  conversing: "Continuez...",
  error: "Erreur",
};

export function StatusBar({ state, fallbackMode }: StatusBarProps) {
  const message =
    state === "idle" ? getIdleMessage(fallbackMode) : STATUS_MESSAGES[state];

  return (
    <div className="text-center">
      <p
        className="text-lg font-light tracking-wide"
        style={{ color: "rgba(255,255,255,0.7)" }}
      >
        {message}
      </p>
      {fallbackMode === "custom" && state === "idle" && (
        <p
          className="mt-2 text-xs font-light"
          style={{ color: "rgba(255,255,255,0.35)" }}
        >
          Mot-cle personnalise actif
        </p>
      )}
      {fallbackMode === "builtin" && state === "idle" && (
        <p
          className="mt-2 text-xs font-light"
          style={{ color: "rgba(255,255,255,0.35)" }}
        >
          Mot-cle de secours (keyword &quot;Aura&quot; non trouve)
        </p>
      )}
      {fallbackMode === "push-to-talk" && state === "idle" && (
        <p
          className="mt-2 text-xs font-light"
          style={{ color: "rgba(255,255,255,0.35)" }}
        >
          Mode push-to-talk (wake word indisponible)
        </p>
      )}
      {state === "conversing" && (
        <p
          className="mt-2 text-xs font-light"
          style={{ color: "rgba(255,255,255,0.35)" }}
        >
          Mode conversation actif
        </p>
      )}
    </div>
  );
}
