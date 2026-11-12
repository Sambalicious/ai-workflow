# Measured comparison: Gherkin versus spec table

**Read this as format cost, not role behaviour.** One author wrote both artifacts from
the same criteria. It shows what each format costs to carry the same information; it does
not show what two different roles would produce. The frontier review made exactly this
point, and stage 1's comparison is designed to measure the roles instead.

Current artifacts are in `example/EPIC-0005/`. The spec now has 20 cases and the baseline
16 scenarios, because the review found four behaviours the first draft was missing
(delivery fee, take-over, Pidgin fallback, and the fulfilment-note next step).

| | Gherkin `.feature` | Spec `.md` | Delta |
|---|---|---|---|
| Lines | 137 | 99 | −28% |
| Words | 1,005 | 1,670 | +66% |
| Characters | 6,806 | 9,195 | +35% |
| Cases covered | 16 scenarios | 20 cases | +4 |
| Characters per case | 425 | 460 | +8% |
| IDs on every case | `@S07_001` tag | `S07_001` cell | same |
| Traceability | scenario tag only | criterion → rule → case → coverage, all four directions | stronger |
| Rules stated explicitly | none | 10 | new |
| Criteria traced | none | 12 | new |

## What this actually shows

**Per case, the two formats cost about the same: 8% more per case for the table.** That is
the number that survives. Everything else is overhead the spec pays to say things Gherkin
does not say at all: 12 quoted criteria, 10 rules, an eight-row coverage table, and a
declared manual check.

**My earlier estimates were wrong, twice, in opposite directions.** First "roughly a third
smaller" (unmeasured), then "about 11% smaller" (measured on a draft that the review then
showed was under-covering). The honest current number is **35% larger**, and the reason is
that the earlier drafts were quietly dropping coverage. A spec that covers what Gherkin
covered is not smaller than Gherkin.

**Two measurements now, two different artifacts.** The 11% figure and this 35% figure are
not in conflict; they measure different specs. The first was under-specified. This one
meets the closure rules and covers four more behaviours.

**The line count still drops, 28%.** A changed case is a one-row diff, not a five-line
block.

## What Gherkin did better, honestly

- **Scenario Outline compresses combinatorics.** One outline with a 12-row `Examples` table
  beats 12 table rows. The spec replaces it with an optional parameter table, and the
  review's fix makes it mandatory at three or more differing inputs, because otherwise it
  is simply forgotten.
- **The grammar forces one action and one outcome.** `When` is one action by construction.
  The spec has to state that as a rule and let the checker count `;`, which is weaker.
- **Tooling.** Syntax highlighting, linting and step definitions. None is in use here.

## Verdict

The format is not a saving. It is a trade: roughly the same cost per case, plus a fixed
overhead for criteria, rules and coverage, in exchange for traceability in both directions
and a checker that can enforce what Gherkin only implied. If the overhead buys nothing, the
migration is not worth it; that is exactly what stage 1 tests.
