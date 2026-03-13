"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuthContext } from "@/context/AuthContext";
import { fetchActivity } from "@/lib/api";

interface ActivityItem {
  id: string;
  type: string;
  title: string;
  description: string;
  created_at: string;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);

  if (d.toDateString() === today.toDateString()) return "Aujourd'hui";
  if (d.toDateString() === yesterday.toDateString()) return "Hier";

  return d.toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function groupByDate(items: ActivityItem[]): Record<string, ActivityItem[]> {
  const groups: Record<string, ActivityItem[]> = {};
  for (const item of items) {
    const key = formatDate(item.created_at);
    if (!groups[key]) groups[key] = [];
    groups[key].push(item);
  }
  return groups;
}

function getDotColor(type: string): string {
  switch (type) {
    case "tool_call":
      return "#ff8c42";
    case "email_sent":
    case "email_read":
      return "#a78bfa";
    case "crm_action":
      return "#00d68f";
    default:
      return "#ff8c42";
  }
}

function getTagColor(type: string): { color: string; bg: string } {
  switch (type) {
    case "tool_call":
      return { color: "#ff8c42", bg: "rgba(255,140,66,0.12)" };
    case "email_sent":
    case "email_read":
      return { color: "#a78bfa", bg: "rgba(167,139,250,0.12)" };
    case "crm_action":
      return { color: "#00d68f", bg: "rgba(0,214,143,0.12)" };
    default:
      return { color: "#ff8c42", bg: "rgba(255,140,66,0.12)" };
  }
}

export default function ActivityPage() {
  const router = useRouter();
  const { user, session, loading: authLoading } = useAuthContext();
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading) return;
    if (!user || !session) {
      router.replace("/login");
      return;
    }

    fetchActivity(session.access_token)
      .then((data) => {
        setActivity(Array.isArray(data) ? data : data.activity ?? []);
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

  const grouped = groupByDate(activity);

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
          Activité
        </h1>
        <p style={{ fontSize: 14, color: "#a39e97" }}>
          Historique des actions effectuées par Aura
        </p>
      </div>

      {/* Loading */}
      {loading && (
        <div style={{ textAlign: "center", padding: 60, color: "#a39e97", fontSize: 14 }}>
          Chargement de l&apos;activité...
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
      {!loading && !error && activity.length === 0 && (
        <div
          style={{
            textAlign: "center",
            padding: 60,
            background: "#ffffff",
            border: "1px solid #e8e2d9",
            borderRadius: 16,
          }}
        >
          <div style={{ fontSize: 40, marginBottom: 16, opacity: 0.3 }}>⏱</div>
          <p style={{ color: "#6b6560", fontSize: 14 }}>Aucune activité enregistrée</p>
          <p style={{ color: "#a39e97", fontSize: 12, marginTop: 4 }}>
            Les actions d&apos;Aura apparaitront ici
          </p>
        </div>
      )}

      {/* Timeline grouped by date */}
      {Object.entries(grouped).map(([date, items]) => (
        <div key={date} style={{ marginBottom: 32 }}>
          <h2
            style={{
              fontSize: 11,
              fontWeight: 600,
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              color: "#a39e97",
              marginBottom: 16,
            }}
          >
            {date}
          </h2>
          <div style={{ position: "relative", paddingLeft: 28 }}>
            {/* Vertical line */}
            <div
              style={{
                position: "absolute",
                left: 4,
                top: 6,
                bottom: 6,
                width: 2,
                background: "#ddd6cc",
                borderRadius: 1,
              }}
            />
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {items.map((item) => (
                <TimelineItem key={item.id} item={item} />
              ))}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function TimelineItem({ item }: { item: ActivityItem }) {
  const dotColor = getDotColor(item.type);
  const tagColors = getTagColor(item.type);

  return (
    <div
      style={{
        position: "relative",
        padding: "10px 14px",
        borderRadius: 10,
        transition: "background 0.15s ease",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = "#f0ebe4";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = "transparent";
      }}
    >
      {/* Dot */}
      <div
        style={{
          position: "absolute",
          left: -24,
          top: 16,
          width: 10,
          height: 10,
          borderRadius: 5,
          border: `2px solid ${dotColor}`,
          background: "#f5f0ea",
        }}
      />

      {/* Time */}
      <div style={{ fontSize: 11, color: "#a39e97", marginBottom: 3 }}>
        {formatTime(item.created_at)}
      </div>

      {/* Title + type badge */}
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: "#1a1a1a" }}>
          {item.title}
        </span>
        <span
          style={{
            fontSize: 10,
            fontWeight: 600,
            color: tagColors.color,
            background: tagColors.bg,
            padding: "2px 7px",
            borderRadius: 5,
          }}
        >
          Aura
        </span>
      </div>

      {/* Description */}
      {item.description && (
        <p style={{ fontSize: 12, color: "#a39e97", marginTop: 3, lineHeight: 1.5 }}>
          {item.description}
        </p>
      )}
    </div>
  );
}
