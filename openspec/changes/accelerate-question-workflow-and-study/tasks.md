## 1. Discovery, identity, and storage

- [ ] 1.1 Capture sanitized fixtures for homework, limited-attempt quiz/exam, rich text, MathJax input, Monaco, workspace, previous/next, and disabled-action states.
- [ ] 1.2 Define supported-page adapters and add tests for stable origin/course/assessment/question identity plus ambiguous no-op behavior.
- [ ] 1.3 Define versioned bookmark, note, and preference schemas with validation, quotas, migration, export, and corrupt-record isolation.

## 2. Local study tools

- [ ] 2.1 Implement Star/Unstar controls that deduplicate by stable identity and preserve title, course, URL, and update time.
- [ ] 2.2 Add a popup Starred Questions tab with search, open, stale status, single removal, and confirmed bulk clear.
- [ ] 2.3 Implement a collapsible plain-text scratchpad with debounced local autosave, saved/error status, restoration, delete confirmation, and export.
- [ ] 2.4 Add isolation tests proving bookmarks/notes never enter refresh, Google, ICS, notification, logging, or unrelated message payloads.

## 3. Keyboard workflow

- [ ] 3.1 Add guarded semantic discovery for Save & Grade/Submit and previous/next actions across fixture variants.
- [ ] 3.2 Implement default-off shortcut preferences and an in-context shortcut help/settings surface.
- [ ] 3.3 Implement Ctrl/Cmd+Enter and Alt+Arrow listeners with composition, repeat, claimed-event, editable/editor, visibility, and disabled-action guards.
- [ ] 3.4 Test that each accepted chord invokes exactly one native click and never reconstructs or bypasses PrairieLearn form validation.

## 4. Attempt protection

- [ ] 4.1 Add parsers/tests for visible attempt count, maximum attempts, next-submission penalty, conflicting labels, and unknown state.
- [ ] 4.2 Render attempt-risk summary adjacent to the authoritative submit action with no inferred values.
- [ ] 4.3 Implement preference-controlled confirmation around both mouse and keyboard activation with cancellation and reentrancy tests.

## 5. Verification and privacy

- [ ] 5.1 Update privacy and user documentation for shortcuts, local study data, exports, storage loss, and unsupported pages.
- [ ] 5.2 Run automated, syntax, parity, strict OpenSpec, and diff checks.
- [ ] 5.3 Verify real Chrome and Firefox question workflows including editors, IME, final-attempt cancel/confirm, navigation ends, star persistence, scratchpad isolation, popup search, and narrow layouts.

