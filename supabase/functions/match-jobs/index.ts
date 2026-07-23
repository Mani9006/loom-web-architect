// Match Jobs - AI-powered job matching engine
// Computes match scores between user profile and available jobs

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Constant-time string comparison so the service-key check doesn't leak via timing.
function timingSafeEqual(a: string, b: string): boolean {
  const bufA = new TextEncoder().encode(a);
  const bufB = new TextEncoder().encode(b);
  if (bufA.length !== bufB.length) return false;
  let diff = 0;
  for (let i = 0; i < bufA.length; i++) diff |= bufA[i] ^ bufB[i];
  return diff === 0;
}

interface UserProfile {
  user_id: string;
  desired_roles: string[];
  target_role: string | null;
  seniority_level: string | null;
  skills: string[];
  preferred_work_type: string[];
  desired_locations: string[];
  salary_expectations: { min?: number; max?: number } | null;
  blacklisted_companies: string[];
  years_of_experience: number | null;
}

interface Job {
  id: string;
  title: string;
  company: string;
  location: string | null;
  description: string | null;
  salary_min: number | null;
  salary_max: number | null;
  job_type: string | null;
  remote: boolean;
  date_posted: string | null;
}

interface MatchResult {
  job_id: string;
  match_score: number;
  match_reasons: {
    title_match: number;
    skills_match: number;
    location_match: number;
    seniority_match: number;
    salary_match: number;
    details: string[];
  };
}

