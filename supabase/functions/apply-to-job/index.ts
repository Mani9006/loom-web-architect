// KAN-12: Apply to Job - Edge Function (Milestone 1.2)
// POST /functions/v1/apply-to-job
// One-click job application with validation and duplicate prevention

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// CORS headers for cross-origin requests
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// Input validation schema (Zod equivalent validation)
interface ApplyJobInput {
  job_id: string;
  job_title: string;
  company: string;
  job_board: string;
  application_url?: string;
  resume_id: string;
  cover_letter_id?: string;
  ats_score?: number;
}

interface ApplyJobResponse {
  success: boolean;
  application_id?: string;
  message: string;
}

// Validation helper for input data
function validateInput(body: unknown): {
  valid: boolean;
  data?: ApplyJobInput;
  error?: string;
} {
  if (!body || typeof body !== "object") {
    return { valid: false, error: "Request body must be a valid JSON object" };
  }

  const data = body as Record<string, unknown>;

  // Required fields validation
  if (!data.job_id || typeof data.job_id !== "string") {
    return { valid: false, error: "job_id is required and must be a string" };
  }

  if (!data.job_title || typeof data.job_title !== "string") {
    return {
      valid: false,
      error: "job_title is required and must be a string",
    };
  }

  if (!data.company || typeof data.company !== "string") {
    return { valid: false, error: "company is required and must be a string" };
  }

  if (!data.job_board || typeof data.job_board !== "string") {
    return {
      valid: false,
      error: "job_board is required and must be a string",
    };
  }

  if (!data.resume_id || typeof data.resume_id !== "string") {
    return {
      valid: false,
      error: "resume_id is required and must be a string (UUID)",
    };
  }

  // Optional fields type checking
  if (
    data.cover_letter_id !== undefined &&
    typeof data.cover_letter_id !== "string"
  ) {
    return {
      valid: false,
      error: "cover_letter_id must be a string (UUID) if provided",
    };
  }

  if (
    data.application_url !== undefined &&
    typeof data.application_url !== "string"
  ) {
    return {
      valid: false,
      error: "application_url must be a string if provided",
    };
  }

  if (data.ats_score !== undefined && typeof data.ats_score !== "number") {
    return {
      valid: false,
      error: "ats_score must be a number if provided",
    };
  }

  return {
    valid: true,
    data: {
      job_id: data.job_id,
      job_title: data.job_title,
      company: data.company,
      job_board: data.job_board,
      resume_id: data.resume_id,
      cover_letter_id: data.cover_letter_id as string | undefined,
      application_url: data.application_url as string | undefined,
      ats_score: data.ats_score as number | undefined,
    },
  };
}

// Extract and validate JWT token from Authorization header
function extractUserIdFromToken(authHeader: string | null): string | null {
  if (!authHeader) {
    return null;
  }

  try {
    // Extract Bearer token
    const token = authHeader.replace("Bearer ", "");

    // Decode JWT payload (base64)
    const parts = token.split(".");
    if (parts.length !== 3) {
      console.error("Invalid JWT format");
      return null;
    }

    // Decode payload (second part)
    const payload = parts[1];
    const decoded = JSON.parse(
      new TextDecoder().decode(
        Uint8Array.from(atob(payload), (c) => c.charCodeAt(0))
      )
    );

    // Extract user ID from 'sub' claim (standard JWT claim for subject)
    if (decoded.sub && typeof decoded.sub === "string") {
      return decoded.sub;
    }

    console.error("No 'sub' claim in JWT");
    return null;
  } catch (err) {
    console.error("JWT parsing error:", err);
    return null;
  }
}

