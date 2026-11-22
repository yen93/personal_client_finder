import { createClient } from "npm:@supabase/supabase-js@2";

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const TABLE_NAME = "autodoc_customer_emails";
const DEFAULT_LABEL_NAME = "dk_leads";
const DEFAULT_MODEL = "gpt-4.1";
const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 25;
const SENDER_DISPLAY_NAME = "Julienne Mae Anito";

const FREE_WEBMAIL_DOMAINS = new Set([
  "gmail.com",
  "googlemail.com",
  "hotmail.com",
  "hotmail.dk",
  "outlook.com",
  "outlook.dk",
  "live.dk",
  "live.com",
  "yahoo.com",
  "yahoo.dk",
  "mail.dk",
  "jubii.dk",
  "ofir.dk",
  "icloud.com",
  "me.com",
  "mac.com",
  "tdcadsl.dk",
  "post.tele.dk",
  "stofanet.dk",
  "webspeed.dk",
  "privat.dk",
  "sol.dk",
  "msn.com",
  "ymail.com",
  "protonmail.com",
]);

const GENERIC_INBOX_PREFIXES = new Set([
  "info",
  "mail",
  "contact",
  "kontakt",
  "hello",
  "hej",
  "hi",
  "office",
  "admin",
  "administration",
  "sales",
  "salg",
  "support",
  "service",
  "servicedesk",
  "helpdesk",
  "it",
  "itsupport",
  "drift",
  "post",
  "kundeservice",
  "bogholderi",
  "regnskab",
  "faktura",
  "invoice",
  "finance",
  "okonomi",
  "hr",
  "jobs",
  "job",
  "marketing",
  "press",
  "presse",
  "webmaster",
  "reception",
  "booking",
  "order",
  "ordre",
  "warehouse",
  "lager",
  "hotline",
  "team",
]);

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
        "Short, natural cold email subject line (4-8 words), e.g. 'Quick idea for Eldan Recycling' or 'Quick automation idea for VisitHerning'. No emojis, no exclamation marks, no clickbait.",
    },
    greeting: {
      type: "string",
      description:
        "Greeting line matching the provided greeting hint, e.g. 'Hi Morten,' or 'Hi there,'. Never use email initials like 'Hi Mg,' or generic prefixes like 'Hi Info,'.",
    },
    paragraphs: {
      type: "array",
      items: { type: "string" },
      description:
        "Exactly 3 concise plain-text body paragraphs (~75-100 words TOTAL across all 3 paragraphs — roughly half the length of the 4 reference emails). No HTML, no greeting, no sign-off, no URLs.",
    },
    closing_question: {
      type: "string",
      description: "Short closing nudge line, typically 'Worth a look?'.",
    },
    inferred_industry: {
      type: "string",
      description:
        "Concise 2-5 word industry label for the company based on its website and name (e.g., 'Industrial Recycling Equipment', 'Tourism & Destination Marketing', 'Fashion Retail', 'Wine & Spirits Retail'). Empty string if genuinely unknown.",
    },
  },
  required: [
    "subject",
    "greeting",
    "paragraphs",
    "closing_question",
    "inferred_industry",
  ],
};

