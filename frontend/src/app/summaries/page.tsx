"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuthContext } from "@/context/AuthContext";
import { fetchSummaries } from "@/lib/api";
import ReactMarkdown from "react-markdown";

interface Summary {
  id: string;
  summary_type: string; // "rolling" | "session"
  summary_text: string;
  segment_count: number;
  created_at: string;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function SummariesPage() {
  const router = useRouter();
  const { user, session, loading: authLoading } = useAuthContext();
  const [summaries, setSummaries] = useState<Summary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading) return;
    if (!user || !session) {
      router.replace("/login");
      return;
    }

    fetchSummaries(session.access_token)
      .then((data) => {
        const items: Summary[] = Array.isArray(data) ? data : data.summaries ?? [];
        // Sort by created_at descending (most recent first)
        items.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
        setSummaries(items);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [user, session, authLoading, router]);

  if (authLoading || (!user && !error)) {
    return (
      <div style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "100vh" }}>
        <div style={{ color: "#a39e97", fontSize: 14 }}>Chargement...</div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 960, margin: "0 auto", padding: "48px 24px" }}>
      {/* Header */}
      <div style={{ marginBottom: 40 }}>
        <h1
          style={{
            fontSize: 28,
            fontWeight: 700,
            color: "#1a1a1a",
            marginBottom: 6,
          }}
        >
          Résumés
        </h1>
        <p style={{ fontSize: 14, color: "#a39e97" }}>
          Résumés automatiques générés par Aura
        </p>
      </div>

      {/* Loading */}
      {loading && (
        <div style={{ textAlign: "center", padding: 60, color: "#a39e97", fontSize: 14 }}>
          Chargement des résumés...
        </div>
      )}

      {/* Error */}
      {error && (
        <div
          style={{
            padding: "12px 16px",
            borderRadius: 12,
            background: "rgba(255,71,87,0.1)",
            border: "1px solid rgba(255,71,87,0.2)",
            color: "#ff6b6b",
            fontSize: 13,
            marginBottom: 24,
          }}
        >
          {error}
        </div>
      )}

      {/* Empty */}
      {!loading && !error && summaries.length === 0 && (
        <div
          style={{
            textAlign: "center",
            padding: 60,
            background: "#ffffff",
            border: "1px solid #e8e2d9",
            borderRadius: 16,
          }}
        >
          <div style={{ fontSize: 40, marginBottom: 16, opacity: 0.3 }}>📝</div>
          <p style={{ color: "#6b6560", fontSize: 14 }}>Aucun résumé pour le moment</p>
          <p style={{ color: "#a39e97", fontSize: 12, marginTop: 4 }}>
            Les résumés apparaitront ici automatiquement
          </p>
        </div>
      )}

      {/* Summaries list */}
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {summaries.map((s) => {
          const isRolling = s.summary_type === "rolling";
          const label = isRolling ? "Continu" : "Session";
          const badgeColor = isRolling ? "#ff8c42" : "#a78bfa";
          const badgeBg = isRolling ? "rgba(255,140,66,0.12)" : "rgba(167,139,250,0.12)";
          const isExpanded = expandedId === s.id;

          return (
            <div
              key={s.id}
              style={{
                background: "#ffffff",
                border: "1px solid #e8e2d9",
                borderRadius: 16,
                overflow: "hidden",
                transition: "box-shadow 0.15s ease",
              }}
            >
              {/* Header row — clickable to expand/collapse */}
              <div
                onClick={() => setExpandedId(isExpanded ? null : s.id)}
                style={{
                  padding: "16px 20px",
                  cursor: "pointer",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  transition: "background 0.15s",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "#f8f4ef";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "transparent";
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <span
                    style={{
                      fontSize: 10,
                      fontWeight: 700,
                      textTransform: "uppercase",
                      letterSpacing: "0.06em",
                      color: badgeColor,
                      background: badgeBg,
                      padding: "3px 8px",
                      borderRadius: 6,
                    }}
                  >
                    {label}
                  </span>
                  <span style={{ fontSize: 13, fontWeight: 500, color: "#1a1a1a" }}>
                    {formatDate(s.created_at)}
                  </span>
                  <span style={{ fontSize: 12, color: "#a39e97" }}>
                    {formatTime(s.created_at)}
                  </span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <span style={{ fontSize: 11, color: "#a39e97" }}>
                    {s.segment_count} segments
                  </span>
                  <span
                    style={{
                      fontSize: 14,
                      color: "#a39e97",
                      transform: isExpanded ? "rotate(180deg)" : "rotate(0deg)",
                      transition: "transform 0.2s",
                    }}
                  >
                    ▾
                  </span>
                </div>
              </div>

              {/* Preview (when collapsed) */}
              {!isExpanded && (
                <div style={{ padding: "0 20px 16px" }}>
                  <p
                    style={{
                      fontSize: 13,
                      lineHeight: 1.6,
                      color: "#6b6560",
                      display: "-webkit-box",
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: "vertical",
                      overflow: "hidden",
                    }}
                  >
                    {s.summary_text.replace(/[#*_`>\-]/g, "").slice(0, 200)}
                  </p>
                </div>
              )}

              {/* Full content (when expanded) */}
              {isExpanded && (
                <div
                  style={{
                    padding: "0 20px 20px",
                    borderTop: "1px solid #e8e2d9",
                  }}
                >
                  <div
                    className="summary-markdown"
                    style={{
                      fontSize: 13,
                      lineHeight: 1.8,
                      color: "#3a3530",
                      paddingTop: 16,
                    }}
                  >
                    <ReactMarkdown>{s.summary_text}</ReactMarkdown>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Markdown styles */}
      <style jsx global>{`
        .summary-markdown h1,
        .summary-markdown h2,
        .summary-markdown h3 {
          font-weight: 700;
          color: #1a1a1a;
          margin: 16px 0 8px;
        }
        .summary-markdown h1 { font-size: 18px; }
        .summary-markdown h2 { font-size: 16px; }
        .summary-markdown h3 { font-size: 14px; }
        .summary-markdown p {
          margin: 8px 0;
        }
        .summary-markdown ul,
        .summary-markdown ol {
          padding-left: 20px;
          margin: 8px 0;
        }
        .summary-markdown li {
          margin: 4px 0;
        }
        .summary-markdown strong {
          font-weight: 600;
          color: #1a1a1a;
        }
        .summary-markdown em {
          font-style: italic;
        }
        .summary-markdown code {
          background: #f0ebe4;
          padding: 2px 6px;
          border-radius: 4px;
          font-size: 12px;
        }
        .summary-markdown blockquote {
          border-left: 3px solid #ddd6cc;
          padding-left: 12px;
          margin: 8px 0;
          color: #6b6560;
        }
      `}</style>
    </div>
  );
}
