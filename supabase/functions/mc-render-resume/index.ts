import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * Converts a subset of Markdown to clean print-ready HTML.
 * Handles headings, bold, italic, bullet lists, and horizontal rules.
 */
function markdownToHtml(md: string): string {
  const lines = md.split("\n");
  const out: string[] = [];
  let inList = false;

  for (const raw of lines) {
    let line = raw;

    // Horizontal rule
    if (/^---+$/.test(line.trim())) {
      if (inList) { out.push("</ul>"); inList = false; }
      out.push("<hr>");
      continue;
    }

    // Headings
    const h3 = line.match(/^### (.+)/);
    const h2 = line.match(/^## (.+)/);
    const h1 = line.match(/^# (.+)/);
    if (h1) {
      if (inList) { out.push("</ul>"); inList = false; }
      out.push(`<h1>${inline(h1[1])}</h1>`);
      continue;
    }
    if (h2) {
      if (inList) { out.push("</ul>"); inList = false; }
      out.push(`<h2>${inline(h2[1])}</h2>`);
      continue;
    }
    if (h3) {
      if (inList) { out.push("</ul>"); inList = false; }
      out.push(`<h3>${inline(h3[1])}</h3>`);
      continue;
    }

    // Bullet list item
    const bullet = line.match(/^[-*] (.+)/);
    if (bullet) {
      if (!inList) { out.push("<ul>"); inList = true; }
      out.push(`<li>${inline(bullet[1])}</li>`);
      continue;
    }

    // Blank line
    if (!line.trim()) {
      if (inList) { out.push("</ul>"); inList = false; }
      continue;
    }

    // Paragraph
    if (inList) { out.push("</ul>"); inList = false; }
    out.push(`<p>${inline(line)}</p>`);
  }

  if (inList) out.push("</ul>");
  return out.join("\n");
}

function inline(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/_(.+?)_/g, "<em>$1</em>")
    .replace(/`(.+?)`/g, "<code>$1</code>");
}

function buildHtmlPage(name: string, bodyHtml: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(name)}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: Georgia, 'Times New Roman', serif;
    font-size: 11pt;
    line-height: 1.5;
    color: #111;
    max-width: 800px;
    margin: 0 auto;
    padding: 40px 48px;
  }
  h1 { font-size: 20pt; margin-bottom: 4px; }
  h2 {
    font-size: 13pt;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    border-bottom: 1px solid #aaa;
    margin-top: 18px;
    margin-bottom: 6px;
    padding-bottom: 2px;
  }
  h3 { font-size: 11pt; margin-top: 10px; }
  p { margin-bottom: 4px; }
  ul { margin: 4px 0 8px 18px; }
  li { margin-bottom: 2px; }
  hr { border: none; border-top: 1px solid #ccc; margin: 12px 0; }
  code { font-family: monospace; font-size: 10pt; }
  @media print {
    body { padding: 0; max-width: 100%; }
    @page { margin: 0.75in; }
  }
</style>
</head>
<body>
${bodyHtml}
<script>
  // Auto-trigger print dialog so users can Save as PDF.
  window.onload = function() { window.print(); };
</script>
</body>
</html>`;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { resume_id, format } = await req.json();
    if (!resume_id) {
      return new Response(JSON.stringify({ error: "resume_id is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: resume, error: fetchErr } = await supabase
      .from("mc_tailored_resumes")
      .select("name, cv_md")
      .eq("id", resume_id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (fetchErr || !resume) {
      return new Response(JSON.stringify({ error: "Resume not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (format === "pdf") {
      // Return a print-ready HTML page. The frontend opens it in a new tab;
      // the page auto-triggers the browser's print dialog (Save as PDF).
      const bodyHtml = markdownToHtml(resume.cv_md);
      const html = buildHtmlPage(resume.name, bodyHtml);
      const encoded = btoa(unescape(encodeURIComponent(html)));
      const dataUrl = `data:text/html;base64,${encoded}`;
      return new Response(JSON.stringify({ url: dataUrl, format: "html" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // DOCX: not yet supported server-side — return the markdown as a .md
    // download URL so the request still succeeds with useful output.
    const encoded = btoa(unescape(encodeURIComponent(resume.cv_md)));
    const dataUrl = `data:text/markdown;base64,${encoded}`;
    return new Response(JSON.stringify({ url: dataUrl, format: "md" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("mc-render-resume error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
