import { z } from "zod";

export const CONTENT_TYPES = ["review", "protocol", "central", "editorial", "specialcollections", "cca"] as const;
export type ContentType = (typeof CONTENT_TYPES)[number];

export const SEARCH_FIELDS = {
  "title-abstract-keyword": "1",
  "record-title": "2",
  "abstract": "3",
  "author": "4",
  "keyword": "5",
  "all-text": "6",
  "source": "8",
  "doi": "9",
  "accession-number": "10",
  "cochrane-group": "12",
} as const;
export type SearchField = keyof typeof SEARCH_FIELDS;

export const ORDER_BY = {
  "relevancy": "relevancy",
  "title-asc": "title_sortable-false",
  "title-desc": "title_sortable-true",
  "date-desc": "displayDate-true",
  "date-asc": "displayDate-false",
} as const;
export type OrderBy = keyof typeof ORDER_BY;

export interface SearchUrlParams {
  query: string;
  type?: ContentType;
  searchField?: SearchField;
  orderBy?: OrderBy;
  page?: number;
  resultsPerPage?: number;
  yearFrom?: number;
  yearTo?: number;
}

export interface SearchResultItem {
  rank: number;
  title: string;
  doi: string | null;
  url: string | null;
  authors: string;
  contentType: string;
  stage: string | null;
  date: string | null;
  access: string | null;
}

export interface TypeCounts {
  [k: string]: number;
}

export interface SearchResults {
  total: number;
  page: number;
  resultsPerPage: number;
  typeCounts: TypeCounts;
  items: SearchResultItem[];
}

export interface Author {
  name: string;
  institution?: string;
  email?: string;
}

export interface ReviewDetails {
  kind: "review";
  doi: string;
  title: string;
  authors: Author[];
  journal: string | null;
  issue: string | null;
  date: string | null;
  onlineDate: string | null;
  issn: string | null;
  language: string | null;
  keywords: string[];
  abstract: Record<string, string>;
  plainLanguageSummary: string | null;
  pico: unknown | null;
  relatedArticles: unknown | null;
  urls: { html: string; abstract: string | null; pdf: string | null };
}

export interface TrialDetails {
  kind: "trial";
  doi: string;
  title: string;
  authors: Author[];
  source: string | null;
  date: string | null;
  keywords: string[];
  abstract: string | null;
  urls: { html: string; pdf: string | null };
}

export type Details = ReviewDetails | TrialDetails;

export const SearchInput = z.object({
  query: z.string().min(1),
  type: z.enum(CONTENT_TYPES).default("review"),
  searchField: z.enum(Object.keys(SEARCH_FIELDS) as [SearchField, ...SearchField[]]).default("title-abstract-keyword"),
  orderBy: z.enum(Object.keys(ORDER_BY) as [OrderBy, ...OrderBy[]]).default("relevancy"),
  page: z.number().int().min(1).default(1),
  resultsPerPage: z.number().int().min(1).max(100).default(25),
  yearFrom: z.number().int().optional(),
  yearTo: z.number().int().optional(),
});
export const DetailsInput = z.object({ doi: z.string().min(3) });
export const SuggestInput = z.object({ query: z.string().min(1) });