const SYSTEM_INSTRUCTION = `You are writing cold intro emails on behalf of Julienne Mae Anito, an AI & Business Automation Consultant.
Your job is to mirror the exact voice, warmth, punctuation, and consultative style of Julienne's manually sent reference emails below — tailored specifically to each company's nature of business — while keeping every email MUCH SHORTER: **about half the length of the reference emails (~75–100 words total across 3 crisp paragraphs)**.

CRITICAL RULES:
1. LENGTH IS STRICT: The reference emails below are ~165–190 words across 4 paragraphs. Your email MUST be **about half that length: ~75–100 words total across exactly 3 tight paragraphs** (1–2 short sentences per paragraph). Cut filler ruthlessly while keeping Julienne's warm, human, consultative tone.
2. TAILOR TO THE COMPANY'S NATURE OF BUSINESS (NOT A JOB POST) WITH A NATURAL DISCOVERY HOOK: Unlike the reference emails, these leads are NOT from LinkedIn job posts — do NOT mention seeing a job listing or hiring on LinkedIn. Instead, open Paragraph 1 with a warm, natural discovery hook explaining how you found them while looking into companies across Europe (or Northern Europe / their sector in Europe), then tie immediately into what they actually do — grounded strictly in the provided website summary, industry, and company name. Vary the opener naturally across emails (e.g., "I've been looking into growing companies across Europe and found [Company] — really liked seeing your work in...", "I've been researching [sector] businesses across Europe and came across [Company]...", or "I've been looking into standout teams across Northern Europe and came across [Company]..."). NEVER fabricate products, tools, clients, or facts not supported by the provided context. If website context is unavailable, keep Paragraph 1 cleanly grounded in the company name and known facts without inventing specifics.
3. STRUCTURE (3 short paragraphs):
   - Paragraph 1 (1–2 sentences): Warm discovery hook ("been looking into companies across Europe...") + specific tie-in to the company's nature of business and the repetitive behind-the-scenes ops/admin/sales follow-up friction typical of that business (e.g., lead/quote follow-ups, partner/supplier coordination, order/inquiry triage, CRM hygiene, recurring reporting).
   - Paragraph 2 (1–2 sentences): Concise statement of what Julienne builds + her real proof point: "a 30+ workflow system for a travel & adventure company that saves their team around 40 hours a week" (without adding extra admin headcount).
   - Paragraph 3 (1 sentence): Soft, low-pressure CTA offering a quick 15-minute chat to share 2–3 practical workflows tailored to their ops ("No pitch — you'll get a few useful ideas either way."). If the provided greeting hint indicates a generic/team inbox or unknown role, you may append a brief, polite routing note like "(Happy to be pointed to whoever handles ops or sales if that's not you.)" while staying within the ~75–100 word target.
4. GREETING: Follow the provided Greeting Hint strictly. If a clear first name was extracted (e.g. Morten, Anders, Claus), use "Hi Morten,". If the email is initials (like mg@, vh@, tdc@) or generic (like info@, salg@, kontakt@), use "Hi there," or "Hi [Short Company Name] team," — NEVER greet someone as "Hi Mg," or "Hi Info,".
5. CLEAN COMPANY NAME IN COPY: Drop legal suffixes like "A/S", "ApS", "I/S", "K/S", "P/S" when referring to the company naturally in prose and subject lines (e.g. "Eldan Recycling" instead of "Eldan Recycling A/S").
6. STYLE & PUNCTUATION: Plain text only inside JSON fields (no HTML, no markdown, no bullet lists, no URLs). Use spaced em-dashes (" — ") and en-dashes ("2–3") matching Julienne's voice. Write in natural English even when the company's website excerpt is in Danish.
7. NO SIGNATURE/FOOTER: Do NOT include a signature, email address, website, Calendly link, or opt-out footer — those are appended separately.
8. SUBJECT LINE: Short, natural, lowercase-friendly title style (4–8 words), e.g., "Quick idea for Eldan Recycling" or "Quick automation idea for VisitHerning". No emojis, no exclamation marks, no hype.
9. closing_question should be "Worth a look?".

---
REFERENCE EMAILS (MIRROR THIS VOICE & TONE — BUT WRITE AT HALF THIS LENGTH):

REFERENCE EMAIL 1 (~185 words — your output should be ~half this length)
Subject: Quick idea re: your Sr. BDR hire at ResQ
Body:
Hi Amanda,

I saw on LinkedIn that ResQ is hiring a Sr. Business Development Representative in New York to help grow your pipeline across restaurants and commercial facilities teams — especially the note about hitting 60–100 outbound activities a day and experimenting with new ways to generate meetings.

I help growing teams automate the repetitive side of outbound and sales ops — finding and enriching target accounts, running staged email follow-ups so warm leads never slip, keeping the CRM clean automatically, and compiling daily pipeline summaries. I currently run a 30+ workflow system like this for a travel & adventure company that saves their team around 40 hours a week.

For a high-output team like ResQ's, automating the list-building, follow-up chasing, and CRM updates lets your BDRs spend their day actually talking to restaurant and facilities managers instead of doing manual busywork — and helps you scale pipeline without adding extra admin headcount.

Would it be worth a quick 15-minute chat where I share 2–3 specific workflows that could take the repetitive prospecting and CRM load off your BDR team? (And if someone on your sales or RevOps side owns this, I'd really appreciate being pointed their way.)

Worth a look?

---
REFERENCE EMAIL 2 (~165 words — your output should be ~half this length)
Subject: Quick idea re: your North Sydney SDR hire
Body:
Hi Jamie,

I saw on LinkedIn that WOW Recruitment is hiring an SDR in North Sydney focused on outbound lead generation, booking meetings for senior AEs, and managing outreach, follow-ups, and CRM data hygiene.

I loved your note about keeping recruitment human and personal — and usually the biggest thing getting in the way of that is all the repetitive admin behind the scenes: building prospect lists, chasing multi-step follow-ups, cleaning up bounced contacts, keeping the CRM synced, and putting together pipeline reports.

I build custom automations that take that manual work completely off a team's plate. I currently run a 30+ workflow system for my clients that handles daily prospecting, never-cold follow-up sequences, self-updating CRM hygiene, reply/bounce triage, and automated reporting — saving them around 40 hours a week without hiring extra admin staff.

Whether you're bringing on a new SDR or looking to multiply your current team's output, I'd love to offer a free 15-minute chat where I point out 2–3 specific outbound and CRM workflows WOW could automate quickly. No pitch — you'll get a few useful ideas either way.

Worth a look?

---
REFERENCE EMAIL 3 (~180 words — your output should be ~half this length)
Subject: Quick idea for SuitePad's U.S. outbound engine
Body:
Hi Nikita,

I saw on LinkedIn that SuitePad is hiring one of your first U.S.-based SDRs in Florida to build out your U.S. hospitality pipeline from the ground up — researching hotels, resorts, and hospitality management groups, running outbound campaigns, and maintaining CRM hygiene.

I build custom sales and back-office automations that take that repetitive legwork off a lean GTM team's plate: automated account discovery, multi-step email follow-ups so prospects never go cold, self-updating CRM hygiene, bounce/reply triage, and automated daily pipeline reporting. I run a 30+ workflow system like this for a travel & adventure company that saves them roughly 40 hours a week on sales admin and follow-ups.

Since you're scaling into the U.S. hospitality market right now, pairing your first U.S. SDR with an automated prospecting and CRM-hygiene backbone could save them hours every week and keep your HubSpot/Salesforce data spotless from day one — without needing extra ops headcount.

Would you be open to a quick 15-minute call where I map out 2–3 quick-win automations tailored to SuitePad's U.S. outbound rollout? No pitch — you'll walk away with a few concrete ideas either way.

Worth a look?

---
REFERENCE EMAIL 4 (~165 words — your output should be ~half this length)
Subject: Quick idea for Homeland Talent Solutions
Body:
Hi Tiffany,

I came across Homeland Talent Solutions' Business Development Representative listing on LinkedIn and read more about how you're scaling Homeland as a high-touch boutique recruiting firm across IT, Engineering, and Executive search.

In boutique recruiting, keeping that personal, client-focused approach usually means the team gets buried in repetitive behind-the-scenes work — researching target hiring companies, chasing follow-ups so warm accounts don't go cold, updating CRM records, and pulling weekly pipeline reports.

I build custom automations that run that repetitive back-office and outbound work in the background. Right now I run a 30+ workflow system for a travel & adventure company that handles daily lead sourcing, staged email follow-ups, CRM syncing, reply/bounce triage, and automated reporting — saving them around 40 hours a week without adding admin headcount.

Would it be worth a quick 15-minute chat where I point out 2–3 manual workflows inside Homeland's prospecting, follow-up, or reporting ops that are easy to automate? No pitch — just practical ideas you can keep either way.

Worth a look?`;

