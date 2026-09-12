## Purpose

Provides a private browser-local study list and per-question notes using stable PrairieLearn identities and explicit data-management controls.

## ADDED Requirements

### Requirement: Questions can be starred locally
The extension SHALL let the student star or unstar a question and SHALL store its stable identity, title, course context, URL, and update time locally.

#### Scenario: Student stars a question
- **WHEN** the student selects Star Question on a supported question page
- **THEN** the question appears once in the popup study list and remains starred after reload

#### Scenario: Stored link is stale
- **WHEN** a bookmarked URL no longer resolves to the expected question
- **THEN** the extension preserves the entry, marks it stale after observed failure, and lets the student remove it

### Requirement: Study list is searchable and manageable
The popup SHALL let students search, open, unstar, and clear bookmarks, with destructive bulk clear requiring confirmation.

#### Scenario: Student searches bookmarks
- **WHEN** the student enters a course or title fragment
- **THEN** matching bookmarks appear without changing stored entries

### Requirement: Each question has a private local scratchpad
The extension SHALL autosave plain text keyed to stable question identity, restore it on revisit, and provide explicit export and deletion actions.

#### Scenario: Student revisits a question
- **WHEN** a saved note exists for the same origin, course, assessment, and question identity
- **THEN** the scratchpad restores that note and no note from another question

### Requirement: Study data stays local
Bookmark and scratchpad content SHALL NOT be sent to PrairieLearn, calendar providers, analytics, or extension-operated servers.

#### Scenario: Normal sync or refresh runs
- **WHEN** deadline refresh or calendar sync executes
- **THEN** its request payloads contain no bookmark or scratchpad content

