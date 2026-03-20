import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ============================================================
// AURA — Edge Function: send-whatsapp
//
// Handles:
//   POST /send-whatsapp { action: "send", to, message }
//   POST /send-whatsapp { action: "save-config", access_token, phone_number_id }
//   POST /send-whatsapp { action: "get-config" }
//   POST /send-whatsapp { action: "delete-config" }
//
// Uses per-user Meta WhatsApp Business API credentials
// ============================================================

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// ─── Auth helper (inlined from _shared/auth.ts) ─────────────
async function getUserFromRequest(
  req: Request
): Promise<{ user_id: string; email: string }> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    throw new Error("Token d'authentification manquant");
  }

  const token = authHeader.replace("Bearer ", "");

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser(token);

  if (error || !user) {
    throw new Error("Token invalide ou expiré. Veuillez vous reconnecter.");
  }

  return { user_id: user.id, email: user.email || "" };
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey",
};

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// ─── Normalize phone number to E.164 format ─────────────────
function normalizePhoneNumber(phone: string): string {
  let cleaned = phone.replace(/[\s.\-()]/g, "");

  if (cleaned.startsWith("0") && cleaned.length === 10) {
    cleaned = "+33" + cleaned.substring(1);
  }

  if (!cleaned.startsWith("+")) {
    cleaned = "+" + cleaned;
  }

  return cleaned;
}

// ─── Send WhatsApp message via Meta API ──────────────────────
async function sendWhatsAppMessage(
  accessToken: string,
  phoneNumberId: string,
  to: string,
  message: string,
  useTemplate = false,
  templateName = "hello_world",
  templateLang = "en_US",
): Promise<{ messageId: string; mode: "text" | "template" }> {
  const url = `https://graph.facebook.com/v22.0/${phoneNumberId}/messages`;
  const toNumber = to.replace("+", "");

  // Build payload based on mode
  // deno-lint-ignore no-explicit-any
  let payload: Record<string, any>;

  if (useTemplate) {
    // Template message — works outside 24h window
    payload = {
      messaging_product: "whatsapp",
      to: toNumber,
      type: "template",
      template: {
        name: templateName,
        language: { code: templateLang },
      },
    };
    console.log(`[send-whatsapp] Envoi template "${templateName}" à ${to}`);
  } else {
    // Free-form text — only works inside 24h window
    payload = {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: toNumber,
      type: "text",
      text: { body: message },
    };
  }

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`WhatsApp API failed (${res.status}): ${err}`);
  }

  const result = await res.json();
  const messageId = result.messages?.[0]?.id || "unknown";
  return { messageId, mode: useTemplate ? "template" : "text" };
}

// ─── Send WhatsApp media (image or document) via Meta API ────
async function sendWhatsAppMedia(
  accessToken: string,
  phoneNumberId: string,
  to: string,
  mediaType: "image" | "document",
  mediaUrl: string,
  caption?: string,
  filename?: string,
): Promise<{ messageId: string }> {
  const url = `https://graph.facebook.com/v22.0/${phoneNumberId}/messages`;
  const toNumber = to.replace("+", "");

  // deno-lint-ignore no-explicit-any
  let mediaPayload: Record<string, any>;

  if (mediaType === "image") {
    mediaPayload = {
      messaging_product: "whatsapp",
      to: toNumber,
      type: "image",
      image: {
        link: mediaUrl,
        ...(caption ? { caption } : {}),
      },
    };
  } else {
    mediaPayload = {
      messaging_product: "whatsapp",
      to: toNumber,
      type: "document",
      document: {
        link: mediaUrl,
        ...(filename ? { filename } : {}),
        ...(caption ? { caption } : {}),
      },
    };
  }

  console.log(`[send-whatsapp] Envoi ${mediaType} à ${to} — URL: ${mediaUrl.substring(0, 80)}...`);

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(mediaPayload),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`WhatsApp Media API failed (${res.status}): ${err}`);
  }

  const result = await res.json();
  const messageId = result.messages?.[0]?.id || "unknown";
  return { messageId };
}

