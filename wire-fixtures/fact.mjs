// The resident implementation of FACT_WIRE.md: a reader, a canonical writer, the identity frame
// and the laws, written from the specification text alone. Dependency-free (Node's own `crypto`
// is the only import). Section references are to FACT_WIRE.md.
//
// It is ONE conformant host, never the definition: where it and the text disagree, the text is
// fixed first and this file second (FACT_WIRE.md §9.4).

import { createHash } from "node:crypto";

export const WIRE_VERSION = 1;

// ── §3.6 the closed reject vocabulary ────────────────────────────────────────────────────────
export const REJECT_CLASSES = [
  "not-canonical",
  "shape-invalid",
  "kind-unknown",
  "version-unsupported",
  "decimal-invalid",
  "instant-invalid",
  "token-invalid",
  "interval-inverted",
  "period-inverted",
  "fact-id-mismatch",
  "unit-invalid",
  "display-format-invalid",
  "registry-unordered",
  "history-id-repeated",
  "supersedes-unknown",
  "supersedes-cross-lineage",
  "supersedes-not-later",
  "supersedes-not-head",
  "supersedes-missing",
  "view-mismatch",
  "status-mismatch",
];

export class Refusal extends Error {
  constructor(cls, message) {
    super(`${cls}: ${message}`);
    if (!REJECT_CLASSES.includes(cls)) throw new Error(`internal: unknown reject class '${cls}'`);
    this.cls = cls;
  }
}
const refuse = (cls, message) => {
  throw new Refusal(cls, message);
};

// ── §3.1 ordinal order: by UTF-16 code unit ──────────────────────────────────────────────────
export function ordinal(a, b) {
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    const d = a.charCodeAt(i) - b.charCodeAt(i);
    if (d !== 0) return d < 0 ? -1 : 1;
  }
  return a.length === b.length ? 0 : a.length < b.length ? -1 : 1;
}

// ── §4.1 the frame ───────────────────────────────────────────────────────────────────────────
/** The length the frame counts: UTF-16 code units — a code point above U+FFFF counts two. */
export function utf16Length(s) {
  let n = 0;
  for (const ch of s) n += ch.codePointAt(0) > 0xffff ? 2 : 1;
  return n;
}
export const frameText = (fields) => fields.map((f) => `${utf16Length(f)}:${f}`).join("");
export const sha256Hex = (text) => createHash("sha256").update(Buffer.from(text, "utf8")).digest("hex");
export const sha256HexOfBytes = (bytes) => createHash("sha256").update(bytes).digest("hex");

// ── §3.3 decimal text ────────────────────────────────────────────────────────────────────────
const DECIMAL = /^-?(0|[1-9][0-9]*)(\.[0-9]+)?$/;
const MAX_COEFFICIENT = 79228162514264337593543950335n; // 2^96 - 1
/** Parse decimal text to { coefficient: BigInt, scale } or refuse. The text is the value. */
export function parseDecimal(text, at) {
  if (typeof text !== "string") refuse("shape-invalid", `${at}: a decimal is a string`);
  if (!DECIMAL.test(text)) refuse("decimal-invalid", `${at}: '${text}' is not decimal text`);
  const negative = text.startsWith("-");
  const body = negative ? text.slice(1) : text;
  const [whole, fraction = ""] = body.split(".");
  if (fraction.length > 28) refuse("decimal-invalid", `${at}: '${text}' has more than 28 digits after the point`);
  const coefficient = BigInt(whole + fraction);
  if (coefficient > MAX_COEFFICIENT) refuse("decimal-invalid", `${at}: '${text}' is beyond the 96-bit coefficient`);
  if (negative && coefficient === 0n) refuse("decimal-invalid", `${at}: '${text}' is a negative zero`);
  return { coefficient: negative ? -coefficient : coefficient, scale: fraction.length };
}
export function compareDecimal(a, b) {
  const s = Math.max(a.scale, b.scale);
  const x = a.coefficient * 10n ** BigInt(s - a.scale);
  const y = b.coefficient * 10n ** BigInt(s - b.scale);
  return x < y ? -1 : x > y ? 1 : 0;
}

// ── §3.4 instants ────────────────────────────────────────────────────────────────────────────
const INSTANT = /^([0-9]{4})-([0-9]{2})-([0-9]{2})T([0-9]{2}):([0-9]{2}):([0-9]{2})(?:\.([0-9]+))?Z$/;
const isLeap = (y) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
const DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
/** Days from 0001-01-01 to y-m-d, proleptic Gregorian. */
function dayNumber(y, m, d) {
  const py = BigInt(y - 1);
  let days = py * 365n + py / 4n - py / 100n + py / 400n;
  for (let i = 0; i < m - 1; i++) days += BigInt(DAYS[i] + (i === 1 && isLeap(y) ? 1 : 0));
  return days + BigInt(d - 1);
}
/** Parse an instant: { ticks: BigInt (100 ns since 0001-01-01T00:00:00Z), text } or refuse. */
export function parseInstant(text, at) {
  if (typeof text !== "string") refuse("shape-invalid", `${at}: an instant is a string`);
  const m = INSTANT.exec(text);
  if (!m) refuse("instant-invalid", `${at}: '${text}' is not a UTC instant`);
  const [y, mo, d, h, mi, s] = m.slice(1, 7).map(Number);
  const fraction = m[7];
  if (y < 1) refuse("instant-invalid", `${at}: year 0000 is out of range`);
  if (mo < 1 || mo > 12) refuse("instant-invalid", `${at}: month ${mo}`);
  const monthDays = DAYS[mo - 1] + (mo === 2 && isLeap(y) ? 1 : 0);
  if (d < 1 || d > monthDays) refuse("instant-invalid", `${at}: day ${d} of ${y}-${mo}`);
  if (h > 23 || mi > 59 || s > 59) refuse("instant-invalid", `${at}: time of day out of range`);
  if (fraction !== undefined) {
    if (fraction.length > 7) refuse("instant-invalid", `${at}: '${text}' is finer than 100 ns`);
    if (/0$/.test(fraction)) refuse("instant-invalid", `${at}: '${text}' carries a trailing zero in its fraction`);
  }
  const sub = BigInt((fraction ?? "").padEnd(7, "0"));
  const ticks = ((dayNumber(y, mo, d) * 86400n + BigInt(h * 3600 + mi * 60 + s)) * 10000000n) + sub;
  return { ticks, text };
}
/** §4.3 the identity rendering: always seven fractional digits. */
export function identityInstant(instant) {
  const m = INSTANT.exec(instant.text);
  return `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}.${(m[7] ?? "").padEnd(7, "0")}Z`;
}

