import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Mammoth for parsing Word documents
import mammoth from "https://esm.sh/mammoth@1.6.0";

// Helper to extract text from PDF using basic parsing
function extractTextFromPDF(uint8Array: Uint8Array): string {
  const textDecoder = new TextDecoder('utf-8', { fatal: false });
  const pdfString = textDecoder.decode(uint8Array);
  
  const textParts: string[] = [];
  
  // Method 1: Look for text between parentheses
  const textMatches = pdfString.match(/\(([^)]+)\)/g);
  if (textMatches) {
    for (const match of textMatches) {
      const text = match.slice(1, -1);
      if (text.length > 0 && /^[\x20-\x7E\s]+$/.test(text)) {
        textParts.push(text);
      }
    }
  }
  
  // Method 2: Look for BT...ET text blocks
  const btBlocks = pdfString.match(/BT[\s\S]*?ET/g);
  if (btBlocks) {
    for (const block of btBlocks) {
      const tjMatches = block.match(/\(([^)]*)\)\s*Tj/g);
      if (tjMatches) {
        for (const tj of tjMatches) {
          const text = tj.match(/\(([^)]*)\)/)?.[1];
          if (text && text.length > 0 && /^[\x20-\x7E\s]+$/.test(text)) {
            textParts.push(text);
          }
        }
      }
      const tjArrayMatches = block.match(/\[(.*?)\]\s*TJ/g);
      if (tjArrayMatches) {
        for (const tja of tjArrayMatches) {
          const innerTexts = tja.match(/\(([^)]*)\)/g);
          if (innerTexts) {
            for (const inner of innerTexts) {
              const text = inner.slice(1, -1);
              if (text && text.length > 0 && /^[\x20-\x7E\s]+$/.test(text)) {
                textParts.push(text);
              }
            }
          }
        }
      }
    }
  }

  return textParts.join(" ");
}

