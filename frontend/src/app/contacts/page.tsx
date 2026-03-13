"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuthContext } from "@/context/AuthContext";
import { fetchContacts, createContact, deleteContact } from "@/lib/api";

interface Contact {
  id: string;
  name: string;
  email: string;
  phone: string;
  company: string;
  notes: string;
  created_at: string;
}

const AVATAR_COLORS = [
  "#ff6b35", "#a78bfa", "#22d3ee", "#00d68f",
  "#ffb020", "#4f8fff", "#ff4757", "#f472b6",
];

function getAvatarColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function getInitials(name: string): string {
  const parts = (name || "").trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "?";
}

const emptyForm = {
  name: "",
  email: "",
  phone: "",
  company: "",
  notes: "",
};

export default function ContactsPage() {
  const router = useRouter();
  const { user, session, loading: authLoading } = useAuthContext();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [hoveredRow, setHoveredRow] = useState<string | null>(null);

  const load = useCallback(
    (q = "") => {
      if (!session) return;
      setLoading(true);
      fetchContacts(session.access_token, q)
        .then((data) => {
          setContacts(Array.isArray(data) ? data : data.contacts ?? []);
        })
        .catch((e) => setError(e.message))
        .finally(() => setLoading(false));
    },
    [session],
  );

  useEffect(() => {
    if (authLoading) return;
    if (!user || !session) {
      router.replace("/login");
      return;
    }
    load();
  }, [user, session, authLoading, router, load]);

  // Debounced search
  useEffect(() => {
    const t = setTimeout(() => load(search), 300);
    return () => clearTimeout(t);
  }, [search, load]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!session) return;
    setSubmitting(true);
    try {
      await createContact(session.access_token, form);
      setForm(emptyForm);
      setShowModal(false);
      load(search);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!session) return;
    try {
      await deleteContact(session.access_token, id);
      setContacts((prev) => prev.filter((c) => c.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
    }
  };

  if (authLoading || (!user && !error)) {
    return (
      <div style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "100vh" }}>
        <div style={{ color: "#a39e97", fontSize: 14 }}>Chargement...</div>
      </div>
    );
  }

  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "10px 14px",
    fontSize: 13,
    borderRadius: 10,
    border: "1px solid #ddd6cc",
    background: "#faf6f1",
    color: "#1a1a1a",
    outline: "none",
    transition: "border-color 0.2s",
  };

  return (
    <div style={{ maxWidth: 960, margin: "0 auto", padding: "48px 24px" }}>
      {/* Header bar */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 32,
          gap: 16,
          flexWrap: "wrap",
        }}
      >
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 700, color: "#1a1a1a", marginBottom: 6 }}>
            Contacts
          </h1>
          <p style={{ fontSize: 14, color: "#a39e97" }}>Gérez vos contacts</p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          style={{
            padding: "10px 20px",
            fontSize: 13,
            fontWeight: 600,
            color: "#fff",
            background: "linear-gradient(135deg, #ff6b35, #ff8c42)",
            border: "none",
            borderRadius: 10,
            cursor: "pointer",
            boxShadow: "0 4px 16px rgba(255,107,53,0.3)",
            transition: "box-shadow 0.2s, transform 0.2s",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.boxShadow = "0 6px 24px rgba(255,107,53,0.5)";
            e.currentTarget.style.transform = "translateY(-1px)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.boxShadow = "0 4px 16px rgba(255,107,53,0.3)";
            e.currentTarget.style.transform = "translateY(0)";
          }}
        >
          + Ajouter un contact
        </button>
      </div>

      {/* Search */}
      <div style={{ position: "relative", marginBottom: 24 }}>
        <svg
          style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", opacity: 0.35 }}
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Rechercher un contact..."
          style={{
            width: "100%",
            padding: "12px 14px 12px 40px",
            fontSize: 13,
            borderRadius: 12,
            border: "1px solid #ddd6cc",
            background: "#ffffff",
            color: "#1a1a1a",
            outline: "none",
          }}
        />
      </div>

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

      {/* Loading */}
      {loading && (
        <div style={{ textAlign: "center", padding: 60, color: "#a39e97", fontSize: 14 }}>
          Chargement des contacts...
        </div>
      )}

      {/* Empty */}
      {!loading && !error && contacts.length === 0 && (
        <div style={{ textAlign: "center", padding: 60, background: "#ffffff", border: "1px solid #e8e2d9", borderRadius: 16 }}>
          <div style={{ fontSize: 40, marginBottom: 16, opacity: 0.3 }}>👤</div>
          <p style={{ color: "#6b6560", fontSize: 14 }}>Aucun contact</p>
          <p style={{ color: "#a39e97", fontSize: 12, marginTop: 4 }}>
            Ajoutez votre premier contact
          </p>
        </div>
      )}

      {/* Table */}
      {!loading && contacts.length > 0 && (
        <div style={{ overflow: "hidden", background: "#ffffff", border: "1px solid #e8e2d9", borderRadius: 16 }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                {["Nom", "Email", "Téléphone", "Entreprise", ""].map((h) => (
                  <th
                    key={h}
                    style={{
                      textAlign: "left",
                      padding: "12px 16px",
                      fontSize: 11,
                      fontWeight: 600,
                      textTransform: "uppercase",
                      letterSpacing: "0.06em",
                      color: "#a39e97",
                      borderBottom: "1px solid #ddd6cc",
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {contacts.map((c) => {
                const color = getAvatarColor(c.name || "");
                const isHovered = hoveredRow === c.id;
                return (
                  <tr
                    key={c.id}
                    onMouseEnter={() => setHoveredRow(c.id)}
                    onMouseLeave={() => setHoveredRow(null)}
                    style={{
                      background: isHovered ? "#f0ebe4" : "transparent",
                      transition: "background 0.15s",
                    }}
                  >
                    <td style={{ padding: "12px 16px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <div
                          style={{
                            width: 32,
                            height: 32,
                            borderRadius: 16,
                            background: color,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontSize: 12,
                            fontWeight: 700,
                            color: "#fff",
                            flexShrink: 0,
                          }}
                        >
                          {getInitials(c.name)}
                        </div>
                        <span style={{ fontSize: 13, fontWeight: 500, color: "#1a1a1a" }}>
                          {c.name}
                        </span>
                      </div>
                    </td>
                    <td style={{ padding: "12px 16px", fontSize: 13, color: "#6b6560" }}>
                      {c.email || "—"}
                    </td>
                    <td style={{ padding: "12px 16px", fontSize: 13, color: "#6b6560" }}>
                      {c.phone || "—"}
                    </td>
                    <td style={{ padding: "12px 16px", fontSize: 13, color: "#6b6560" }}>
                      {c.company || "—"}
                    </td>
                    <td style={{ padding: "12px 16px", textAlign: "right" }}>
                      <div
                        style={{
                          display: "flex",
                          gap: 8,
                          justifyContent: "flex-end",
                          opacity: isHovered ? 1 : 0,
                          transition: "opacity 0.15s",
                        }}
                      >
                        <button
                          onClick={() => handleDelete(c.id)}
                          style={{
                            padding: "4px 10px",
                            fontSize: 11,
                            fontWeight: 500,
                            color: "#ff4757",
                            background: "rgba(255,71,87,0.1)",
                            border: "1px solid rgba(255,71,87,0.2)",
                            borderRadius: 6,
                            cursor: "pointer",
                          }}
                        >
                          Supprimer
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Add contact modal */}
      {showModal && (
        <div
          onClick={() => setShowModal(false)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.3)",
            backdropFilter: "blur(4px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 100,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: 480,
              maxWidth: "90vw",
              background: "#ffffff",
              border: "1px solid #ddd6cc",
              borderRadius: 16,
              padding: 28,
              boxShadow: "0 16px 48px rgba(0,0,0,0.4)",
            }}
          >
            <h2
              style={{
                fontSize: 18,
                fontWeight: 700,
                color: "#1a1a1a",
                marginBottom: 24,
              }}
            >
              Ajouter un contact
            </h2>
            <form onSubmit={handleCreate} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div>
                <label style={{ fontSize: 11, fontWeight: 500, color: "#a39e97", marginBottom: 4, display: "block" }}>
                  Nom complet
                </label>
                <input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  required
                  style={inputStyle}
                  onFocus={(e) => (e.target.style.borderColor = "#ff8c42")}
                  onBlur={(e) => (e.target.style.borderColor = "#ddd6cc")}
                />
              </div>
              <div>
                <label style={{ fontSize: 11, fontWeight: 500, color: "#a39e97", marginBottom: 4, display: "block" }}>
                  Email
                </label>
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  style={inputStyle}
                  onFocus={(e) => (e.target.style.borderColor = "#ff8c42")}
                  onBlur={(e) => (e.target.style.borderColor = "#ddd6cc")}
                />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 500, color: "#a39e97", marginBottom: 4, display: "block" }}>
                    Téléphone
                  </label>
                  <input
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                    style={inputStyle}
                    onFocus={(e) => (e.target.style.borderColor = "#ff8c42")}
                    onBlur={(e) => (e.target.style.borderColor = "#ddd6cc")}
                  />
                </div>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 500, color: "#a39e97", marginBottom: 4, display: "block" }}>
                    Entreprise
                  </label>
                  <input
                    value={form.company}
                    onChange={(e) => setForm({ ...form, company: e.target.value })}
                    style={inputStyle}
                    onFocus={(e) => (e.target.style.borderColor = "#ff8c42")}
                    onBlur={(e) => (e.target.style.borderColor = "#ddd6cc")}
                  />
                </div>
              </div>
              <div>
                <label style={{ fontSize: 11, fontWeight: 500, color: "#a39e97", marginBottom: 4, display: "block" }}>
                  Notes
                </label>
                <textarea
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  rows={3}
                  style={{
                    ...inputStyle,
                    resize: "vertical",
                  }}
                  onFocus={(e) => (e.target.style.borderColor = "#ff8c42")}
                  onBlur={(e) => (e.target.style.borderColor = "#ddd6cc")}
                />
              </div>
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 8 }}>
                <button
                  type="button"
                  onClick={() => {
                    setShowModal(false);
                    setForm(emptyForm);
                  }}
                  style={{
                    padding: "10px 20px",
                    fontSize: 13,
                    fontWeight: 500,
                    color: "#6b6560",
                    background: "transparent",
                    border: "1px solid #ddd6cc",
                    borderRadius: 10,
                    cursor: "pointer",
                  }}
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  style={{
                    padding: "10px 20px",
                    fontSize: 13,
                    fontWeight: 600,
                    color: "#fff",
                    background: "linear-gradient(135deg, #ff6b35, #ff8c42)",
                    border: "none",
                    borderRadius: 10,
                    cursor: "pointer",
                    opacity: submitting ? 0.6 : 1,
                  }}
                >
                  {submitting ? "Enregistrement..." : "Enregistrer"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