// ── §3.2 the canonical writer ────────────────────────────────────────────────────────────────
function writeString(s) {
  let out = '"';
  for (const ch of s) {
    const c = ch.codePointAt(0);
    if (ch === '"') out += '\\"';
    else if (ch === "\\") out += "\\\\";
    else if (c === 0x08) out += "\\b";
    else if (c === 0x09) out += "\\t";
    else if (c === 0x0a) out += "\\n";
    else if (c === 0x0c) out += "\\f";
    else if (c === 0x0d) out += "\\r";
    else if (c < 0x20) out += "\\u00" + c.toString(16).padStart(2, "0");
    else out += ch;
  }
  return out + '"';
}
/**
 * Encode a value tree. A record is a `Rec` (ordered [name, value] pairs, written in that order); a
 * map is a `Map` (written in ordinal key order); arrays keep their order; null, booleans,
 * integers and strings are themselves.
 */
export class Rec {
  constructor(pairs) {
    this.pairs = pairs;
  }
}
export function encode(v) {
  if (v === null) return "null";
  if (v === true) return "true";
  if (v === false) return "false";
  if (typeof v === "number") {
    if (!Number.isSafeInteger(v)) throw new Error("internal: only integers are written as numbers");
    return String(v);
  }
  if (typeof v === "string") return writeString(v);
  if (Array.isArray(v)) return "[" + v.map(encode).join(",") + "]";
  if (v instanceof Rec) return "{" + v.pairs.map(([k, x]) => writeString(k) + ":" + encode(x)).join(",") + "}";
  if (v instanceof Map)
    return "{" + [...v.keys()].sort(ordinal).map((k) => writeString(k) + ":" + encode(v.get(k))).join(",") + "}";
  throw new Error("internal: cannot encode " + typeof v);
}

// ── the reader's shape helpers ───────────────────────────────────────────────────────────────
class Ctx {
  constructor() {
    this.unknown = [];
  }
}
function obj(v, at) {
  if (v === null || typeof v !== "object" || Array.isArray(v)) refuse("shape-invalid", `${at}: expected an object`);
  return v;
}
/** Take the declared members of a record, noting any member it does not declare. */
function members(ctx, v, at, names) {
  obj(v, at);
  for (const k of Object.keys(v)) if (!names.includes(k)) ctx.unknown.push(`${at}.${k}`);
  for (const n of names) if (!(n in v)) refuse("shape-invalid", `${at}: member '${n}' is missing`);
  return v;
}
function str(v, at, { nonEmpty = false } = {}) {
  if (typeof v !== "string") refuse("shape-invalid", `${at}: expected a string`);
  if (!v.isWellFormed()) refuse("shape-invalid", `${at}: the string is not well-formed Unicode`);
  if (nonEmpty && v.length === 0) refuse("shape-invalid", `${at}: must not be empty`);
  return v;
}
const optStr = (v, at, o) => (v === null ? null : str(v, at, o));
function int(v, at, lo, hi) {
  if (!Number.isInteger(v)) refuse("shape-invalid", `${at}: expected an integer`);
  if (v < lo || v > hi) refuse("shape-invalid", `${at}: ${v} is outside ${lo}..${hi}`);
  return v;
}
function bool(v, at) {
  if (typeof v !== "boolean") refuse("shape-invalid", `${at}: expected a boolean`);
  return v;
}
function arr(v, at) {
  if (!Array.isArray(v)) refuse("shape-invalid", `${at}: expected an array`);
  return v;
}
function kindOf(v, at, known) {
  obj(v, at);
  if (typeof v.kind !== "string") refuse("shape-invalid", `${at}.kind: expected a string`);
  if (!known.includes(v.kind)) refuse("kind-unknown", `${at}.kind: '${v.kind}' is not one of ${known.join(", ")}`);
  return v.kind;
}
function head(ctx, v, at, kind) {
  if (v.kind !== kind) refuse("kind-unknown", `${at}.kind: expected '${kind}'`);
  if (!("wireVersion" in v)) refuse("shape-invalid", `${at}: member 'wireVersion' is missing`);
  if (!Number.isInteger(v.wireVersion)) refuse("shape-invalid", `${at}.wireVersion: expected an integer`);
  if (v.wireVersion !== WIRE_VERSION) refuse("version-unsupported", `${at}.wireVersion: ${v.wireVersion}`);
}

