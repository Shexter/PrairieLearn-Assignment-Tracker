## Why

Frequent PrairieLearn users lose time to repetitive mouse navigation and have no private way to collect difficult questions or attach study notes. Submission shortcuts also need strong safeguards because assessment attempts can carry penalties or hard limits.

## What Changes

- Add conflict-aware keyboard shortcuts for Save & Grade/Submit and previous/next question navigation.
- Suppress shortcuts while users are composing in text, code, math, or other editable controls unless the submission chord is explicitly safe for that page.
- Detect and prominently summarize only student-visible attempt limits and penalties; never infer a penalty from missing markup.
- Offer an opt-in confirmation before a penalized submission and require confirmation for the final observable attempt when that safeguard is enabled.
- Add locally stored Star Question controls and a searchable Starred Questions popup view with stale-link handling and removal controls.
- Add a collapsible plain-text/Markdown-compatible private scratchpad keyed to stable question identity, with local-only autosave, export, and delete behavior.

## Capabilities

### New Capabilities

- `question-workflow-controls`: Safe keyboard navigation, submission shortcuts, and attempt-risk warnings.
- `local-study-tools`: Local question bookmarks, study-list navigation, and per-question private notes.

### Modified Capabilities

None.

## Impact

- Extends question/assessment-instance content scripts, popup navigation, background storage handling, shared identity helpers, CSS, and browser parity tests.
- Stores titles, URLs, question identifiers, and user-authored notes in `storage.local`; adds no server sync or third-party Markdown renderer.
- Requires fixtures and real-page acceptance across homework, exam/quiz, workspace, rich-text, and code-editor question types.