// Use AI Vision to OCR scanned PDFs
async function ocrWithAIVision(pdfBase64: string, fileName: string): Promise<string> {
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  if (!LOVABLE_API_KEY) {
    throw new Error("AI service not configured for OCR");
  }

  console.log("Using AI Vision for OCR on:", fileName);

  const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [
        {
          role: "system",
          content: `You are an OCR specialist. Extract ALL text from the provided document image accurately.
Preserve the structure as much as possible including:
- Headers and section titles
- Bullet points and lists
- Contact information (email, phone, location)
- Job titles and company names
- Dates and time periods
- Skills and qualifications

Return ONLY the extracted text, formatted cleanly. Do not add any commentary or notes.`
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "Please extract all the text from this resume/document image:"
            },
            {
              type: "image_url",
              image_url: {
                url: `data:application/pdf;base64,${pdfBase64}`
              }
            }
          ]
        }
      ],
      max_tokens: 4096,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("AI Vision OCR error:", response.status, errorText);
    throw new Error("Failed to perform OCR on document");
  }

  const data = await response.json();
  const extractedText = data.choices?.[0]?.message?.content || "";
  
  console.log("OCR completed, extracted text length:", extractedText.length);
  return extractedText;
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

    const { filePath } = await req.json();

    if (!filePath) {
      return new Response(JSON.stringify({ error: "File path is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log("Downloading file from storage:", filePath);

    // Download file from storage
    const { data: fileData, error: downloadError } = await supabase.storage
      .from("documents")
      .download(filePath);

    if (downloadError || !fileData) {
      console.error("Download error:", downloadError);
      return new Response(JSON.stringify({ error: "Failed to download file" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const fileName = filePath.split("/").pop()?.toLowerCase() || "";
    let extractedText = "";

    console.log("Processing file:", fileName);

    if (fileName.endsWith(".pdf")) {
      try {
        const arrayBuffer = await fileData.arrayBuffer();
        const uint8Array = new Uint8Array(arrayBuffer);
        
        // Try to extract text using basic parsing first
        extractedText = extractTextFromPDF(uint8Array);
        
        console.log("Basic PDF text extraction length:", extractedText.length);

        // If we have very little text, it's likely a scanned PDF - use AI Vision OCR
        if (extractedText.length < 100) {
          console.log("PDF appears to be scanned/image-based, using AI Vision OCR...");
          
          // Convert to base64 for the AI vision model
          const base64 = btoa(
            uint8Array.reduce((data, byte) => data + String.fromCharCode(byte), '')
          );
          
          try {
            extractedText = await ocrWithAIVision(base64, fileName);
          } catch (ocrError) {
            console.error("OCR failed:", ocrError);
            return new Response(JSON.stringify({ 
              error: "Failed to OCR scanned document. Please try pasting your resume content directly." 
            }), {
              status: 400,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }
        }

        console.log("PDF processed successfully, final text length:", extractedText.length);
      } catch (pdfError) {
        console.error("PDF parsing error:", pdfError);
        return new Response(JSON.stringify({ 
          error: "Failed to parse PDF. Please try pasting your resume content directly or use a Word document." 
        }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    } else if (fileName.endsWith(".docx")) {
      try {
        const arrayBuffer = await fileData.arrayBuffer();
        const result = await mammoth.extractRawText({ arrayBuffer });
        extractedText = result.value;
        console.log("Word document parsed successfully, text length:", extractedText.length);
      } catch (docError) {
        console.error("Word parsing error:", docError);
        return new Response(JSON.stringify({ error: "Failed to parse Word document" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    } else if (fileName.endsWith(".doc")) {
      return new Response(JSON.stringify({ 
        error: "Legacy .doc format is not supported. Please save as .docx or paste your resume content directly." 
      }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    } else if (fileName.endsWith(".txt") || fileName.endsWith(".md")) {
      extractedText = await fileData.text();
      console.log("Text file read successfully, length:", extractedText.length);
    } else if (fileName.endsWith(".png") || fileName.endsWith(".jpg") || fileName.endsWith(".jpeg") || fileName.endsWith(".webp")) {
      // Handle image files directly with OCR
      try {
        const arrayBuffer = await fileData.arrayBuffer();
        const uint8Array = new Uint8Array(arrayBuffer);
        const base64 = btoa(
          uint8Array.reduce((data, byte) => data + String.fromCharCode(byte), '')
        );
        
        const mimeType = fileName.endsWith(".png") ? "image/png" : 
                        fileName.endsWith(".webp") ? "image/webp" : "image/jpeg";
        
        console.log("Processing image file with OCR:", fileName);
        
        const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
        if (!LOVABLE_API_KEY) {
          throw new Error("AI service not configured for OCR");
        }

        const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${LOVABLE_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "google/gemini-2.5-flash",
            messages: [
              {
                role: "system",
                content: `You are an OCR specialist. Extract ALL text from the provided document image accurately. Return ONLY the extracted text, formatted cleanly.`
              },
              {
                role: "user",
                content: [
                  { type: "text", text: "Please extract all the text from this document image:" },
                  { type: "image_url", image_url: { url: `data:${mimeType};base64,${base64}` } }
                ]
              }
            ],
            max_tokens: 4096,
          }),
        });

        if (!response.ok) {
          throw new Error("Failed to perform OCR on image");
        }

        const data = await response.json();
        extractedText = data.choices?.[0]?.message?.content || "";
        console.log("Image OCR completed, text length:", extractedText.length);
      } catch (imgError) {
        console.error("Image OCR error:", imgError);
        return new Response(JSON.stringify({ error: "Failed to extract text from image" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    } else {
      return new Response(JSON.stringify({ error: "Unsupported file type. Please upload PDF, DOCX, TXT, MD, or image files (PNG, JPG)." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Clean up the extracted text
    extractedText = extractedText
      .replace(/\s+/g, " ")
      .replace(/\n\s*\n/g, "\n\n")
      .trim();

    if (!extractedText || extractedText.length < 20) {
      return new Response(JSON.stringify({ 
        error: "Could not extract enough text from the document. Please paste your resume content directly." 
      }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ 
      text: extractedText,
      fileName: fileName,
      charCount: extractedText.length,
      usedOCR: extractedText.length > 100 && fileName.endsWith(".pdf")
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("Parse document error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
