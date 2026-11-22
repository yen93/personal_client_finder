import { createClient } from "npm:@supabase/supabase-js@2";

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const ALLOWED_TABLES = new Set([
  "us_sales_hiring_leads",
  "au_hiring_signal_leads",
]);

const DEFAULT_TABLE = "us_sales_hiring_leads";
const DEFAULT_LABEL_NAME = "sales_leads";
const DEFAULT_MODEL = "gpt-4.1";
const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 25;
const SENDER_DISPLAY_NAME = "Julienne Mae Anito";

// Clean inline-table HTML signature matching email_signature/emailsig.v4.html
const EMAIL_SIGNATURE_V4_HTML = `<div dir="ltr" class="gmail_signature" data-smartmail="gmail_signature"><div dir="ltr" style="margin:0;padding:0;"><table cellpadding="0" cellspacing="0" border="0" role="presentation" style="border-collapse:collapse;max-width:420px;width:100%;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;"><tbody><tr><td><div style="font-family:Georgia,'Times New Roman',serif;font-size:19px;font-weight:700;line-height:1.2;color:#1c1811;letter-spacing:-0.2px;margin:0;">Julienne Mae Anito</div><div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:10.5px;font-weight:600;line-height:1.4;color:#8f6a23;letter-spacing:1.4px;text-transform:uppercase;padding-top:4px;margin:0;">AI &amp; Business Automation Consultant</div></td></tr><tr><td style="padding:11px 0 10px 0;"><table cellpadding="0" cellspacing="0" border="0" role="presentation" width="100%" style="border-collapse:collapse;"><tbody><tr><td width="36" style="width:36px;border-top:2px solid #b4863a;font-size:0;line-height:0;height:2px;">&nbsp;</td><td style="border-top:1px solid #e7dfd0;font-size:0;line-height:0;height:2px;">&nbsp;</td></tr></tbody></table></td></tr><tr><td style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:12.5px;line-height:1.6;color:#6f6757;"><a href="mailto:juliennemaeanito.2026@gmail.com" target="_blank" style="color:#1c1811;text-decoration:none;font-weight:500;"><span style="color:#1c1811;text-decoration:none;">juliennemaeanito.2026@gmail.com</span></a><span style="color:#b4863a;padding:0 6px;font-weight:700;">&middot;</span><a href="https://yen-ai.pages.dev" target="_blank" rel="noopener noreferrer" style="color:#8f6a23;text-decoration:none;font-weight:600;"><span style="color:#8f6a23;text-decoration:none;">yen-ai.pages.dev</span></a></td></tr><tr><td style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:12px;line-height:1.6;color:#6f6757;padding-top:2px;"><a href="https://maps.app.goo.gl/wYVBbC44NoP5VSQL6" target="_blank" rel="noopener noreferrer" style="color:#6f6757;text-decoration:none;"><span style="color:#6f6757;text-decoration:none;">Dumaguete City, Philippines</span></a><span style="color:#b4863a;padding:0 6px;font-weight:700;">&middot;</span><a href="https://www.linkedin.com/in/julienne-mae-anito-088270259/" target="_blank" rel="noopener noreferrer" style="color:#8f6a23;text-decoration:none;font-weight:500;"><span style="color:#8f6a23;text-decoration:none;">LinkedIn</span></a><span style="color:#b4863a;padding:0 6px;font-weight:700;">&middot;</span><a href="https://github.com/yen93" target="_blank" rel="noopener noreferrer" style="color:#8f6a23;text-decoration:none;font-weight:500;"><span style="color:#8f6a23;text-decoration:none;">GitHub</span></a></td></tr><tr><td style="padding-top:13px;"><table cellpadding="0" cellspacing="0" border="0" role="presentation" style="border-collapse:separate;border-spacing:0;"><tbody><tr><td align="center" bgcolor="#14110b" style="background-color:#14110b;border:1px solid #b4863a;border-radius:999px;"><a href="https://calendly.com/juliennemaeanito-de/30min" target="_blank" rel="noopener noreferrer" style="display:inline-block;padding:9px 18px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:12px;font-weight:600;line-height:1.2;color:#f4f0e7;text-decoration:none;letter-spacing:0.2px;white-space:nowrap;"><span style="color:#f4f0e7;text-decoration:none;">Book a Free 20-Min Consultation</span>&nbsp;<span style="color:#e0b65f;text-decoration:none;">&rarr;</span></a></td></tr></tbody></table></td></tr></tbody></table></div></div>`;

const EMAIL_SIGNATURE_PLAIN = [
  "Julienne Mae Anito",
  "AI & Business Automation Consultant",
  "juliennemaeanito.2026@gmail.com | https://yen-ai.pages.dev",
  "Dumaguete City, Philippines | LinkedIn: https://www.linkedin.com/in/julienne-mae-anito-088270259/ | GitHub: https://github.com/yen93",
  "Book a Free 20-Min Consultation: https://calendly.com/juliennemaeanito-de/30min",
].join("\n");

