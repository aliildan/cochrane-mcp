import * as cheerio from "cheerio";
import type { SearchResultItem, SearchResults, TypeCounts } from "../types.js";

const ORIGIN = "https://www.cochranelibrary.com";

function abs(href: string | undefined): string | null {
  if (!href) return null;
  return href.startsWith("http") ? href : ORIGIN + href;
}

function doiFromHref(href: string | null): string | null {
  if (!href) return null;
  const m = href.match(/\/doi\/(10\.\d{4}\/[^/?]+(?:\/[^/?]+)?)\/full/i);
  return m ? m[1] : null;
}

export function parseSearchResults(html: string, page: number, resultsPerPage: number): SearchResults {
  const $ = cheerio.load(html);

  const totalText = $(".results-number").first().text().replace(/[^\d]/g, "");
  const total = totalText ? parseInt(totalText, 10) : 0;

  const typeCounts: TypeCounts = {};
  $('a[href*="selectedType="]').each((_, el) => {
    const href = $(el).attr("href") || "";
    const m = href.match(/selectedType=([a-z_]+)/i);
    if (!m) return;
    const type = m[1];
    if (type in typeCounts) return;
    const num = ($(el).text().match(/([\d,]+)\s*$/) || [])[1];
    if (num) typeCounts[type] = parseInt(num.replace(/,/g, ""), 10);
  });

  const items: SearchResultItem[] = [];
  $(".search-results-item").each((i, el) => {
    const $el = $(el);
    const $a = $el.find(".result-title a").first();
    const href = abs($a.attr("href"));
    const dataDoi = $el.find("[data-article-doi]").first().attr("data-article-doi") || null;
    items.push({
      rank: parseInt($el.find(".search-results-item-tools label").first().text().trim(), 10) || i + 1,
      title: $a.text().replace(/\s+/g, " ").trim(),
      doi: dataDoi || doiFromHref(href),
      url: href,
      authors: $el.find(".search-result-authors").text().replace(/\s+/g, " ").trim(),
      contentType: $el.find(".search-result-type").text().replace(/\s+/g, " ").trim(),
      stage: $el.find(".search-result-stage").text().replace(/\s+/g, " ").trim() || null,
      date: $el.find(".search-result-date").text().replace(/\s+/g, " ").trim() || null,
      access: $el.find(".access-label").first().text().replace(/\s+/g, " ").trim() || null,
    });
  });

  return { total, page, resultsPerPage, typeCounts, items };
}
