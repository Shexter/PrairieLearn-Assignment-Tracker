const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { webcrypto } = require("node:crypto");
const { JSDOM } = require("jsdom");

const ROOT = path.resolve(__dirname, "../..");
const CHROME_DIR = path.join(ROOT, "Chrome");

const FUNCTION_NAMES = [
  "getGoogleClientId",
  "normalizeIdentityRedirect",
  "createOauthState",
  "getCalendarToken",
  "calendarApiRequest",
  "syncGoogleCalendar",
  "buildGoogleCalendarEvent",
  "digestHex",
  "buildTrackerIcs",
  "getCalendarItems",
  "filterCalendarItemsByScope",
  "buildValarmBlocks",
  "resolvePrairieLearnAssessmentUrl",
  "isEligibleForCalendarAction",
];

function hasOwn(object, key) {
  return Object.prototype.hasOwnProperty.call(object, key);
}

function snapshot(value) {
  if (typeof structuredClone === "function") {
    try {
      return structuredClone(value);
    } catch {
      // Some injected mocks deliberately contain functions; keep their value intact.
    }
  }
  return value;
}

function selectStorage(storage, keys) {
  if (keys == null) return { ...storage };
  if (typeof keys === "string") return { [keys]: storage[keys] };
  if (Array.isArray(keys)) {
    return Object.fromEntries(keys.map((key) => [key, storage[key]]));
  }
  if (typeof keys === "object") {
    return Object.fromEntries(
      Object.entries(keys).map(([key, fallback]) => [
        key,
        hasOwn(storage, key) ? storage[key] : fallback,
      ])
    );
  }
  return {};
}

function makeExtensionApi(overrides, effects, storage) {
  const source = overrides || {};
  const runtimeSource = source.runtime || {};
  const storageSource = source.storage?.local || {};
  const identitySource = source.identity || {};
  const tabsSource = source.tabs || {};
  const offscreenSource = source.offscreen || {};

  const api = {
    ...source,
    runtime: {
      ...runtimeSource,
      lastError: runtimeSource.lastError ?? null,
      onMessage: {
        ...(runtimeSource.onMessage || {}),
        addListener(listener) {
          effects.messageListeners.push(listener);
          return runtimeSource.onMessage?.addListener?.(listener);
        },
      },
      onInstalled: {
        ...(runtimeSource.onInstalled || {}),
        addListener(listener) {
          effects.installedListeners.push(listener);
          return runtimeSource.onInstalled?.addListener?.(listener);
        },
      },
      sendMessage: runtimeSource.sendMessage || (async () => ({ ok: true })),
    },
    storage: {
      ...(source.storage || {}),
      local: {
        ...storageSource,
        async get(keys) {
          effects.storageReads.push({ keys: snapshot(keys) });
          if (storageSource.get) return storageSource.get(keys);
          return selectStorage(storage, keys);
        },
        async set(items) {
          effects.storageWrites.push({ items: snapshot(items) });
          if (storageSource.set) return storageSource.set(items);
          Object.assign(storage, items);
        },
        async remove(keys) {
          const list = Array.isArray(keys) ? keys : [keys];
          effects.storageRemovals.push({ keys: snapshot(keys) });
          if (storageSource.remove) return storageSource.remove(keys);
          for (const key of list) delete storage[key];
        },
      },
    },
    identity: {
      ...identitySource,
      getRedirectURL(pathname) {
        effects.identityRedirectRequests.push({ pathname });
        if (identitySource.getRedirectURL) return identitySource.getRedirectURL(pathname);
        return "https://test-extension.chromiumapp.org/";
      },
      async launchWebAuthFlow(details) {
        effects.launchWebAuthFlowCalls.push(snapshot(details));
        if (identitySource.launchWebAuthFlow) {
          return identitySource.launchWebAuthFlow(details);
        }
        return null;
      },
    },
    tabs: {
      ...tabsSource,
      query: tabsSource.query || (async () => []),
      create: tabsSource.create || (async ({ url }) => ({ id: 1, status: "complete", url })),
      get: tabsSource.get || (async (id) => ({ id, status: "complete" })),
      remove: tabsSource.remove || (async () => {}),
      sendMessage: tabsSource.sendMessage || ((_tabId, _message, callback) => callback?.({ ok: true })),
      onUpdated: {
        addListener: tabsSource.onUpdated?.addListener || (() => {}),
        removeListener: tabsSource.onUpdated?.removeListener || (() => {}),
      },
    },
    offscreen: {
      ...offscreenSource,
      hasDocument: offscreenSource.hasDocument || (async () => false),
      createDocument: offscreenSource.createDocument || (async () => {}),
      closeDocument: offscreenSource.closeDocument || (async () => {}),
    },
  };

  return api;
}

