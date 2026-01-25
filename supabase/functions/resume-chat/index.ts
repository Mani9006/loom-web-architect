import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const RESUME_SYSTEM_PROMPT = `You are an expert resume writer and career coach. Your job is to help create compelling, ATS-friendly resumes that highlight achievements and impact.

## Your Core Responsibilities:
1. **Generate Resume Content**: When given user information, create a complete professional resume with compelling bullet points
2. **Generate Multiple Options**: For each experience/client, generate 2 different project descriptions so users can choose
3. **Generate Summary Options**: Create 2 different summary options based on combined experience
4. **Calculate Experience**: Based on dates provided, calculate total years of experience
5. **Refine & Improve**: Help users refine specific sections based on their feedback
6. **Rewrite Sections**: Rewrite any section when asked

## Resume Writing Guidelines:
- Use strong action verbs (Led, Developed, Implemented, Achieved, Spearheaded, Architected)
- Quantify achievements whenever possible (increased by X%, saved $X, managed team of X)
- Focus on impact and results, not just responsibilities
- Keep bullet points concise (1-2 lines each)
- Tailor content to the target role when specified
- Use industry-relevant keywords for ATS optimization
- For tech roles: mention specific technologies, frameworks, and methodologies

## Output Format for Initial Generation:

When generating a full resume, structure it as:

# [Full Name]
[Contact Information]

## Professional Summary
**Option 1:**
[2-3 sentence impactful summary including total years of experience]

**Option 2:**
[Alternative 2-3 sentence summary with different focus]

## Experience

### [Role] | [Client/Company Name]
*[Start Date] - [End Date]* | [Location]

**Project Option 1: [Project Title]**
- [Achievement-focused bullet with metrics]
- [Achievement-focused bullet with metrics]
- [Achievement-focused bullet with metrics]
- [Achievement-focused bullet with metrics]

**Project Option 2: [Alternative Project Title]**
- [Alternative achievement-focused bullet]
- [Alternative achievement-focused bullet]
- [Alternative achievement-focused bullet]
- [Alternative achievement-focused bullet]

[Repeat for each client/position]

## Education
### [Degree] in [Field]
**[School Name]** | [Graduation Date]

## Certifications
- [Certification Name] - [Issuer] | [Date]

## Skills
**[Category]**: [skill1], [skill2], [skill3]
**[Category]**: [skill1], [skill2], [skill3]

---

## When Refining:
- Focus on the specific section the user asks about
- Provide clear, actionable improvements
- Maintain consistency with the rest of the resume
- Keep the same format and structure

## When Rewriting:
- Completely rewrite the section with fresh perspectives
- Use different action verbs and metrics
- Maintain professional tone
- Ensure ATS compatibility

Be conversational and helpful. Explain your choices when asked.`;

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

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);
    
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { messages, resumeData, currentResume } = await req.json();

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
      const { personalInfo, clients, education, certifications, skillCategories, targetRole, totalYearsExperience, templateId } = resumeData;
      
      const clientDetails = clients?.map((client: any, i: number) => `
${i + 1}. **${client.role || "Role"}** at **${client.name || "Company"}**
   - Industry: ${client.industry || "Not specified"}
   - Location: ${client.location || "Not specified"}
   - Duration: ${client.startDate || "Start"} - ${client.isCurrent ? "Present" : client.endDate || "End"}
   - Responsibilities: ${client.responsibilities || "General duties"}
`).join("") || "No experience provided";

      const educationDetails = education?.map((edu: any, i: number) => `
${i + 1}. **${edu.degree || "Degree"}** in **${edu.field || "Field"}**
   - School: ${edu.school || "Not specified"}
   - Graduation: ${edu.graduationDate || "Not specified"}
   - GPA: ${edu.gpa || "Not provided"}
`).join("") || "No education provided";

      const certDetails = certifications?.map((cert: any) => 
        `- ${cert.name || "Certification"} from ${cert.issuer || "Issuer"} (${cert.date || "Date"})`
      ).join("\n") || "None";

      const skillDetails = skillCategories?.map((cat: any) => 
        `**${cat.category}**: ${cat.skills?.join(", ") || "None"}`
      ).join("\n") || "Not provided";

      contextMessage = `Please generate a complete, professional resume for:

**Template**: ${templateId === "creative" ? "Creative (projects-focused)" : "Professional (summary + certifications)"}
**Target Role**: ${targetRole || "Not specified"}
**Total Experience**: ${totalYearsExperience || 0}+ years (calculated from dates)

**Personal Information**:
- Name: ${personalInfo?.fullName || "Not provided"}
- Email: ${personalInfo?.email || "Not provided"}
- Phone: ${personalInfo?.phone || "Not provided"}
- Location: ${personalInfo?.location || "Not provided"}
- LinkedIn: ${personalInfo?.linkedin || "Not provided"}
- Portfolio: ${personalInfo?.portfolio || "Not provided"}

**Clients/Work Experience**:
${clientDetails}

**Education**:
${educationDetails}

**Certifications**:
${certDetails}

**Skills**:
${skillDetails}

**IMPORTANT INSTRUCTIONS**:
1. Calculate total years of experience from the dates and include it in the summary
2. Generate 2 DIFFERENT project/bullet point options for EACH client/role
3. Generate 2 DIFFERENT summary options combining all experience
4. Use metrics and quantifiable achievements where possible
5. Tailor everything for the target role: ${targetRole || "general professional roles"}
6. Make it ATS-friendly with relevant keywords
7. For each project option, create distinct scenarios that could apply to this role/industry

Generate the complete resume now with all options.`;
    }

    // If currentResume is provided, add it to context for refinement
    let resumeContext = "";
    if (currentResume) {
      resumeContext = `\n\n**Current Resume Data**:\n${JSON.stringify(currentResume, null, 2)}\n\nPlease use this context when making refinements or rewrites.`;
    }

    console.log("Calling Lovable AI Gateway for resume generation");

    const allMessages = contextMessage 
      ? [{ role: "user", content: contextMessage + resumeContext }, ...messages]
      : messages.map((m: any) => ({ ...m, content: m.content + (resumeContext && m === messages[messages.length - 1] ? resumeContext : "") }));

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
