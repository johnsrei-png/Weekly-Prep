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
- NEVER suggest a recipe containing anything in the "MUST NEVER include" list. This is a hard safety rule (allergies) — treat it as absolute, and double-check ingredients before proposing anything.
- Steer away from disliked ingredients unless the user explicitly asks for them in this message.
- Honor the diet preference and any other notes.
- When the user wants a recipe, prefer ideas that use their pantry items.
- You can ask a clarifying question if the request is vague, instead of guessing.

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
        max_tokens: 2600,
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

    // Extract a ```recipes ... ``` block if present.
    let recipes = [];
    let reply = fullText;
    const match = fullText.match(/```recipes\s*([\s\S]*?)```/);
    if (match) {
      try {
        const parsed = JSON.parse(match[1].trim());
        recipes = (Array.isArray(parsed) ? parsed : [parsed]).map((r, i) => ({
          id: `chat_${Date.now()}_${i}`,
          ...r,
        }));
      } catch {
        // If the JSON is malformed, just leave recipes empty; keep the chat text.
      }
      // Remove the code block from the visible reply.
      reply = fullText.replace(/```recipes[\s\S]*?```/, "").trim();
    }

    return json({ reply, recipes });
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
