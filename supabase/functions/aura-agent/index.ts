import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getUserFromRequest } from "../_shared/auth.ts";

// ─── Module imports ──────────────────────────────────────────
import {
  ANTHROPIC_API_KEY,
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
  corsHeaders,
} from "./types.ts";
import type { AgentAttachment, AgentResult } from "./types.ts";
import { buildSystemPrompt } from "./systemPrompt.ts";
import { AGENT_TOOLS } from "./toolDefinitions.ts";
import { logActivity } from "./activityLog.ts";

// ─── Tool implementations ───────────────────────────────────
import { executeGetRecentContext, executeGenerateSummary, executeSaveSummary, executeSearchMemory } from "./tools/core.ts";
import { executeSendEmail, executeListEmails, executeReadEmail, executeSendEmailWithAttachment } from "./tools/email.ts";
import { executeSearchContacts, executeSaveContact, executeAddMeetingNote, executeCreateCalendarEvent, executeListCalendarEvents, executeUpdateCalendarEvent } from "./tools/contacts.ts";
import { executeSendSMS, executeSendWhatsApp } from "./tools/messaging.ts";
import { executeHubspotSearchContacts, executeHubspotCreateContact, executeHubspotUpdateContact, executeHubspotDeleteContact, executeHubspotSearchDeals, executeHubspotCreateDeal, executeHubspotUpdateDeal, executeHubspotGetPipeline, executeHubspotGetNotes, executeHubspotCreateNote, executeHubspotUpdateNote } from "./tools/hubspot.ts";
import { executeSlackSendMessage, executeSlackSendDm, executeSlackListChannels, executeSlackListUsers, executeSlackGetChannelHistory } from "./tools/slack.ts";
import { executeWebSearch } from "./tools/web.ts";
import { executeDatagouvSearch, executeDatagouvGetDataset, executeDatagouvQueryData, executeDatagouvGetResourceInfo, executeDatagouvGetMetrics, executeDatagouvSearchDataservices } from "./tools/datagouv.ts";
import { executeCreatePresentation } from "./tools/presentation.ts";

// ═══════════════════════════════════════════════════════════════
// BOUCLE AGENT (multi-tour)
// ═══════════════════════════════════════════════════════════════

