## Purpose

Speeds question navigation and submission while preventing keyboard conflicts and accidental use of observable penalized or final attempts.

## ADDED Requirements

### Requirement: Keyboard shortcuts activate only safe visible actions
The extension SHALL map Ctrl/Cmd+Enter to the page's enabled Save & Grade or Submit action and Alt+Left/Right to visible previous/next navigation, without bypassing PrairieLearn validation.

#### Scenario: Submit shortcut is pressed
- **WHEN** focus is in a supported answer control and the student presses Ctrl/Cmd+Enter
- **THEN** the extension invokes the same enabled PrairieLearn action as a user click exactly once

#### Scenario: Shortcut conflicts with an editor
- **WHEN** an embedded editor or component claims the key event or the mapped action is absent or disabled
- **THEN** the extension takes no action

### Requirement: Attempt risk is derived only from visible state
The extension SHALL show remaining-attempt and penalty information only when it can parse that information from student-visible page state and SHALL label unavailable information as unknown.

#### Scenario: Limited penalized attempt is visible
- **WHEN** the page states attempt 2 of 3 and a 20% next-attempt penalty
- **THEN** the extension displays both facts adjacent to the submission action

### Requirement: Risk confirmation is configurable
The extension SHALL offer an opt-in confirmation for penalized submissions and SHALL require confirmation on an observable final attempt when final-attempt protection is enabled.

#### Scenario: Final attempt confirmation is cancelled
- **WHEN** the student triggers a protected final submission and cancels confirmation
- **THEN** no click or submission event reaches PrairieLearn

