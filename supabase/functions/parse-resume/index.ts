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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const lovableApiKey = Deno.env.get("LOVABLE_API_KEY");
    
    if (!lovableApiKey) {
      console.error("LOVABLE_API_KEY not configured");
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
      console.error("Invalid token:", claimsError);
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

    console.log(`Parsing resume: ${fileName} (${fileType}), base64 length: ${fileBase64.length}`);

    // Determine MIME type for the AI
    let mimeType = "application/pdf";
    if (fileType?.includes("word") || fileName?.endsWith(".docx") || fileName?.endsWith(".doc")) {
      mimeType = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    }

    const prompt = `Parse this resume document and extract work history, education, and skills in a structured format.

Extract and return a JSON object with:
{
  "workHistory": [
    {
      "id": "work-1",
      "company": "Company Name",
      "title": "Job Title",
      "startDate": "Mon YYYY",
      "endDate": "Mon YYYY or Present",
      "description": "Brief description of responsibilities and achievements"
    }
  ],
  "education": [
    {
      "id": "edu-1",
      "institution": "University/School Name",
      "degree": "Degree Type (Bachelor's, Master's, etc.)",
      "field": "Field of Study",
      "startDate": "YYYY",
      "endDate": "YYYY"
    }
  ],
  "skills": ["Skill 1", "Skill 2", "Tool 1", "Technology 1"]
}

Rules:
- Generate unique IDs for each entry (use format like "work-1", "work-2", "edu-1", etc.)
- Keep descriptions concise (1-2 sentences max)
- Use "Present" for current positions
- If dates are unclear, use approximate dates
- Extract ALL skills mentioned: technical skills, tools, languages, frameworks, soft skills
- Return empty arrays if no work/education/skills found
- Return ONLY valid JSON, no other text or markdown`;

    console.log("Calling Gemini with PDF document...");

    // Use Gemini with inline document data
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
            content: "You are a resume parser. Extract work history, education, and skills from the attached document. Always respond with valid JSON only, no markdown formatting." 
          },
          { 
            role: "user", 
            content: [
              {
                type: "file",
                file: {
                  filename: fileName,
                  file_data: `data:${mimeType};base64,${fileBase64}`
                }
              },
              {
                type: "text",
                text: prompt
              }
            ]
          },
        ],
        temperature: 0.1,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("AI API error:", response.status, errorText);
      return new Response(
        JSON.stringify({ error: "Failed to parse resume" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const aiData = await response.json();
    const content = aiData.choices?.[0]?.message?.content || "";

    console.log("AI response length:", content.length);
    console.log("AI response preview:", content.substring(0, 1000));

    // Extract JSON from response (handle potential markdown code blocks)
    let jsonContent = content;
    
    // Remove markdown code blocks if present
    const codeBlockMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (codeBlockMatch) {
      jsonContent = codeBlockMatch[1];
    }
    
    // Find JSON object
    const jsonMatch = jsonContent.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error("No JSON found in AI response:", content.substring(0, 500));
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

    // Extract skills
    const skills: string[] = (parsed.skills || []).filter((s: any) => typeof s === 'string' && s.trim() !== '');

    console.log(`Successfully parsed ${workHistory.length} work experiences, ${education.length} education entries, and ${skills.length} skills`);

    return new Response(
      JSON.stringify({
        workHistory,
        education,
        skills,
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
