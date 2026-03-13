"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuthContext } from "@/context/AuthContext";
import { handleOAuthCallback } from "@/lib/integrations";

export default function OAuthCallbackPage() {
  const router = useRouter();
  const { session } = useAuthContext();
  const [status, setStatus] = useState<"processing" | "success" | "error">("processing");
  const [message, setMessage] = useState("Connexion en cours...");
  const processedRef = useRef(false);

  useEffect(() => {
    if (processedRef.current) return;
    if (!session?.access_token) return;

    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    const state = params.get("state"); // provider name
    const error = params.get("error");

    if (error) {
      processedRef.current = true;
      setStatus("error");
      setMessage(`OAuth refusé: ${error}`);
      setTimeout(() => {
        router.replace(`/settings?error=${encodeURIComponent(`OAuth refusé: ${error}`)}`);
      }, 2000);
      return;
    }

    if (!code || !state) {
      processedRef.current = true;
      setStatus("error");
      setMessage("Paramètres OAuth manquants");
      setTimeout(() => {
        router.replace("/settings?error=Param%C3%A8tres%20OAuth%20manquants");
      }, 2000);
      return;
    }

    processedRef.current = true;
    const provider = state;

    setMessage(`Connexion de ${provider}...`);

    handleOAuthCallback(provider, code, session.access_token)
      .then((result) => {
        setStatus("success");
        const detail =
          (result as Record<string, string>).email ||
          (result as Record<string, string>).team_name ||
          (result as Record<string, string>).portal_name ||
          provider;
        setMessage(`${provider} connecté : ${detail}`);

        setTimeout(() => {
          router.replace(
            `/settings?success=${encodeURIComponent(`${provider} connecté avec succès`)}`
          );
        }, 1500);
      })
      .catch((err) => {
        setStatus("error");
        const errMsg = err instanceof Error ? err.message : "Erreur inconnue";
        setMessage(errMsg);

        setTimeout(() => {
          router.replace(`/settings?error=${encodeURIComponent(errMsg)}`);
        }, 3000);
      });
  }, [session?.access_token, router]);

  const orbGradient =
    status === "error"
      ? "linear-gradient(135deg, #ff4757, #ff6b81)"
      : status === "success"
        ? "linear-gradient(135deg, #00d68f, #00b894)"
        : "linear-gradient(135deg, #ff6b35, #ff8c42, #ffa726)";

  return (
    <div
      className="flex min-h-screen items-center justify-center px-4"
      style={{ background: "#0a0a0f" }}
    >
      <div
        className="flex flex-col items-center gap-8 rounded-2xl px-10 py-12 text-center"
        style={{
          background: "rgba(255,255,255,0.03)",
          border: "1px solid rgba(255,255,255,0.06)",
          backdropFilter: "blur(20px)",
          minWidth: "320px",
        }}
      >
        {/* Animated orb */}
        <div className="relative">
          {/* Glow layer */}
          <div
            className={`absolute inset-0 rounded-full blur-xl opacity-40 ${
              status === "processing" ? "animate-pulse" : ""
            }`}
            style={{ background: orbGradient }}
          />
          {/* Main orb */}
          <div
            className={`relative flex h-20 w-20 items-center justify-center rounded-full ${
              status === "processing" ? "animate-pulse" : ""
            }`}
            style={{
              background: orbGradient,
              boxShadow: `0 0 40px ${
                status === "error"
                  ? "rgba(255,71,87,0.3)"
                  : status === "success"
                    ? "rgba(0,214,143,0.3)"
                    : "rgba(255,107,53,0.3)"
              }`,
            }}
          >
            <span className="text-2xl text-white font-bold">
              {status === "error" ? "\u2717" : status === "success" ? "\u2713" : "..."}
            </span>
          </div>
        </div>

        <div>
          <h1 className="text-lg font-bold" style={{ color: "#f0f0f0" }}>
            {status === "processing"
              ? "Traitement en cours"
              : status === "success"
                ? "Connexion réussie"
                : "Erreur de connexion"}
          </h1>
          <p className="mt-2 text-sm" style={{ color: "rgba(255,255,255,0.6)" }}>
            {message}
          </p>
        </div>

        {status !== "processing" && (
          <button
            onClick={() => router.replace("/settings")}
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
            Retour aux parametres
          </button>
        )}
      </div>
    </div>
  );
}
