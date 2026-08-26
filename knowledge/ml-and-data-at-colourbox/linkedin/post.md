# LinkedIn post — ML and Data at Colourbox

**Format:** document post (upload `carousel.pdf`, 8 pages, 1080×1350).
**Regenerate the PDF:** open `index.html` in Chrome → Print → Save as PDF, paper size
1080×1350 px, margins none, background graphics on. Or headless:

    google-chrome --headless --print-to-pdf=carousel.pdf --no-pdf-header-footer file://$PWD/index.html

---

## Opslagstekst (dansk)

Ingen rakte hånden op da jeg spurgte om nogen havde brugt en agentic retireval/search før.

Sådan indledte jeg et oplæg til Cloud Club sammen med Michael Sloth, om hvordan vi bygger søgning til brugere og agenter i Colourbox og Skyfish. Det er den korteste måde, jeg kender, at forklare, hvorfor information retrieval er den del af en agent, man har allermindst råd til at fejle på.

Når en coding agent svarer på et spørgsmål om dit repository, laver den en søgning, kører grep, åbner det der så lovende ud, og gør det igen. Det virker forbløffende godt, fordi grep er eksakt, hurtig og gratis. Agenten har råd til at kigge mange gange før den finder det rigtige.

Ret så det samme loop mod Colourbox eller Skyfish, som er fuld af visuelle dokumenter. grep på en JPEG giver ingenting. Et scannet dokument er et billede af tekst. Det værktøj, agenten fik forærende, findes ikke for et assetbibliotek, det skal proceseres og indekseres, før agenten overhovedet får noget ud af det.

Her er en hurtig primer om, hvad det koster, og hvad der skal til for at eje hele stacken, så vi aldrig behøver at flytte kunders data udenfor EU: https://www.grontved.xyz/knowledge/ml-and-data-at-colourbox/#1 

Tak til Christian Tvede og Umbraco for invitationen og for at hoste.
