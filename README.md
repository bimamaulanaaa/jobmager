# Jobmager

An AI-powered Chrome extension (Manifest V3) that fills job application forms — on any
job site, with **no hardcoded selectors**. It reads the form the way you do (labels,
placeholders, ARIA attributes, the text sitting next to a field, the options in a
dropdown) and maps your stored profile onto it.

The rule that shapes the whole design: **it may only use values you actually stored.**
If a field has no clear match, it stays empty. It never writes you a cover letter.

---

## Setup

Requires Node 20+ and Chrome 116+.

```bash
npm install
npm run build
```

Then load it:

1. Open `chrome://extensions`
2. Turn on **Developer mode** (top right)
3. Click **Load unpacked** and select the **`dist/`** folder
4. Pin Jobmager to the toolbar

The options page opens on first install. If it doesn't, right-click the icon → **Options**.

### First run

1. **Name a profile** — that's the only thing asked for. "Main", "Backend roles", whatever.
2. **Settings → pick a provider and paste an API key**, then press *Save and test key*.
   The key is verified with a real request, so a bad key fails here and not mid-application.
   - [Anthropic](https://console.anthropic.com/settings/keys) · [OpenAI](https://platform.openai.com/api-keys) · [Google Gemini](https://aistudio.google.com/app/apikey)
3. **Profile → add your data**, either way:
   - **Upload a resume (PDF).** The text is extracted in your browser, the AI structures it,
     and you see a before/after diff. Nothing is saved until you press *Apply*, then *Save profile*.
   - **Fill the form by hand.**

### Using it

Open an application form, click the Jobmager icon, press **Autofill this page**.

- **Green** fields were filled.
- **Yellow** fields were left for you — no confident match existed.
- Type into a yellow field and Jobmager offers **"Save this answer?"**. Say yes and the
  question/answer pair is reused on the next application.
- **Multi-step forms:** press Autofill again on each step.

Try it on `demo/form.html` in this repo before using it on a real application.

---

## The no-hallucination rule

This is enforced **twice**, because a prompt alone is a request, not a guarantee.

**1. In the system prompt.** The model is told it is a matcher, not a writer: no composing,
inferring, summarising or paraphrasing; output `null` when unsure; for a dropdown or radio,
copy one of the given options or return `null`; never invent dates, salaries, reasons for
leaving, availability, or "why do you want to work here".

**2. In code, on the response** (`src/core/validator.ts`), independently of what the model
was told:

| Field type | Rule |
|---|---|
| select / radio / checkbox | The value must resolve to one of the options scraped from the page, or it becomes `null`. |
| free text | The value must trace back to your profile or a saved answer. |

Tracing allows only *mechanical* transformation of stored values:

- **reformatting** — `2019-05` → `05/2019`, `120000` → `120,000`, `+44 20 7946 0958` → `+442079460958`
- **composition** — `firstName` + `lastName` → `Ada Lovelace`; an address into one line
- **splitting** — a city out of a one-line address
- **joining** — your skill list into `Go, Python, SQL`

Anything else is dropped and the field goes yellow. Containment is **one-directional**: a
value may be a *part* of something you stored, never something you stored *padded with new
words*. That asymmetry is what stops `Ada Lovelace` from becoming
`Ada Lovelace, Senior Engineer at Google`.

**Agreements are never ticked for you.** A lone checkbox that asks you to agree, consent,
certify, attest or opt in is always left empty, whatever the model proposes. Ticking one is
an attestation you make, not data Jobmager holds. Ordinary yes/no checkboxes ("willing to
relocate?") are still answered normally.

Two consequences worth knowing about, both deliberate:

- A fragment must be a **whole delimited part** of a stored value. `LinkedIn` will not be
  accepted as "how did you hear about this role?" just because it appears inside your
  LinkedIn URL — that is a fabricated answer that happens to share characters with a real one.
- If you store a start date as `2019-05` and a form wants a full calendar date, the field is
  left for you. Completing it to `2019-05-01` would assert a day you never gave.

Rejections are not silent: the popup counts them and a toast appears on the page.

---

## What is sent where

- The **only** outbound requests are to the AI provider you selected. There is no server,
  no telemetry, no analytics.
- One request per autofill: your field descriptors, your profile, and your saved answers.
- Profile, saved answers and API key live in `chrome.storage.local`, on this machine.
- The API key is held by the background service worker; it never enters the page.
- Pages are read **only** when you press Autofill — there is no always-on content script.
  Jobmager uses `activeTab`, so it has no standing access to the sites you browse.
- Forms **embedded from another site** (Greenhouse or Lever inside a company careers page)
  need one extra permission, because `activeTab` covers the page you are on and not a
  third-party iframe inside it. Jobmager asks for it only when it runs into one, from a
  button in the popup — it is not requested at install time.
- Resume PDFs are parsed locally; only the extracted **text** is sent for structuring.

---

## Custom fields

The default schema covers personal info, contact, address, work experience, education,
skills, links, work authorization and salary. Anything else — *Notice period*, *T-shirt
size*, *Preferred pronouns* — goes in **custom fields**: a label, a value, and a type
(text, number, date, long text). They can be added, edited, reordered and deleted, and they
are flattened into the same fact list as built-in fields, so the matcher treats them
identically.

A saved answer that turns out to be a stable fact can be **promoted** into a custom field
from the Saved answers page.

---

## Project layout

```
src/
├── types/          profile schema, field descriptors, settings, message contracts
├── storage/        chrome.storage.local wrappers (profiles, settings, saved answers)
├── providers/      one adapter per AI provider behind a shared interface
│   ├── anthropic.ts    forced tool use
│   ├── openai.ts       json_schema response format
│   └── gemini.ts       responseMimeType: application/json
├── core/
│   ├── prompt.ts        system prompts and the per-field JSON schema
│   ├── ai-matcher.ts    one request for the whole form
│   ├── validator.ts     the traceability rules above
│   ├── profile-facts.ts profile -> labelled facts + allowed-value corpus
│   └── resume-parser.ts pdf.js text extraction, draft merging
├── background/     service worker — every network call happens here
├── content/        field-scanner, form-filler, highlight, save-answer
├── popup/          React popup
└── options/        React options (onboarding, profile, custom fields, answers, settings)
```

**Why the AI sees the whole form at once:** a single request lets the model disambiguate
between fields that only make sense together — two inputs both labelled "Name" that are
really first and last.

**Why filling goes through the native setter:** assigning `input.value` is invisible to
React, Vue and Angular, whose controlled inputs read from an internal value tracker.
The filler writes through `HTMLInputElement.prototype`'s setter and dispatches the events
those frameworks listen for. Radios and checkboxes are `click()`ed for the same reason.

**Why it runs in every frame:** Greenhouse and Lever forms are often embedded in an iframe.
The content script is injected into all frames and each one scans and fills independently.

---

## Development

```bash
npm run dev         # rebuild on change — then press Reload in chrome://extensions
npm run test        # 62 tests
npm run typecheck
```

`npm run build` runs typecheck and tests before bundling.

The tests cover the parts where a silent failure would be invisible: the validator (values
that trace back are kept, invented ones are dropped) and the content script against real
DOM (label resolution through five different mechanisms, radio/checkbox grouping, the
refusal list, and that the filler routes through the native prototype setter — asserted by
leaving a throwing instance-level setter in place, which is what a framework does).

### Provider notes

- **Anthropic** uses forced tool use for structured output, with thinking left on.
  With thinking disabled, current models sometimes write a tool call into visible text
  instead of emitting a `tool_use` block, which would return nothing. Matching is
  mechanical, so `effort: low` is sent to the models that accept it (Haiku 4.5 rejects
  the parameter and is skipped).
- **Gemini** takes the key as an `x-goog-api-key` header rather than the `?key=` query
  parameter shown in Google's examples, to keep the credential out of the URL. Only
  `responseMimeType` is set; Jobmager's per-field schema uses `["string","null"]` unions,
  which Gemini's `responseSchema` subset does not accept.

### Adding a provider

Implement `AIProvider` in `src/providers/`, register it in `src/providers/index.ts`, and add
its API host to `host_permissions` in `public/manifest.json`. Nothing else needs to change.

---

## Known limits

- **Custom dropdowns** built from `div`s with no `<select>` (Workday's pickers, some React
  comboboxes) are recognised when they expose a real input or ARIA roles, but a purely
  `div`-based listbox may need a manual pick.
- **File uploads** are never touched — resumes must be attached by hand.
- **Consent and agreement checkboxes** are left empty by design; tick them yourself.
- **Scanned PDFs** have no text layer; resume import needs a text-based PDF.
- Fields rendered after autofill runs are not filled; press Autofill again.
