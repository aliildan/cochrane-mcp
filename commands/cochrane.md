---
description: Search the Cochrane Library and summarise top systematic reviews.
argument-hint: <query>
---

Search the Cochrane Library for: **$ARGUMENTS**

1. Call `cochrane_search` with `query: "$ARGUMENTS"`, `type: "review"`.
2. Report the total review count and the `typeCounts` for other content types.
3. List the top 5 results (title, authors, year, DOI).
4. Offer to fetch details (`cochrane_get_details`) for any result the user picks.
