import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
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

interface ProfileData {
  full_name: string | null;
  email: string | null;
  phone_number: string | null;
  location_zip: string | null;
  work_history: WorkExperience[] | null;
  education: Education[] | null;
  skills: string[] | null;
}

function escapeHtml(text: string | null | undefined): string {
  if (!text) return '';
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function formatBulletPoints(description: string | null | undefined): string {
  if (!description) return '';
  
  const lines = description
    .split(/[\n•]/g)
    .map(line => line.trim())
    .filter(line => line.length > 0);
  
  if (lines.length === 0) return '';
  
  return lines.map(line => `<li>${escapeHtml(line)}</li>`).join('\n');
}

const baseStyles = `
    @import url('https://fonts.googleapis.com/css2?family=Libre+Baskerville:wght@400;700&family=Open+Sans:wght@400;600&display=swap');
    
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    
    body {
      font-family: 'Open Sans', Arial, sans-serif;
      font-size: 10pt;
      line-height: 1.4;
      color: #1a1a1a;
      padding: 0.75in;
      max-width: 8.5in;
      margin: 0 auto;
      background: white;
    }
    
    @media print {
      body {
        padding: 0;
        background: white;
      }
      @page {
        margin: 0.75in;
        size: letter;
      }
    }
    
    .header {
      text-align: center;
      margin-bottom: 20px;
      padding-bottom: 15px;
      border-bottom: 2px solid #2c3e50;
    }
    
    .name {
      font-family: 'Libre Baskerville', Georgia, serif;
      font-size: 24pt;
      font-weight: 700;
      color: #2c3e50;
      margin-bottom: 8px;
      letter-spacing: 1px;
    }
    
    .contact {
      font-size: 9pt;
      color: #555;
    }
    
    .section {
      margin-bottom: 18px;
    }
    
    .section h2 {
      font-family: 'Libre Baskerville', Georgia, serif;
      font-size: 12pt;
      font-weight: 700;
      color: #2c3e50;
      text-transform: uppercase;
      letter-spacing: 1px;
      padding-bottom: 4px;
      border-bottom: 1px solid #2c3e50;
      margin-bottom: 10px;
    }
    
    .summary {
      font-size: 10pt;
      line-height: 1.5;
      color: #333;
    }
    
    .job {
      margin-bottom: 14px;
    }
    
    .job:last-child {
      margin-bottom: 0;
    }
    
    .job-header {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      margin-bottom: 4px;
    }
    
    .job-title {
      font-weight: 600;
      color: #1a1a1a;
    }
    
    .company {
      font-style: italic;
      color: #444;
    }
    
    .job-dates {
      font-size: 9pt;
      color: #666;
      white-space: nowrap;
    }
    
    .job-bullets {
      margin-left: 18px;
      margin-top: 4px;
    }
    
    .job-bullets li {
      margin-bottom: 3px;
      padding-left: 4px;
    }
    
    .education-item {
      margin-bottom: 10px;
    }
    
    .education-item:last-child {
      margin-bottom: 0;
    }
    
    .edu-header {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
    }
    
    .degree {
      font-weight: 600;
    }
    
    .field {
      color: #444;
    }
    
    .edu-dates {
      font-size: 9pt;
      color: #666;
    }
    
    .edu-institution {
      font-style: italic;
      color: #555;
      font-size: 9pt;
    }
    
    .skills-container {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }
    
    .skill {
      background: #f0f4f8;
      color: #2c3e50;
      padding: 4px 10px;
      border-radius: 3px;
      font-size: 9pt;
      border: 1px solid #d0d8e0;
    }
`;

function generateResumeHTML(profile: ProfileData, tailoredSummary?: string, tailoredSkills?: string[]): string {
  const name = profile.full_name || 'Your Name';
  const email = profile.email || '';
  const phone = profile.phone_number || '';
  const location = profile.location_zip || '';
  
  const contactParts = [email, phone, location].filter(Boolean);
  const contactLine = contactParts.join(' | ');
  
  // Use tailored skills if provided, otherwise use profile skills
  const displaySkills = tailoredSkills && tailoredSkills.length > 0 ? tailoredSkills : profile.skills;
  
  let workExperienceHTML = '';
  if (profile.work_history && profile.work_history.length > 0) {
    workExperienceHTML = profile.work_history.map(job => `
      <div class="job">
        <div class="job-header">
          <div class="job-title-company">
            <span class="job-title">${escapeHtml(job.title)}</span>
            <span class="company"> | ${escapeHtml(job.company)}</span>
          </div>
          <div class="job-dates">${escapeHtml(job.startDate)} – ${escapeHtml(job.endDate)}</div>
        </div>
        <ul class="job-bullets">
          ${formatBulletPoints(job.description)}
        </ul>
      </div>
    `).join('\n');
  }
  
  let educationHTML = '';
  if (profile.education && profile.education.length > 0) {
    educationHTML = profile.education.map(edu => `
      <div class="education-item">
        <div class="edu-header">
          <div class="edu-degree">
            <span class="degree">${escapeHtml(edu.degree)}</span>
            ${edu.field ? `<span class="field">, ${escapeHtml(edu.field)}</span>` : ''}
          </div>
          <div class="edu-dates">${escapeHtml(edu.startDate)} – ${escapeHtml(edu.endDate)}</div>
        </div>
        <div class="edu-institution">${escapeHtml(edu.institution)}</div>
      </div>
    `).join('\n');
  }
  
  let skillsHTML = '';
  if (displaySkills && displaySkills.length > 0) {
    skillsHTML = displaySkills.map(skill => `<span class="skill">${escapeHtml(skill)}</span>`).join(' ');
  }
  
  const summaryHTML = tailoredSummary 
    ? `<section class="section">
        <h2>Professional Summary</h2>
        <p class="summary">${escapeHtml(tailoredSummary)}</p>
      </section>`
    : '';
  
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Resume - ${escapeHtml(name)}</title>
  <style>${baseStyles}</style>
</head>
<body>
  <header class="header">
    <h1 class="name">${escapeHtml(name)}</h1>
    <div class="contact">${escapeHtml(contactLine)}</div>
  </header>
  
  ${summaryHTML}
  
  ${profile.work_history && profile.work_history.length > 0 ? `
  <section class="section">
    <h2>Work Experience</h2>
    ${workExperienceHTML}
  </section>
  ` : ''}
  
  ${profile.education && profile.education.length > 0 ? `
  <section class="section">
    <h2>Education</h2>
    ${educationHTML}
  </section>
  ` : ''}
  
  ${displaySkills && displaySkills.length > 0 ? `
  <section class="section">
    <h2>Skills</h2>
    <div class="skills-container">
      ${skillsHTML}
    </div>
  </section>
  ` : ''}
</body>
</html>`;
}

function generateCoverLetterHTML(
  profile: ProfileData, 
  coverLetterContent: string,
  jobTitle: string,
  companyName: string
): string {
  const name = profile.full_name || 'Your Name';
  const email = profile.email || '';
  const phone = profile.phone_number || '';
  const location = profile.location_zip || '';
  
  const contactParts = [email, phone, location].filter(Boolean);
  const contactLine = contactParts.join(' | ');
  
  const today = new Date().toLocaleDateString('en-US', { 
    year: 'numeric', 
    month: 'long', 
    day: 'numeric' 
  });
  
  // Convert markdown-style content to HTML paragraphs
  const paragraphs = coverLetterContent
    .split(/\n\n+/)
    .map(p => p.trim())
    .filter(p => p.length > 0 && !p.startsWith('#'))
    .map(p => `<p>${escapeHtml(p).replace(/\n/g, '<br>')}</p>`)
    .join('\n');
  
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Cover Letter - ${escapeHtml(name)} - ${escapeHtml(companyName)}</title>
  <style>
    ${baseStyles}
    
    .letter-date {
      margin-bottom: 20px;
      color: #555;
    }
    
    .letter-recipient {
      margin-bottom: 20px;
    }
    
    .letter-recipient p {
      margin: 0;
      line-height: 1.6;
    }
    
    .letter-body {
      margin-bottom: 30px;
    }
    
    .letter-body p {
      margin-bottom: 16px;
      line-height: 1.6;
      text-align: justify;
    }
    
    .letter-body p:last-child {
      margin-bottom: 0;
    }
    
    .letter-closing {
      margin-top: 30px;
    }
    
    .letter-closing .sign-off {
      margin-bottom: 30px;
    }
    
    .letter-closing .signature {
      font-weight: 600;
      color: #2c3e50;
    }
    
    .letter-closing .contact-info {
      font-size: 9pt;
      color: #666;
      margin-top: 4px;
    }
  </style>
</head>
<body>
  <header class="header">
    <h1 class="name">${escapeHtml(name)}</h1>
    <div class="contact">${escapeHtml(contactLine)}</div>
  </header>
  
  <div class="letter-date">${today}</div>
  
  <div class="letter-recipient">
    <p>Hiring Manager</p>
    <p>${escapeHtml(companyName)}</p>
  </div>
  
  <div class="letter-body">
    ${paragraphs}
  </div>
  
  <div class="letter-closing">
    <p class="sign-off">Sincerely,</p>
    <p class="signature">${escapeHtml(name)}</p>
    <p class="contact-info">${escapeHtml(email)}${phone ? ` | ${escapeHtml(phone)}` : ''}</p>
  </div>
</body>
</html>`;
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

    const body = await req.json().catch(() => ({}));
    const { 
      tailoredSummary, 
      tailoredSkills,
      coverLetterContent, 
      jobTitle, 
      companyName,
      type = "resume" // "resume" | "cover-letter" | "both"
    } = body;

    // Get user's profile with resume data
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("full_name, email, phone_number, location_zip, work_history, education, skills")
      .eq("user_id", user.id)
      .single();

    if (profileError) {
      console.error("Profile error:", profileError);
      return new Response(JSON.stringify({ error: "Could not load profile data" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const hasContent = (
      (profile.work_history && profile.work_history.length > 0) ||
      (profile.education && profile.education.length > 0) ||
      (profile.skills && profile.skills.length > 0)
    );

    if (!hasContent && type !== "cover-letter") {
      return new Response(JSON.stringify({ error: "Please add work history, education, or skills to your profile first" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log("Generating", type, "HTML for user:", user.id);
    console.log("Work history entries:", profile.work_history?.length || 0);
    console.log("Education entries:", profile.education?.length || 0);
    console.log("Skills:", profile.skills?.length || 0);

    const safeName = (profile.full_name || 'Resume').replace(/\s+/g, '_');
    const safeCompany = (companyName || 'Company').replace(/[^a-zA-Z0-9]/g, '_');

    const result: {
      success: boolean;
      resumeHtml?: string;
      resumeFileName?: string;
      coverLetterHtml?: string;
      coverLetterFileName?: string;
    } = { success: true };

    if (type === "resume" || type === "both") {
      result.resumeHtml = generateResumeHTML(profile as ProfileData, tailoredSummary, tailoredSkills);
      result.resumeFileName = `${safeName}_Resume_${safeCompany}.html`;
    }

    if (type === "cover-letter" || type === "both") {
      if (coverLetterContent) {
        result.coverLetterHtml = generateCoverLetterHTML(
          profile as ProfileData, 
          coverLetterContent,
          jobTitle || "Position",
          companyName || "Company"
        );
        result.coverLetterFileName = `${safeName}_CoverLetter_${safeCompany}.html`;
      }
    }

    // Legacy support: if just asking for basic resume
    if (type === "resume" && !body.tailoredSummary && !body.companyName) {
      return new Response(JSON.stringify({ 
        success: true,
        html: result.resumeHtml,
        fileName: `${safeName}_Resume.html`
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err) {
    console.error("Error in generate-resume-pdf function:", err);
    const message = err instanceof Error ? err.message : "Internal error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
