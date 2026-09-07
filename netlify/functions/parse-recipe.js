// Netlify serverless function: parse a photo/screenshot of a recipe into
// WeeklyForkast's structured recipe format using Claude's vision capability.
// Expects POST { imageBase64, mediaType } and returns { recipe }.

export default async (req) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return json({ error: "Server missing ANTHROPIC_API_KEY" }, 500);

  let body;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  const { imageBase64, mediaType = "image/jpeg" } = body;
  if (!imageBase64) return json({ error: "No image provided" }, 400);

  const instruction = `This image contains a recipe (it may be a handwritten card, a printed page, or a screenshot from a website or app). Read it and convert it into a single JSON object with EXACTLY this shape:
{
  "name": "string",
  "time": number (total minutes; estimate if not stated),
  "servings": number (estimate if not stated, default 4),
  "tags": ["dinner" or "breakfast" or "lunch", ...any other short tags],
  "ingredients": [
    { "item": "lowercase ingredient name", "qty": number, "unit": "g|oz|lb|cup|tbsp|tsp|clove|can|bunch|head|pint|", "cat": "produce|meat|dairy|bakery|pantry" }
  ],
  "steps": ["short step", ...]
}

Rules:
- Extract every ingredient with its quantity and unit. If a quantity is a fraction (e.g. 1/2), convert to a decimal (0.5).
- "unit" may be an empty string for countable items (e.g. 2 eggs, 3 lemons).
- "cat" must be one of: produce, meat, dairy, bakery, pantry. Choose the best fit.
- Keep each step concise but complete.
- If the image is NOT a readable recipe, respond with exactly: {"error":"no recipe found"}
- Respond with ONLY the raw JSON. No markdown, no code fences, no commentary.`;

  try {
    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-5",
        max_tokens: 2600,
        messages: [
          {
            role: "user",
            content: [
              { type: "image", source: { type: "base64", media_type: mediaType, data: imageBase64 } },
              { type: "text", text: instruction },
            ],
          },
        ],
      }),
    });

    if (!resp.ok) {
      const errText = await resp.text();
      return json({ error: "Anthropic API error", detail: errText }, 502);
    }

    const data = await resp.json();
    let text = (data.content || [])
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .replace(/```json|```/g, "")
      .trim();

    let recipe;
    try {
      recipe = JSON.parse(text);
    } catch {
      // last-ditch: pull the first {...} block
      const m = text.match(/\{[\s\S]*\}/);
      if (m) { try { recipe = JSON.parse(m[0]); } catch {} }
    }

    if (!recipe) return json({ error: "Could not read a recipe from that image", raw: text }, 502);
    if (recipe.error) return json({ error: recipe.error }, 422);

    recipe.id = `img_${Date.now()}`;
    return json({ recipe });
  } catch (e) {
    return json({ error: "Request failed", detail: String(e) }, 500);
  }
};

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