const FACT_ID = /^[0-9a-f]{64}$/;
const CONTENT_ADDRESS = /^sha256:[0-9a-f]{64}$/;
export const DEFINITION_ID = /^[a-z0-9][a-z0-9._-]*$/;

// ── §5 the Fact record ───────────────────────────────────────────────────────────────────────
const FACT_MEMBERS = ["kind", "wireVersion", "id", "subject", "metric", "value", "period", "asOf", "method", "evidence", "confidence", "supersedes", "disclosure"];

function readSubject(ctx, v, at) {
  members(ctx, v, at, ["hierarchy", "path"]);
  const hierarchy = str(v.hierarchy, `${at}.hierarchy`, { nonEmpty: true });
  if (hierarchy.includes("/")) refuse("token-invalid", `${at}.hierarchy: '${hierarchy}' contains '/'`);
  const path = arr(v.path, `${at}.path`).map((p, i) => {
    const s = str(p, `${at}.path[${i}]`, { nonEmpty: true });
    if (s.includes(">")) refuse("token-invalid", `${at}.path[${i}]: '${s}' contains '>'`);
    return s;
  });
  return { hierarchy, path };
}

function readValue(ctx, v, at) {
  const kind = kindOf(v, at, ["scalar", "interval", "series", "distribution", "categorical", "absent"]);
  switch (kind) {
    case "scalar":
      members(ctx, v, at, ["kind", "value"]);
      parseDecimal(v.value, `${at}.value`);
      return { kind, value: v.value };
    case "interval": {
      members(ctx, v, at, ["kind", "low", "high"]);
      const lo = parseDecimal(v.low, `${at}.low`);
      const hi = parseDecimal(v.high, `${at}.high`);
      if (compareDecimal(lo, hi) > 0) refuse("interval-inverted", `${at}: low ${v.low} exceeds high ${v.high}`);
      return { kind, low: v.low, high: v.high };
    }
    case "series":
      members(ctx, v, at, ["kind", "address", "locator"]);
      str(v.address, `${at}.address`);
      if (!CONTENT_ADDRESS.test(v.address)) refuse("shape-invalid", `${at}.address: '${v.address}' is not a sha256 content address`);
      return { kind, address: v.address, locator: optStr(v.locator, `${at}.locator`, { nonEmpty: true }) };
    case "distribution": {
      members(ctx, v, at, ["kind", "buckets"]);
      const b = obj(v.buckets, `${at}.buckets`);
      const keys = Object.keys(b);
      if (keys.length === 0) refuse("shape-invalid", `${at}.buckets: a distribution has at least one bucket`);
      const buckets = new Map();
      for (const k of keys) {
        str(k, `${at}.buckets key`, { nonEmpty: true });
        if (k.includes("=") || k.includes(";")) refuse("token-invalid", `${at}.buckets: key '${k}' contains '=' or ';'`);
        parseDecimal(b[k], `${at}.buckets.${k}`);
        buckets.set(k, b[k]);
      }
      return { kind, buckets };
    }
    case "categorical":
      members(ctx, v, at, ["kind", "value"]);
      return { kind, value: str(v.value, `${at}.value`, { nonEmpty: true }) };
    case "absent":
      members(ctx, v, at, ["kind", "reason"]);
      return { kind, reason: str(v.reason, `${at}.reason`, { nonEmpty: true }) };
  }
}

function readPeriod(ctx, v, at) {
  members(ctx, v, at, ["from", "to", "label"]);
  const from = parseInstant(v.from, `${at}.from`);
  const to = parseInstant(v.to, `${at}.to`);
  if (from.ticks > to.ticks) refuse("period-inverted", `${at}: from ${v.from} is after to ${v.to}`);
  return { from, to, label: optStr(v.label, `${at}.label`, { nonEmpty: true }) };
}

function readMethod(ctx, v, at) {
  const kind = kindOf(v, at, ["computed", "humanAsserted", "imported"]);
  switch (kind) {
    case "computed": {
      members(ctx, v, at, ["kind", "operation", "version", "paramHash"]);
      const operation = str(v.operation, `${at}.operation`, { nonEmpty: true });
      const version = str(v.version, `${at}.version`, { nonEmpty: true });
      for (const [n, s] of [["operation", operation], ["version", version]])
        if (s.includes(":")) refuse("token-invalid", `${at}.${n}: '${s}' contains ':'`);
      return { kind, operation, version, paramHash: str(v.paramHash, `${at}.paramHash`) };
    }
    case "humanAsserted":
      members(ctx, v, at, ["kind", "principal"]);
      return { kind, principal: str(v.principal, `${at}.principal`, { nonEmpty: true }) };
    case "imported":
      members(ctx, v, at, ["kind", "certificate"]);
      return { kind, certificate: str(v.certificate, `${at}.certificate`, { nonEmpty: true }) };
  }
}

function readEvidence(ctx, v, at) {
  members(ctx, v, at, ["resultRef", "inputHashes", "triggerRef"]);
  return {
    resultRef: optStr(v.resultRef, `${at}.resultRef`, { nonEmpty: true }),
    inputHashes: arr(v.inputHashes, `${at}.inputHashes`).map((h, i) => str(h, `${at}.inputHashes[${i}]`, { nonEmpty: true })),
    triggerRef: optStr(v.triggerRef, `${at}.triggerRef`, { nonEmpty: true }),
  };
}

function readConfidence(ctx, v, at) {
  if (v === null) return null;
  members(ctx, v, at, ["value", "basis"]);
  parseDecimal(v.value, `${at}.value`);
  return { value: v.value, basis: optStr(v.basis, `${at}.basis`, { nonEmpty: true }) };
}

