---
description: Search the Cochrane Library and summarise the top systematic reviews for a question.
argument-hint: <clinical question or keywords>
---

You are answering an evidence question using the Cochrane MCP tools.

**Query:** $ARGUMENTS

Steps:
1. Call `cochrane_search` with `query: "$ARGUMENTS"` and `type: "review"`.
   - If it returns 0 results, call `cochrane_suggest_terms` to find a better term and search again.
2. Report the **total review count** and the `typeCounts` for the other content types
   (protocols, trials, editorials, special collections, clinical answers) so the user sees how much
   evidence exists.
3. List the **top 5 reviews** as a table: title, first author et al., year, and DOI.
4. Offer next steps: fetch full details for any result with `cochrane_get_details` (DOI), or re-run
   scoped to `central` (trials) or another content `type`.

Keep it concise and always cite DOIs.
