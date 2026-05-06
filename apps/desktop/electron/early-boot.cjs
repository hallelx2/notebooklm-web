// CommonJS — required at the very top of `main.cjs`, before any other
// require pulls a value out of `process.env`.
//
// Two responsibilities:
//
//   1. Load `<DATA_DIR>/.env` into `process.env`. The api-server bundle
//      already does this inside `getStubAdapter`, but by the time it
//      runs main.cjs has already captured constants like
//      `ENABLE_DEVTOOLS_OVERRIDE` at module-load time — so a value
//      placed in the data-dir .env file would never flip the gate.
//      Doing it here makes the data-dir .env authoritative for both
//      processes from the very first read.
//
//   2. Tee `console.log/info/warn/error/debug` and uncaught crashes
//      to `<DATA_DIR>/desktop.log` so support has a single file with
//      the full timeline. Packaged Electron apps on Windows have no
//      console window, and the renderer devtools can't see main-side
//      output anyway — without this file, an api-server crash is
//      invisible to the user and to us.
//
// Both steps fail open: if the data dir is set to `memory:` or the
// log file can't be opened, this module silently does nothing rather
// than blocking app startup.

const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");

const MEMORY_MODE = process.env.NOTEBOOKLM_DATA_DIR === "memory:";

function resolveDataDir() {
  if (MEMORY_MODE) return null;
  const v = process.env.NOTEBOOKLM_DATA_DIR;
  if (v && v.length > 0) return v;
  return path.join(os.homedir(), ".notebooklm");
}

// Tiny inline dotenv parser — mirrors `parseDotenv` in
// apps/desktop/src/server/stub-adapter.ts so both code paths agree on
// what counts as a valid line.
function parseDotenv(text) {
  const out = {};
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    const isQuoted =
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"));
    if (!isQuoted) {
      const hashAt = value.indexOf(" #");
      if (hashAt !== -1) value = value.slice(0, hashAt).trim();
    } else {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

function loadDotenv(dataDir) {
  if (!dataDir) return 0;
  const envPath = path.join(dataDir, ".env");
  if (!fs.existsSync(envPath)) return 0;
  let parsed;
  try {
    parsed = parseDotenv(fs.readFileSync(envPath, "utf8"));
  } catch {
    return 0;
  }
  let applied = 0;
  for (const [k, v] of Object.entries(parsed)) {
    if (process.env[k] === undefined) {
      process.env[k] = v;
      applied++;
    }
  }
  return applied;
}

function formatArg(arg) {
  if (arg instanceof Error) return arg.stack || arg.message;
  if (typeof arg === "string") return arg;
  if (arg === null || arg === undefined) return String(arg);
  try {
    return JSON.stringify(arg);
  } catch {
    return String(arg);
  }
}

function installLogger(dataDir) {
  if (!dataDir) return null;
  try {
    fs.mkdirSync(dataDir, { recursive: true });
  } catch {
    // If the data dir can't be created we have bigger problems than
    // missing logs — let the rest of the app fail with its own clearer
    // error.
    return null;
  }
  const logPath = path.join(dataDir, "desktop.log");

  // Lightweight rotation: when the existing log is >5 MB, slide it
  // to `desktop.log.1` and start a fresh file. Polling spam from the
  // studio panel would otherwise let this grow unbounded.
  try {
    const stats = fs.statSync(logPath);
    if (stats.size > 5 * 1024 * 1024) {
      try {
        fs.renameSync(logPath, logPath + ".1");
      } catch {
        // best effort — if the rename fails (file in use, etc.) we
        // just keep appending to the existing one.
      }
    }
  } catch {
    // No prior log — first run or fresh data dir. Nothing to rotate.
  }

  let stream;
  try {
    stream = fs.createWriteStream(logPath, { flags: "a" });
  } catch {
    return null;
  }

  function write(level, args) {
    const stamp = new Date().toISOString();
    const text = args.map(formatArg).join(" ");
    try {
      stream.write(`[${stamp}] [${level}] ${text}\n`);
    } catch {
      // Disk full / handle revoked — drop the line rather than
      // recursing through console.error and looping.
    }
  }

  // Keep the original methods so dev runs (with a real terminal
  // attached) still print to stderr/stdout — wrappers tee, they don't
  // replace.
  const original = {
    log: console.log.bind(console),
    info: console.info.bind(console),
    warn: console.warn.bind(console),
    error: console.error.bind(console),
    debug: console.debug.bind(console),
  };

  function wrap(level, fn) {
    return (...args) => {
      write(level, args);
      try {
        fn(...args);
      } catch {
        // EPIPE on a closed stdout in detached GUI launches — drop.
      }
    };
  }

  console.log = wrap("log", original.log);
  console.info = wrap("info", original.info);
  console.warn = wrap("warn", original.warn);
  console.error = wrap("error", original.error);
  console.debug = wrap("debug", original.debug);

  process.on("uncaughtException", (err) => {
    write("uncaughtException", [
      err instanceof Error ? err.stack || err.message : String(err),
    ]);
  });
  process.on("unhandledRejection", (reason) => {
    const text =
      reason instanceof Error
        ? reason.stack || reason.message
        : formatArg(reason);
    write("unhandledRejection", [text]);
  });

  write("init", [
    `logger started, pid=${process.pid}, electron=${process.versions.electron || "n/a"}, node=${process.version}, platform=${process.platform}, arch=${process.arch}`,
  ]);

  return { logPath, stream };
}

const dataDir = resolveDataDir();
const applied = loadDotenv(dataDir);
const handle = installLogger(dataDir);

if (handle && applied > 0) {
  // After installLogger runs, console.log already tees to the file.
  // biome-ignore lint/suspicious/noConsole: visible diagnostic
  console.log(
    `[early-boot] applied ${applied} env override(s) from ${path.join(dataDir, ".env")}`,
  );
}

/**
 * Append a line tagged with a custom source label. Used by main.cjs to
 * fold in renderer-side `console-message` events so the log file holds
 * a single timeline across both processes.
 */
function logFromSource(source, level, message) {
  if (!handle) return;
  const stamp = new Date().toISOString();
  try {
    handle.stream.write(`[${stamp}] [${source}:${level}] ${message}\n`);
  } catch {
    // best effort
  }
}

module.exports = {
  dataDir,
  logPath: handle ? handle.logPath : null,
  logFromSource,
};