function readDisclosure(ctx, v, at) {
  const kind = kindOf(v, at, ["surfaceable", "internal", "restricted"]);
  if (kind === "restricted") {
    members(ctx, v, at, ["kind", "policy"]);
    return { kind, policy: str(v.policy, `${at}.policy`, { nonEmpty: true }) };
  }
  members(ctx, v, at, ["kind"]);
  return { kind };
}

function readFactRecord(ctx, v, at) {
  obj(v, at);
  head(ctx, v, at, "fact");
  members(ctx, v, at, FACT_MEMBERS);
  const id = str(v.id, `${at}.id`);
  if (!FACT_ID.test(id)) refuse("shape-invalid", `${at}.id: '${id}' is not 64 lower-case hex digits`);
  const fact = {
    id,
    subject: readSubject(ctx, v.subject, `${at}.subject`),
    metric: str(v.metric, `${at}.metric`, { nonEmpty: true }),
    value: readValue(ctx, v.value, `${at}.value`),
    period: readPeriod(ctx, v.period, `${at}.period`),
    asOf: parseInstant(v.asOf, `${at}.asOf`),
    method: readMethod(ctx, v.method, `${at}.method`),
    evidence: readEvidence(ctx, v.evidence, `${at}.evidence`),
    confidence: readConfidence(ctx, v.confidence, `${at}.confidence`),
    supersedes: v.supersedes === null ? null : str(v.supersedes, `${at}.supersedes`),
    disclosure: readDisclosure(ctx, v.disclosure, `${at}.disclosure`),
  };
  if (fact.supersedes !== null && !FACT_ID.test(fact.supersedes))
    refuse("shape-invalid", `${at}.supersedes: '${fact.supersedes}' is not a fact id`);
  const computed = factId(fact);
  if (computed !== id) refuse("fact-id-mismatch", `${at}.id: states ${id}, the frame gives ${computed}`);
  return fact;
}

// ── §4 identity ──────────────────────────────────────────────────────────────────────────────
export const subjectRendering = (s) => `${s.hierarchy}/${s.path.join(">")}`;
export const periodRendering = (p) => `${identityInstant(p.from)}..${identityInstant(p.to)}`;
export function methodIdentity(m) {
  switch (m.kind) {
    case "computed":
      return `computed:${m.operation}:${m.version}:${m.paramHash}`;
    case "humanAsserted":
      return `asserted:${m.principal}`;
    case "imported":
      return `imported:${m.certificate}`;
  }
}
export function valueHashText(v) {
  switch (v.kind) {
    case "scalar":
      return `scalar:${v.value}`;
    case "interval":
      return `interval:${v.low}:${v.high}`;
    case "series":
      return `series:${v.address}`;
    case "distribution":
      return "dist:" + [...v.buckets.keys()].sort(ordinal).map((k) => `${k}=${v.buckets.get(k)}`).join(";");
    case "categorical":
      return `cat:${v.value}`;
    case "absent":
      return `absent:${v.reason}`;
  }
}
export const valueHash = (v) => sha256Hex(valueHashText(v));
export function effectiveInputs(f) {
  const declared = f.evidence.inputHashes;
  return f.method.kind === "humanAsserted" ? [valueHash(f.value), ...declared] : [...declared];
}
export function identityFields(f) {
  return [
    "fact",
    subjectRendering(f.subject),
    f.metric,
    periodRendering(f.period),
    methodIdentity(f.method),
    ...effectiveInputs(f).sort(ordinal),
  ];
}
export const factId = (f) => sha256Hex(frameText(identityFields(f)));
/** §6.1 the lineage key, as a tuple compared member for member. */
export const lineageKey = (f) => [subjectRendering(f.subject), f.metric, periodRendering(f.period), methodIdentity(f.method)];
export const sameLineage = (a, b) => lineageKey(a).every((x, i) => x === lineageKey(b)[i]);

// ── the canonical form of each record (§5, §7) ───────────────────────────────────────────────
export function factValueTree(f) {
  const value = (() => {
    const v = f.value;
    switch (v.kind) {
      case "scalar":
        return new Rec([["kind", "scalar"], ["value", v.value]]);
      case "interval":
        return new Rec([["kind", "interval"], ["low", v.low], ["high", v.high]]);
      case "series":
        return new Rec([["kind", "series"], ["address", v.address], ["locator", v.locator]]);
      case "distribution":
        return new Rec([["kind", "distribution"], ["buckets", new Map(v.buckets)]]);
      case "categorical":
        return new Rec([["kind", "categorical"], ["value", v.value]]);
      case "absent":
        return new Rec([["kind", "absent"], ["reason", v.reason]]);
    }
  })();
  const m = f.method;
  const method =
    m.kind === "computed"
      ? new Rec([["kind", "computed"], ["operation", m.operation], ["version", m.version], ["paramHash", m.paramHash]])
      : m.kind === "humanAsserted"
        ? new Rec([["kind", "humanAsserted"], ["principal", m.principal]])
        : new Rec([["kind", "imported"], ["certificate", m.certificate]]);
  const d = f.disclosure;
  const disclosure = d.kind === "restricted" ? new Rec([["kind", "restricted"], ["policy", d.policy]]) : new Rec([["kind", d.kind]]);
  return new Rec([
    ["kind", "fact"],
    ["wireVersion", WIRE_VERSION],
    ["id", f.id],
    ["subject", new Rec([["hierarchy", f.subject.hierarchy], ["path", f.subject.path]])],
    ["metric", f.metric],
    ["value", value],
    ["period", new Rec([["from", f.period.from.text], ["to", f.period.to.text], ["label", f.period.label]])],
    ["asOf", f.asOf.text],
    ["method", method],
    ["evidence", new Rec([["resultRef", f.evidence.resultRef], ["inputHashes", f.evidence.inputHashes], ["triggerRef", f.evidence.triggerRef]])],
    ["confidence", f.confidence === null ? null : new Rec([["value", f.confidence.value], ["basis", f.confidence.basis]])],
    ["supersedes", f.supersedes],
    ["disclosure", disclosure],
  ]);
}

