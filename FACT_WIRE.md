# Fact wire specification

**Version 1, revision 1.1** (§8). A language-neutral statement of the **Fact**: a verified assertion that a metric of a subject
had a value over a period, as known at an instant, made by a stated method from stated inputs. This
document fixes the record, its encoding, the **identity frame** every host must reproduce byte for
byte, the four laws a history of facts obeys, the metric and subject **definitions** a host needs to
read a value, and the one **rendering** of a value every host shows and compares. The executable half is [`wire-fixtures/`](wire-fixtures/README.md): an implementation
certifies by reading, re-encoding, re-hashing and refusing the documents it lists. Where this prose and
the corpus disagree, that is a defect in this document; the corpus is the tie-breaker until the text is
fixed.

**Shared conventions.** This specification is written under the conventions stated in
[`SPEC_CONVENTIONS.md`](https://github.com/fuaran-ui/fuaran-ui-specification/blob/main/SPEC_CONVENTIONS.md),
published with the tree wire specification: canonical bytes, the corpus as oracle, the manifest as the
authoritative enumeration, declared conformance scope, two emitters, forward coupling, and how a
specification in the family extends. They are normative here; where this document diverges from one, it
says so (§9.1).

**Key words.** MUST, MUST NOT, SHOULD, SHOULD NOT and MAY are used in the RFC 2119 sense.

**Section map.** §1 scope, §2 conformance scope, §3 canonical encoding, §4 identity, §5 the Fact
record, §6 the laws, §7 definitions and registries, §8 versioning, §9 certifying, §10 rendering. Appendix A is the
implementation checklist; Appendix B is non-normative.

---

## 1. Scope

**In scope.** The Fact record and its value, method, temporal extent, subject and metric references,
evidence, confidence and disclosure label (§5); the identity frame and the input-hash form (§4); the
lineage key, supersession, as-of visibility, forecastness and freshness (§6); metric and subject
definitions, and the registry documents that list them (§7); and the rendering standard, the one text
a value is shown as under its metric's display format (§10).

**Out of scope, deliberately.** Where facts are stored and how; who may see a fact, and the enforcement
of any disclosure label; queries over populations of facts; signatures over a fact or a set of facts;
and how a value is laid out on a screen beyond its rendered text. A Fact is portable data. Storing it,
guarding it and showing it are a host's business, and nothing here constrains how a host does them,
except that what it exchanges as a Fact reads as one under this document, and that the text it renders
a value as, and compares a quoted value against, is §10's.

**Disclosure labels are data.** A fact carries a label (§5.8) from the moment it is made, and a host
that receives one MUST keep it with the fact. This specification states what the labels are and how
they are written. It states no rule about what any label permits, and a conformant reader neither
grants nor withholds anything because of one.

## 2. Conformance scope

**Whole-corpus.** Every family in `wire-fixtures/manifest.json` is a facet of one thing: a host that
can verify a fact's id must read the record, and a host that reads a history must apply the laws to the
same records. A partition would produce claims nobody needs, so there are no profiles, and a conformance
claim is a claim over the whole corpus (§9).

## 3. Canonical encoding

Every document is **canonical JSON**: given the same values, every conformant emitter produces the same
bytes. The rules are stated in full rather than delegated to a library.

### 3.1 Rules

1. **No insignificant whitespace**, and no trailing newline.
2. **UTF-8** with no byte-order mark. Every string is well-formed Unicode: a lone surrogate is refused.
3. **A record's members are written in declaration order**, as the tables in §5–§7 give it. Not
   sorted.
4. **A map's members are written in ascending ordinal order of key.** Ordinal means by UTF-16 code
   unit, compared one unit at a time, a shorter string first where one is a prefix of the other. A map
   is the one object whose keys are data (a distribution's buckets, §5.3).
5. **Every declared member is present.** An absent optional value is `null`. A list with no items is
   `[]`.
6. **Strings** escape `"` as `\"`, `\` as `\\`, U+0008 `\b`, U+0009 `\t`, U+000A `\n`, U+000C `\f`,
   U+000D `\r`, and every other character below U+0020 as `\u00` and two **lower-case** hex digits.
   Every other character, all of non-ASCII included, is written literally.
7. **Integers** are JSON numbers with no sign, fraction or exponent. Only four members are integers:
   `wireVersion`, `windowSeconds`, `fractionDigits` and a rendered value's `rule` (§10.6).
8. **No other number appears on the wire.** A quantity is decimal text (§3.3); an instant is text
   (§3.4).
9. **Booleans** are `true` and `false`.

### 3.2 Records, tagged shapes and unknown members

A **tagged shape** — a fact value, a method, a disclosure label, a staleness policy, a roll-up — is a
record whose first member is `kind`, a string naming the case, followed by that case's members in
declaration order. A reader that meets a `kind` it does not know refuses the document
(`kind-unknown`): every case is in identity or a law, so a guess would be wrong.

Every top-level document is a record whose first two members are `kind` (§9.6's document kinds) and
`wireVersion` (the integer `1`).

**Unknown members.** A reader MUST ignore a record member it does not know, and an emitter MUST NOT
write one. A document carrying one is read leniently: it is not held to §3.1's byte rule, it reads as
the document without the member, and re-encoding it drops the member. This is what makes adding a
member under §8 additive.

### 3.3 Decimal text

Every quantity — a scalar, an interval's bounds, a distribution's bucket values, a confidence, a
roll-up tolerance — is **decimal text**: a JSON string matching

```
-?(0|[1-9][0-9]*)(\.[0-9]+)?
```

with no exponent, no leading `+`, no leading zero in the integer part, and no negative zero (`-0`,
`-0.00`). **The text is the value, and its scale is significant**: `412000.0` and `412000.00` are two
values, and §4.4 hashes them differently. A host MUST carry decimal text without normalising it. There
are at most 28 digits after the point, and the digits with the point removed, read as one integer (the
coefficient), are at most 79228162514264337593543950335 (2⁹⁶ − 1), so every fact value is exact in a
96-bit decimal. Text outside those bounds is refused (`decimal-invalid`). Comparison (an interval's
bounds, a tolerance's sign) is numeric: `1.5` equals `1.50`.

### 3.4 Instants

An instant is a UTC time of day on a proleptic Gregorian date, at a resolution of 100 nanoseconds (a
**tick**). Its wire text is

```
YYYY-MM-DDTHH:MM:SS[.F]Z
```

with a year from `0001` to `9999`, a valid calendar date, hours `00`–`23`, minutes and seconds
`00`–`59` (no leap second), and the letter `Z`. The fraction `F` is **omitted when the instant is a
whole second**, and otherwise has one to seven digits **with no trailing zero**. Any other spelling —
an offset (`+00:00`), no zone, a trailing zero (`.500`), an eighth fractional digit — is refused
(`instant-invalid`). Instants compare as points in time.

§4.3 renders an instant differently for identity: with exactly seven fractional digits.

### 3.5 Tokens inside identity

Five kinds of string are joined with separators inside the identity frame's renderings (§4.3) or the
lineage key (§6.1), so the separator cannot appear inside them:

| Member | MUST NOT contain | Else |
|---|---|---|
| `subject.hierarchy` | `/` or `\|` | `token-invalid` |
| each `subject.path` member | `>` or `\|` | `token-invalid` |
| `metric` (a fact's metric id) | `\|` | `token-invalid` |
| `method.operation`, `method.version` (Computed) | `:` | `token-invalid` |
| each distribution bucket key | `=` or `;` | `token-invalid` |

The `|` rows are what make the lineage key unambiguous (§6.1). A method's members may contain `|`: the
method identity is the key's last field.

None of these may be empty, nor may a metric id, a principal, a certificate reference, an input hash,
a categorical value or an absence reason (`shape-invalid`). `paramHash` may be empty; it is the last
part of its rendering.

### 3.6 Refusals

A reader refuses a document **for one named class**, from this closed vocabulary. A corpus reject vector
names its class; refusing it for another is not a pass.

| Class | When |
|---|---|
| `not-canonical` | The bytes are not the canonical encoding of the document they read as (§3.1), or are not UTF-8. |
| `shape-invalid` | Not JSON; a member missing or of the wrong type; an empty string where §3.5 forbids one; an id, address or enumeration outside its form. |
| `kind-unknown` | A document or tagged-shape `kind` this version does not define. |
| `version-unsupported` | `wireVersion` is an integer other than `1`, or a rendered value names a rendering rule this version does not define (§10.1). |
| `decimal-invalid` | §3.3; also a negative roll-up tolerance. |
| `instant-invalid` | §3.4. |
| `token-invalid` | §3.5; a definition id outside §7.1's grammar. |
| `interval-inverted` | An interval's `low` exceeds its `high`. |
| `period-inverted` | A period's `from` is after its `to`. |
| `fact-id-mismatch` | A fact's `id` is not the digest its own members frame to (§4). |
| `unit-invalid` | A metric's `unit` is not canonical unit text (§7.2). |
| `display-format-invalid` | §7.1's display-format rules. |
| `registry-unordered` | A registry's ids are not unique and ascending (§7.4). |
| `history-id-repeated` | A history accepts one id twice (§6.3, L1). |
| `supersedes-unknown` | `supersedes` names no earlier fact of the history (§6.3, L3). |
| `supersedes-cross-lineage` | `supersedes` names a fact of another lineage (L3). |
| `supersedes-not-later` | A superseder's `asOf` does not exceed its predecessor's (L3). |
| `supersedes-not-head` | `supersedes` names a fact that is not its lineage's current head (L3). |
| `supersedes-missing` | A fact joins a lineage that has a head and supersedes nothing (L3). |
| `view-mismatch` | An as-of view's `visible` list is not the one §6.4 derives. |
| `status-mismatch` | A fact status states a forecastness or freshness §6.5–§6.6 do not derive. |
| `rendering-mismatch` | A rendered value's `text` is not the text §10 renders its value as (§10.6). |

Checks run in the order the record declares its members, each member's own form before the relations
between members, and a fact's id last; the corpus never needs more than one class to apply.

## 4. Identity

A fact's **id** names *this method over these inputs, for this subject, metric and period*. It does
not name the value: two runs of one computation over the same inputs are one fact, whatever they
computed, which is what lets a re-run converge (L2, §6.3). The one exception is a fact a person
asserts, whose value is all the input there is: a `humanAsserted` fact folds a hash of its value into
the frame (§4.4).

### 4.1 The frame

The **frame** of a list of strings is the concatenation, in order, of each string written as

```
<length>:<string>
```

where `<length>` is the string's length in **UTF-16 code units** (a code point above U+FFFF counts
two), in ASCII decimal digits with no leading zero (`0` for the empty string). The frame is encoded as
UTF-8, and the **digest** of the list is the SHA-256 of those bytes, written as 64 **lower-case** hex
digits with no prefix.

A length prefix, unlike a separator, cannot be imitated by a field's content: `["ab","c"]` frames to
`2:ab1:c` and `["a","bc"]` to `1:a2:bc`, so two different lists never share a frame.

### 4.2 The fields

A fact's id is the digest of exactly these fields, in this order:

| # | Field | §  |
|---|---|---|
| 1 | the literal `fact` | names the recipe, so a fact id never equals another kind of id over the same values |
| 2 | the subject rendering | §4.3 |
| 3 | the metric id, as written | §5.1 |
| 4 | the period rendering | §4.3 |
| 5 | the method identity | §4.3 |
| 6… | each **effective input hash**, sorted ascending ordinally (§3.1 rule 4); duplicates kept | §4.4 |

### 4.3 The renderings

- **Subject:** `hierarchy` + `/` + the path members joined by `>`. The root of a hierarchy (an empty
  path) renders as `hierarchy/`.
- **Period:** the identity rendering of `from`, then `..`, then the identity rendering of `to`. The
  **identity rendering** of an instant is `YYYY-MM-DDTHH:MM:SS.fffffffZ` — always seven fractional
  digits, zero-padded: `2026-04-01T00:00:00Z` renders `2026-04-01T00:00:00.0000000Z`, and
  `2026-07-01T09:30:00.5Z` renders `2026-07-01T09:30:00.5000000Z`. The period's `label` is not in it.
- **Method identity:** `computed:` + operation + `:` + version + `:` + paramHash; or `asserted:` +
  principal; or `imported:` + certificate.

### 4.4 Effective input hashes and the value hash

For a `computed` or `imported` fact the effective input hashes are `evidence.inputHashes`, exactly as
carried. For a `humanAsserted` fact they are the **value hash** followed by `evidence.inputHashes`.

The value hash is the digest — SHA-256 over UTF-8, 64 lower-case hex digits, no prefix — of the
value's **value text**:

| Case | Value text |
|---|---|
| scalar | `scalar:` + the decimal text |
| interval | `interval:` + low + `:` + high |
| series | `series:` + the address, a content address or a host key, as carried (the locator is not in it) |
| distribution | `dist:` + each bucket as key + `=` + decimal text, in ascending ordinal key order, joined by `;` |
| categorical | `cat:` + the value |
| absent | `absent:` + the reason |

Decimal text enters the value text as carried, so its scale is significant (§3.3).

### 4.5 The input-hash form

An input hash is any non-empty string, and the frame treats them all alike. A producer naming a body of
data a fact was computed from SHOULD write it in the **content-hash form**

```
<algorithm>:<hex>
```

— a non-empty algorithm name of lower-case letters and digits, one colon, and an even number of
lower-case hex digits, at least 32 of them — as in `sha256:1a68…adaa`. A reader tells the inputs that
name data apart from other entries in the list (a run token, a value hash) by that form alone. The
value hash §4.4 adds is bare hex, not in this form.

### 4.6 What is outside identity

Not in the frame, so a change to any of them leaves the id unchanged: the value (except for
`humanAsserted`), `asOf`, the period's `label`, `evidence.resultRef` and `evidence.triggerRef`,
`confidence`, `supersedes`, `disclosure`, and a series' `locator`. The corpus pins each of these as a
pair of facts with equal ids (`relations` in the manifest).

### 4.7 Worked examples

`identity/computed-scalar` is a computed fact about `product/acme>widget-x`. Its fields are

```
fact
product/acme>widget-x
revenue
2026-04-01T00:00:00.0000000Z..2026-07-01T00:00:00.0000000Z
computed:rollup:2:sha256:ffaf48da5032d34dffdd6cbd98f6190bfb534d309c233e434cfbf0c0b4314d51
run:2026-07-02
sha256:1a682bcc89e6417f401d90a50051940f24f2d52cd06efd117ec522a9bbf0adaa
sha256:24784b6201704fe16bf715429e781c2c6b0b8dfe138f68d3bd976eec0e72ad0c
```

— the three inputs sorted (`r` before `s`), whatever order the evidence lists them in. Its frame is the
single line

```
4:fact21:product/acme>widget-x7:revenue58:2026-04-01T00:00:00.0000000Z..2026-07-01T00:00:00.0000000Z89:computed:rollup:2:sha256:ffaf48da5032d34dffdd6cbd98f6190bfb534d309c233e434cfbf0c0b4314d5114:run:2026-07-0271:sha256:1a682bcc89e6417f401d90a50051940f24f2d52cd06efd117ec522a9bbf0adaa71:sha256:24784b6201704fe16bf715429e781c2c6b0b8dfe138f68d3bd976eec0e72ad0c
```

and its id is `10d2b0e4ad62672234d0e62f66b72499dbb5c240099318a7030884aa26caefeb`. The same fact with
another value (`identity/computed-value-differs`) has the same id.

`identity/asserted-scalar` is the same subject, metric and period, asserted by `finance-lead` with the
value `412000.00` and no declared inputs. The value text is `scalar:412000.00`, whose hash is
`3cf77e4b262892289e7360569bd52f0552c753dffab76d7ce4e7797222bd3a56`; the frame is

```
4:fact21:product/acme>widget-x7:revenue58:2026-04-01T00:00:00.0000000Z..2026-07-01T00:00:00.0000000Z21:asserted:finance-lead64:3cf77e4b262892289e7360569bd52f0552c753dffab76d7ce4e7797222bd3a56
```

and the id `6c651c140fb7b4ece1675691ff8b6f9f18af6739dd6728b540e9c719efef83b5`. Asserting `398500.00`
instead, or `412000.0`, gives another id.

**Lengths are UTF-16 code units, and the bytes are UTF-8.** In `identity/computed-non-ascii` the
subject renders as `store/zürich>café-😀`: 19 code points, of which `ü` and `é` are one code unit each
and `😀` (U+1F600) is two, so the field frames as `20:store/zürich>café-😀`. The frame of the list
`["é","😀"]` is `1:é2:😀`, whose UTF-8 bytes are `31 3a c3 a9 32 3a f0 9f 98 80`. A host counting
bytes, or code points, computes a different id for every fact with a character outside ASCII.

### 4.8 Relation to Core's content address

`Fuaran.Core` addresses a declared record as `sha256:` + the SHA-256 of its canonical JSON text under a
named encoding profile ([`docs/identity-rule.md`](https://github.com/Fuaran-Core/fuaran-core/blob/main/docs/identity-rule.md)).
The Fact frame is **not** that: it is the length-prefixed frame of §4.1 over a list of strings, and a
fact id is bare hex. Over the list `["ab","c"]` the Fact frame hashes `2:ab1:c` and a canonical JSON
rendering would hash `["ab","c"]`, so the two never agree. The Fact frame is specified here, in full,
because ids minted under it are already held by stores and cited by signed artefacts, and changing the
frame would re-mint every one of them (`DECISIONS.md` D1, ruling 2). Where this specification names a body of
data by its content — a series (§5.3) — it uses Core's form.

## 5. The Fact record

### 5.1 Members

| # | Member | Type | Notes |
|---|---|---|---|
| 1 | `kind` | `"fact"` | |
| 2 | `wireVersion` | integer `1` | |
| 3 | `id` | 64 lower-case hex digits | §4; verified, never trusted |
| 4 | `subject` | SubjectRef | §5.2 |
| 5 | `metric` | string, non-empty, without `\|` | a metric id; resolves against a metric registry where the host has one (§7.6) |
| 6 | `value` | FactValue | §5.3 |
| 7 | `period` | TemporalExtent | §5.4; **valid time** |
| 8 | `asOf` | instant | **transaction time**: when the fact was accepted (§6) |
| 9 | `method` | MethodRef | §5.5 |
| 10 | `evidence` | Evidence | §5.6 |
| 11 | `confidence` | Confidence or `null` | §5.7 |
| 12 | `supersedes` | fact id or `null` | §5.9 |
| 13 | `disclosure` | Disclosure | §5.8 |

### 5.2 SubjectRef

A node in a subject hierarchy (§7.3): `hierarchy`, the hierarchy's id, then `path`, the ordered member
ids from the root down to the node the fact is about. An empty `path` is the hierarchy's root — a
total over every member. §3.5 constrains both.

### 5.3 FactValue

| `kind` | Members, in order | Meaning |
|---|---|---|
| `scalar` | `value` (decimal) | one value |
| `interval` | `low`, `high` (decimal) | the bounds of a range, `low` ≤ `high` (`interval-inverted`); not a probabilistic claim |
| `series` | `address`, `locator` | a body of points held elsewhere, never inlined |
| `distribution` | `buckets` (a map, §3.1 rule 4) | named buckets or quantiles to decimal values; at least one |
| `categorical` | `value` (string) | a label |
| `absent` | `reason` (string) | the queryable absence of a value, and why |

**A series is named by its address, which is one of two forms, told apart by its text alone.**

- A **content address**: `sha256:` and 64 lower-case hex digits — the content-address form of
  `Fuaran.Core.ContentAddress` — over the bytes of the series as stored. Any host can resolve and verify
  it. A producer that can address its series by content SHOULD.
- A **host key**: any other non-empty string that is **not** in the content-hash form of §4.5 and does
  not begin with `sha256:` — a store's own version key for the data, such as `objects/weekly-revenue@v14`.
  It is opaque: only the host that minted it can resolve it, and nothing verifies what it names. It is
  how a store that keyed its series by version before content addresses existed keeps every fact it
  holds, and every id it minted, unchanged.

Text in a content-hash form that is not a sha256 content address (`sha1:…`, or `sha256:` with the wrong
number of digits) is neither, and is refused (`shape-invalid`), so a malformed address is never read as a
host key. Either form enters the value text as carried (§4.4). `locator` is an optional, host-specific
hint for where the series' bytes may be found (a store's own version key, a path); it is `null` or a
non-empty string, and it is **never part of identity** (§4.6). A reader that cannot use a locator
ignores it; a reader that fetches by it verifies what it fetched against a content address.

### 5.4 TemporalExtent

`from`, `to` (instants) and `label` (a non-empty string, or `null`). The extent is half-open,
`[from, to)`; `from` after `to` is refused (`period-inverted`), and `from` equal to `to` is an
instant-valued period. `label` is a human tag (`Q2-2026`) scoped to the subject's calendar (§7.3); it
is never compared across calendars and is not in identity.

### 5.5 MethodRef

| `kind` | Members, in order | Meaning |
|---|---|---|
| `computed` | `operation`, `version`, `paramHash` | produced by a deterministic operation at a version, with a hash over its parameters |
| `humanAsserted` | `principal` | asserted by a principal; the value is the input (§4.4) |
| `imported` | `certificate` | received from a peer, with a reference to the certificate it arrived under; the id is kept and re-derived, never re-minted |

### 5.6 Evidence

`resultRef` (a reference to the result the fact was computed from, or `null`), `inputHashes` (a list of
non-empty strings, §4.5, in the producer's order — the list is data, and §4.2 sorts its own copy) and
`triggerRef` (what caused the fact to be computed, or `null`).

### 5.7 Confidence

`null`, or `value` (decimal) and `basis` (a non-empty string or `null`): an attribution of how sure the
producer is, citing where the number came from. Confidence is carried, not propagated: nothing here
derives one fact's confidence from another's.

### 5.8 Disclosure labels

| `kind` | Members | The label says |
|---|---|---|
| `surfaceable` | — | the fact may be shown beyond the host that holds it |
| `internal` | — | the fact is for computation and internal audit only |
| `restricted` | `policy` | the fact is governed by the named policy |

A label is **data a host carries**. §1 applies: this specification does not say what any label permits,
and conformance is reading and preserving it.

### 5.9 Supersedes

The id of the fact this one replaced in its lineage (§6.1), or `null`. It is **derived by the host
that accepts the fact**, from the lineage's head at that moment (§6.3), and is never supplied by the
producer of a draft. It is outside identity, so the id a producer computes is the id the store keeps.

## 6. The laws

### 6.1 The lineage key

A fact's **lineage key** is its subject rendering, its metric id, its period rendering and its method
identity (§4.3), joined in that order by `|`:

```
<subject>|<metric>|<period>|<method>
```

Two facts are in **one lineage** exactly when their lineage keys are equal. The input hashes, the value
and everything §4.6 lists are not in the key. So a new input or a new value supersedes **within** a
lineage, while a method with another operation, version or parameter hash, or another principal, starts
a **competing** lineage: two methods computing one subject, metric and period are two current facts, and
are never merged.

**The key is text a store indexes.** A host that keeps one head per lineage MAY hold the **lineage
digest** — the SHA-256 of the key's UTF-8 bytes, as 64 lower-case hex digits with no prefix — and when it
holds one, it holds that digest, so two hosts index one lineage alike. `identity/computed-scalar`'s key is

```
product/acme>widget-x|revenue|2026-04-01T00:00:00.0000000Z..2026-07-01T00:00:00.0000000Z|computed:rollup:2:sha256:ffaf48da5032d34dffdd6cbd98f6190bfb534d309c233e434cfbf0c0b4314d51
```

and the corpus's `lineage` family pins the key and its digest for one fact of each value kind and
method.

**Why a separator is safe here.** The key is joined by a separator, not framed as §4.1 frames the id,
because the joined form is the one stores already hold. A separator is unambiguous only if it cannot
occur inside what it separates, so §3.5 refuses `|` in a hierarchy, a path member and a metric id. The
period rendering never contains `|` and has a fixed length, and the method identity is the last field,
so with those refused no two different lineages share a key. Without the rule, subject `area/west` with
metric `revenue|net` and subject `area/west|revenue` with metric `net` would share one key, and a store
indexing by it would let one supersede the other.

### 6.2 The history document

A `factHistory` is the record a host exchanges to state what it accepted, and in what order:

| # | Member | Type |
|---|---|---|
| 1 | `kind` | `"factHistory"` |
| 2 | `wireVersion` | `1` |
| 3 | `facts` | a list of Fact records, in the order they were accepted |

A reader of a history applies L1–L3 and refuses a history that breaks one.

### 6.3 L1 – L3

- **L1, append-only.** No fact is changed or removed once accepted; a correction is a new fact that
  supersedes the old. Within one history an id appears once (`history-id-repeated`). Across two
  histories of one store, a later history **extends** an earlier one: the earlier history's facts are
  the later one's first facts, byte for byte, in order. The corpus pins both, the second as a pair of
  histories that each read and do not extend one another.
- **L2, identity determinism.** A fact's id is the digest of §4, so accepting a fact whose id is
  already present changes nothing: the history converges under replay and duplication. Every fact's
  `id` is recomputed and compared (`fact-id-mismatch`).
- **L3, supersession shape.** Reading the facts in order, with each lineage's **head** the last fact
  accepted into it:
  - a fact whose lineage has no head yet has `supersedes` `null`; one whose lineage has a head
    supersedes exactly that head (`supersedes-missing`, `supersedes-not-head`);
  - `supersedes` names an earlier fact of the history (`supersedes-unknown`) in the same lineage
    (`supersedes-cross-lineage`), and the superseder's `asOf` is strictly later
    (`supersedes-not-later`).

  A lineage is therefore one chain, acyclic by construction, with exactly one head.

### 6.4 L4, as-of visibility

The facts **visible at** an instant `t` are

```
visible(t) = { f | f.asOf ≤ t, and no g has g.supersedes = f.id and g.asOf ≤ t }
```

— what the host knew at `t`, superseded facts included until the moment they were superseded. An
`asOfView` states the visible set:

| # | Member | Type |
|---|---|---|
| 1 | `kind` | `"asOfView"` |
| 2 | `wireVersion` | `1` |
| 3 | `at` | instant |
| 4 | `history` | a `factHistory` |
| 5 | `visible` | the ids of `visible(at)`, ascending ordinally |

A reader derives the set and refuses a view that states another, or lists it in another order
(`view-mismatch`).

### 6.5 Forecastness

A fact is a **forecast** exactly when `period.to` is after `asOf`: its valid time runs past the moment
it was known. It is derived, never declared, and no member carries it on a Fact.

### 6.6 Freshness

Whether a fact is still **fresh** at an instant `at` follows from its metric's staleness policy (§7.1):

- `freshFor` with `windowSeconds` *w*: fresh while `at` ≤ `asOf` + *w* seconds, stale after;
- `untilSuperseded`: fresh while the fact is its lineage's head;
- `untilUpstreamChange`: fresh while the fact is its lineage's head and no input it names has changed.

For the two lineage-driven policies the host knows whether the fact is **current** — the head, and, for
`untilUpstreamChange`, with unchanged inputs — and this specification derives freshness from that. A
`factStatus` document states a fact's derived status:

| # | Member | Type |
|---|---|---|
| 1 | `kind` | `"factStatus"` |
| 2 | `wireVersion` | `1` |
| 3 | `fact` | a Fact |
| 4 | `staleness` | a staleness policy (§7.1) |
| 5 | `current` | boolean, as above |
| 6 | `at` | instant |
| 7 | `forecast` | boolean, §6.5 |
| 8 | `fresh` | boolean, this section |

A reader refuses a status whose `forecast` or `fresh` is not the derived one (`status-mismatch`).

## 7. Definitions and registries

Metric and subject **definitions** are data, so a host outside the one that registered a metric can
read a value in its unit and format, and two hosts can check that a metric id means the same thing on
both sides before they exchange facts. They are written to be referenced: a dataset model's measure, a
modelling result or a document cell names a metric definition **by id** (§7.6) rather than restating its
unit, currency and format.

### 7.1 Metric definition

| # | Member | Type | Notes |
|---|---|---|---|
| 1 | `kind` | `"metricDefinition"` | |
| 2 | `wireVersion` | `1` | |
| 3 | `id` | definition id | `[a-z0-9][a-z0-9._-]*`; else `token-invalid`. Stable; never a display name |
| 4 | `name` | string | display name; cosmetic |
| 5 | `unit` | unit text | §7.2 |
| 6 | `dimensionality` | string | a coarse label for grouping (`currency`, `count`, `ratio`, `duration`). Comparability is the unit's (§7.2), not this label's |
| 7 | `direction` | `higherIsBetter` \| `lowerIsBetter` \| `neutral` | which movement is better |
| 8 | `displayFormat` | record | below |
| 9 | `staleness` | tagged | `freshFor` (`windowSeconds`, an integer 1–2147483647) \| `untilSuperseded` \| `untilUpstreamChange`; §6.6 |
| 10 | `producingOperation` | string or `null` | the operation that produces the metric |
| 11 | `canonicalMethod` | string or `null` | a method-identity selector (§4.3) naming which lineage a method-less read prefers: a full identity, or a prefix of one ending at a `:` boundary (`computed:rollup` selects every version of `rollup`) |
| 12 | `rollUp` | tagged or `null` | `additive` (`tolerance`, decimal, not negative): a parent's value is the sum of its children's within the tolerance, in the metric's unit; \| `nonAdditive`; `null` is undeclared |
| 13 | `context` | string or `null` | prose about what the metric means; never a figure |

**Display format** is a record of `style`, `fractionDigits` and `grouping`, and says how a value is
shown, independent of any host's formatting library:

| `style` | Shows | `fractionDigits` | `grouping` |
|---|---|---|---|
| `verbatim` | the decimal text as carried | `null` | `false` |
| `number` | the value rounded half away from zero to `fractionDigits` places | 0–28 | thousands separators when `true` |
| `percent` | the value × 100, rounded likewise, with a percent sign | 0–28 | as `number` |
| `currency` | the value rounded likewise, with the unit's currency | 0–28 | as `number` |

`verbatim` with digits or grouping, another style without `fractionDigits`, or `currency` over a unit
that is not one currency (§7.2) is refused (`display-format-invalid`). The text a format renders a value
as — its rounding, its digits, its glyphs, its sign and its currency prefix — is §10's rendering
standard, and is the same on every host.

### 7.2 Units come from Core

A metric's `unit` is a unit in the unit algebra of `Fuaran.Core.Unit`, written as its **canonical
text** exactly as Core defines it —
[`docs/units.md`](https://github.com/Fuaran-Core/fuaran-core/blob/main/docs/units.md), "The admitted
subset" and "The canonical text" — never free text. The algebra sits below this specification, and a
value computed in it (a coefficient's unit is unit(y)/unit(x)) carries a unit in the same algebra, so
this specification does not define a second unit vocabulary. Text that does not parse, names something
not admitted, or is not the canonical text of the unit it names is refused (`unit-invalid`): `GBP` is
not a unit, `[GBP]` is; `kg.h-1` parses and is written `kg/h`. A dimensionless count is `1`.

**The currency is the unit's.** Core makes each ISO 4217 currency a unit of its own dimension
(`[GBP]`, `k[GBP]`), so a metric definition has no separate currency member: a metric is in a currency
exactly when its unit is that currency to the first power, optionally prefixed, and nothing else. Two
units compare by text; how one relates to another (`k[GBP]` to `[GBP]`) is Core's to say.

**The units a metric may declare** are exactly Core's admitted subset: the SI base units and coherent
derived units with the SI prefixes; `L`, `t` and `bar`; `min`, `h`, `d`, `wk` and `a`; `%`, `[ppm]` and
`[ppb]`; the international customary units of length and mass; every ISO 4217 currency in brackets; their
products, quotients and integer powers; and `1`, the dimensionless count. Nothing outside that subset is
a unit here, and a word such as `count` or `items` is not unit text (`unit-invalid`). **Core admits no
unit of information**, so a quantity of bytes is a count: a metric that counts bytes declares `1` and
says so in its `context`. When Core admits a byte unit, a metric may declare it, and doing so changes
that metric's definition and its digest (§7.5).

### 7.3 Subject definition

| # | Member | Type | Notes |
|---|---|---|---|
| 1 | `kind` | `"subjectDefinition"` | |
| 2 | `wireVersion` | `1` | |
| 3 | `id` | definition id | §7.1's grammar; the `hierarchy` a SubjectRef names |
| 4 | `name` | string | cosmetic |
| 5 | `levels` | list of strings, at least one | the kind of node at each depth, root first; a SubjectRef's path has at most this many members |
| 6 | `calendar` | string or `null` | the calendar a period label is read in (§5.4); `null` is the default calendar |

### 7.4 Registries

A **metric registry** (`kind` `metricRegistry`, then `wireVersion`, then `metrics`) and a **subject
registry** (`subjectRegistry`, `wireVersion`, `subjects`) list definitions in ascending ordinal order of
`id`, each id once (`registry-unordered`). An empty registry is a valid document.

### 7.5 The definition digest

The **definition digest** of a definition or a registry is `sha256:` and the 64 lower-case hex digits of
the SHA-256 of the document's canonical bytes (§3). Two hosts **agree on a metric** exactly when their
definitions of its id have one digest, and agree on a registry exactly when the registries do. This
digest is over this specification's canonical encoding: it is not a fact id (§4) and not Core's record
identity (§4.8), and the corpus's `definition` and `registry` families pin it.

### 7.6 Referencing a definition

Another document references a metric or subject definition by its `id`, and resolves it in a registry
it names or holds. A reference carries no copy of the unit, currency or format: those are the
definition's, so a change to one is a change to the definition, visible as a change of its digest
(§7.5).

## 8. Versioning

`wireVersion` is `1`. A change is **additive** when every document valid under the previous text is
valid under the new one and reads the same: a new optional record member (read leniently by older
readers, §3.2), a new reject class for something previously accepted only by mistake, a new corpus
family. Every other change is **breaking**: a new tagged case, a change to the frame, an identity
rendering, a value text or a law, a new required member. A breaking change moves `wireVersion`. **A change
to the identity frame, its renderings or the value texts re-mints ids**, and is not made inside a version.

**The rendering standard has a version of its own** (§10.1). A change to how a value is shown is a new
rendering rule, not a new `wireVersion`, because no document's bytes and no id depend on it; an earlier
rule is never redefined.

**What revision 1.1 of this text changed, inside version 1** (`DECISIONS.md` D2). A series address may be
a host key (§5.3): additive, since every document valid before is valid and reads the same. `|` is
refused in a hierarchy, a path member and a metric id (§3.5): a document that carried one was accepted by
mistake, because its lineage key is ambiguous, and no id of any other fact moves. The lineage key's text
(§6.1), the rendering standard (§10), the `renderedValue` document and the `rendering-mismatch` class are
new: a new statement, a new document kind and a new corpus family, which no earlier document is affected
by.

**The temporal extent moves down to Core.** Core has no period type today, so §5.4 and §3.4 specify
one here. The first time a Compute phase needs a period (forecasting, sequences), the type moves to
Core, and this specification then cites it as it cites Core's units, with the bytes of §3.4 and §4.3
unchanged (`DECISIONS.md` D1, ruling 7).

## 9. Certifying

### 9.1 Vector kinds

Each vector in `wire-fixtures/manifest.json` has a `kind`:

| Kind | To certify |
|---|---|
| `round-trip` | Read the document without refusal and re-encode it to the same bytes. |
| `hash` | As `round-trip`, and recompute the manifest's `digest` from the document's own members (§9.2). |
| `reject` | Refuse the document, for the `rejectClass` the manifest names. |
| `accept` | Read without refusal, ignoring what you do not know, as the vector named by `sameAs`. |

A history, a view or a status is read with its laws applied (§6), so a law's negative vectors are
ordinary `reject` vectors and its positive vectors ordinary `round-trip` vectors. **Divergence from
`SPEC_CONVENTIONS.md`:** none in the taxonomy; the manifest adds `relations` (§9.3) and per-vector
`law` tags, which certifying reads but no convention requires.

### 9.2 Digests, per family

| Family | `digest` | Recomputed from |
|---|---|---|
| `identity` | the fact id, §4 | the fact's own members |
| `lineage` | the lineage digest, §6.1; the vector also states the `lineageKey` itself, and both are checked | the fact's own members |
| `definition`, `registry` | the definition digest, §7.5 | the document's bytes |

### 9.3 Relations

`relations` lists pairs of vectors and what holds between them: `ids` `equal` or `distinct` (§4.6), or a
`history` that `extends` or `doesNotExtend` another (L1). A certifying host checks every one.

### 9.4 Two emitters

The corpus's documents and ids are produced by the resident emitter (Appendix B), written from this text
alone, and are checked against ids minted by an independent implementation for the same inputs. A
disagreement between two emitters is a defect in this text, settled here before the corpus moves, never
by adjusting a vector to match either side.

### 9.5 Forward coupling

A change to any member, encoding, rendering, digest or law updates **the text, the schemas, the
emitter and the corpus in one change**, and `pwsh ./run.ps1` passes over the result.

### 9.6 Document kinds and schemas

`fact`, `metricDefinition`, `subjectDefinition`, `metricRegistry`, `subjectRegistry`, `factHistory`,
`asOfView`, `factStatus`, `renderedValue` — each has a JSON Schema under `schemas/v1/`, and so do the subject
reference, value, temporal extent, method, evidence, disclosure label and staleness policy (§5,
§7.1). The schemas are **structural and subordinate**: what a pattern cannot express (a
decimal's range, a calendar date, unit text, the identity frame, the laws) is stated here and pinned by
the corpus. A document can pass its schema and still be refused.

## 10. Rendering

A value shown to a person, or quoted in text that a host later checks against the facts it cites, is
shown as **one** text: the one this section gives it under its metric's display format (§7.1). Two hosts
that render one value under one metric definition produce the same characters, so a quotation checked on
one host checks on the other. A host MAY show a reader a localised form, but that form is not the
rendering, and a host never compares a quotation against it.

### 10.1 The rendering rule

This section is **rendering rule 1**. A record that keeps a rendering for later checking — a
certificate over a narrative, a cached answer — records the rule it was rendered under, as the integer
`1`, and a host checks it under the rule it records. A change to any rendering here is a **new rule
number**, stated beside this one; a rule is never redefined, so a quotation made under rule 1 checks under
rule 1 for as long as a host implements rule 1. A reader refuses a rule it does not implement
(`version-unsupported`).

A quotation that records **no** rule was made before this standard, under its host's own renderer, which
this specification does not define. Only that host can check it, under the renderer it was made with; a
host checking quotations from another host accepts only those that record a rule.

### 10.2 Numbers

A quantity shown with `fractionDigits` *n*:

1. **Rounding.** The decimal value (§3.3) is rounded to *n* places **half away from zero**, exactly, in
   decimal: `2.345` at 2 is `2.35`, `-2.345` is `-2.35`, `2.344999` is `2.34`. No binary floating point is
   involved at any step.
2. **Digits.** The integer part in ASCII digits with no leading zero (`0` when it is zero); then, when *n*
   is above zero, `.` and exactly *n* digits, padded with zeros (`7` at 2 is `7.00`).
3. **Grouping.** When the format's `grouping` is true, an integer part of four or more digits is split
   into groups of three from the right, joined by `,` (`1,234,567.89`). The fraction is never grouped.
   Grouping applies after rounding, so `999.5` at 0 is `1,000`.
4. **Sign.** `-` (U+002D) before everything else when the rounded value is below zero. A value that rounds
   to zero has no sign (`-0.4` at 0 is `0`).

### 10.3 The styles

| `style` | Text |
|---|---|
| `verbatim` | the decimal text exactly as carried, its scale included (`412000.00`) |
| `number` | the value under §10.2 |
| `percent` | the value × 100 under §10.2, then `%` with no space (`0.12345` at 1 is `12.3%`). The value is read as a ratio whatever the metric's unit says |
| `currency` | the sign, then the currency's prefix (§10.4), then the value under §10.2, then, for a prefixed unit, the prefix's symbol: `-1234.5` in `[GBP]` at 0 is `-£1,235`; `12.5` in `k[GBP]` at 2 is `£12.50k` |

A negative currency figure is written with a leading `-`, **never in parentheses**. A currency figure
shows exactly `fractionDigits` digits: there is no per-currency default precision, so `412380` in `[GBP]`
at 2 is `£412,380.00` and at 0 is `£412,380`.

### 10.4 Currency prefixes

The prefix of a currency is its symbol in this table, or, for a code the table does not hold, the code
followed by one space (`CHF 1,299`). The table is the whole mapping and reads no locale data.

| Code | Prefix | Code | Prefix | Code | Prefix |
|---|---|---|---|---|---|
| `AUD` | `A$` | `HKD` | `HK$` | `MXN` | `MX$` |
| `BRL` | `R$` | `ILS` | `₪` | `NZD` | `NZ$` |
| `CAD` | `CA$` | `INR` | `₹` | `PHP` | `₱` |
| `CNY` | `CN¥` | `JPY` | `¥` | `TWD` | `NT$` |
| `EUR` | `€` | `KRW` | `₩` | `USD` | `$` |
| `GBP` | `£` | | | `VND` | `₫` |

### 10.5 Values

| `kind` | Text, each quantity under §10.3 |
|---|---|
| `scalar` | the quantity |
| `interval` | low, ` to `, high (`1.01 to 2.00`) |
| `series` | `series `, then the address as carried; the locator is not shown |
| `distribution` | each bucket as key, `: `, quantity, in ascending ordinal key order (§3.1 rule 4), joined by `; ` |
| `categorical` | the value |
| `absent` | `absent (`, the reason, `)` |

With no metric definition, every quantity is shown `verbatim`.

### 10.6 The rendered-value document

A `renderedValue` states one rendering, so that hosts can certify against it:

| # | Member | Type |
|---|---|---|
| 1 | `kind` | `"renderedValue"` |
| 2 | `wireVersion` | `1` |
| 3 | `rule` | integer, the rendering rule (§10.1) |
| 4 | `metric` | a metric definition (§7.1), or `null` for none |
| 5 | `value` | a FactValue (§5.3) |
| 6 | `text` | string |

A reader renders `value` under `metric` by the rule `rule` names and refuses a document whose `text`
differs (`rendering-mismatch`). The corpus's `rendering` family pins every rule above.

---

## Appendix A — implementation checklist

Ordered by how often each is the thing that is wrong.

1. Frame lengths are **UTF-16 code units**, not bytes and not code points (§4.1, §4.7).
2. Input hashes are **sorted ordinally** into the frame, duplicates kept; the evidence list keeps its
   own order (§4.2, §5.6).
3. A `humanAsserted` fact **adds the value hash**; no other method does (§4.4).
4. Decimal text is the value: **never normalise it**, and hash it as carried (§3.3, §4.4).
5. The identity rendering of an instant has **seven** fractional digits; the wire text has none when
   whole and no trailing zero otherwise (§3.4, §4.3).
6. Record members in **declaration order**; map keys sorted; optionals present as `null` (§3.1).
7. `supersedes` is the lineage head **at acceptance**, derived by the accepting host (§5.9, §6.3).
8. A series' `locator` is **not** identity (§5.3).
9. Disclosure labels are carried, never enforced by a reader (§5.8).
10. The lineage key is **joined by `|`**, not framed, and its digest is over the key's UTF-8 bytes (§6.1).
11. A rendering's glyphs are **fixed**: `.`, `,`, `%` with no space, `-` before a currency prefix, and the
    prefix from §10.4's table — never the reader's locale (§10).

## Appendix B — non-normative: the resident emitter

`wire-fixtures/fact.mjs` is one conformant reader and writer, written in JavaScript from this text.
`emit.mjs` builds every corpus document from unsorted input models through it, and `validate.mjs`
checks the corpus against the manifest, the schemas and the laws. Nothing normative depends on them.
