import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Mammoth for parsing Word documents
import mammoth from "https://esm.sh/mammoth@1.6.0";

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
      // Parse PDF using a simple text extraction approach
      try {
        const arrayBuffer = await fileData.arrayBuffer();
        const uint8Array = new Uint8Array(arrayBuffer);
        
        // Convert to string and try to extract readable text
        // This is a simplified approach - extracts text between stream markers
        const textDecoder = new TextDecoder('utf-8', { fatal: false });
        const pdfString = textDecoder.decode(uint8Array);
        
        // Extract text content from PDF streams
        const textParts: string[] = [];
        
        // Method 1: Look for text between parentheses (common PDF text encoding)
        const textMatches = pdfString.match(/\(([^)]+)\)/g);
        if (textMatches) {
          for (const match of textMatches) {
            const text = match.slice(1, -1);
            // Filter out non-printable or encoded content
            if (text.length > 0 && /^[\x20-\x7E\s]+$/.test(text)) {
              textParts.push(text);
            }
          }
        }
        
        // Method 2: Look for BT...ET text blocks with Tj/TJ operators
        const btBlocks = pdfString.match(/BT[\s\S]*?ET/g);
        if (btBlocks) {
          for (const block of btBlocks) {
            // Extract text from Tj operators
            const tjMatches = block.match(/\(([^)]*)\)\s*Tj/g);
            if (tjMatches) {
              for (const tj of tjMatches) {
                const text = tj.match(/\(([^)]*)\)/)?.[1];
                if (text && text.length > 0 && /^[\x20-\x7E\s]+$/.test(text)) {
                  textParts.push(text);
                }
              }
            }
            // Extract text from TJ arrays
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

        if (textParts.length > 0) {
          extractedText = textParts.join(" ");
        } else {
          // Fallback: try to find any readable ASCII text
          const readableText = pdfString
            .replace(/[^\x20-\x7E\n\r\t]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
          
          // Extract likely content sections (longer sequences of readable text)
          const sentences = readableText.split(/\s{2,}/).filter(s => s.length > 10);
          extractedText = sentences.join(" ");
        }

        // If we still have very little text, it might be a scanned PDF
        if (extractedText.length < 100) {
          console.log("PDF appears to have minimal extractable text (may be scanned/image-based)");
          return new Response(JSON.stringify({ 
            error: "This PDF appears to be scanned or image-based. Please use a text-based PDF or paste your resume content directly." 
          }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        console.log("PDF parsed successfully, text length:", extractedText.length);
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
      // Parse Word document (.docx)
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
      // .doc files are binary and harder to parse without native libraries
      return new Response(JSON.stringify({ 
        error: "Legacy .doc format is not supported. Please save as .docx or paste your resume content directly." 
      }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    } else if (fileName.endsWith(".txt") || fileName.endsWith(".md")) {
      // Plain text files
      extractedText = await fileData.text();
      console.log("Text file read successfully, length:", extractedText.length);
    } else {
      return new Response(JSON.stringify({ error: "Unsupported file type. Please upload PDF, DOCX, TXT, or MD files." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Clean up the extracted text
    extractedText = extractedText
      .replace(/\s+/g, " ")
      .replace(/\n\s*\n/g, "\n\n")
      .trim();

    if (!extractedText || extractedText.length < 50) {
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
      charCount: extractedText.length
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