// ── §7 definitions and registries ────────────────────────────────────────────────────────────
const DIRECTIONS = ["higherIsBetter", "lowerIsBetter", "neutral"];
const STYLES = ["verbatim", "number", "percent", "currency"];

function readDefinitionId(v, at) {
  const id = str(v, at, { nonEmpty: true });
  if (!DEFINITION_ID.test(id)) refuse("token-invalid", `${at}: '${id}' is not a definition id`);
  return id;
}

function readMetricDefinition(ctx, v, at) {
  obj(v, at);
  head(ctx, v, at, "metricDefinition");
  members(ctx, v, at, ["kind", "wireVersion", "id", "name", "unit", "dimensionality", "direction", "displayFormat", "staleness", "producingOperation", "canonicalMethod", "rollUp", "context"]);
  const def = {
    id: readDefinitionId(v.id, `${at}.id`),
    name: str(v.name, `${at}.name`, { nonEmpty: true }),
    unit: str(v.unit, `${at}.unit`),
    dimensionality: str(v.dimensionality, `${at}.dimensionality`, { nonEmpty: true }),
    direction: str(v.direction, `${at}.direction`),
    producingOperation: optStr(v.producingOperation, `${at}.producingOperation`, { nonEmpty: true }),
    canonicalMethod: optStr(v.canonicalMethod, `${at}.canonicalMethod`, { nonEmpty: true }),
    context: optStr(v.context, `${at}.context`, { nonEmpty: true }),
  };
  if (!DIRECTIONS.includes(def.direction)) refuse("shape-invalid", `${at}.direction: '${def.direction}'`);
  const why = unitTextViolation(def.unit);
  if (why) refuse("unit-invalid", `${at}.unit: ${why}`);
  // displayFormat
  const fmt = members(ctx, v.displayFormat, `${at}.displayFormat`, ["style", "fractionDigits", "grouping"]);
  const style = str(fmt.style, `${at}.displayFormat.style`);
  if (!STYLES.includes(style)) refuse("shape-invalid", `${at}.displayFormat.style: '${style}'`);
  const fractionDigits = fmt.fractionDigits === null ? null : int(fmt.fractionDigits, `${at}.displayFormat.fractionDigits`, 0, 28);
  const grouping = bool(fmt.grouping, `${at}.displayFormat.grouping`);
  if (style === "verbatim" && (fractionDigits !== null || grouping))
    refuse("display-format-invalid", `${at}.displayFormat: 'verbatim' carries no fraction digits and no grouping`);
  if (style !== "verbatim" && fractionDigits === null)
    refuse("display-format-invalid", `${at}.displayFormat: '${style}' states its fraction digits`);
  if (style === "currency" && currencyOf(def.unit) === null)
    refuse("display-format-invalid", `${at}.displayFormat: 'currency' needs a unit that is one currency, and '${def.unit}' is not`);
  def.displayFormat = { style, fractionDigits, grouping };
  // staleness
  const sk = kindOf(v.staleness, `${at}.staleness`, ["freshFor", "untilSuperseded", "untilUpstreamChange"]);
  if (sk === "freshFor") {
    members(ctx, v.staleness, `${at}.staleness`, ["kind", "windowSeconds"]);
    def.staleness = { kind: sk, windowSeconds: int(v.staleness.windowSeconds, `${at}.staleness.windowSeconds`, 1, 2147483647) };
  } else {
    members(ctx, v.staleness, `${at}.staleness`, ["kind"]);
    def.staleness = { kind: sk };
  }
  // rollUp
  if (v.rollUp === null) def.rollUp = null;
  else {
    const rk = kindOf(v.rollUp, `${at}.rollUp`, ["additive", "nonAdditive"]);
    if (rk === "additive") {
      members(ctx, v.rollUp, `${at}.rollUp`, ["kind", "tolerance"]);
      const t = parseDecimal(v.rollUp.tolerance, `${at}.rollUp.tolerance`);
      if (t.coefficient < 0n) refuse("decimal-invalid", `${at}.rollUp.tolerance: a tolerance is not negative`);
      def.rollUp = { kind: rk, tolerance: v.rollUp.tolerance };
    } else {
      members(ctx, v.rollUp, `${at}.rollUp`, ["kind"]);
      def.rollUp = { kind: rk };
    }
  }
  return def;
}

export function metricDefinitionTree(d) {
  const st = d.staleness;
  const staleness = st.kind === "freshFor" ? new Rec([["kind", "freshFor"], ["windowSeconds", st.windowSeconds]]) : new Rec([["kind", st.kind]]);
  const rollUp =
    d.rollUp === null ? null : d.rollUp.kind === "additive" ? new Rec([["kind", "additive"], ["tolerance", d.rollUp.tolerance]]) : new Rec([["kind", "nonAdditive"]]);
  return new Rec([
    ["kind", "metricDefinition"],
    ["wireVersion", WIRE_VERSION],
    ["id", d.id],
    ["name", d.name],
    ["unit", d.unit],
    ["dimensionality", d.dimensionality],
    ["direction", d.direction],
    ["displayFormat", new Rec([["style", d.displayFormat.style], ["fractionDigits", d.displayFormat.fractionDigits], ["grouping", d.displayFormat.grouping]])],
    ["staleness", staleness],
    ["producingOperation", d.producingOperation],
    ["canonicalMethod", d.canonicalMethod],
    ["rollUp", rollUp],
    ["context", d.context],
  ]);
}

