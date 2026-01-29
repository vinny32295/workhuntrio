import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Simple PDF text extraction - extracts readable text from PDF
async function extractTextFromPDF(pdfBuffer: ArrayBuffer): Promise<string> {
  const bytes = new Uint8Array(pdfBuffer);
  const text = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  
  // Extract text between stream markers and clean it up
  const textParts: string[] = [];
  
  // Try to find text in PDF streams
  const streamRegex = /stream[\r\n]+([\s\S]*?)[\r\n]+endstream/g;
  let match;
  
  while ((match = streamRegex.exec(text)) !== null) {
    const streamContent = match[1];
    // Extract text operators (Tj, TJ, ')
    const textRegex = /\(([^)]*)\)\s*(?:Tj|')|<([^>]*)>\s*(?:Tj|')/g;
    let textMatch;
    while ((textMatch = textRegex.exec(streamContent)) !== null) {
      if (textMatch[1]) {
        textParts.push(textMatch[1]);
      }
    }
  }
  
  // Also try to extract any readable ASCII text
  const readableText = text.replace(/[^\x20-\x7E\r\n]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  
  if (textParts.length > 0) {
    return textParts.join(' ').replace(/\\n/g, '\n').replace(/\s+/g, ' ').trim();
  }
  
  // Fallback: return cleaned readable portions
  return readableText.slice(0, 5000);
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization header" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { jobTitle, companyName, jobSnippet, jobUrl } = await req.json();

    if (!jobTitle) {
      return new Response(JSON.stringify({ error: "Job title is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get user's profile with resume URL and contact info
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("resume_url, full_name, email, phone_number, target_roles")
      .eq("user_id", user.id)
      .single();

    if (profileError || !profile?.resume_url) {
      return new Response(JSON.stringify({ error: "Please upload your resume first" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch and parse the resume PDF
    let resumeText = "";
    try {
      console.log("Fetching resume from:", profile.resume_url);
      const resumeResponse = await fetch(profile.resume_url);
      if (resumeResponse.ok) {
        const contentType = resumeResponse.headers.get("content-type") || "";
        const pdfBuffer = await resumeResponse.arrayBuffer();
        
        if (contentType.includes("pdf")) {
          resumeText = await extractTextFromPDF(pdfBuffer);
          console.log("Extracted PDF text length:", resumeText.length);
        } else {
          // Try as plain text
          resumeText = new TextDecoder().decode(pdfBuffer);
        }
        
        if (resumeText.length < 50) {
          console.log("PDF extraction yielded limited text, using profile info only");
          resumeText = "";
        }
      }
    } catch (e) {
      console.error("Error fetching/parsing resume:", e);
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: "AI service not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Build contact info section
    const contactInfo = [
      profile.full_name || "Your Name",
      profile.email || "your.email@example.com",
      profile.phone_number || "(XXX) XXX-XXXX",
    ].filter(Boolean).join(" | ");

    const systemPrompt = `You are an expert career coach and professional resume writer. Your task is to create a COMPLETE, PROPERLY FORMATTED resume and cover letter tailored to a specific job opportunity.

CRITICAL FORMATTING REQUIREMENTS:
1. The resume MUST be a complete, professional resume - not just sections or tips
2. The cover letter MUST be a complete, formal business letter
3. Use the candidate's actual name, email, and phone number provided
4. Incorporate keywords and requirements from the job description
5. Highlight relevant experience and skills that match the job

OUTPUT FORMAT - You MUST follow this exact structure:

---

# TAILORED RESUME

**${contactInfo}**

---

## PROFESSIONAL SUMMARY
[2-3 sentence summary tailored to this specific role, highlighting relevant experience]

---

## SKILLS
[Bullet list of 8-10 relevant skills, prioritizing those mentioned in the job description]

---

## PROFESSIONAL EXPERIENCE

**[Job Title]** | [Company Name] | [Dates]
- [Achievement/responsibility using action verbs and metrics]
- [Achievement/responsibility]
- [Achievement/responsibility]

[Repeat for other relevant positions]

---

## EDUCATION

**[Degree]** | [Institution] | [Year]

---

## CERTIFICATIONS (if applicable)

- [Relevant certifications]

---

# COVER LETTER

[Today's Date]

[Hiring Manager Name if known, otherwise "Hiring Manager"]
[Company Name]
[Company Address if known]

Dear Hiring Manager,

[Opening paragraph: Express enthusiasm for the specific position and company. Mention how you learned about the role.]

[Body paragraph 1: Highlight your most relevant qualifications and experiences that directly match the job requirements. Use specific examples.]

[Body paragraph 2: Demonstrate knowledge of the company and explain why you're a great fit. Connect your skills to their needs.]

[Closing paragraph: Reiterate interest, thank them for their consideration, and include a call to action.]

Sincerely,
${profile.full_name || "[Your Name]"}
${profile.email || "[Your Email]"}
${profile.phone_number || "[Your Phone]"}

---`;

    const userPrompt = `Create a complete, tailored resume and cover letter for this job opportunity:

**JOB DETAILS:**
- Position: ${jobTitle}
- Company: ${companyName || "Company not specified"}
- Job Description: ${jobSnippet || "No description available"}
- Job URL: ${jobUrl || "Not provided"}

**CANDIDATE CONTACT INFORMATION:**
- Name: ${profile.full_name || "Not provided - use placeholder"}
- Email: ${profile.email || "Not provided - use placeholder"}
- Phone: ${profile.phone_number || "Not provided - use placeholder"}

**CANDIDATE'S CURRENT RESUME CONTENT:**
${resumeText || "Resume content not available - create a template based on target roles: " + (profile.target_roles?.join(", ") || "General professional")}

---

IMPORTANT: 
1. Create a COMPLETE resume with all sections filled in based on the candidate's resume content
2. If resume content is limited, create a professional template they can customize
3. Tailor ALL content to match the job description keywords and requirements
4. The cover letter should reference specific job requirements and company details
5. Use the exact contact information provided for the candidate`;

    console.log("Generating tailored content for:", jobTitle, "at", companyName);

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        stream: false,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again later." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted. Please add funds." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const errorText = await response.text();
      console.error("AI gateway error:", response.status, errorText);
      return new Response(JSON.stringify({ error: "Failed to generate content" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiResponse = await response.json();
    const content = aiResponse.choices?.[0]?.message?.content;

    if (!content) {
      return new Response(JSON.stringify({ error: "No content generated" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log("Successfully generated tailored resume and cover letter");

    return new Response(JSON.stringify({ 
      success: true,
      content,
      jobTitle,
      companyName
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err) {
    console.error("Error in tailor-resume function:", err);
    const message = err instanceof Error ? err.message : "Internal error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