function computeMatchScore(profile: UserProfile, job: Job): MatchResult {
  let titleScore = 0;
  let skillsScore = 0;
  let locationScore = 0;
  let seniorityScore = 0;
  let salaryScore = 0;
  const details: string[] = [];

  // Check blacklist
  if (profile.blacklisted_companies.some(
    (c) => job.company.toLowerCase().includes(c.toLowerCase())
  )) {
    return {
      job_id: job.id,
      match_score: 0,
      match_reasons: { title_match: 0, skills_match: 0, location_match: 0, seniority_match: 0, salary_match: 0, details: ["Blacklisted company"] },
    };
  }

  // Title match (30 points)
  const allRoles = [...profile.desired_roles];
  if (profile.target_role && !allRoles.includes(profile.target_role)) {
    allRoles.push(profile.target_role);
  }

  const jobTitleLower = job.title.toLowerCase();
  for (const role of allRoles) {
    const roleLower = role.toLowerCase();
    const roleWords = roleLower.split(/\s+/);

    // Exact match
    if (jobTitleLower.includes(roleLower)) {
      titleScore = 30;
      details.push(`Title matches: ${role}`);
      break;
    }

    // Partial match (check each word)
    const matchedWords = roleWords.filter((w) => jobTitleLower.includes(w));
    const wordScore = (matchedWords.length / roleWords.length) * 30;
    if (wordScore > titleScore) {
      titleScore = Math.round(wordScore);
      if (titleScore >= 15) {
        details.push(`Partial title match: ${matchedWords.join(", ")}`);
      }
    }
  }

  // Skills match (25 points)
  if (profile.skills.length > 0 && job.description) {
    const descLower = job.description.toLowerCase();
    const matchedSkills = profile.skills.filter((skill) =>
      descLower.includes(skill.toLowerCase())
    );
    const skillsDenominator = Math.min(profile.skills.length, 10);
    skillsScore = Math.round((Math.min(matchedSkills.length, skillsDenominator) / skillsDenominator) * 25);
    if (matchedSkills.length > 0) {
      details.push(`Skills match: ${matchedSkills.slice(0, 5).join(", ")}`);
    }
  }

  // Location match (15 points)
  if (job.remote && profile.preferred_work_type.includes("Remote")) {
    locationScore = 15;
    details.push("Remote work match");
  } else if (job.location && profile.desired_locations.length > 0) {
    const jobLocLower = (job.location || "").toLowerCase();
    const matched = profile.desired_locations.some((loc) =>
      jobLocLower.includes(loc.toLowerCase()) || loc.toLowerCase().includes("remote")
    );
    if (matched) {
      locationScore = 15;
      details.push("Location match");
    }
  } else if (profile.desired_locations.length === 0) {
    locationScore = 10; // No preference = partial match
  }

  // Seniority match (15 points)
  if (profile.seniority_level && job.title) {
    const seniorityMap: Record<string, string[]> = {
      "Entry Level": ["junior", "entry", "intern", "associate", "jr"],
      "Mid Level": ["mid", "intermediate"],
      "Senior": ["senior", "sr"],
      "Lead": ["lead", "principal", "staff"],
      "Staff": ["staff", "principal"],
      "Principal": ["principal", "distinguished"],
      "Executive": ["director", "vp", "cto", "cio", "chief", "head"],
    };

    const keywords = seniorityMap[profile.seniority_level] || [];
    const titleWords = jobTitleLower.split(/\s+/);

    if (keywords.some((k) => titleWords.some((w) => w.includes(k)))) {
      seniorityScore = 15;
      details.push(`Seniority level match: ${profile.seniority_level}`);
    } else {
      // No explicit mismatch = partial score
      seniorityScore = 8;
    }
  } else {
    seniorityScore = 8; // No seniority preference
  }

  // Salary match (15 points)
  const salaryMin = profile.salary_expectations?.min;
  const salaryMax = profile.salary_expectations?.max;
  if (salaryMin || salaryMax) {
    if (job.salary_min || job.salary_max) {
      const jobMin = job.salary_min || 0;
      const jobMax = job.salary_max || 999999;
      const userMin = salaryMin || 0;
      const userMax = salaryMax || 999999;

      // Check overlap
      if (jobMax >= userMin && jobMin <= userMax) {
        salaryScore = 15;
        details.push("Salary range overlap");
      } else if (jobMax >= userMin * 0.8) {
        salaryScore = 8;
        details.push("Salary close to range");
      }
    } else {
      salaryScore = 8; // Unknown salary = partial match
    }
  } else {
    salaryScore = 10; // No salary preference
  }

  const totalScore = Math.min(titleScore + skillsScore + locationScore + seniorityScore + salaryScore, 100);

  return {
    job_id: job.id,
    match_score: totalScore,
    match_reasons: {
      title_match: titleScore,
      skills_match: skillsScore,
      location_match: locationScore,
      seniority_match: seniorityScore,
      salary_match: salaryScore,
      details,
    },
  };
}

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

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // This function has verify_jwt=false at the platform level, so it must
    // verify the caller itself. A Bearer token that is merely *present* is not
    // proof of identity: previously any caller could pass any user_id and read
    // that user's full profile through the service-role client below (IDOR).
    //
    // Two caller classes are accepted:
    //   1. End users — their JWT is verified via auth.getUser() and they may
    //      only compute matches for their own user_id.
    //   2. Internal backend callers presenting the service-role key, which may
    //      compute matches for any user_id.
    const token = authHeader.slice("Bearer ".length).trim();
    const isServiceCaller = timingSafeEqual(token, serviceKey);

    let verifiedUserId: string | null = null;
    if (!isServiceCaller) {
      const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
      const userClient = createClient(supabaseUrl, anonKey, {
        global: { headers: { Authorization: authHeader } },
        auth: { persistSession: false },
      });
      const { data: { user }, error: authError } = await userClient.auth.getUser();
      if (authError || !user) {
        console.warn(`Match jobs auth failed: ${authError?.message || "no user"}`);
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      verifiedUserId = user.id;
    }

    const supabase = createClient(supabaseUrl, serviceKey);

    const body = await req.json().catch(() => ({}));
    const userId = body.user_id;
    const limit = body.limit || 100;
    const minScore = body.min_score || 20;

    if (!userId) {
      return new Response(JSON.stringify({ error: "user_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!isServiceCaller && verifiedUserId !== userId) {
      return new Response(
        JSON.stringify({ error: "Forbidden: cannot compute matches for another user" }),
        {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Get user profile
    const { data: profileData, error: profileError } = await supabase
      .from("profiles")
      .select("*")
      .eq("user_id", userId)
      .single();

    if (profileError || !profileData) {
      return new Response(JSON.stringify({ error: "Profile not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const profile: UserProfile = {
      user_id: userId,
      desired_roles: profileData.desired_roles || [],
      target_role: profileData.target_role,
      seniority_level: profileData.seniority_level,
      skills: profileData.skills || [],
      preferred_work_type: profileData.preferred_work_type || [],
      desired_locations: profileData.desired_locations || [],
      salary_expectations: profileData.salary_expectations,
      blacklisted_companies: profileData.blacklisted_companies || [],
      years_of_experience: profileData.years_of_experience,
    };

    // Get recent jobs (last 7 days)
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { data: jobs, error: jobsError } = await supabase
      .from("jobs")
      .select("id, title, company, location, description, salary_min, salary_max, job_type, remote, date_posted")
      .gte("date_posted", weekAgo)
      .order("date_posted", { ascending: false })
      .limit(500);

    if (jobsError) {
      return new Response(JSON.stringify({ error: "Failed to fetch jobs" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`[MatchJobs] Processing ${jobs?.length || 0} jobs for user ${userId}`);

    // Compute match scores
    const matches: MatchResult[] = [];
    for (const job of (jobs || [])) {
      const match = computeMatchScore(profile, job as Job);
      if (match.match_score >= minScore) {
        matches.push(match);
      }
    }

    // Sort by score descending
    matches.sort((a, b) => b.match_score - a.match_score);
    const topMatches = matches.slice(0, limit);

    // Upsert matches into job_matches table
    if (topMatches.length > 0) {
      const matchRows = topMatches.map((m) => ({
        user_id: userId,
        job_id: m.job_id,
        match_score: m.match_score,
        match_reasons: m.match_reasons,
        updated_at: new Date().toISOString(),
      }));

      const { error: upsertError } = await supabase
        .from("job_matches")
        .upsert(matchRows, { onConflict: "user_id,job_id" });

      if (upsertError) {
        console.error("[MatchJobs] Upsert error:", upsertError.message);
      }
    }

    console.log(`[MatchJobs] Found ${topMatches.length} matches (min score: ${minScore})`);

    return new Response(
      JSON.stringify({
        matches: topMatches,
        total: topMatches.length,
        profile_completeness: profileData.profile_completeness || 0,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Match jobs error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