// ─── Get user's WhatsApp config from DB ──────────────────────
// deno-lint-ignore no-explicit-any
async function getUserWhatsAppConfig(supabase: any, userId: string) {
  const { data, error } = await supabase
    .from("whatsapp_integrations")
    .select("access_token, phone_number_id, display_phone")
    .eq("user_id", userId)
    .single();

  if (error || !data) return null;
  return data;
}

// ═══════════════════════════════════════════════════════════════
// HANDLER PRINCIPAL
// ═══════════════════════════════════════════════════════════════

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    let userId: string;
    try {
      const authUser = await getUserFromRequest(req);
      userId = authUser.user_id;
    } catch (authErr) {
      return jsonResponse({ error: authErr instanceof Error ? authErr.message : "Non autorisé" }, 401);
    }

    const { action, ...params } = await req.json();
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // ── ACTION: Save WhatsApp config ──
    if (action === "save-config") {
      const { access_token, phone_number_id } = params;

      if (!access_token || !phone_number_id) {
        return jsonResponse({ error: "access_token et phone_number_id sont requis" }, 400);
      }

      // Validate by calling Meta API
      let displayPhone = "";
      try {
        const testRes = await fetch(
          `https://graph.facebook.com/v22.0/${phone_number_id}?fields=display_phone_number,verified_name`,
          { headers: { Authorization: `Bearer ${access_token}` } }
        );
        if (!testRes.ok) {
          const errBody = await testRes.text();
          console.error("[send-whatsapp] Validation failed:", errBody);
          return jsonResponse({ error: "Identifiants WhatsApp invalides. Vérifiez votre Access Token et Phone Number ID." }, 400);
        }
        const phoneInfo = await testRes.json();
        displayPhone = phoneInfo.display_phone_number || "";
      } catch {
        return jsonResponse({ error: "Impossible de vérifier les identifiants WhatsApp." }, 400);
      }

      // Upsert
      await supabase
        .from("whatsapp_integrations")
        .delete()
        .eq("user_id", userId);

      const { error: insertError } = await supabase
        .from("whatsapp_integrations")
        .insert({
          user_id: userId,
          access_token,
          phone_number_id,
          display_phone: displayPhone,
        });

      if (insertError) {
        throw new Error(`DB insert failed: ${insertError.message}`);
      }

      console.log(`[send-whatsapp] Config saved for user ${userId} (${displayPhone})`);
      return jsonResponse({
        success: true,
        display_phone: displayPhone,
      });
    }

    // ── ACTION: Get WhatsApp config ──
    if (action === "get-config") {
      const config = await getUserWhatsAppConfig(supabase, userId);
      if (!config) {
        return jsonResponse({ configured: false });
      }
      return jsonResponse({
        configured: true,
        display_phone: config.display_phone || config.phone_number_id,
      });
    }

    // ── ACTION: Delete WhatsApp config ──
    if (action === "delete-config") {
      await supabase
        .from("whatsapp_integrations")
        .delete()
        .eq("user_id", userId);

      console.log(`[send-whatsapp] Config deleted for user ${userId}`);
      return jsonResponse({ success: true });
    }

    // ── ACTION: Send WhatsApp message ──
    if (action === "send") {
      const {
        to, message, use_template, template_name, template_lang,
        media_type, file_path, media_url, file_name, caption,
      } = params;

      if (!to) {
        return jsonResponse({ error: "Le champ 'to' est requis" }, 400);
      }

      const config = await getUserWhatsAppConfig(supabase, userId);
      if (!config) {
        return jsonResponse(
          { error: "WhatsApp n'est pas configuré. Allez dans Paramètres → Connecteurs pour ajouter vos identifiants WhatsApp Business." },
          400
        );
      }

      const normalizedTo = normalizePhoneNumber(to);

      // ── Media mode (image or document) ──
      if (media_type === "image" || media_type === "document") {
        // Resolve media URL
        let resolvedUrl = media_url as string | undefined;

        if (!resolvedUrl && file_path) {
          // Generate signed URL from Supabase Storage
          const { data: signedData, error: signedError } = await supabase
            .storage
            .from("presentations")
            .createSignedUrl(file_path as string, 3600); // 1 hour

          if (signedError || !signedData?.signedUrl) {
            return jsonResponse(
              { error: `Impossible de générer l'URL pour le fichier: ${signedError?.message || "fichier introuvable"}` },
              400
            );
          }
          resolvedUrl = signedData.signedUrl;
          console.log(`[send-whatsapp] Signed URL générée pour ${file_path}`);
        }

        if (!resolvedUrl) {
          return jsonResponse(
            { error: "media_url ou file_path est requis pour l'envoi de média" },
            400
          );
        }

        const result = await sendWhatsAppMedia(
          config.access_token,
          config.phone_number_id,
          normalizedTo,
          media_type as "image" | "document",
          resolvedUrl,
          caption as string | undefined,
          (file_name || undefined) as string | undefined,
        );

        console.log(`[send-whatsapp] ${media_type} envoyé à ${normalizedTo} (ID: ${result.messageId})`);

        // Save to database
        const dbMsg = media_type === "image"
          ? `[Image] ${caption || ""}`
          : `[Document: ${file_name || "fichier"}] ${caption || ""}`;

        const { error: dbError } = await supabase
          .from("whatsapp_messages")
          .insert({
            user_id: userId,
            wa_message_id: result.messageId,
            to_number: normalizedTo,
            message: dbMsg.trim(),
            status: "sent",
          });

        if (dbError) {
          console.warn(`[send-whatsapp] DB save failed: ${dbError.message}`);
        }

        const typeLabel = media_type === "image" ? "Image" : `Document "${file_name || "fichier"}"`;
        return jsonResponse({
          success: true,
          message_id: result.messageId,
          mode: media_type,
          message: `${typeLabel} envoyé par WhatsApp à ${normalizedTo}.`,
        });
      }

      // ── Text / Template mode ──
      // Message is required for text mode, not for template mode
      if (!use_template && !message) {
        return jsonResponse({ error: "Le champ 'message' est requis pour l'envoi en texte libre" }, 400);
      }

      const result = await sendWhatsAppMessage(
        config.access_token,
        config.phone_number_id,
        normalizedTo,
        message || "",
        !!use_template,
        template_name as string || "hello_world",
        template_lang as string || "en_US",
      );

      console.log(`[send-whatsapp] Message envoyé à ${normalizedTo} (mode: ${result.mode}, ID: ${result.messageId})`);

      // Save to database
      const { error: dbError } = await supabase
        .from("whatsapp_messages")
        .insert({
          user_id: userId,
          wa_message_id: result.messageId,
          to_number: normalizedTo,
          message: use_template ? `[Template: ${template_name || "hello_world"}]` : message,
          status: "sent",
        });

      if (dbError) {
        console.warn(`[send-whatsapp] DB save failed: ${dbError.message}`);
      }

      const warning = result.mode === "text"
        ? " Note : le message texte libre ne sera reçu que si le destinataire a envoyé un message à votre numéro Business dans les dernières 24h. Sinon, utilisez un template."
        : "";

      return jsonResponse({
        success: true,
        message_id: result.messageId,
        mode: result.mode,
        message: `Message WhatsApp envoyé à ${normalizedTo} (mode: ${result.mode}).${warning}`,
      });
    }

    return jsonResponse({ error: `Action inconnue: ${action}` }, 400);
  } catch (err) {
    console.error("[send-whatsapp] Error:", err);
    return jsonResponse(
      { error: err instanceof Error ? err.message : "Erreur inconnue" },
      500
    );
  }
});
