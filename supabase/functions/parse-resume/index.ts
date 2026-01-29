import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface WorkExperience {
  id: string;
  company: string;
  title: string;
  startDate: string;
  endDate: string;
  description: string;
}

interface Education {
  id: string;
  institution: string;
  degree: string;
  field: string;
  startDate: string;
  endDate: string;
}

// Simple PDF text extraction (handles basic text-based PDFs)
function extractTextFromPdf(base64Data: string): string {
  try {
    const binaryData = atob(base64Data);
    
    // Extract text between stream/endstream markers
    const streamMatches = binaryData.matchAll(/stream\s*([\s\S]*?)\s*endstream/g);
    let extractedText = "";
    
    for (const match of streamMatches) {
      const streamContent = match[1];
      // Try to extract readable ASCII text
      const textContent = streamContent.replace(/[^\x20-\x7E\n\r\t]/g, " ");
      const cleanText = textContent
        .replace(/\s+/g, " ")
        .trim();
      
      if (cleanText.length > 10) {
        extractedText += cleanText + " ";
      }
    }
    
    // Also try to find text in parentheses (common PDF text encoding)
    const parenMatches = binaryData.matchAll(/\(([^)]+)\)/g);
    for (const match of parenMatches) {
      const text = match[1].replace(/[^\x20-\x7E]/g, "");
      if (text.length > 2) {
        extractedText += text + " ";
      }
    }
    
    return extractedText.trim();
  } catch (error) {
    console.error("PDF extraction error:", error);
    return "";
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const lovableApiKey = Deno.env.get("LOVABLE_API_KEY");
    
    if (!lovableApiKey) {
      return new Response(
        JSON.stringify({ error: "AI API key not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate auth
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);

    if (claimsError || !claimsData?.claims) {
      return new Response(
        JSON.stringify({ error: "Invalid token" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const body = await req.json();
    const { fileBase64, fileName, fileType } = body;

    if (!fileBase64) {
      return new Response(
        JSON.stringify({ error: "No file provided" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Parsing resume: ${fileName} (${fileType})`);

    // Extract text based on file type
    let resumeText = "";
    
    if (fileType === "application/pdf") {
      resumeText = extractTextFromPdf(fileBase64);
    } else {
      // For Word docs, try basic extraction
      try {
        const binaryData = atob(fileBase64);
        // Extract readable text from XML content in docx
        const textContent = binaryData.replace(/[^\x20-\x7E\n\r\t]/g, " ");
        resumeText = textContent.replace(/\s+/g, " ").trim();
      } catch (e) {
        console.error("Word extraction error:", e);
      }
    }

    console.log(`Extracted ${resumeText.length} characters from resume`);

    // Use AI to parse the resume content
    const prompt = `Parse this resume text and extract work history and education in a structured format.

Resume text:
${resumeText.substring(0, 15000)}

Extract and return a JSON object with:
{
  "workHistory": [
    {
      "id": "unique-id-1",
      "company": "Company Name",
      "title": "Job Title",
      "startDate": "Mon YYYY",
      "endDate": "Mon YYYY or Present",
      "description": "Brief description of responsibilities and achievements"
    }
  ],
  "education": [
    {
      "id": "unique-id-1",
      "institution": "University/School Name",
      "degree": "Degree Type (Bachelor's, Master's, etc.)",
      "field": "Field of Study",
      "startDate": "YYYY",
      "endDate": "YYYY"
    }
  ]
}

Rules:
- Generate unique IDs for each entry (use format like "work-1", "work-2", "edu-1", etc.)
- Keep descriptions concise (1-2 sentences max)
- Use "Present" for current positions
- If dates are unclear, use approximate dates
- Return empty arrays if no work/education found
- Return ONLY valid JSON, no other text`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${lovableApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { 
            role: "system", 
            content: "You are a resume parser. Extract work history and education from resume text. Always respond with valid JSON only." 
          },
          { role: "user", content: prompt },
        ],
        temperature: 0.1,
      }),
    });

    if (!response.ok) {
      console.error("AI API error:", response.status);
      return new Response(
        JSON.stringify({ error: "Failed to parse resume" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const aiData = await response.json();
    const content = aiData.choices?.[0]?.message?.content || "";

    console.log("AI response:", content.substring(0, 500));

    // Extract JSON from response
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error("No JSON found in AI response");
      return new Response(
        JSON.stringify({ 
          workHistory: [], 
          education: [],
          message: "Could not parse resume content"
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const parsed = JSON.parse(jsonMatch[0]);

    // Validate and ensure IDs exist
    const workHistory: WorkExperience[] = (parsed.workHistory || []).map((w: any, idx: number) => ({
      id: w.id || `work-${idx + 1}`,
      company: w.company || "",
      title: w.title || "",
      startDate: w.startDate || "",
      endDate: w.endDate || "",
      description: w.description || "",
    }));

    const education: Education[] = (parsed.education || []).map((e: any, idx: number) => ({
      id: e.id || `edu-${idx + 1}`,
      institution: e.institution || "",
      degree: e.degree || "",
      field: e.field || "",
      startDate: e.startDate || "",
      endDate: e.endDate || "",
    }));

    console.log(`Parsed ${workHistory.length} work experiences and ${education.length} education entries`);

    return new Response(
      JSON.stringify({
        workHistory,
        education,
        success: true,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Internal server error";
    console.error("Parse resume error:", error);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
