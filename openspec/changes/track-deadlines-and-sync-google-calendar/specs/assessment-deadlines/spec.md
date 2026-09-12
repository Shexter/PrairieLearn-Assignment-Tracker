## Purpose

Defines which PrairieLearn assessment timestamps are real task deadlines and how those deadline-bearing tasks appear and can be pinned in the tracker.

## ADDED Requirements

### Requirement: Only explicit until timestamps are task deadlines
The extension SHALL classify an assessment as deadline-bearing only when the assessment row or its access-window metadata exposes a valid finite end time represented to the student as an “until” timestamp. A timestamp described only as “Available” SHALL NOT become a deadline.

#### Scenario: Visible until timestamp
- **WHEN** an assessment row says “100% until 11:00, Mon, Sep 14”
- **THEN** the extension classifies Sep 14 at 11:00 in the student's PrairieLearn/browser time zone as the assessment deadline

#### Scenario: Access details contain a finite end
- **WHEN** the visible summary is incomplete but the assessment access details contain a valid finite end time
- **THEN** the extension classifies the relevant displayed-credit window end as the assessment deadline

#### Scenario: Available timestamp only
- **WHEN** an assessment row says only “Available 08:00, Thu, Sep 17” and has no finite “until” access-window end
- **THEN** the extension leaves the assessment deadline empty
- **AND** the assessment is excluded from Upcoming, pin controls, and calendar export

#### Scenario: Invalid or missing end timestamp
- **WHEN** an “until” value cannot be parsed into a valid timestamp
- **THEN** the extension leaves the assessment deadline empty rather than guessing

### Requirement: Upcoming shows the next seven days of incomplete deadlines
The home Upcoming card SHALL automatically show every open assessment with a real deadline from the current instant through the same instant seven days later when its score is below 100% or unavailable. It SHALL NOT automatically show available-only, past-due, closed, or 100%-complete assessments.

#### Scenario: Incomplete task due inside the horizon
- **WHEN** an open assessment is incomplete and its real deadline is within the next seven days
- **THEN** the Upcoming card shows it without requiring a pin

#### Scenario: Boundary deadline
- **WHEN** an open incomplete assessment is due exactly seven days from the current instant
- **THEN** the Upcoming card includes it

#### Scenario: Completed task due inside the horizon
- **WHEN** an unpinned assessment has a 100% score and a future deadline inside seven days
- **THEN** the Upcoming card does not show it automatically

#### Scenario: Available-only assessment inside the horizon
- **WHEN** an assessment becomes available inside seven days but has no real deadline
- **THEN** the Upcoming card does not show it

### Requirement: Future deadline tasks can be pinned from every assessment group
The assessment page SHALL offer Pin or Unpin for every open, future, deadline-bearing assessment with a usable PrairieLearn assessment URL, regardless of assessment group. Available-only, past-due, closed, and unlinkable rows SHALL NOT offer a pin control.

#### Scenario: Preclass deadline can be pinned
- **WHEN** a Preclass row has a future “until” deadline and an assessment URL
- **THEN** its title cell offers a Pin control

#### Scenario: Pinned task lies outside seven days
- **WHEN** a user pins a future deadline-bearing assessment due more than seven days away
- **THEN** it remains visible in Upcoming until it is unpinned, closed, or past due

#### Scenario: Pinned task is complete
- **WHEN** a pinned future assessment reaches 100% before its deadline
- **THEN** it remains visible because the user explicitly pinned it

### Requirement: Deadline links open the exact assessment
Every tracker entry for a deadline-bearing assessment SHALL use the resolved URL from that PrairieLearn assessment row when one is available.

#### Scenario: Upcoming link selected
- **WHEN** the user selects a linked task in Upcoming
- **THEN** PrairieLearn opens the corresponding assessment or assessment instance URL from the source row

