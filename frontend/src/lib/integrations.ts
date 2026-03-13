// ============================================================
// AURA — Integration Management
//
// OAuth URL builders + edge function API calls for:
// Gmail, Outlook, Google Calendar, HubSpot, Slack
// ============================================================

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;

// ─── Types ──────────────────────────────────────────────────

export type Provider = "gmail" | "outlook" | "hubspot" | "slack";

export interface Integration {
  provider: Provider;
  label: string;
  description: string;
  icon: string; // emoji
  connected: boolean;
  detail?: string; // email, team name, portal name
  connectedAt?: string;
}

// ─── OAuth Client IDs (public, safe for frontend) ───────────
// These must match the env vars in the edge functions.
// Set them in .env.local as NEXT_PUBLIC_*

const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || "";
const MICROSOFT_CLIENT_ID = process.env.NEXT_PUBLIC_MICROSOFT_CLIENT_ID || "";
const HUBSPOT_CLIENT_ID = process.env.NEXT_PUBLIC_HUBSPOT_CLIENT_ID || "";
const SLACK_CLIENT_ID = process.env.NEXT_PUBLIC_SLACK_CLIENT_ID || "";

// ─── Edge Function caller ───────────────────────────────────

async function callEdgeFunction(
  functionName: string,
  body: Record<string, unknown>,
  accessToken?: string
): Promise<Record<string, unknown>> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (accessToken) {
    headers["Authorization"] = `Bearer ${accessToken}`;
  }

  const res = await fetch(`${SUPABASE_URL}/functions/v1/${functionName}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || data.message || `Erreur ${res.status}`);
  }
  return data;
}

// ─── OAuth URL Builders ─────────────────────────────────────

function getCallbackUrl(): string {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  return `${origin}/settings/callback`;
}

export function getGmailOAuthUrl(): string {
  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    redirect_uri: getCallbackUrl(),
    response_type: "code",
    scope: [
      "https://www.googleapis.com/auth/gmail.send",
      "https://www.googleapis.com/auth/gmail.readonly",
      "https://www.googleapis.com/auth/userinfo.email",
      "https://www.googleapis.com/auth/userinfo.profile",
      "https://www.googleapis.com/auth/calendar.events",
    ].join(" "),
    access_type: "offline",
    prompt: "consent",
    state: "gmail",
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

export function getOutlookOAuthUrl(): string {
  const params = new URLSearchParams({
    client_id: MICROSOFT_CLIENT_ID,
    redirect_uri: getCallbackUrl(),
    response_type: "code",
    scope: [
      "Mail.Send",
      "Mail.Read",
      "User.Read",
      "Calendars.ReadWrite",
      "offline_access",
    ].join(" "),
    state: "outlook",
  });
  return `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?${params}`;
}

export function getHubSpotOAuthUrl(): string {
  const params = new URLSearchParams({
    client_id: HUBSPOT_CLIENT_ID,
    redirect_uri: getCallbackUrl(),
    scope: [
      "crm.objects.contacts.read",
      "crm.objects.contacts.write",
      "crm.objects.deals.read",
      "crm.objects.deals.write",
    ].join(" "),
    state: "hubspot",
  });
  return `https://app.hubspot.com/oauth/authorize?${params}`;
}

export function getSlackOAuthUrl(): string {
  const params = new URLSearchParams({
    client_id: SLACK_CLIENT_ID,
    redirect_uri: getCallbackUrl(),
    user_scope: [
      "channels:read",
      "channels:history",
      "chat:write",
      "users:read",
      "users:read.email",
      "im:write",
      "groups:read",
    ].join(","),
    state: "slack",
  });
  return `https://slack.com/oauth/v2/authorize?${params}`;
}

// ─── OAuth Callback Handler ─────────────────────────────────