async function agentLoop(
  userMessage: string,
  // deno-lint-ignore no-explicit-any
  supabase: any,
  userId: string,
  userJwt: string,
  userContext?: string,
  conversationId?: string
): Promise<AgentResult> {
  const MAX_TURNS = 5;
  const toolsUsed: string[] = [];
  const attachments: AgentAttachment[] = [];
  let summaryId: string | undefined;

  // deno-lint-ignore no-explicit-any
  const messages: Array<{ role: string; content: any }> = [];

  // Charger l'historique de conversation depuis la DB si conversation_id fourni
  if (conversationId) {
    try {
      const { data: historyRows, error: histError } = await supabase
        .from("conversation_messages")
        .select("role, content, attachments")
        .eq("conversation_id", conversationId)
        .order("created_at", { ascending: true })
        .limit(20);

      if (!histError && historyRows && historyRows.length > 0) {
        for (const row of historyRows) {
          let content = row.content;
          // Enrichir les messages assistant avec les infos d'attachments (présentations, etc.)
          if (row.role === "assistant" && row.attachments && Array.isArray(row.attachments) && row.attachments.length > 0) {
            const attachInfo = row.attachments
              // deno-lint-ignore no-explicit-any
              .map((a: any) => `[Fichier créé: ${a.file_name} — file_path: ${a.file_path}]`)
              .join("\n");
            content += `\n\n${attachInfo}`;
          }
          messages.push({ role: row.role, content });
        }
        console.log(`[Agent] Loaded ${historyRows.length} previous messages from conversation ${conversationId}`);
      }
    } catch (err) {
      console.warn("[Agent] Failed to load conversation history:", err);
    }
  }

  // Construire le message utilisateur courant
  const fullUserMessage = userContext
    ? `${userMessage}\n\n--- CONTEXT FOURNI ---\n${userContext}`
    : userMessage;

  messages.push({ role: "user", content: fullUserMessage });

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    console.log(`[Agent] Tour ${turn + 1}/${MAX_TURNS}`);

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 16384,
        system: buildSystemPrompt(),
        messages,
        tools: AGENT_TOOLS,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Anthropic API error (${response.status}): ${errorText}`);
    }

    const result = await response.json();

    // Ajouter la réponse assistant à la conversation
    messages.push({ role: "assistant", content: result.content });

    // ── Cas 1: Claude a terminé → extraire la réponse texte ──
    if (result.stop_reason === "end_turn") {
      const textBlock = result.content.find(
        (block: { type: string }) => block.type === "text"
      );
      const agentResult: AgentResult = {
        response:
          textBlock?.text ||
          "Désolé, je n'ai pas pu formuler de réponse.",
        tools_used: toolsUsed,
      };
      if (summaryId) agentResult.summary_id = summaryId;
      if (attachments.length > 0) agentResult.attachments = attachments;
      return agentResult;
    }

    // ── Cas 2: Claude veut appeler des outils ──
    if (result.stop_reason === "tool_use") {
      const toolUseBlocks = result.content.filter(
        (block: { type: string }) => block.type === "tool_use"
      );

      // Exécuter tous les outils en PARALLÈLE avec Promise.all
      const toolResults = await Promise.all(
        // deno-lint-ignore no-explicit-any
        toolUseBlocks.map(async (toolCall: any) => {
          console.log(`[Agent] → Appel outil: ${toolCall.name}`, toolCall.input);
          toolsUsed.push(toolCall.name);

          let toolResult: string;

          try {
            switch (toolCall.name) {
              case "get_recent_context":
                toolResult = await executeGetRecentContext(supabase, toolCall.input, userId);
                break;
              case "generate_summary":
                toolResult = await executeGenerateSummary(toolCall.input);
                break;
              case "save_summary": {
                const saveResult = await executeSaveSummary(supabase, toolCall.input, userId);
                toolResult = saveResult.text;
                if (saveResult.id) summaryId = saveResult.id;
                break;
              }
              case "search_memory":
                toolResult = await executeSearchMemory(supabase, toolCall.input);
                break;
              case "send_email":
                toolResult = await executeSendEmail(toolCall.input, userJwt);
                break;
              case "list_emails":
                toolResult = await executeListEmails(toolCall.input, userJwt);
                break;
              case "read_email":
                toolResult = await executeReadEmail(toolCall.input, userJwt);
                break;
              case "search_contacts":
                toolResult = await executeSearchContacts(toolCall.input, userJwt);
                break;
              case "save_contact":
                toolResult = await executeSaveContact(toolCall.input, userJwt);
                break;
              case "add_meeting_note":
                toolResult = await executeAddMeetingNote(toolCall.input, userJwt);
                break;
              case "create_calendar_event":
                toolResult = await executeCreateCalendarEvent(toolCall.input, userJwt);
                break;
              case "list_calendar_events":
                toolResult = await executeListCalendarEvents(toolCall.input, userJwt);
                break;
              case "update_calendar_event":
                toolResult = await executeUpdateCalendarEvent(toolCall.input, userJwt);
                break;
              case "send_sms":
                toolResult = await executeSendSMS(toolCall.input, userJwt);
                break;
              case "send_whatsapp":
                toolResult = await executeSendWhatsApp(toolCall.input, userJwt);
                break;
              case "hubspot_search_contacts":
                toolResult = await executeHubspotSearchContacts(toolCall.input, userJwt);
                break;
              case "hubspot_create_contact":
                toolResult = await executeHubspotCreateContact(toolCall.input, userJwt);
                break;
              case "hubspot_update_contact":
                toolResult = await executeHubspotUpdateContact(toolCall.input, userJwt);
                break;
              case "hubspot_delete_contact":
                toolResult = await executeHubspotDeleteContact(toolCall.input, userJwt);
                break;
              case "hubspot_search_deals":
                toolResult = await executeHubspotSearchDeals(toolCall.input, userJwt);
                break;
              case "hubspot_create_deal":
                toolResult = await executeHubspotCreateDeal(toolCall.input, userJwt);
                break;
              case "hubspot_update_deal":
                toolResult = await executeHubspotUpdateDeal(toolCall.input, userJwt);
                break;
              case "hubspot_get_pipeline":
                toolResult = await executeHubspotGetPipeline(toolCall.input, userJwt);
                break;
              case "hubspot_get_notes":
                toolResult = await executeHubspotGetNotes(toolCall.input, userJwt);
                break;
              case "hubspot_create_note":
                toolResult = await executeHubspotCreateNote(toolCall.input, userJwt);
                break;
              case "hubspot_update_note":
                toolResult = await executeHubspotUpdateNote(toolCall.input, userJwt);
                break;
              case "slack_send_message":
                toolResult = await executeSlackSendMessage(toolCall.input, userJwt);
                break;
              case "slack_send_dm":
                toolResult = await executeSlackSendDm(toolCall.input, userJwt);
                break;
              case "slack_list_channels":
                toolResult = await executeSlackListChannels(toolCall.input, userJwt);
                break;
              case "slack_list_users":
                toolResult = await executeSlackListUsers(toolCall.input, userJwt);
                break;
              case "slack_get_channel_history":
                toolResult = await executeSlackGetChannelHistory(toolCall.input, userJwt);
                break;
              case "web_search":
                toolResult = await executeWebSearch(toolCall.input);
                break;
              case "datagouv_search":
                toolResult = await executeDatagouvSearch(toolCall.input);
                break;
              case "datagouv_get_dataset":
                toolResult = await executeDatagouvGetDataset(toolCall.input);
                break;
              case "datagouv_query_data":
                toolResult = await executeDatagouvQueryData(toolCall.input);
                break;
              case "datagouv_get_resource_info":
                toolResult = await executeDatagouvGetResourceInfo(toolCall.input);
                break;
              case "datagouv_get_metrics":
                toolResult = await executeDatagouvGetMetrics();
                break;
              case "datagouv_search_dataservices":
                toolResult = await executeDatagouvSearchDataservices(toolCall.input);
                break;
              case "create_presentation":
                toolResult = await executeCreatePresentation(toolCall.input, userJwt);
                if (!toolResult.startsWith("Erreur")) {
                  const filePathMatch = toolResult.match(/Chemin \(file_path\): (.+)/);
                  const fileNameMatch = toolResult.match(/Fichier: (.+)/);
                  if (filePathMatch && fileNameMatch) {
                    attachments.push({
                      file_path: filePathMatch[1].trim(),
                      file_name: fileNameMatch[1].trim(),
                      type: "presentation",
                    });
                  }
                }
                break;
              case "send_email_with_attachment":
                toolResult = await executeSendEmailWithAttachment(toolCall.input, userJwt);
                break;
              default:
                toolResult = `Outil inconnu: ${toolCall.name}`;
            }
          } catch (err) {
            toolResult = `Erreur lors de l'exécution de ${toolCall.name}: ${
              err instanceof Error ? err.message : "Erreur inconnue"
            }`;
          }

          console.log(
            `[Agent] ← Résultat ${toolCall.name}: ${toolResult.substring(0, 100)}...`
          );

          // Logger l'activité (non-bloquant)
          const actStatus = toolResult.startsWith("Erreur") ? "error" as const : "success" as const;
          logActivity(supabase, userId, toolCall.name, toolCall.input, toolResult, actStatus);

          return {
            type: "tool_result" as const,
            tool_use_id: toolCall.id,
            content: toolResult,
          };
        })
      );

      // Renvoyer les résultats des outils à Claude
      messages.push({ role: "user", content: toolResults });
      continue;
    }

    // ── Cas 3: stop inattendu (max_tokens, etc.) ──
    const fallbackText = result.content?.find(
      (block: { type: string }) => block.type === "text"
    );
    return {
      response:
        fallbackText?.text ||
        "Désolé, la réponse a été interrompue. Essaie de reformuler.",
      tools_used: toolsUsed,
    };
  }

  return {
    response:
      "Désolé, j'ai atteint la limite de traitement. Essaie de simplifier ta demande.",
    tools_used: toolsUsed,
  };
}

// ═══════════════════════════════════════════════════════════════
// HANDLER PRINCIPAL
// ═══════════════════════════════════════════════════════════════

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { message, context, conversation_id } = body;

    if (!message || typeof message !== "string" || message.trim().length === 0) {
      return new Response(
        JSON.stringify({ error: "Le champ 'message' est requis." }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const userContext =
      context && typeof context === "string" && context.trim().length > 0
        ? context.trim()
        : undefined;

    // Extraire le JWT de l'utilisateur pour le forwarding inter-fonctions
    let userId: string;
    let userJwt: string;
    try {
      const authUser = await getUserFromRequest(req);
      userId = authUser.user_id;
      userJwt = req.headers.get("Authorization") || "";
    } catch {
      userId = "anonymous";
      userJwt = "";
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const convId = conversation_id && typeof conversation_id === "string" ? conversation_id.trim() : undefined;
    console.log(`[aura-agent] Message: "${message.substring(0, 100)}" | User: ${userId}${userContext ? ` | Context: ${userContext.length} chars` : ""}${convId ? ` | Conv: ${convId}` : ""}`);
    const result = await agentLoop(message.trim(), supabase, userId, userJwt, userContext, convId);
    console.log(
      `[aura-agent] Terminé. Outils: [${result.tools_used.join(", ")}]`
    );

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[aura-agent] Error:", error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Erreur inconnue",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