const DRAFT_EMAIL_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    subject: {
      type: "string",
      description:
        "Short, crisp, curiosity-sparking subject line (4-7 words), e.g. 'Quick idea re: your BDR hire' or 'Saving your BD team 10+ hrs/wk'. No emojis, no exclamation marks, no clickbait.",
    },
    greeting: {
      type: "string",
      description: "Clean first-name greeting line, e.g. 'Hi Amy,'.",
    },
    paragraphs: {
      type: "array",
      items: { type: "string" },
      description:
        "Exactly 3 tight, polished plain-text body paragraphs (80-100 words TOTAL across all 3 paragraphs). No HTML, no greeting, no sign-off, no links.",
    },
    closing_question: {
      type: "string",
      description: "Low-friction, autonomy-preserving closing nudge, e.g. 'Open to a quick look?' or 'Worth a quick look?'.",
    },
  },
  required: ["subject", "greeting", "paragraphs", "closing_question"],
};

const SYSTEM_INSTRUCTION = `You are writing short, high-converting cold intro emails on behalf of Julienne Mae Anito, an independent AI & Business Automation Consultant.
Your job is to write a sharp, polished, genuinely human message from an independent specialist offering a clear win to a potential client — tailored to their LinkedIn job post — while keeping the email **strictly ~80–100 words across 3 tight paragraphs** (about half the length of a traditional cold email).

PROVEN PSYCHOLOGICAL PRINCIPLES TO WEAVE IN NATURALLY (never mention them explicitly):
1. RELEVANCE & PATTERN INTERRUPT (Para 1): Open directly on their specific hiring post and the exact manual bottleneck hidden inside the role (e.g., daily outbound, follow-up chasing, CRM logging, lead research). Frame the subtle cost of that manual drag (loss aversion: talented hires losing hours every week to repetitive admin instead of actual selling/closing). NEVER fabricate job duties, tools, or company facts not in the provided context.
2. INDUSTRY-AGNOSTIC SOCIAL PROOF + TAILORED BRIDGE (Para 2): NEVER mention "a travel company" or any specific unrelated industry. Instead, state cleanly that you built and run a 30+ workflow automation system for one of your clients that saves their team around 40 hours a week — then bridge directly to them ("Seeing what your [role/team] is taking on, I think we could put a similar setup to work for [Company] pretty quickly, without adding extra admin overhead.").
3. RECIPROCITY + AUTONOMY / ZERO-RISK MICRO-COMMITMENT (Para 3): Make the offer genuinely hard to decline by leading with free, concrete value and giving them effortless control — offer to map out 2–3 specific workflows [Company] could automate right away on a quick 15-minute call (or send over a short 2-minute walkthrough if they'd rather skip a call), "yours to keep either way, no strings attached."
   - ONLY if the recipient's title is HR, People, Talent, Client Services, or non-Sales/non-Executive, add a brief, gracious routing note at the end of Paragraph 3 like "(And if someone on your sales or ops side owns this, I'd appreciate a quick point in their direction.)" — while staying concise (~95–105 words max). Omit that routing note for CEOs, Founders, Owners, Presidents, VPs/Directors of Sales/BD/Acquisitions, and RevOps leads.

STRICT STYLE & FORMATTING RULES:
- LENGTH: Target 80–100 words across the 3 paragraphs (1–2 crisp sentences per paragraph). Punchy, scannable, zero fluff.
- TONE: Warm, confident, peer-to-peer professional freelancer — NOT stiff corporate/agency jargon ("GTM engine", "outbound rollout", "synergy", "scale pipeline"), and NOT overly slangy or apologetic. Sound like a capable specialist sharing a genuinely smart idea.
- PROOF POINT RULE: Always say "for one of my clients" (or "for a client of mine") — NEVER say "travel company" or "travel & adventure company".
- PUNCTUATION: Plain text only inside JSON fields (no HTML, no markdown, no bullets, no URLs). Use spaced em-dashes (" — ") and en-dashes ("2–3") cleanly.
- NO SIGNATURE OR FOOTER: Do NOT include a signature, email address, website, Calendly link, or opt-out footer — those are appended separately.
- SUBJECT LINE: Short, natural, professional (4–7 words), e.g. "Quick idea re: your BDR hire" or "Idea for your BD team". No emojis, no exclamation marks, no hype.
- closing_question: Short, low-pressure nudge like "Open to a quick look?" or "Worth a quick look?".

---
STYLE & LENGTH REFERENCE (~90 words, 3 paragraphs — match this polish, warmth, and punch):
Subject: Quick idea re: your BDR hire
Body:
Hi Amy,

Saw on LinkedIn that The Larko Group is hiring a Business Development Associate to handle prospect research, outreach, and CRM updates — work where manual admin can quietly eat up hours that should go toward actual conversations.

I build custom AI and workflow automations, and I currently run a 30+ workflow system for one of my clients that saves their team around 40 hours a week. Seeing what your BD team is taking on, I think implementing a similar setup could pay off quickly for The Larko Group.

Happy to map out 2–3 workflows you could automate right away on a quick 15-minute chat — or send a 2-minute walkthrough if you'd rather skip a call, yours to keep either way.

Open to a quick look?`;

