## Context

See proposal.md. The extension currently injects JavaScript but no global PrairieLearn theme layer. PrairieLearn uses Bootstrap-like semantic components, MathJax, dynamic content, plots, and Monaco/workspace surfaces that cannot safely share a blanket inversion rule.

## Goals / Non-Goals

**Goals:** Semantic tokens, early preference application, bounded adapters, AA tracker UI, and screenshot/interaction verification.

**Non-Goals:** Restyling cross-origin frames, guaranteeing third-party question art, changing authored code themes beyond supported editor APIs, or replacing PrairieLearn layout.

## Decisions

### 1. Scope a token theme under one document attribute
Set `data-pl-tracker-theme=dark` on the root and define semantic custom properties plus targeted component rules. Alternative: `filter: invert`; rejected because it corrupts math, media, plots, and editors.

### 2. Bootstrap preference before full UI injection
Use a minimal early script/style path to read the local setting and system media query, then let the main script attach listeners and adapters. Keep one style element and one observer.

### 3. Use surface adapters and explicit exclusions
MathJax receives foreground/background-compatible rules; Monaco uses its supported theme API when accessible; same-origin dynamic surfaces are observed. Cross-origin frames and untested custom elements remain untouched.

### 4. Verify semantics, not screenshots alone
Add static token/selector tests, automated contrast checks for controlled pairs, and real-browser screenshots plus focus/selection/editor interaction checks at desktop and narrow widths.

## Risks / Trade-offs

- [Upstream selector drift] → Prefer semantic variables/attributes and maintain a visual fixture matrix.
- [Flash of light content] → Apply a minimal early theme while acknowledging content-script timing limits.
- [Author content becomes unreadable] → Exclude unsafe regions and provide immediate Off control.
- [Monaco API conflicts] → Detect supported instances and fall back to unchanged editor styling.

## Migration Plan

Ship preference plumbing with theme Off by default, add core shell/forms/tables, then math and editors, then dynamic surfaces. Enable Follow System onboarding after acceptance. Rollback removes style/attribute/listeners and leaves a harmless stored preference.