function readSubjectDefinition(ctx, v, at) {
  obj(v, at);
  head(ctx, v, at, "subjectDefinition");
  members(ctx, v, at, ["kind", "wireVersion", "id", "name", "levels", "calendar"]);
  const levels = arr(v.levels, `${at}.levels`).map((l, i) => str(l, `${at}.levels[${i}]`, { nonEmpty: true }));
  if (levels.length === 0) refuse("shape-invalid", `${at}.levels: a hierarchy has at least one level`);
  return {
    id: readDefinitionId(v.id, `${at}.id`),
    name: str(v.name, `${at}.name`, { nonEmpty: true }),
    levels,
    calendar: optStr(v.calendar, `${at}.calendar`, { nonEmpty: true }),
  };
}
export const subjectDefinitionTree = (d) =>
  new Rec([["kind", "subjectDefinition"], ["wireVersion", WIRE_VERSION], ["id", d.id], ["name", d.name], ["levels", d.levels], ["calendar", d.calendar]]);

function readRegistry(ctx, v, at, kind, member, readOne) {
  obj(v, at);
  head(ctx, v, at, kind);
  members(ctx, v, at, ["kind", "wireVersion", member]);
  const items = arr(v[member], `${at}.${member}`).map((x, i) => readOne(ctx, x, `${at}.${member}[${i}]`));
  for (let i = 1; i < items.length; i++)
    if (ordinal(items[i - 1].id, items[i].id) >= 0)
      refuse("registry-unordered", `${at}.${member}: '${items[i - 1].id}' then '${items[i].id}' — ids are unique and ascend ordinally`);
  return items;
}

// ── §6 laws over a history ───────────────────────────────────────────────────────────────────
function readHistory(ctx, v, at) {
  obj(v, at);
  head(ctx, v, at, "factHistory");
  members(ctx, v, at, ["kind", "wireVersion", "facts"]);
  const facts = arr(v.facts, `${at}.facts`).map((f, i) => readFactRecord(ctx, f, `${at}.facts[${i}]`));
  checkHistory(facts, at);
  return facts;
}

/** L1 and L3, read in acceptance order. L2 is each fact's own id check. */
export function checkHistory(facts, at = "history") {
  const seen = new Map();
  const heads = new Map(); // lineage key (framed, so unambiguous) -> the lineage's current head
  facts.forEach((f, i) => {
    const where = `${at}.facts[${i}]`;
    if (seen.has(f.id)) refuse("history-id-repeated", `${where}: id ${f.id} was accepted at facts[${seen.get(f.id)}]`);
    seen.set(f.id, i);
    const key = frameText(lineageKey(f));
    const current = heads.get(key);
    if (f.supersedes !== null) {
      const p = facts.slice(0, i).find((g) => g.id === f.supersedes);
      if (!p) refuse("supersedes-unknown", `${where}: supersedes ${f.supersedes}, which no earlier fact is`);
      if (!sameLineage(p, f)) refuse("supersedes-cross-lineage", `${where}: supersedes a fact of another lineage`);
      if (!(f.asOf.ticks > p.asOf.ticks)) refuse("supersedes-not-later", `${where}: asOf ${f.asOf.text} does not exceed ${p.asOf.text}`);
      if (current.id !== p.id) refuse("supersedes-not-head", `${where}: supersedes ${p.id}, and its lineage's head is ${current.id}`);
    } else if (current) {
      refuse("supersedes-missing", `${where}: its lineage's head is ${current.id}, and it supersedes nothing`);
    }
    heads.set(key, f);
  });
}

/** §6.4 L4: the facts visible at `t`. */
export function visibleAt(facts, ticks) {
  return facts
    .filter((f) => f.asOf.ticks <= ticks && !facts.some((g) => g.supersedes === f.id && g.asOf.ticks <= ticks))
    .map((f) => f.id)
    .sort(ordinal);
}

/** §6.5 / §6.6 forecastness and freshness. */
export const isForecast = (f) => f.period.to.ticks > f.asOf.ticks;
export function isFresh(staleness, f, current, atTicks) {
  if (staleness.kind === "freshFor") return atTicks <= f.asOf.ticks + BigInt(staleness.windowSeconds) * 10000000n;
  return current;
}

function readStaleness(ctx, v, at) {
  const sk = kindOf(v, at, ["freshFor", "untilSuperseded", "untilUpstreamChange"]);
  if (sk === "freshFor") {
    members(ctx, v, at, ["kind", "windowSeconds"]);
    return { kind: sk, windowSeconds: int(v.windowSeconds, `${at}.windowSeconds`, 1, 2147483647) };
  }
  members(ctx, v, at, ["kind"]);
  return { kind: sk };
}

// ── top-level documents ──────────────────────────────────────────────────────────────────────
export const DOCUMENT_KINDS = ["fact", "metricDefinition", "subjectDefinition", "metricRegistry", "subjectRegistry", "factHistory", "asOfView", "factStatus"];

/**
 * Read a document's bytes. Returns { kind, value, tree, unknown } or throws a Refusal. `tree` is
 * the canonical value tree of what was read; for a document with no unknown member its encoding
 * must equal the bytes (§3.2), and is checked here.
 */
