// Netlify serverless function: conversational recipe chat.
// Takes the message history + the user's pantry/plan context, returns a chat
// reply and optionally one or more structured recipes the UI can add to the plan.
// Set ANTHROPIC_API_KEY in Netlify > Site settings > Environment variables.

export default async (req) => {
  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return json({ error: "Server missing ANTHROPIC_API_KEY" }, 500);

  let body;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  const { messages = [], pantry = [], plan = [], servings = 4, prefs = {} } = body;

  const pantryText = pantry.length
    ? pantry.map((p) => `${p.qty}${p.unit ? " " + p.unit : ""} ${p.item}`).join(", ")
    : "(empty)";
  const planText = plan.length
    ? plan.map((p) => `${p.day}: ${p.name}`).join("; ")
    : "(nothing planned yet)";

  const dietLabel = prefs.diet && prefs.diet !== "anything" ? prefs.diet : "no specific diet";
  const prefLines = [
    `- Diet: ${dietLabel}`,
    prefs.avoid ? `- MUST NEVER include (allergies / hard avoids): ${prefs.avoid}` : "",
    prefs.dislikes ? `- Try to avoid (dislikes): ${prefs.dislikes}` : "",
    prefs.notes ? `- Other notes: ${prefs.notes}` : "",
  ].filter(Boolean).join("\n");

  const system = `You are a friendly cooking assistant inside a meal-planning app called WeeklyForkast. You help the user plan dinners, use up what they have, and answer cooking questions.

The user's current pantry: ${pantryText}
The user's current week plan: ${planText}
Default serving size: ${servings}

The user's food preferences (follow these on EVERY suggestion):
${prefLines}

Guidelines:
- Be warm and concise. Talk like a helpful friend who cooks, not a formal chatbot.
- You can suggest breakfasts or dinners. If the user asks for breakfast, include "breakfast" in that recipe's tags; for dinner include "dinner". If unclear, default to dinner.
- NEVER suggest a recipe containing anything in the "MUST NEVER include" list. This is a hard safety rule (allergies) — treat it as absolute, and double-check ingredients before proposing anything.
- Steer away from disliked ingredients unless the user explicitly asks for them in this message.
- Honor the diet preference and any other notes.
- When the user wants a recipe, prefer ideas that use their pantry items.
- You can ask a clarifying question if the request is vague, instead of guessing.
- Keep it to at most 3 recipes in a single reply. If the user asks for a full week, suggest a few, then offer to continue — this keeps responses fast and complete.

IMPORTANT OUTPUT FORMAT:
Whenever you are proposing one or more specific recipes the user could cook, include a fenced code block tagged \`recipes\` containing a JSON array. Put this AFTER your conversational reply. Each recipe object must have EXACTLY this shape:
{
  "name": "string",
  "time": number (minutes),
  "servings": ${servings},
  "tags": ["dinner", ...short tags],
  "ingredients": [
    { "item": "lowercase name", "qty": number, "unit": "g|oz|lb|cup|tbsp|tsp|clove|can|bunch|head|pint|", "cat": "produce|meat|dairy|bakery|pantry" }
  ],
  "steps": ["short step", ...]
}
Rules for the JSON:
- Scale quantities for ${servings} servings.
- unit may be "" for countable items (e.g. 2 lemons).
- cat must be one of: produce, meat, dairy, bakery, pantry.
- Keep steps to 3-6 short steps.
- If you are NOT proposing a specific recipe (just chatting, asking a question, or answering something general), do NOT include a recipes block at all.

Example of a reply that proposes a recipe:
Sure! Since you've got chicken and lemon on hand, here's a quick one:

\`\`\`recipes
[{"name":"Lemon Garlic Chicken","time":30,"servings":${servings},"tags":["dinner","quick"],"ingredients":[{"item":"chicken breast","qty":1.5,"unit":"lb","cat":"meat"},{"item":"lemon","qty":2,"unit":"","cat":"produce"},{"item":"garlic","qty":4,"unit":"clove","cat":"produce"}],"steps":["Season chicken.","Sear 6 min per side.","Add lemon and garlic, finish in pan."]}]
\`\`\``;

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
        max_tokens: 3200,
        system,
        messages,
      }),
    });

    if (!resp.ok) {
      const errText = await resp.text();
      return json({ error: "Anthropic API error", detail: errText }, 502);
    }

    const data = await resp.json();
    const fullText = (data.content || [])
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("\n");

    const { reply, recipes } = extractRecipes(fullText);

    return json({ reply, recipes });
  } catch (e) {
    return json({ error: "Request failed", detail: String(e) }, 500);
  }
};

// Pull a recipe JSON array out of the model's reply using several strategies,
// and return the human-readable text with the JSON removed.
function extractRecipes(fullText) {
  const stamp = (arr) =>
    (Array.isArray(arr) ? arr : [arr]).map((r, i) => ({ id: `chat_${Date.now()}_${i}`, ...r }));

  const tryParse = (str) => {
    try { return JSON.parse(str.trim()); } catch { return null; }
  };

  // 1) ```recipes ... ``` (preferred), tolerant of casing/whitespace after the tag.
  let m = fullText.match(/```[ \t]*recipes[ \t]*\r?\n?([\s\S]*?)```/i);
  if (m) {
    const parsed = tryParse(m[1]);
    if (parsed) return { reply: stripBlock(fullText, m[0]), recipes: stamp(parsed) };
  }

  // 2) Any fenced block (```json ... ``` or plain ```) that parses as a JSON array.
  const fences = [...fullText.matchAll(/```[a-z]*\r?\n?([\s\S]*?)```/gi)];
  for (const f of fences) {
    const parsed = tryParse(f[1]);
    if (parsed && (Array.isArray(parsed) || parsed.name)) {
      return { reply: stripBlock(fullText, f[0]), recipes: stamp(parsed) };
    }
  }

  // 3) A bare JSON array sitting in the text (no fence, or truncated fence).
  const start = fullText.indexOf("[{");
  if (start !== -1) {
    // find the matching closing bracket for a best-effort slice
    const end = fullText.lastIndexOf("}]");
    if (end > start) {
      const slice = fullText.slice(start, end + 2);
      const parsed = tryParse(slice);
      if (parsed) {
        const reply = (fullText.slice(0, start) + fullText.slice(end + 2))
          .replace(/```[a-z]*\s*$/i, "").replace(/```\s*$/i, "").trim();
        return { reply: reply || "Here you go:", recipes: stamp(parsed) };
      }
    }
  }

  // Nothing parseable — return the text as-is with no recipes.
  return { reply: fullText.trim(), recipes: [] };
}

function stripBlock(text, block) {
  return text.replace(block, "").replace(/```[a-z]*\s*$/i, "").trim();
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
