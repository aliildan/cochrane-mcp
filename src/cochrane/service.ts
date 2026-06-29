import { z } from "zod";
import { DetailsInput, SearchInput, SuggestInput, type Details, type SearchResults } from "../types.js";
import { buildDetailUrl, buildJsonResourceUrl, buildSearchUrl, buildSuggestUrl, detectContentType } from "./urls.js";
import { parseSearchResults } from "./search.js";
import { parseDetail } from "./details.js";
import { parseSuggestions } from "./suggest.js";
import { parsePico, parseRelated } from "./jsonApi.js";

interface Http {
  fetchText(url: string, accept?: string): Promise<string>;
}

export class CochraneService {
  constructor(private readonly http: Http) {}

  async search(input: z.input<typeof SearchInput>): Promise<SearchResults> {
    const p = SearchInput.parse(input);
    const html = await this.http.fetchText(buildSearchUrl(p));
    return parseSearchResults(html, p.page, p.resultsPerPage);
  }

  async getDetails(input: z.input<typeof DetailsInput>): Promise<Details> {
    const { doi } = DetailsInput.parse(input);
    const html = await this.http.fetchText(buildDetailUrl(doi));
    const details = parseDetail(html, doi);
    if (details.kind === "review" && detectContentType(doi) === "cdsr") {
      const [pico, related] = await Promise.all([
        this.http.fetchText(buildJsonResourceUrl("get-pico-data", doi), "application/json").then(parsePico).catch(() => null),
        this.http.fetchText(buildJsonResourceUrl("get-related-articles", doi), "application/json").then(parseRelated).catch(() => null),
      ]);
      details.pico = pico;
      details.relatedArticles = related;
    }
    return details;
  }

  async suggest(input: z.input<typeof SuggestInput>): Promise<{ suggestions: string[] }> {
    const { query } = SuggestInput.parse(input);
    const body = await this.http.fetchText(buildSuggestUrl(query), "application/json");
    return { suggestions: parseSuggestions(body) };
  }
}