export function readDocument(bytes) {
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) refuse("not-canonical", "a byte-order mark");
  let text;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    refuse("not-canonical", "the bytes are not UTF-8");
  }
  let raw;
  try {
    raw = JSON.parse(text);
  } catch (e) {
    refuse("shape-invalid", `not JSON: ${e.message}`);
  }
  const ctx = new Ctx();
  const kind = kindOf(raw, "$", DOCUMENT_KINDS);
  let value, tree;
  switch (kind) {
    case "fact":
      value = readFactRecord(ctx, raw, "$");
      tree = factValueTree(value);
      break;
    case "metricDefinition":
      value = readMetricDefinition(ctx, raw, "$");
      tree = metricDefinitionTree(value);
      break;
    case "subjectDefinition":
      value = readSubjectDefinition(ctx, raw, "$");
      tree = subjectDefinitionTree(value);
      break;
    case "metricRegistry":
      value = readRegistry(ctx, raw, "$", "metricRegistry", "metrics", readMetricDefinition);
      tree = new Rec([["kind", "metricRegistry"], ["wireVersion", WIRE_VERSION], ["metrics", value.map(metricDefinitionTree)]]);
      break;
    case "subjectRegistry":
      value = readRegistry(ctx, raw, "$", "subjectRegistry", "subjects", readSubjectDefinition);
      tree = new Rec([["kind", "subjectRegistry"], ["wireVersion", WIRE_VERSION], ["subjects", value.map(subjectDefinitionTree)]]);
      break;
    case "factHistory":
      value = readHistory(ctx, raw, "$");
      tree = historyTree(value);
      break;
    case "asOfView": {
      obj(raw, "$");
      head(ctx, raw, "$", "asOfView");
      members(ctx, raw, "$", ["kind", "wireVersion", "at", "history", "visible"]);
      const at = parseInstant(raw.at, "$.at");
      const history = readHistory(ctx, raw.history, "$.history");
      const visible = arr(raw.visible, "$.visible").map((x, i) => str(x, `$.visible[${i}]`));
      const derived = visibleAt(history, at.ticks);
      if (derived.join(",") !== visible.join(","))
        refuse("view-mismatch", `$.visible: states [${visible.join(", ")}], the history gives [${derived.join(", ")}] at ${at.text}`);
      value = { at, history, visible };
      tree = new Rec([["kind", "asOfView"], ["wireVersion", WIRE_VERSION], ["at", at.text], ["history", historyTree(history)], ["visible", visible]]);
      break;
    }
    case "factStatus": {
      obj(raw, "$");
      head(ctx, raw, "$", "factStatus");
      members(ctx, raw, "$", ["kind", "wireVersion", "fact", "staleness", "current", "at", "forecast", "fresh"]);
      const fact = readFactRecord(ctx, raw.fact, "$.fact");
      const staleness = readStaleness(ctx, raw.staleness, "$.staleness");
      const current = bool(raw.current, "$.current");
      const at = parseInstant(raw.at, "$.at");
      const forecast = bool(raw.forecast, "$.forecast");
      const fresh = bool(raw.fresh, "$.fresh");
      if (forecast !== isForecast(fact)) refuse("status-mismatch", `$.forecast: states ${forecast}, the fact gives ${isForecast(fact)}`);
      const derivedFresh = isFresh(staleness, fact, current, at.ticks);
      if (fresh !== derivedFresh) refuse("status-mismatch", `$.fresh: states ${fresh}, the policy gives ${derivedFresh}`);
      value = { fact, staleness, current, at, forecast, fresh };
      tree = statusTree(value);
      break;
    }
  }
  if (ctx.unknown.length === 0 && encode(tree) !== text)
    refuse("not-canonical", "the bytes are not the canonical encoding of the document they read as");
  return { kind, value, tree, unknown: ctx.unknown };
}

export const historyTree = (facts) => new Rec([["kind", "factHistory"], ["wireVersion", WIRE_VERSION], ["facts", facts.map(factValueTree)]]);
export function statusTree(s) {
  const st = s.staleness;
  const staleness = st.kind === "freshFor" ? new Rec([["kind", "freshFor"], ["windowSeconds", st.windowSeconds]]) : new Rec([["kind", st.kind]]);
  return new Rec([
    ["kind", "factStatus"],
    ["wireVersion", WIRE_VERSION],
    ["fact", factValueTree(s.fact)],
    ["staleness", staleness],
    ["current", s.current],
    ["at", s.at.text],
    ["forecast", s.forecast],
    ["fresh", s.fresh],
  ]);
}

/** §7.5 the definition digest: `sha256:` over a definition or registry document's canonical bytes. */
export const definitionDigest = (bytes) => "sha256:" + sha256HexOfBytes(bytes);

// ── §7.2 unit text: Core's canonical unit text, checked by a second reader ───────────────────
// This answers one question — is this text the canonical text of a unit in Core's algebra? — so
// that a host's unit reader and this one agreeing on the corpus is evidence, not a shared accident.
const UNIT_ATOMS = new Map([
  ...["m", "g", "s", "A", "K", "mol", "cd", "rad", "sr", "Hz", "N", "Pa", "J", "W", "C", "V", "F", "Ohm", "S", "Wb", "T", "H", "lm", "lx", "Bq", "Gy", "Sv", "kat", "L", "t", "bar"].map((a) => [a, true]),
  ...["min", "h", "d", "wk", "a", "%", "[ppm]", "[ppb]", "[in_i]", "[ft_i]", "[yd_i]", "[mi_i]", "[lb_av]", "[oz_av]"].map((a) => [a, false]),
]);
const UNIT_ALIASES = new Map([["l", "L"]]);
const UNIT_PREFIXES = ["da", "Y", "Z", "E", "P", "T", "G", "M", "k", "h", "d", "c", "m", "u", "n", "p", "f", "a", "z", "y"];
const NOT_CURRENCIES = new Set(["[CFU]", "[PFU]", "[FFU]", "[BAU]", "[PNU]", "[FEU]", "[ELU]"]);
const isCurrencyAtom = (s) => /^\[[A-Z]{3}\]$/.test(s) && !NOT_CURRENCIES.has(s);

