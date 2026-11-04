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