interface LeadRow {
  id: string;
  company: string;
  poc_name: string;
  poc_role: string;
  company_domain: string | null;
  hiring_role: string | null;
  job_location?: string | null;
  job_url: string | null;
  email: string | null;
  enrichment_id: number | null;
  sent_intro_at: string | null;
  drafted_at?: string | null;
  gmail_draft_id?: string | null;
}

interface JobPostContext {
  source: "linkedin_guest_api" | "linkedin_direct" | "unavailable";
  job_id: string | null;
  title: string | null;
  criteria: string[];
  description: string | null;
  company_site_summary: string | null;
  fetch_note: string | null;
}

interface GeneratedDraft {
  subject: string;
  greeting: string;
  paragraphs: string[];
  closing_question: string;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

function asNonEmptyString(val: unknown): string | null {
  if (typeof val !== "string") return null;
  const trimmed = val.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function extractFirstName(fullName: string): string {
  const cleaned = fullName.trim().replace(/^(dr\.?|mr\.?|mrs\.?|ms\.?)\s+/i, "");
  const first = cleaned.split(/\s+/)[0] ?? cleaned;
  return first || "there";
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function decodeHtmlEntities(html: string): string {
  return html
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_m, dec) => {
      const code = Number(dec);
      return Number.isFinite(code) ? String.fromCodePoint(code) : "";
    })
    .replace(/&#x([0-9a-f]+);/gi, (_m, hex) => {
      const code = parseInt(hex, 16);
      return Number.isFinite(code) ? String.fromCodePoint(code) : "";
    });
}

