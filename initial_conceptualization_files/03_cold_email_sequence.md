# Cold Email + Chase Sequence

> Brand-neutral drafts with `{{merge}}` placeholders. Cadence mirrors your reference engine:
> **Day 0 first touch → Day 3 → Day 8 → Day 13** (status `1B → 2B → 3B → 4B`).
>
> **Deliverability note (important):** for COLD email, send **plain-text or very light HTML** — no
> image banners, no big WiseStamp signature-image, no tracking-pixel-heavy templates. The keynote
> chase emails (`followup_1.txt`) use a heavy HTML signature + image button; that's fine for *warm*
> replies but hurts cold inbox placement and can trip spam filters. Keep these lean. One link max per
> email, your real plain-text signature, a physical address line, and an unsubscribe/opt-out line.

**Merge fields used:** `{{first_name}}`, `{{company}}`, `{{icebreaker}}` (optional 1-line
personalization from enrichment — e.g. something specific about their business), `{{calendar_link}}`,
`{{your_name}}`, `{{your_phone}}`, `{{your_domain}}`.

---

## Email 1 — First touch (Day 0, status 1B)

**Subject options (A/B test):**
- `quick idea for {{company}}`
- `{{first_name}} — 2 hrs/week back?`
- `automating the boring stuff at {{company}}`

**Body:**
```
Hi {{first_name}},

{{icebreaker}}

I help {{industry_or_"small teams"}} automate the repetitive office work that eats up the
week — things like chasing leads, updating the CRM, and putting together reports.

I run a system like this for a travel company that saves them around 40 hours a week on
sales admin and follow-ups.

Would it be worth a quick 15-minute call where I point out the 2–3 things your team is
probably still doing by hand that are easy to automate? No pitch — you'll get a few
useful ideas either way.

Worth a look?

{{your_name}}
{{your_phone}} · {{your_domain}}
```
*(Keep `{{icebreaker}}` to one genuine line. If you can't personalize a row, drop the line entirely
rather than fake it.)*

---

## Email 2 — Follow-up 1 (Day 3, threaded reply, status 2B)
*Value-add — give them proof, no pressure.*

```
Hi {{first_name}},

Just following up — thought I'd share a quick example of what "automating the boring
stuff" actually looks like.

For that travel company, mornings now run themselves: leads are found and emailed, the
CRM updates itself, bounced contacts get cleaned up, and a sales summary lands in the
team's inbox — all before anyone logs on. ~40 hrs/week back.

If that sounds useful for {{company}}, I'm happy to spot a couple of quick wins for you
on a 15-min call: {{calendar_link}}

{{your_name}}
```

---

## Email 3 — Follow-up 2 (Day 8, threaded reply, status 3B)
*Soft ask + make it concrete to them.*

```
Hi {{first_name}},

Quick one — for a business like {{company}}, the easiest first automation is usually one
of: lead follow-up that never forgets, a self-updating CRM, or a report that builds
itself every week.

If you tell me which of those would save your team the most time, I'll sketch out how it
would work for you — free, no obligation.

Or grab 15 mins here if that's easier: {{calendar_link}}

{{your_name}}
```

---

## Email 4 — Follow-up 3 (Day 13, threaded reply, status 4B — breakup)
*Last touch — permission to close the loop. Breakup emails get strong reply rates.*

```
Hi {{first_name}},

I'll leave it here so I'm not cluttering your inbox.

If automating some of the repetitive work at {{company}} is ever on the list, I put
together a short "10 office automations that save 5+ hrs/week" guide — happy to send it
over, just reply "guide".

And whenever the timing's right, the door's open: {{calendar_link}}

All the best,
{{your_name}}
```

---

## Reply handling (ties to Stage 5 triage)
- **Positive / "interested" / books call** → lead → status `8A` (to-action), stop the sequence.
- **"guide" reply** → send the lead magnet, keep warm.
- **"not interested" / opt-out** → suppress immediately (honour it — legal + deliverability).
- **Bounce** → status `10A`, close.

## Copy principles baked in
- First email sells a **free 15-min idea call**, never "hire me."
- One clear CTA per email; link only from email 2 onward (email 1 asks for a reply — replies boost
  deliverability and start a real thread).
- Short, specific, no jargon, no images.
- The breakup email (4) usually pulls the second-most replies after email 1.
- Always include a real opt-out line + physical address in the footer (Australian Spam Act / CAN-SPAM
  compliance for commercial email).
