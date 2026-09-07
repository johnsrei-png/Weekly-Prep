// Netlify serverless function: estimate typical US grocery prices for a list
// of items. Returns { prices: { "item name": estimatedUsd, ... } }.
// These are rough ballpark estimates from the model, not real store prices.

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

  const { items = [] } = body;
  if (!items.length) return json({ prices: {} });

  // items: [{ item, qty, unit }]
  const listText = items
    .map((it) => `- ${it.item}${it.qty ? ` (${it.qty}${it.unit ? " " + it.unit : ""})` : ""}`)
    .join("\n");

  const instruction = `Estimate the typical US grocery store cost (in USD) to buy each of the following items in the quantity shown. Return a JSON object mapping the EXACT item name (as given) to a single number = estimated dollars for that quantity.

Items:
${listText}

Rules:
- Base estimates on average mid-range US supermarket prices.
- Account for the quantity given (e.g. 2 lb chicken breast costs more than 0.5 lb).
- Use a single number per item (dollars, up to 2 decimals). No ranges, no currency symbols, no text.
- Use the EXACT item name string as the key.
- Respond with ONLY the raw JSON object. No markdown, no code fences, no commentary.`;

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
        max_tokens: 4000,
        messages: [{ role: "user", content: instruction }],
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

    let prices;
    try {
      prices = JSON.parse(text);
    } catch {
      const m = text.match(/\{[\s\S]*\}/);
      if (m) { try { prices = JSON.parse(m[0]); } catch {} }
    }

    // Salvage: if parsing failed or came back thin (e.g. truncated response),
    // pull every "key": number pair directly from the text.
    if (!prices || typeof prices !== "object" || !Object.keys(prices).length) {
      const salvaged = {};
      const re = /"([^"]+)"\s*:\s*(-?\d+(?:\.\d+)?)/g;
      let match;
      while ((match = re.exec(text)) !== null) {
        salvaged[match[1]] = parseFloat(match[2]);
      }
      if (Object.keys(salvaged).length) prices = salvaged;
    }

    if (!prices || typeof prices !== "object" || !Object.keys(prices).length) {
      return json({ error: "Could not estimate prices", raw: text.slice(0, 200) }, 502);
    }

    // sanitize: keep only numeric values
    const clean = {};
    for (const [k, v] of Object.entries(prices)) {
      const n = typeof v === "number" ? v : parseFloat(v);
      if (!isNaN(n) && n >= 0) clean[k] = Math.round(n * 100) / 100;
    }

    return json({ prices: clean });
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
