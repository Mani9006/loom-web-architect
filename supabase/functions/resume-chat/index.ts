import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const RESUME_SYSTEM_PROMPT = `You are an expert resume writer and career coach. Your job is to help create compelling, ATS-friendly resumes that highlight achievements and impact.

## Your Core Responsibilities:
1. **Generate Resume Content**: When given user information, create a complete professional resume with compelling bullet points
2. **Refine & Improve**: Help users refine specific sections based on their feedback
3. **Provide Expert Advice**: Offer suggestions to improve impact and relevance

## Resume Writing Guidelines:
- Use strong action verbs (Led, Developed, Implemented, Achieved, Spearheaded)
- Quantify achievements whenever possible (increased by X%, saved $X, managed team of X)
- Focus on impact and results, not just responsibilities
- Keep bullet points concise (1-2 lines each)
- Tailor content to the target role when specified
- Use industry-relevant keywords for ATS optimization

## Output Format:
When generating a full resume, structure it as:

# [Full Name]
[Contact Information Line]

## Professional Summary
[2-3 sentence impactful summary]

## Experience

### [Job Title] | [Company Name]
*[Start Date] - [End Date]*
- [Achievement-focused bullet point with metrics]
- [Achievement-focused bullet point with metrics]
- [Achievement-focused bullet point with metrics]
- [Achievement-focused bullet point with metrics]

[Repeat for each position]

## Education

### [Degree] in [Field]
**[School Name]** | [Graduation Date]

## Skills
[Comma-separated skills grouped by category]

---

When refining, focus on the specific section the user asks about and provide clear, actionable improvements.

Be conversational and helpful. Explain your choices when asked.`;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Verify auth
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

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);
    
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { messages, resumeData } = await req.json();

    if (!messages || !Array.isArray(messages)) {
      return new Response(JSON.stringify({ error: "Messages are required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      console.error("LOVABLE_API_KEY is not configured");
      return new Response(JSON.stringify({ error: "AI service not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Build context message if resumeData is provided (first generation)
    let contextMessage = "";
    if (resumeData) {
      const { personalInfo, experience, education, skills, targetRole } = resumeData;
      
      contextMessage = `Please generate a complete, professional resume for:

**Target Role**: ${targetRole || "Not specified"}

**Personal Information**:
- Name: ${personalInfo.fullName}
- Email: ${personalInfo.email}
- Phone: ${personalInfo.phone || "Not provided"}
- Location: ${personalInfo.location || "Not provided"}
- LinkedIn: ${personalInfo.linkedin || "Not provided"}
- Portfolio: ${personalInfo.portfolio || "Not provided"}

**Work Experience**:
${experience.map((exp: any, i: number) => `
${i + 1}. **${exp.title}** at **${exp.company}**
   - Duration: ${exp.startDate || "Not specified"} - ${exp.endDate || "Present"}
`).join("")}

**Education**:
${education.map((edu: any, i: number) => `
${i + 1}. **${edu.degree || "Degree"}** in **${edu.field || "Field"}**
   - School: ${edu.school || "Not specified"}
   - Graduated: ${edu.graduationDate || "Not specified"}
`).join("")}

**Skills**: ${skills.length > 0 ? skills.join(", ") : "Not provided"}

Please create compelling bullet points for each work experience position (4-5 bullets each) that:
1. Highlight achievements with quantifiable metrics
2. Use strong action verbs
3. Are tailored to the target role: ${targetRole || "general professional roles"}
4. Are ATS-friendly with relevant keywords

Generate the complete resume now.`;
    }

    console.log("Calling Lovable AI Gateway for resume generation");

    const allMessages = contextMessage 
      ? [{ role: "user", content: contextMessage }, ...messages]
      : messages;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: RESUME_SYSTEM_PROMPT },
          ...allMessages,
        ],
        stream: true,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("AI gateway error:", response.status, errorText);

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

      return new Response(JSON.stringify({ error: "AI service error" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log("Streaming resume response from AI gateway");

    return new Response(response.body, {
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
