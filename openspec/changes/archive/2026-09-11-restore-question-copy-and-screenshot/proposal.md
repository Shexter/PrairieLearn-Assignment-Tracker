## Why

The upstream repository carries two question-page tools on its unmerged V2 branch
(`better-prairielearn`, commit `a0983bf` "Added copy feature and screenshot feature
(Chrome only)"): a **Copy Questions** button that exports a whole assessment's question
text to the clipboard, and a **Screenshot** button that copies a rendered question as a
PNG. Neither has ever existed on `main`, so this fork — which branches from `main` — has
never shipped them. Students who want to study offline, paste a question into notes, or
keep a record of an attempt currently have no path other than manual selection and OS
screenshot tools.

Porting them forward is worthwhile on its own, and both upstream implementations have
concrete defects that are cheaper to fix during the port than after it.

## What Changes

The default is a faithful port of upstream's implementation. Two deviations are taken
deliberately and are justified below; everything else matches `better-prairielearn`.

**Ported as-is**
- A **Copy Questions** control on the assessment-instance page
  (`/pl/course_instance/*/assessment_instance/*`) that walks the questions table,
  fetches each question the student can already open (bounded at 5 concurrent), and
  writes a plain-text transcript to the clipboard, showing `Copying... (n/total)` while
  it works.
- A **Screenshot** control on the instance-question page
  (`/pl/course_instance/*/instance_question/*`) that copies the rendered question panel
  to the clipboard as a PNG.
- Upstream's capture method (vendored `html2canvas`), plain-text output format, and
  questions-table selectors are all kept unchanged. `captureVisibleTab` would render
  MathJax and SVG exactly, but Chrome requires the `<all_urls>` permission for it, which
  is a poor trade for an extension whose host permissions are scoped to
  `https://*.prairielearn.com/*`. Fidelity is verified by test instead of assumed, and
  the alternative is recorded in design in case those tests fail.

**Deviation 1 — Screenshot ships to Firefox as well.** Upstream is Chrome-only. This
fork has `test/parity-check.js`, which upstream does not, asserting the two builds never
drift; it is what surfaced a real duplicated-parser divergence in this codebase. A
Chrome-only file would turn that check into a false assurance. Firefox has supported
image writes through `navigator.clipboard.write` since v127, so shipping both costs
little and keeps the safety net honest.

**Deviation 2 — the clipboard write is made to survive the fetch phase.** Upstream's
copy flow awaits N network fetches and only then calls `navigator.clipboard.writeText`.
Firefox requires transient user activation for clipboard writes and that activation is
long expired by then; Chrome is more forgiving because it grants `clipboard-write` to
the focused active tab, but still fails if the user switches away mid-fetch. Upstream
ships `Firefox/assessment-content.js`, so this is a live defect there. The port must
either hold the clipboard across the fetch phase or complete the write from a second
gesture, and must report the actual failure rather than a bare `Failed to copy`.

**Supporting changes**
- Both manifests gain the two `content_scripts` registrations **by merge**, not
  replacement: the V2 manifest predates this fork's `identity` and `offscreen`
  permissions and its Google Calendar and offscreen-parser wiring.
- `test/parity-check.js` gains the new files.

## Capabilities

### New Capabilities

- `question-content-export`: copying an assessment's question text to the clipboard as a
  readable transcript, including per-question progress, partial-result handling when
  some questions cannot be read, and the scoping rule that only questions the student's
  own session can already open are ever fetched.
- `question-screenshot-capture`: copying the rendered question panel to the clipboard as
  a PNG, including capture fidelity for MathJax and SVG content, failure reporting, and
  the per-browser support matrix.

### Modified Capabilities

<!-- None. Both features are additive: they inject their own controls on pages the
     existing capabilities do not modify, and they change no existing requirement. -->

## Impact

**New files** (per browser build)
- `Chrome/assessment-content.js`, `Firefox/assessment-content.js` — Copy Questions.
- `Chrome/question-content.js`, `Firefox/question-content.js` — Screenshot.
- `Chrome/libs/html2canvas.min.js`, `Firefox/libs/html2canvas.min.js` — vendored capture library.

**Modified**
- `Chrome/manifest.json`, `Firefox/manifest.json` — two new `content_scripts` entries.
  No new permissions: the existing `https://*.prairielearn.com/*` host permission covers
  both features.
- `test/parity-check.js` — extend the parity file list to cover the new files.

**Dependencies**
- Adds `libs/html2canvas.min.js` (194 KB, MIT) to both builds as a vendored
  third-party bundle whose license and version must be tracked.

**Risk and scope**
- Clipboard image writes (`ClipboardItem` with `image/png`) have a narrower browser
  support history than text writes; this is the main portability risk.
- Copy Questions performs N authenticated fetches against PrairieLearn on one click.
  Concurrency must stay bounded and the feature must not run on pages outside
  `assessment_instance`.
- The transcript can include answer options for questions the student has open. The
  feature reads only what that student's session already renders and adds no new access,
  but it does make bulk extraction one click instead of many. **Decided 2026-09-12:
  ship without an in-page confirmation, matching upstream** — see design Decision 6.
