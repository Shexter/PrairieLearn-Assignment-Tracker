## 1. Port groundwork

- [x] 1.1 Vendor `libs/html2canvas.min.js` from upstream `better-prairielearn` into both builds, recording its version and MIT license in the repo.
- [x] 1.2 Merge the two `content_scripts` entries into `Chrome/manifest.json` and `Firefox/manifest.json`, preserving this fork's `identity`/`offscreen` permissions and existing entries, with the library listed before `question-content.js`.
- [x] 1.3 Extend `test/parity-check.js` to cover `assessment-content.js`, `question-content.js`, and the vendored library, and confirm it fails when the builds differ.
- [x] 1.4 Capture fixtures for the new pages: an assessment-instance page with grouped questions, and instance-question pages covering rendered MathJax, an SVG plot, a raster image, and a locked/completed question.

## 2. Copy Questions — retrieval and transcript

- [x] 2.1 Port `assessment-content.js` from upstream to both builds, unchanged except for the clipboard flow in section 3.
- [x] 2.2 Add tests that the control is injected exactly once on `assessment_instance` URLs and never on course home, assessments list, gradebook, or instance-question URLs.
- [x] 2.3 Test transcript structure against the fixture: assessment title first, group headings preserved in page order, continuous question numbering across groups.
- [x] 2.4 Test that answer options are included when present and that embedded images are marked rather than dropped.
- [x] 2.5 Test the locked/completed question path (rendered-DOM fallback when the base64 JSON blob is absent).
- [x] 2.6 Test bounded concurrency: never more than 5 retrievals in flight, every question retrieved exactly once, progress reported as completed-of-total.
- [x] 2.7 Test partial failure: one failed question leaves all others intact and marks that one unavailable; total failure reports an error instead of copying an empty transcript.

## 3. Copy Questions — clipboard delivery

- [x] 3.1 Implement the two-phase copy from design Decision 2: first activation fetches and builds, control moves to a ready-to-copy state, second activation writes within a fresh user activation.
- [x] 3.2 Hold the built transcript in memory so the second activation repeats no network work, and keep it retrievable if the write fails.
- [x] 3.3 Replace the bare `Failed to copy` with the actual refusal reason from the clipboard API.
- [x] 3.4 Test that the control is disabled during retrieval, cannot start a second concurrent export, and returns to its resting label after success or failure.
- [x] 3.5 Verify the full flow by hand in Chrome and Firefox on an assessment long enough that transient activation expires during retrieval.

## 4. Screenshot — capture

- [x] 4.1 Port `question-content.js` from upstream to Chrome, keeping its `.pl-screenshot-btn` double-inject guard.
- [x] 4.2 Add the Firefox build of the same file (deviation 1) and confirm parity passes.
- [x] 4.3 Test that the control appears only on `instance_question` URLs, exactly once, and that it coexists with `home-content.js` injections in the same header without either breaking.
- [x] 4.4 Test that no control is added and the page is left unmodified when no question panel is found.
- [x] 4.5 Verify capture covers the whole panel when it is taller than the viewport and when the page is scrolled.

## 5. Screenshot — fidelity gate (design Decision 3)

- [x] 5.1 Capture each fixture category from 1.4 and inspect the resulting PNGs: rendered MathJax, SVG plot, raster image, code block.
- [x] 5.2 Record the results per category as pass or fail with the actual images attached to the change.
- [x] 5.3 For any failing category, make the control report an unfaithful capture rather than copying a blank or malformed image.
- [x] 5.4 If a core category (MathJax or SVG) fails, stop and revisit design Decision 1 with the captured evidence before shipping.

## 6. Screenshot — clipboard and browser support

- [x] 6.1 Test the state sequence: disabled and capturing, success confirmation, return to resting label.
- [x] 6.2 Report unsupported or refused image writes specifically, distinguishing "this browser cannot put images on the clipboard" from "the write was refused".
- [x] 6.3 Confirm PNG clipboard writes by hand in Chrome and in Firefox 127+, and note the Firefox minimum version in the README.

## 7. Release checks

- [x] 7.1 Run `npm test`, `npm run check:syntax`, and `npm run check:parity`; all must pass.
- [x] 7.2 Confirm neither manifest gained a permission beyond what shipped before this change.
- [x] 7.3 Load both unpacked builds and walk the two features end to end on a real course.
- [x] 7.4 Update `README.md` with both features and their browser support.
- [x] 7.5 Decide, and record in the change, whether the transcript export ships with an in-page confirmation (proposal — Risk and scope).