// Main request handler
async function handleRequest(req: Request): Promise<Response> {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Only accept POST requests
  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({
        success: false,
        message: "Method not allowed. Use POST.",
      }),
      {
        status: 405,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }

  const startTime = Date.now();
  let userId: string | null = null;
  let validationError: string | null = null;
  let inputData: ApplyJobInput | null = null;

  try {
    // Step 1: Extract and validate user ID from JWT
    const authHeader = req.headers.get("Authorization");
    userId = extractUserIdFromToken(authHeader);

    if (!userId) {
      console.warn("Authorization failed: No valid user ID in token");
      return new Response(
        JSON.stringify({
          success: false,
          message: "Unauthorized: Invalid or missing authentication token",
        }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    console.log(`Processing application request for user: ${userId}`);

    // Step 2: Parse and validate request body
    const body = await req.json();
    const validation = validateInput(body);

    if (!validation.valid) {
      validationError = validation.error || "Invalid input";
      console.warn(`Validation failed: ${validationError}`);
      return new Response(
        JSON.stringify({
          success: false,
          message: validationError,
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    inputData = validation.data!;

    // Step 3: Initialize Supabase client
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");

    if (!supabaseUrl || !supabaseAnonKey) {
      console.error("Missing Supabase environment variables");
      return new Response(
        JSON.stringify({
          success: false,
          message: "Server configuration error",
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey);

    // Step 4: Verify user owns the resume document
    console.log(`Verifying resume ownership for resume_id: ${inputData.resume_id}`);
    const { data: resumeData, error: resumeError } = await supabase
      .from("user_documents")
      .select("id")
      .eq("id", inputData.resume_id)
      .eq("user_id", userId)
      .eq("category", "resume")
      .single();

    if (resumeError || !resumeData) {
      console.warn(
        `Resume not found or not owned by user: ${resumeError?.message || "not found"}`
      );
      return new Response(
        JSON.stringify({
          success: false,
          message: "Resume not found or access denied",
        }),
        {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Step 5: Verify user owns the cover letter document (if provided)
    if (inputData.cover_letter_id) {
      console.log(`Verifying cover letter ownership for cover_letter_id: ${inputData.cover_letter_id}`);
      const { data: coverLetterData, error: coverLetterError } = await supabase
        .from("user_documents")
        .select("id")
        .eq("id", inputData.cover_letter_id)
        .eq("user_id", userId)
        .eq("category", "cover_letter")
        .single();

      if (coverLetterError || !coverLetterData) {
        console.warn(
          `Cover letter not found or not owned by user: ${coverLetterError?.message || "not found"}`
        );
        return new Response(
          JSON.stringify({
            success: false,
            message: "Cover letter not found or access denied",
          }),
          {
            status: 404,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }
    }

    // Step 6: Check for duplicate application (prevent reapplying to same job)
    console.log(`Checking for duplicate application to ${inputData.job_board}/${inputData.job_id}`);
    const { data: existingApplication, error: existingError } = await supabase
      .from("applications")
      .select("id, status")
      .eq("user_id", userId)
      .eq("job_board", inputData.job_board)
      .eq("job_id", inputData.job_id)
      .single();

    if (existingApplication) {
      const existingStatus = existingApplication.status;
      console.warn(
        `Duplicate application detected: already applied with status "${existingStatus}"`
      );
      return new Response(
        JSON.stringify({
          success: false,
          message: `Already applied to this job with status: ${existingStatus}`,
        }),
        {
          status: 409,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Step 7: Create application record
    console.log(`Creating application record for job_id: ${inputData.job_id}`);
    const { data: newApplication, error: insertError } = await supabase
      .from("applications")
      .insert({
        user_id: userId,
        job_id: inputData.job_id,
        job_title: inputData.job_title,
        company: inputData.company,
        job_board: inputData.job_board,
        application_url: inputData.application_url || null,
        resume_id: inputData.resume_id,
        cover_letter_id: inputData.cover_letter_id || null,
        ats_score: inputData.ats_score || null,
        status: "pending",
      })
      .select("id")
      .single();

    if (insertError || !newApplication) {
      console.error(`Failed to create application: ${insertError?.message}`);
      return new Response(
        JSON.stringify({
          success: false,
          message: "Failed to create application record",
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const executionTime = Date.now() - startTime;
    console.log(
      `Application created successfully: ${newApplication.id} (${executionTime}ms)`
    );

    // Ensure execution time is within acceptable limits
    if (executionTime > 1000) {
      console.warn(`Execution time exceeded 1 second: ${executionTime}ms`);
    }

    return new Response(
      JSON.stringify({
        success: true,
        application_id: newApplication.id,
        message: `Application submitted for ${inputData.job_title} at ${inputData.company}`,
      }),
      {
        status: 201,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    const executionTime = Date.now() - startTime;
    console.error(`Unexpected error: ${error instanceof Error ? error.message : String(error)}`);

    return new Response(
      JSON.stringify({
        success: false,
        message: "Internal server error",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
}

// Serve the function
serve(handleRequest);