export async function handleOAuthCallback(
  provider: string,
  code: string,
  accessToken: string
): Promise<Record<string, unknown>> {
  const redirectUri = getCallbackUrl();

  switch (provider) {
    case "gmail":
    case "outlook":
      // Both email providers use send-email edge function
      return callEdgeFunction(
        "send-email",
        { action: "oauth-callback", provider, code, redirect_uri: redirectUri },
        accessToken
      );

    case "hubspot":
      return callEdgeFunction(
        "hubspot-api",
        { action: "oauth-callback", code, redirect_uri: redirectUri },
        accessToken
      );

    case "slack":
      return callEdgeFunction(
        "slack-api",
        { action: "oauth-callback", code, redirect_uri: redirectUri },
        accessToken
      );

    default:
      throw new Error(`Provider inconnu: ${provider}`);
  }
}

// ─── Fetch Connection Status ────────────────────────────────

export async function fetchIntegrations(
  accessToken: string
): Promise<Integration[]> {
  const integrations: Integration[] = [
    {
      provider: "gmail",
      label: "Gmail",
      description: "Email + Google Calendar",
      icon: "📧",
      connected: false,
    },
    {
      provider: "outlook",
      label: "Outlook",
      description: "Email + Outlook Calendar",
      icon: "📨",
      connected: false,
    },
    {
      provider: "hubspot",
      label: "HubSpot",
      description: "CRM — Contacts, Deals, Notes",
      icon: "🔶",
      connected: false,
    },
    {
      provider: "slack",
      label: "Slack",
      description: "Messages, Canaux, DMs",
      icon: "💬",
      connected: false,
    },
  ];

  // Fetch email integrations (gmail + outlook)
  try {
    const emailData = await callEdgeFunction(
      "send-email",
      { action: "list-integrations" },
      accessToken
    );
    const emailIntegrations = (emailData.integrations || []) as Array<{
      provider: string;
      email: string;
      created_at: string;
    }>;

    for (const ei of emailIntegrations) {
      const idx = integrations.findIndex((i) => i.provider === ei.provider);
      if (idx !== -1) {
        integrations[idx].connected = true;
        integrations[idx].detail = ei.email;
        integrations[idx].connectedAt = ei.created_at;
      }
    }
  } catch (err) {
    console.error("[integrations] Failed to fetch email integrations:", err);
  }

  // Fetch HubSpot
  try {
    const hubData = await callEdgeFunction(
      "hubspot-api",
      { action: "get-connection" },
      accessToken
    );
    const conn = hubData.connection as {
      portal_name?: string;
      created_at?: string;
    } | null;
    if (conn) {
      const idx = integrations.findIndex((i) => i.provider === "hubspot");
      if (idx !== -1) {
        integrations[idx].connected = true;
        integrations[idx].detail = conn.portal_name;
        integrations[idx].connectedAt = conn.created_at;
      }
    }
  } catch (err) {
    console.error("[integrations] Failed to fetch HubSpot status:", err);
  }

  // Fetch Slack
  try {
    const slackData = await callEdgeFunction(
      "slack-api",
      { action: "get-connection" },
      accessToken
    );
    const conn = slackData.connection as {
      team_name?: string;
      created_at?: string;
    } | null;
    if (conn) {
      const idx = integrations.findIndex((i) => i.provider === "slack");
      if (idx !== -1) {
        integrations[idx].connected = true;
        integrations[idx].detail = conn.team_name;
        integrations[idx].connectedAt = conn.created_at;
      }
    }
  } catch (err) {
    console.error("[integrations] Failed to fetch Slack status:", err);
  }

  return integrations;
}

// ─── Disconnect ─────────────────────────────────────────────

export async function disconnectIntegration(
  provider: Provider,
  accessToken: string
): Promise<void> {
  switch (provider) {
    case "gmail":
    case "outlook":
      await callEdgeFunction(
        "send-email",
        { action: "disconnect", provider },
        accessToken
      );
      break;
    case "hubspot":
      await callEdgeFunction(
        "hubspot-api",
        { action: "disconnect" },
        accessToken
      );
      break;
    case "slack":
      await callEdgeFunction(
        "slack-api",
        { action: "disconnect" },
        accessToken
      );
      break;
  }
}
