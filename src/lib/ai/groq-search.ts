import "server-only";

import { z } from "zod";

export const searchIntentSchema = z.object({
  dishQuery: z.string().min(1),
  cuisine: z.string().nullable(),
  dietary: z.enum(["veg", "non_veg", "egg", "any"]).nullable(),
  restaurantHint: z.string().nullable(),
  maxFinalPrice: z.number().positive().nullable(),
  preferences: z.array(z.string()),
  clarifiedQuery: z.string().min(1)
});

export type SearchIntent = z.infer<typeof searchIntentSchema>;

const fallbackIntent = (raw: string): SearchIntent => ({
  dishQuery: raw.trim(),
  cuisine: null,
  dietary: null,
  restaurantHint: null,
  maxFinalPrice: null,
  preferences: [],
  clarifiedQuery: raw.trim()
});

function extractJson(text: string) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced?.[1]?.trim() || text.trim();
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end === -1) {
    throw new Error("Groq did not return JSON");
  }
  return JSON.parse(candidate.slice(start, end + 1));
}

export async function parseNaturalLanguageSearch(rawQuery: string): Promise<SearchIntent> {
  const trimmed = rawQuery.trim();
  if (!trimmed) {
    throw new Error("Enter a natural language food search.");
  }

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    throw new Error("GROQ_API_KEY is required for natural-language search.");
  }

  const model = process.env.GROQ_MODEL || "openai/gpt-oss-20b";

  let response: Response | null = null;
  let lastBody = "";

  for (let attempt = 0; attempt < 3; attempt += 1) {
    response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model,
        temperature: 0.1,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              "Convert Indian food-delivery requests to JSON keys: dishQuery, cuisine, dietary (veg|non_veg|egg|any|null), restaurantHint, maxFinalPrice, preferences, clarifiedQuery. dishQuery is a short menu search string."
          },
          {
            role: "user",
            content: trimmed
          }
        ]
      }),
      cache: "no-store"
    });

    if (response.ok) {
      break;
    }

    lastBody = await response.text();
    if (response.status === 429 && attempt < 2) {
      const match = lastBody.match(/try again in ([0-9.]+)s/i);
      const waitMs = match ? Math.min(30_000, Math.ceil(Number(match[1]) * 1000) + 500) : 12_000;
      await new Promise((resolve) => setTimeout(resolve, waitMs));
      continue;
    }

    throw new Error(`Groq search parsing failed (${response.status}): ${lastBody.slice(0, 200)}`);
  }

  if (!response?.ok) {
    throw new Error(`Groq search parsing failed: ${lastBody.slice(0, 200)}`);
  }

  const payload = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = payload.choices?.[0]?.message?.content;
  if (!content) {
    return fallbackIntent(trimmed);
  }

  try {
    const parsed = searchIntentSchema.parse(extractJson(content));
    return {
      ...parsed,
      dishQuery: parsed.dishQuery.trim() || trimmed,
      clarifiedQuery: parsed.clarifiedQuery.trim() || trimmed,
      preferences: parsed.preferences.filter(Boolean)
    };
  } catch {
    return fallbackIntent(trimmed);
  }
}
