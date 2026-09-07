// Netlify serverless function: parse a photo of a grocery receipt into a list
// of pantry items using Claude vision. Returns { items: [{item, qty, unit}] }.

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

  const instruction = `This image is a grocery store receipt. Extract the FOOD and KITCHEN items purchased and return them as a JSON array. Each item:
{ "item": "plain lowercase item name", "qty": number, "unit": "oz|lb|g|kg|cup|can|bunch|head|pint|bag|" }

Rules:
- Translate cryptic register abbreviations into normal names when you can reasonably tell (e.g. "CHKN BRST" -> "chicken breast", "GV MILK 2%" -> "milk", "BNLS THIGH" -> "chicken thighs"). If an abbreviation is truly unclear, use your best plain-English guess.
- Use the quantity printed on the receipt if shown (e.g. "2 @ ..."), otherwise default qty to 1.
- Choose a sensible unit. If the receipt shows a weight (e.g. "1.24 lb"), use it with unit "lb". If it's a countable packaged item, unit may be "" (empty).
- EXCLUDE non-food/non-kitchen lines: taxes, totals, subtotals, change, payment/card lines, store name, phone numbers, loyalty/points, coupons/discounts, bags fees. Also exclude clearly non-grocery items (e.g. batteries, magazines) unless they're food or cooking staples.
- Deduplicate obvious repeats.
- If you cannot find any food items, respond with exactly: {"error":"no items found"}
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

    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      const m = text.match(/\[[\s\S]*\]/);
      if (m) { try { parsed = JSON.parse(m[0]); } catch {} }
    }

    if (!parsed) return json({ error: "Could not read items from that receipt", raw: text }, 502);
    if (parsed.error) return json({ error: parsed.error }, 422);
    if (!Array.isArray(parsed)) parsed = [parsed];

    // normalize
    const items = parsed
      .filter((x) => x && x.item)
      .map((x) => ({
        item: String(x.item).trim(),
        qty: typeof x.qty === "number" && x.qty > 0 ? x.qty : 1,
        unit: (x.unit || "").trim(),
      }));

    return json({ items });
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
