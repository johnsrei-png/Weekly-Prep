// Netlify serverless function: proxies the Anthropic API so the key never reaches the browser.
// Set ANTHROPIC_API_KEY in Netlify > Site settings > Environment variables.

export default async (req) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405, headers: { "Content-Type": "application/json" },
    });
  }

  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    return new Response(JSON.stringify({ error: "Server missing ANTHROPIC_API_KEY" }), {
      status: 500, headers: { "Content-Type": "application/json" },
    });
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400, headers: { "Content-Type": "application/json" },
    });
  }

  const { count = 5, diet = "anything", servings = 4, avoid = [], cuisine = "" } = body;

  const prompt = `Generate ${count} distinct dinner recipes as a JSON array.
Constraints:
- Dietary preference: ${diet}
- Target servings per recipe: ${servings}
- Cuisine hint (optional): ${cuisine || "any"}
- Do NOT repeat any of these recipe names: ${avoid.slice(0, 30).join(", ") || "none"}

Each recipe object must have EXACTLY this shape:
{
  "name": "string",
  "time": number (minutes),
  "servings": ${servings},
  "tags": ["dinner", ...other short tags],
  "ingredients": [
    { "item": "lowercase ingredient name", "qty": number, "unit": "g|oz|lb|cup|tbsp|tsp|clove|can|bunch|head|pint|"  , "cat": "produce|meat|dairy|bakery|pantry" }
  ],
  "steps": ["short step", ...]
}

Rules:
- Quantities must be scaled for exactly ${servings} servings.
- Keep steps brief: 3-5 short steps max per recipe.
- "unit" may be an empty string for countable items (e.g. 2 lemons).
- "cat" must be one of: produce, meat, dairy, bakery, pantry.
- Respond with ONLY the raw JSON array. No markdown, no code fences, no commentary.`;

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
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!resp.ok) {
      const errText = await resp.text();
      return new Response(JSON.stringify({ error: "Anthropic API error", detail: errText }), {
        status: 502, headers: { "Content-Type": "application/json" },
      });
    }

    const data = await resp.json();
    const text = (data.content || [])
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .replace(/```json|```/g, "")
      .trim();

    let recipes;
    try {
      recipes = JSON.parse(text);
    } catch {
      return new Response(JSON.stringify({ error: "Model returned unparseable JSON", raw: text }), {
        status: 502, headers: { "Content-Type": "application/json" },
      });
    }

    // Attach stable ids
    const withIds = recipes.map((r, i) => ({ id: `ai_${Date.now()}_${i}`, ...r }));

    return new Response(JSON.stringify({ recipes: withIds }), {
      status: 200, headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: "Request failed", detail: String(e) }), {
      status: 500, headers: { "Content-Type": "application/json" },
    });
  }
};
