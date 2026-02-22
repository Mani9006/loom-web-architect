import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function parseIntEnv(name: string, fallback: number): number {
  const raw = Deno.env.get(name);
  const parsed = raw ? Number.parseInt(raw, 10) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function clampText(value: string, maxChars: number): string {
  if (!value || value.length <= maxChars) return value;
  return `${value.slice(0, maxChars)}\n\n[Truncated to fit budget]`;
}

function getResumeMaxTokens(isInitialGeneration: boolean): number {
  const initialMax = parseIntEnv("RESUME_CHAT_MAX_TOKENS_INITIAL", 3500);
  const followupMax = parseIntEnv("RESUME_CHAT_MAX_TOKENS_FOLLOWUP", 1800);
  const cap = parseIntEnv("RESUME_CHAT_MAX_TOKENS_CAP", 6000);
  const selected = isInitialGeneration ? initialMax : followupMax;
  return Math.max(512, Math.min(selected, cap));
}

// Mem0 helper - search for user context
async function searchUserMemories(userId: string): Promise<string> {
  const MEM0_API_KEY = Deno.env.get("MEM0_API_KEY");
  if (!MEM0_API_KEY) return "";

  try {
    const response = await fetch("https://api.mem0.ai/v1/memories/search/", {
      method: "POST",
      headers: {
        "Authorization": `Token ${MEM0_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query: "resume career experience skills job preferences",
        user_id: userId,
        limit: 10,
      }),
    });

    if (!response.ok) return "";

    const data = await response.json();
    const memories = Array.isArray(data) 
      ? data.map((m: any) => m.memory || m.content).filter(Boolean)
      : data.results?.map((m: any) => m.memory || m.content).filter(Boolean) || [];

    if (memories.length > 0) {
      return `\n\n## User Context (from memory):\n${memories.map((m: string) => `- ${m}`).join("\n")}`;
    }
    return "";
  } catch {
    return "";
  }
}

// Mem0 helper - save resume context
async function saveResumeContext(userId: string, resumeData: any): Promise<void> {
  const MEM0_API_KEY = Deno.env.get("MEM0_API_KEY");
  if (!MEM0_API_KEY || !resumeData) return;

  try {
    const contextSummary = `Resume created for ${resumeData.personalInfo?.fullName || 'user'}. ` +
      `Target role: ${resumeData.targetRole || 'not specified'}. ` +
      `Experience: ${resumeData.totalYearsExperience || 0}+ years. ` +
      `Skills: ${resumeData.skillCategories?.map((c: any) => c.skills?.join(', ')).join('; ') || 'not provided'}.`;

    await fetch("https://api.mem0.ai/v1/memories/", {
      method: "POST",
      headers: {
        "Authorization": `Token ${MEM0_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messages: [{ role: "user", content: contextSummary }],
        user_id: userId,
        metadata: { type: "resume_context" },
      }),
    });
  } catch (e) {
    console.error("Memory save error:", e);
  }
}

const RESUME_SYSTEM_PROMPT = `You are an expert resume writer creating ATS-optimized resumes following this EXACT LaTeX-derived template structure.

## CRITICAL: Output Format Rules

You MUST generate content in this EXACT structure matching the professional LaTeX template:

---

# [Full Name]
**[Professional Title - e.g., Senior Data Scientist]**

📍 [Location] | ✉️ [Email] | 📞 [Phone] | 🔗 [LinkedIn]

## SUMMARY

**Option 1:**
[2-3 sentence professional summary. Include total years of experience, key domain expertise, and value proposition. Start with role + years, highlight key achievements, end with differentiator.]

**Option 2:**
[Alternative summary with different emphasis - perhaps more technical depth or different domain focus. Same length and structure.]

## EXPERIENCE

### [Role Title]
**[Company/Client Name]** | [Mon YYYY] -- [Mon YYYY/Present]
*[City, State]*

**Project Option 1:**
- [Achievement bullet 1: Start with action verb (Architected, Spearheaded, Implemented). Include metric/impact]
- [Achievement bullet 2: Quantify results (X%, $X saved, X users)]
- [Achievement bullet 3: Technical depth with specific tools/frameworks]
- [Achievement bullet 4: Business impact or collaboration]
- [Achievement bullet 5: Innovation or process improvement]
- [Achievement bullet 6: Leadership or mentoring]
- [Achievement bullet 7: Scale or complexity handled]

**Project Option 2:**
- [Alternative bullet 1: Different project or focus area with same impact format]
- [Alternative bullet 2: Different metrics and results]
- [Alternative bullet 3: Different technical stack highlighted]
- [Alternative bullet 4: Different business outcome]
- [Alternative bullet 5: Different scope or challenge]
- [Alternative bullet 6: Different collaboration angle]
- [Alternative bullet 7: Different scale or methodology]

[Repeat ### section for each role/client in reverse chronological order]

## EDUCATION

**[Degree Type] in [Field of Study]**, [University Name] (GPA: [X.XX]) | [Mon 'YY]
*[City, State]*

[Repeat for each degree, most recent first]

## CERTIFICATIONS

- **[Certification Name]**, [Issuing Organization] | [Mon 'YY]
- **[Certification Name]**, [Issuing Organization] | [Mon 'YY]

## SKILLS

**[Category 1 - e.g., Generative AI]:** [skill1], [skill2], [skill3], [skill4], [skill5]

**[Category 2 - e.g., Machine Learning]:** [skill1], [skill2], [skill3], [skill4]

**[Category 3 - e.g., Programming Languages]:** [skill1], [skill2], [skill3]

**[Category 4 - e.g., Cloud & MLOps]:** [skill1], [skill2], [skill3], [skill4]

[Continue for all relevant skill categories - typically 6-8 categories]

## PROJECTS

### [Project Name]
*[Organization/Context] — [Mon 'YY]*
- [Project bullet describing what was built/achieved with impact]
- [Project bullet with technical details and quantified results]

---

## Resume Writing Guidelines:

1. **Action Verbs**: Lead every bullet with powerful verbs: Architected, Spearheaded, Implemented, Optimized, Automated, Transformed, Pioneered, Orchestrated, Engineered
2. **Quantify Everything**: Every bullet should have metrics where possible (X%, $X saved, X users, X team members, X% improvement)
3. **ATS Keywords**: Use industry-specific technical terms matching the target role
4. **Concise Bullets**: Each bullet 1-2 lines maximum, punchy and impactful
5. **Impact Focus**: Show RESULTS and business value, not just responsibilities
6. **Technical Depth**: For tech roles, name specific technologies, frameworks, methodologies
7. **Calculate Experience**: Sum up all role durations to get total years for the summary

## When Refining:

- Keep the EXACT same format structure
- Only update the content within sections
- Maintain all section headers and formatting markers
- Apply user's feedback to improve specific sections
- Never change the template structure
- Generate fresh, non-repetitive content for each option

## Important:

- Generate exactly 7 strong bullets per project option for experience
- Always provide exactly 2 summary options
- Always provide exactly 2 project options per role
- Calculate total years from all experience dates and include in summary
- Make content highly specific to the target role provided
- Use the LaTeX template formatting conventions (bold, italic, dates on right)`;

// Model configuration for different providers
type ModelConfig = {
  provider: "lovable" | "openai" | "anthropic";
  model: string;
  apiUrl: string;
  apiKeyEnv: string;
};

const MODEL_CONFIGS: Record<string, ModelConfig> = {
  // Lovable AI Gateway models (Gemini)
  "gemini-flash": {
    provider: "lovable",
    model: "google/gemini-3-flash-preview",
    apiUrl: "https://ai.gateway.lovable.dev/v1/chat/completions",
    apiKeyEnv: "LOVABLE_API_KEY",
  },
  "gemini-pro": {
    provider: "lovable",
    model: "google/gemini-2.5-pro",
    apiUrl: "https://ai.gateway.lovable.dev/v1/chat/completions",
    apiKeyEnv: "LOVABLE_API_KEY",
  },
  // OpenAI models
  "gpt-5.2-chat-latest": {
    provider: "openai",
    model: "gpt-4o", // Map to available model
    apiUrl: "https://api.openai.com/v1/chat/completions",
    apiKeyEnv: "OPENAI_API_KEY",
  },
  "gpt-4o": {
    provider: "openai",
    model: "gpt-4o",
    apiUrl: "https://api.openai.com/v1/chat/completions",
    apiKeyEnv: "OPENAI_API_KEY",
  },
  "gpt-4o-mini-search-preview": {
    provider: "openai",
    model: "gpt-4o-mini",
    apiUrl: "https://api.openai.com/v1/chat/completions",
    apiKeyEnv: "OPENAI_API_KEY",
  },
  // Anthropic Claude models
  "claude-haiku-4": {
    provider: "anthropic",
    model: "claude-3-5-haiku-20241022",
    apiUrl: "https://api.anthropic.com/v1/messages",
    apiKeyEnv: "ANTHROPIC_API_KEY",
  },
  "claude-opus-4.5": {
    provider: "anthropic",
    model: "claude-sonnet-4-20250514",
    apiUrl: "https://api.anthropic.com/v1/messages",
    apiKeyEnv: "ANTHROPIC_API_KEY",
  },
  "claude-haiku-3": {
    provider: "anthropic",
    model: "claude-3-haiku-20240307",
    apiUrl: "https://api.anthropic.com/v1/messages",
    apiKeyEnv: "ANTHROPIC_API_KEY",
  },
};

async function callOpenAI(
  apiKey: string,
  model: string,
  messages: Array<{ role: string; content: string }>,
  maxTokens: number,
): Promise<Response> {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      messages,
      stream: true,
    }),
  });
  return response;
}

async function callAnthropic(
  apiKey: string,
  model: string,
  messages: Array<{ role: string; content: string }>,
  maxTokens: number,
): Promise<Response> {
  // Extract system message and convert messages for Anthropic format
  const systemMessage = messages.find((m) => m.role === "system")?.content || "";
  const anthropicMessages = messages
    .filter((m) => m.role !== "system")
    .map((m) => ({
      role: m.role === "assistant" ? "assistant" : "user",
      content: m.content,
    }));

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "Content-Type": "application/json",
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      system: systemMessage,
      messages: anthropicMessages,
      stream: true,
    }),
  });
  return response;
}

async function callLovableAI(
  apiKey: string,
  model: string,
  messages: Array<{ role: string; content: string }>,
  maxTokens: number,
): Promise<Response> {
  const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      messages,
      stream: true,
    }),
  });
  return response;
}

// Transform Anthropic SSE to OpenAI-compatible format
function transformAnthropicStream(response: Response): ReadableStream {
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();

  return new ReadableStream({
    async pull(controller) {
      const { done, value } = await reader.read();
      if (done) {
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
        return;
      }

      const text = decoder.decode(value);
      const lines = text.split("\n");

      for (const line of lines) {
        if (line.startsWith("data: ")) {
          const data = line.slice(6);
          if (data === "[DONE]") {
            controller.enqueue(encoder.encode("data: [DONE]\n\n"));
            continue;
          }

          try {
            const parsed = JSON.parse(data);
            
            // Handle different Anthropic event types
            if (parsed.type === "content_block_delta" && parsed.delta?.text) {
              const openAIFormat = {
                choices: [
                  {
                    delta: { content: parsed.delta.text },
                    index: 0,
                  },
                ],
              };
              controller.enqueue(encoder.encode(`data: ${JSON.stringify(openAIFormat)}\n\n`));
            } else if (parsed.type === "message_stop") {
              controller.enqueue(encoder.encode("data: [DONE]\n\n"));
            }
          } catch {
            // Skip invalid JSON
          }
        }
      }
    },
  });
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

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { messages, resumeData, currentResume, selectedModel } = await req.json();

    if (!messages || !Array.isArray(messages)) {
      return new Response(JSON.stringify({ error: "Messages are required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get model configuration (default to gpt-4o for best quality)
    const modelKey = selectedModel || "gpt-4o";
    const modelConfig = MODEL_CONFIGS[modelKey];
    
    if (!modelConfig) {
      console.log(`Unknown model ${modelKey}, falling back to gpt-4o`);
      // Fall back to gpt-4o
    }

    const config = modelConfig || MODEL_CONFIGS["gpt-4o"];
    const apiKey = Deno.env.get(config.apiKeyEnv);
    
    if (!apiKey) {
      console.error(`${config.apiKeyEnv} is not configured`);
      return new Response(JSON.stringify({ error: `API key not configured for ${config.provider}` }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const isInitialGeneration = !!resumeData && (!messages || messages.length === 0);
    const maxOutputTokens = getResumeMaxTokens(isInitialGeneration);

    // Fetch user memories in parallel with building context
    const userMemoryPromise = searchUserMemories(user.id);

    // Build context message if resumeData is provided (first generation)
    let contextMessage = "";
    if (resumeData) {
      const { personalInfo, clients, education, certifications, skillCategories, projects, targetRole, totalYearsExperience } = resumeData;
      
      const clientDetails = clients?.map((client: any, i: number) => `
${i + 1}. **${client.role || "Role"}** at **${client.name || "Company"}**
   - Industry: ${client.industry || "Not specified"}
   - Location: ${client.location || "Not specified"}
   - Duration: ${client.startDate || "Start"} - ${client.isCurrent ? "Present" : client.endDate || "End"}
   - Key Responsibilities: ${client.responsibilities || "General duties"}
`).join("") || "No experience provided";

      const educationDetails = education?.map((edu: any, i: number) => `
${i + 1}. **${edu.degree || "Degree"}** in **${edu.field || "Field"}**
   - School: ${edu.school || "Not specified"}
   - Location: ${edu.location || "Not specified"}
   - Graduation: ${edu.graduationDate || "Not specified"}
   - GPA: ${edu.gpa || "Not provided"}
`).join("") || "No education provided";

      const certDetails = certifications?.map((cert: any) => 
        `- **${cert.name || "Certification"}** from ${cert.issuer || "Issuer"} (${cert.date || "Date"})`
      ).join("\n") || "None";

      const skillDetails = skillCategories?.map((cat: any) => 
        `**${cat.category}**: ${cat.skills?.join(", ") || "None"}`
      ).join("\n") || "Not provided";

      const projectDetails = projects?.map((proj: any) => 
        `- **${proj.name}** (${proj.organization || "Personal"}, ${proj.date}): ${proj.bullets?.join("; ") || "No details"}`
      ).join("\n") || "None";

      contextMessage = `Generate a professional resume following the EXACT template format specified.

**Target Role**: ${targetRole || "Not specified"}
**Total Experience**: ${totalYearsExperience || 0}+ years

**Personal Information**:
- Full Name: ${personalInfo?.fullName || "Not provided"}
- Professional Title: ${personalInfo?.title || targetRole || "Professional"}
- Email: ${personalInfo?.email || "Not provided"}
- Phone: ${personalInfo?.phone || "Not provided"}
- Location: ${personalInfo?.location || "Not provided"}
- LinkedIn: ${personalInfo?.linkedin || "Not provided"}

**Work Experience**:
${clientDetails}

**Education**:
${educationDetails}

**Certifications**:
${certDetails}

**Skills**:
${skillDetails}

**Projects**:
${projectDetails}

**CRITICAL INSTRUCTIONS**:
1. Follow the EXACT output format from the system prompt
2. Generate 2 summary options
3. Generate 2 project options with 7 bullets each for EVERY role/client
4. Include total years (${totalYearsExperience || "calculate from dates"}) in summaries
5. Use strong action verbs and quantifiable metrics
6. Optimize for ATS with keywords relevant to: ${targetRole || "the role"}
7. Keep the exact markdown structure for parsing`;
      contextMessage = clampText(
        contextMessage,
        parseIntEnv("RESUME_CHAT_INITIAL_CONTEXT_MAX_CHARS", 18000),
      );
    }

    // If currentResume is provided, add it to context for refinement
    let resumeContext = "";
    if (currentResume) {
      resumeContext = `

**Current Resume State** (update only what user requests, keep same format):
${clampText(JSON.stringify(currentResume, null, 2), parseIntEnv("RESUME_CHAT_CURRENT_RESUME_MAX_CHARS", 12000))}

IMPORTANT: When refining, maintain the EXACT same template structure. Only update the content the user specifies.`;
    }

    // Get user memories and add to system prompt
    const userMemoryContext = await userMemoryPromise;
    console.log(`Calling ${config.provider} with model ${config.model}, memory context: ${userMemoryContext.length > 0}`);

    const allMessages = contextMessage 
      ? [{ role: "user", content: contextMessage + resumeContext }, ...messages]
      : messages.map((m: any, idx: number) => ({ 
          ...m, 
          content: m.content + (resumeContext && idx === messages.length - 1 ? resumeContext : "") 
        }));

    const systemPromptWithMemory = RESUME_SYSTEM_PROMPT + userMemoryContext;
    
    const fullMessages = [
      { role: "system", content: systemPromptWithMemory },
      ...allMessages,
    ];

    // Save resume context to memory in background (fire and forget)
    if (resumeData) {
      saveResumeContext(user.id, resumeData);
    }

    let response: Response;

    switch (config.provider) {
      case "openai":
        response = await callOpenAI(apiKey, config.model, fullMessages, maxOutputTokens);
        break;
      case "anthropic":
        response = await callAnthropic(apiKey, config.model, fullMessages, maxOutputTokens);
        break;
      case "lovable":
      default:
        response = await callLovableAI(apiKey, config.model, fullMessages, maxOutputTokens);
        break;
    }

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`${config.provider} API error:`, response.status, errorText);

      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded. Please try again later." }),
          {
            status: 429,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "AI usage limit reached. Please add credits." }),
          {
            status: 402,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      return new Response(JSON.stringify({ error: `${config.provider} API error` }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`Streaming response from ${config.provider}`);

    // Transform Anthropic stream to OpenAI format for consistent frontend handling
    const streamBody = config.provider === "anthropic" 
      ? transformAnthropicStream(response)
      : response.body;

    return new Response(streamBody, {
      headers: {
        ...corsHeaders,
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
      },
    });
  } catch (error) {
    console.error("Resume chat function error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
