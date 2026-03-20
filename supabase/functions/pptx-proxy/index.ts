import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getUserFromRequest } from "../_shared/auth.ts";

// ============================================================
// PPTX Proxy — Edge Function
//
// Proxy entre aura-agent et le MCP PowerPoint Server (HTTP).
// 1. Reçoit une description de présentation (titre + slides)
// 2. Appelle le MCP server pour créer le PPTX
// 3. Récupère le fichier généré
// 4. Upload dans Supabase Storage (bucket "presentations")
// 5. Retourne le chemin du fichier
// ============================================================

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const PPTX_MCP_SERVER_URL = Deno.env.get("PPTX_MCP_SERVER_URL") || "http://localhost:8000";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey",
};

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// ─── MCP Server Helper: call a tool ─────────────────────────
interface McpToolResult {
  // deno-lint-ignore no-explicit-any
  content: any[];
  isError?: boolean;
}

async function callMcpTool(
  toolName: string,
  // deno-lint-ignore no-explicit-any
  args: Record<string, any>
): Promise<McpToolResult> {
  const url = `${PPTX_MCP_SERVER_URL}/mcp`;
  console.log(`[pptx-proxy] MCP call: ${toolName}`, JSON.stringify(args).substring(0, 200));

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: crypto.randomUUID(),
      method: "tools/call",
      params: {
        name: toolName,
        arguments: args,
      },
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`MCP server error (${response.status}): ${errText}`);
  }

  const result = await response.json();

  if (result.error) {
    throw new Error(`MCP tool error: ${JSON.stringify(result.error)}`);
  }

  return result.result;
}

// ─── Extract text from MCP result ────────────────────────────
function extractMcpText(result: McpToolResult): string {
  if (!result.content || result.content.length === 0) return "";
  const textItem = result.content.find(
    // deno-lint-ignore no-explicit-any
    (c: any) => c.type === "text"
  );
  return textItem?.text || "";
}

// ─── Build presentation via MCP server ──────────────────────
interface SlideInput {
  title: string;
  content?: string;
  bullets?: string[];
  layout?: string;
}

interface PresentationInput {
  title: string;
  slides: SlideInput[];
  theme?: string;
}

async function buildPresentation(input: PresentationInput): Promise<string> {
  // 1. Create a new presentation
  const createResult = await callMcpTool("create_presentation", {});
  const createText = extractMcpText(createResult);
  console.log(`[pptx-proxy] create_presentation:`, createText.substring(0, 200));

  // 2. Set core properties (title, author)
  await callMcpTool("set_core_properties", {
    title: input.title,
    author: "AURA Assistant",
  });

  // 3. Add each slide
  for (let i = 0; i < input.slides.length; i++) {
    const slide = input.slides[i];

    // Add a blank slide
    const addSlideResult = await callMcpTool("add_slide", {
      layout_index: i === 0 ? 0 : 1, // 0 = title slide, 1 = title + content
    });
    console.log(`[pptx-proxy] add_slide ${i}:`, extractMcpText(addSlideResult).substring(0, 100));

    const slideIndex = i; // 0-based index

    // Populate slide title
    await callMcpTool("populate_placeholder", {
      slide_index: slideIndex,
      placeholder_index: 0, // Title placeholder
      text: slide.title,
    });

    // Add content or bullets
    if (slide.bullets && slide.bullets.length > 0) {
      await callMcpTool("add_bullet_points", {
        slide_index: slideIndex,
        items: slide.bullets,
      });
    } else if (slide.content) {
      await callMcpTool("populate_placeholder", {
        slide_index: slideIndex,
        placeholder_index: 1, // Body placeholder
        text: slide.content,
      });
    }
  }

  // 4. Apply professional design if theme specified
  if (input.theme) {
    try {
      await callMcpTool("apply_professional_design", {
        design_type: "theme",
        theme_name: input.theme,
      });
      console.log(`[pptx-proxy] Thème appliqué: ${input.theme}`);
    } catch (err) {
      console.warn(`[pptx-proxy] Thème non appliqué:`, err);
      // Non-fatal: continue without theme
    }
  }

  // 5. Save presentation to a temp file on the MCP server
  const fileName = input.title
    .replace(/[^a-zA-Z0-9àâäéèêëïîôùûüçÀÂÄÉÈÊËÏÎÔÙÛÜÇ\s-]/g, "")
    .replace(/\s+/g, "_")
    .substring(0, 50);
  const outputPath = `/tmp/${fileName}_${Date.now()}.pptx`;

  const saveResult = await callMcpTool("save_presentation", {
    file_path: outputPath,
  });
  console.log(`[pptx-proxy] save_presentation:`, extractMcpText(saveResult).substring(0, 200));

  return outputPath;
}

// ─── Retrieve PPTX file from MCP server ─────────────────────
async function downloadFromMcpServer(filePath: string): Promise<Uint8Array> {
  // The MCP server saves files on its filesystem.
  // We fetch the file via a simple HTTP GET endpoint.
  const url = `${PPTX_MCP_SERVER_URL}/files${filePath}`;
  console.log(`[pptx-proxy] Downloading PPTX from: ${url}`);

  const response = await fetch(url);
  if (!response.ok) {
    // Fallback: try to get file content via MCP tool
    const result = await callMcpTool("get_presentation_info", {});
    const info = extractMcpText(result);
    throw new Error(
      `Cannot download PPTX from MCP server (${response.status}). Info: ${info.substring(0, 200)}`
    );
  }

  const arrayBuffer = await response.arrayBuffer();
  return new Uint8Array(arrayBuffer);
}

// ─── Main handler ───────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Auth
    const { user_id: userId } = await getUserFromRequest(req);
    console.log(`[pptx-proxy] User: ${userId}`);

    // Parse request
    const body: PresentationInput = await req.json();

    if (!body.title || !body.slides || body.slides.length === 0) {
      return jsonResponse(
        { error: "title et slides[] sont requis" },
        400
      );
    }

    // Validate slides
    for (const slide of body.slides) {
      if (!slide.title) {
        return jsonResponse(
          { error: "Chaque slide doit avoir un titre" },
          400
        );
      }
    }

    console.log(
      `[pptx-proxy] Création présentation: "${body.title}" (${body.slides.length} slides)`
    );

    // 1. Build PPTX via MCP server
    const mcpFilePath = await buildPresentation(body);

    // 2. Download the generated PPTX
    const pptxData = await downloadFromMcpServer(mcpFilePath);
    console.log(`[pptx-proxy] PPTX téléchargé: ${pptxData.length} bytes`);

    // 3. Upload to Supabase Storage
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const fileId = crypto.randomUUID();
    const storagePath = `${userId}/${fileId}.pptx`;
    const displayName = body.title
      .replace(/[^a-zA-Z0-9àâäéèêëïîôùûüçÀÂÄÉÈÊËÏÎÔÙÛÜÇ\s-]/g, "")
      .replace(/\s+/g, "_")
      .substring(0, 50) + ".pptx";

    const { error: uploadError } = await supabase.storage
      .from("presentations")
      .upload(storagePath, pptxData, {
        contentType:
          "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        upsert: false,
      });

    if (uploadError) {
      throw new Error(`Storage upload failed: ${uploadError.message}`);
    }

    console.log(`[pptx-proxy] Uploadé dans Storage: ${storagePath}`);

    return jsonResponse({
      success: true,
      file_path: storagePath,
      file_name: displayName,
      slides_count: body.slides.length,
      size_bytes: pptxData.length,
    });
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error(`[pptx-proxy] Erreur:`, errMsg);
    return jsonResponse({ error: errMsg }, 500);
  }
});
