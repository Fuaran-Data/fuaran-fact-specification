# Decisions

The record of why this specification is the way it is. Each entry is numbered once and never renumbered;
a later decision that changes an earlier one says so and cites it.

---

## D1 — Version 1: the founding rulings (Phase 7, 2026-11-04)

The specification was cut with the rulings below. Rulings 3 and 4 were made by the operator on
2026-11-03 before the text was written; the rest were taken while writing it, each for the long term,
with the alternatives that were weighed.

**(1) Premise: the organisation's base permission.** Checked on 2026-11-04 before the repository was
created: the owning organisation's base permission is `read`, so every member of the organisation can
read its private repositories. This repository is public from its first commit, so the setting does not
bear on it; it is recorded because the premise asked for it, and because it does bear on any private
repository in the same organisation.

**(2) The identity frame is stated here, and is not Core's.** The premise was that `Fuaran.Core`'s
content address might frame a list of strings with the same bytes as the frame fact ids are already
minted under; if so, this specification would cite Core. It does not. Core's `ContentAddress` is
`sha256:` and the SHA-256 of a value's canonical JSON text under a named profile (Core's
`docs/identity-rule.md`); the Fact frame is the length-prefixed `<utf16-length>:<field>` concatenation
of §4.1, hashed to bare hex. Over `["ab","c"]` the one hashes `2:ab1:c` and the other `["ab","c"]`.
So §4 states the frame in full, with worked bytes, and this record says the Fact frame is distinct from
Core's.
*Alternatives.* (a) Adopt Core's address for facts: every id already held in a store, and every
signed artefact citing one, would be re-minted, for no property the length-prefixed frame lacks — it is
injective and value-free for computed facts, which is what lets a re-run converge (L2). (b) Add the
frame to Core as a second named frame: possible later, but Core ships no domain recipe, and the frame
is useful to Core only once a second domain mints ids under it. Neither is foreclosed; the bytes here
would not move under (b).

**(3) A series names a Core content address (operator, 2026-11-03).** `FactValue.series` carries
`address`, a `sha256:` content address in Core's form that any host can resolve and verify, and an
optional `locator`, a host-specific hint that is never part of identity (§5.3, §4.6). Consequence for an
existing store: a `humanAsserted` series fact hashes `series:` + the address, so ids agree with a store
whose series slot already holds the content address, and a store that keyed the slot by its own locator
re-mints those facts when it adopts this text. Computed and imported series facts are unaffected: the
value is outside their frame.

**(4) Definitions and registries both have a wire form in v1 (operator, 2026-11-03).** Metric and
subject definitions, and the registry documents that list them, are documents with schemas and
fixtures (§7). So that two deployments can tell they agree before exchanging facts, each carries a
**definition digest** over its canonical bytes (§7.5).
*Alternative.* Agreement by Core's record identity: it would need this specification to adopt Core's
canonical JSON for definitions while facts use their own encoding — two encodings in one document
family. Kept to one encoding; a definition's Core identity can be added later as an additive member.

**(5) Units come from Core; the currency is the unit's.** A metric's `unit` is the canonical text of a
unit in `Fuaran.Core.Unit`'s algebra, cited rather than restated (§7.2). Core makes each currency a unit
of its own dimension, so a definition has no separate currency member.
*Alternatives.* (a) A free-text unit: a vocabulary Compute could never use, since Compute already
carries units through Core's algebra. (b) A `currency` member beside the unit: two places to state one
fact, which can disagree (`unit` `%`, `currency` `GBP`). `dimensionality` is kept as a coarse grouping
label, as the kernel had it; comparability is the unit's.

**(6) A display format is a neutral record.** `style` (`verbatim`, `number`, `percent`, `currency`),
`fractionDigits` and `grouping` (§7.1).
*Alternative.* A host formatting library's format string: not implementable from the text by a host in
another language, and the specification would inherit that library's culture rules.

