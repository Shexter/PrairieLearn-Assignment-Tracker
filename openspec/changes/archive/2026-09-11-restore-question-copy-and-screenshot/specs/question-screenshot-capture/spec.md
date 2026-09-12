## Purpose

Lets a student copy the question they are looking at to the clipboard as an image, so a
worked problem, plot, or equation can be pasted into notes or a message without reaching
for an operating-system screenshot tool and cropping by hand.

## ADDED Requirements

### Requirement: Capture control placement

The extension SHALL offer a capture control only on a student's own instance-question
page, and SHALL NOT offer it on any other PrairieLearn page.

#### Scenario: Instance question page

- **WHEN** the student opens a URL matching `/pl/course_instance/<id>/instance_question/<id>`
- **THEN** a capture control labelled `Screenshot` appears in the question panel's header

#### Scenario: Other extension controls are present

- **WHEN** another part of the extension has already modified the same header
- **THEN** exactly one capture control exists on the page
- **AND** the controls already present remain usable

#### Scenario: Question panel cannot be located

- **WHEN** the page exposes no recognisable question panel
- **THEN** no capture control is added, and the page is otherwise unmodified

### Requirement: Captured image content

The captured image SHALL contain the question panel as the student currently sees it,
SHALL be delivered as PNG, and SHALL NOT be cut off because the panel is taller than the
viewport or the page is scrolled.

#### Scenario: Panel taller than the viewport

- **WHEN** the question panel extends past the bottom of the window
- **THEN** the captured image contains the whole panel, not only the visible part

#### Scenario: Page is scrolled

- **WHEN** the student has scrolled before activating the control
- **THEN** the captured image is aligned to the panel, not to the scroll position

#### Scenario: Mathematical and vector content

- **WHEN** the question contains rendered mathematical notation, a vector plot, or an embedded image
- **THEN** that content appears in the captured image as it appears on screen, or the control reports that the capture is not faithful rather than silently copying a blank or malformed region

### Requirement: Clipboard delivery and feedback

The control SHALL report its state throughout a capture, SHALL place the PNG on the
clipboard on success, and SHALL report the reason on failure.

#### Scenario: Capture in progress

- **WHEN** the control is activated
- **THEN** it becomes disabled and reports that capture is under way

#### Scenario: Capture succeeds

- **WHEN** the image is written to the clipboard
- **THEN** the control confirms success and afterwards returns to its resting label

#### Scenario: Clipboard image write is unsupported or refused

- **WHEN** the browser cannot accept an image on the clipboard
- **THEN** the control reports that reason specifically rather than a generic failure

### Requirement: Browser support

Both shipped browser builds SHALL offer the capture control, and the two builds SHALL
NOT diverge in which files they contain.

#### Scenario: Chrome build

- **WHEN** the Chrome build is loaded
- **THEN** the capture control is available and writes a PNG to the clipboard

#### Scenario: Firefox build

- **WHEN** the Firefox build is loaded
- **THEN** the capture control is available and writes a PNG to the clipboard

#### Scenario: Build parity is enforced

- **WHEN** the repository's parity check runs
- **THEN** it covers the capture feature's files and fails if the two builds differ