function unitAtom(token) {
  const whole = UNIT_ALIASES.get(token) ?? token;
  if (UNIT_ATOMS.has(whole)) return [whole, ""];
  if (isCurrencyAtom(token)) return [token, ""];
  for (const prefix of UNIT_PREFIXES) {
    if (!token.startsWith(prefix) || token.length === prefix.length) continue;
    const rest = UNIT_ALIASES.get(token.slice(prefix.length)) ?? token.slice(prefix.length);
    const metric = UNIT_ATOMS.has(rest) ? UNIT_ATOMS.get(rest) : isCurrencyAtom(rest);
    if (metric) return [rest, prefix];
    if (UNIT_ATOMS.has(rest)) return null;
  }
  return null;
}

export function parseUnit(text) {
  let pos = 0;
  const add = (into, key, e) => into.set(key, (into.get(key) ?? 0) + e);
  const term = (closing) => {
    const acc = new Map();
    let sign = 1;
    if (text[pos] === "/") {
      sign = -1;
      pos += 1;
    }
    for (;;) {
      for (const [k, e] of component()) add(acc, k, sign * e);
      if (pos === text.length || text[pos] === closing) return acc;
      if (text[pos] === ".") sign = 1;
      else if (text[pos] === "/") sign = -1;
      else throw new Error(`unexpected '${text[pos]}' at ${pos}`);
      pos += 1;
    }
  };
  const component = () => {
    if (text[pos] === "(") {
      pos += 1;
      const inner = term(")");
      if (text[pos] !== ")") throw new Error(`unclosed '(' at ${pos}`);
      pos += 1;
      return inner;
    }
    if (/[0-9]/.test(text[pos] ?? "")) {
      const start = pos;
      while (/[0-9*^]/.test(text[pos] ?? "")) pos += 1;
      if (text.slice(start, pos) !== "1") throw new Error(`a numeric factor at ${start}`);
      return new Map();
    }
    const start = pos;
    while (pos < text.length) {
      if (text[pos] === "[") {
        const close = text.indexOf("]", pos);
        if (close < 0) throw new Error(`unclosed '[' at ${pos}`);
        pos = close + 1;
      } else if (/[A-Za-z%]/.test(text[pos])) pos += 1;
      else break;
    }
    const token = text.slice(start, pos);
    if (token === "") throw new Error(`expected a unit at ${pos}`);
    const atom = unitAtom(token);
    if (!atom) throw new Error(`'${token}' is not an admitted unit`);
    const expStart = pos;
    if (text[pos] === "+" || text[pos] === "-") pos += 1;
    const digitsStart = pos;
    while (/[0-9]/.test(text[pos] ?? "")) pos += 1;
    let e = 1;
    if (pos > expStart) {
      if (pos === digitsStart) throw new Error(`a sign with no exponent at ${expStart}`);
      e = Number(text.slice(expStart, pos));
      if (!Number.isSafeInteger(e) || Math.abs(e) > 2147483647) throw new Error(`exponent out of range at ${expStart}`);
    }
    return new Map(e === 0 ? [] : [[atom[0] + "|" + atom[1], e]]);
  };
  if (text.length === 0) throw new Error("empty");
  const factors = new Map();
  for (const [k, e] of term(undefined)) add(factors, k, e);
  if (pos !== text.length) throw new Error(`unexpected '${text[pos]}' at ${pos}`);
  return factors;
}

export function renderUnit(factors) {
  const ordered = [...factors]
    .filter(([, e]) => e !== 0)
    .map(([k, e]) => [...k.split("|"), e])
    .sort((a, b) => ordinal(a[0], b[0]) || ordinal(a[1], b[1]));
  const text = ([symbol, prefix, e]) => prefix + symbol + (Math.abs(e) === 1 ? "" : String(Math.abs(e)));
  const up = ordered.filter(([, , e]) => e > 0).map(text);
  const down = ordered.filter(([, , e]) => e < 0).map(text);
  return up.length === 0 && down.length === 0 ? "1" : up.join(".") + down.map((t) => "/" + t).join("");
}

export function unitTextViolation(text) {
  let factors;
  try {
    factors = parseUnit(text);
  } catch (error) {
    return `'${text}' is not a unit: ${error.message}`;
  }
  const canonical = renderUnit(factors);
  return canonical === text ? null : `'${text}' is not canonical unit text; the unit is written '${canonical}'`;
}

/** The currency a unit is, when it is exactly one currency factor (optionally prefixed) to the first power. */
export function currencyOf(unitText) {
  let factors;
  try {
    factors = [...parseUnit(unitText)].filter(([, e]) => e !== 0);
  } catch {
    return null;
  }
  if (factors.length !== 1 || factors[0][1] !== 1) return null;
  const [symbol] = factors[0][0].split("|");
  return isCurrencyAtom(symbol) ? symbol : null;
}