function makeDate(clock) {
  const RealDate = Date;

  function ControlledDate(...args) {
    if (!new.target) return new RealDate(clock.now).toString();
    return Reflect.construct(RealDate, args.length ? args : [clock.now], new.target);
  }

  Object.setPrototypeOf(ControlledDate, RealDate);
  ControlledDate.prototype = RealDate.prototype;
  ControlledDate.now = () => Number(clock.now);
  return ControlledDate;
}

function normalizeHeaders(headers) {
  if (!headers) return {};
  if (typeof headers.entries === "function") return Object.fromEntries(headers.entries());
  if (Array.isArray(headers)) return Object.fromEntries(headers);
  return { ...headers };
}

function makeResponse(script = {}) {
  const status = script.status ?? 200;
  return {
    status,
    ok: script.ok ?? (status >= 200 && status < 300),
    headers: script.headers || {},
    async json() {
      if (script.json instanceof Error) throw script.json;
      return typeof script.json === "function" ? script.json() : (script.json ?? {});
    },
    async text() {
      if (script.text instanceof Error) throw script.text;
      return typeof script.text === "function" ? script.text() : (script.text ?? "");
    },
  };
}

/**
 * Loads Chrome/background.js and parsing.js in a fresh VM sandbox.
 *
 * Options accept partial `chrome` and `browser` mocks, scripted
 * `fetchResponses` (or a `fetch` handler), initial `storage`, a fixed `now`,
 * and `googleClientId`. Pass `browser: false` to deliberately omit `browser`.
 * The returned effects object records the extension's observable calls.
 *
 * Values created inside the VM have different prototypes from host values.
 * Node's assert.deepEqual therefore rejects some otherwise-identical objects;
 * compare fields individually or convert them to plain host objects first.
 */
function loadBackground(options = {}) {
  const clock = {
    now: options.now == null ? Date.now() : new Date(options.now).getTime(),
  };
  if (!Number.isFinite(clock.now)) throw new TypeError("options.now must be a valid date or timestamp");

  const effects = {
    fetchCalls: [],
    storageReads: [],
    storageWrites: [],
    storageRemovals: [],
    launchWebAuthFlowCalls: [],
    identityRedirectRequests: [],
    messageListeners: [],
    installedListeners: [],
  };
  const storage = { ...(options.storage || {}) };
  const chrome = makeExtensionApi(options.chrome, effects, storage);
  const browser = options.browser === false
    ? undefined
    : options.browser
      ? makeExtensionApi(options.browser, effects, storage)
      : chrome;
  const scripts = Array.isArray(options.fetchResponses) ? [...options.fetchResponses] : [];

  const fetchMock = async (input, init = {}) => {
    const call = {
      url: typeof input === "string" ? input : String(input?.url || input),
      method: init.method || "GET",
      headers: normalizeHeaders(init.headers),
      body: init.body,
    };
    effects.fetchCalls.push(call);
    const scripted = options.fetch
      ? await options.fetch(call.url, init, effects.fetchCalls.length - 1)
      : scripts.shift();
    return makeResponse(scripted);
  };

  const dom = new JSDOM("<!doctype html><body>");
  let context;
  const sandbox = {
    chrome,
    console: options.console || console,
    fetch: fetchMock,
    setTimeout,
    clearTimeout,
    AbortController,
    DOMParser: dom.window.DOMParser,
    URL,
    URLSearchParams,
    TextEncoder,
    Uint8Array,
    crypto: options.crypto || webcrypto,
    Date: makeDate(clock),
    importScripts(...filenames) {
      for (const filename of filenames) {
        const scriptPath = path.resolve(CHROME_DIR, filename);
        if (!scriptPath.startsWith(`${CHROME_DIR}${path.sep}`) || !fs.existsSync(scriptPath)) {
          throw new Error(`Unable to import background dependency: ${filename}`);
        }
        vm.runInContext(fs.readFileSync(scriptPath, "utf8"), context, { filename: scriptPath });
      }
    },
  };
  if (browser) sandbox.browser = browser;
  if (hasOwn(options, "googleClientId") && options.googleClientId !== undefined) {
    sandbox.PL_GOOGLE_CLIENT_ID = options.googleClientId;
  }
  sandbox.globalThis = sandbox;
  sandbox.self = sandbox;

  context = vm.createContext(sandbox);
  vm.runInContext(
    fs.readFileSync(path.join(CHROME_DIR, "background.js"), "utf8"),
    context,
    { filename: path.join(CHROME_DIR, "background.js") }
  );

  const functions = Object.fromEntries(
    FUNCTION_NAMES.map((name) => [name, vm.runInContext(name, context)])
  );

  return { context, functions, chrome, browser, effects, storage, clock };
}

module.exports = loadBackground;
module.exports.loadBackground = loadBackground;

