// Supabase Edge Function - Runs on Deno runtime
// @deno-types="npm:@types/node"

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Dynamic import for mammoth to avoid deployment issues
async function parseDOCX(arrayBuffer: ArrayBuffer): Promise<string> {
  const mammoth = await import("https://esm.sh/mammoth@1.6.0");
  const result = await mammoth.default.extractRawText({ arrayBuffer });
  return result.value;
}

// Extract text from PDF using unpdf (handles compressed/FlateDecode streams properly)
async function extractTextFromPDFWithUnpdf(uint8Array: Uint8Array): Promise<string> {
  try {
    const { extractText, getDocumentProxy } = await import("https://esm.sh/unpdf@0.12.1");
    const pdf = await getDocumentProxy(uint8Array);
    const { text } = await extractText(pdf, { mergePages: true });
    return text || "";
  } catch (error) {
    console.error("unpdf extraction failed:", error);
    return "";
  }
}

// Fallback: basic regex-based text extraction for simple PDFs
function extractTextFromPDFBasic(uint8Array: Uint8Array): string {
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

// Main PDF extraction: try unpdf first, fall back to basic extraction
async function extractTextFromPDF(uint8Array: Uint8Array): Promise<string> {
  // Try unpdf first (handles compressed streams, FlateDecode, etc.)
  console.log("Attempting PDF text extraction with unpdf...");
  const unpdfText = await extractTextFromPDFWithUnpdf(uint8Array);
  if (unpdfText && unpdfText.trim().length > 50) {
    console.log("unpdf extraction successful, length:", unpdfText.length);
    return unpdfText;
  }

  // Fall back to basic regex-based extraction
  console.log("Falling back to basic PDF text extraction...");
  const basicText = extractTextFromPDFBasic(uint8Array);
  console.log("Basic extraction length:", basicText.length);

  return basicText;
}

// Check if extracted text looks like valid resume content (not just PDF metadata)
function isValidResumeContent(text: string): boolean {
  const lowerText = text.toLowerCase();
  
  // Check for PDF metadata patterns that indicate failed extraction
  const metadataPatterns = [
    'pdftex',
    'pdflatex', 
    'tex live',
    'd:2024', 'd:2025', 'd:2026', // PDF date stamps
    'xetex',
    'luatex',
    '/type /page',
    '/producer',
    '/creator'
  ];
  
  for (const pattern of metadataPatterns) {
    if (lowerText.includes(pattern)) {
      console.log("Detected PDF metadata pattern:", pattern);
      return false;
    }
  }
  
  // Check for common resume content indicators
  const resumeIndicators = [
    'experience', 'education', 'skills', 'summary',
    'email', 'phone', '@', 'university', 'college',
    'bachelor', 'master', 'degree', 'engineer', 
    'manager', 'developer', 'analyst', 'scientist',
    'work', 'project', 'certification', 'linkedin'
  ];
  
  let indicatorCount = 0;
  for (const indicator of resumeIndicators) {
    if (lowerText.includes(indicator)) {
      indicatorCount++;
    }
  }
  
  // Need at least 2 resume indicators to be considered valid
  if (indicatorCount < 2) {
    console.log("Insufficient resume indicators found:", indicatorCount);
    return false;
  }
  
  return true;
}

// Count approximate number of pages in PDF
function countPDFPages(uint8Array: Uint8Array): number {
  const textDecoder = new TextDecoder('utf-8', { fatal: false });
  const pdfString = textDecoder.decode(uint8Array);
  
  // Count /Type /Page entries (each page object has this)
  const pageMatches = pdfString.match(/\/Type\s*\/Page[^s]/g);
  if (pageMatches) {
    return pageMatches.length;
  }
  
  // Fallback: look for /Count in Pages object
  const countMatch = pdfString.match(/\/Count\s+(\d+)/);
  if (countMatch) {
    return parseInt(countMatch[1], 10);
  }
  
  return 1; // Default to 1 page
}

// SSE helper to send progress updates
function sendSSE(controller: ReadableStreamDefaultController, data: object) {
  const encoder = new TextEncoder();
  controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
}

// Use OCR.space API for OCR with progress streaming
async function ocrWithOCRSpace(
  base64: string, 
  fileName: string, 
  mimeType: string,
  pageCount: number,
  controller?: ReadableStreamDefaultController
): Promise<string | null> {
  const OCRSPACE_API_KEY = Deno.env.get("OCRSPACE_API_KEY");
  if (!OCRSPACE_API_KEY) {
    console.log("OCR service not configured - OCRSPACE_API_KEY missing");
    return null;
  }

  console.log("Using OCR.space for OCR on:", fileName, "estimated pages:", pageCount);
  
  if (controller) {
    sendSSE(controller, { 
      type: "progress", 
      stage: "ocr_start",
      message: `Starting OCR processing for ${pageCount} page(s)...`,
      progress: 10,
      pageCount
    });
  }

  try {
    // Determine file type for OCR.space
    const fileExtension = fileName.split('.').pop()?.toLowerCase() || 'pdf';
    
    // Create form data for OCR.space API
    const formData = new FormData();
    formData.append('apikey', OCRSPACE_API_KEY);
    formData.append('base64Image', `data:${mimeType};base64,${base64}`);
    formData.append('language', 'eng');
    formData.append('isOverlayRequired', 'false');
    formData.append('detectOrientation', 'true');
    formData.append('scale', 'true');
    formData.append('OCREngine', '2'); // Engine 2 is better for documents
    
    // For multi-page PDFs
    if (mimeType === 'application/pdf') {
      formData.append('isTable', 'true');
    }

    if (controller) {
      sendSSE(controller, { 
        type: "progress", 
        stage: "ocr_processing",
        message: "OCR.space is analyzing document...",
        progress: 50
      });
    }

    const response = await fetch("https://api.ocr.space/parse/image", {
      method: "POST",
      body: formData,
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("OCR.space error:", response.status, errorText);
      return null;
    }

    const data = await response.json();
    
    if (data.IsErroredOnProcessing) {
      console.error("OCR.space processing error:", data.ErrorMessage || data.ErrorDetails);
      return null;
    }

    // Extract text from all parsed results (multi-page support)
    let extractedText = "";
    if (data.ParsedResults && Array.isArray(data.ParsedResults)) {
      extractedText = data.ParsedResults
        .map((result: { ParsedText?: string }) => result.ParsedText || "")
        .join("\n\n---\n\n"); // Page separator
    }
    
    if (controller) {
      sendSSE(controller, { 
        type: "progress", 
        stage: "ocr_complete",
        message: "OCR processing complete!",
        progress: 90
      });
    }
    
    console.log("OCR completed, extracted text length:", extractedText.length);
    return extractedText;
  } catch (error) {
    console.error("OCR exception:", error);
    return null;
  }
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

    const { filePath, streaming } = await req.json();

    if (!filePath) {
      return new Response(JSON.stringify({ error: "File path is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log("Downloading file from storage:", filePath, "streaming:", streaming);

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

    // For streaming responses (OCR with progress)
    if (streaming) {
      const stream = new ReadableStream({
        async start(controller) {
          try {
            sendSSE(controller, { 
              type: "progress", 
              stage: "download_complete",
              message: "File downloaded, analyzing...",
              progress: 5
            });

            let extractedText = "";

            if (fileName.endsWith(".pdf")) {
              const arrayBuffer = await fileData.arrayBuffer();
              const uint8Array = new Uint8Array(arrayBuffer);
              const pageCount = countPDFPages(uint8Array);
              
              sendSSE(controller, { 
                type: "progress", 
                stage: "analyzing",
                message: `Detected ${pageCount} page(s) in PDF`,
                progress: 8,
                pageCount
              });
              
              // Try text extraction (unpdf first, then basic fallback)
              extractedText = await extractTextFromPDF(uint8Array);
              
              // Check if extracted text is meaningful (not just PDF metadata or garbage)
              const needsOCR = extractedText.length < 100 || 
                !isValidResumeContent(extractedText);
              
              if (needsOCR) {
                sendSSE(controller, { 
                  type: "progress", 
                  stage: "ocr_needed",
                  message: "Using AI vision for better text extraction...",
                  progress: 10
                });
                
                const base64 = btoa(
                  uint8Array.reduce((data, byte) => data + String.fromCharCode(byte), '')
                );
                
                const ocrResult = await ocrWithOCRSpace(base64, fileName, "application/pdf", pageCount, controller);
                
                if (ocrResult && ocrResult.length > extractedText.length) {
                  extractedText = ocrResult;
                } else if (!ocrResult) {
                  sendSSE(controller, { 
                    type: "progress", 
                    stage: "ocr_failed",
                    message: "OCR unavailable, using basic text extraction",
                    progress: 80
                  });
                  // Keep whatever text we extracted
                }
              } else {
                sendSSE(controller, { 
                  type: "progress", 
                  stage: "text_extracted",
                  message: "Text extracted from PDF",
                  progress: 90
                });
              }
            } else if (fileName.endsWith(".png") || fileName.endsWith(".jpg") || fileName.endsWith(".jpeg") || fileName.endsWith(".webp")) {
              const arrayBuffer = await fileData.arrayBuffer();
              const uint8Array = new Uint8Array(arrayBuffer);
              const base64 = btoa(
                uint8Array.reduce((data, byte) => data + String.fromCharCode(byte), '')
              );
              
              const mimeType = fileName.endsWith(".png") ? "image/png" : 
                              fileName.endsWith(".webp") ? "image/webp" : "image/jpeg";
              
              const ocrResult = await ocrWithOCRSpace(base64, fileName, mimeType, 1, controller);
              
              if (ocrResult) {
                extractedText = ocrResult;
              } else {
                sendSSE(controller, { 
                  type: "error", 
                  error: "OCR service not available. Please paste your resume content directly."
                });
                controller.close();
                return;
              }
            } else if (fileName.endsWith(".docx")) {
              sendSSE(controller, { 
                type: "progress", 
                stage: "parsing_docx",
                message: "Parsing Word document...",
                progress: 50
              });
              
              const arrayBuffer = await fileData.arrayBuffer();
              extractedText = await parseDOCX(arrayBuffer);
              
              sendSSE(controller, { 
                type: "progress", 
                stage: "docx_complete",
                message: "Word document parsed",
                progress: 90
              });
            } else if (fileName.endsWith(".txt") || fileName.endsWith(".md")) {
              extractedText = await fileData.text();
              sendSSE(controller, { 
                type: "progress", 
                stage: "text_read",
                message: "Text file read",
                progress: 90
              });
            }

            // Clean up the extracted text while preserving structure
            extractedText = extractedText
              .replace(/\r\n/g, "\n")           // normalize line endings
              .replace(/[ \t]+/g, " ")          // collapse horizontal whitespace only
              .replace(/\n{3,}/g, "\n\n")       // collapse 3+ newlines to 2
              .replace(/^ +| +$/gm, "")         // trim leading/trailing spaces per line
              .trim();

            sendSSE(controller, { 
              type: "progress", 
              stage: "complete",
              message: "Processing complete!",
              progress: 100
            });

            // Send final result
            sendSSE(controller, { 
              type: "result", 
              text: extractedText,
              fileName: fileName,
              charCount: extractedText.length
            });

            controller.close();
          } catch (error) {
            console.error("Streaming error:", error);
            sendSSE(controller, { 
              type: "error", 
              error: error instanceof Error ? error.message : "Unknown error"
            });
            controller.close();
          }
        }
      });

      return new Response(stream, {
        headers: { 
          ...corsHeaders, 
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          "Connection": "keep-alive"
        },
      });
    }

    // Non-streaming response (original behavior)
    let extractedText = "";
    console.log("Processing file:", fileName);

    if (fileName.endsWith(".pdf")) {
      try {
        const arrayBuffer = await fileData.arrayBuffer();
        const uint8Array = new Uint8Array(arrayBuffer);
        const pageCount = countPDFPages(uint8Array);
        
        // Try text extraction (unpdf first, then basic fallback)
        extractedText = await extractTextFromPDF(uint8Array);

        console.log("PDF text extraction length:", extractedText.length, "pages:", pageCount);

        // Check if extracted text is meaningful (not just PDF metadata or garbage)
        const needsOCR = extractedText.length < 100 || !isValidResumeContent(extractedText);
        
        if (needsOCR) {
          console.log("PDF needs OCR - either too short or contains metadata instead of content");
          
          // Check if OCR is available
          const OCRSPACE_API_KEY = Deno.env.get("OCRSPACE_API_KEY");
          if (!OCRSPACE_API_KEY) {
            console.log("OCRSPACE_API_KEY not configured, returning partial text");
            if (extractedText.length > 0) {
              // Return what we have if there's any text at all
              console.log("Returning basic extracted text instead");
            } else {
              return new Response(JSON.stringify({ 
                error: "This PDF requires OCR (scanned document), but OCR service is not configured. Please paste your resume content directly or use a text-based PDF." 
              }), {
                status: 400,
                headers: { ...corsHeaders, "Content-Type": "application/json" },
              });
            }
          } else {
            const base64 = btoa(
              uint8Array.reduce((data, byte) => data + String.fromCharCode(byte), '')
            );
            
            try {
              const ocrResult = await ocrWithOCRSpace(base64, fileName, "application/pdf", pageCount);
              if (ocrResult && ocrResult.length > extractedText.length) {
                extractedText = ocrResult;
              } else if (!ocrResult) {
                console.log("OCR returned no results, keeping basic extraction");
              }
            } catch (ocrError) {
              console.error("OCR failed:", ocrError);
              // If we have any text from basic extraction, use it instead of erroring
              if (extractedText.length < 20) {
                return new Response(JSON.stringify({ 
                  error: "Failed to extract text from this scanned PDF. Please try pasting your resume content directly." 
                }), {
                  status: 400,
                  headers: { ...corsHeaders, "Content-Type": "application/json" },
                });
              }
            }
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
        extractedText = await parseDOCX(arrayBuffer);
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
      try {
        const arrayBuffer = await fileData.arrayBuffer();
        const uint8Array = new Uint8Array(arrayBuffer);
        const base64 = btoa(
          uint8Array.reduce((data, byte) => data + String.fromCharCode(byte), '')
        );
        
        const mimeType = fileName.endsWith(".png") ? "image/png" : 
                        fileName.endsWith(".webp") ? "image/webp" : "image/jpeg";
        
        console.log("Processing image file with OCR:", fileName);
        
        const ocrResult = await ocrWithOCRSpace(base64, fileName, mimeType, 1);
        
        if (ocrResult) {
          extractedText = ocrResult;
          console.log("Image OCR completed, text length:", extractedText.length);
        } else {
          console.log("OCR not available for image");
          return new Response(JSON.stringify({ 
            error: "OCR service not configured. Please paste your resume content directly." 
          }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      } catch (imgError) {
        console.error("Image OCR error:", imgError);
        return new Response(JSON.stringify({ 
          error: "Failed to extract text from image. Please paste your resume content directly." 
        }), {
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

    // Clean up the extracted text while preserving structure
    extractedText = extractedText
      .replace(/\r\n/g, "\n")           // normalize line endings
      .replace(/[ \t]+/g, " ")          // collapse horizontal whitespace only
      .replace(/\n{3,}/g, "\n\n")       // collapse 3+ newlines to 2
      .replace(/^ +| +$/gm, "")         // trim leading/trailing spaces per line
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
