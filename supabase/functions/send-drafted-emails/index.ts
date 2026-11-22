import { createClient } from "npm:@supabase/supabase-js@2";

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const DEFAULT_LABEL_NAME = "sales_leads";
const DEFAULT_BOUNCED_LABEL_NAME = "bounced_leads";
const DEFAULT_LIMIT = 5;
const MAX_LIMIT = 20;
const DEFAULT_DELAY_MS = 2000;
const MAX_DELAY_MS = 15000;
const DEFAULT_BOUNCE_CHECK_DELAY_MS = 10000;
const MAX_BOUNCE_CHECK_DELAY_MS = 30000;

// Lookup IDs matching public.status
const STATUS_INTRO_SENT = 4;
const STATUS_LEAD_RESPONDED = 5;
const STATUS_INTRO_BOUNCED = 6;

const SYNC_TABLES = [
  "us_sales_hiring_leads",
  "au_hiring_signal_leads",
] as const;

interface DraftMetadata {
  draftId: string;
  messageId: string;
  labelIds: string[];
  to: string | null;
  toEmail: string | null;
  subject: string | null;
  snippet: string | null;
}

interface MatchedDbRow {
  table: string;
  id: string;
  company: string | null;
  poc_name: string | null;
  email: string | null;
  sent_intro_at: string | null;
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

function extractEmailAddress(headerValue: string | null): string | null {
  if (!headerValue) return null;
  const angle = headerValue.match(/<([^<>\s]+@[^<>\s]+)>/);
  if (angle) return angle[1].trim().toLowerCase();
  const bare = headerValue.match(/([A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,})/);
  return bare ? bare[1].trim().toLowerCase() : null;
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

async function resolveGmailLabelId(
  accessToken: string,
  labelName: string,
): Promise<string | null> {
  const res = await fetch(
    "https://gmail.googleapis.com/gmail/v1/users/me/labels",
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    },
  );
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(
      `Failed to list Gmail labels (${res.status}): ${errText.slice(0, 300)}`,
    );
  }
  const data = (await res.json()) as {
    labels?: Array<{ id?: string; name?: string }>;
  };
  const targetLower = labelName.trim().toLowerCase();
  const match = (data.labels ?? []).find(
    (l) =>
      typeof l.name === "string" && l.name.trim().toLowerCase() === targetLower,
  );
  return match?.id ?? null;
}

async function ensureGmailLabelId(
  accessToken: string,
  labelName: string,
): Promise<string> {
  const existing = await resolveGmailLabelId(accessToken, labelName);
  if (existing) return existing;

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

async function transferBouncedThreadLabel(params: {
  accessToken: string;
  threadId: string | null;
  matchedMessageId: string | null;
  bouncedLabelId: string;
  removeLabelId: string | null;
}): Promise<{ transferred: boolean; error: string | null }> {
  const body: Record<string, unknown> = {
    addLabelIds: [params.bouncedLabelId],
  };
  if (params.removeLabelId && params.removeLabelId !== params.bouncedLabelId) {
    body.removeLabelIds = [params.removeLabelId];
  }

  let transferred = false;
  let lastError: string | null = null;

  if (params.threadId) {
    const res = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/threads/${encodeURIComponent(params.threadId)}/modify`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${params.accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      },
    );
    if (res.ok) {
      transferred = true;
    } else {
      lastError = `Thread ${params.threadId} modify failed (${res.status}): ${(await res.text()).slice(0, 200)}`;
    }
  }

  // Also ensure the matched DSN message itself carries bounced_leads (if it arrived in a separate thread)
  if (params.matchedMessageId) {
    const msgRes = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(params.matchedMessageId)}/modify`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${params.accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ addLabelIds: [params.bouncedLabelId] }),
      },
    );
    if (msgRes.ok && !params.threadId) {
      transferred = true;
    }
  }

  return { transferred, error: lastError };
}

