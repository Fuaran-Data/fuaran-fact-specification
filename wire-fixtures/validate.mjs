// The corpus checker — the layer beneath the emitter's byte comparison. It asks what the emitter
// structurally cannot: does manifest.json still describe the tree beside it, and does every vector
// behave as its kind says?
//
//   1. Index    — every family directory, every file and every vector agree; each sha256 recomputes.
//   2. Schemas  — every non-reject document validates against its kind's schema (§9.6).
//   3. Kinds    — round-trip and hash vectors read and re-encode to their own bytes; hash digests
//                 recompute (§9.2); accept vectors read, ignoring what they do not know; reject
//                 vectors are refused FOR THE CLASS the manifest names, and for no other.
//                 A lineage vector's lineageKey recomputes too (§6.1).
//   4. Relations — the identity pairs (equal / distinct ids) and the L1 snapshot pairs hold.
//   5. Laws     — each of L1–L4 is pinned by at least one positive and one negative vector.
//
//   node validate.mjs              check the committed corpus
//   node validate.mjs --self-test  prove each layer goes red, against a scratch copy
//
// The JSON Schema support is a deliberately small subset (SUPPORTED below); a schema that uses a
// keyword outside it is refused rather than half-checked.

import { readFileSync, readdirSync, existsSync, statSync, writeFileSync, cpSync, mkdtempSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import * as F from "./fact.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const KINDS = ["round-trip", "hash", "reject", "accept"];

// ── a deliberately small JSON Schema subset ──────────────────────────────────────────────────
const SUPPORTED = new Set([
  "$schema", "$id", "$ref", "$defs", "title", "description",
  "type", "const", "enum", "pattern", "minLength", "minimum", "maximum",
  "items", "minItems", "properties", "required", "propertyNames", "minProperties", "oneOf",
]);

function schemaChecker(schemaRoot) {
  const cache = new Map();
  const load = (file) => {
    const abs = resolve(file);
    if (!cache.has(abs)) cache.set(abs, JSON.parse(readFileSync(abs, "utf8")));
    return cache.get(abs);
  };
  const audit = (node, file, at, bad) => {
    if (Array.isArray(node)) return node.forEach((n, i) => audit(n, file, `${at}[${i}]`, bad));
    if (node === null || typeof node !== "object") return;
    for (const [k, v] of Object.entries(node)) {
      if (!SUPPORTED.has(k)) bad.push(`${file}: unimplemented keyword '${k}' at ${at}`);
      if (k === "properties" || k === "$defs") for (const [p, s] of Object.entries(v)) audit(s, file, `${at}.${k}.${p}`, bad);
      else if (k !== "const" && k !== "enum") audit(v, file, `${at}.${k}`, bad);
    }
  };
  const deref = (ref, file) => {
    const [path, pointer = ""] = ref.split("#");
    const target = path ? join(dirname(file), path) : file;
    let node = load(target);
    for (const part of pointer.split("/").filter(Boolean)) node = node[part];
    if (node === undefined) throw new Error(`${file}: unresolvable $ref ${ref}`);
    return { schema: node, file: target };
  };
  const typeOf = (v) => (v === null ? "null" : Array.isArray(v) ? "array" : Number.isInteger(v) ? "integer" : typeof v);
  function validate(value, schema, file, at = "$") {
    if (schema.$ref) {
      const t = deref(schema.$ref, file);
      return validate(value, t.schema, t.file, at);
    }
    const bad = [];
    if (schema.type) {
      const types = Array.isArray(schema.type) ? schema.type : [schema.type];
      const actual = typeOf(value);
      if (!types.includes(actual) && !(actual === "integer" && types.includes("number"))) bad.push(`${at}: expected ${types.join("|")}, got ${actual}`);
    }
    if ("const" in schema && JSON.stringify(value) !== JSON.stringify(schema.const)) bad.push(`${at}: expected ${JSON.stringify(schema.const)}`);
    if (schema.enum && !schema.enum.some((e) => JSON.stringify(e) === JSON.stringify(value))) bad.push(`${at}: not one of ${JSON.stringify(schema.enum)}`);
    if (typeof value === "string") {
      if (schema.pattern && !new RegExp(schema.pattern, "u").test(value)) bad.push(`${at}: does not match ${schema.pattern}`);
      if (schema.minLength !== undefined && [...value].length < schema.minLength) bad.push(`${at}: shorter than ${schema.minLength}`);
    }
    if (typeof value === "number") {
      if (schema.minimum !== undefined && value < schema.minimum) bad.push(`${at}: below ${schema.minimum}`);
      if (schema.maximum !== undefined && value > schema.maximum) bad.push(`${at}: above ${schema.maximum}`);
    }
    if (Array.isArray(value)) {
      if (schema.minItems !== undefined && value.length < schema.minItems) bad.push(`${at}: fewer than ${schema.minItems} items`);
      if (schema.items) value.forEach((x, i) => bad.push(...validate(x, schema.items, file, `${at}[${i}]`)));
    }
    if (typeOf(value) === "object") {
      for (const r of schema.required ?? []) if (!(r in value)) bad.push(`${at}: missing '${r}'`);
      for (const [p, s] of Object.entries(schema.properties ?? {})) if (p in value) bad.push(...validate(value[p], s, file, `${at}.${p}`));
      if (schema.propertyNames) for (const k of Object.keys(value)) bad.push(...validate(k, schema.propertyNames, file, `${at} key '${k}'`));
      if (schema.minProperties !== undefined && Object.keys(value).length < schema.minProperties) bad.push(`${at}: fewer than ${schema.minProperties} members`);
    }
    if (schema.oneOf) {
      const passing = schema.oneOf.filter((s) => validate(value, s, file, at).length === 0).length;
      if (passing !== 1) bad.push(`${at}: matches ${passing} of the oneOf branches, not exactly one`);
    }
    return bad;
  }
  return { load, audit, validate, root: schemaRoot };
}

// ── the checks ───────────────────────────────────────────────────────────────────────────────
export function check(root) {
  const bad = [];
  const manifestPath = join(root, "manifest.json");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  const vectors = manifest.vectors;
  const byId = new Map();

  // 1. index
  for (const fam of manifest.families) if (!existsSync(join(root, fam)) || !statSync(join(root, fam)).isDirectory()) bad.push(`family ${fam}: no directory`);
  const onDisk = new Set();
  for (const entry of readdirSync(root)) {
    const dir = join(root, entry);
    if (!statSync(dir).isDirectory()) continue;
    if (!manifest.families.includes(entry)) bad.push(`directory ${entry}/: not a family the manifest names`);
    for (const f of readdirSync(dir)) onDisk.add(`${entry}/${f}`);
  }
  const listed = new Set();
  for (const v of vectors) {
    if (byId.has(v.id)) bad.push(`${v.id}: listed twice`);
    byId.set(v.id, v);
    if (v.file !== `${v.id}.json` || v.id.split("/")[0] !== v.family) bad.push(`${v.id}: its id, family and file disagree`);
    if (!manifest.families.includes(v.family)) bad.push(`${v.id}: family '${v.family}' is not enumerated`);
    if (!KINDS.includes(v.kind)) bad.push(`${v.id}: kind '${v.kind}' is not in the taxonomy`);
    if (v.kind === "reject" && !manifest.rejectClasses.includes(v.rejectClass)) bad.push(`${v.id}: reject class '${v.rejectClass}' is not in the vocabulary`);
    if (v.kind === "hash" && !manifest.digests[v.family]) bad.push(`${v.id}: a hash vector in a family with no stated digest`);
    listed.add(v.file);
    const path = join(root, v.file);
    if (!existsSync(path)) {
      bad.push(`${v.id}: ${v.file} does not exist`);
      continue;
    }
    if (F.sha256HexOfBytes(readFileSync(path)) !== v.sha256) bad.push(`${v.id}: sha256 does not recompute`);
  }
  for (const f of onDisk) if (!listed.has(f)) bad.push(`${f}: on disk, not in the manifest`);
  if (JSON.stringify(manifest.rejectClasses) !== JSON.stringify(F.REJECT_CLASSES)) bad.push("rejectClasses: differs from the reader's closed vocabulary");

  // 2–3. schemas and kinds
  const schemas = schemaChecker(root);
  for (const [kind, rel] of Object.entries(manifest.schemas))
    if (!existsSync(join(root, rel))) bad.push(`schema for ${kind}: ${rel} does not exist`);
  const schemaDir = join(root, "..", "schemas", "v1");
  for (const f of readdirSync(schemaDir).filter((f) => f.endsWith(".schema.json")))
    schemas.audit(schemas.load(join(schemaDir, f)), `schemas/v1/${f}`, "$", bad);
  const readings = new Map();
  for (const v of vectors) {
    const path = join(root, v.file);
    if (!existsSync(path)) continue;
    const bytes = readFileSync(path);
    if (v.kind === "reject") {
      try {
        F.readDocument(bytes);
        bad.push(`${v.id}: read without refusal; the manifest says it is refused as ${v.rejectClass}`);
      } catch (e) {
        if (!(e instanceof F.Refusal)) bad.push(`${v.id}: failed outside the reject vocabulary: ${e.message}`);
        else if (e.cls !== v.rejectClass) bad.push(`${v.id}: refused as ${e.cls}, the manifest says ${v.rejectClass} (${e.message})`);
      }
      continue;
    }
    let r;
    try {
      r = F.readDocument(bytes);
    } catch (e) {
      bad.push(`${v.id}: refused (${e.message})`);
      continue;
    }
    readings.set(v.id, r);
    const schemaRel = manifest.schemas[r.kind];
    if (!schemaRel) bad.push(`${v.id}: no schema for document kind ${r.kind}`);
    else {
      const file = join(root, schemaRel);
      if (existsSync(file)) for (const b of schemas.validate(JSON.parse(bytes.toString("utf8")), schemas.load(file), file)) bad.push(`${v.id}: schema: ${b}`);
    }
    const reencoded = F.encode(r.tree);
    if (v.kind === "accept") {
      if (r.unknown.length === 0) bad.push(`${v.id}: an accept vector carries nothing a reader must ignore`);
      if (!v.sameAs || !byId.has(v.sameAs)) bad.push(`${v.id}: names no vector it reads as`);
      else if (reencoded !== readFileSync(join(root, byId.get(v.sameAs).file), "utf8")) bad.push(`${v.id}: does not read as ${v.sameAs}`);
    } else {
      if (r.unknown.length) bad.push(`${v.id}: carries undeclared members ${r.unknown.join(", ")}`);
      if (reencoded !== bytes.toString("utf8")) bad.push(`${v.id}: does not re-encode to its own bytes`);
    }
    if (v.kind === "hash") {
      const digest = v.family === "identity" ? F.factId(r.value) : v.family === "lineage" ? F.lineageDigest(r.value) : F.definitionDigest(bytes);
      if (digest !== v.digest) bad.push(`${v.id}: digest ${v.digest} does not recompute (${digest})`);
    }
    if (v.family === "lineage" && v.lineageKey !== F.lineageKey(r.value)) bad.push(`${v.id}: lineageKey does not recompute (${F.lineageKey(r.value)})`);
  }

  // 4. relations
  for (const rel of manifest.relations) {
    const [a, b] = rel.vectors.map((id) => readings.get(id));
    if (!a || !b) {
      bad.push(`relation ${rel.vectors.join(" ~ ")}: a vector it names did not read`);
      continue;
    }
    if (rel.ids) {
      const equal = a.value.id === b.value.id;
      if ((rel.ids === "equal") !== equal) bad.push(`relation ${rel.vectors.join(" ~ ")}: ids are ${equal ? "equal" : "distinct"}, stated ${rel.ids}`);
    } else if (rel.history) {
      const fa = a.value.map((f) => F.encode(F.factValueTree(f)));
      const fb = b.value.map((f) => F.encode(F.factValueTree(f)));
      const extends_ = fa.length <= fb.length && fa.every((x, i) => x === fb[i]);
      if ((rel.history === "extends") !== extends_) bad.push(`relation ${rel.vectors.join(" ~ ")}: stated ${rel.history}`);
    } else bad.push(`relation ${rel.vectors.join(" ~ ")}: states neither ids nor history`);
  }

  // 5. laws: each has a positive and a negative vector (for L1 the negative may be a doesNotExtend relation)
  for (const law of ["L1", "L2", "L3", "L4"]) {
    const pos = vectors.some((v) => v.law === law && v.kind !== "reject");
    const neg = vectors.some((v) => v.law === law && v.kind === "reject");
    if (!pos || !neg) bad.push(`law ${law}: needs a positive and a negative vector`);
    for (const fam of manifest.laws[law] ?? []) if (!manifest.families.includes(fam)) bad.push(`law ${law}: family ${fam} is not enumerated`);
  }
  for (const v of vectors) if (v.law && !(manifest.laws[v.law] ?? []).includes(v.family)) bad.push(`${v.id}: law ${v.law} does not list family ${v.family}`);
  return { bad, count: vectors.length };
}

// ── run ──────────────────────────────────────────────────────────────────────────────────────
function scratchCopy() {
  const scratch = mkdtempSync(join(tmpdir(), "fact-validate-"));
  const corpus = join(scratch, "wire-fixtures");
  cpSync(HERE, corpus, { recursive: true });
  cpSync(join(HERE, "..", "schemas"), join(scratch, "schemas"), { recursive: true });
  return { scratch, corpus };
}

function selfTest() {
  // Each mutation must make the checker go red, and each is applied to a fresh scratch copy.
  const mutations = [
    ["a document's bytes change", (c) => writeFileSync(join(c, "identity/computed-scalar.json"), readFileSync(join(c, "identity/computed-scalar.json"), "utf8").replace('"rollup"', '"rollups"'))],
    ["a file the manifest does not list", (c) => writeFileSync(join(c, "record/stray.json"), "{}")],
    ["a reject vector's class is wrong", (c) => {
      const m = JSON.parse(readFileSync(join(c, "manifest.json"), "utf8"));
      m.vectors.find((v) => v.kind === "reject").rejectClass = "shape-invalid";
      writeFileSync(join(c, "manifest.json"), JSON.stringify(m, null, 2) + "\n");
    }],
    ["a hash digest is wrong", (c) => {
      const m = JSON.parse(readFileSync(join(c, "manifest.json"), "utf8"));
      m.vectors.find((v) => v.kind === "hash").digest = "0".repeat(64);
      writeFileSync(join(c, "manifest.json"), JSON.stringify(m, null, 2) + "\n");
    }],
    ["a relation is inverted", (c) => {
      const m = JSON.parse(readFileSync(join(c, "manifest.json"), "utf8"));
      m.relations[0].ids = m.relations[0].ids === "equal" ? "distinct" : "equal";
      writeFileSync(join(c, "manifest.json"), JSON.stringify(m, null, 2) + "\n");
    }],
    ["a schema stops admitting a valid document", (c) => {
      const s = join(c, "..", "schemas", "v1", "common.schema.json");
      writeFileSync(s, readFileSync(s, "utf8").replace('"pattern": "^[0-9a-f]{64}$"', '"pattern": "^[0-9A-F]{64}$"'));
    }],
    ["a law loses its negative vector", (c) => {
      const m = JSON.parse(readFileSync(join(c, "manifest.json"), "utf8"));
      for (const v of m.vectors) if (v.law === "L4" && v.kind === "reject") delete v.law;
      writeFileSync(join(c, "manifest.json"), JSON.stringify(m, null, 2) + "\n");
    }],
  ];
  for (const [what, mutate] of mutations) {
    const { scratch, corpus } = scratchCopy();
    try {
      if (check(corpus).bad.length !== 0) throw new Error("self-test: the scratch copy should check clean");
      mutate(corpus);
      if (check(corpus).bad.length === 0) throw new Error(`self-test: went green when ${what}`);
    } finally {
      rmSync(scratch, { recursive: true, force: true });
    }
  }
  console.log(`validate self-test: red on each of ${mutations.length} mutations`);
}

const arg = process.argv[2];
if (arg === "--self-test") selfTest();
else if (arg === undefined) {
  const { bad, count } = check(HERE);
  if (bad.length) {
    for (const b of bad) console.error("  " + b);
    console.error(`validate: ${bad.length} problem(s)`);
    process.exit(1);
  }
  console.log(`validate: ${count} vectors — index, schemas, kinds, relations and laws hold`);
} else {
  console.error(`unknown argument ${arg}`);
  process.exit(2);
}
