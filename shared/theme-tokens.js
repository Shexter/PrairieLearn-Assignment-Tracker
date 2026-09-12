(function initPrairieLearnThemeTokens(global) {
  const SCHEMA_VERSION = 1;

  const THEME_MODES = Object.freeze({
    OFF: "off",
    ON: "on",
    FOLLOW_SYSTEM: "system",
    SYSTEM: "system",
  });

  const VALID_MODES = Object.freeze(["off", "on", "system", "follow-system"]);

  const DEFAULT_THEME_MODE = "off";

  const DEFAULT_PREFERENCE = Object.freeze({
    version: SCHEMA_VERSION,
    mode: DEFAULT_THEME_MODE,
  });

  function createError(field, message, code) {
    return {
      field,
      message,
      code,
      toString() {
        return message;
      },
    };
  }

  function parseHexColor(hex) {
    if (typeof hex !== "string") return null;
    let clean = hex.trim().replace(/^#/, "");
    if (clean.length === 3) {
      clean = clean[0] + clean[0] + clean[1] + clean[1] + clean[2] + clean[2];
    }
    if (clean.length !== 6 || !/^[0-9a-fA-F]{6}$/.test(clean)) {
      return null;
    }
    const intVal = parseInt(clean, 16);
    return {
      r: (intVal >> 16) & 255,
      g: (intVal >> 8) & 255,
      b: intVal & 255,
    };
  }

  function sRgbToLinear(c8) {
    const val = c8 / 255;
    return val <= 0.04045 ? val / 12.92 : Math.pow((val + 0.055) / 1.055, 2.4);
  }

  function getRelativeLuminance(color) {
    const rgb = parseHexColor(color);
    if (!rgb) return 0;
    const rLin = sRgbToLinear(rgb.r);
    const gLin = sRgbToLinear(rgb.g);
    const bLin = sRgbToLinear(rgb.b);
    return 0.2126 * rLin + 0.7152 * gLin + 0.0722 * bLin;
  }

  function getContrastRatio(color1, color2) {
    const l1 = getRelativeLuminance(color1);
    const l2 = getRelativeLuminance(color2);
    const lighter = Math.max(l1, l2);
    const darker = Math.min(l1, l2);
    return (lighter + 0.05) / (darker + 0.05);
  }

  function meetsContrastRequirement(color1, color2, requiredRatio) {
    return getContrastRatio(color1, color2) >= requiredRatio;
  }

  const TOKENS = Object.freeze({
    // Surfaces
    "surface-base": {
      light: "#ffffff",
      dark: "#121418",
      category: "surfaces",
      role: "surface",
      description: "Default page background surface",
    },
    "surface-card": {
      light: "#f8f9fa",
      dark: "#1a1d24",
      category: "surfaces",
      role: "surface",
      description: "Card, table container, and panel background",
    },
    "surface-subtle": {
      light: "#edf0f4",
      dark: "#242832",
      category: "surfaces",
      role: "surface",
      description: "Muted, zebra-striped, or secondary container background",
    },
    "surface-overlay": {
      light: "#ffffff",
      dark: "#20242d",
      category: "surfaces",
      role: "surface",
      description: "Modal dialog, popover, and dropdown elevated background",
    },
    "surface-input": {
      light: "#ffffff",
      dark: "#181b22",
      category: "surfaces",
      role: "surface",
      description: "Form input, textarea, and select background",
    },
    "surface-inverse": {
      light: "#121418",
      dark: "#f8f9fa",
      category: "surfaces",
      role: "surface",
      description: "Inverted surface such as tooltips or dark badges",
    },

    // Text
    "text-primary": {
      light: "#111827",
      dark: "#f9fafb",
      category: "text",
      role: "normal-text",
      minContrast: 4.5,
      against: ["surface-base", "surface-card", "surface-subtle", "surface-overlay", "surface-input"],
      description: "Primary body text, headings, and table content",
    },
    "text-secondary": {
      light: "#374151",
      dark: "#cbd5e1",
      category: "text",
      role: "normal-text",
      minContrast: 4.5,
      against: ["surface-base", "surface-card", "surface-subtle", "surface-overlay", "surface-input"],
      description: "Secondary metadata, dates, labels, and helper text",
    },
    "text-muted": {
      light: "#4b5563",
      dark: "#94a3b8",
      category: "text",
      role: "normal-text",
      minContrast: 4.5,
      against: ["surface-base", "surface-card", "surface-overlay", "surface-input"],
      description: "De-emphasized or muted text content",
    },
    "text-inverse": {
      light: "#ffffff",
      dark: "#111827",
      category: "text",
      role: "normal-text",
      minContrast: 4.5,
      against: ["surface-inverse"],
      description: "Text on inverted surfaces, dark buttons, or tooltips",
    },
    "text-heading": {
      light: "#111827",
      dark: "#f9fafb",
      category: "text",
      role: "large-text",
      minContrast: 3.0,
      against: ["surface-base", "surface-card", "surface-subtle", "surface-overlay"],
      description: "Large headers and titles (>= 18pt or >= 14pt bold)",
    },

    // Links
    "link-default": {
      light: "#0b57d0",
      dark: "#60a5fa",
      category: "links",
      role: "normal-text",
      minContrast: 4.5,
      against: ["surface-base", "surface-card", "surface-overlay"],
      description: "Default hyperlink color",
    },
    "link-hover": {
      light: "#063c96",
      dark: "#93c5fd",
      category: "links",
      role: "normal-text",
      minContrast: 4.5,
      against: ["surface-base", "surface-card", "surface-overlay"],
      description: "Hyperlink hover, focus, and active state",
    },

    // Borders
    "border-default": {
      light: "#71717a",
      dark: "#767676",
      category: "borders",
      role: "ui-boundary",
      minContrast: 3.0,
      against: ["surface-base", "surface-card"],
      description: "Standard card, table, and container perimeter border",
    },
    "border-subtle": {
      light: "#767676",
      dark: "#71717a",
      category: "borders",
      role: "ui-boundary",
      minContrast: 3.0,
      against: ["surface-base", "surface-card"],
      description: "Subtle dividers, table cell separators, and list boundaries",
    },
    "border-strong": {
      light: "#3f3f46",
      dark: "#9ca3af",
      category: "borders",
      role: "ui-boundary",
      minContrast: 3.0,
      against: ["surface-base", "surface-card"],
      description: "Emphasized boundaries, active inputs, and highlighted frames",
    },

    // Focus rings
    "focus-ring": {
      light: "#0b57d0",
      dark: "#8ab4f8",
      category: "focus rings",
      role: "ui-boundary",
      minContrast: 3.0,
      against: ["surface-base", "surface-card", "surface-input"],
      description: "Keyboard focus indicators and active selection outlines",
    },

    // Selection
    "selection-bg": {
      light: "#b8d7ff",
      dark: "#1e4976",
      category: "selection",
      role: "surface",
      description: "Selected text background highlight",
    },
    "selection-text": {
      light: "#00264d",
      dark: "#f0f8ff",
      category: "selection",
      role: "normal-text",
      minContrast: 4.5,
      against: ["selection-bg"],
      description: "Selected text foreground color",
    },

    // Status - Success
    "status-success-bg": {
      light: "#dcfce7",
      dark: "#0f391e",
      category: "status states",
      role: "surface",
      description: "Success alert, badge, and assessment pass background",
    },
    "status-success-text": {
      light: "#14532d",
      dark: "#86efac",
      category: "status states",
      role: "normal-text",
      minContrast: 4.5,
      against: ["status-success-bg", "surface-base"],
      description: "Success status text and icon color",
    },
    "status-success-border": {
      light: "#16a34a",
      dark: "#4ade80",
      category: "status states",
      role: "ui-boundary",
      minContrast: 3.0,
      against: ["surface-base", "status-success-bg"],
      description: "Success status boundary and indicator border",
    },

    // Status - Warning
    "status-warning-bg": {
      light: "#fef3c7",
      dark: "#3a2503",
      category: "status states",
      role: "surface",
      description: "Warning alert, due soon badge, and caution background",
    },
    "status-warning-text": {
      light: "#713f12",
      dark: "#fde047",
      category: "status states",
      role: "normal-text",
      minContrast: 4.5,
      against: ["status-warning-bg", "surface-base"],
      description: "Warning status text and icon color",
    },
    "status-warning-border": {
      light: "#a16207",
      dark: "#facc15",
      category: "status states",
      role: "ui-boundary",
      minContrast: 3.0,
      against: ["surface-base", "status-warning-bg"],
      description: "Warning status boundary and indicator border",
    },

    // Status - Error / Danger
    "status-error-bg": {
      light: "#fee2e2",
      dark: "#450a0a",
      category: "status states",
      role: "surface",
      description: "Error alert, overdue badge, and failure background",
    },
    "status-error-text": {
      light: "#7f1d1d",
      dark: "#fca5a5",
      category: "status states",
      role: "normal-text",
      minContrast: 4.5,
      against: ["status-error-bg", "surface-base"],
      description: "Error status text and icon color",
    },
    "status-error-border": {
      light: "#dc2626",
      dark: "#f87171",
      category: "status states",
      role: "ui-boundary",
      minContrast: 3.0,
      against: ["surface-base", "status-error-bg"],
      description: "Error status boundary and indicator border",
    },

    // Status - Info
    "status-info-bg": {
      light: "#e0f2fe",
      dark: "#082f49",
      category: "status states",
      role: "surface",
      description: "Informational callout and notice background",
    },
    "status-info-text": {
      light: "#0c4a6e",
      dark: "#7dd3fc",
      category: "status states",
      role: "normal-text",
      minContrast: 4.5,
      against: ["status-info-bg", "surface-base"],
      description: "Info status text and icon color",
    },
    "status-info-border": {
      light: "#0284c7",
      dark: "#38bdf8",
      category: "status states",
      role: "ui-boundary",
      minContrast: 3.0,
      against: ["surface-base", "status-info-bg"],
      description: "Info status boundary and indicator border",
    },
  });

  function normalizeMode(mode) {
    if (typeof mode !== "string") return null;
    const lower = mode.trim().toLowerCase();
    if (lower === "off" || lower === "light") return "off";
    if (lower === "on" || lower === "dark") return "on";
    if (
      lower === "system" ||
      lower === "follow system" ||
      lower === "follow-system" ||
      lower === "follow_system" ||
      lower === "auto"
    ) {
      return "system";
    }
    return null;
  }

  function validate(record) {
    const errors = [];
    if (record === null || typeof record !== "object" || Array.isArray(record)) {
      errors.push(createError("root", "Theme preference must be a non-null object", "INVALID_TYPE"));
      return { valid: false, errors };
    }

    const version = record.version !== undefined ? record.version : record.schemaVersion;
    if (version === undefined || version === null) {
      errors.push(createError("version", "Preference schema version is required", "MISSING_VERSION"));
    } else if (typeof version !== "number" || !Number.isInteger(version) || version <= 0) {
      errors.push(createError("version", "Preference schema version must be a positive integer", "INVALID_VERSION"));
    } else if (version > SCHEMA_VERSION) {
      errors.push(
        createError(
          "version",
          `Preference schema version ${version} is newer than supported version ${SCHEMA_VERSION}`,
          "UNSUPPORTED_VERSION"
        )
      );
    }

    if (record.mode === undefined || record.mode === null) {
      errors.push(createError("mode", "Preference mode is required", "MISSING_MODE"));
    } else if (typeof record.mode !== "string") {
      errors.push(createError("mode", "Preference mode must be a string", "INVALID_MODE_TYPE"));
    } else {
      const normalized = normalizeMode(record.mode);
      if (!normalized) {
        errors.push(
          createError(
            "mode",
            `Invalid theme mode: ${record.mode}. Must be one of: Off, On, Follow System (or 'off', 'on', 'system')`,
            "INVALID_MODE"
          )
        );
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  function createDefaultPreference() {
    return {
      version: SCHEMA_VERSION,
      mode: DEFAULT_THEME_MODE,
    };
  }

  function migrate(record) {
    if (record === undefined || record === null) {
      return createDefaultPreference();
    }

    if (typeof record === "boolean") {
      return {
        version: SCHEMA_VERSION,
        mode: record ? "on" : "off",
      };
    }

    if (typeof record === "string") {
      const normalized = normalizeMode(record);
      return {
        version: SCHEMA_VERSION,
        mode: normalized || DEFAULT_THEME_MODE,
      };
    }

    if (typeof record === "object" && !Array.isArray(record)) {
      let candidateMode = null;
      if (typeof record.mode === "string") {
        candidateMode = normalizeMode(record.mode);
      } else if (typeof record.darkMode === "boolean") {
        candidateMode = record.darkMode ? "on" : "off";
      } else if (typeof record.enabled === "boolean") {
        candidateMode = record.enabled ? "on" : "off";
      } else if (typeof record.dark === "boolean") {
        candidateMode = record.dark ? "on" : "off";
      } else if (typeof record.theme === "string") {
        candidateMode = normalizeMode(record.theme);
      }

      return {
        version: SCHEMA_VERSION,
        mode: candidateMode || DEFAULT_THEME_MODE,
      };
    }

    return createDefaultPreference();
  }

  function resolveEffectiveTheme(preference, systemPrefersDark = false) {
    const rawMode = preference && typeof preference === "object" ? preference.mode : preference;
    const mode = normalizeMode(typeof rawMode === "string" ? rawMode : "") || DEFAULT_THEME_MODE;
    if (mode === "on") return "dark";
    if (mode === "off") return "light";
    if (mode === "system") return systemPrefersDark ? "dark" : "light";
    return "light";
  }

  function getContrastPairs() {
    const pairs = [];
    for (const [tokenName, token] of Object.entries(TOKENS)) {
      if (!token.against) continue;
      const againstList = Array.isArray(token.against) ? token.against : [token.against];
      const minRatio = token.minContrast || (token.role === "normal-text" ? 4.5 : 3.0);
      for (const bgName of againstList) {
        const bgToken = TOKENS[bgName];
        if (!bgToken) continue;
        const lightRatio = getContrastRatio(token.light, bgToken.light);
        const darkRatio = getContrastRatio(token.dark, bgToken.dark);
        pairs.push({
          foreground: tokenName,
          background: bgName,
          category: token.category,
          role: token.role,
          minContrast: minRatio,
          lightRatio,
          darkRatio,
          lightPasses: lightRatio >= minRatio,
          darkPasses: darkRatio >= minRatio,
        });
      }
    }
    return pairs;
  }

  global.PrairieLearnThemeTokens = {
    SCHEMA_VERSION,
    THEME_MODES,
    VALID_MODES,
    DEFAULT_THEME_MODE,
    DEFAULT_PREFERENCE,
    createDefaultPreference,
    validate,
    validateThemePreference: validate,
    migrate,
    migrateThemePreference: migrate,
    resolveEffectiveTheme,
    parseHexColor,
    getRelativeLuminance,
    getContrastRatio,
    meetsContrastRequirement,
    TOKENS,
    THEME_TOKENS: TOKENS,
    tokens: TOKENS,
    getContrastPairs,
  };
})(globalThis);