async function listLabeledDrafts(params: {
  accessToken: string;
  labelName: string;
  labelId: string;
  filterDraftIds?: Set<string>;
  maxScan?: number;
}): Promise<DraftMetadata[]> {
  const maxScan = params.maxScan ?? 100;
  const query = encodeURIComponent(`label:${params.labelName}`);
  const listRes = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/drafts?q=${query}&maxResults=${maxScan}`,
    {
      headers: { Authorization: `Bearer ${params.accessToken}` },
    },
  );
  if (!listRes.ok) {
    const errText = await listRes.text();
    throw new Error(
      `Failed to list Gmail drafts (${listRes.status}): ${errText.slice(0, 300)}`,
    );
  }

  const listJson = (await listRes.json()) as {
    drafts?: Array<{ id?: string; message?: { id?: string } }>;
  };
  const rawDrafts = (listJson.drafts ?? []).filter(
    (d): d is { id: string; message?: { id?: string } } =>
      typeof d.id === "string" && d.id.length > 0,
  );

  const results: DraftMetadata[] = [];
  for (const d of rawDrafts) {
    if (params.filterDraftIds && params.filterDraftIds.size > 0 && !params.filterDraftIds.has(d.id)) {
      continue;
    }
    const detailUrl =
      `https://gmail.googleapis.com/gmail/v1/users/me/drafts/${encodeURIComponent(d.id)}` +
      `?format=metadata&metadataHeaders=To&metadataHeaders=Subject`;
    const detailRes = await fetch(detailUrl, {
      headers: { Authorization: `Bearer ${params.accessToken}` },
    });
    if (!detailRes.ok) continue;

    const detail = (await detailRes.json()) as {
      id?: string;
      message?: {
        id?: string;
        labelIds?: string[];
        snippet?: string;
        payload?: { headers?: Array<{ name?: string; value?: string }> };
      };
    };

    const labelIds = detail.message?.labelIds ?? [];
    // Double-verify the draft actually carries both DRAFT and the exact target labelId
    if (!labelIds.includes(params.labelId)) continue;

    const headers = detail.message?.payload?.headers ?? [];
    const getHeader = (name: string) =>
      headers.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value ??
      null;

    const toHeader = getHeader("To");
    const subjectHeader = getHeader("Subject");

    results.push({
      draftId: detail.id ?? d.id,
      messageId: detail.message?.id ?? d.message?.id ?? "",
      labelIds,
      to: toHeader,
      toEmail: extractEmailAddress(toHeader),
      subject: subjectHeader,
      snippet: detail.message?.snippet ?? null,
    });
  }

  return results;
}

