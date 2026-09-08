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

  const instruction = `This image is a grocery store receipt (often Hy-Vee or similar US chains). Extract the FOOD and KITCHEN items purchased and return them as a JSON array. Each item:
{ "item": "plain lowercase item name", "qty": number, "unit": "oz|lb|g|kg|cup|can|bunch|head|pint|bag|" }

IMPORTANT — how these receipts are laid out:
- Each purchased item is the line that has an item description AND a price (often with a long item/UPC number in the middle, and a trailing "F" or "T" tax flag).
- Between item lines there are NOISE lines you must IGNORE completely: "Fuel Saver", "Spend $40", lines that are just a number and a discount, "Manual Weight", "X.XXX LB @ price USD/LB", subtotal, tax, total, card/payment info, store info.
- For produce sold by weight, the item name line is followed by a "Manual Weight / X.XX LB @ $ USD/LB" block — use the item name from the first line; if a weight in LB is shown, use qty = that weight with unit "lb".
- For items sold by count (e.g. "LEMONS 4053 1.98" then "2 @ 0.99"), use qty = the count (2) with unit "".

Decode abbreviations to normal food names using context. Examples of the style you'll see:
- "HYV ..." = Hy-Vee store brand — drop the HYV prefix and read the rest (e.g. "HYV BNLS SKNLS CK" = chicken breast; "HYV CHOPPED BROCC" / "HYV BROCCOLI CUTS" = broccoli; "HYV GRADE A LRG E" = eggs; "HYV 100% EGG WHIT" = egg whites; "HYV RSTD GARLIC H" = roasted garlic hummus; "HYV BLACK BEANS" = black beans; "HYV PAPER TOWELS" = paper towels)
- "JENNIE-O 93%LN 7%" = ground turkey; "NBTT ORGANIC WHIT" = white bread; "MAHATMA BRWN WG R" = brown rice; "ATHENOS CRMBLD" = feta cheese; "SUNSET MINI CCMBR" = mini cucumbers; "SUNBTR CRMY SPREA" = sunflower butter; "ORG PERO BANDED R" = organic peppers; "WISH FARMS STRAWB" = strawberries; "ANGEL SOFT" = toilet paper
- Dropped vowels/truncations are common: expand them to the obvious word.
- "MEAT-KEY ENTERED", "PRODUCE-KEY ENTERED", or similar "-KEY ENTERED" lines are manually keyed items with NO real product name — SKIP them entirely; do NOT output a vague item like "meat".
- If truly unclear, make your best plain-English guess. But never output a bare generic category word ("meat", "produce", "grocery", "deli") with no specific product — skip those lines instead of guessing a category.

Rules:
- EXCLUDE all noise lines listed above and any non-grocery lines.
- Deduplicate obvious repeats only if they are clearly the same line duplicated; otherwise keep separate quantities.
- Choose a sensible unit; produce by weight -> "lb"; countable -> "".
- If you cannot find ANY food items, respond with exactly: {"error":"no items found"}
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
        max_tokens: 4000,
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

    // Salvage: if parsing failed (e.g. truncated), pull individual {…} objects out.
    if (!parsed) {
      const objs = text.match(/\{[^{}]*\}/g);
      if (objs) {
        const recovered = [];
        for (const o of objs) { try { recovered.push(JSON.parse(o)); } catch {} }
        if (recovered.length) parsed = recovered;
      }
    }

    if (!parsed) return json({ error: "Could not read items from that receipt", raw: text.slice(0, 200) }, 502);
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
