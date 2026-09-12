## Why

Generic page inversion can make PrairieLearn’s MathJax, semantic status colors, plots, and Monaco-based editors unreadable. A tracker-owned dark mode can be useful only if it is scoped, reversible, accessible, and verified against the page types students actually use.

## What Changes

- Add Off, On, and Follow System theme preferences in the extension popup and an accessible in-page toggle.
- Apply a semantic token-based dark theme to PrairieLearn chrome, cards, tables, forms, modals, alerts, assessment states, and tracker UI.
- Preserve MathJax contrast without double inversion and integrate with Monaco/editor themes without rewriting user code styles.
- Provide bounded handling for images, plots, iframes, workspaces, and third-party question content; exclude surfaces that cannot be themed safely.
- Apply the preference before normal content-script rendering where browser constraints permit, minimize flash, and restore the untouched page when disabled.

## Capabilities

### New Capabilities

- `tailored-dark-mode`: User-controlled, accessible, PrairieLearn-aware dark theming with explicit compatibility boundaries.

### Modified Capabilities

None.

## Impact

- Adds shared theme tokens, content CSS/script behavior, popup preferences, local storage, mutation handling for dynamic pages, visual fixtures, and Chrome/Firefox acceptance.
- Adds no network access and does not modify question answers, editor contents, or PrairieLearn source data.
- Requires contrast checks and screenshot inspection across home, course, assessment, question, gradebook, modal, MathJax, plot, and workspace/editor surfaces.