async function sendGmailDraft(params: {
  accessToken: string;
  draftId: string;
  labelId: string;
}): Promise<{ sentMessageId: string; threadId: string | null; labelIds: string[] }> {
  const res = await fetch(
    "https://gmail.googleapis.com/gmail/v1/users/me/drafts/send",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${params.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        id: params.draftId,
      }),
    },
  );
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(
      `Failed to send Gmail draft ${params.draftId} (${res.status}): ${errText.slice(0, 300)}`,
    );
  }

  const sent = (await res.json()) as {
    id?: string;
    threadId?: string;
    labelIds?: string[];
  };
  const sentMessageId = sent.id;
  if (!sentMessageId) {
    throw new Error(`Gmail drafts.send for ${params.draftId} returned no message id.`);
  }

  let finalLabelIds = sent.labelIds ?? [];
  // Ensure the custom label stays attached on the sent message
  if (!finalLabelIds.includes(params.labelId)) {
    const modRes = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(sentMessageId)}/modify`,
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
    if (modRes.ok) {
      const modJson = (await modRes.json()) as { labelIds?: string[] };
      finalLabelIds = modJson.labelIds ?? finalLabelIds;
    }
  }

  return {
    sentMessageId,
    threadId: sent.threadId ?? null,
    labelIds: finalLabelIds,
  };
}

async function findMatchingDbRow(
  supabase: ReturnType<typeof createClient>,
  draft: DraftMetadata,
): Promise<MatchedDbRow | null> {
  // 1. Primary lookup by exact gmail_draft_id
  for (const table of SYNC_TABLES) {
    const { data, error } = await supabase
      .from(table)
      .select("id, company, poc_name, email, sent_intro_at")
      .eq("gmail_draft_id", draft.draftId)
      .limit(1);
    if (!error && data && data.length > 0) {
      const r = data[0] as Record<string, unknown>;
      return {
        table,
        id: String(r.id),
        company: (r.company as string | null) ?? null,
        poc_name: (r.poc_name as string | null) ?? null,
        email: (r.email as string | null) ?? null,
        sent_intro_at: (r.sent_intro_at as string | null) ?? null,
      };
    }
  }

  // 2. Fallback lookup by recipient email (unsent row)
  if (draft.toEmail) {
    for (const table of SYNC_TABLES) {
      const { data, error } = await supabase
        .from(table)
        .select("id, company, poc_name, email, sent_intro_at")
        .ilike("email", draft.toEmail)
        .is("sent_intro_at", null)
        .limit(1);
      if (!error && data && data.length > 0) {
        const r = data[0] as Record<string, unknown>;
        return {
          table,
          id: String(r.id),
          company: (r.company as string | null) ?? null,
          poc_name: (r.poc_name as string | null) ?? null,
          email: (r.email as string | null) ?? null,
          sent_intro_at: (r.sent_intro_at as string | null) ?? null,
        };
      }
    }
  }

  return null;
}

interface BounceCheckTarget {
  table: string;
  id: string;
  company: string | null;
  poc_name: string | null;
  email: string | null;
  thread_id: string | null;
  current_status?: number | null;
}

interface BounceCheckOutcome {
  table: string;
  id: string;
  company: string | null;
  email: string | null;
  thread_id: string | null;
  result: "bounced" | "responded" | "delivered_no_bounce";
  new_status: number;
  db_status_updated: boolean;
  gmail_thread_transferred: boolean;
  bounced_label_id: string | null;
  bounce_reason: string | null;
  matched_message_id: string | null;
}

function isBounceMessage(params: {
  from: string;
  subject: string;
  snippet: string;
  autoSubmitted: string;
}): boolean {
  const fromLower = params.from.toLowerCase();
  const subjLower = params.subject.toLowerCase();
  const snipLower = params.snippet.toLowerCase();

  if (
    fromLower.includes("mailer-daemon") ||
    fromLower.includes("postmaster@") ||
    fromLower.includes("mail delivery subsystem")
  ) {
    return true;
  }
  if (
    subjLower.includes("delivery status notification (failure)") ||
    subjLower.includes("delivery status notification (delay)") ||
    subjLower.includes("undeliverable") ||
    subjLower.includes("mail delivery failed") ||
    subjLower.includes("returned mail")
  ) {
    return true;
  }
  if (
    snipLower.includes("address not found") ||
    snipLower.includes("message blocked") ||
    snipLower.includes("recipient address rejected") ||
    /\b550\s+5\.\d+\.\d+/.test(snipLower)
  ) {
    return true;
  }
  return false;
}

async function inspectLeadBounceOrReply(params: {
  accessToken: string;
  gmailUserEmail: string;
  target: BounceCheckTarget;
}): Promise<{
  result: "bounced" | "responded" | "delivered_no_bounce";
  bounceReason: string | null;
  matchedMessageId: string | null;
}> {
  const selfLower = params.gmailUserEmail.trim().toLowerCase();

  // 1. Check all messages inside the sent Gmail thread
  if (params.target.thread_id) {
    const threadRes = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/threads/${encodeURIComponent(params.target.thread_id)}` +
        `?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Auto-Submitted`,
      { headers: { Authorization: `Bearer ${params.accessToken}` } },
    );
    if (threadRes.ok) {
      const thread = (await threadRes.json()) as {
        messages?: Array<{
          id?: string;
          snippet?: string;
          labelIds?: string[];
          payload?: { headers?: Array<{ name?: string; value?: string }> };
        }>;
      };
      let humanReplyMsgId: string | null = null;
      for (const msg of thread.messages ?? []) {
        const headers = msg.payload?.headers ?? [];
        const getH = (n: string) =>
          headers.find((h) => h.name?.toLowerCase() === n.toLowerCase())
            ?.value ?? "";
        const from = getH("From");
        const subject = getH("Subject");
        const autoSubmitted = getH("Auto-Submitted");
        const snippet = msg.snippet ?? "";

        if (isBounceMessage({ from, subject, snippet, autoSubmitted })) {
          return {
            result: "bounced",
            bounceReason: snippet.slice(0, 260) || subject || "Delivery bounce detected in thread",
            matchedMessageId: msg.id ?? null,
          };
        }

        const fromEmail = extractEmailAddress(from);
        const isSent = (msg.labelIds ?? []).includes("SENT");
        if (fromEmail && fromEmail !== selfLower && !isSent && !autoSubmitted) {
          humanReplyMsgId = msg.id ?? humanReplyMsgId;
        }
      }
      if (humanReplyMsgId) {
        return {
          result: "responded",
          bounceReason: null,
          matchedMessageId: humanReplyMsgId,
        };
      }
    }
  }

  // 2. Fallback: search Gmail for DSN bounce messages mentioning the recipient email (even if outside the thread)
  if (params.target.email) {
    const q = encodeURIComponent(
      `from:(mailer-daemon OR postmaster) "${params.target.email}" newer_than:7d`,
    );
    const listRes = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${q}&maxResults=3`,
      { headers: { Authorization: `Bearer ${params.accessToken}` } },
    );
    if (listRes.ok) {
      const listJson = (await listRes.json()) as {
        messages?: Array<{ id?: string }>;
      };
      for (const m of listJson.messages ?? []) {
        if (!m.id) continue;
        const msgRes = await fetch(
          `https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(m.id)}` +
            `?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Auto-Submitted`,
          { headers: { Authorization: `Bearer ${params.accessToken}` } },
        );
        if (!msgRes.ok) continue;
        const detail = (await msgRes.json()) as {
          id?: string;
          snippet?: string;
          payload?: { headers?: Array<{ name?: string; value?: string }> };
        };
        const headers = detail.payload?.headers ?? [];
        const getH = (n: string) =>
          headers.find((h) => h.name?.toLowerCase() === n.toLowerCase())
            ?.value ?? "";
        const from = getH("From");
        const subject = getH("Subject");
        const autoSubmitted = getH("Auto-Submitted");
        const snippet = detail.snippet ?? "";
        if (isBounceMessage({ from, subject, snippet, autoSubmitted })) {
          return {
            result: "bounced",
            bounceReason: snippet.slice(0, 260) || subject || "Delivery bounce detected via DSN search",
            matchedMessageId: detail.id ?? m.id,
          };
        }
      }
    }
  }

  return {
    result: "delivered_no_bounce",
    bounceReason: null,
    matchedMessageId: null,
  };
}

async function runBounceChecks(params: {
  accessToken: string;
  gmailUserEmail: string;
  supabase: ReturnType<typeof createClient> | null;
  targets: BounceCheckTarget[];
  sourceLabelId: string | null;
  bouncedLabelName: string;
  dryRun: boolean;
}): Promise<BounceCheckOutcome[]> {
  const outcomes: BounceCheckOutcome[] = [];
  let cachedBouncedLabelId: string | null = null;

  for (const target of params.targets) {
    const check = await inspectLeadBounceOrReply({
      accessToken: params.accessToken,
      gmailUserEmail: params.gmailUserEmail,
      target,
    });
    const newStatus =
      check.result === "bounced"
        ? STATUS_INTRO_BOUNCED
        : check.result === "responded"
          ? STATUS_LEAD_RESPONDED
          : STATUS_INTRO_SENT;

    let dbUpdated = false;
    if (params.supabase && !params.dryRun && target.current_status !== newStatus) {
      const { error } = await params.supabase
        .from(target.table)
        .update({ status: newStatus })
        .eq("id", target.id);
      if (!error) dbUpdated = true;
    }

    let threadTransferred = false;
    let appliedBouncedLabelId: string | null = null;
    if (check.result === "bounced" && !params.dryRun) {
      if (!cachedBouncedLabelId) {
        cachedBouncedLabelId = await ensureGmailLabelId(
          params.accessToken,
          params.bouncedLabelName,
        );
      }
      const xfer = await transferBouncedThreadLabel({
        accessToken: params.accessToken,
        threadId: target.thread_id,
        matchedMessageId: check.matchedMessageId,
        bouncedLabelId: cachedBouncedLabelId,
        removeLabelId: params.sourceLabelId,
      });
      threadTransferred = xfer.transferred;
      appliedBouncedLabelId = cachedBouncedLabelId;
    }

    outcomes.push({
      table: target.table,
      id: target.id,
      company: target.company,
      email: target.email,
      thread_id: target.thread_id,
      result: check.result,
      new_status: newStatus,
      db_status_updated: dbUpdated,
      gmail_thread_transferred: threadTransferred,
      bounced_label_id: appliedBouncedLabelId,
      bounce_reason: check.bounceReason,
      matched_message_id: check.matchedMessageId,
    });
  }
  return outcomes;
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const gmailClientId = Deno.env.get("GMAIL_CLIENT_ID") ?? "";
  const gmailClientSecret = Deno.env.get("GMAIL_CLIENT_SECRET") ?? "";
  const gmailRefreshToken = Deno.env.get("GMAIL_REFRESH_TOKEN") ?? "";
  const gmailUserEmail =
    Deno.env.get("GMAIL_USER_EMAIL") ?? "juliennemaeanito.2026@gmail.com";

  const hasSupabase = Boolean(supabaseUrl && serviceRoleKey);
  const hasGmailOAuth = Boolean(
    gmailClientId && gmailClientSecret && gmailRefreshToken,
  );

  if (req.method === "GET") {
    try {
      const url = new URL(req.url);
      const labelName =
        asNonEmptyString(url.searchParams.get("label")) ?? DEFAULT_LABEL_NAME;

      let labelId: string | null = null;
      let queuedDrafts: Array<Record<string, unknown>> = [];

      if (hasGmailOAuth) {
        const accessToken = await getGmailAccessToken(
          gmailClientId,
          gmailClientSecret,
          gmailRefreshToken,
        );
        labelId = await resolveGmailLabelId(accessToken, labelName);
        if (labelId) {
          const drafts = await listLabeledDrafts({
            accessToken,
            labelName,
            labelId,
          });
          const sb = hasSupabase
            ? createClient(supabaseUrl, serviceRoleKey, {
                auth: { persistSession: false },
              })
            : null;
          for (const d of drafts) {
            const dbMatch = sb ? await findMatchingDbRow(sb, d) : null;
            queuedDrafts.push({
              draft_id: d.draftId,
              to: d.to,
              to_email: d.toEmail,
              subject: d.subject,
              matched_db_row: dbMatch,
            });
          }
        }
      }

      return jsonResponse({
        ok: true,
        function: "send-drafted-emails",
        gmail_user_email: gmailUserEmail,
        label: labelName,
        gmail_label_id: labelId,
        default_limit: DEFAULT_LIMIT,
        max_limit: MAX_LIMIT,
        default_delay_ms: DEFAULT_DELAY_MS,
        env_ready: {
          has_supabase_service_role: hasSupabase,
          has_gmail_oauth: hasGmailOAuth,
        },
        queued_draft_count: queuedDrafts.length,
        queued_drafts: queuedDrafts,
        usage:
          "POST optional JSON { action?, label?, bouncedLabel?, limit?, draftIds?, delayMs?, bounceCheckDelayMs?, skipBounceCheck?, leadIds?, table?, dryRun? }. Default sends up to `limit` drafts tagged with label:sales_leads, stamps sent_intro_at + thread_id + status=4, then waits bounceCheckDelayMs (default 10s) and checks Gmail for bounces (updating status=6 and transferring the thread to label:bounced_leads) or replies (status=5). Pass action='check_bounces' to run only the bounce/reply check on sent leads.",
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

    if (!hasGmailOAuth) {
      return jsonResponse(
        {
          ok: false,
          error:
            "Missing GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, or GMAIL_REFRESH_TOKEN secret.",
        },
        500,
      );
    }

    const action = asNonEmptyString(body.action) ?? "send";
    const labelName = asNonEmptyString(body.label) ?? DEFAULT_LABEL_NAME;
    const bouncedLabelName =
      asNonEmptyString(body.bouncedLabel ?? body.bounced_label) ??
      DEFAULT_BOUNCED_LABEL_NAME;
    const dryRun = Boolean(body.dryRun ?? body.dry_run);
    const skipBounceCheck = Boolean(body.skipBounceCheck ?? body.skip_bounce_check);
    const requestedLimit = Number(body.limit ?? DEFAULT_LIMIT);
    const limit = Number.isFinite(requestedLimit)
      ? Math.min(Math.max(Math.trunc(requestedLimit), 1), MAX_LIMIT)
      : DEFAULT_LIMIT;
    const requestedDelay = Number(body.delayMs ?? body.delay_ms ?? DEFAULT_DELAY_MS);
    const delayMs = Number.isFinite(requestedDelay)
      ? Math.min(Math.max(Math.trunc(requestedDelay), 0), MAX_DELAY_MS)
      : DEFAULT_DELAY_MS;
    const requestedBounceDelay = Number(
      body.bounceCheckDelayMs ?? body.bounce_check_delay_ms ?? DEFAULT_BOUNCE_CHECK_DELAY_MS,
    );
    const bounceCheckDelayMs = Number.isFinite(requestedBounceDelay)
      ? Math.min(Math.max(Math.trunc(requestedBounceDelay), 0), MAX_BOUNCE_CHECK_DELAY_MS)
      : DEFAULT_BOUNCE_CHECK_DELAY_MS;
    const filterDraftIds = Array.isArray(body.draftIds ?? body.draft_ids)
      ? new Set(
          ((body.draftIds ?? body.draft_ids) as unknown[])
            .map((id) => asNonEmptyString(id))
            .filter((id): id is string => Boolean(id)),
        )
      : undefined;

    const accessToken = await getGmailAccessToken(
      gmailClientId,
      gmailClientSecret,
      gmailRefreshToken,
    );

    const supabase = hasSupabase
      ? createClient(supabaseUrl, serviceRoleKey, {
          auth: { persistSession: false },
        })
      : null;

    // Standalone bounce/reply check mode (e.g., re-checking previously sent batches)
    if (action === "check_bounces") {
      if (!supabase) {
        return jsonResponse(
          { ok: false, error: "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY." },
          500,
        );
      }
      const targetTable =
        asNonEmptyString(body.table) === "au_hiring_signal_leads"
          ? "au_hiring_signal_leads"
          : "us_sales_hiring_leads";
      const leadIds = Array.isArray(body.leadIds ?? body.lead_ids)
        ? ((body.leadIds ?? body.lead_ids) as unknown[])
            .map((id) => asNonEmptyString(id))
            .filter((id): id is string => Boolean(id))
        : [];

      let q = supabase
        .from(targetTable)
        .select("id, company, poc_name, email, thread_id, status, sent_intro_at")
        .not("sent_intro_at", "is", null)
        .order("sent_intro_at", { ascending: false })
        .limit(limit);

      if (leadIds.length > 0) {
        q = q.in("id", leadIds);
      }

      const { data: sentRows, error: qErr } = await q;
      if (qErr) {
        return jsonResponse({ ok: false, error: qErr.message }, 500);
      }

      const targets: BounceCheckTarget[] = (sentRows ?? []).map((r) => {
        const rec = r as Record<string, unknown>;
        return {
          table: targetTable,
          id: String(rec.id),
          company: (rec.company as string | null) ?? null,
          poc_name: (rec.poc_name as string | null) ?? null,
          email: (rec.email as string | null) ?? null,
          thread_id: (rec.thread_id as string | null) ?? null,
          current_status: typeof rec.status === "number" ? rec.status : null,
        };
      });

      const sourceLabelId = await resolveGmailLabelId(accessToken, labelName);
      const bounceChecks = await runBounceChecks({
        accessToken,
        gmailUserEmail,
        supabase,
        targets,
        sourceLabelId,
        bouncedLabelName,
        dryRun,
      });

      return jsonResponse({
        ok: true,
        action: "check_bounces",
        table: targetTable,
        source_label: labelName,
        bounced_label: bouncedLabelName,
        dry_run: dryRun,
        counts: {
          checked: bounceChecks.length,
          bounced: bounceChecks.filter((b) => b.result === "bounced").length,
          responded: bounceChecks.filter((b) => b.result === "responded").length,
          delivered_no_bounce: bounceChecks.filter((b) => b.result === "delivered_no_bounce").length,
          db_status_updated: bounceChecks.filter((b) => b.db_status_updated).length,
          threads_transferred_to_bounced_label: bounceChecks.filter((b) => b.gmail_thread_transferred).length,
        },
        bounce_checks: bounceChecks,
      });
    }

    const labelId = await resolveGmailLabelId(accessToken, labelName);
    if (!labelId) {
      return jsonResponse(
        {
          ok: false,
          error: `Gmail label "${labelName}" was not found in ${gmailUserEmail}.`,
        },
        404,
      );
    }

    const allLabeledDrafts = await listLabeledDrafts({
      accessToken,
      labelName,
      labelId,
      filterDraftIds,
    });
    const toProcess = allLabeledDrafts.slice(0, limit);

    const sent: Array<Record<string, unknown>> = [];
    const bounceTargets: BounceCheckTarget[] = [];
    const errors: Array<{
      draft_id: string;
      to: string | null;
      subject: string | null;
      error: string;
    }> = [];

    for (let i = 0; i < toProcess.length; i++) {
      const draft = toProcess[i];
      try {
        if (!draft.toEmail) {
          throw new Error("Draft is missing a valid To: email address.");
        }

        const matchedRow = supabase ? await findMatchingDbRow(supabase, draft) : null;

        if (dryRun) {
          sent.push({
            draft_id: draft.draftId,
            to: draft.to,
            to_email: draft.toEmail,
            subject: draft.subject,
            snippet: draft.snippet,
            matched_db_row: matchedRow,
            would_send: true,
          });
          continue;
        }

        const sendResult = await sendGmailDraft({
          accessToken,
          draftId: draft.draftId,
          labelId,
        });

        const sentAtIso = new Date().toISOString();
        let dbUpdated = false;
        let dbUpdateError: string | null = null;

        if (supabase && matchedRow) {
          const { error: updErr } = await supabase
            .from(matchedRow.table)
            .update({
              sent_intro_at: sentAtIso,
              thread_id: sendResult.threadId,
              status: STATUS_INTRO_SENT,
            })
            .eq("id", matchedRow.id);
          if (updErr) {
            dbUpdateError = updErr.message;
          } else {
            dbUpdated = true;
          }

          bounceTargets.push({
            table: matchedRow.table,
            id: matchedRow.id,
            company: matchedRow.company,
            poc_name: matchedRow.poc_name,
            email: matchedRow.email ?? draft.toEmail,
            thread_id: sendResult.threadId,
            current_status: STATUS_INTRO_SENT,
          });
        }

        sent.push({
          draft_id: draft.draftId,
          sent_message_id: sendResult.sentMessageId,
          thread_id: sendResult.threadId,
          label_ids: sendResult.labelIds,
          to: draft.to,
          to_email: draft.toEmail,
          subject: draft.subject,
          sent_at: sentAtIso,
          matched_db_row: matchedRow
            ? { table: matchedRow.table, id: matchedRow.id, company: matchedRow.company }
            : null,
          status_set: matchedRow ? STATUS_INTRO_SENT : null,
          db_updated: dbUpdated,
          ...(dbUpdateError ? { db_update_error: dbUpdateError } : {}),
        });

        // Space out sends politely for Gmail deliverability
        if (delayMs > 0 && i < toProcess.length - 1) {
          await new Promise((r) => setTimeout(r, delayMs));
        }
      } catch (err) {
        errors.push({
          draft_id: draft.draftId,
          to: draft.to,
          subject: draft.subject,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    // Final step: wait briefly for immediate SMTP DSNs, then check just-sent intros for bounces
    let bounceChecks: BounceCheckOutcome[] = [];
    if (!dryRun && !skipBounceCheck && bounceTargets.length > 0) {
      if (bounceCheckDelayMs > 0) {
        await new Promise((r) => setTimeout(r, bounceCheckDelayMs));
      }
      bounceChecks = await runBounceChecks({
        accessToken,
        gmailUserEmail,
        supabase,
        targets: bounceTargets,
        sourceLabelId: labelId,
        bouncedLabelName,
        dryRun: false,
      });
    }

    return jsonResponse({
      ok: errors.length === 0,
      gmail_user_email: gmailUserEmail,
      label: labelName,
      gmail_label_id: labelId,
      dry_run: dryRun,
      counts: {
        found_in_label: allLabeledDrafts.length,
        queued: toProcess.length,
        sent: sent.length,
        bounced: bounceChecks.filter((b) => b.result === "bounced").length,
        errors: errors.length,
      },
      sent,
      bounce_checks: bounceChecks,
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