function stripHtmlToText(html: string): string {
  const withoutScripts = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ");
  const withBreaks = withoutScripts
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h[1-6]|tr|section|article)>/gi, "\n")
    .replace(/<li[^>]*>/gi, "- ");
  const stripped = decodeHtmlEntities(withBreaks.replace(/<[^>]+>/g, " "));
  return stripped
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function extractLinkedInJobId(jobUrl: string | null): string | null {
  if (!jobUrl) return null;
  const viewMatch = jobUrl.match(/jobs\/view\/(?:[^/?#]*-)?(\d{6,})/i);
  if (viewMatch) return viewMatch[1];
  const paramMatch = jobUrl.match(/currentJobId=(\d{6,})/i);
  if (paramMatch) return paramMatch[1];
  const trailingDigits = jobUrl.match(/(\d{8,})(?:[/?#]|$)/);
  return trailingDigits ? trailingDigits[1] : null;
}

function parseLinkedInGuestHtml(html: string): {
  title: string | null;
  criteria: string[];
  description: string | null;
} {
  const titleMatch =
    html.match(/<h2[^>]*top-card-layout__title[^>]*>([\s\S]*?)<\/h2>/i) ??
    html.match(/<h1[^>]*top-card-layout__title[^>]*>([\s\S]*?)<\/h1>/i);
  const title = titleMatch ? stripHtmlToText(titleMatch[1]) : null;

  const criteria: string[] = [];
  const criteriaRegex =
    /<li[^>]*description__job-criteria-item[^>]*>([\s\S]*?)<\/li>/gi;
  let cm: RegExpExecArray | null;
  while ((cm = criteriaRegex.exec(html)) !== null) {
    const subheader = cm[1].match(
      /<h3[^>]*description__job-criteria-subheader[^>]*>([\s\S]*?)<\/h3>/i,
    );
    const val = cm[1].match(
      /<span[^>]*description__job-criteria-text[^>]*>([\s\S]*?)<\/span>/i,
    );
    const label = subheader ? stripHtmlToText(subheader[1]) : "";
    const text = val ? stripHtmlToText(val[1]) : "";
    if (label && text) criteria.push(`${label}: ${text}`);
  }

  let description: string | null = null;
  const markupMatch = html.match(
    /<div[^>]*show-more-less-html__markup[^>]*>([\s\S]*?)<\/div>/i,
  );
  if (markupMatch) {
    description = stripHtmlToText(markupMatch[1]);
  } else {
    const descSection = html.match(
      /<section[^>]*description[^>]*>([\s\S]*?)<\/section>/i,
    );
    if (descSection) {
      description = stripHtmlToText(descSection[1]);
    }
  }

  if (description && description.length > 6000) {
    description = description.slice(0, 6000) + "...";
  }

  return { title, criteria, description };
}

async function fetchCompanySiteSummary(
  domain: string | null,
): Promise<string | null> {
  if (!domain) return null;
  const cleanDomain = domain
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/\/.*$/, "");
  if (!cleanDomain || !cleanDomain.includes(".")) return null;

  try {
    const res = await fetch(`https://${cleanDomain}`, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "en-US,en;q=0.9",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return null;
    const html = await res.text();
    const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    const metaDescMatch =
      html.match(
        /<meta[^>]+name=["']description["'][^>]+content=["']([\s\S]*?)["'][^>]*>/i,
      ) ??
      html.match(
        /<meta[^>]+content=["']([\s\S]*?)["'][^>]+name=["']description["'][^>]*>/i,
      );
    const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);

    const parts: string[] = [];
    if (titleMatch) parts.push(`Title: ${stripHtmlToText(titleMatch[1])}`);
    if (metaDescMatch) {
      parts.push(`Meta Description: ${decodeHtmlEntities(metaDescMatch[1]).trim()}`);
    }
    if (bodyMatch) {
      const snippet = stripHtmlToText(bodyMatch[1]).slice(0, 1200);
      if (snippet) parts.push(`Page Excerpt: ${snippet}`);
    }
    return parts.length > 0 ? parts.join("\n") : null;
  } catch {
    return null;
  }
}

async function fetchWithRetry(
  url: string,
  headers: Record<string, string>,
  attempts = 2,
): Promise<Response> {
  let lastRes: Response | null = null;
  for (let i = 0; i < attempts; i++) {
    const res = await fetch(url, {
      headers,
      redirect: "follow",
      signal: AbortSignal.timeout(12000),
    });
    if (res.ok || (res.status !== 429 && res.status < 500)) {
      return res;
    }
    lastRes = res;
    if (i < attempts - 1) {
      await new Promise((r) => setTimeout(r, 1500 * (i + 1)));
    }
  }
  return lastRes!;
}

async function fetchJobPostContext(lead: LeadRow): Promise<JobPostContext> {
  const jobId = extractLinkedInJobId(lead.job_url);
  const browserHeaders = {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    "Accept-Language": "en-US,en;q=0.9",
    Accept: "text/html,application/xhtml+xml",
  };

  let source: JobPostContext["source"] = "unavailable";
  let title: string | null = null;
  let criteria: string[] = [];
  let description: string | null = null;
  let fetchNote: string | null = null;

  if (jobId) {
    try {
      const guestUrl = `https://www.linkedin.com/jobs-guest/jobs/api/jobPosting/${jobId}`;
      const res = await fetchWithRetry(guestUrl, browserHeaders, 2);
      if (res.ok) {
        const html = await res.text();
        const parsed = parseLinkedInGuestHtml(html);
        if (parsed.description && parsed.description.length >= 80) {
          source = "linkedin_guest_api";
          title = parsed.title;
          criteria = parsed.criteria;
          description = parsed.description;
        } else {
          fetchNote = `LinkedIn guest API returned HTTP ${res.status} but description was short/empty.`;
        }
      } else {
        fetchNote = `LinkedIn guest API returned HTTP ${res.status}.`;
      }
    } catch (err) {
      fetchNote = `LinkedIn guest API fetch error: ${
        err instanceof Error ? err.message : String(err)
      }`;
    }
  }

  // Fallback: direct job_url fetch if guest API didn't yield description
  if (!description && lead.job_url) {
    try {
      const res = await fetchWithRetry(lead.job_url, browserHeaders, 2);
      if (res.ok) {
        const html = await res.text();
        const parsed = parseLinkedInGuestHtml(html);
        if (parsed.description && parsed.description.length >= 80) {
          source = "linkedin_direct";
          title = parsed.title ?? title;
          criteria = parsed.criteria.length > 0 ? parsed.criteria : criteria;
          description = parsed.description;
          fetchNote = null;
        }
      }
    } catch {
      // Keep previous fetchNote
    }
  }

  const companySiteSummary = await fetchCompanySiteSummary(lead.company_domain);

  return {
    source,
    job_id: jobId,
    title,
    criteria,
    description,
    company_site_summary: companySiteSummary,
    fetch_note: fetchNote,
  };
}

async function generateTailoredEmail(
  openaiApiKey: string,
  model: string,
  lead: LeadRow,
  jobContext: JobPostContext,
): Promise<GeneratedDraft> {
  const firstName = extractFirstName(lead.poc_name);
  const promptLines = [
    "Draft a SHORT (~75-100 words across exactly 3 casual paragraphs — half the length of the older 4-paragraph references) tailored cold intro email from a freelancer based on this lead's LinkedIn job posting.",
    "",
    "LEAD DETAILS:",
    `- POC Full Name: ${lead.poc_name}`,
    `- POC First Name: ${firstName}`,
    `- POC Role: ${lead.poc_role}`,
    `- Company: ${lead.company}`,
    `- Company Domain: ${lead.company_domain ?? "(unknown)"}`,
    `- Hiring Role: ${lead.hiring_role ?? "(unknown)"}`,
    `- Job Location: ${lead.job_location ?? "(unknown)"}`,
    `- LinkedIn Job URL: ${lead.job_url ?? "(none)"}`,
    "",
    "LINKEDIN JOB POSTING CONTENT:",
    jobContext.title ? `Posting Title: ${jobContext.title}` : "",
    jobContext.criteria.length > 0
      ? `Job Criteria:\n${jobContext.criteria.map((c) => `  - ${c}`).join("\n")}`
      : "",
    jobContext.description
      ? `Job Description:\n${jobContext.description}`
      : "(LinkedIn job description could not be fetched — rely strictly on the verified lead fields and company website summary below without inventing job details.)",
    "",
    jobContext.company_site_summary
      ? `COMPANY WEBSITE SUMMARY:\n${jobContext.company_site_summary}`
      : "",
  ]
    .filter((line) => line !== "")
    .join("\n");

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${openaiApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature: 0.6,
      messages: [
        { role: "system", content: SYSTEM_INSTRUCTION },
        { role: "user", content: promptLines },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "tailored_intro_email",
          strict: true,
          schema: DRAFT_EMAIL_JSON_SCHEMA,
        },
      },
    }),
    signal: AbortSignal.timeout(45000),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(
      `OpenAI API failed (${res.status}): ${errText.slice(0, 400)}`,
    );
  }

  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string | null; refusal?: string | null } }>;
  };
  const msg = data.choices?.[0]?.message;
  if (msg?.refusal) {
    throw new Error(`OpenAI refused request: ${msg.refusal}`);
  }
  const rawText = (msg?.content ?? "").trim();
  if (!rawText) {
    throw new Error("OpenAI returned an empty response.");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    throw new Error(`OpenAI returned invalid JSON: ${rawText.slice(0, 300)}`);
  }

  const obj = parsed as Record<string, unknown>;
  const subject = asNonEmptyString(obj.subject);
  const greeting = asNonEmptyString(obj.greeting) ?? `Hi ${firstName},`;
  const closingQuestion =
    asNonEmptyString(obj.closing_question) ?? "Worth a look?";
  const paragraphs = Array.isArray(obj.paragraphs)
    ? obj.paragraphs
        .map((p) => (typeof p === "string" ? p.trim() : ""))
        .filter(Boolean)
    : [];

  if (!subject || paragraphs.length === 0) {
    throw new Error("OpenAI JSON response was missing subject or paragraphs.");
  }

  return {
    subject,
    greeting,
    paragraphs,
    closing_question: closingQuestion,
  };
}

function buildEmailBodies(draft: GeneratedDraft): {
  htmlBody: string;
  plainBody: string;
  bodyWordCount: number;
} {
  const htmlParagraphs = draft.paragraphs
    .map((p) => escapeHtml(p).replace(/\r?\n/g, "<br>"))
    .join("<br><br>");

  const htmlBody =
    `<div dir="ltr">` +
    `${escapeHtml(draft.greeting)}<br><br>` +
    `${htmlParagraphs}<br><br>` +
    `${escapeHtml(draft.closing_question)}<br><br>` +
    `Best,<br>` +
    `${EMAIL_SIGNATURE_V4_HTML}` +
    `</div>`;

  const plainBody = [
    draft.greeting,
    "",
    ...draft.paragraphs.flatMap((p) => [p, ""]),
    draft.closing_question,
    "",
    "Best,",
    EMAIL_SIGNATURE_PLAIN,
  ].join("\n");

  const bodyWordCount = draft.paragraphs
    .join(" ")
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;

  return { htmlBody, plainBody, bodyWordCount };
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

function toBase64Utf8(str: string): string {
  return bytesToBase64(new TextEncoder().encode(str));
}

function toBase64UrlUtf8(str: string): string {
  return toBase64Utf8(str)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function wrapBase64(b64: string, lineLen = 76): string {
  const lines: string[] = [];
  for (let i = 0; i < b64.length; i += lineLen) {
    lines.push(b64.slice(i, i + lineLen));
  }
  return lines.join("\r\n");
}

function encodeMimeHeader(value: string): string {
  const clean = value.replace(/[\r\n]+/g, " ").trim();
  if (/^[\x20-\x7E]*$/.test(clean)) return clean;
  return `=?UTF-8?B?${toBase64Utf8(clean)}?=`;
}

function formatAddressHeader(name: string, email: string): string {
  const cleanName = name.replace(/[\r\n"]+/g, " ").trim();
  const cleanEmail = email.replace(/[\r\n<>]+/g, "").trim();
  if (!cleanName) return cleanEmail;
  if (/^[\x20-\x7E]*$/.test(cleanName)) {
    return `"${cleanName}" <${cleanEmail}>`;
  }
  return `${encodeMimeHeader(cleanName)} <${cleanEmail}>`;
}

function buildRawMimeMessage(params: {
  fromName: string;
  fromEmail: string;
  toName: string;
  toEmail: string;
  subject: string;
  plainBody: string;
  htmlBody: string;
}): string {
  const boundary = `alt_${crypto.randomUUID().replace(/-/g, "")}`;
  const mime = [
    `From: ${formatAddressHeader(params.fromName, params.fromEmail)}`,
    `To: ${formatAddressHeader(params.toName, params.toEmail)}`,
    `Subject: ${encodeMimeHeader(params.subject)}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    wrapBase64(toBase64Utf8(params.plainBody)),
    "",
    `--${boundary}`,
    'Content-Type: text/html; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    wrapBase64(toBase64Utf8(params.htmlBody)),
    "",
    `--${boundary}--`,
    "",
  ].join("\r\n");

  return toBase64UrlUtf8(mime);
}

async function getGmailAccessToken(
  clientId: string,
  clientSecret: string,
  refreshToken: string,
): Promise<string> {
  const form = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
    grant_type: "refresh_token",
  });

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: form.toString(),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(
      `Gmail OAuth token refresh failed (${res.status}): ${errText.slice(0, 300)}`,
    );
  }

  const data = (await res.json()) as { access_token?: string };
  if (!data.access_token) {
    throw new Error("Gmail OAuth response missing access_token.");
  }
  return data.access_token;
}

async function ensureGmailLabelId(
  accessToken: string,
  labelName: string,
): Promise<string> {
  const listRes = await fetch(
    "https://gmail.googleapis.com/gmail/v1/users/me/labels",
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    },
  );
  if (!listRes.ok) {
    const errText = await listRes.text();
    throw new Error(
      `Failed to list Gmail labels (${listRes.status}): ${errText.slice(0, 300)}`,
    );
  }

  const listJson = (await listRes.json()) as {
    labels?: Array<{ id?: string; name?: string }>;
  };
  const targetLower = labelName.trim().toLowerCase();
  const existing = (listJson.labels ?? []).find(
    (l) => typeof l.name === "string" && l.name.trim().toLowerCase() === targetLower,
  );
  if (existing?.id) return existing.id;

  // Create label if it does not exist yet
  const createRes = await fetch(
    "https://gmail.googleapis.com/gmail/v1/users/me/labels",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: labelName.trim(),
        labelListVisibility: "labelShow",
        messageListVisibility: "show",
      }),
    },
  );
  if (!createRes.ok) {
    const errText = await createRes.text();
    throw new Error(
      `Failed to create Gmail label "${labelName}" (${createRes.status}): ${errText.slice(0, 300)}`,
    );
  }
  const created = (await createRes.json()) as { id?: string };
  if (!created.id) {
    throw new Error(`Gmail label "${labelName}" created without an id.`);
  }
  return created.id;
}

async function createLabeledGmailDraft(params: {
  accessToken: string;
  labelId: string;
  rawBase64Url: string;
  existingDraftId?: string | null;
}): Promise<{ draftId: string; messageId: string; labelIds: string[]; action: "updated" | "created" }> {
  let action: "updated" | "created" = "created";
  let res: Response | null = null;

  const existingId = params.existingDraftId?.trim();
  if (existingId) {
    const updateRes = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/drafts/${encodeURIComponent(existingId)}`,
      {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${params.accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          id: existingId,
          message: {
            raw: params.rawBase64Url,
          },
        }),
      },
    );
    if (updateRes.ok) {
      res = updateRes;
      action = "updated";
    } else if (updateRes.status !== 404) {
      const errText = await updateRes.text();
      throw new Error(
        `Failed to update Gmail draft ${existingId} (${updateRes.status}): ${errText.slice(0, 300)}`,
      );
    }
  }

  if (!res) {
    res = await fetch(
      "https://gmail.googleapis.com/gmail/v1/users/me/drafts",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${params.accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: {
            raw: params.rawBase64Url,
          },
        }),
      },
    );

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(
        `Failed to create Gmail draft (${res.status}): ${errText.slice(0, 300)}`,
      );
    }
    action = "created";
  }

  const created = (await res.json()) as {
    id?: string;
    message?: { id?: string; labelIds?: string[] };
  };
  const draftId = created.id;
  const messageId = created.message?.id;
  if (!draftId || !messageId) {
    throw new Error("Gmail draft save returned missing draft id or message id.");
  }

  // Attach the custom label (e.g. sales_leads) to the draft's underlying message
  const modRes = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(messageId)}/modify`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${params.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        addLabelIds: [params.labelId],
      }),
    },
  );

  if (!modRes.ok) {
    const errText = await modRes.text();
    throw new Error(
      `Draft ${draftId} saved, but failed to attach label (${modRes.status}): ${errText.slice(0, 300)}`,
    );
  }

  const modJson = (await modRes.json()) as { labelIds?: string[] };
  return {
    draftId,
    messageId,
    labelIds: modJson.labelIds ?? [],
    action,
  };
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const openaiApiKey = Deno.env.get("OPENAI_API_KEY") ?? "";
  const gmailClientId = Deno.env.get("GMAIL_CLIENT_ID") ?? "";
  const gmailClientSecret = Deno.env.get("GMAIL_CLIENT_SECRET") ?? "";
  const gmailRefreshToken = Deno.env.get("GMAIL_REFRESH_TOKEN") ?? "";
  const gmailUserEmail =
    Deno.env.get("GMAIL_USER_EMAIL") ?? "juliennemaeanito.2026@gmail.com";

  if (req.method === "GET") {
    return jsonResponse({
      ok: true,
      function: "draft-intro-emails",
      default_table: DEFAULT_TABLE,
      allowed_tables: Array.from(ALLOWED_TABLES),
      default_model: DEFAULT_MODEL,
      default_label: DEFAULT_LABEL_NAME,
      gmail_user_email: gmailUserEmail,
      env_ready: {
        has_supabase_service_role: Boolean(supabaseUrl && serviceRoleKey),
        has_openai_api_key: Boolean(openaiApiKey),
        has_gmail_oauth: Boolean(
          gmailClientId && gmailClientSecret && gmailRefreshToken,
        ),
      },
      usage:
        "POST optional JSON { table?, limit?, leadIds?, label?, model?, dryRun?, force? }. Queries enrichment_id=1 AND sent_intro_at IS NULL (and drafted_at IS NULL unless force=true), drafts tailored emails from LinkedIn job posts via OpenAI, saves Gmail drafts under label:sales_leads, and stamps drafted_at + gmail_draft_id.",
    });
  }

  if (req.method !== "POST") {
    return jsonResponse(
      { ok: false, error: "Method not allowed. Use GET or POST." },
      405,
    );
  }

  try {
    let body: Record<string, unknown> = {};
    const rawText = await req.text();
    if (rawText.trim()) {
      try {
        const parsed = JSON.parse(rawText);
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          body = parsed as Record<string, unknown>;
        } else {
          return jsonResponse(
            { ok: false, error: "Request body must be a JSON object." },
            400,
          );
        }
      } catch {
        return jsonResponse(
          { ok: false, error: "Request body must be valid JSON." },
          400,
        );
      }
    }

    const table = asNonEmptyString(body.table) ?? DEFAULT_TABLE;
    if (!ALLOWED_TABLES.has(table)) {
      return jsonResponse(
        {
          ok: false,
          error: `Unsupported table "${table}". Allowed tables: ${Array.from(ALLOWED_TABLES).join(", ")}.`,
        },
        400,
      );
    }

    const dryRun = Boolean(body.dryRun ?? body.dry_run);
    const force = Boolean(body.force);
    const labelName = asNonEmptyString(body.label) ?? DEFAULT_LABEL_NAME;
    const model = asNonEmptyString(body.model) ?? DEFAULT_MODEL;
    const requestedLimit = Number(body.limit ?? DEFAULT_LIMIT);
    const limit = Number.isFinite(requestedLimit)
      ? Math.min(Math.max(Math.trunc(requestedLimit), 1), MAX_LIMIT)
      : DEFAULT_LIMIT;
    const leadIds = Array.isArray(body.leadIds ?? body.lead_ids)
      ? ((body.leadIds ?? body.lead_ids) as unknown[])
          .map((id) => asNonEmptyString(id))
          .filter((id): id is string => Boolean(id))
      : [];

    if (!supabaseUrl || !serviceRoleKey) {
      return jsonResponse(
        {
          ok: false,
          error: "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY runtime env.",
        },
        500,
      );
    }
    if (!openaiApiKey) {
      return jsonResponse(
        {
          ok: false,
          error:
            "Missing OPENAI_API_KEY secret in Supabase Edge Function Secrets.",
        },
        500,
      );
    }
    if (!dryRun && (!gmailClientId || !gmailClientSecret || !gmailRefreshToken)) {
      return jsonResponse(
        {
          ok: false,
          error:
            "Missing GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, or GMAIL_REFRESH_TOKEN secret.",
        },
        500,
      );
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });

    let query = supabase
      .from(table)
      .select("*")
      .eq("enrichment_id", 1)
      .is("sent_intro_at", null)
      .not("email", "is", null)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (!force) {
      query = query.is("drafted_at", null);
    }
    if (leadIds.length > 0) {
      query = query.in("id", leadIds);
    }

    const { data: leadsData, error: queryErr } = await query;
    if (queryErr) {
      return jsonResponse(
        { ok: false, error: `Database query failed: ${queryErr.message}` },
        500,
      );
    }

    const leads = (leadsData ?? []) as LeadRow[];
    if (leads.length === 0) {
      return jsonResponse({
        ok: true,
        table,
        dry_run: dryRun,
        force,
        model,
        label: labelName,
        counts: {
          queued: 0,
          drafted: 0,
          errors: 0,
        },
        drafts: [],
        errors: [],
      });
    }

    let gmailAccessToken = "";
    let gmailLabelId = "";
    if (!dryRun) {
      gmailAccessToken = await getGmailAccessToken(
        gmailClientId,
        gmailClientSecret,
        gmailRefreshToken,
      );
      gmailLabelId = await ensureGmailLabelId(gmailAccessToken, labelName);
    }

    const drafts: Record<string, unknown>[] = [];
    const errors: Array<{
      id: string;
      company: string;
      poc_name: string;
      email: string | null;
      error: string;
    }> = [];

    for (const lead of leads) {
      try {
        const recipientEmail = asNonEmptyString(lead.email);
        if (!recipientEmail) {
          throw new Error("Lead has empty email.");
        }

        const jobContext = await fetchJobPostContext(lead);
        const generated = await generateTailoredEmail(
          openaiApiKey,
          model,
          lead,
          jobContext,
        );
        const { htmlBody, plainBody, bodyWordCount } = buildEmailBodies(generated);

        if (dryRun) {
          drafts.push({
            id: lead.id,
            company: lead.company,
            poc_name: lead.poc_name,
            poc_role: lead.poc_role,
            email: recipientEmail,
            hiring_role: lead.hiring_role,
            job_context_source: jobContext.source,
            job_context_note: jobContext.fetch_note,
            subject: generated.subject,
            body_word_count: bodyWordCount,
            plain_preview: plainBody,
            html_length: htmlBody.length,
          });
          continue;
        }

        const rawBase64Url = buildRawMimeMessage({
          fromName: SENDER_DISPLAY_NAME,
          fromEmail: gmailUserEmail,
          toName: lead.poc_name,
          toEmail: recipientEmail,
          subject: generated.subject,
          plainBody,
          htmlBody,
        });

        const gmailResult = await createLabeledGmailDraft({
          accessToken: gmailAccessToken,
          labelId: gmailLabelId,
          rawBase64Url,
          existingDraftId: force ? lead.gmail_draft_id : null,
        });

        const draftedAtIso = new Date().toISOString();
        const { error: updateErr } = await supabase
          .from(table)
          .update({
            drafted_at: draftedAtIso,
            gmail_draft_id: gmailResult.draftId,
          })
          .eq("id", lead.id);

        if (updateErr) {
          throw new Error(
            `Gmail draft ${gmailResult.draftId} saved, but DB update failed: ${updateErr.message}`,
          );
        }

        drafts.push({
          id: lead.id,
          company: lead.company,
          poc_name: lead.poc_name,
          email: recipientEmail,
          hiring_role: lead.hiring_role,
          job_context_source: jobContext.source,
          subject: generated.subject,
          body_word_count: bodyWordCount,
          plain_preview: plainBody,
          gmail_draft_action: gmailResult.action,
          gmail_draft_id: gmailResult.draftId,
          gmail_message_id: gmailResult.messageId,
          label_ids: gmailResult.labelIds,
          drafted_at: draftedAtIso,
        });
      } catch (err) {
        errors.push({
          id: lead.id,
          company: lead.company,
          poc_name: lead.poc_name,
          email: lead.email,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    return jsonResponse({
      ok: errors.length === 0,
      table,
      dry_run: dryRun,
      force,
      model,
      label: labelName,
      gmail_label_id: gmailLabelId || null,
      counts: {
        queued: leads.length,
        drafted: drafts.length,
        errors: errors.length,
      },
      drafts,
      errors,
    });
  } catch (err) {
    return jsonResponse(
      {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      },
      500,
    );
  }
});
