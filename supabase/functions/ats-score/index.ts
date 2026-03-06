// ATS Score V2 - Deep structured scoring with section breakdown
// Returns structured JSON scores instead of freeform chat text

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ATSScoreResult {
  overallScore: number;
  sections: {
    formatting: { score: number; issues: string[]; tips: string[] };
    keywords: { score: number; matched: string[]; missing: string[]; tips: string[] };
    experience: { score: number; issues: string[]; tips: string[] };
    skills: { score: number; matched: string[]; missing: string[]; tips: string[] };
    education: { score: number; issues: string[]; tips: string[] };
    impact: { score: number; issues: string[]; tips: string[] };
  };
  summary: string;
  topImprovements: string[];
}

const SCORING_PROMPT = `You are an advanced ATS (Applicant Tracking System) analyzer. Perform a deep, structured analysis of the resume against the job description (if provided).

## Scoring Criteria

### 1. Formatting (20% weight)
- Clean section headers (Education, Experience, Skills, etc.)
- No tables, images, columns, or fancy formatting that ATS can't parse
- Standard fonts and bullet points
- Consistent date formats
- Proper contact info at top
- No headers/footers (ATS often ignores these)
- File parsability (plain text extraction quality)

### 2. Keywords (25% weight)
- Match hard skills from job description
- Match soft skills mentioned
- Industry-specific terminology
- Tools, technologies, certifications mentioned in JD
- Action verbs alignment
- Score based on % of JD keywords found in resume

### 3. Experience Relevance (20% weight)
- Years of experience match
- Role progression/seniority alignment
- Industry relevance
- Recency of relevant experience
- Gap analysis

### 4. Skills Match (15% weight)
- Technical skills coverage
- Certification/qualification match
- Tools and platform proficiency
- Language/framework alignment

### 5. Education (10% weight)
- Degree level match
- Field of study relevance
- Certifications and continuing education
- Relevant coursework

### 6. Impact & Achievements (10% weight)
- Quantified results (numbers, percentages, dollar amounts)
- Action verbs usage (Led, Developed, Increased, etc.)
- STAR method indicators
- Relevant project descriptions

## IMPORTANT INSTRUCTIONS
You MUST respond with ONLY a valid JSON object matching this exact schema. No markdown, no code fences, no explanation outside the JSON:

{
  "overallScore": <number 0-100>,
  "sections": {
    "formatting": {
      "score": <number 0-100>,
      "issues": ["issue1", "issue2"],
      "tips": ["tip1", "tip2"]
    },
    "keywords": {
      "score": <number 0-100>,
      "matched": ["keyword1", "keyword2"],
      "missing": ["keyword3", "keyword4"],
      "tips": ["tip1"]
    },
    "experience": {
      "score": <number 0-100>,
      "issues": ["issue1"],
      "tips": ["tip1"]
    },
    "skills": {
      "score": <number 0-100>,
      "matched": ["skill1", "skill2"],
      "missing": ["skill3"],
      "tips": ["tip1"]
    },
    "education": {
      "score": <number 0-100>,
      "issues": ["issue1"],
      "tips": ["tip1"]
    },
    "impact": {
      "score": <number 0-100>,
      "issues": ["issue1"],
      "tips": ["tip1"]
    }
  },
  "summary": "2-3 sentence overall assessment",
  "topImprovements": ["top improvement 1", "top improvement 2", "top improvement 3"]
}

The overallScore should be a weighted average:
formatting * 0.20 + keywords * 0.25 + experience * 0.20 + skills * 0.15 + education * 0.10 + impact * 0.10

Be honest and critical. Real ATS systems are strict. A perfect resume for a matching job might score 85-95. An average resume scores 50-70. A poor match scores below 50.`;

serve(async (req: Request) => {
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

    const { resumeText, jobDescription } = await req.json();

    if (!resumeText || resumeText.trim().length < 50) {
      return new Response(
        JSON.stringify({ error: "Resume text is required (minimum 50 characters)" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
    if (!OPENAI_API_KEY) {
      return new Response(JSON.stringify({ error: "AI service not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Build the user message
    let userMessage = `## Resume\n${resumeText.substring(0, 8000)}`;
    if (jobDescription?.trim()) {
      userMessage += `\n\n## Job Description\n${jobDescription.substring(0, 4000)}`;
    } else {
      userMessage += `\n\n## Note\nNo job description provided. Score the resume on general ATS best practices and formatting. For keywords/skills sections, evaluate based on how well the resume presents its own stated skills and experience.`;
    }

    console.log(`[ATS-Score] Analyzing resume (${resumeText.length} chars), JD: ${jobDescription ? "yes" : "no"}`);

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o",
        messages: [
          { role: "system", content: SCORING_PROMPT },
          { role: "user", content: userMessage },
        ],
        temperature: 0.3,
        max_tokens: 2000,
        response_format: { type: "json_object" },
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("OpenAI error:", response.status, errText);
      return new Response(JSON.stringify({ error: "Scoring failed" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;

    if (!content) {
      return new Response(JSON.stringify({ error: "Empty response from AI" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Parse the structured JSON
    let scoreResult: ATSScoreResult;
    try {
      scoreResult = JSON.parse(content);
    } catch {
      console.error("Failed to parse ATS score JSON:", content.substring(0, 200));
      return new Response(JSON.stringify({ error: "Failed to parse scoring result" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Validate and clamp scores
    const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));
    if (scoreResult.sections) {
      for (const key of Object.keys(scoreResult.sections) as Array<keyof typeof scoreResult.sections>) {
        if (scoreResult.sections[key]) {
          scoreResult.sections[key].score = clamp(scoreResult.sections[key].score);
        }
      }
    }
    scoreResult.overallScore = clamp(scoreResult.overallScore);

    console.log(`[ATS-Score] Result: ${scoreResult.overallScore}/100`);

    return new Response(JSON.stringify(scoreResult), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("ATS score error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
