# Fact conformance corpus

The executable half of [`../FACT_WIRE.md`](../FACT_WIRE.md). An implementation in any language
certifies by running every vector this corpus lists. Conformance is whole-corpus (§2): there are no
profiles.

## Layout

```
manifest.json   the authoritative enumeration: families, laws, digests per family, schemas per
                document kind, the closed reject vocabulary, relations, and every vector with its
                kind and sha256
fact.mjs        the resident reader, writer, identity frame and laws, written from the text alone
emit.mjs        builds every document and manifest.json from unsorted input models, and compares bytes
validate.mjs    index, schema, kind, relation and law checks — what an emitter cannot ask of itself
identity/       the frame: what is in a fact's id and what is not (L2)
record/         the encoding and the reader's refusals; one forward-compatibility vector
definition/     metric and subject definitions as data
registry/       the documents two deployments compare before exchanging facts
history/        L1 append-only, L2 inside a history, L3 supersession shape
view/           L4 as-of visibility
status/         forecastness and freshness, derived
```

**Counts are not written here.** The manifest is the enumeration.

## Reading a fixture

A fixture file's bytes are the document: canonical JSON per §3, no trailing newline, no wrapper. The
manifest's `sha256` is over the file itself. `manifest.json` is the exception: a formatted index for
humans, LF-terminated, and not a specified document.

## Certifying

1. For every vector, do what its `kind` says (§9.1): `round-trip`, `hash` (recompute the `digest` as
   §9.2 says for its family), `reject` (for the named `rejectClass`, and no other), or `accept` (read as
   the vector named by `sameAs`).
2. Check every entry of `relations` (§9.3): ids equal or distinct, histories extending or not.
3. **Assert that the number of vectors you executed equals the number the manifest lists**, and prove
   once that a mutated document makes your harness go red. A green run that executed nothing looks
   exactly like one that executed everything.

## Regenerating

`pwsh ../run.ps1 -Write` rewrites the documents and the manifest from the emitter. Then run
`pwsh ../run.ps1` and read the diff: a rewrite that moves an id or a digest you did not mean to move is
the thing the switch can hide.
