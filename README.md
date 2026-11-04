# Fact wire specification

A language-neutral, versioned specification of the **Fact**: a verified assertion that a metric of a
subject had a value over a period, as known at an instant, made by a stated method from stated inputs.
It fixes the record, a canonical encoding, the **identity frame** any host reproduces byte for byte, the
four laws a history of facts obeys, and the metric and subject definitions a host needs to read a value
— with an executable conformance corpus a second implementation can certify against from the text
alone.

```
FACT_WIRE.md      the specification. §1–§9 are normative.
schemas/v1/       one JSON Schema per document kind and per record — structural, subordinate to the text.
wire-fixtures/    the conformance corpus. manifest.json is the authoritative enumeration.
run.ps1           verify everything: emitter, checker, self-tests, publication boundary.
DECISIONS.md      why it is the way it is.
LICENSE / NOTICE  Apache-2.0.
```

## Start here

- **Implementing?** §3 (canonical encoding), then §4 (identity — this is where a host is most often
  wrong; Appendix A is the checklist), then §5 for the record and §6 for the laws.
- **Computing an id only?** §4 is self-contained: the frame, the fields, the renderings, the value
  hash, and worked examples down to the bytes.
- **Certifying?** [`wire-fixtures/README.md`](wire-fixtures/README.md) and §9.

## Verify

```powershell
pwsh ./run.ps1
```

PowerShell 7 and Node.js; nothing to install and nothing to build. The corpus verifies itself: the
resident emitter reproduces every document byte for byte, a checker validates the index, the schemas,
every vector's kind, the identity relations and the laws, each proves it can go red, and a sweep holds
the repository to its publication boundary.

## What is deliberately not here

Storage, queries, disclosure enforcement, signatures and presentation. A Fact is portable data; how a
host keeps it, who may see it and how it is shown are the host's business (§1). Disclosure labels are
specified as data a host carries, never as a rule this specification enforces.

## Relation to Fuaran Core

Units are [`Fuaran.Core.Unit`](https://github.com/Fuaran-Core/fuaran-core/blob/main/docs/units.md)'s
canonical text, and a series is named by a `Fuaran.Core` content address. The fact identity frame is
specified here and is distinct from Core's record identity (§4.8).

## Contributing

A change to any member, encoding, rendering, digest or law updates the specification, the schemas, the
emitter and the corpus in the same change (§9.5), and `pwsh ./run.ps1` passes before it is committed.

## Licence

Apache-2.0 — see [`LICENSE`](LICENSE) and [`NOTICE`](NOTICE). Copyright 2026 Diametrical Ltd.
