## Context

See `proposal.md` — Why. The two features exist and work on upstream's
`better-prairielearn` branch (commit `a0983bf`). This design covers porting them onto a
codebase that has since diverged: this fork carries Google Calendar sync, pinned
assessments, assessment filtering, an MV3 offscreen HTML parser, and a Chrome/Firefox
parity check that upstream does not have.

Constraints that shape the approach:

- Host permissions are scoped to `https://*.prairielearn.com/*`. Widening them is a
  Web Store review cost, so any design requiring `<all_urls>` needs strong justification.
- `test/parity-check.js` asserts the Chrome and Firefox builds are byte-identical for the
  files it lists. It is what caught a real duplicated-parser divergence in this repo.
- Content scripts run in an isolated world shared across this extension's scripts, so
  `home-content.js` and the new scripts can collide on the same DOM containers.
- The service worker has no DOM, which is why `parsing.js` and the offscreen document
  exist. Both new features run in the page, where a DOM is available, so neither needs
  that machinery.

## Goals / Non-Goals

**Goals**
- Match upstream behaviour for both features unless a deviation is justified here.
- Keep the two browser builds identical.
- Prove screenshot fidelity on real PrairieLearn content instead of assuming it.

**Non-Goals**
- Porting the rest of the V2 branch (`gradebook-content.js`, `badge-override.js`,
  `prairietest-content.js`). Separate changes if wanted.
- Changing the transcript's output format. Markdown or JSON export is a later change.
- Reworking upstream's question-page parsing strategy (base64 JSON blob first, rendered
  DOM as fallback). It is sound and handles locked questions.

## Decisions

### 1. Keep `html2canvas`; do not adopt `captureVisibleTab`

`chrome.tabs.captureVisibleTab` photographs the real compositor output, so MathJax, SVG
plots and images would be pixel-exact, and it needs no vendored library. It was rejected
because Chrome grants it only with `activeTab` or `<all_urls>`. `activeTab` is granted by
a click on the extension's own action, not by an in-page button, so this feature would
require `<all_urls>` — replacing a prairielearn.com-scoped extension with one declaring
access to every site, for one convenience feature.

*Alternatives considered*: `getDisplayMedia` (requires the student to pick a screen in a
system dialog every time — worse UX than the OS screenshot tool this replaces); moving
the button into the extension popup to obtain `activeTab` (the button must sit next to
the question it captures).

*Consequence*: fidelity is not guaranteed by construction, so it must be tested —
see Decision 3.

### 2. Reach the clipboard despite the fetch phase

Upstream awaits every question fetch and then calls `navigator.clipboard.writeText`.
Firefox requires transient user activation for clipboard writes and it has expired by
then; Chrome usually succeeds because it grants `clipboard-write` to the focused active
tab, but fails if the student switches tabs mid-fetch. Upstream ships
`Firefox/assessment-content.js`, so this is a live Firefox defect.

Chosen approach — **two-phase copy**: the first activation fetches and builds the
transcript, then the control changes to an explicit ready-to-copy state; the student's
second click performs the write inside a fresh activation. The transcript is held in
memory so no work is repeated, and a failed write leaves the transcript retrievable
rather than discarded.

*Alternatives considered*: writing a placeholder on the first gesture and overwriting it
later (still needs activation for the second write); `document.execCommand("copy")` from
a hidden textarea (deprecated, and equally activation-bound in Firefox); attempting the
direct write and only falling back on rejection (adds a failure the student sees first —
acceptable as a refinement, but the two-phase flow is predictable in both browsers).

### 3. Prove screenshot fidelity before shipping

`html2canvas` re-implements rendering, and its known weak spots — foreign objects, SVG,
web fonts, shadow DOM — are exactly what PrairieLearn questions contain. Capture fidelity
is therefore a tested property, not an assumption: a fixture matrix of real questions
(rendered MathJax, an SVG plot, a raster image, a code block, a Monaco/workspace editor
if present) is captured and inspected. If a category renders blank or malformed, the
control must report an unfaithful capture rather than silently copying a broken image,
and Decision 1 is revisited with evidence.

### 4. Merge the manifests; do not take upstream's

The V2 manifest predates this fork's `identity` and `offscreen` permissions and its
Google Calendar and offscreen-parser wiring. Only the two `content_scripts` entries are
taken across. `libs/html2canvas.min.js` must be listed **before** `question-content.js`
in the same entry so the global exists when the script runs.

### 5. Guard against collision with `home-content.js`

`home-content.js` matches all PrairieLearn pages and injects into card headers; the
screenshot button targets `.card-header` on the question page. Upstream already guards
with a `.pl-screenshot-btn` check. That guard is kept and extended to the copy button,
and both scripts must tolerate their header being re-rendered or re-injected.

### 6. Ship the transcript export without an in-page confirmation

Decided by the repository owner on 2026-09-12: **ship as upstream does**, with no
confirmation step before a bulk export.

The proposal flagged that Copy Questions turns many manual copies into one click.
The deciding argument is that it grants no access the student does not already
have — it reads only what that student's own session already renders, and every
question it fetches is one they can open by clicking. A confirmation would add
friction to every legitimate use while stopping nothing, since the same content is
reachable by hand.

*Consequence*: no confirmation UI is built. The existing protections stand —
the feature is registered only for `assessment_instance` URLs, concurrency stays
bounded at 5, and it fetches only links present in that page's own questions
table. Revisit if the transcript ever grows to include content the student cannot
already see.

## Risks / Trade-offs

- **html2canvas misrenders MathJax or SVG** → Decision 3 tests it against real questions
  before ship; the control reports unfaithful captures instead of copying silently.
- **194 KB vendored bundle in both builds** → accepted; it is MIT-licensed, loaded only on
  instance-question pages, and its version is recorded so it can be audited and updated.
- **Firefox refuses image clipboard writes on older versions** → image writes need
  Firefox 127+; the control reports the unsupported case specifically rather than failing
  generically, and this is stated in the README's browser support notes.
- **N authenticated fetches on one click** → concurrency stays bounded at upstream's 5,
  the feature is registered only for `assessment_instance` URLs, and it fetches only
  links present in that page's questions table.
- **Bulk extraction is easier than before** → the feature reads only what the student's
  own session already renders and grants no new access, but it does turn many manual
  copies into one click. Flagged for the repository owner's decision; no in-page
  confirmation is specified, matching upstream.
- **Two new content scripts on a page the extension already touches** → Decision 5, plus
  a test that exactly one of each control exists after both scripts run.

## Migration Plan

Additive: no stored data, no schema, no existing behaviour changes. Ship both features
together behind the normal release; rollback is removing the two `content_scripts`
entries, which disables both controls without affecting anything else.

## Open Questions

- Should the transcript record each question's score or attempt state alongside its text?
  Upstream does not. This can be added later without changing the retrieval approach or
  the task breakdown.
