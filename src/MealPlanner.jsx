import React, { useState, useEffect, useMemo } from "react";
import { Calendar, ShoppingCart, Package, Plus, X, Check, Download, RefreshCw, Trash2, Utensils, Sparkles, Minus, AlertTriangle, BookOpen, Send, MessageCircle, CalendarPlus, GripVertical, SlidersHorizontal, ChevronDown, Home, Archive } from "lucide-react";
import { supabase, getHousehold, setHousehold, clearHousehold, normalizeCode, suggestCode } from "./supabase.js";

// ---- Seed recipe bank (used offline / as fallback) ------------------------
const SEED_RECIPES = [
  { id: "r1", name: "Sheet-Pan Lemon Chicken", tags: ["dinner", "quick"], time: 40, servings: 4,
    ingredients: [
      { item: "chicken thighs", qty: 2, unit: "lb", cat: "meat" },
      { item: "lemon", qty: 2, unit: "", cat: "produce" },
      { item: "baby potatoes", qty: 1.5, unit: "lb", cat: "produce" },
      { item: "green beans", qty: 1, unit: "lb", cat: "produce" },
      { item: "olive oil", qty: 3, unit: "tbsp", cat: "pantry" },
      { item: "garlic", qty: 4, unit: "clove", cat: "produce" },
    ], steps: ["Toss everything with oil, garlic, lemon.", "Roast at 425°F for 35 min."] },
  { id: "r2", name: "Black Bean Tacos", tags: ["dinner", "vegetarian", "quick"], time: 25, servings: 4,
    ingredients: [
      { item: "black beans", qty: 2, unit: "can", cat: "pantry" },
      { item: "corn tortillas", qty: 12, unit: "", cat: "bakery" },
      { item: "avocado", qty: 2, unit: "", cat: "produce" },
      { item: "red onion", qty: 1, unit: "", cat: "produce" },
      { item: "cilantro", qty: 1, unit: "bunch", cat: "produce" },
      { item: "lime", qty: 2, unit: "", cat: "produce" },
      { item: "cheddar cheese", qty: 1, unit: "cup", cat: "dairy" },
    ], steps: ["Warm beans with spices.", "Fill tortillas, top with everything."] },
  { id: "r3", name: "Teriyaki Salmon Bowl", tags: ["dinner", "healthy"], time: 35, servings: 4,
    ingredients: [
      { item: "salmon fillet", qty: 1.5, unit: "lb", cat: "meat" },
      { item: "jasmine rice", qty: 2, unit: "cup", cat: "pantry" },
      { item: "broccoli", qty: 1, unit: "head", cat: "produce" },
      { item: "soy sauce", qty: 0.25, unit: "cup", cat: "pantry" },
      { item: "honey", qty: 3, unit: "tbsp", cat: "pantry" },
    ], steps: ["Glaze salmon, bake 15 min.", "Serve over rice with broccoli."] },
  { id: "r4", name: "Veggie Stir-Fry", tags: ["dinner", "vegetarian", "quick"], time: 20, servings: 4,
    ingredients: [
      { item: "tofu", qty: 14, unit: "oz", cat: "produce" },
      { item: "bell pepper", qty: 2, unit: "", cat: "produce" },
      { item: "snap peas", qty: 2, unit: "cup", cat: "produce" },
      { item: "carrots", qty: 3, unit: "", cat: "produce" },
      { item: "soy sauce", qty: 3, unit: "tbsp", cat: "pantry" },
      { item: "jasmine rice", qty: 2, unit: "cup", cat: "pantry" },
    ], steps: ["Sear tofu, add veg.", "Sauce and serve over rice."] },
  { id: "r5", name: "Greek Chicken Bowls", tags: ["dinner", "healthy"], time: 35, servings: 4,
    ingredients: [
      { item: "chicken breast", qty: 1.5, unit: "lb", cat: "meat" },
      { item: "cucumber", qty: 1, unit: "", cat: "produce" },
      { item: "cherry tomatoes", qty: 1, unit: "pint", cat: "produce" },
      { item: "feta cheese", qty: 1, unit: "cup", cat: "dairy" },
      { item: "quinoa", qty: 1.5, unit: "cup", cat: "pantry" },
      { item: "olive oil", qty: 3, unit: "tbsp", cat: "pantry" },
    ], steps: ["Grill chicken.", "Build bowls over quinoa."] },
];

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const MEALS = [{ id: "breakfast", label: "Breakfast" }, { id: "lunch", label: "Lunch" }, { id: "dinner", label: "Dinner" }];
const CAT_ORDER = ["produce", "meat", "dairy", "bakery", "pantry", "snacks"];
const CAT_LABEL = { produce: "Produce", meat: "Meat & Seafood", dairy: "Dairy & Eggs", bakery: "Bakery", pantry: "Pantry & Dry Goods", snacks: "Snacks" };
const DIETS = [
  { id: "anything", label: "Anything" },
  { id: "vegetarian", label: "Vegetarian" },
  { id: "quick", label: "Quick (≤30m)" },
  { id: "healthy", label: "Healthy" },
];

// unit conversion to a common base for pantry math (weight->oz, volume->tbsp)
const WEIGHT = { oz: 1, lb: 16, g: 0.035274, kg: 35.274 };
const VOLUME = { tsp: 1 / 3, tbsp: 1, cup: 16, "fl oz": 2, ml: 0.0676, l: 67.6 };
function toBase(qty, unit) {
  const u = (unit || "").toLowerCase();
  if (WEIGHT[u]) return { val: qty * WEIGHT[u], base: "weight" };
  if (VOLUME[u]) return { val: qty * VOLUME[u], base: "volume" };
  return { val: qty, base: "count" };
}
function norm(s) { return (s || "").trim().toLowerCase(); }
// Split a freeform snack ("apple + peanut butter", "carrots and hummus") into items.
function splitSnack(text) {
  return (text || "")
    .split(/\s*(?:\+|,|\band\b|\bwith\b|&)\s*/i)
    .map((s) => s.trim())
    .filter(Boolean);
}
function fmtQty(q) {
  const n = Math.round(q * 100) / 100;
  return Number.isInteger(n) ? n : n.toFixed(2).replace(/\.?0+$/, "");
}