interface DkLeadRow {
  id: number;
  auto_doc_asset_id: number;
  nav_customer_id: string;
  name: string;
  email: string | null;
  silo_name: string;
  approx_employee_count: number | null;
  industry: string | null;
  drafted_at: string | null;
  gmail_draft_id: string | null;
}

interface CompanyContext {
  domain: string | null;
  source: "website_https" | "website_www" | "unavailable";
  title: string | null;
  meta_description: string | null;
  excerpt: string | null;
  fetch_note: string | null;
}

interface GeneratedDraft {
  subject: string;
  greeting: string;
  paragraphs: string[];
  closing_question: string;
  inferred_industry: string | null;
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

function stripLegalSuffix(companyName: string): string {
  return companyName
    .replace(
      /\b(a\/s|aps|i\/s|k\/s|p\/s|a\.m\.b\.a|f\.m\.b\.a|s\/i|ab|as|gmbh|ltd|inc|llc|aktieselskab|anpartsselskab|partnerselskab)\b\.?/gi,
      "",
    )
    .replace(/\s{2,}/g, " ")
    .replace(/[\s,\-]+$/, "")
    .trim();
}

function extractCorporateDomain(email: string | null): string | null {
  if (!email || !email.includes("@")) return null;
  const dom = email.split("@").pop()?.trim().toLowerCase() ?? "";
  if (!dom || !dom.includes(".") || FREE_WEBMAIL_DOMAINS.has(dom)) return null;
  return dom;
}

function capitalizeWord(word: string): string {
  if (!word) return "";
  return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
}

function deriveGreetingHint(
  email: string,
  companyName: string,
): {
  greeting: string;
  toDisplayName: string;
  isGenericOrUnknown: boolean;
} {
  const shortCompany = stripLegalSuffix(companyName) || companyName.trim();
  const local = (email.split("@")[0] ?? "").trim().toLowerCase();

  if (!local || GENERIC_INBOX_PREFIXES.has(local)) {
    return {
      greeting: `Hi ${shortCompany} team,`,
      toDisplayName: shortCompany,
      isGenericOrUnknown: true,
    };
  }

  // Split by dot, underscore, or hyphen (e.g., anders.lindberg, jan_andersen)
  const parts = local.split(/[._\-]+/).filter(Boolean);
  const first = parts[0] ?? "";

  // Check if first token looks like a genuine personal first name (not initials like "mg", "vh", "tdc", "c", "lvi")
  // Rules: letters only (including Danish æøå), length >= 4 (or common 3-letter Nordic names), and not a generic prefix
  const commonShortNames = new Set([
    "jan",
    "ole",
    "per",
    "kim",
    "tom",
    "jon",
    "dan",
    "ben",
    "max",
    "tim",
    "sam",
    "joe",
    "bob",
    "jim",
    "rob",
    "ken",
    "kai",
    "pia",
    "mia",
    "eva",
    "ida",
    "lea",
    "liv",
    "ada",
    "ann",
    "amy",
    "sue",
    "may",
    "lis",
    "maj",
    "siv",
    "tor",
    "kaj",
    "stig",
  ]);
  const isLettersOnly = /^[a-zæøåäöü]+$/i.test(first);
  const hasVowel = /[aeiouyæøåäöü]/i.test(first);
  const looksLikeFirstName =
    isLettersOnly &&
    hasVowel &&
    !GENERIC_INBOX_PREFIXES.has(first) &&
    (first.length >= 4 || commonShortNames.has(first));

  // Avoid mistaking a company-name local part (e.g. eldan@eldan.dk) for a human first name
  const compLower = shortCompany.toLowerCase();
  const matchesCompanyWord =
    first.length >= 4 &&
    compLower.split(/\s+/).some((w) => w.toLowerCase() === first);

  if (looksLikeFirstName && !matchesCompanyWord) {
    const capFirst = capitalizeWord(first);
    const fullName =
      parts.length >= 2 && /^[a-zæøåäöü]{2,}$/i.test(parts[1])
        ? `${capFirst} ${capitalizeWord(parts[1])}`
        : capFirst;
    return {
      greeting: `Hi ${capFirst},`,
      toDisplayName: fullName,
      isGenericOrUnknown: false,
    };
  }

  // Initials (mg@, vh@, tdc@, c.hansen@) or ambiguous handle -> safe neutral greeting
  return {
    greeting: "Hi there,",
    toDisplayName: shortCompany,
    isGenericOrUnknown: true,
  };
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
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<svg[\s\S]*?<\/svg>/gi, " ");
  const withBreaks = withoutScripts
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h[1-6]|tr|section|article)>/gi, "\n");
  const stripped = decodeHtmlEntities(withBreaks.replace(/<[^>]+>/g, " "));
  return stripped
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function parseHomepageHtml(html: string): {
  title: string | null;
  metaDescription: string | null;
  excerpt: string | null;
} {
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const metaDescMatch =
    html.match(
      /<meta[^>]+name=["']description["'][^>]+content=["']([\s\S]*?)["'][^>]*>/i,
    ) ??
    html.match(
      /<meta[^>]+content=["']([\s\S]*?)["'][^>]+name=["']description["'][^>]*>/i,
    ) ??
    html.match(
      /<meta[^>]+property=["']og:description["'][^>]+content=["']([\s\S]*?)["'][^>]*>/i,
    ) ??
    html.match(
      /<meta[^>]+content=["']([\s\S]*?)["'][^>]+property=["']og:description["'][^>]*>/i,
    );
  const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);

  const title = titleMatch ? stripHtmlToText(titleMatch[1]).slice(0, 200) : null;
  const metaDescription = metaDescMatch
    ? decodeHtmlEntities(metaDescMatch[1]).trim().slice(0, 400)
    : null;
  const excerpt = bodyMatch
    ? stripHtmlToText(bodyMatch[1]).slice(0, 1800) || null
    : null;

  return { title, metaDescription, excerpt };
}

async function fetchCompanyContext(email: string | null): Promise<CompanyContext> {
  const domain = extractCorporateDomain(email);
  if (!domain) {
    return {
      domain: null,
      source: "unavailable",
      title: null,
      meta_description: null,
      excerpt: null,
      fetch_note: "No corporate email domain available.",
    };
  }

  const headers = {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    Accept: "text/html,application/xhtml+xml",
    "Accept-Language": "en-US,en;q=0.9,da;q=0.8",
  };

  const candidates: Array<{ url: string; source: CompanyContext["source"] }> = [
    { url: `https://${domain}`, source: "website_https" },
    { url: `https://www.${domain}`, source: "website_www" },
  ];

  let lastNote = "Website unreachable.";
  for (const cand of candidates) {
    try {
      const res = await fetch(cand.url, {
        headers,
        redirect: "follow",
        signal: AbortSignal.timeout(7000),
      });
      if (!res.ok) {
        lastNote = `${cand.url} returned HTTP ${res.status}.`;
        continue;
      }
      const contentType = (res.headers.get("content-type") ?? "").toLowerCase();
      if (contentType && !contentType.includes("text/html") && !contentType.includes("application/xhtml")) {
        lastNote = `${cand.url} returned non-HTML content (${contentType}).`;
        continue;
      }
      const html = await res.text();
      const parsed = parseHomepageHtml(html);
      if (parsed.title || parsed.metaDescription || (parsed.excerpt && parsed.excerpt.length >= 60)) {
        return {
          domain,
          source: cand.source,
          title: parsed.title,
          meta_description: parsed.metaDescription,
          excerpt: parsed.excerpt,
          fetch_note: null,
        };
      }
      lastNote = `${cand.url} returned minimal HTML content.`;
    } catch (err) {
      lastNote = `${cand.url} fetch error: ${err instanceof Error ? err.message : String(err)}`;
    }
  }

  return {
    domain,
    source: "unavailable",
    title: null,
    meta_description: null,
    excerpt: null,
    fetch_note: lastNote,
  };
}

async function generateTailoredDkEmail(
  openaiApiKey: string,
  model: string,
  lead: DkLeadRow,
  companyContext: CompanyContext,
  greetingHint: { greeting: string; isGenericOrUnknown: boolean },
): Promise<GeneratedDraft> {
  const shortCompany = stripLegalSuffix(lead.name) || lead.name;
  const promptLines = [
    "Draft a SHORT (~75-100 words across exactly 3 concise paragraphs — about half the length of the 4 reference emails) tailored cold intro email in English based on this company's nature of business.",
    "",
    "COMPANY & RECIPIENT DETAILS:",
    `- Company Legal Name: ${lead.name}`,
    `- Short Company Name (use naturally in prose/subject): ${shortCompany}`,
    `- Recipient Email: ${lead.email ?? "(none)"}`,
    `- Greeting Hint (follow this): ${greetingHint.greeting}`,
    `- Generic / Unknown-Role Recipient: ${greetingHint.isGenericOrUnknown ? "Yes (may add a very short polite routing note at end of Paragraph 3)" : "No"}`,
    `- Approx Employee Count: ${lead.approx_employee_count !== null ? String(lead.approx_employee_count) : "(unknown)"}`,
    `- Known Industry: ${lead.industry ?? "(unknown — infer concisely from website/name)"}`,
    `- Website Domain: ${companyContext.domain ?? "(unknown)"}`,
    "",
    "COMPANY WEBSITE CONTEXT (may be in Danish or English — read and write the email in natural English):",
    companyContext.title ? `Title: ${companyContext.title}` : "",
    companyContext.meta_description
      ? `Meta Description: ${companyContext.meta_description}`
      : "",
    companyContext.excerpt
      ? `Page Excerpt:\n${companyContext.excerpt}`
      : "(Website could not be fetched — rely strictly on the verified company name, domain, employee count, and known industry without fabricating details.)",
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
          name: "tailored_dk_intro_email",
          strict: true,
          schema: DRAFT_EMAIL_JSON_SCHEMA,
        },
      },
    }),
    signal: AbortSignal.timeout(45000),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`OpenAI API failed (${res.status}): ${errText.slice(0, 400)}`);
  }

  const data = (await res.json()) as {
    choices?: Array<{
      message?: { content?: string | null; refusal?: string | null };
    }>;
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
  const greeting = asNonEmptyString(obj.greeting) ?? greetingHint.greeting;
  const closingQuestion =
    asNonEmptyString(obj.closing_question) ?? "Worth a look?";
  const inferredIndustry = asNonEmptyString(obj.inferred_industry);
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
    inferred_industry: inferredIndustry,
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
    (l) =>
      typeof l.name === "string" && l.name.trim().toLowerCase() === targetLower,
  );
  if (existing?.id) return existing.id;

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
}): Promise<{ draftId: string; messageId: string; labelIds: string[] }> {
  const createRes = await fetch(
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

  if (!createRes.ok) {
    const errText = await createRes.text();
    throw new Error(
      `Failed to create Gmail draft (${createRes.status}): ${errText.slice(0, 300)}`,
    );
  }

  const created = (await createRes.json()) as {
    id?: string;
    message?: { id?: string; labelIds?: string[] };
  };
  const draftId = created.id;
  const messageId = created.message?.id;
  if (!draftId || !messageId) {
    throw new Error(
      "Gmail draft creation returned missing draft id or message id.",
    );
  }

  // Attach custom label (e.g. sales_leads) to the draft's underlying message
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
      `Draft ${draftId} created, but failed to attach label (${modRes.status}): ${errText.slice(0, 300)}`,
    );
  }

  const modJson = (await modRes.json()) as { labelIds?: string[] };
  return {
    draftId,
    messageId,
    labelIds: modJson.labelIds ?? [],
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
    let queueStats: Record<string, number> | null = null;
    if (supabaseUrl && serviceRoleKey) {
      const sb = createClient(supabaseUrl, serviceRoleKey, {
        auth: { persistSession: false },
      });
      const [{ count: total }, { count: ready }, { count: drafted }] =
        await Promise.all([
          sb.from(TABLE_NAME).select("*", { count: "exact", head: true }),
          sb
            .from(TABLE_NAME)
            .select("*", { count: "exact", head: true })
            .not("email", "is", null)
            .is("drafted_at", null),
          sb
            .from(TABLE_NAME)
            .select("*", { count: "exact", head: true })
            .not("drafted_at", "is", null),
        ]);
      queueStats = {
        total_rows: total ?? 0,
        ready_with_email_undrafted: ready ?? 0,
        already_drafted: drafted ?? 0,
      };
    }

    return jsonResponse({
      ok: true,
      function: "draft-intro-emails-dk",
      table: TABLE_NAME,
      default_model: DEFAULT_MODEL,
      default_label: DEFAULT_LABEL_NAME,
      default_limit: DEFAULT_LIMIT,
      max_limit: MAX_LIMIT,
      gmail_user_email: gmailUserEmail,
      queue_stats: queueStats,
      env_ready: {
        has_supabase_service_role: Boolean(supabaseUrl && serviceRoleKey),
        has_openai_api_key: Boolean(openaiApiKey),
        has_gmail_oauth: Boolean(
          gmailClientId && gmailClientSecret && gmailRefreshToken,
        ),
      },
      usage:
        "POST optional JSON { limit?, leadIds?, minEmployees?, maxEmployees?, onlyEnriched?, label?, model?, dryRun?, force? }. Queries public.autodoc_customer_emails WHERE drafted_at IS NULL AND email IS NOT NULL, fetches company homepage context, drafts concise (~half-length) intro emails via OpenAI, saves Gmail drafts under label:dk_leads, and stamps drafted_at + gmail_draft_id (plus industry if null).",
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

    const dryRun = Boolean(body.dryRun ?? body.dry_run);
    const force = Boolean(body.force);
    const onlyEnriched = Boolean(body.onlyEnriched ?? body.only_enriched);
    const labelName = asNonEmptyString(body.label) ?? DEFAULT_LABEL_NAME;
    const model = asNonEmptyString(body.model) ?? DEFAULT_MODEL;
    const requestedLimit = Number(body.limit ?? DEFAULT_LIMIT);
    const limit = Number.isFinite(requestedLimit)
      ? Math.min(Math.max(Math.trunc(requestedLimit), 1), MAX_LIMIT)
      : DEFAULT_LIMIT;

    const minEmployees =
      body.minEmployees !== undefined && Number.isFinite(Number(body.minEmployees))
        ? Number(body.minEmployees)
        : null;
    const maxEmployees =
      body.maxEmployees !== undefined && Number.isFinite(Number(body.maxEmployees))
        ? Number(body.maxEmployees)
        : null;

    const leadIds = Array.isArray(body.leadIds ?? body.lead_ids)
      ? ((body.leadIds ?? body.lead_ids) as unknown[])
          .map((id) => Number(id))
          .filter((id) => Number.isFinite(id) && id > 0)
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
      .from(TABLE_NAME)
      .select("*")
      .not("email", "is", null)
      .order("id", { ascending: true })
      .limit(limit);

    if (!force) {
      query = query.is("drafted_at", null);
    }
    if (leadIds.length > 0) {
      query = query.in("id", leadIds);
    }
    if (onlyEnriched) {
      query = query.not("approx_employee_count", "is", null);
    }
    if (minEmployees !== null) {
      query = query.gte("approx_employee_count", minEmployees);
    }
    if (maxEmployees !== null) {
      query = query.lte("approx_employee_count", maxEmployees);
    }

    const { data: leadsData, error: queryErr } = await query;
    if (queryErr) {
      return jsonResponse(
        { ok: false, error: `Database query failed: ${queryErr.message}` },
        500,
      );
    }

    const leads = (leadsData ?? []) as DkLeadRow[];
    if (leads.length === 0) {
      return jsonResponse({
        ok: true,
        table: TABLE_NAME,
        dry_run: dryRun,
        force,
        model,
        label: labelName,
        counts: { queued: 0, drafted: 0, errors: 0 },
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
      id: number;
      name: string;
      email: string | null;
      error: string;
    }> = [];

    for (const lead of leads) {
      try {
        const recipientEmail = asNonEmptyString(lead.email);
        if (!recipientEmail) {
          throw new Error("Lead has empty email.");
        }

        const companyContext = await fetchCompanyContext(recipientEmail);
        const greetingHint = deriveGreetingHint(recipientEmail, lead.name);
        const generated = await generateTailoredDkEmail(
          openaiApiKey,
          model,
          lead,
          companyContext,
          greetingHint,
        );
        const { htmlBody, plainBody, bodyWordCount } =
          buildEmailBodies(generated);

        if (dryRun) {
          drafts.push({
            id: lead.id,
            name: lead.name,
            email: recipientEmail,
            approx_employee_count: lead.approx_employee_count,
            website_context_source: companyContext.source,
            website_domain: companyContext.domain,
            website_note: companyContext.fetch_note,
            inferred_industry: generated.inferred_industry,
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
          toName: greetingHint.toDisplayName,
          toEmail: recipientEmail,
          subject: generated.subject,
          plainBody,
          htmlBody,
        });

        const gmailResult = await createLabeledGmailDraft({
          accessToken: gmailAccessToken,
          labelId: gmailLabelId,
          rawBase64Url,
        });

        const draftedAtIso = new Date().toISOString();
        const updatePayload: Record<string, unknown> = {
          drafted_at: draftedAtIso,
          gmail_draft_id: gmailResult.draftId,
        };
        if (!lead.industry && generated.inferred_industry) {
          updatePayload.industry = generated.inferred_industry;
        }

        const { error: updateErr } = await supabase
          .from(TABLE_NAME)
          .update(updatePayload)
          .eq("id", lead.id);

        if (updateErr) {
          throw new Error(
            `Gmail draft ${gmailResult.draftId} created, but DB update failed: ${updateErr.message}`,
          );
        }

        drafts.push({
          id: lead.id,
          name: lead.name,
          email: recipientEmail,
          approx_employee_count: lead.approx_employee_count,
          website_context_source: companyContext.source,
          inferred_industry: generated.inferred_industry,
          subject: generated.subject,
          body_word_count: bodyWordCount,
          plain_preview: plainBody,
          gmail_draft_id: gmailResult.draftId,
          gmail_message_id: gmailResult.messageId,
          label_ids: gmailResult.labelIds,
          drafted_at: draftedAtIso,
        });
      } catch (err) {
        errors.push({
          id: lead.id,
          name: lead.name,
          email: lead.email,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    return jsonResponse({
      ok: errors.length === 0,
      table: TABLE_NAME,
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
