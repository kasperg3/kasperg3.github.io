# LinkedIn post — ML and Data at Colourbox

**Format:** document post — upload `linkedin-excerpt.pdf` (6 pages, 1920×1080, 16:9).

**Contents** — six slides lifted verbatim from `../index.html`, in this order:

| Page | Slide in the talk | Title |
|-----:|------------------:|-------|
| 1 | 3 | Who here has tried agentic search? |
| 2 | 10 | Two products, two retrieval problems |
| 3 | 5 | Your agents are only as good as your retrieval |
| 4 | 7 | Tied on quality, 1,431× apart on cost |
| 5 | 18 | Late interaction sits in the middle |
| 6 | 32 | An agent searching a DAM needs all of it |

**Regenerating:** the deck is a single-slide-at-a-time engine, so the PDF is built by a
throwaway print harness that pulls those `<section class="slide">` blocks out of `../index.html`
verbatim and lays them out one per page. Two harness-only overrides: animations disabled, and
`.grad` (the gradient-clipped words) rendered as solid accent, since `background-clip:text`
does not survive Chrome's print pipeline. The deck itself is never modified.

---

## Opslagstekst (dansk)

“Your agents are only as good as your retrieval.”  - Atita Aroras

Ingen rakte hånden op da jeg spurgte om nogen havde brugt en agentic retireval/search før.

Sådan indledte jeg et oplæg om, hvordan vi bygger søgning til brugere og agenter i Colourbox og Skyfish. Det er den
korteste måde, jeg kender, at forklare, hvorfor information retrieval er den del af en agent, man har
allermindst råd til at fejle på.

Når en coding agent svarer på et spørgsmål om dit repository, læser den ikke dit repository. Den
planlægger en søgning, kører grep, åbner det, der så lovende ud, og gør det igen. Det virker
forbløffende godt, fordi grep er eksakt, hurtig og gratis. Agenten har råd til at kigge
mange gange før den finder det rigtige.

Ret så den samme loop mod et stockbibliotek, eller mod en kundes DAM fuld af visuelle dokumenter. grep på en JPEG giver ingenting. Et
scannet dokument er et billede af tekst. Det værktøj, agenten fik forærende, findes ikke for et
assetbibliotek, det skal proceseres og indekseres, før agenten overhovedet får noget ud af det.

Her er en hurtig primer om, hvad det koster, og hvad der skal til for at eje hele stacken, så vi aldrig behøver at flytte kunders data udenfor EU.

Hele oplægget, med diagrammer og alle kilder:
https://www.grontved.xyz/knowledge/ml-and-data-at-colourbox/
