# Standards & Data

## NYT Crossword Standards (Must Enforce)
| Rule | Detail |
|------|--------|
| Grid sizes | Exactly 15×15 (daily) and 21×21 (Sunday) only |
| Symmetry | 180° rotational symmetry mandatory |
| Min word length | 3 letters (no 2-letter words ever) |
| Interlock | All white cells connected (no isolated sections) |
| Checked letters | Every white cell must be in both an Across and Down word |
| No duplicates | No repeated answers in same grid |
| Word count | ≤78 (weekday), ≤72 (themeless), ≤140 (Sunday) |
| Black squares | ~16% max (~36 in 15×15) |
| Themes | Mon-Thu + Sun: themed; Fri-Sat: themeless |

## Word Database Sources
| Source | Size | Notes |
|--------|------|-------|
| Spread the Wordlist | ~303K entries | Data-driven, scored 0-60, updated quarterly |
| Peter Broda's Wordlist | ~427K entries | Comprehensive, scored 1-100 |
| Collaborative Word List | ~568K entries | Community-maintained |
| XWord Info | ~252K entries | Every NYT answer + additions by Jeff Chen |

Target: compile a merged, deduplicated list of 400K+ entries with unified scoring.