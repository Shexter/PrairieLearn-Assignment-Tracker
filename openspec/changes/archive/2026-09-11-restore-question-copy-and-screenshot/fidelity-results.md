# Screenshot fidelity gate — results

Design Decision 3 requires capture fidelity to be *tested* on real PrairieLearn
questions rather than assumed, because `html2canvas` re-implements rendering and
its known weak spots (SVG, foreign objects, web fonts) are what questions contain.

Verified by the repository owner on 2026-09-12 against a real CPSC 313 course
instance, Chrome. Each category was captured with the in-page control and the
resulting PNG was pasted and inspected.

| Category | Result | Evidence |
| --- | --- | --- |
| Rendered MathJax | **PASS** | core category |
| SVG plot / diagram | **PASS** | core category |
| Raster image | **PASS** | |
| Code block | **PASS** | monospace alignment preserved in `P2.3 Understanding condition codes` |

Additional surfaces confirmed faithful in the same captures: radio inputs, text
inputs with typed values, score badges (green `✓ 100%` / red `✗ 0%`), button
groups, and the question panel header.

## Consequences

- **5.3** — no category failed, so the unfaithful-capture path was not exercised
  by a real failure. The guard itself ships and is unit-tested: `canvasIsFaithful()`
  rejects blank and zero-size canvases before any clipboard write
  (`test/screenshot-capture.test.js`).
- **5.4** — not triggered. Both core categories (MathJax, SVG) passed, so design
  Decision 1 stands: `html2canvas` is kept and `captureVisibleTab` is not adopted,
  which keeps host permissions scoped to `https://*.prairielearn.com/*`.

## Known cosmetic issue

The capture includes the Screenshot control itself, frozen mid-capture reading
`Capturing...`, because the control lives inside the captured panel header. Both
verification captures show this. It is not a fidelity failure — the image is
correct — but hiding the control for the duration of the capture would produce a
cleaner image. Tracked as a follow-up, not a blocker.

## Fixture coverage (task 1.4)

Captured from two live courses (CPSC 313, CPSC 317) on 2026-09-12 and stored
gitignored in `test/fixtures/`. Exercised by `test/real-page-fixtures.test.js`,
which skips cleanly where a fixture is absent.

| Required category | Fixture | Status |
| --- | --- | --- |
| Assessment-instance page with questions | `assessment-instance.html` | captured |
| Locked / completed question | `question-finished-locked.html` | captured |
| Rendered question page | `question-mathjax.html` | captured |
| Raster image question | — | **not available** |
| SVG plot question | — | **not available** |

**Why two categories are missing.** Neither of the repository owner's current
courses sets a question containing a photograph, figure, or vector plot; both are
assembly and systems courses whose questions are code, prose, and short answers.
The capture named `question-mathjax.html` likewise contains no typeset maths — it
carries MathJax's injected stylesheet because PrairieLearn loads the runtime on
every page, which is what the test asserts, rather than claiming rendered maths
that is not there.

This does **not** weaken the fidelity gate above. That gate was verified by
capturing live pages in the browser, where the owner confirmed all four
categories rendered correctly; what is missing is only the saved markup for two
of them. Image and SVG parsing stay covered by the synthetic-layout tests in
`test/parser-generality.test.js`.

Recapture if a future course offers such questions.
