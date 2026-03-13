"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuthContext } from "@/context/AuthContext";

/* ── Hardcoded colors (matching design/chat-interface.html) ── */
const C = {
  sidebarBg: "#ebe5dc",
  border: "#ddd6cc",
  surface: "#ffffff",
  text: "#1a1a1a",
  textSecondary: "#6b6560",
  textMuted: "#a39e97",
  orange: "#e36b2b",
};

interface NavItem {
  label: string;
  href: string;
  icon: React.ReactNode;
}

const NAV_ITEMS: NavItem[] = [
  {
    label: "Résumés",
    href: "/summaries",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
        <line x1="16" y1="13" x2="8" y2="13" />
        <line x1="16" y1="17" x2="8" y2="17" />
      </svg>
    ),
  },
  {
    label: "Activité",
    href: "/activity",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <polyline points="12 6 12 12 16 14" />
      </svg>
    ),
  },
  {
    label: "Contacts",
    href: "/contacts",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </svg>
    ),
  },
  {
    label: "Discussions",
    href: "/discussions",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      </svg>
    ),
  },
];

const RECENT_SESSIONS = [
  { id: "1", title: "Réunion équipe produit", time: "Il y a 2h" },
  { id: "2", title: "Appel client Dupont", time: "Hier" },
  { id: "3", title: "Brainstorm marketing", time: "Lun" },
];

export function Sidebar() {
  const pathname = usePathname();
  const { user } = useAuthContext();

  const userName = user?.user_metadata?.full_name || user?.email?.split("@")[0] || "Utilisateur";
  const userEmail = user?.email || "";
  const userInitial = userName.charAt(0).toUpperCase();
  const isHome = pathname === "/";

  return (
    <aside
      style={{
        width: 260,
        minWidth: 260,
        background: C.sidebarBg,
        borderRight: `1px solid ${C.border}`,
        display: "flex",
        flexDirection: "column",
        height: "100vh",
        overflow: "hidden",
        fontFamily: "'Inter', -apple-system, sans-serif",
      }}
    >
      {/* ── Logo ── */}
      <Link
        href="/"
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "20px 16px 16px",
          textDecoration: "none",
        }}
      >
        <div
          style={{
            width: 36,
            height: 36,
            borderRadius: "50%",
            background: "linear-gradient(135deg, #e36b2b, #f08c42, #f5a623)",
            boxShadow: "0 2px 12px rgba(227,107,43,0.25)",
            flexShrink: 0,
          }}
        />
        <span
          style={{
            fontSize: 20,
            fontWeight: 700,
            letterSpacing: "0.12em",
            color: C.orange,
          }}
        >
          AURA
        </span>
      </Link>

      {/* ── Navigation ── */}
      <nav style={{ padding: "4px 10px", display: "flex", flexDirection: "column", gap: 2 }}>
        {NAV_ITEMS.map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
          return (
            <Link
              key={item.href}
              href={item.href}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "10px 12px",
                borderRadius: 10,
                fontSize: 13,
                fontWeight: 500,
                color: isActive ? C.text : C.textSecondary,
                background: isActive ? C.surface : "transparent",
                boxShadow: isActive ? "0 1px 3px rgba(0,0,0,0.06)" : "none",
                textDecoration: "none",
                transition: "all 0.15s",
              }}
              onMouseEnter={(e) => {
                if (!isActive) e.currentTarget.style.background = "rgba(0,0,0,0.05)";
              }}
              onMouseLeave={(e) => {
                if (!isActive) e.currentTarget.style.background = "transparent";
              }}
            >
              <span style={{ opacity: isActive ? 1 : 0.6, display: "flex" }}>
                {item.icon}
              </span>
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* ── Divider ── */}
      <div style={{ height: 1, background: C.border, margin: "8px 12px" }} />

      {/* ── Discussions section title ── */}
      <div
        style={{
          padding: "12px 14px 6px",
          fontSize: 10,
          fontWeight: 600,
          letterSpacing: "0.1em",
          textTransform: "uppercase" as const,
          color: C.textMuted,
        }}
      >
        Discussions
      </div>

      {/* ── Sessions list ── */}
      <div style={{ flex: 1, overflowY: "auto", padding: "0 10px" }}>
        {RECENT_SESSIONS.map((s) => (
          <Link
            key={s.id}
            href="/"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "8px 12px",
              borderRadius: 8,
              textDecoration: "none",
              marginBottom: 1,
              transition: "background 0.15s",
              background: isHome && s.id === "1" ? C.surface : "transparent",
              boxShadow: isHome && s.id === "1" ? "0 1px 3px rgba(0,0,0,0.05)" : "none",
            }}
            onMouseEnter={(e) => {
              if (!(isHome && s.id === "1")) e.currentTarget.style.background = "rgba(0,0,0,0.04)";
            }}
            onMouseLeave={(e) => {
              if (!(isHome && s.id === "1")) e.currentTarget.style.background = "transparent";
            }}
          >
            <div
              style={{
                width: 6,
                height: 6,
                borderRadius: "50%",
                background: isHome && s.id === "1" ? C.orange : C.textMuted,
                flexShrink: 0,
              }}
            />
            <span
              style={{
                fontSize: 12,
                color: isHome && s.id === "1" ? C.text : C.textSecondary,
                fontWeight: isHome && s.id === "1" ? 500 : 400,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
                flex: 1,
              }}
            >
              {s.title}
            </span>
            <span style={{ fontSize: 10, color: C.textMuted, flexShrink: 0 }}>
              {s.time}
            </span>
          </Link>
        ))}
      </div>

      {/* ── Footer ── */}
      <div
        style={{
          padding: "12px 16px",
          borderTop: `1px solid ${C.border}`,
          display: "flex",
          alignItems: "center",
          gap: 10,
        }}
      >
        <div
          style={{
            width: 30,
            height: 30,
            borderRadius: "50%",
            background: "linear-gradient(135deg, #e36b2b, #f08c42, #f5a623)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 12,
            fontWeight: 600,
            color: "white",
            flexShrink: 0,
          }}
        >
          {userInitial}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: 13,
              fontWeight: 500,
              color: C.text,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {userName}
          </div>
          <div
            style={{
              fontSize: 10,
              color: C.textMuted,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {userEmail}
          </div>
        </div>
        {/* Settings */}
        <Link
          href="/settings"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: 28,
            height: 28,
            borderRadius: 6,
            color: C.textMuted,
            flexShrink: 0,
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "rgba(0,0,0,0.06)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "transparent";
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
        </Link>
      </div>
    </aside>
  );
}
