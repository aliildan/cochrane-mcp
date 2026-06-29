function safeJson(body: string): unknown {
  try {
    return JSON.parse(body.trim());
  } catch {
    return null;
  }
}

export function parsePico(body: string): unknown {
  return safeJson(body);
}

export function parseRelated(body: string): unknown {
  return safeJson(body);
}
