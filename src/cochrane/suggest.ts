export function parseSuggestions(body: string): string[] {
  try {
    const v = JSON.parse(body.trim());
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}
