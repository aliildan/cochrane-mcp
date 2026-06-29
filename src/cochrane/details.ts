import * as cheerio from "cheerio";
import type { AnyNode } from "domhandler";
import type { Author, Details, ReviewDetails, TrialDetails } from "../types.js";
import { detectContentType } from "./urls.js";

type C = cheerio.CheerioAPI;

export function collectCitationMeta($: C): Record<string, string[]> {
  const meta: Record<string, string[]> = {};
  $('meta[name^="citation_"]').each((_, el) => {
    const name = $(el).attr("name")!;
    const content = $(el).attr("content") ?? "";
    (meta[name] ||= []).push(content);
  });
  return meta;
}

const one = (m: Record<string, string[]>, k: string): string | null => m[k]?.[0] ?? null;

const ABSTRACT_KEYS: Record<string, string> = {
  "background": "background",
  "objectives": "objectives",
  "search methods": "searchMethods",
  "selection criteria": "selectionCriteria",
  "data collection and analysis": "dataCollectionAnalysis",
  "main results": "mainResults",
  "authors' conclusions": "authorsConclusions",
};

// Normalise curly apostrophes/quotes to straight for heading lookup.
const normHeading = (s: string): string => s.replace(/\s+/g, " ").trim().toLowerCase().replace(/[‘’ʼ`]/g, "'");

// Text of an element with its section heading removed.
function bodyWithoutTitle($: C, el: AnyNode): string {
  const $clone = $(el).clone();
  $clone.find(".title").first().remove();
  $clone.find(".download, .pdf-link").remove();
  return $clone.text().replace(/\s+/g, " ").trim();
}

export function parseReviewDetail(html: string, doi: string): ReviewDetails {
  const $ = cheerio.load(html);
  const m = collectCitationMeta($);

  const names = m["citation_author"] ?? [];
  const insts = m["citation_author_institution"] ?? [];
  const authors: Author[] = names.map((name, i) => ({
    name,
    institution: insts[i] || undefined,
  }));
  const email = one(m, "citation_author_email");
  if (email && authors[0]) authors[0].email = email;

  const keywords = (one(m, "citation_keywords") ?? "")
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean);

  // Structured abstract: each <section> in .abstract.full_abstract has an h3.title heading.
  const abstract: Record<string, string> = {};
  $(".abstract.full_abstract section").each((_, sec) => {
    const heading = normHeading($(sec).find(".title").first().text());
    const key = ABSTRACT_KEYS[heading];
    if (key) abstract[key] = bodyWithoutTitle($, sec);
  });

  // Plain language summary lives in its own .abstract_plainLanguageSummary container.
  const $pls = $(".abstract_plainLanguageSummary").first();
  const pls = $pls.length ? bodyWithoutTitle($, $pls.get(0)!) || null : null;

  return {
    kind: "review",
    doi: one(m, "citation_doi") ?? doi,
    title: one(m, "citation_title") ?? $("h1").first().text().trim(),
    authors,
    journal: one(m, "citation_journal_title"),
    issue: one(m, "citation_issue"),
    date: one(m, "citation_date"),
    onlineDate: one(m, "citation_online_date"),
    issn: one(m, "citation_issn"),
    language: one(m, "citation_language"),
    keywords,
    abstract,
    plainLanguageSummary: pls,
    pico: null,
    relatedArticles: null,
    urls: {
      html: one(m, "citation_fulltext_html_url") ?? `https://www.cochranelibrary.com/cdsr/doi/${doi}/full`,
      abstract: one(m, "citation_abstract_html_url"),
      pdf: one(m, "citation_pdf_url"),
    },
  };
}

export function parseTrialDetail(html: string, doi: string): TrialDetails {
  const $ = cheerio.load(html);
  const m = collectCitationMeta($);
  const authors: Author[] = (m["citation_author"] ?? []).map((name) => ({ name }));
  const keywords = (one(m, "citation_keywords") ?? "")
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean);
  // Trials have no structured abstract sections; take the abstract container text if present.
  const abstractText = $(".abstract, .full_abstract").first().text().replace(/\s+/g, " ").trim();
  return {
    kind: "trial",
    doi: one(m, "citation_doi") ?? doi,
    title: one(m, "citation_title") ?? $("h1").first().text().trim(),
    authors,
    source: one(m, "citation_journal_title"),
    date: one(m, "citation_online_date") ?? one(m, "citation_date"),
    keywords,
    abstract: abstractText || null,
    urls: {
      html: one(m, "citation_fulltext_html_url") ?? `https://www.cochranelibrary.com/central/doi/${doi}/full`,
      pdf: one(m, "citation_pdf_url"),
    },
  };
}

export function parseDetail(html: string, doi: string): Details {
  return detectContentType(doi) === "central"
    ? parseTrialDetail(html, doi)
    : parseReviewDetail(html, doi);
}
