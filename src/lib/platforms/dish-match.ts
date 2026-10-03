import "server-only";

const STOP_WORDS = new Set([
  "and",
  "the",
  "with",
  "for",
  "from",
  "meal",
  "box",
  "plate",
  "combo",
  "special",
  "piece",
  "pieces",
  "pcs",
  "pc",
  "serve",
  "serves",
  "half",
  "full",
  "kg",
  "gms",
  "gram",
  "grams",
  "ml",
  "pack",
  "large",
  "small",
  "medium",
  "regular",
  "single",
  "portion",
  "only"
]);

export function tokenizeDishQuery(query: string) {
  return query
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 2 && !STOP_WORDS.has(token));
}

/** Higher is better. 0 means no meaningful dish overlap. */
export function scoreDishName(name: string, query: string) {
  const haystack = name.toLowerCase();
  const normalizedQuery = query.toLowerCase().trim();
  const tokens = tokenizeDishQuery(query);

  if (!haystack || !normalizedQuery) {
    return 0;
  }

  let score = 0;

  if (haystack === normalizedQuery) {
    score += 100;
  } else if (haystack.includes(normalizedQuery)) {
    score += 60;
  }

  if (tokens.length === 0) {
    return score;
  }

  let matched = 0;
  for (const token of tokens) {
    if (haystack.includes(token)) {
      matched += 1;
      score += 12;
    }
  }

  if (matched === tokens.length) {
    score += 25;
  }

  // Prefer names that start with the same lead token (e.g. "chole ...").
  if (tokens[0] && haystack.startsWith(tokens[0])) {
    score += 8;
  }

  // Consecutive multi-token phrase bonus.
  if (tokens.length >= 2) {
    for (let size = tokens.length; size >= 2; size -= 1) {
      for (let start = 0; start <= tokens.length - size; start += 1) {
        const phrase = tokens.slice(start, start + size).join(" ");
        if (haystack.includes(phrase)) {
          score += size * 10;
          break;
        }
      }
    }
  }

  // Zero content-token overlap → not a real match.
  if (matched === 0) {
    return 0;
  }

  return score;
}

export function isRelevantDishMatch(score: number, query: string) {
  const tokens = tokenizeDishQuery(query);
  if (tokens.length === 0) {
    return score > 0;
  }
  // At least one content token must match; require stronger score for multi-token queries.
  const minimum = tokens.length === 1 ? 12 : 20;
  return score >= minimum;
}

export function pickBestDishMatch<T>(
  entries: T[],
  query: string,
  getName: (entry: T) => string,
  options?: {
    getPrice?: (entry: T) => number;
    isEligible?: (entry: T) => boolean;
    dietaryBoost?: (entry: T) => number;
  }
) {
  const ranked = entries
    .map((entry) => {
      const name = getName(entry);
      let score = scoreDishName(name, query);
      if (options?.dietaryBoost) {
        score += options.dietaryBoost(entry);
      }
      const price = options?.getPrice?.(entry) ?? Number.POSITIVE_INFINITY;
      const eligible = options?.isEligible ? options.isEligible(entry) : true;
      return { entry, name, score, price, eligible };
    })
    .filter((row) => row.eligible && isRelevantDishMatch(row.score, query))
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }
      return left.price - right.price;
    });

  return ranked[0] ?? null;
}