export default function MealPlanner() {
  const [tab, setTab] = useState("plan");
  const [recipes, setRecipes] = useState(SEED_RECIPES);
  const [plan, setPlan] = useState({});           // { Monday: {recipeId, servings} }
  const [inventory, setInventory] = useState([]); // [{item, qty, unit, lowAt}]
  const [checked, setChecked] = useState({});
  const [diet, setDiet] = useState("anything");
  const [defaultServings, setDefaultServings] = useState(4);
  const [loaded, setLoaded] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState("");
  const [newInv, setNewInv] = useState({ item: "", qty: "", unit: "oz", lowAt: "" });
  const [viewRecipe, setViewRecipe] = useState(null);
  const [chatLog, setChatLog] = useState([]);   // [{role, content, recipes?}]
  const [chatInput, setChatInput] = useState("");
  const [chatBusy, setChatBusy] = useState(false);
  const [addingFor, setAddingFor] = useState(null); // recipe id pending slot-pick
  const [addMeal, setAddMeal] = useState("dinner");  // chosen meal type in the add flow
  const [dragDay, setDragDay] = useState(null);     // day currently being dragged
  const [dragOver, setDragOver] = useState(null);   // day being hovered over
  const [prefs, setPrefs] = useState({ diet: "anything", avoid: "", dislikes: "", notes: "" });
  const [prefsDraft, setPrefsDraft] = useState({ diet: "anything", avoid: "", dislikes: "", notes: "" });
  const [archives, setArchives] = useState([]);   // [{id, label, savedAt, plan, grocery}]
  const [showArchives, setShowArchives] = useState(false);
  const [snackInputs, setSnackInputs] = useState({});  // { day: "text being typed" }
  const [prefsSaved, setPrefsSaved] = useState(false);
  const [prefsOpen, setPrefsOpen] = useState(false);
  const [household, setHouseholdState] = useState(() => (supabase ? getHousehold() : "local"));
  const [codeInput, setCodeInput] = useState("");
  const [showHousehold, setShowHousehold] = useState(false);

  // ---- Load state (Supabase keyed by household code, else localStorage) ----
  function migratePlan(oldPlan) {
    // Old shape: { Monday: {recipeId, servings} }. New: { Monday: { dinner: {...} } }.
    const next = {};
    Object.entries(oldPlan || {}).forEach(([day, val]) => {
      if (!val) return;
      if (val.recipeId) next[day] = { dinner: val };   // migrate old entry into Dinner
      else next[day] = val;                             // already new shape
    });
    return next;
  }

  function applyState(s) {
    setRecipes(s.recipes || SEED_RECIPES);
    setPlan(migratePlan(s.plan));
    setInventory(s.inventory || []);
    setChecked(s.checked || {});
    if (s.defaultServings) setDefaultServings(s.defaultServings);
    setPrefs((p) => ({ ...p, ...(s.prefs || {}) }));
    if (s.prefs) setPrefsDraft((p) => ({ ...p, ...s.prefs }));
    setArchives(s.archives || []);
  }

  useEffect(() => {
    (async () => {
      setLoaded(false);
      if (supabase) {
        if (!household) { setLoaded(true); return; } // wait for a code
        const { data } = await supabase.from("meal_planner").select("*").eq("device_id", household).maybeSingle();
        if (data?.state) applyState(data.state);
      } else {
        const raw = localStorage.getItem("wt_state");
        if (raw) applyState(JSON.parse(raw));
      }
      setLoaded(true);
    })();
  }, [household]);

  // ---- Persist on any change ----------------------------------------------
  useEffect(() => {
    if (!loaded) return;
    const state = { recipes, plan, inventory, checked, defaultServings, prefs, archives };
    if (supabase) {
      if (!household) return;
      supabase.from("meal_planner").upsert({ device_id: household, state, updated_at: new Date().toISOString() }).then(() => {});
    } else {
      localStorage.setItem("wt_state", JSON.stringify(state));
    }
  }, [recipes, plan, inventory, checked, defaultServings, prefs, archives, loaded, household]);

  const filteredRecipes = useMemo(() => {
    if (diet === "anything") return recipes;
    return recipes.filter((r) => r.tags?.includes(diet));
  }, [recipes, diet]);

  // ---- AI recipe generation -----------------------------------------------
  async function generateRecipes(n = 7) {
    setGenerating(true);
    setGenError("");
    try {
      const resp = await fetch("/.netlify/functions/generate-recipe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          count: n, diet, servings: defaultServings,
          avoid: recipes.map((r) => r.name),
        }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || "Generation failed");
      const fresh = data.recipes || [];
      setRecipes((prev) => [...fresh, ...prev]);
      // auto-fill the week with the new recipes
      const next = {};
      DAYS.forEach((d, i) => {
        const r = fresh[i % fresh.length];
        if (r) next[d] = { recipeId: r.id, servings: r.servings || defaultServings };
      });
      setPlan(next);
      setChecked({});
    } catch (e) {
      setGenError(String(e.message || e));
    } finally {
      setGenerating(false);
    }
  }

  function generateFromExisting() {
    const pool = [...filteredRecipes].sort(() => Math.random() - 0.5);
    const next = {};
    DAYS.forEach((d, i) => {
      const r = pool[i % pool.length];
      if (r) next[d] = { recipeId: r.id, servings: defaultServings };
    });
    setPlan(next);
    setChecked({});
  }

  // ---- Chat --------------------------------------------------------------
  async function sendChat(text) {
    const msg = (text ?? chatInput).trim();
    if (!msg || chatBusy) return;
    setChatInput("");
    const nextLog = [...chatLog, { role: "user", content: msg }];
    setChatLog(nextLog);
    setChatBusy(true);
    try {
      const planContext = [];
      DAYS.forEach((d) => {
        const dp = plan[d];
        if (!dp) return;
        MEALS.forEach((m) => {
          const entry = dp[m.id];
          if (!entry) return;
          const r = recipes.find((x) => x.id === entry.recipeId);
          if (r) planContext.push({ day: d, meal: m.label, name: r.name });
        });
      });
      const resp = await fetch("/.netlify/functions/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: nextLog.map((m) => ({ role: m.role, content: m.content })),
          pantry: inventory,
          plan: planContext,
          servings: defaultServings,
          prefs,
        }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || "Chat failed");
      const fresh = data.recipes || [];
      if (fresh.length) setRecipes((prev) => [...fresh, ...prev]);
      setChatLog([...nextLog, { role: "assistant", content: data.reply || "…", recipes: fresh }]);
    } catch (e) {
      setChatLog([...nextLog, { role: "assistant", content: `Sorry — something went wrong: ${e.message}. Check that the chat function and API key are set up.`, recipes: [] }]);
    } finally {
      setChatBusy(false);
    }
  }

  function addRecipeToSlot(recipe, day, meal) {
    // ensure recipe is saved
    setRecipes((prev) => (prev.find((r) => r.id === recipe.id) ? prev : [recipe, ...prev]));
    setPlan((prev) => ({
      ...prev,
      [day]: { ...(prev[day] || {}), [meal]: { recipeId: recipe.id, servings: recipe.servings || defaultServings } },
    }));
    setAddingFor(null);
  }

  // Move (swap) a meal between two slots, each identified as "day|meal".
  function moveSlot(fromKey, toKey) {
    if (fromKey === toKey) return;
    const [fromDay, fromMeal] = fromKey.split("|");
    const [toDay, toMeal] = toKey.split("|");
    setPlan((prev) => {
      const next = { ...prev };
      const fromDP = { ...(prev[fromDay] || {}) };
      const toDP = fromDay === toDay ? fromDP : { ...(prev[toDay] || {}) };
      const a = fromDP[fromMeal];
      const b = toDP[toMeal];
      if (b) fromDP[fromMeal] = b; else delete fromDP[fromMeal];
      if (a) toDP[toMeal] = a; else delete toDP[toMeal];
      // write back, dropping empty day objects
      if (Object.keys(fromDP).length) next[fromDay] = fromDP; else delete next[fromDay];
      if (Object.keys(toDP).length) next[toDay] = toDP; else delete next[toDay];
      return next;
    });
    setChecked({});
  }

  // ---- Snacks (per day, freeform, optional buy toggle) -------------------
  function addSnack(day, text) {
    const t = (text || "").trim();
    if (!t) return;
    setPlan((prev) => {
      const dp = { ...(prev[day] || {}) };
      const snacks = [...(dp.snacks || []), { text: t, buy: true }];
      return { ...prev, [day]: { ...dp, snacks } };
    });
  }
  function toggleSnackBuy(day, idx) {
    setPlan((prev) => {
      const dp = { ...(prev[day] || {}) };
      const snacks = (dp.snacks || []).map((s, i) => (i === idx ? { ...s, buy: !s.buy } : s));
      return { ...prev, [day]: { ...dp, snacks } };
    });
  }
  function removeSnack(day, idx) {
    setPlan((prev) => {
      const dp = { ...(prev[day] || {}) };
      const snacks = (dp.snacks || []).filter((_, i) => i !== idx);
      if (snacks.length) dp.snacks = snacks; else delete dp.snacks;
      if (Object.keys(dp).length) return { ...prev, [day]: dp };
      const next = { ...prev }; delete next[day]; return next;
    });
  }

  function clearSlot(day, meal) {
    setPlan((prev) => {
      const next = { ...prev };
      const dp = { ...(prev[day] || {}) };
      delete dp[meal];
      if (Object.keys(dp).length) next[day] = dp; else delete next[day];
      return next;
    });
    setChecked({});
  }

  // ---- Household ----------------------------------------------------------
  function joinHousehold(code) {
    const clean = setHousehold(code);
    if (!clean) return;
    setHouseholdState(clean);   // triggers the load effect for this code
    setCodeInput("");
    setShowHousehold(false);
  }
  function leaveHousehold() {
    clearHousehold();
    setHouseholdState("");
    // reset to a clean slate locally so the next household starts fresh in the UI
    setRecipes(SEED_RECIPES); setPlan({}); setInventory([]); setChecked({});
    setPrefs({ diet: "anything", avoid: "", dislikes: "", notes: "" });
    setPrefsDraft({ diet: "anything", avoid: "", dislikes: "", notes: "" });
    setShowHousehold(false);
  }

  function savePrefs() {
    setPrefs({ ...prefsDraft });   // this write triggers the sync effect
    setPrefsSaved(true);
    setTimeout(() => setPrefsSaved(false), 2500);
  }

  function setSlotServings(day, meal, servings) {
    const dp = plan[day];
    if (!dp || !dp[meal]) return;
    setPlan({ ...plan, [day]: { ...dp, [meal]: { ...dp[meal], servings: Math.max(1, servings) } } });
  }

  // ---- Aggregate ingredients (scaled by per-day servings) -----------------
  const aggregated = useMemo(() => {
    const map = {};
    DAYS.forEach((day) => {
      const dayPlan = plan[day];
      if (!dayPlan) return;
      MEALS.forEach((m) => {
        const entry = dayPlan[m.id];
        if (!entry) return;
        const r = recipes.find((x) => x.id === entry.recipeId);
        if (!r) return;
        const scale = (entry.servings || r.servings) / (r.servings || 1);
        r.ingredients.forEach((ing) => {
          const key = norm(ing.item) + "|" + ing.unit;
          if (!map[key]) map[key] = { ...ing, qty: 0 };
          map[key].qty += ing.qty * scale;
        });
      });
    });
    return Object.values(map);
  }, [plan, recipes]);

  // ---- Grocery list = needed minus pantry (with unit conversion) ----------
  const groceryList = useMemo(() => {
    const invMap = {};
    inventory.forEach((inv) => { invMap[norm(inv.item)] = inv; });
    const needed = aggregated.map((ing) => {
      const have = invMap[norm(ing.item)];
      let needQty = ing.qty;
      if (have) {
        const needBase = toBase(ing.qty, ing.unit);
        const haveBase = toBase(parseFloat(have.qty) || 0, have.unit);
        if (needBase.base === haveBase.base && needBase.base !== "count") {
          const remainBase = Math.max(0, needBase.val - haveBase.val);
          needQty = needBase.val > 0 ? (remainBase / needBase.val) * ing.qty : 0;
        } else if (needBase.base === "count" && haveBase.base === "count") {
          needQty = Math.max(0, ing.qty - (parseFloat(have.qty) || 0));
        } else {
          needQty = 0; // have some form of it
        }
      }
      return { ...ing, needQty, have: !!have };
    }).filter((x) => x.needQty > 0.01);

    const byCat = {};
    needed.forEach((n) => { (byCat[n.cat] ||= []).push(n); });

    // Add snack items that are toggled "buy", split into individual items,
    // deduped, and skipping anything already in the pantry.
    const snackItems = {};
    DAYS.forEach((day) => {
      (plan[day]?.snacks || []).forEach((sn) => {
        if (!sn.buy) return;
        splitSnack(sn.text).forEach((item) => {
          const key = norm(item);
          if (!key || invMap[key]) return;      // skip if owned
          snackItems[key] = item;               // dedupe by normalized name
        });
      });
    });
    const snackList = Object.values(snackItems).map((item) => ({ item, needQty: 1, unit: "", cat: "snacks", isSnack: true }));
    if (snackList.length) byCat.snacks = snackList;

    return byCat;
  }, [aggregated, inventory, plan]);

  const totalNeeded = Object.values(groceryList).reduce((a, arr) => a + arr.length, 0);
  const lowStock = inventory.filter((inv) => inv.lowAt && parseFloat(inv.qty) <= parseFloat(inv.lowAt));

  // ---- Inventory ops ------------------------------------------------------
  function addInventory() {
    if (!newInv.item.trim()) return;
    setInventory([...inventory, {
      item: newInv.item.trim(), qty: newInv.qty || "1",
      unit: newInv.unit.trim(), lowAt: newInv.lowAt.trim(),
    }]);
    setNewInv({ item: "", qty: "", unit: "oz", lowAt: "" });
  }
  function adjustInv(idx, delta) {
    const next = [...inventory];
    const cur = parseFloat(next[idx].qty) || 0;
    next[idx] = { ...next[idx], qty: String(Math.max(0, Math.round((cur + delta) * 100) / 100)) };
    setInventory(next);
  }
  function removeInventory(idx) { setInventory(inventory.filter((_, i) => i !== idx)); }
  function toggleCheck(key) { setChecked({ ...checked, [key]: !checked[key] }); }

  // ---- Week archive ------------------------------------------------------
  function planIsEmpty() {
    return !Object.values(plan).some((dp) => dp && Object.keys(dp).length);
  }
  // helper: does a day have any meal in a slot (ignoring snacks)?
  function dayHasMeals(dp) {
    return MEALS.some((m) => dp && dp[m.id]);
  }

  function archiveWeek() {
    if (planIsEmpty()) return;
    // Snapshot the current grocery list, flattened by category.
    const grocery = [];
    CAT_ORDER.forEach((cat) => {
      (groceryList[cat] || []).forEach((n) =>
        grocery.push({ cat, item: n.item, qty: n.needQty, unit: n.unit })
      );
    });
    const now = new Date();
    const label = now.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
    const entry = {
      id: `week_${now.getTime()}`,
      label: `Week of ${label}`,
      savedAt: now.toISOString(),
      plan,            // snapshot of the current plan
      grocery,         // snapshot of the grocery list
    };
    setArchives((prev) => [entry, ...prev]);
    // Start a fresh, empty week.
    setPlan({});
    setChecked({});
    setShowArchives(true);
  }

  function reloadArchive(id) {
    const a = archives.find((x) => x.id === id);
    if (!a) return;
    setPlan(a.plan || {});
    setChecked({});
    setShowArchives(false);
    setTab("plan");
  }

  function deleteArchive(id) {
    setArchives((prev) => prev.filter((x) => x.id !== id));
  }

  function exportList() {
    let txt = "GROCERY LIST\n" + "=".repeat(30) + "\n\n";
    CAT_ORDER.forEach((cat) => {
      const arr = groceryList[cat];
      if (!arr?.length) return;
      txt += CAT_LABEL[cat].toUpperCase() + "\n";
      arr.forEach((n) => { txt += n.isSnack ? `  [ ] ${n.item}\n` : `  [ ] ${fmtQty(n.needQty)}${n.unit ? " " + n.unit : ""} ${n.item}\n`; });
      txt += "\n";
    });
    const blob = new Blob([txt], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "grocery-list.txt"; a.click();
    URL.revokeObjectURL(url);
  }

  const C = {
    bg: "#FBF7F0", ink: "#2B2620", sub: "#7A7264", line: "#E5DDCE",
    sage: "#6B7B5A", sageD: "#54634A", clay: "#C67B4E", cream: "#FFFFFF", chip: "#F0EADB", amber: "#B8862E",
  };

  const tabBtn = (id, label, Icon, badge) => (
    <button onClick={() => setTab(id)} style={{
      display: "flex", alignItems: "center", gap: 8, padding: "10px 18px", border: "none",
      cursor: "pointer", borderRadius: 10, fontSize: 15, fontWeight: 600, transition: "all .15s",
      background: tab === id ? C.sage : "transparent", color: tab === id ? "#fff" : C.sub,
    }}>
      <Icon size={18} /> {label}
      {badge > 0 && <span style={{ background: tab === id ? "rgba(255,255,255,.25)" : C.clay, color: "#fff", borderRadius: 10, padding: "1px 7px", fontSize: 12 }}>{badge}</span>}
    </button>
  );

  const uiFont = "system-ui, -apple-system, sans-serif";

  // Household setup screen (only when Supabase is on and no code joined yet)
  if (supabase && !household) {
    return (
      <div style={{ fontFamily: "Georgia, serif", background: C.bg, minHeight: "100vh", color: C.ink, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
        <div style={{ maxWidth: 440, width: "100%", background: C.cream, border: `1px solid ${C.line}`, borderRadius: 18, padding: 30 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
            <div style={{ background: C.sage, borderRadius: 10, padding: 8, display: "flex" }}><Utensils size={22} color="#fff" /></div>
            <h1 style={{ margin: 0, fontSize: 26 }}>WeeklyForkast</h1>
          </div>
          <p style={{ fontFamily: uiFont, fontSize: 14, color: C.sub, lineHeight: 1.6, marginTop: 0 }}>
            Enter a household code to open your shared kitchen. Everyone who uses the same code sees the same plan, pantry, and preferences — on any device. Pick a code together and share it.
          </p>
          <div style={{ fontFamily: uiFont }}>
            <input
              value={codeInput}
              onChange={(e) => setCodeInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && joinHousehold(codeInput)}
              placeholder="e.g. smith-family"
              style={{ width: "100%", padding: "12px 14px", borderRadius: 10, border: `1px solid ${C.line}`, fontSize: 15, background: C.bg, marginBottom: 6 }}
            />
            {codeInput && normalizeCode(codeInput) !== codeInput.trim().toLowerCase() && (
              <div style={{ fontSize: 12, color: C.sub, marginBottom: 6 }}>Will be saved as: <strong>{normalizeCode(codeInput)}</strong></div>
            )}
            <button onClick={() => joinHousehold(codeInput)} disabled={!normalizeCode(codeInput)} style={{
              width: "100%", padding: "12px", background: C.sage, color: "#fff", border: "none", borderRadius: 10,
              fontSize: 15, fontWeight: 700, cursor: normalizeCode(codeInput) ? "pointer" : "not-allowed", opacity: normalizeCode(codeInput) ? 1 : .5, marginBottom: 12,
            }}>Open kitchen</button>
            <button onClick={() => setCodeInput(suggestCode())} style={{
              width: "100%", padding: "10px", background: "transparent", color: C.sageD, border: `1px dashed ${C.line}`, borderRadius: 10,
              fontSize: 13, cursor: "pointer",
            }}>Suggest a code for me</button>
            <p style={{ fontSize: 12, color: C.sub, lineHeight: 1.5, marginTop: 16 }}>
              Anyone with the code can see and edit this kitchen, so treat it like a shared password. Choose something not easy to guess if you'd like it private.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (!loaded) return <div style={{ padding: 40, fontFamily: uiFont, color: "#7A7264" }}>Loading your kitchen…</div>;

  return (
    <div style={{ fontFamily: "Georgia, serif", background: C.bg, minHeight: "100vh", color: C.ink }}>
      <div style={{ maxWidth: 900, margin: "0 auto", padding: "28px 20px 60px" }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 6, flexWrap: "wrap" }}>
          <div style={{ background: C.sage, borderRadius: 12, padding: 10, display: "flex" }}><Utensils size={26} color="#fff" /></div>
          <div>
            <h1 style={{ margin: 0, fontSize: 30, letterSpacing: "-0.5px" }}>WeeklyForkast</h1>
            <p style={{ margin: 0, color: C.sub, fontFamily: uiFont, fontSize: 14 }}>Plan the week, shop the gaps.</p>
          </div>
          {supabase && (
            <div style={{ marginLeft: "auto", position: "relative", fontFamily: uiFont }}>
              <button onClick={() => setShowHousehold((v) => !v)} style={{
                display: "flex", alignItems: "center", gap: 7, padding: "8px 12px", borderRadius: 10,
                border: `1px solid ${C.line}`, background: C.cream, color: C.ink, fontSize: 13, cursor: "pointer",
              }}>
                <Home size={15} color={C.sageD} /> <strong style={{ fontWeight: 600 }}>{household}</strong>
                <ChevronDown size={14} style={{ transform: showHousehold ? "rotate(180deg)" : "none", transition: "transform .15s" }} />
              </button>
              {showHousehold && (
                <div style={{ position: "absolute", right: 0, top: "calc(100% + 6px)", background: C.cream, border: `1px solid ${C.line}`, borderRadius: 12, padding: 14, width: 260, zIndex: 30, boxShadow: "0 8px 24px rgba(43,38,32,.12)" }}>
                  <div style={{ fontSize: 12, color: C.sub, marginBottom: 8 }}>Shared kitchen code. Anyone using it shares this data.</div>
                  <input
                    value={codeInput}
                    onChange={(e) => setCodeInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && joinHousehold(codeInput)}
                    placeholder="switch to another code…"
                    style={{ width: "100%", padding: "9px 11px", borderRadius: 8, border: `1px solid ${C.line}`, fontSize: 13, background: C.bg, marginBottom: 8 }}
                  />
                  <button onClick={() => joinHousehold(codeInput)} disabled={!normalizeCode(codeInput)} style={{
                    width: "100%", padding: "9px", background: C.sage, color: "#fff", border: "none", borderRadius: 8,
                    fontSize: 13, fontWeight: 600, cursor: normalizeCode(codeInput) ? "pointer" : "not-allowed", opacity: normalizeCode(codeInput) ? 1 : .5, marginBottom: 8,
                  }}>Switch kitchen</button>
                  <button onClick={leaveHousehold} style={{
                    width: "100%", padding: "8px", background: "transparent", color: C.sub, border: `1px solid ${C.line}`, borderRadius: 8,
                    fontSize: 12.5, cursor: "pointer",
                  }}>Leave this device</button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Low-stock banner */}
        {lowStock.length > 0 && (
          <div style={{ display: "flex", alignItems: "center", gap: 10, background: "#FBF1DC", border: `1px solid ${C.amber}`, borderRadius: 12, padding: "12px 16px", margin: "18px 0", fontFamily: uiFont, fontSize: 14 }}>
            <AlertTriangle size={18} color={C.amber} />
            <span>Running low: <strong>{lowStock.map((l) => l.item).join(", ")}</strong></span>
          </div>
        )}

        {/* Tabs */}
        <div style={{ display: "flex", gap: 6, background: C.chip, padding: 6, borderRadius: 14, margin: "22px 0", fontFamily: uiFont, flexWrap: "wrap" }}>
          {tabBtn("plan", "Meal Plan", Calendar)}
          {tabBtn("grocery", "Grocery List", ShoppingCart, totalNeeded)}
          {tabBtn("inventory", "Pantry", Package, inventory.length)}
        </div>

        {/* ---------------- PLAN ---------------- */}
        {tab === "plan" && (
          <div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center", marginBottom: 12, fontFamily: uiFont }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ fontSize: 14, color: C.sub }}>Servings:</span>
                <button onClick={() => setDefaultServings(Math.max(1, defaultServings - 1))} style={stepBtn(C)}><Minus size={14} /></button>
                <span style={{ minWidth: 20, textAlign: "center", fontWeight: 600 }}>{defaultServings}</span>
                <button onClick={() => setDefaultServings(defaultServings + 1)} style={stepBtn(C)}><Plus size={14} /></button>
              </div>
              <button onClick={() => setPrefsOpen((o) => !o)} style={{
                marginLeft: "auto", display: "flex", alignItems: "center", gap: 7, padding: "8px 14px", borderRadius: 10,
                border: `1px solid ${C.line}`, background: prefsOpen ? C.chip : C.cream, color: C.ink, fontSize: 13, fontWeight: 600, cursor: "pointer",
              }}>
                <SlidersHorizontal size={15} /> Food Preferences
                <ChevronDown size={15} style={{ transform: prefsOpen ? "rotate(180deg)" : "none", transition: "transform .15s" }} />
              </button>
            </div>

            {/* Preferences panel */}
            {prefsOpen && (
              <div style={{ background: C.cream, border: `1px solid ${C.line}`, borderRadius: 14, padding: 18, marginBottom: 16, fontFamily: uiFont }}>
                <p style={{ margin: "0 0 14px", fontSize: 13, color: C.sub }}>
                  The assistant uses these on every request — it'll steer toward what you like and never suggest what you avoid.
                </p>

                <label style={prefLabel(C)}>Diet</label>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
                  {DIETS.map((d) => (
                    <button key={d.id} onClick={() => setPrefsDraft({ ...prefsDraft, diet: d.id })} style={{
                      padding: "6px 14px", borderRadius: 20, fontSize: 13, cursor: "pointer", fontWeight: 500,
                      border: `1px solid ${prefsDraft.diet === d.id ? C.sage : C.line}`,
                      background: prefsDraft.diet === d.id ? C.sage : C.bg, color: prefsDraft.diet === d.id ? "#fff" : C.ink,
                    }}>{d.label}</button>
                  ))}
                </div>

                <label style={prefLabel(C)}>Allergies / never include</label>
                <input value={prefsDraft.avoid} onChange={(e) => setPrefsDraft({ ...prefsDraft, avoid: e.target.value })}
                  placeholder="e.g. peanuts, shellfish, pork"
                  style={{ ...inp(C, "1 1 100%"), width: "100%", marginBottom: 16 }} />

                <label style={prefLabel(C)}>Dislikes (avoid if possible)</label>
                <input value={prefsDraft.dislikes} onChange={(e) => setPrefsDraft({ ...prefsDraft, dislikes: e.target.value })}
                  placeholder="e.g. cilantro, olives, very spicy food"
                  style={{ ...inp(C, "1 1 100%"), width: "100%", marginBottom: 16 }} />

                <label style={prefLabel(C)}>Notes for the assistant</label>
                <textarea value={prefsDraft.notes} onChange={(e) => setPrefsDraft({ ...prefsDraft, notes: e.target.value })}
                  placeholder="Anything else — e.g. prefer one-pot meals on weeknights, cooking for 2 adults + 2 kids, love Mediterranean flavors"
                  rows={3}
                  style={{ ...inp(C, "1 1 100%"), width: "100%", resize: "vertical", fontFamily: uiFont, marginBottom: 16 }} />

                {(() => {
                  const dirty = JSON.stringify(prefsDraft) !== JSON.stringify(prefs);
                  return (
                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                      <button onClick={savePrefs} disabled={!dirty} style={{
                        display: "flex", alignItems: "center", gap: 7, padding: "10px 18px", borderRadius: 10, border: "none",
                        background: dirty ? C.sage : C.line, color: dirty ? "#fff" : C.sub, fontSize: 14, fontWeight: 700,
                        cursor: dirty ? "pointer" : "default",
                      }}>
                        <Check size={16} /> Save preferences
                      </button>
                      {prefsSaved && (
                        <span style={{ display: "flex", alignItems: "center", gap: 6, color: C.sage, fontSize: 13, fontWeight: 600 }}>
                          <Check size={15} /> Preferences saved
                        </span>
                      )}
                      {!prefsSaved && dirty && (
                        <span style={{ color: C.amber, fontSize: 13 }}>Unsaved changes</span>
                      )}
                    </div>
                  );
                })()}
              </div>
            )}

            {/* Chat assistant */}
            <div style={{ background: C.cream, border: `1px solid ${C.line}`, borderRadius: 16, overflow: "hidden", marginBottom: 22, fontFamily: uiFont }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "12px 16px", borderBottom: `1px solid ${C.line}`, background: C.chip }}>
                <MessageCircle size={17} color={C.sageD} />
                <span style={{ fontWeight: 700, fontSize: 14 }}>Ask WeeklyForkast</span>
                <span style={{ fontSize: 12, color: C.sub, marginLeft: "auto" }}>knows your pantry & plan</span>
              </div>

              <div style={{ maxHeight: 340, overflowY: "auto", padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
                {chatLog.length === 0 && (
                  <div style={{ color: C.sub, fontSize: 14, lineHeight: 1.6 }}>
                    Ask for a recipe and I'll suggest one you can drop straight into your week. Try:
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 10 }}>
                      {["Something quick with what I have", "A vegetarian dinner for tonight", "Use up my chicken before it goes bad"].map((s) => (
                        <button key={s} onClick={() => sendChat(s)} style={{ padding: "6px 12px", borderRadius: 16, border: `1px solid ${C.line}`, background: C.bg, color: C.ink, fontSize: 12.5, cursor: "pointer" }}>{s}</button>
                      ))}
                    </div>
                  </div>
                )}

                {chatLog.map((m, i) => (
                  <div key={i} style={{ alignSelf: m.role === "user" ? "flex-end" : "flex-start", maxWidth: "85%" }}>
                    <div style={{
                      padding: "10px 14px", borderRadius: 14, fontSize: 14, lineHeight: 1.5, whiteSpace: "pre-wrap",
                      background: m.role === "user" ? C.sage : C.bg, color: m.role === "user" ? "#fff" : C.ink,
                      border: m.role === "user" ? "none" : `1px solid ${C.line}`,
                    }}>{m.content}</div>

                    {/* recipe cards from assistant */}
                    {m.role === "assistant" && m.recipes?.map((r) => (
                      <div key={r.id} style={{ marginTop: 8, border: `1px solid ${C.sage}`, borderRadius: 12, padding: "12px 14px", background: "#F6F8F3" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                          <div>
                            <div style={{ fontWeight: 700, fontSize: 15 }}>{r.name}</div>
                            <div style={{ fontSize: 12, color: C.sub, marginTop: 2 }}>{r.time} min · serves {r.servings} · {(r.tags || []).filter((t) => t !== "dinner").join(", ")}</div>
                          </div>
                          <button onClick={() => setViewRecipe(r)} style={{ fontSize: 12, color: C.sageD, background: "none", border: "none", cursor: "pointer", textDecoration: "underline", flexShrink: 0 }}>view</button>
                        </div>
                        {addingFor === r.id ? (
                          <div style={{ marginTop: 10 }}>
                            <div style={{ fontSize: 12, color: C.sub, marginBottom: 6 }}>Which meal?</div>
                            <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
                              {MEALS.map((m) => (
                                <button key={m.id} onClick={() => setAddMeal(m.id)} style={{
                                  padding: "5px 12px", borderRadius: 8, fontSize: 12, cursor: "pointer", fontWeight: 500,
                                  border: `1px solid ${addMeal === m.id ? C.sage : C.line}`,
                                  background: addMeal === m.id ? C.sage : C.cream, color: addMeal === m.id ? "#fff" : C.ink,
                                }}>{m.label}</button>
                              ))}
                            </div>
                            <div style={{ fontSize: 12, color: C.sub, marginBottom: 6 }}>Add {MEALS.find((m) => m.id === addMeal)?.label.toLowerCase()} to which day?</div>
                            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                              {DAYS.map((d) => (
                                <button key={d} onClick={() => addRecipeToSlot(r, d, addMeal)} style={{ padding: "5px 10px", borderRadius: 8, border: `1px solid ${C.line}`, background: C.cream, fontSize: 12, cursor: "pointer" }}>{d.slice(0, 3)}</button>
                              ))}
                              <button onClick={() => setAddingFor(null)} style={{ padding: "5px 10px", borderRadius: 8, border: "none", background: "transparent", color: C.sub, fontSize: 12, cursor: "pointer" }}>cancel</button>
                            </div>
                          </div>
                        ) : (
                          <button onClick={() => { setAddingFor(r.id); setAddMeal((r.tags || []).includes("breakfast") ? "breakfast" : "dinner"); }} style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 6, padding: "7px 12px", background: C.sage, color: "#fff", border: "none", borderRadius: 9, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
                            <CalendarPlus size={14} /> Add to plan
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                ))}

                {chatBusy && <div style={{ alignSelf: "flex-start", color: C.sub, fontSize: 13, fontStyle: "italic" }}>WeeklyForkast is thinking…</div>}
              </div>

              <div style={{ display: "flex", gap: 8, padding: 12, borderTop: `1px solid ${C.line}` }}>
                <input
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && sendChat()}
                  placeholder="Ask for a recipe…"
                  disabled={chatBusy}
                  style={{ flex: 1, padding: "10px 14px", borderRadius: 10, border: `1px solid ${C.line}`, fontSize: 14, background: C.bg }}
                />
                <button onClick={() => sendChat()} disabled={chatBusy || !chatInput.trim()} style={{
                  display: "flex", alignItems: "center", gap: 6, padding: "10px 16px", background: C.clay, color: "#fff",
                  border: "none", borderRadius: 10, cursor: chatBusy ? "wait" : "pointer", fontSize: 14, fontWeight: 600,
                  opacity: (chatBusy || !chatInput.trim()) ? .6 : 1,
                }}>
                  <Send size={15} /> Send
                </button>
              </div>
            </div>

            <p style={{ fontFamily: uiFont, fontSize: 13, color: C.sub, margin: "0 0 12px" }}>
              Ask the assistant above for meals and add them to any day. Drag a meal to another slot to move it.
            </p>

            <div style={{ display: "grid", gap: 10 }}>
              {DAYS.map((day) => (
                <div key={day} style={{ background: C.cream, border: `1px solid ${C.line}`, borderRadius: 14, padding: "14px 18px" }}>
                  <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 10 }}>{day}</div>
                  <div style={{ display: "grid", gap: 8 }}>
                    {MEALS.map((m) => {
                      const slotKey = `${day}|${m.id}`;
                      const entry = plan[day]?.[m.id];
                      const r = entry && recipes.find((x) => x.id === entry.recipeId);
                      const isOver = dragOver === slotKey && dragDay !== slotKey;
                      return (
                        <div
                          key={m.id}
                          onDragOver={(e) => { if (dragDay) { e.preventDefault(); setDragOver(slotKey); } }}
                          onDragLeave={() => setDragOver((k) => (k === slotKey ? null : k))}
                          onDrop={(e) => { e.preventDefault(); if (dragDay) moveSlot(dragDay, slotKey); setDragDay(null); setDragOver(null); }}
                          style={{
                            display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap",
                            background: isOver ? "#EEF2E8" : C.bg,
                            border: `${isOver ? 2 : 1}px ${isOver ? "dashed" : "solid"} ${isOver ? C.sage : C.line}`,
                            borderRadius: 10, padding: "10px 12px", transition: "background .12s",
                          }}
                        >
                          <span style={{ width: 74, flexShrink: 0, fontFamily: uiFont, fontSize: 12, fontWeight: 700, color: C.sageD, textTransform: "uppercase", letterSpacing: .5 }}>{m.label}</span>

                          {r ? (
                            <>
                              <div
                                draggable
                                onDragStart={() => setDragDay(slotKey)}
                                onDragEnd={() => { setDragDay(null); setDragOver(null); }}
                                title="Drag to another slot"
                                style={{ flex: "1 1 180px", display: "flex", alignItems: "center", gap: 10, cursor: "grab", opacity: dragDay === slotKey ? .4 : 1 }}
                              >
                                <GripVertical size={16} color={C.sub} style={{ flexShrink: 0 }} />
                                <div>
                                  <div style={{ fontSize: 16, cursor: "pointer", textDecoration: "underline dotted", textUnderlineOffset: 3 }} onClick={() => setViewRecipe(r)}>{r.name}</div>
                                  <div style={{ fontFamily: uiFont, fontSize: 12, color: C.sub, marginTop: 1 }}>{r.time} min · {(r.tags || []).filter((t) => t !== "dinner" && t !== "breakfast").join(", ")}</div>
                                </div>
                              </div>
                              <div style={{ display: "flex", alignItems: "center", gap: 6, fontFamily: uiFont }}>
                                <button onClick={() => setSlotServings(day, m.id, (entry.servings || r.servings) - 1)} style={stepBtn(C)}><Minus size={13} /></button>
                                <span style={{ fontSize: 12.5, minWidth: 50, textAlign: "center", color: C.sub }}>{entry.servings || r.servings} serv</span>
                                <button onClick={() => setSlotServings(day, m.id, (entry.servings || r.servings) + 1)} style={stepBtn(C)}><Plus size={13} /></button>
                                <button onClick={() => clearSlot(day, m.id)} title="Remove meal" style={{ ...stepBtn(C), marginLeft: 4 }}><X size={14} /></button>
                              </div>
                            </>
                          ) : (
                            <span style={{ flex: "1 1 180px", color: C.sub, fontStyle: "italic", fontFamily: uiFont, fontSize: 13.5 }}>
                              {isOver ? "Drop here" : "Empty — add from chat"}
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {/* Snacks for this day */}
                  <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px dashed ${C.line}` }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: (plan[day]?.snacks?.length ? 8 : 0) }}>
                      <span style={{ width: 74, flexShrink: 0, fontFamily: uiFont, fontSize: 12, fontWeight: 700, color: C.sageD, textTransform: "uppercase", letterSpacing: .5 }}>Snacks</span>
                      <input
                        value={snackInputs[day] || ""}
                        onChange={(e) => setSnackInputs({ ...snackInputs, [day]: e.target.value })}
                        onKeyDown={(e) => { if (e.key === "Enter") { addSnack(day, snackInputs[day]); setSnackInputs({ ...snackInputs, [day]: "" }); } }}
                        placeholder="e.g. apple + peanut butter"
                        style={{ flex: "1 1 160px", padding: "7px 11px", borderRadius: 8, border: `1px solid ${C.line}`, fontSize: 13, background: C.bg, fontFamily: uiFont }}
                      />
                      <button onClick={() => { addSnack(day, snackInputs[day]); setSnackInputs({ ...snackInputs, [day]: "" }); }} disabled={!(snackInputs[day] || "").trim()} style={{
                        display: "flex", alignItems: "center", gap: 5, padding: "7px 12px", borderRadius: 8, border: "none",
                        background: (snackInputs[day] || "").trim() ? C.sage : C.line, color: (snackInputs[day] || "").trim() ? "#fff" : C.sub,
                        fontSize: 13, fontWeight: 600, cursor: (snackInputs[day] || "").trim() ? "pointer" : "default", fontFamily: uiFont,
                      }}><Plus size={14} /> Add</button>
                    </div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 8, paddingLeft: 82 }}>
                      {(plan[day]?.snacks || []).map((sn, i) => (
                        <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, background: C.bg, border: `1px solid ${C.line}`, borderRadius: 20, padding: "5px 8px 5px 12px", fontFamily: uiFont }}>
                          <span style={{ fontSize: 13 }}>{sn.text}</span>
                          <button onClick={() => toggleSnackBuy(day, i)} title={sn.buy ? "On grocery list — click to skip" : "Not on list — click to add"} style={{
                            display: "flex", alignItems: "center", gap: 4, padding: "2px 8px", borderRadius: 12, border: "none", cursor: "pointer",
                            background: sn.buy ? C.sage : C.chip, color: sn.buy ? "#fff" : C.sub, fontSize: 11, fontWeight: 600,
                          }}>
                            <ShoppingCart size={11} /> {sn.buy ? "on list" : "skip"}
                          </button>
                          <button onClick={() => removeSnack(day, i)} title="Remove snack" style={{ background: "none", border: "none", cursor: "pointer", color: C.sub, display: "flex", padding: 2 }}>
                            <X size={13} />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Week archive controls */}
            <div style={{ marginTop: 20, fontFamily: uiFont }}>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                <button onClick={archiveWeek} disabled={planIsEmpty()} style={{
                  display: "flex", alignItems: "center", gap: 8, padding: "10px 18px", borderRadius: 10, border: "none",
                  background: planIsEmpty() ? C.line : C.clay, color: planIsEmpty() ? C.sub : "#fff",
                  fontSize: 14, fontWeight: 600, cursor: planIsEmpty() ? "default" : "pointer",
                }}>
                  <Archive size={16} /> Archive & start new week
                </button>
                {archives.length > 0 && (
                  <button onClick={() => setShowArchives((v) => !v)} style={{
                    display: "flex", alignItems: "center", gap: 7, padding: "10px 16px", borderRadius: 10,
                    border: `1px solid ${C.line}`, background: showArchives ? C.chip : C.cream, color: C.ink, fontSize: 14, fontWeight: 600, cursor: "pointer",
                  }}>
                    <BookOpen size={15} /> Past weeks ({archives.length})
                    <ChevronDown size={15} style={{ transform: showArchives ? "rotate(180deg)" : "none", transition: "transform .15s" }} />
                  </button>
                )}
              </div>

              {showArchives && archives.length > 0 && (
                <div style={{ marginTop: 12, display: "grid", gap: 8 }}>
                  {archives.map((a) => {
                    const mealCount = Object.values(a.plan || {}).reduce((n, dp) => n + Object.keys(dp || {}).length, 0);
                    return (
                      <div key={a.id} style={{ background: C.cream, border: `1px solid ${C.line}`, borderRadius: 12, padding: "12px 16px", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                        <div style={{ flex: "1 1 180px" }}>
                          <div style={{ fontSize: 15, fontWeight: 600 }}>{a.label}</div>
                          <div style={{ fontSize: 12.5, color: C.sub, marginTop: 2 }}>{mealCount} meals · {(a.grocery || []).length} grocery items</div>
                        </div>
                        <button onClick={() => reloadArchive(a.id)} style={{
                          display: "flex", alignItems: "center", gap: 6, padding: "7px 14px", background: C.sage, color: "#fff",
                          border: "none", borderRadius: 9, fontSize: 13, fontWeight: 600, cursor: "pointer",
                        }}><RefreshCw size={14} /> Load into this week</button>
                        <button onClick={() => deleteArchive(a.id)} title="Delete archived week" style={{ background: "none", border: "none", cursor: "pointer", color: C.sub, display: "flex" }}>
                          <Trash2 size={17} />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ---------------- GROCERY ---------------- */}
        {tab === "grocery" && (
          <div>
            {totalNeeded === 0 ? (
              <Empty C={C} icon={ShoppingCart} title="Nothing to buy yet." sub="Plan some meals, and anything you don't already have in your pantry shows up here." />
            ) : (
              <>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18, fontFamily: uiFont, flexWrap: "wrap", gap: 10 }}>
                  <span style={{ fontSize: 14, color: C.sub }}>{totalNeeded} items · pantry amounts already deducted</span>
                  <button onClick={exportList} style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 16px", background: C.sage, color: "#fff", border: "none", borderRadius: 10, cursor: "pointer", fontSize: 14, fontWeight: 600 }}>
                    <Download size={16} /> Export
                  </button>
                </div>
                {CAT_ORDER.map((cat) => {
                  const arr = groceryList[cat];
                  if (!arr?.length) return null;
                  return (
                    <div key={cat} style={{ marginBottom: 22 }}>
                      <h3 style={{ fontFamily: uiFont, fontSize: 12, letterSpacing: 1, textTransform: "uppercase", color: C.sageD, marginBottom: 8 }}>{CAT_LABEL[cat]}</h3>
                      <div style={{ background: C.cream, border: `1px solid ${C.line}`, borderRadius: 12, overflow: "hidden" }}>
                        {arr.map((n, i) => {
                          const key = norm(n.item) + n.unit;
                          const done = checked[key];
                          return (
                            <div key={key} onClick={() => toggleCheck(key)} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", borderTop: i ? `1px solid ${C.line}` : "none", cursor: "pointer" }}>
                              <div style={{ width: 22, height: 22, borderRadius: 6, flexShrink: 0, border: `2px solid ${done ? C.sage : C.line}`, background: done ? C.sage : "transparent", display: "flex", alignItems: "center", justifyContent: "center" }}>{done && <Check size={14} color="#fff" />}</div>
                              <span style={{ fontFamily: uiFont, fontSize: 15, textDecoration: done ? "line-through" : "none", color: done ? C.sub : C.ink }}>
                                {n.isSnack ? n.item : <><strong style={{ fontWeight: 600 }}>{fmtQty(n.needQty)}{n.unit ? " " + n.unit : ""}</strong> {n.item}</>}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </>
            )}
          </div>
        )}

        {/* ---------------- INVENTORY ---------------- */}
        {tab === "inventory" && (
          <div>
            <p style={{ fontFamily: uiFont, fontSize: 14, color: C.sub, marginTop: 0 }}>
              Track what's in your kitchen with amounts. Set a "low at" threshold and you'll get a heads-up when you're running out.
            </p>
            <div style={{ display: "flex", gap: 8, marginBottom: 20, fontFamily: uiFont, flexWrap: "wrap", alignItems: "center" }}>
              <input placeholder="Item (e.g. olive oil)" value={newInv.item} onChange={(e) => setNewInv({ ...newInv, item: e.target.value })} onKeyDown={(e) => e.key === "Enter" && addInventory()} style={inp(C, "2 1 150px")} />
              <input placeholder="Qty" value={newInv.qty} onChange={(e) => setNewInv({ ...newInv, qty: e.target.value })} onKeyDown={(e) => e.key === "Enter" && addInventory()} style={inp(C, "0 1 60px")} />
              <select value={newInv.unit} onChange={(e) => setNewInv({ ...newInv, unit: e.target.value })} style={inp(C, "0 1 80px")}>
                {["oz", "lb", "g", "kg", "cup", "tbsp", "tsp", "can", "each"].map((u) => <option key={u} value={u === "each" ? "" : u}>{u}</option>)}
              </select>
              <input placeholder="Low at" value={newInv.lowAt} onChange={(e) => setNewInv({ ...newInv, lowAt: e.target.value })} onKeyDown={(e) => e.key === "Enter" && addInventory()} style={inp(C, "0 1 70px")} title="Warn when quantity drops to this" />
              <button onClick={addInventory} style={{ display: "flex", alignItems: "center", gap: 6, padding: "10px 16px", background: C.sage, color: "#fff", border: "none", borderRadius: 9, cursor: "pointer", fontSize: 14, fontWeight: 600 }}><Plus size={16} /> Add</button>
            </div>

            {inventory.length === 0 ? (
              <Empty C={C} icon={Package} title="Your pantry is empty." sub="Add staples like oil, rice, or spices you keep on hand." />
            ) : (
              <div style={{ background: C.cream, border: `1px solid ${C.line}`, borderRadius: 12, overflow: "hidden" }}>
                {inventory.map((inv, i) => {
                  const low = inv.lowAt && parseFloat(inv.qty) <= parseFloat(inv.lowAt);
                  return (
                    <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", borderTop: i ? `1px solid ${C.line}` : "none", fontFamily: uiFont, background: low ? "#FDF6E7" : "transparent" }}>
                      <span style={{ flex: 1, fontSize: 15 }}>
                        <strong style={{ fontWeight: 600 }}>{inv.qty}{inv.unit ? " " + inv.unit : ""}</strong> {inv.item}
                        {low && <span style={{ color: C.amber, fontSize: 12, marginLeft: 8 }}>· low</span>}
                      </span>
                      <button onClick={() => adjustInv(i, -1)} style={stepBtn(C)}><Minus size={13} /></button>
                      <button onClick={() => adjustInv(i, 1)} style={stepBtn(C)}><Plus size={13} /></button>
                      <button onClick={() => removeInventory(i)} style={{ background: "none", border: "none", cursor: "pointer", color: C.sub, display: "flex", marginLeft: 4 }}><Trash2 size={17} /></button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Recipe modal */}
      {viewRecipe && (
        <div onClick={() => setViewRecipe(null)} style={{ position: "fixed", inset: 0, background: "rgba(43,38,32,.5)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20, zIndex: 50 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: C.bg, borderRadius: 16, maxWidth: 480, width: "100%", maxHeight: "85vh", overflow: "auto", padding: 26 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <h2 style={{ margin: 0, fontSize: 24 }}>{viewRecipe.name}</h2>
              <button onClick={() => setViewRecipe(null)} style={{ background: "none", border: "none", cursor: "pointer", color: C.sub }}><X size={22} /></button>
            </div>
            <p style={{ fontFamily: uiFont, fontSize: 13, color: C.sub }}>{viewRecipe.time} min · serves {viewRecipe.servings}</p>
            <h3 style={{ fontFamily: uiFont, fontSize: 12, letterSpacing: 1, textTransform: "uppercase", color: C.sageD }}>Ingredients</h3>
            <ul style={{ fontFamily: uiFont, fontSize: 14, lineHeight: 1.8, paddingLeft: 20 }}>
              {viewRecipe.ingredients.map((ing, i) => <li key={i}>{fmtQty(ing.qty)}{ing.unit ? " " + ing.unit : ""} {ing.item}</li>)}
            </ul>
            {viewRecipe.steps?.length > 0 && (
              <>
                <h3 style={{ fontFamily: uiFont, fontSize: 12, letterSpacing: 1, textTransform: "uppercase", color: C.sageD }}>Steps</h3>
                <ol style={{ fontFamily: uiFont, fontSize: 14, lineHeight: 1.7, paddingLeft: 20 }}>
                  {viewRecipe.steps.map((s, i) => <li key={i}>{s}</li>)}
                </ol>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function stepBtn(C) {
  return { width: 26, height: 26, borderRadius: 7, border: `1px solid ${C.line}`, background: C.cream, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: C.ink };
}
function inp(C, flex) {
  return { flex, padding: "10px 12px", borderRadius: 9, border: `1px solid ${C.line}`, fontSize: 14, background: C.cream };
}
function prefLabel(C) {
  return { display: "block", fontSize: 12, fontWeight: 700, color: C.sageD, marginBottom: 6 };
}
function Empty({ C, icon: Icon, title, sub }) {
  return (
    <div style={{ textAlign: "center", padding: "56px 20px", color: C.sub, fontFamily: "system-ui" }}>
      <Icon size={40} style={{ opacity: .4 }} />
      <p style={{ fontSize: 16, marginBottom: 4 }}>{title}</p>
      <p style={{ fontSize: 14, marginTop: 0 }}>{sub}</p>
    </div>
  );
}
