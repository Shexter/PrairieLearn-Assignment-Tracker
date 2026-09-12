# question-content-export Specification

## Purpose
Lets a student copy the questions of an assessment they already have open into a single
plain-text transcript on the clipboard, so the material can be pasted into notes or
studied away from PrairieLearn without selecting and copying each question by hand.

## Requirements

### Requirement: Export control placement

The extension SHALL offer an export control only on a student's own assessment-instance
page, and SHALL NOT offer it on any other PrairieLearn page.

#### Scenario: Assessment instance page

- **WHEN** the student opens a URL matching `/pl/course_instance/<id>/assessment_instance/<id>`
- **THEN** an export control labelled `Copy Questions` appears in the assessment header
- **AND** the control is rendered exactly once even if the page's scripts run again

#### Scenario: Any other page

- **WHEN** the student opens a course home, assessments list, gradebook, or instance-question page
- **THEN** no export control is added to that page

#### Scenario: No questions table present

- **WHEN** the export control is activated and the page exposes no questions table
- **THEN** the control reports that no questions were found
- **AND** no network requests are issued

### Requirement: Transcript content

The exported transcript SHALL be plain text, SHALL open with the assessment title, and
SHALL list every question in the order the page presents it, preserving the question
group headings shown in the questions table.

#### Scenario: Grouped questions

- **WHEN** the questions table contains group headings
- **THEN** each heading appears in the transcript before the questions belonging to it
- **AND** questions are numbered continuously across groups

#### Scenario: Question with answer options

- **WHEN** a question exposes its answer options to the student's own session
- **THEN** those options appear beneath that question's text in the transcript

#### Scenario: Embedded images

- **WHEN** a question's body contains an image
- **THEN** the transcript marks the image's position rather than omitting it silently

### Requirement: Bounded, scoped fetching

Exporting SHALL retrieve only the questions linked from the current assessment instance,
SHALL use the student's existing session without requesting new access, and SHALL limit
how many retrievals are in flight at once.

#### Scenario: Concurrency is bounded

- **WHEN** an assessment contains more questions than the concurrency limit
- **THEN** no more than the limit are being retrieved at any moment
- **AND** every question is retrieved exactly once

#### Scenario: Progress is visible

- **WHEN** retrieval is under way
- **THEN** the control reports how many questions have completed out of the total
- **AND** the control is disabled so a second export cannot start concurrently

### Requirement: Partial and failed results

A question that cannot be read SHALL NOT abort the export. The transcript SHALL mark
that question as unavailable and SHALL still contain every question that was read.

#### Scenario: One question fails to load

- **WHEN** a single question's retrieval fails
- **THEN** the transcript contains all other questions
- **AND** the failed question appears with an explicit unavailable marker

#### Scenario: Every question fails to load

- **WHEN** no question can be retrieved
- **THEN** the control reports the failure rather than copying an empty transcript

### Requirement: Reliable clipboard delivery

The transcript SHALL reach the clipboard even though retrieval takes place between the
student's activating gesture and the write. When the clipboard cannot be written, the
control SHALL report why, and SHALL offer the student a way to obtain the transcript.

#### Scenario: Long export in a browser requiring user activation

- **WHEN** retrieval takes long enough that the activating gesture's transient activation has expired
- **THEN** the transcript is still delivered to the clipboard, or the student is offered an explicit second action that completes the copy

#### Scenario: Clipboard write is refused

- **WHEN** the browser refuses the clipboard write
- **THEN** the control reports the reason for the refusal rather than a generic failure
- **AND** the retrieved transcript is not discarded without the student being offered it

#### Scenario: Control returns to rest

- **WHEN** an export finishes, whether it succeeded or failed
- **THEN** the control becomes usable again and returns to its resting label