**(7) The temporal extent is specified here, and moves to Core when Compute needs it.** Core has no
period type, so §3.4 and §5.4 define the instant and the extent. The first Compute phase that needs a
period — the forecasting and sequence work (fuaran-core#597 and #599) is the likely first — moves the
type to Core; this specification then cites Core's period as it cites Core's units, and the bytes of
§3.4 and §4.3 do not change.

**(8) Decimal text, scale significant, 96-bit bounds.** A quantity is decimal text; the text is the
value and enters the value hash as carried (§3.3, §4.4).
*Alternatives.* (a) Normalise to the shortest text: one id per number, but every asserted fact already
minted from text with trailing zeros would be re-minted. (b) JSON numbers: not exact past 2⁵³, and
re-opens the question of which text a number has. The 96-bit coefficient and 28-place scale are the
bounds every mainstream decimal type holds exactly.

**(9) Separators are banned inside the tokens they separate.** The subject, method and distribution
renderings join members with `/`, `>`, `:`, `=` and `;`, so §3.5 refuses those characters inside the
members. This narrows what a valid fact is; it changes no id of a valid fact, and it makes each rendering
injective, so two different subjects (`a` / `b>c` and `a` / `b`, `c`) never render alike.

**(10) Instants: shortest on the wire, seven digits in identity.** UTC with `Z` only; no offset forms,
which would let one instant have many texts (§3.4). The identity rendering pads to seven fractional
digits (§4.3), which is the rendering ids are already minted under.

**(11) The laws are reader rules over three documents.** `factHistory`, `asOfView` and `factStatus`
carry the laws (§6), and a reader applies them while reading. Positive law vectors are then `round-trip`
vectors and negative ones `reject` vectors, inside the convention's vector taxonomy; the pairs that
belong to no single document (equal and distinct ids, one history extending another) are the manifest's
`relations`.
*Alternative.* A new `derive` vector kind: an extension of the taxonomy for no capability the documents
lack.

**(12) Whole-corpus conformance.** §2. A host that verifies a fact id reads the record, and a host that
reads a history applies the laws to the same records; no deployment is complete without a family.

**(13) The boundary sweep holds its names as digests.** `run.ps1` refuses private names in every tracked
file and every commit message. The list is held as SHA-256 digests of the lower-case names, matched
against every word, joined-word part and two- or three-word run, so that the public gate does not itself
publish the names it protects. A sentinel proves the sweep goes red on each form.

**(14) No package manager, no F#.** The corpus tooling is three dependency-free Node modules; `run.ps1`
resolves the `node` application directly and shells no `npm`, `npx` or `pnpm`, so it inlines none of
those launcher helpers. The repository carries no F#, so it carries no `global.json` and no formatter
manifest.

**(15) What the kernel keeps and leaves.** The metric definition carries what a reader needs to read a
value and compare deployments: identity, unit, direction, format, staleness, the producing operation,
the canonical-method selector, roll-up semantics and context. A recompute policy — what a host does when
an input changes — is an execution policy of the host, and is left out. A fact's `metric` is any
non-empty string, so facts minted before a definition existed stay valid; a definition's `id` is a
token, and a fact whose metric resolves in a registry names a token.

**(16) The fact id is bare hex.** 64 lower-case hex digits, no `sha256:` prefix, as ids are already
held. A series address, an input in content-hash form and the definition digest carry the prefix; a fact
id does not, and the specification never needs to tell them apart by prefix alone.

## D2 — Revision 1.1: a host with stored facts adopts without migrating them, and one rendering is the standard (Phase 35, 2026-11-16)

A host whose stores already held facts was to adopt the reference package for this text. A probe run at that host
found its fact ids equal to this text's on every case, and four things that were not: the lineage key, the saved
shape of a value and an instant, a series address, and the rendering of numbers. Three operator rulings settled
them (2026-11-15): a host's stored facts do not change to adopt the kernel; the reference package's rendering is
the standard for every host; and the package's metric definition type carries the host's recompute policy. This
entry records what each did to this text. Each is classed as a **wire change** (what a valid document is moves) or
a **reader's tolerance** (an implementation reads something that is not a document of this text).

**(1) The lineage key is the `|`-joined form stores hold (§6.1). Not a wire change.** No document carries a lineage
key: §6.1 defined lineage membership as four renderings compared member for member, and the reference package
framed them as §4.1 frames an id. A store that keeps one head per lineage indexes it by a digest of the key, so the
key's bytes are a compatibility surface, and the form stores already hold is the four renderings joined by `|`. The
text now states that form, with the lineage digest (SHA-256 over the key's UTF-8 bytes) beside it, and the new
`lineage` corpus family pins both for seven facts, one per value kind and method.
*`|` inside a field.* The joined form does not escape its separator, so it can collide: subject `area/west` with
metric `revenue|net` and subject `area/west|revenue` with metric `net` share a key. The ruling was to refuse the
field rather than change the key's bytes, so §3.5 refuses `|` in a hierarchy, a path member and a metric id
(`token-invalid`). That is the minimum: the period rendering has a fixed length and no `|`, and the method identity
is the last field, so a method's members keep `|`. This **narrows** what a valid fact is. §8 admits that inside a
version for something accepted by mistake, and a fact with `|` in one of those fields was: its lineage could not be
told apart from another's by the key every store indexes. No id of any other fact moves.
*Alternatives.* (a) Keep the framed key: every head a store already indexes would be orphaned, which ruling 1
forbids. (b) Escape `|` inside fields: changes the key's bytes for exactly the facts that carry one, and a store
cannot tell which of its keys were written escaped.

**(2) A series address may be an opaque host key (§5.3). A wire change, additive.** D1 ruling 3 made a series a
Core content address with an optional locator. A store that named its series by its own data version key before
content addresses existed holds `humanAsserted` series facts whose ids hash `series:` and that key. Ruling 1 keeps
them, so the address is now one of two forms told apart by text alone: a content address, or a **host key**, any
other non-empty string that is not in §4.5's content-hash form and does not begin with `sha256:`. The exclusions
keep a malformed content address (`sha1:…`, a truncated digest) refused rather than read as a key, which is why
`record/reject-series-address` still holds and `record/reject-series-address-truncated` joins it. Every document
valid before is valid and reads the same, so this is additive under §8; a reader of the earlier text refuses a
host-key series, which is the forward-compatibility cost of any widening.
*Alternative.* A separate member beside `address`: a new required member is breaking (§8), and two members that
cannot both be set are a worse shape than one member with two forms.

**(3) The saved shape is a reader's tolerance, not the wire.** The host's stores keep a fact as its own serialiser
wrote it: a scalar as a JSON number, an instant as an ISO date with or without `Z`. Ruling 1 has the reference
package read that shape. This text is unchanged by it: the legacy shape is not a document of this specification,
is read by one implementation for its hosts' sake, and is never written. Nothing here describes it, so that no
second implementation takes it for part of the wire.

**(4) The rendering standard, rule 1 (§10). New: a statement, a document kind, a reject class and a corpus
family.** §1 put presentation out of scope and §7.1 left the glyphs to the reader's locale. Ruling 2 makes one
rendering the standard for every host, so that a number quoted in a narrative and checked against the facts it
cites checks the same way on every host that exchanges such checks. The decisions taken inside that ruling, each
for the long term:

- *Negative currency* is `-£1,235`, the sign before the prefix. Accounting parentheses are a layout idiom, they read
  as an aside inside prose, and a quotation checker would have to know that `(£1,235)` is a number.
- *Percent* is `12.3%` with no space, as English prose writes it.
- *Grouping* is `,` every three digits of the integer part only, applied after rounding; the decimal separator is
  `.`.
- *Glyphs are fixed.* The sentence leaving separators and symbols to the reader's locale is withdrawn: a localised
  form is a display, and §10 says it is never what a host compares.
- *Rounding* is half away from zero in exact decimal arithmetic, as §7.1 already said.
- *Currency prefixes* are a table of seventeen codes with a code-and-space fallback, read from no locale data.
- *A prefixed currency unit* shows its prefix after the number (`£12.50k` for `12.5` in `k[GBP]`). Showing `£12.50`
  would misstate the amount by the prefix's factor.
- *Fraction digits are the format's, never the currency's.* A currency figure shows exactly `fractionDigits` digits;
  there is no per-currency default precision. That is the rule a located currency figure already follows elsewhere
  in this family of specifications, where a declared digit count is honoured exactly, so the two do not fork.
- *Percent reads its value as a ratio* whatever the unit, which is how stored formats already behaved. A metric whose
  unit is `%` and whose values are already percentages should use `number`.
- *Units* are Core's admitted subset, listed in §7.2. **Bytes** are a count: Core admits no unit of information, so a
  metric that counts bytes declares `1` and says so in its `context`. When Core admits a byte unit, declaring it is a
  change to that metric's definition.
- *A rule version.* §10.1 defines rendering rule 1, recorded by any record that keeps a rendering for later checking,
  and never redefined. A quotation that records no rule predates the standard, and only the host whose renderer made
  it can check it. The rule's version is separate from `wireVersion` because no document's bytes or id depend on it.

The `renderedValue` document (§10.6) and the `rendering-mismatch` class let a host certify against the rule as it
certifies against the laws (D1 ruling 11): a positive vector reads, a negative one is refused for its class.
*Alternative.* Pin renderings only in each implementation's own tests, as the reference package did: two
implementations would then agree only by accident, which is the failure the ruling exists to prevent.

**(5) The recompute policy stays off the wire (D1 ruling 15 stands).** Ruling 3 gives the reference package's metric
definition type a slot for the host's recompute policy, so that a host needs no second definition type. It is not a
member here: what a host does when an input changes is that host's execution policy, two hosts may rightly differ on
it, and if it were in the definition its digest (§7.5) would say they disagree on what a metric means when they do
not.
*Alternative.* A fourteenth member, optional on read: it would move every definition's digest, and make two
deployments that schedule differently disagree about a metric's meaning.

**Which revision.** These changes are revision 1.1 of version 1 (§8). The corpus moved with them: 44 vectors were
added (an identity vector for a host-key series, seven lineage vectors, four record refusals and 32 rendering
vectors), and no existing document's bytes or id changed.

## D3 — Revision 1.2: a legacy reader tolerates the refused tokens at rest, and says where facts then collide (Phase 37, 2026-11-16)

D2 kept a host's stored facts readable without migration, and narrowed §3.5 by refusing `|` in a hierarchy, a
path member and a metric id. The reference package's legacy reader then held a stored fact to every token rule,
so a fact at rest carrying a token the text refuses (a path member with `>` or `|`, or empty; a hierarchy with `/`
or `|`; a metric id with `|`; a computed method's operation or version with `:`; a distribution key with `=` or
`;`) no longer read, and a host whose store held such facts could not adopt without rewriting them, which D2 set
out to avoid.

**(1) A legacy reader MAY accept these tokens on data at rest, and only there. A reader's tolerance, not a wire
change.** §3.5 now says so beside its table. Every document is read exactly as before: the rules bind every
document and every writer, a writer still refuses a fact carrying one of these tokens, and so a new fact cannot
carry one. The tolerance waives the token rules and nothing else: the id is verified as §4 says, and the fact is
returned with the id and lineage key its store holds. The text describes no saved shape (D2 (3) stands); it states
only which tokens such a reader may accept, so that an implementation offering one knows where its tolerance ends.

**(2) Where accepted tokens make two facts render alike, both are returned as stored, and the text says which and
what a host does.** The renderings are joined, not framed, so a tolerated token can make two different facts give
one rendering. §3.5's table states it per token: `>`, an empty path member, `/` in a hierarchy and `:` in a method
member can give two facts one id and one lineage key, and the other fact can be one a writer accepts today; `|`
can give two stored facts one lineage key, never one id, and never collides with a fact a writer accepts today;
`=` or `;` in a bucket key can give two `humanAsserted` facts one id and leaves the key alone. A host compares
members before it treats an id or key hit as the same fact when either carries a tolerated token, and keeps two
facts as two. Ending the ambiguity is the host's own migration, which nothing requires.
*Alternatives.* (a) Refuse the facts and require a migration: the outcome D2 set out to prevent, for a defect the
writer, not the data, should carry. (b) Escape the tokens when computing the key or the id of a tolerated fact:
that changes the bytes of exactly the keys and ids a store already indexes, and orphans them. (c) Return one fact
where two collide: a reader that merges is a reader that loses data. (d) Describe the legacy shape and add a
corpus family for it: conformance is whole-corpus (§2), so every implementation would then have to read a shape
that is not a document of this text. The facts that pin the tolerance live with the implementation that offers it.

**(3) Every refused token has a reject vector.** `record/reject-version-colon` and
`record/reject-bucket-key-semicolon` join the seven `token-invalid` record vectors and the empty-path-member vector, so a
writer that admitted a refused token on the wire fails certification on each one. Additive (§8): each refuses what
was already refused.

**Which revision.** These changes are revision 1.2 of version 1 (§8). No document's bytes or id changed, and the
corpus gained the two vectors above.
