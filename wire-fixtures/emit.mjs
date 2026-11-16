// The resident emitter: builds every corpus document from unsorted, unstamped input models, using
// only FACT_WIRE.md's rules (through fact.mjs), and compares the bytes with the committed corpus.
//
//   node emit.mjs              compare every document and manifest.json with the emitter's output
//   node emit.mjs --write      rewrite them (then re-run without --write, and read the diff)
//   node emit.mjs --self-test  prove the comparison goes red, against a scratch copy
//
// A disagreement is a specification defect until the text is shown to be right (FACT_WIRE.md §9.4).

import { readFileSync, writeFileSync, mkdirSync, existsSync, cpSync, mkdtempSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import * as F from "./fact.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));

// ── input-model helpers ──────────────────────────────────────────────────────────────────────
const I = (text) => F.parseInstant(text, "model");
const hex = (seed) => F.sha256Hex(seed); // a stand-in 64-hex digest, minted from a readable seed
const addr = (seed) => "sha256:" + hex(seed);

/** A fact from a model: ids and supersedes are minted, never supplied (supersedes is per history). */
function fact(m) {
  const f = {
    id: "",
    subject: m.subject ?? { hierarchy: "product", path: ["acme", "widget-x"] },
    metric: m.metric ?? "revenue",
    value: m.value,
    period: {
      from: I(m.from ?? "2026-04-01T00:00:00Z"),
      to: I(m.to ?? "2026-07-01T00:00:00Z"),
      label: m.label === undefined ? "Q2-2026" : m.label,
    },
    asOf: I(m.asOf ?? "2026-07-02T06:00:00Z"),
    method: m.method ?? computed(),
    evidence: {
      resultRef: m.resultRef ?? null,
      inputHashes: m.inputs ?? [addr("orders-2026-q2"), addr("refunds-2026-q2"), "run:2026-07-02"],
      triggerRef: m.triggerRef ?? null,
    },
    confidence: m.confidence ?? null,
    supersedes: m.supersedes ?? null,
    disclosure: m.disclosure ?? { kind: "surfaceable" },
  };
  f.id = F.factId(f);
  return f;
}
const computed = (operation = "rollup", version = "2", paramHash = addr("rollup-params")) => ({ kind: "computed", operation, version, paramHash });
const asserted = (principal = "finance-lead") => ({ kind: "humanAsserted", principal });
const imported = (certificate = "cert:peer-a/2026-07-02/17") => ({ kind: "imported", certificate });
const scalar = (value) => ({ kind: "scalar", value });
const buckets = (pairs) => ({ kind: "distribution", buckets: new Map(pairs) });

/** Chain facts into a history: each takes its lineage's head as `supersedes`, re-minting nothing. */
function chain(...facts) {
  const heads = new Map();
  return facts.map((f) => {
    const key = F.lineageKey(f);
    const g = { ...f, supersedes: heads.has(key) ? heads.get(key).id : null };
    heads.set(key, g);
    return g;
  });
}

// ── the corpus ───────────────────────────────────────────────────────────────────────────────
const vectors = [];
const enc = (tree) => Buffer.from(F.encode(tree), "utf8");
function add(family, name, kind, bytes, extra = {}) {
  vectors.push({ id: `${family}/${name}`, family, kind, file: `${family}/${name}.json`, bytes, ...extra });
}
/** A reject vector: a valid document's text, mutated by `edit`, refused for `cls`. */
function reject(family, name, baseText, edit, cls, extra = {}) {
  const text = edit(baseText);
  if (text === baseText) throw new Error(`reject ${family}/${name}: the edit changed nothing`);
  add(family, name, "reject", Buffer.from(text, "utf8"), { rejectClass: cls, ...extra });
}
const factBytes = (f) => enc(F.factValueTree(f));

// identity — L2: the id is the frame's digest; what is in the frame and what is not.
const base = fact({ value: scalar("412000.00") });
add("identity", "computed-scalar", "hash", factBytes(base), { law: "L2" });
const computedOtherValue = fact({ value: scalar("398500.00") });
add("identity", "computed-value-differs", "hash", factBytes(computedOtherValue), { law: "L2" });
const rerun = fact({ value: scalar("412000.00"), asOf: "2026-07-09T06:00:00Z", triggerRef: "schedule:daily", resultRef: "result:run-0709" });
add("identity", "computed-rerun-converges", "hash", factBytes(rerun), { law: "L2" });
const permuted = fact({ value: scalar("412000.00"), inputs: ["run:2026-07-02", addr("refunds-2026-q2"), addr("orders-2026-q2")] });
add("identity", "computed-inputs-permuted", "hash", factBytes(permuted), { law: "L2" });
const outsideFrame = fact({
  value: scalar("412000.00"),
  label: null,
  asOf: "2026-08-15T12:30:00Z",
  confidence: { value: "0.9", basis: "fit diagnostic r2" },
  disclosure: { kind: "restricted", policy: "licensed-panel-terms" },
});
add("identity", "computed-outside-frame-differs", "hash", factBytes(outsideFrame), { law: "L2" });
const versionBump = fact({ value: scalar("412000.00"), method: computed("rollup", "3") });
add("identity", "computed-version-bump", "hash", factBytes(versionBump), { law: "L2" });
const inputChanged = fact({ value: scalar("412000.00"), inputs: [addr("orders-2026-q2-restated"), addr("refunds-2026-q2"), "run:2026-07-02"] });
add("identity", "computed-input-changed", "hash", factBytes(inputChanged), { law: "L2" });
const assertedBase = fact({ value: scalar("412000.00"), method: asserted(), inputs: [] });
add("identity", "asserted-scalar", "hash", factBytes(assertedBase), { law: "L2" });
const assertedOther = fact({ value: scalar("398500.00"), method: asserted(), inputs: [] });
add("identity", "asserted-value-differs", "hash", factBytes(assertedOther), { law: "L2" });
const assertedScale = fact({ value: scalar("412000.0"), method: asserted(), inputs: [] });
add("identity", "asserted-scale-differs", "hash", factBytes(assertedScale), { law: "L2" });
const assertedPrincipal = fact({ value: scalar("412000.00"), method: asserted("regional-controller"), inputs: [] });
add("identity", "asserted-principal-differs", "hash", factBytes(assertedPrincipal), { law: "L2" });
const assertedWithInputs = fact({ value: buckets([["p90", "455000"], ["p10", "371000"], ["p50", "410000"]]), metric: "revenue_forecast", method: asserted(), inputs: [addr("board-pack-2026-06")], from: "2026-10-01T00:00:00Z", to: "2027-01-01T00:00:00Z", label: "Q4-2026" });
add("identity", "asserted-distribution", "hash", factBytes(assertedWithInputs), { law: "L2" });
const seriesNoHint = fact({ value: { kind: "series", address: addr("weekly-revenue-2026-q2"), locator: null }, metric: "revenue_weekly", method: asserted(), inputs: [] });
add("identity", "asserted-series", "hash", factBytes(seriesNoHint), { law: "L2" });
const seriesHint = fact({ value: { kind: "series", address: addr("weekly-revenue-2026-q2"), locator: "objects/weekly-revenue@v14" }, metric: "revenue_weekly", method: asserted(), inputs: [] });
add("identity", "asserted-series-locator", "hash", factBytes(seriesHint), { law: "L2" });
const seriesHostKey = fact({ value: { kind: "series", address: "objects/weekly-revenue@v14", locator: null }, metric: "revenue_weekly", method: asserted(), inputs: [] });
add("identity", "asserted-series-host-key", "hash", factBytes(seriesHostKey), { law: "L2" });
const intervalFact = fact({ value: { kind: "interval", low: "0.42", high: "0.57" }, metric: "share_of_voice", method: asserted("analyst-panel"), inputs: [] });
add("identity", "asserted-interval", "hash", factBytes(intervalFact), { law: "L2" });
const categoricalFact = fact({ value: { kind: "categorical", value: "at risk" }, metric: "account_status", subject: { hierarchy: "customer", path: ["northwind"] }, method: asserted(), inputs: [] });
add("identity", "asserted-categorical", "hash", factBytes(categoricalFact), { law: "L2" });
const importedFact = fact({ value: scalar("-1.25"), metric: "price_elasticity", method: imported(), inputs: [addr("peer-a-panel-2026-q2")] });
add("identity", "imported-scalar", "hash", factBytes(importedFact), { law: "L2" });
const absentFact = fact({ value: { kind: "absent", reason: "no data loaded for this period" }, subject: { hierarchy: "product", path: [] }, inputs: [], label: null });
add("identity", "computed-absent-root-subject", "hash", factBytes(absentFact), { law: "L2" });
const unicodeFact = fact({ value: scalar("17"), subject: { hierarchy: "store", path: ["zürich", "café-😀"] }, metric: "visits", inputs: ["token:ü😀"] });
add("identity", "computed-non-ascii", "hash", factBytes(unicodeFact), { law: "L2" });
const fractionalFact = fact({ value: scalar("0.0000001"), metric: "latency_drift", from: "2026-07-01T09:30:00.5Z", to: "2026-07-01T09:31:00.0000001Z", asOf: "2026-07-01T09:30:01.25Z", inputs: [addr("trace-a"), addr("trace-a")] });
add("identity", "computed-fractional-instants", "hash", factBytes(fractionalFact), { law: "L2" });
const forecastFact = fact({ value: scalar("520000"), metric: "revenue_forecast", from: "2026-10-01T00:00:00Z", to: "2027-01-01T00:00:00Z", label: "Q4-2026", method: computed("forecast.ets", "1", addr("ets-params")), disclosure: { kind: "internal" } });
add("identity", "computed-forecast", "hash", factBytes(forecastFact), { law: "L2" });

const relations = [
  { ids: "equal", vectors: ["identity/computed-scalar", "identity/computed-value-differs"], why: "a Computed fact's value is outside the frame" },
  { ids: "equal", vectors: ["identity/computed-scalar", "identity/computed-rerun-converges"], why: "a re-run over the same inputs converges (L2): asOf, resultRef and triggerRef are outside the frame" },
  { ids: "equal", vectors: ["identity/computed-scalar", "identity/computed-inputs-permuted"], why: "input hashes are sorted into the frame" },
  { ids: "equal", vectors: ["identity/computed-scalar", "identity/computed-outside-frame-differs"], why: "label, asOf, confidence and disclosure are outside the frame" },
  { ids: "distinct", vectors: ["identity/computed-scalar", "identity/computed-version-bump"], why: "the method identity is in the frame" },
  { ids: "distinct", vectors: ["identity/computed-scalar", "identity/computed-input-changed"], why: "the input hashes are in the frame" },
  { ids: "distinct", vectors: ["identity/asserted-scalar", "identity/asserted-value-differs"], why: "a HumanAsserted fact folds its value's hash into the frame" },
  { ids: "distinct", vectors: ["identity/asserted-scalar", "identity/asserted-scale-differs"], why: "decimal text is the value: 412000.0 and 412000.00 hash differently" },
  { ids: "distinct", vectors: ["identity/asserted-scalar", "identity/asserted-principal-differs"], why: "the principal is the method identity" },
  { ids: "equal", vectors: ["identity/asserted-series", "identity/asserted-series-locator"], why: "a series locator is a hint, never identity" },
  { ids: "distinct", vectors: ["identity/asserted-series", "identity/asserted-series-host-key"], why: "a series address, content address or host key, is the asserted value (§4.4)" },
];

// lineage — §6.1 the lineage key, one fact of each value kind and method; the digest is what a store
// indexes a lineage by: the SHA-256 of the key's UTF-8 bytes.
const lineageFact = (m) =>
  fact({ subject: { hierarchy: "area", path: ["west", "harbour"] }, metric: "throughput", from: "2026-01-01T00:00:00Z", to: "2026-04-01T00:00:00Z", label: "Q1-2026", asOf: "2026-04-02T00:00:00Z", ...m });
const lineageCases = [
  ["computed-scalar", { value: scalar("1234.50"), method: computed("op.sum", "v1", "p0"), inputs: [addr("orders-2026-q1"), "run:7"] }],
  ["asserted-scalar", { value: scalar("-0.125"), method: asserted("analyst-a"), inputs: [] }],
  ["asserted-interval", { value: { kind: "interval", low: "1.0", high: "2.50" }, method: asserted("analyst-a"), inputs: ["x"] }],
  ["asserted-distribution", { value: buckets([["p90", "3"], ["p10", "1.10"]]), method: asserted("analyst-b"), inputs: [] }],
  ["asserted-series-host-key", { value: { kind: "series", address: "objects/throughput@v12", locator: null }, method: asserted("analyst-b"), inputs: [] }],
  ["computed-series-host-key", { value: { kind: "series", address: "objects/throughput@v12", locator: null }, method: computed("op", "1", "h"), inputs: [] }],
  ["imported-categorical", { value: { kind: "categorical", value: "red" }, method: imported("cert:9"), inputs: [] }],
];
for (const [name, m] of lineageCases) {
  const f = lineageFact(m);
  add("lineage", name, "hash", factBytes(f), { law: "L3", lineageKey: F.lineageKey(f) });
}

// record — the encoding and the reader's refusals, on the base fact's canonical text.
const baseText = F.encode(F.factValueTree(base));
reject("record", "reject-whitespace", baseText, (t) => t.replace('"metric":', '"metric": '), "not-canonical");
reject("record", "reject-member-order", baseText, (t) => t.replace(/"kind":"fact","wireVersion":1/, '"wireVersion":1,"kind":"fact"'), "not-canonical");
reject("record", "reject-optional-omitted", baseText, (t) => t.replace(',"confidence":null', ""), "shape-invalid");
reject("record", "reject-trailing-newline", baseText, (t) => t + "\n", "not-canonical");
reject("record", "reject-unknown-document-kind", baseText, (t) => t.replace('"kind":"fact"', '"kind":"facts"'), "kind-unknown");
reject("record", "reject-unknown-value-kind", baseText, (t) => t.replace('"kind":"scalar"', '"kind":"matrix"'), "kind-unknown");
reject("record", "reject-wire-version-2", baseText, (t) => t.replace('"wireVersion":1', '"wireVersion":2'), "version-unsupported");
reject("record", "reject-decimal-exponent", baseText, (t) => t.replace('"412000.00"', '"4.12e5"'), "decimal-invalid");
reject("record", "reject-decimal-number", baseText, (t) => t.replace('"value":"412000.00"', '"value":412000.00'), "shape-invalid");
reject("record", "reject-decimal-leading-zero", baseText, (t) => t.replace('"412000.00"', '"0412000.00"'), "decimal-invalid");
reject("record", "reject-decimal-negative-zero", baseText, (t) => t.replace('"412000.00"', '"-0.00"'), "decimal-invalid");
reject("record", "reject-decimal-plus-sign", baseText, (t) => t.replace('"412000.00"', '"+412000.00"'), "decimal-invalid");
reject("record", "reject-decimal-coefficient-range", baseText, (t) => t.replace('"412000.00"', '"79228162514264337593543950336"'), "decimal-invalid");
reject("record", "reject-decimal-scale-range", baseText, (t) => t.replace('"412000.00"', '"0.' + "1".repeat(29) + '"'), "decimal-invalid");
reject("record", "reject-instant-offset", baseText, (t) => t.replace('"asOf":"2026-07-02T06:00:00Z"', '"asOf":"2026-07-02T06:00:00+00:00"'), "instant-invalid");
reject("record", "reject-instant-no-zone", baseText, (t) => t.replace('"asOf":"2026-07-02T06:00:00Z"', '"asOf":"2026-07-02T06:00:00"'), "instant-invalid");
reject("record", "reject-instant-calendar", baseText, (t) => t.replace('"asOf":"2026-07-02T06:00:00Z"', '"asOf":"2026-02-30T06:00:00Z"'), "instant-invalid");
reject("record", "reject-instant-trailing-zero", baseText, (t) => t.replace('"asOf":"2026-07-02T06:00:00Z"', '"asOf":"2026-07-02T06:00:00.500Z"'), "instant-invalid");
reject("record", "reject-instant-finer-than-tick", baseText, (t) => t.replace('"asOf":"2026-07-02T06:00:00Z"', '"asOf":"2026-07-02T06:00:00.12345678Z"'), "instant-invalid");
reject("record", "reject-instant-hour-24", baseText, (t) => t.replace('"asOf":"2026-07-02T06:00:00Z"', '"asOf":"2026-07-02T24:00:00Z"'), "instant-invalid");
reject("record", "reject-hierarchy-slash", baseText, (t) => t.replace('"hierarchy":"product"', '"hierarchy":"product/line"'), "token-invalid");
reject("record", "reject-path-angle", baseText, (t) => t.replace('"widget-x"', '"widget>x"'), "token-invalid");
reject("record", "reject-hierarchy-pipe", baseText, (t) => t.replace('"hierarchy":"product"', '"hierarchy":"product|line"'), "token-invalid");
reject("record", "reject-path-pipe", baseText, (t) => t.replace('"widget-x"', '"widget|x"'), "token-invalid");
reject("record", "reject-metric-pipe", baseText, (t) => t.replace('"metric":"revenue"', '"metric":"revenue|net"'), "token-invalid");
reject("record", "reject-path-empty-member", baseText, (t) => t.replace('"widget-x"', '""'), "shape-invalid");
reject("record", "reject-operation-colon", baseText, (t) => t.replace('"operation":"rollup"', '"operation":"rollup:sum"'), "token-invalid");
reject("record", "reject-version-colon", baseText, (t) => t.replace('"version":"2"', '"version":"2:1"'), "token-invalid");
reject("record", "reject-period-inverted", baseText, (t) => t.replace('"from":"2026-04-01T00:00:00Z"', '"from":"2026-07-02T00:00:00Z"'), "period-inverted");
reject("record", "reject-id-mismatch", baseText, (t) => t.replace(base.id, hex("not-this-fact")), "fact-id-mismatch", { law: "L2" });
reject("record", "reject-id-uppercase", baseText, (t) => t.replace(base.id, base.id.toUpperCase()), "shape-invalid");
reject("record", "reject-series-address", F.encode(F.factValueTree(seriesNoHint)), (t) => t.replace('"address":"sha256:', '"address":"sha1:'), "shape-invalid");
reject("record", "reject-series-address-truncated", F.encode(F.factValueTree(seriesNoHint)), (t) => t.replace(seriesNoHint.value.address, "sha256:" + hex("weekly-revenue-2026-q2").slice(0, 63)), "shape-invalid");
reject("record", "reject-interval-inverted", F.encode(F.factValueTree(intervalFact)), (t) => t.replace('"low":"0.42","high":"0.57"', '"low":"0.57","high":"0.42"'), "interval-inverted");
reject("record", "reject-bucket-key", F.encode(F.factValueTree(assertedWithInputs)), (t) => t.replace('"p10":', '"p=10":'), "token-invalid");
reject("record", "reject-bucket-key-semicolon", F.encode(F.factValueTree(assertedWithInputs)), (t) => t.replace('"p10":', '"p;10":'), "token-invalid");
reject("record", "reject-escape-uppercase-hex", F.encode(F.factValueTree(fact({ value: { kind: "categorical", value: "a\u001fb" }, metric: "account_status", method: asserted(), inputs: [] }))), (t) => t.replace("\\u001f", "\\u001F"), "not-canonical");
// accept — forward compatibility: a member a reader does not know is ignored.
add("record", "accept-unknown-member", "accept", Buffer.from(baseText.slice(0, -1) + ',"annotation":{"note":"added by a later version"}}', "utf8"), {
  interpretation: `reads as identity/computed-scalar, id ${base.id}: the unknown member is ignored`,
  sameAs: "identity/computed-scalar",
});

// definition — metric and subject definitions as data (§7).
function metricDef(m) {
  return {
    id: m.id,
    name: m.name,
    unit: m.unit,
    dimensionality: m.dimensionality,
    direction: m.direction ?? "higherIsBetter",
    displayFormat: m.displayFormat ?? { style: "number", fractionDigits: 0, grouping: true },
    staleness: m.staleness ?? { kind: "untilSuperseded" },
    producingOperation: m.producingOperation ?? null,
    canonicalMethod: m.canonicalMethod ?? null,
    rollUp: m.rollUp ?? null,
    context: m.context ?? null,
  };
}
const revenueDef = metricDef({
  id: "revenue",
  name: "Revenue",
  unit: "[GBP]",
  dimensionality: "currency",
  displayFormat: { style: "currency", fractionDigits: 0, grouping: true },
  producingOperation: "rollup",
  canonicalMethod: "computed:rollup",
  rollUp: { kind: "additive", tolerance: "0.50" },
  context: "Net invoiced revenue after refunds, recognised in the period the order shipped.",
});
const shareDef = metricDef({ id: "share_of_voice", name: "Share of voice", unit: "%", dimensionality: "ratio", direction: "neutral", displayFormat: { style: "percent", fractionDigits: 1, grouping: false }, rollUp: { kind: "nonAdditive" } });
const latencyDef = metricDef({ id: "latency.p95", name: "Latency (p95)", unit: "ms", dimensionality: "duration", direction: "lowerIsBetter", displayFormat: { style: "number", fractionDigits: 2, grouping: true }, staleness: { kind: "freshFor", windowSeconds: 86400 } });
const visitsDef = metricDef({ id: "visits", name: "Visits", unit: "1", dimensionality: "count", displayFormat: { style: "verbatim", fractionDigits: null, grouping: false }, staleness: { kind: "untilUpstreamChange" }, rollUp: { kind: "additive", tolerance: "0" } });
const speedDef = metricDef({ id: "throughput", name: "Throughput", unit: "kg/h", dimensionality: "mass-rate", staleness: { kind: "freshFor", windowSeconds: 3600 } });
for (const [name, d] of [["metric-revenue", revenueDef], ["metric-share", shareDef], ["metric-latency", latencyDef], ["metric-visits", visitsDef], ["metric-throughput", speedDef]])
  add("definition", name, "hash", enc(F.metricDefinitionTree(d)));
const productDef = { id: "product", name: "Product hierarchy", levels: ["brand", "sku"], calendar: null };
const storeDef = { id: "store", name: "Stores", levels: ["city", "store"], calendar: "retail-4-4-5" };
const customerDef = { id: "customer", name: "Customers", levels: ["account"], calendar: null };
for (const [name, d] of [["subject-product", productDef], ["subject-store", storeDef], ["subject-customer", customerDef]])
  add("definition", name, "hash", enc(F.subjectDefinitionTree(d)));
const revenueText = F.encode(F.metricDefinitionTree(revenueDef));
reject("definition", "reject-unit-not-a-unit", revenueText, (t) => t.replace('"unit":"[GBP]"', '"unit":"GBP"'), "unit-invalid");
reject("definition", "reject-unit-non-canonical", F.encode(F.metricDefinitionTree(speedDef)), (t) => t.replace('"unit":"kg/h"', '"unit":"kg.h-1"'), "unit-invalid");
reject("definition", "reject-currency-format-without-currency", F.encode(F.metricDefinitionTree(shareDef)), (t) => t.replace('"style":"percent"', '"style":"currency"'), "display-format-invalid");
reject("definition", "reject-verbatim-with-digits", F.encode(F.metricDefinitionTree(visitsDef)), (t) => t.replace('"fractionDigits":null', '"fractionDigits":2'), "display-format-invalid");
reject("definition", "reject-id-not-a-token", revenueText, (t) => t.replace('"id":"revenue"', '"id":"Revenue"'), "token-invalid");
reject("definition", "reject-window-zero", F.encode(F.metricDefinitionTree(latencyDef)), (t) => t.replace('"windowSeconds":86400', '"windowSeconds":0'), "shape-invalid");
reject("definition", "reject-negative-tolerance", revenueText, (t) => t.replace('"tolerance":"0.50"', '"tolerance":"-0.50"'), "decimal-invalid");
reject("definition", "reject-subject-no-levels", F.encode(F.subjectDefinitionTree(customerDef)), (t) => t.replace('"levels":["account"]', '"levels":[]'), "shape-invalid");

// registry — the documents two deployments compare before exchanging facts (§7.4).
const metricRegistry = [revenueDef, latencyDef, shareDef, speedDef, visitsDef].sort((a, b) => F.ordinal(a.id, b.id));
const metricRegistryTree = (defs) => new F.Rec([["kind", "metricRegistry"], ["wireVersion", F.WIRE_VERSION], ["metrics", defs.map(F.metricDefinitionTree)]]);
add("registry", "metrics", "hash", enc(metricRegistryTree(metricRegistry)));
const subjectRegistry = [storeDef, productDef, customerDef].sort((a, b) => F.ordinal(a.id, b.id));
add("registry", "subjects", "hash", enc(new F.Rec([["kind", "subjectRegistry"], ["wireVersion", F.WIRE_VERSION], ["subjects", subjectRegistry.map(F.subjectDefinitionTree)]])));
add("registry", "metrics-empty", "hash", enc(metricRegistryTree([])));
reject("registry", "reject-unordered", F.encode(metricRegistryTree(metricRegistry)), () => F.encode(metricRegistryTree([...metricRegistry].reverse())), "registry-unordered");
reject("registry", "reject-duplicate-id", F.encode(metricRegistryTree([revenueDef])), () => F.encode(metricRegistryTree([revenueDef, revenueDef])), "registry-unordered");

// rendering — §10, the rendering standard, rule 1: a value shown as its metric declares.
const fmt = (style, fractionDigits, grouping) => ({ style, fractionDigits, grouping });
const renderMetric = (id, unit, displayFormat, dimensionality = "any") => metricDef({ id, name: id, unit, dimensionality, displayFormat });
const gbp0 = renderMetric("gbp0", "[GBP]", fmt("currency", 0, true), "currency");
const gbp2 = renderMetric("gbp2", "[GBP]", fmt("currency", 2, true), "currency");
const chf0 = renderMetric("chf0", "[CHF]", fmt("currency", 0, true), "currency");
const kgbp2 = renderMetric("kgbp2", "k[GBP]", fmt("currency", 2, true), "currency");
const n2 = renderMetric("n2", "1", fmt("number", 2, true));
const n0 = renderMetric("n0", "1", fmt("number", 0, true));
const f0 = renderMetric("f0", "1", fmt("number", 0, false));
const p1 = renderMetric("p1", "1", fmt("percent", 1, true));
const verbatimGbp = renderMetric("verbatim", "[GBP]", fmt("verbatim", null, false), "currency");
const renderedTree = (metric, value, text) => F.renderedValueTree({ rule: F.RENDERING_RULE, metric, value, text });
const rendered = (name, metric, value) => add("rendering", name, "round-trip", enc(renderedTree(metric, value, F.renderValue(metric, value))));
rendered("currency-grouped", gbp0, scalar("21240.00"));
rendered("currency-negative", gbp0, scalar("-1234.5"));
rendered("currency-rounds-to-zero-unsigned", gbp0, scalar("-0.4"));
rendered("currency-fraction-digits", gbp2, scalar("412380"));
rendered("currency-code-not-in-table", chf0, scalar("1299"));
rendered("currency-prefixed-unit", kgbp2, scalar("12.5"));
rendered("number-half-away-from-zero", n2, scalar("2.345"));
rendered("number-half-away-from-zero-negative", n2, scalar("-2.345"));
rendered("number-below-the-half", n2, scalar("2.344999"));
rendered("number-grouped", n2, scalar("1234567.891"));
rendered("number-rounding-opens-a-group", n0, scalar("999.5"));
rendered("number-padded", n2, scalar("7"));
rendered("number-ungrouped", f0, scalar("1234.5"));
rendered("number-96-bit-bound", n2, scalar("79228162514264337593543950335"));
rendered("number-28-places", n2, scalar("0.0000000000000000000000000001"));
rendered("percent", p1, scalar("0.12345"));
rendered("percent-negative", p1, scalar("-0.0456"));
rendered("percent-grouped", p1, scalar("12.5"));
rendered("verbatim-keeps-scale", verbatimGbp, scalar("412000.00"));
rendered("no-metric-is-verbatim", null, scalar("412000.0"));
rendered("interval", n2, { kind: "interval", low: "1.005", high: "2" });
rendered("distribution-ordinal-order", n2, buckets([["b", "1"], ["B", "2"], ["a", "3"]]));
rendered("categorical", n2, { kind: "categorical", value: "gold" });
rendered("absent", n2, { kind: "absent", reason: "no data loaded" });
rendered("series-content-address", n2, { kind: "series", address: addr("weekly-revenue-2026-q2"), locator: "objects/weekly-revenue@v14" });
rendered("series-host-key", n2, { kind: "series", address: "objects/weekly-revenue@v14", locator: null });
const renderedText = (metric, value) => F.encode(renderedTree(metric, value, F.renderValue(metric, value)));
reject("rendering", "reject-currency-parentheses", renderedText(gbp0, scalar("-1234.5")), (t) => t.replace('"text":"-£1,235"', '"text":"(£1,235)"'), "rendering-mismatch");
reject("rendering", "reject-generic-currency-sign", renderedText(gbp0, scalar("-1234.5")), (t) => t.replace('"text":"-£1,235"', '"text":"-¤1,235"'), "rendering-mismatch");
reject("rendering", "reject-percent-space", renderedText(p1, scalar("0.12345")), (t) => t.replace('"text":"12.3%"', '"text":"12.3 %"'), "rendering-mismatch");
reject("rendering", "reject-locale-glyphs", renderedText(n2, scalar("1234567.891")), (t) => t.replace('"text":"1,234,567.89"', '"text":"1.234.567,89"'), "rendering-mismatch");
reject("rendering", "reject-half-to-even", renderedText(n2, scalar("2.345")), (t) => t.replace('"text":"2.35"', '"text":"2.34"'), "rendering-mismatch");
reject("rendering", "reject-rule-2", renderedText(n2, scalar("2.345")), (t) => t.replace('"rule":1', '"rule":2'), "version-unsupported");

// history — L1 append-only, L2 inside a history, L3 supersession shape.
const t = (day, hour = "06") => `2026-07-${day}T${hour}:00:00Z`;
const a1 = fact({ value: scalar("412000.00"), asOf: t("02") });
const a2 = fact({ value: scalar("409800.00"), asOf: t("09"), inputs: [addr("orders-2026-q2-restated"), addr("refunds-2026-q2"), "run:2026-07-09"] });
const a3 = fact({ value: scalar("410150.00"), asOf: t("16"), inputs: [addr("orders-2026-q2-restated-2"), addr("refunds-2026-q2"), "run:2026-07-16"] });
const b1 = fact({ value: scalar("415000.00"), asOf: t("05"), method: asserted(), inputs: [] });
const c1 = fact({ value: scalar("411000.00"), asOf: t("03"), method: computed("rollup-alt", "1", addr("alt-params")) });
const hDoc = (facts) => F.historyTree(facts);
const lineage = chain(a1, b1, c1, a2, a3);
add("history", "lineage-and-competitors", "round-trip", enc(hDoc(lineage)), { law: "L3" });
const assertedRevision = chain(b1, fact({ value: scalar("416500.00"), asOf: t("12"), method: asserted(), inputs: [] }));
add("history", "asserted-revision-supersedes", "round-trip", enc(hDoc(assertedRevision)), { law: "L3" });
add("history", "empty", "round-trip", enc(hDoc([])), { law: "L1" });
const histText = F.encode(hDoc(lineage));
const [l1, l2, l3, l4, l5] = lineage;
const rawHistory = (facts) => F.encode(hDoc(facts));
reject("history", "reject-id-repeated", histText, () => rawHistory([l1, l2, l3, l4, l5, l1]), "history-id-repeated", { law: "L1" });
reject("history", "reject-id-repeated-mutated", histText, () => rawHistory([l1, l2, l3, l4, l5, { ...l1, value: scalar("412500.00") }]), "history-id-repeated", { law: "L1" });
// L1 across two snapshots of one store: a later history extends an earlier one, fact for fact.
add("history", "lineage-prefix", "round-trip", enc(hDoc(lineage.slice(0, 3))), { law: "L1" });
add("history", "lineage-rewritten", "round-trip", enc(hDoc([{ ...l1, value: scalar("412500.00") }, l2, l3, l4, l5])), { law: "L1" });
relations.push(
  { history: "extends", vectors: ["history/lineage-prefix", "history/lineage-and-competitors"], why: "a later snapshot keeps every earlier fact, byte for byte, in order (L1)" },
  { history: "doesNotExtend", vectors: ["history/lineage-prefix", "history/lineage-rewritten"], why: "a fact's value was changed in place: each snapshot is valid alone, and together they break L1" },
);
reject("history", "reject-supersedes-unknown", histText, () => rawHistory([l1, l2, l3, { ...l4, supersedes: hex("never-accepted") }, l5]), "supersedes-unknown", { law: "L3" });
reject("history", "reject-supersedes-cross-lineage", histText, () => rawHistory([l1, l2, { ...l3, supersedes: l1.id }]), "supersedes-cross-lineage", { law: "L3" });
reject("history", "reject-supersedes-not-later", histText, () => rawHistory([l1, l2, l3, { ...l4, asOf: I("2026-07-02T06:00:00Z") }]), "supersedes-not-later", { law: "L3" });
reject("history", "reject-supersedes-fork", histText, () => rawHistory([l1, l2, l3, l4, { ...l5, supersedes: l1.id }]), "supersedes-not-head", { law: "L3" });
reject("history", "reject-supersedes-missing", histText, () => rawHistory([l1, l2, l3, l4, { ...l5, supersedes: null }]), "supersedes-missing", { law: "L3" });
reject("history", "reject-id-mismatch-inside", histText, () => rawHistory([l1, { ...l2, id: hex("a stated id") }, l3]), "fact-id-mismatch", { law: "L2" });

// view — L4 as-of visibility.
const viewTree = (at, facts, visible) =>
  new F.Rec([["kind", "asOfView"], ["wireVersion", F.WIRE_VERSION], ["at", at], ["history", hDoc(facts)], ["visible", visible]]);
const view = (name, at) => add("view", name, "round-trip", enc(viewTree(at, lineage, F.visibleAt(lineage, I(at).ticks))), { law: "L4" });
view("before-any", "2026-07-01T00:00:00Z");
view("at-first-assert", "2026-07-02T06:00:00Z");
view("before-revision", "2026-07-08T23:59:59.9999999Z");
view("after-revision", "2026-07-09T06:00:00Z");
view("latest", "2026-08-01T00:00:00Z");
const viewText = (at, visible) => F.encode(viewTree(at, lineage, visible));
const atRev = "2026-07-09T06:00:00Z";
const correct = F.visibleAt(lineage, I(atRev).ticks);
reject("view", "reject-shows-superseded", viewText(atRev, correct), () => viewText(atRev, [...correct, l1.id].sort(F.ordinal)), "view-mismatch", { law: "L4" });
reject("view", "reject-hides-current", viewText(atRev, correct), () => viewText(atRev, correct.filter((x) => x !== l2.id)), "view-mismatch", { law: "L4" });
const early = "2026-07-04T00:00:00Z";
const earlyVisible = F.visibleAt(lineage, I(early).ticks);
reject("view", "reject-shows-future", viewText(early, earlyVisible), () => viewText(early, [...earlyVisible, l4.id].sort(F.ordinal)), "view-mismatch", { law: "L4" });
reject("view", "reject-unsorted", viewText(atRev, correct), () => viewText(atRev, [...correct].reverse()), "view-mismatch", { law: "L4" });

// status — forecastness (§6.5) and freshness (§6.6), derived, never declared.
const statusTreeOf = (f, staleness, current, at, forecast, fresh) => F.statusTree({ fact: f, staleness, current, at: I(at), forecast, fresh });
const status = (name, f, staleness, current, at) =>
  add("status", name, "round-trip", enc(statusTreeOf(f, staleness, current, at, F.isForecast(f), F.isFresh(staleness, f, current, I(at).ticks))));
const fresh24 = { kind: "freshFor", windowSeconds: 86400 };
status("actual-fresh-for-window", base, fresh24, true, "2026-07-03T06:00:00Z");
status("actual-stale-after-window", base, fresh24, true, "2026-07-03T06:00:00.0000001Z");
status("forecast-until-superseded", forecastFact, { kind: "untilSuperseded" }, true, "2026-07-20T00:00:00Z");
status("superseded-is-stale", l1, { kind: "untilSuperseded" }, false, "2026-07-20T00:00:00Z");
status("upstream-changed-is-stale", l4, { kind: "untilUpstreamChange" }, false, "2026-07-20T00:00:00Z");
const statusText = (f, st, cur, at, fc, fr) => F.encode(statusTreeOf(f, st, cur, at, fc, fr));
reject("status", "reject-forecast-declared", statusText(base, fresh24, true, "2026-07-03T06:00:00Z", false, true), (x) => x.replace('"forecast":false', '"forecast":true'), "status-mismatch");
reject("status", "reject-fresh-past-window", statusText(base, fresh24, true, "2026-07-04T00:00:00Z", false, false), (x) => x.replace('"fresh":false', '"fresh":true'), "status-mismatch");
reject("status", "reject-superseded-fresh", statusText(l1, { kind: "untilSuperseded" }, false, "2026-07-20T00:00:00Z", false, false), (x) => x.replace('"fresh":false', '"fresh":true'), "status-mismatch");

// ── digests and the manifest ─────────────────────────────────────────────────────────────────
const DIGESTS = {
  identity: (bytes) => F.readDocument(bytes).value.id,
  lineage: (bytes) => F.lineageDigest(F.readDocument(bytes).value),
  definition: F.definitionDigest,
  registry: F.definitionDigest,
};

export const FAMILIES = ["identity", "lineage", "record", "definition", "registry", "rendering", "history", "view", "status"];
const SCHEMAS = {
  fact: "../schemas/v1/fact.schema.json",
  metricDefinition: "../schemas/v1/metric-definition.schema.json",
  subjectDefinition: "../schemas/v1/subject-definition.schema.json",
  metricRegistry: "../schemas/v1/metric-registry.schema.json",
  subjectRegistry: "../schemas/v1/subject-registry.schema.json",
  factHistory: "../schemas/v1/fact-history.schema.json",
  asOfView: "../schemas/v1/as-of-view.schema.json",
  factStatus: "../schemas/v1/fact-status.schema.json",
  renderedValue: "../schemas/v1/rendered-value.schema.json",
};

function buildManifest() {
  const entries = vectors.map((v) => {
    const e = { id: v.id, family: v.family, kind: v.kind, file: v.file, sha256: F.sha256HexOfBytes(v.bytes) };
    if (v.kind === "hash") e.digest = DIGESTS[v.family](v.bytes);
    if (v.lineageKey) e.lineageKey = v.lineageKey;
    if (v.rejectClass) e.rejectClass = v.rejectClass;
    if (v.law) e.law = v.law;
    if (v.interpretation) e.interpretation = v.interpretation;
    if (v.sameAs) e.sameAs = v.sameAs;
    return e;
  });
  const manifest = {
    specification: "fact-wire",
    wireVersion: F.WIRE_VERSION,
    scope: "whole-corpus",
    families: FAMILIES,
    reservedFamilies: [],
    laws: {
      L1: ["history"],
      L2: ["identity", "record", "history"],
      L3: ["lineage", "history"],
      L4: ["view"],
    },
    digests: {
      identity: "the fact id (§4): lower-case hex SHA-256 over the identity frame, recomputed from the document's own members",
      lineage: "the lineage digest (§6.1): lower-case hex SHA-256 over the UTF-8 bytes of the lineage key, recomputed from the document's own members; the vector's lineageKey is the key itself",
      definition: "the definition digest (§7.5): sha256: + lower-case hex SHA-256 over the document's bytes",
      registry: "the definition digest (§7.5): sha256: + lower-case hex SHA-256 over the document's bytes",
    },
    schemas: SCHEMAS,
    rejectClasses: F.REJECT_CLASSES,
    relations,
    vectors: entries,
  };
  return Buffer.from(JSON.stringify(manifest, null, 2) + "\n", "utf8");
}

// ── compare or write ─────────────────────────────────────────────────────────────────────────
export function outputs() {
  const out = vectors.map((v) => [v.file, v.bytes]);
  out.push(["manifest.json", buildManifest()]);
  return out;
}

function compare(root) {
  const bad = [];
  for (const [file, bytes] of outputs()) {
    const path = join(root, file);
    if (!existsSync(path)) bad.push(`${file}: missing from the corpus`);
    else if (!readFileSync(path).equals(bytes)) bad.push(`${file}: the committed bytes differ from the emitter's`);
  }
  return bad;
}

const arg = process.argv[2];
if (arg === "--write") {
  for (const [file, bytes] of outputs()) {
    mkdirSync(dirname(join(HERE, file)), { recursive: true });
    writeFileSync(join(HERE, file), bytes);
  }
  console.log(`wrote ${vectors.length} vectors and manifest.json`);
} else if (arg === "--self-test") {
  const scratch = mkdtempSync(join(tmpdir(), "fact-emit-"));
  try {
    for (const [file] of outputs()) {
      mkdirSync(dirname(join(scratch, file)), { recursive: true });
      cpSync(join(HERE, file), join(scratch, file));
    }
    if (compare(scratch).length !== 0) throw new Error("self-test: the scratch copy should compare clean");
    const victim = join(scratch, "identity/computed-scalar.json");
    writeFileSync(victim, readFileSync(victim, "utf8").replace("412000.00", "412000.01"));
    if (compare(scratch).length === 0) throw new Error("self-test: a mutated document compared clean");
    rmSync(victim);
    if (compare(scratch).length === 0) throw new Error("self-test: a missing document compared clean");
    console.log("emit self-test: the comparison goes red on a mutated and on a missing document");
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
} else if (arg === undefined) {
  const bad = compare(HERE);
  if (bad.length) {
    for (const b of bad) console.error("  " + b);
    console.error(`emit: ${bad.length} difference(s)`);
    process.exit(1);
  }
  console.log(`emit: ${vectors.length} vectors and manifest.json reproduced byte for byte`);
} else {
  console.error(`unknown argument ${arg}`);
  process.exit(2);
}
