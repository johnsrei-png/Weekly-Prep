import React, { useState, useEffect, useMemo } from "react";
import { Calendar, ShoppingCart, Package, Plus, X, Check, Download, RefreshCw, Trash2, Utensils, Sparkles, Minus, AlertTriangle, BookOpen, Send, MessageCircle, CalendarPlus, GripVertical, SlidersHorizontal, ChevronDown, Home, Archive, Camera, Bookmark, DollarSign, GitMerge, Search, Star, Pencil, FolderPlus } from "lucide-react";
import { supabase, getHousehold, setHousehold, clearHousehold, normalizeCode, suggestCode } from "./supabase.js";
import { STAPLES, STAPLE_INDEX } from "./staples.js";

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

// Display a grocery quantity. Weight units (g/kg/oz/lb) are converted to oz,
// then shown as lb once they're 16 oz or more (easier to read). Everything else
// — counts, cups, tbsp, bunches, cans — is left in its original unit.
function fmtGrocery(qty, unit) {
  const u = (unit || "").toLowerCase();
  if (WEIGHT[u]) {
    const oz = qty * WEIGHT[u];               // WEIGHT is oz-based
    if (oz >= 16) {
      const lb = oz / 16;
      return `${fmtQty(lb)} lb`;
    }
    return `${fmtQty(oz)} oz`;
  }
  // non-weight: keep as-is
  return `${fmtQty(qty)}${unit ? " " + unit : ""}`;
}

// Read an image file, downscale it (max ~1600px long edge) and re-encode as
// JPEG so uploads stay small and reliable. Returns { base64, mediaType }.
// Falls back to the raw file if anything goes wrong.
function fileToCompressedBase64(file, maxDim = 1600, quality = 0.8) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        try {
          let { width, height } = img;
          if (width > maxDim || height > maxDim) {
            if (width >= height) { height = Math.round(height * (maxDim / width)); width = maxDim; }
            else { width = Math.round(width * (maxDim / height)); height = maxDim; }
          }
          const canvas = document.createElement("canvas");
          canvas.width = width; canvas.height = height;
          const ctx = canvas.getContext("2d");
          ctx.drawImage(img, 0, 0, width, height);
          const dataUrl = canvas.toDataURL("image/jpeg", quality);
          resolve({ base64: dataUrl.split(",")[1], mediaType: "image/jpeg" });
        } catch (e) {
          // fall back to raw
          const raw = String(reader.result);
          resolve({ base64: raw.split(",")[1], mediaType: file.type || "image/jpeg" });
        }
      };
      img.onerror = () => reject(new Error("Could not load image"));
      img.src = String(reader.result);
    };
    reader.onerror = () => reject(new Error("Could not read file"));
    reader.readAsDataURL(file);
  });
}

export default function MealPlanner() {
  const [tab, setTab] = useState("plan");
  const [isMobile, setIsMobile] = useState(typeof window !== "undefined" && window.innerWidth < 640);
  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 640);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  const [recipes, setRecipes] = useState(SEED_RECIPES);
  const [weeks, setWeeks] = useState({ this: {}, next: {} });  // two live weeks
  const [activeWeek, setActiveWeek] = useState("this");        // which one you're viewing
  const plan = weeks[activeWeek] || {};
  // setPlan proxies to the active week so all existing plan code works unchanged.
  const setPlan = (updater) => {
    setWeeks((prev) => {
      const cur = prev[activeWeek] || {};
      const nextPlan = typeof updater === "function" ? updater(cur) : updater;
      return { ...prev, [activeWeek]: nextPlan };
    });
  };
  const [inventory, setInventory] = useState([]); // [{item, qty, unit, lowAt}]
  const [checked, setChecked] = useState({});
  const [tripHidden, setTripHidden] = useState([]);  // item keys taken off for this shopping trip only
  const [extras, setExtras] = useState([]);          // [{id, text, recurring, done}] non-pantry grocery add-ons
  const [ratings, setRatings] = useState({});        // recipeId -> 1..5 stars
  const [recipeCats, setRecipeCats] = useState(["Breakfast", "Lunch", "Dinner", "Snacks"]); // customizable category names
  const [recipeCatMap, setRecipeCatMap] = useState({}); // recipeId -> [category names]
  const [catPickup, setCatPickup] = useState(null);  // recipe id "picked up" to assign to a category
  const [newCatInput, setNewCatInput] = useState("");
  const [extraInput, setExtraInput] = useState("");
  const [diet, setDiet] = useState("anything");
  const [defaultServings, setDefaultServings] = useState(4);
  const [loaded, setLoaded] = useState(false);
  const [loadOk, setLoadOk] = useState(false);   // true only after a confirmed good load — gates autosave
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState("");
  const [newInv, setNewInv] = useState({ item: "", qty: "", unit: "oz", lowAt: "" });
  const [showSuggest, setShowSuggest] = useState(false);
  const [mergeFrom, setMergeFrom] = useState(null);   // index of pantry item being merged into another
  const [pantrySearch, setPantrySearch] = useState("");
  const [viewRecipe, setViewRecipe] = useState(null);
  const [chatLog, setChatLog] = useState([]);   // [{role, content, recipes?}]
  const [chatInput, setChatInput] = useState("");
  const [chatBusy, setChatBusy] = useState(false);
  const [addingFor, setAddingFor] = useState(null); // recipe id pending slot-pick
  const [addMeal, setAddMeal] = useState("dinner");  // chosen meal type in the add flow
  const [dragDay, setDragDay] = useState(null);     // slot currently being dragged (desktop)
  const [dragOver, setDragOver] = useState(null);   // slot being hovered over (desktop)
  const [moving, setMoving] = useState(null);       // slot "picked up" via tap (works on touch + mouse)
  const [prefs, setPrefs] = useState({ diet: "anything", avoid: "", dislikes: "", notes: "" });
  const [prefsDraft, setPrefsDraft] = useState({ diet: "anything", avoid: "", dislikes: "", notes: "" });
  const [archives, setArchives] = useState([]);   // [{id, label, savedAt, plan, grocery}]
  const [savedIds, setSavedIds] = useState([]);   // recipe ids the user has saved to their library
  const [showArchives, setShowArchives] = useState(false);
  const [snackInputs, setSnackInputs] = useState({});  // { day: "text being typed" }
  const [parsing, setParsing] = useState(false);       // image parse in progress
  const [parseError, setParseError] = useState("");
  const [addingSavedFor, setAddingSavedFor] = useState(null); // {recipeId, meal} slot-pick in Recipes tab
  const [receiptParsing, setReceiptParsing] = useState(false);
  const [receiptError, setReceiptError] = useState("");
  const [receiptItems, setReceiptItems] = useState(null);     // [{item, qty, unit, include}] pending review
  const [costEstimate, setCostEstimate] = useState(null);     // total USD number
  const [costSig, setCostSig] = useState(null);               // signature of the list the estimate was for
  const [costEstimating, setCostEstimating] = useState(false);
  const [costError, setCostError] = useState("");
  const [prefsSaved, setPrefsSaved] = useState(false);
  const [prefsOpen, setPrefsOpen] = useState(false);
  const [household, setHouseholdState] = useState(() => (supabase ? getHousehold() : "local"));
  const [codeInput, setCodeInput] = useState("");
  const [showHousehold, setShowHousehold] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [editDraft, setEditDraft] = useState(null);   // editable copy of the recipe in the modal
  const [cookedSlots, setCookedSlots] = useState({}); // "day|meal" -> true once cooked (prevents double-deplete)
  const [shopMode, setShopMode] = useState(false);      // full-screen in-store shopping view
  const [shopChecked, setShopChecked] = useState({});   // checked state within shopping mode

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
    // migrate: old saves had a single `plan`; new saves have `weeks`
    if (s.weeks) {
      setWeeks({ this: migratePlan(s.weeks.this), next: migratePlan(s.weeks.next) });
    } else {
      setWeeks({ this: migratePlan(s.plan), next: {} });
    }
    setActiveWeek(s.activeWeek === "next" ? "next" : "this");
    setInventory(s.inventory || []);
    setChecked(s.checked || {});
    if (s.defaultServings) setDefaultServings(s.defaultServings);
    setPrefs((p) => ({ ...p, ...(s.prefs || {}) }));
    if (s.prefs) setPrefsDraft((p) => ({ ...p, ...s.prefs }));
    setArchives(s.archives || []);
    setSavedIds(s.savedIds || []);
    setExtras(s.extras || []);
    setRatings(s.ratings || {});
    if (s.recipeCats) setRecipeCats(s.recipeCats);
    setRecipeCatMap(s.recipeCatMap || {});
  }

  useEffect(() => {
    (async () => {
      setLoaded(false);
      setLoadOk(false);
      if (supabase) {
        if (!household) { setLoaded(true); return; } // wait for a code
        try {
          const { data, error } = await supabase.from("meal_planner").select("*").eq("device_id", household).maybeSingle();
          if (error) {
            // fetch failed — do NOT mark load OK, so we never overwrite good data with empty state
            setLoaded(true);
            return;
          }
          if (data?.state) applyState(data.state);
          setLoadOk(true);   // a clean fetch (even if the row is new/empty) — safe to save now
        } catch (e) {
          setLoaded(true);
          return;            // network error: leave loadOk false so autosave stays blocked
        }
      } else {
        const raw = localStorage.getItem("wt_state");
        if (raw) applyState(JSON.parse(raw));
        setLoadOk(true);
      }
      setLoaded(true);
    })();
  }, [household]);

  // ---- Persist on any change ----------------------------------------------
  useEffect(() => {
    if (!loaded || !loadOk) return;   // never save until we've confirmed a good load
    const state = { recipes, weeks, activeWeek, inventory, checked, defaultServings, prefs, archives, savedIds, extras, ratings, recipeCats, recipeCatMap };
    if (supabase) {
      if (!household) return;
      supabase.from("meal_planner").upsert({ device_id: household, state, updated_at: new Date().toISOString() }).then(() => {});
    } else {
      localStorage.setItem("wt_state", JSON.stringify(state));
    }
  }, [recipes, weeks, activeWeek, inventory, checked, defaultServings, prefs, archives, savedIds, extras, ratings, recipeCats, recipeCatMap, loaded, loadOk, household]);

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

  // Tap-to-move: works on touch and mouse. Tap a filled slot's handle to pick it
  // up, then tap any slot to move it there. Tapping the same slot cancels.
  function tapSlot(slotKey, hasMeal) {
    if (moving) {
      if (moving === slotKey) { setMoving(null); return; }  // tapped same -> cancel
      moveSlot(moving, slotKey);
      setMoving(null);
    } else if (hasMeal) {
      setMoving(slotKey);   // pick up
    }
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
    setRecipes(SEED_RECIPES); setWeeks({ this: {}, next: {} }); setActiveWeek("this"); setInventory([]); setChecked({});
    setPrefs({ diet: "anything", avoid: "", dislikes: "", notes: "" });
    setPrefsDraft({ diet: "anything", avoid: "", dislikes: "", notes: "" });
    setShowHousehold(false);
  }

  // Force the PWA to fetch the latest deploy: clear caches, drop the service
  // worker, and hard-reload. Fixes "new features aren't showing" on the app.
  async function forceUpdate() {
    setUpdating(true);
    try {
      if ("caches" in window) {
        const names = await caches.keys();
        await Promise.all(names.map((n) => caches.delete(n)));
      }
      if ("serviceWorker" in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map((r) => r.unregister()));
      }
    } catch (e) {
      // even if clearing fails, still try a hard reload
    }
    window.location.reload();
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
    // Meal-prep model: each distinct recipe is cooked ONCE per week (one batch
    // at its own serving size), no matter how many days/slots it appears on.
    // So we collect the unique set of planned recipe ids, then add each recipe's
    // ingredients a single time.
    const usedRecipeIds = new Set();
    DAYS.forEach((day) => {
      const dayPlan = plan[day];
      if (!dayPlan) return;
      MEALS.forEach((m) => {
        const entry = dayPlan[m.id];
        if (entry?.recipeId) usedRecipeIds.add(entry.recipeId);
      });
    });

    const map = {};
    usedRecipeIds.forEach((rid) => {
      const r = recipes.find((x) => x.id === rid);
      if (!r) return;
      const scale = defaultServings / (r.servings || 1);   // match the popup's scaling
      r.ingredients.forEach((ing) => {
        const key = norm(ing.item) + "|" + ing.unit;
        if (!map[key]) map[key] = { ...ing, qty: 0 };
        map[key].qty += ing.qty * scale;   // one batch, scaled to the chosen serving size
      });
    });
    return Object.values(map);
  }, [plan, recipes, defaultServings]);

  // How many day-slots each recipe fills this week (for the "cooked once, eaten N days" note)
  const recipeUsage = useMemo(() => {
    const counts = {};
    DAYS.forEach((day) => {
      MEALS.forEach((m) => {
        const rid = plan[day]?.[m.id]?.recipeId;
        if (rid) counts[rid] = (counts[rid] || 0) + 1;
      });
    });
    return counts;
  }, [plan]);

  // Assign a stable color to each recipe that appears on more than one slot,
  // so matching (batch-shared) meals are easy to spot at a glance.
  const recipeColors = useMemo(() => {
    const palette = ["#C67B4E", "#6B7B5A", "#4E7A8A", "#A6584F", "#8A6D3B", "#7A5C86", "#4F8A6B", "#B5793F"];
    // order recipe ids by first appearance in the week for consistent coloring
    const order = [];
    DAYS.forEach((day) => MEALS.forEach((m) => {
      const rid = plan[day]?.[m.id]?.recipeId;
      if (rid && !order.includes(rid)) order.push(rid);
    }));
    const map = {};
    let i = 0;
    order.forEach((rid) => {
      if (recipeUsage[rid] > 1) { map[rid] = palette[i % palette.length]; i++; }
    });
    return map;
  }, [plan, recipeUsage]);

  // Merged autocomplete index: built-in staples + items from recipes + past pantry entries.
  const itemIndex = useMemo(() => {
    const map = {};   // name -> {unit, cat}
    // 1) staples (lowest priority, filled first so others can override the unit)
    STAPLES.forEach(([name, unit, cat]) => { map[name.toLowerCase()] = { name, unit, cat }; });
    // 2) recipe ingredients (so pantry names match recipe names exactly)
    recipes.forEach((r) => (r.ingredients || []).forEach((ing) => {
      const key = norm(ing.item);
      if (key && !map[key]) map[key] = { name: ing.item, unit: ing.unit || "", cat: ing.cat || "pantry" };
    }));
    // 3) items already in the pantry (remembered)
    inventory.forEach((inv) => {
      const key = norm(inv.item);
      if (key && !map[key]) map[key] = { name: inv.item, unit: inv.unit || "", cat: "pantry" };
    });
    return Object.values(map).sort((a, b) => a.name.localeCompare(b.name));
  }, [recipes, inventory]);

  // Suggestions for the current pantry-input text.
  const itemSuggestions = useMemo(() => {
    const q = norm(newInv.item);
    if (!q) return [];
    const starts = [], contains = [];
    for (const it of itemIndex) {
      const n = it.name.toLowerCase();
      if (n === q) continue;
      if (n.startsWith(q)) starts.push(it);
      else if (n.includes(q)) contains.push(it);
      if (starts.length >= 8) break;
    }
    return [...starts, ...contains].slice(0, 8);
  }, [newInv.item, itemIndex]);

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

    // Remove any items the user "took off" for this trip.
    if (tripHidden.length) {
      Object.keys(byCat).forEach((cat) => {
        byCat[cat] = byCat[cat].filter((n) => !tripHidden.includes(norm(n.item) + "|" + (n.unit || "")));
        if (!byCat[cat].length) delete byCat[cat];
      });
    }

    return byCat;
  }, [aggregated, inventory, plan, tripHidden]);

  const totalNeeded = Object.values(groceryList).reduce((a, arr) => a + arr.length, 0);
  const lowStock = inventory.filter((inv) => inv.lowAt && parseFloat(inv.qty) <= parseFloat(inv.lowAt));

  // Combined shopping list for in-store mode: grocery items + extras + low-stock staples.
  const shoppingItems = useMemo(() => {
    const out = [];
    CAT_ORDER.forEach((cat) => {
      (groceryList[cat] || []).forEach((n) => {
        out.push({ key: "g:" + norm(n.item) + (n.unit || ""), label: n.isSnack ? n.item : `${fmtGrocery(n.needQty, n.unit)} ${n.item}`, group: CAT_LABEL[cat] });
      });
    });
    extras.forEach((x) => out.push({ key: "x:" + x.id, label: x.text, group: "Extras" }));
    lowStock.forEach((inv) => out.push({ key: "l:" + norm(inv.item), label: `${inv.item} (running low)`, group: "Restock" }));
    return out;
  }, [groceryList, extras, lowStock]);

  // ---- Inventory ops ------------------------------------------------------
  function addInventory() {
    if (!newInv.item.trim()) return;
    const item = newInv.item.trim();
    const unit = newInv.unit.trim();
    const addQty = parseFloat(newInv.qty) || (newInv.qty === "" ? 1 : 0);
    setInventory((prev) => {
      // merge into an existing row with the same name AND same unit
      const idx = prev.findIndex((inv) => norm(inv.item) === norm(item) && (inv.unit || "") === unit);
      if (idx >= 0) {
        const next = [...prev];
        const cur = parseFloat(next[idx].qty) || 0;
        next[idx] = {
          ...next[idx],
          qty: String(Math.round((cur + addQty) * 100) / 100),
          // keep an existing low-at, or set it if this add specifies one
          lowAt: next[idx].lowAt || newInv.lowAt.trim(),
        };
        return next;
      }
      return [...prev, { item, qty: newInv.qty || "1", unit, lowAt: newInv.lowAt.trim() }];
    });
    setNewInv({ item: "", qty: "", unit: "oz", lowAt: "" });
    setShowSuggest(false);
  }
  function pickSuggestion(it) {
    // Fill the item name and a sensible default unit; keep qty/lowAt as-is.
    setNewInv((prev) => ({ ...prev, item: it.name, unit: it.unit || prev.unit }));
    setShowSuggest(false);
  }

  // ---- Receipt scanning --------------------------------------------------
  async function parseReceiptFile(file) {
    if (!file) return;
    setReceiptError("");
    setReceiptItems(null);
    setReceiptParsing(true);
    try {
      const { base64, mediaType } = await fileToCompressedBase64(file);
      const resp = await fetch("/.netlify/functions/parse-receipt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageBase64: base64, mediaType }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || "Couldn't read that receipt");
      const items = (data.items || []).map((it) => ({ ...it, include: true }));
      if (!items.length) throw new Error("No food items found on that receipt");
      setReceiptItems(items);
    } catch (e) {
      setReceiptError(String(e.message || e));
    } finally {
      setReceiptParsing(false);
    }
  }

  function toggleReceiptItem(idx) {
    setReceiptItems((prev) => prev.map((it, i) => (i === idx ? { ...it, include: !it.include } : it)));
  }
  function editReceiptItem(idx, field, value) {
    setReceiptItems((prev) => prev.map((it, i) => (i === idx ? { ...it, [field]: value } : it)));
  }
  function cancelReceipt() {
    setReceiptItems(null);
    setReceiptError("");
  }
  function confirmReceipt() {
    const chosen = (receiptItems || []).filter((it) => it.include && it.item.trim());
    if (!chosen.length) { setReceiptItems(null); return; }
    setInventory((prev) => {
      const next = [...prev];
      chosen.forEach((it) => {
        // merge into an existing pantry row with the same name AND same unit
        const idx = next.findIndex((inv) => norm(inv.item) === norm(it.item) && (inv.unit || "") === (it.unit || ""));
        if (idx >= 0) {
          const cur = parseFloat(next[idx].qty) || 0;
          const add = parseFloat(it.qty) || 0;
          next[idx] = { ...next[idx], qty: String(Math.round((cur + add) * 100) / 100) };
        } else {
          next.push({ item: it.item.trim(), qty: String(it.qty || 1), unit: it.unit || "", lowAt: "" });
        }
      });
      return next;
    });
    setReceiptItems(null);
  }

  function adjustInv(idx, delta) {
    const next = [...inventory];
    const cur = parseFloat(next[idx].qty) || 0;
    next[idx] = { ...next[idx], qty: String(Math.max(0, Math.round((cur + delta) * 100) / 100)) };
    setInventory(next);
  }
  function removeInventory(idx) { setInventory(inventory.filter((_, i) => i !== idx)); }

  // Manually merge pantry item at fromIdx INTO the item at intoIdx, then remove the source.
  // Combines quantities, converting units when both are the same measurement type.
  function mergeInventory(fromIdx, intoIdx) {
    if (fromIdx === intoIdx) { setMergeFrom(null); return; }
    setInventory((prev) => {
      const from = prev[fromIdx];
      const into = prev[intoIdx];
      if (!from || !into) return prev;
      const fromBase = toBase(parseFloat(from.qty) || 0, from.unit);
      const intoBase = toBase(parseFloat(into.qty) || 0, into.unit);
      let newQty;
      if (fromBase.base === intoBase.base && fromBase.base !== "count") {
        // same measurement type (both weight or both volume): convert into the target's unit
        const targetUnitFactor = toBase(1, into.unit).val || 1;
        newQty = (intoBase.val + fromBase.val) / targetUnitFactor;
      } else {
        // different or countable units: just add the raw numbers, keep target's unit
        newQty = (parseFloat(into.qty) || 0) + (parseFloat(from.qty) || 0);
      }
      const merged = { ...into, qty: String(Math.round(newQty * 100) / 100), lowAt: into.lowAt || from.lowAt };
      // rebuild list: replace target, drop source
      return prev
        .map((inv, i) => (i === intoIdx ? merged : inv))
        .filter((_, i) => i !== fromIdx);
    });
    setMergeFrom(null);
  }
  function toggleCheck(key) { setChecked({ ...checked, [key]: !checked[key] }); }

  // ---- Extras: non-pantry grocery add-ons (paper towels, coffee, etc.) ----
  function addExtra(text) {
    const t = (text || "").trim();
    if (!t) return;
    setExtras((prev) => [...prev, { id: `x_${Date.now()}`, text: t, recurring: false, done: false }]);
    setExtraInput("");
  }
  function toggleExtraDone(id) {
    setExtras((prev) => prev.map((x) => (x.id === id ? { ...x, done: !x.done } : x)));
  }
  function toggleExtraRecurring(id) {
    setExtras((prev) => prev.map((x) => (x.id === id ? { ...x, recurring: !x.recurring } : x)));
  }
  function removeExtra(id) {
    setExtras((prev) => prev.filter((x) => x.id !== id));
  }

  // "Take off": you actually have this item; the pantry name just didn't match.
  // Add it to the pantry with enough quantity to cover the need (so it matches
  // and clears going forward), and hide it from THIS trip's list.
  function takeOffItem(n) {
    const already = inventory.find((inv) => norm(inv.item) === norm(n.item) && (inv.unit || "") === (n.unit || ""));
    if (!already) {
      // stock it at the needed amount (rounded up a touch) so deduction fully clears it
      const qty = n.isSnack ? 1 : Math.max(1, Math.ceil((n.needQty || 1) * 10) / 10);
      setInventory((prev) => [...prev, { item: n.item, qty: String(qty), unit: n.unit || "", lowAt: "" }]);
    }
    // hide for this trip only (resets when the plan changes / next week)
    const key = norm(n.item) + "|" + (n.unit || "");
    setTripHidden((prev) => (prev.includes(key) ? prev : [...prev, key]));
  }

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
      plan,            // snapshot of the week being archived
      grocery,
    };
    setArchives((prev) => [entry, ...prev]);
    setChecked({});
    setExtras((prev) => prev.filter((x) => x.recurring).map((x) => ({ ...x, done: false })));

    // Roll forward: if archiving "this" week, slide "next" into "this" and empty "next".
    // If archiving "next", just empty "next".
    setWeeks((prev) => {
      if (activeWeek === "this") return { this: prev.next || {}, next: {} };
      return { ...prev, next: {} };
    });
    setActiveWeek("this");
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

  // ---- Saved recipe library ----------------------------------------------
  const savedRecipes = useMemo(
    () => savedIds
      .map((id) => recipes.find((r) => r.id === id))
      .filter(Boolean)
      .sort((a, b) => (ratings[b.id] || 0) - (ratings[a.id] || 0)),   // highest rated first
    [savedIds, recipes, ratings]
  );

  function saveRecipe(recipe) {
    // ensure the recipe exists in the pool, then mark it saved
    setRecipes((prev) => (prev.find((r) => r.id === recipe.id) ? prev : [recipe, ...prev]));
    setSavedIds((prev) => (prev.includes(recipe.id) ? prev : [recipe.id, ...prev]));
  }
  function unsaveRecipe(id) {
    setSavedIds((prev) => prev.filter((x) => x !== id));
  }
  // ---- Recipe categories -------------------------------------------------
  function assignCat(recipeId, cat) {
    setRecipeCatMap((prev) => {
      const cur = prev[recipeId] || [];
      const next = cur.includes(cat) ? cur.filter((c) => c !== cat) : [...cur, cat];  // toggle
      const map = { ...prev };
      if (next.length) map[recipeId] = next; else delete map[recipeId];
      return map;
    });
  }
  function addRecipeCat(name) {
    const n = (name || "").trim();
    if (!n || recipeCats.includes(n)) return;
    setRecipeCats((prev) => [...prev, n]);
  }
  function renameRecipeCat(oldName, newName) {
    const n = (newName || "").trim();
    if (!n || (n !== oldName && recipeCats.includes(n))) return;
    setRecipeCats((prev) => prev.map((c) => (c === oldName ? n : c)));
    setRecipeCatMap((prev) => {
      const map = {};
      Object.entries(prev).forEach(([rid, cats]) => { map[rid] = cats.map((c) => (c === oldName ? n : c)); });
      return map;
    });
  }
  function removeRecipeCat(name) {
    setRecipeCats((prev) => prev.filter((c) => c !== name));
    setRecipeCatMap((prev) => {
      const map = {};
      Object.entries(prev).forEach(([rid, cats]) => {
        const kept = cats.filter((c) => c !== name);
        if (kept.length) map[rid] = kept;
      });
      return map;
    });
  }

  function setRating(id, stars) {
    setRatings((prev) => {
      const next = { ...prev };
      if (prev[id] === stars) delete next[id];   // tapping the current rating clears it
      else next[id] = stars;
      return next;
    });
  }

  // ---- Recipe editing ----------------------------------------------------
  function startEdit(recipe) {
    // deep copy so edits don't touch the live recipe until saved
    setEditDraft(JSON.parse(JSON.stringify(recipe)));
  }
  function editField(field, value) {
    setEditDraft((prev) => ({ ...prev, [field]: value }));
  }
  function editIngredient(i, field, value) {
    setEditDraft((prev) => {
      const ingredients = prev.ingredients.map((ing, idx) => (idx === i ? { ...ing, [field]: value } : ing));
      return { ...prev, ingredients };
    });
  }
  function addEditIngredient() {
    setEditDraft((prev) => ({ ...prev, ingredients: [...prev.ingredients, { item: "", qty: 1, unit: "", cat: "pantry" }] }));
  }
  function removeEditIngredient(i) {
    setEditDraft((prev) => ({ ...prev, ingredients: prev.ingredients.filter((_, idx) => idx !== i) }));
  }
  function editStep(i, value) {
    setEditDraft((prev) => ({ ...prev, steps: (prev.steps || []).map((s, idx) => (idx === i ? value : s)) }));
  }
  function addEditStep() {
    setEditDraft((prev) => ({ ...prev, steps: [...(prev.steps || []), ""] }));
  }
  function removeEditStep(i) {
    setEditDraft((prev) => ({ ...prev, steps: (prev.steps || []).filter((_, idx) => idx !== i) }));
  }
  function saveEdit() {
    const d = editDraft;
    if (!d) return;
    // clean up: coerce numbers, drop blank ingredients/steps
    const cleaned = {
      ...d,
      time: parseInt(d.time) || 0,
      servings: Math.max(1, parseInt(d.servings) || 1),
      tags: Array.isArray(d.tags) ? d.tags : String(d.tags || "").split(",").map((t) => t.trim()).filter(Boolean),
      ingredients: d.ingredients
        .filter((ing) => ing.item.trim())
        .map((ing) => ({ ...ing, item: ing.item.trim().toLowerCase(), qty: parseFloat(ing.qty) || 0 })),
      steps: (d.steps || []).map((s) => s.trim()).filter(Boolean),
    };
    setRecipes((prev) => prev.map((r) => (r.id === cleaned.id ? cleaned : r)));
    setViewRecipe(cleaned);   // keep modal open showing the saved version
    setEditDraft(null);
  }

  // ---- Cook a meal: subtract its ingredients from the pantry ----
  // Helper: all slot keys ("day|meal") currently using this recipe id.
  function slotsForRecipe(recipeId) {
    const keys = [];
    DAYS.forEach((day) => MEALS.forEach((m) => {
      if (plan[day]?.[m.id]?.recipeId === recipeId) keys.push(`${day}|${m.id}`);
    }));
    return keys;
  }

  function cookMeal(recipe, slotKey) {
    if (!recipe) return;
    if (cookedSlots[slotKey]) return;   // already cooked — don't deplete twice
    // one batch, scaled to the current default servings (matches the grocery model)
    const scale = defaultServings / (recipe.servings || 1);
    setInventory((prev) => {
      const next = prev.map((inv) => ({ ...inv }));
      recipe.ingredients.forEach((ing) => {
        const idx = next.findIndex((inv) => norm(inv.item) === norm(ing.item));
        if (idx < 0) return;                // don't have it tracked; skip
        const have = next[idx];
        const needBase = toBase(ing.qty * scale, ing.unit);
        const haveBase = toBase(parseFloat(have.qty) || 0, have.unit);
        if (needBase.base === haveBase.base && needBase.base !== "count") {
          const haveUnitFactor = toBase(1, have.unit).val || 1;
          const remaining = Math.max(0, haveBase.val - needBase.val) / haveUnitFactor;
          next[idx].qty = String(Math.round(remaining * 100) / 100);
        } else {
          const remaining = Math.max(0, (parseFloat(have.qty) || 0) - ing.qty * scale);
          next[idx].qty = String(Math.round(remaining * 100) / 100);
        }
      });
      return next;
    });
    // mark EVERY slot using this recipe as cooked (batch cooked once, eaten across days)
    const keys = slotsForRecipe(recipe.id);
    setCookedSlots((prev) => {
      const n = { ...prev };
      keys.forEach((k) => { n[k] = true; });
      return n;
    });
  }
  // Undo the "cooked" mark for this recipe across all its slots (does NOT restore pantry).
  function uncookRecipe(recipeId) {
    const keys = slotsForRecipe(recipeId);
    setCookedSlots((prev) => {
      const n = { ...prev };
      keys.forEach((k) => { delete n[k]; });
      return n;
    });
  }

  // Recipes currently used in the week that aren't yet saved (for quick "save from week")
  const weekRecipesUnsaved = useMemo(() => {
    const ids = new Set();
    DAYS.forEach((day) => MEALS.forEach((m) => {
      const rid = plan[day]?.[m.id]?.recipeId;
      if (rid && !savedIds.includes(rid)) ids.add(rid);
    }));
    return [...ids].map((id) => recipes.find((r) => r.id === id)).filter(Boolean);
  }, [plan, savedIds, recipes]);

  async function parseImageFile(file) {
    if (!file) return;
    setParseError("");
    setParsing(true);
    try {
      const { base64, mediaType } = await fileToCompressedBase64(file);
      const resp = await fetch("/.netlify/functions/parse-recipe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageBase64: base64, mediaType }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || "Couldn't read that image");
      if (data.recipe) saveRecipe(data.recipe);   // save straight to library
    } catch (e) {
      setParseError(String(e.message || e));
    } finally {
      setParsing(false);
    }
  }

  // Clear a stale cost estimate whenever the grocery list changes.
  useEffect(() => { setCostEstimate(null); setCostSig(null); }, [aggregated, plan]);
  // Reset "taken off for this trip" items when the plan changes (new trip).
  useEffect(() => { setTripHidden([]); setCookedSlots({}); }, [plan]);

  async function estimateCost() {
    setCostError("");
    // flatten the grocery list into item + qty + unit
    const items = [];
    CAT_ORDER.forEach((cat) => {
      (groceryList[cat] || []).forEach((n) => {
        items.push({ item: n.item, qty: n.isSnack ? 1 : Math.round(n.needQty * 100) / 100, unit: n.unit || "" });
      });
    });
    if (!items.length) { setCostEstimate(0); return; }
    // If we already estimated this exact list, reuse it (stable + free).
    const sig = JSON.stringify(items);
    if (costEstimate !== null && costSig === sig) return;

    setCostEstimating(true);
    try {
      const resp = await fetch("/.netlify/functions/estimate-cost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || "Couldn't estimate cost");
      const prices = data.prices || {};
      const total = Object.values(prices).reduce((a, v) => a + (parseFloat(v) || 0), 0);
      setCostEstimate(Math.round(total * 100) / 100);
      setCostSig(sig);
    } catch (e) {
      setCostError(String(e.message || e));
    } finally {
      setCostEstimating(false);
    }
  }

  function exportList() {
    let txt = "GROCERY LIST\n" + "=".repeat(30) + "\n\n";
    CAT_ORDER.forEach((cat) => {
      const arr = groceryList[cat];
      if (!arr?.length) return;
      txt += CAT_LABEL[cat].toUpperCase() + "\n";
      arr.forEach((n) => { txt += n.isSnack ? `  [ ] ${n.item}\n` : `  [ ] ${fmtGrocery(n.needQty, n.unit)} ${n.item}\n`; });
      txt += "\n";
    });
    if (extras.length) {
      txt += "EXTRAS\n";
      extras.forEach((x) => { txt += `  [ ] ${x.text}\n`; });
      txt += "\n";
    }
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

  const tabBtn = (id, label, Icon, badge) => {
    const active = tab === id;
    // On mobile, only the active tab shows its text label; inactive tabs are
    // icon + badge only, which keeps everything roomy on a narrow screen.
    const showLabel = !isMobile || active;
    return (
      <button onClick={() => setTab(id)} style={{
        display: "flex", alignItems: "center", justifyContent: "center", gap: isMobile ? 6 : 8,
        padding: isMobile ? "10px 10px" : "10px 18px", border: "none",
        flex: isMobile ? (active ? "2 1 0" : "1 1 0") : "0 0 auto",
        cursor: "pointer", borderRadius: 10, fontSize: isMobile ? 13 : 15, fontWeight: 600, transition: "all .15s",
        background: active ? C.sage : "transparent", color: active ? "#fff" : C.sub, whiteSpace: "nowrap", minWidth: 0,
      }}>
        <Icon size={isMobile ? 17 : 18} style={{ flexShrink: 0 }} />
        {showLabel && <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{label}</span>}
        {badge > 0 && <span style={{ background: active ? "rgba(255,255,255,.25)" : C.clay, color: "#fff", borderRadius: 10, padding: "1px 6px", fontSize: 11, flexShrink: 0 }}>{badge}</span>}
      </button>
    );
  };

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

  // Renders one saved-recipe card (used within each category group).
  function renderRecipeCard(r) {
    const cats = recipeCatMap[r.id] || [];
    const pickedUp = catPickup === r.id;
    return (
      <div key={r.id} style={{ background: C.cream, border: `1px solid ${pickedUp ? C.clay : C.line}`, borderRadius: 12, padding: isMobile ? "12px 14px" : "14px 16px", fontFamily: uiFont, outline: pickedUp ? `1px dashed ${C.clay}` : "none", outlineOffset: -3 }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
          <div style={{ flex: "1 1 160px" }}>
            <div style={{ fontSize: 16, fontWeight: 600, cursor: "pointer", textDecoration: "underline dotted", textUnderlineOffset: 3 }} onClick={() => setViewRecipe(r)}>{r.name}</div>
            <div style={{ fontSize: 12.5, color: C.sub, marginTop: 2 }}>{r.time} min · makes {r.servings} · {(r.tags || []).slice(0, 3).join(", ")}</div>
            <div style={{ display: "flex", alignItems: "center", gap: 2, marginTop: 6 }}>
              {[1, 2, 3, 4, 5].map((s) => (
                <button key={s} onClick={() => setRating(r.id, s)} title={`${s} star${s > 1 ? "s" : ""}`} style={{ background: "none", border: "none", cursor: "pointer", padding: 1, display: "flex" }}>
                  <Star size={17} color={C.clay} fill={(ratings[r.id] || 0) >= s ? C.clay : "none"} />
                </button>
              ))}
            </div>
            {cats.length > 0 && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 6 }}>
                {cats.map((c) => (
                  <span key={c} style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: 11, color: C.sageD, background: C.chip, borderRadius: 10, padding: "2px 8px" }}>
                    {c}
                    <button onClick={() => assignCat(r.id, c)} title={`Remove from ${c}`} style={{ background: "none", border: "none", cursor: "pointer", color: C.sub, display: "flex", padding: 0 }}><X size={11} /></button>
                  </span>
                ))}
              </div>
            )}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <button onClick={() => setCatPickup(pickedUp ? null : r.id)} title={pickedUp ? "Tap a category below to add it" : "Categorize"} style={{
              ...stepBtn(C), width: "auto", padding: "0 10px", height: 32, gap: 5, fontSize: 12, fontWeight: 600,
              background: pickedUp ? C.clay : C.cream, color: pickedUp ? "#fff" : C.sageD, borderColor: pickedUp ? C.clay : C.line,
            }}><FolderPlus size={14} /> {isMobile ? "" : "Categorize"}</button>
            <button onClick={() => setAddingSavedFor(addingSavedFor?.recipeId === r.id ? null : { recipeId: r.id, meal: (r.tags || []).includes("breakfast") ? "breakfast" : (r.tags || []).includes("lunch") ? "lunch" : "dinner" })} style={{
              display: "flex", alignItems: "center", gap: 6, padding: "7px 12px", background: C.sage, color: "#fff",
              border: "none", borderRadius: 9, fontSize: 13, fontWeight: 600, cursor: "pointer",
            }}><CalendarPlus size={14} /> {isMobile ? "Add" : "Add to plan"}</button>
            <button onClick={() => unsaveRecipe(r.id)} title="Remove from library" style={{ background: "none", border: "none", cursor: "pointer", color: C.sub, display: "flex", padding: 4 }}>
              <Trash2 size={17} />
            </button>
          </div>
        </div>

        {addingSavedFor?.recipeId === r.id && (
          <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${C.line}` }}>
            <div style={{ fontSize: 12, color: C.sub, marginBottom: 6 }}>Which meal?</div>
            <div style={{ display: "flex", gap: 6, marginBottom: 10, flexWrap: "wrap" }}>
              {MEALS.map((mm) => (
                <button key={mm.id} onClick={() => setAddingSavedFor({ recipeId: r.id, meal: mm.id })} style={{
                  padding: "5px 12px", borderRadius: 8, fontSize: 12, cursor: "pointer", fontWeight: 500,
                  border: `1px solid ${addingSavedFor.meal === mm.id ? C.sage : C.line}`,
                  background: addingSavedFor.meal === mm.id ? C.sage : C.cream, color: addingSavedFor.meal === mm.id ? "#fff" : C.ink,
                }}>{mm.label}</button>
              ))}
            </div>
            <div style={{ fontSize: 12, color: C.sub, marginBottom: 6 }}>Add to which day?</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {DAYS.map((d) => (
                <button key={d} onClick={() => { addRecipeToSlot(r, d, addingSavedFor.meal); setAddingSavedFor(null); setTab("plan"); }} style={{ padding: "5px 10px", borderRadius: 8, border: `1px solid ${C.line}`, background: C.cream, fontSize: 12, cursor: "pointer" }}>{d.slice(0, 3)}</button>
              ))}
              <button onClick={() => setAddingSavedFor(null)} style={{ padding: "5px 10px", borderRadius: 8, border: "none", background: "transparent", color: C.sub, fontSize: 12, cursor: "pointer" }}>cancel</button>
            </div>
          </div>
        )}
      </div>
    );
  }

  if (!loaded) return <div style={{ padding: 40, fontFamily: uiFont, color: "#7A7264" }}>Loading your kitchen…</div>;

  const loadFailed = supabase && household && loaded && !loadOk;

  return (
    <div style={{ fontFamily: "Georgia, serif", background: C.bg, minHeight: "100vh", color: C.ink }}>
      <div style={{ maxWidth: 900, margin: "0 auto", padding: isMobile ? "18px 14px 48px" : "28px 20px 60px" }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 6, flexWrap: "wrap" }}>
          <div style={{ background: C.sage, borderRadius: 12, padding: isMobile ? 8 : 10, display: "flex" }}><Utensils size={isMobile ? 22 : 26} color="#fff" /></div>
          <div>
            <h1 style={{ margin: 0, fontSize: isMobile ? 24 : 30, letterSpacing: "-0.5px" }}>WeeklyForkast</h1>
            <p style={{ margin: 0, color: C.sub, fontFamily: uiFont, fontSize: isMobile ? 13 : 14 }}>Plan the week, shop the gaps.</p>
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
                <div style={{ position: "absolute", right: 0, top: "calc(100% + 6px)", background: C.cream, border: `1px solid ${C.line}`, borderRadius: 12, padding: 14, width: "min(260px, 80vw)", zIndex: 30, boxShadow: "0 8px 24px rgba(43,38,32,.12)" }}>
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
                  <div style={{ borderTop: `1px solid ${C.line}`, margin: "10px 0 0", paddingTop: 10 }}>
                    <button onClick={forceUpdate} disabled={updating} style={{
                      width: "100%", padding: "9px", background: C.clay, color: "#fff", border: "none", borderRadius: 8,
                      fontSize: 13, fontWeight: 600, cursor: updating ? "wait" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                    }}>
                      <RefreshCw size={14} /> {updating ? "Updating…" : "Update app to latest"}
                    </button>
                    <div style={{ fontSize: 11, color: C.sub, marginTop: 6, lineHeight: 1.4 }}>Use this if new features aren't showing up.</div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Load-failed banner — data is safe, just couldn't fetch */}
        {loadFailed && (
          <div style={{ display: "flex", alignItems: "center", gap: 10, background: "#FBE9E7", border: "1px solid #B4442E", borderRadius: 12, padding: "12px 16px", margin: "18px 0", fontFamily: uiFont, fontSize: 14, flexWrap: "wrap" }}>
            <AlertTriangle size={18} color="#B4442E" />
            <span style={{ flex: 1 }}>Couldn't load your saved data (connection issue). Your data is safe — nothing has been changed or saved over. Reload to try again.</span>
            <button onClick={() => window.location.reload()} style={{ padding: "6px 14px", background: "#B4442E", color: "#fff", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>Reload</button>
          </div>
        )}

        {/* Low-stock banner */}
        {lowStock.length > 0 && (
          <div style={{ display: "flex", alignItems: "center", gap: 10, background: "#FBF1DC", border: `1px solid ${C.amber}`, borderRadius: 12, padding: "12px 16px", margin: "18px 0", fontFamily: uiFont, fontSize: 14 }}>
            <AlertTriangle size={18} color={C.amber} />
            <span>Running low: <strong>{lowStock.map((l) => l.item).join(", ")}</strong></span>
          </div>
        )}

        {/* Tabs */}
        <div style={{ display: "flex", gap: isMobile ? 4 : 6, background: C.chip, padding: isMobile ? 4 : 6, borderRadius: 14, margin: isMobile ? "16px 0" : "22px 0", fontFamily: uiFont }}>
          {tabBtn("plan", isMobile ? "Plan" : "Meal Plan", Calendar)}
          {tabBtn("grocery", isMobile ? "Grocery" : "Grocery List", ShoppingCart, totalNeeded)}
          {tabBtn("recipes", "Recipes", BookOpen, savedIds.length)}
          {tabBtn("inventory", "Pantry", Package, inventory.length)}
        </div>

        {/* ---------------- PLAN ---------------- */}
        {tab === "plan" && (
          <div>
            {/* Week toggle */}
            <div style={{ display: "flex", gap: 6, background: C.chip, padding: 4, borderRadius: 12, marginBottom: 14, fontFamily: uiFont }}>
              {[{ id: "this", label: "This week" }, { id: "next", label: "Next week" }].map((w) => {
                const active = activeWeek === w.id;
                const count = Object.values(weeks[w.id] || {}).reduce((n, dp) => n + Object.keys(dp || {}).filter((k) => k !== "snacks").length, 0);
                return (
                  <button key={w.id} onClick={() => setActiveWeek(w.id)} style={{
                    flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 7, padding: "9px 12px", border: "none",
                    borderRadius: 9, fontSize: 14, fontWeight: 600, cursor: "pointer", transition: "all .15s",
                    background: active ? C.sage : "transparent", color: active ? "#fff" : C.sub,
                  }}>
                    {w.label}
                    {count > 0 && <span style={{ background: active ? "rgba(255,255,255,.25)" : C.line, color: active ? "#fff" : C.sub, borderRadius: 10, padding: "1px 7px", fontSize: 11 }}>{count}</span>}
                  </button>
                );
              })}
            </div>

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
                {!isMobile && <span style={{ fontSize: 12, color: C.sub, marginLeft: "auto" }}>knows your pantry & plan</span>}
              </div>

              <div style={{ maxHeight: 340, overflowY: "auto", padding: isMobile ? 12 : 16, display: "flex", flexDirection: "column", gap: 12 }}>
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
                          <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>
                            <button onClick={() => { setAddingFor(r.id); setAddMeal((r.tags || []).includes("breakfast") ? "breakfast" : "dinner"); }} style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 12px", background: C.sage, color: "#fff", border: "none", borderRadius: 9, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
                              <CalendarPlus size={14} /> Add to plan
                            </button>
                            <button onClick={() => savedIds.includes(r.id) ? unsaveRecipe(r.id) : saveRecipe(r)} style={{
                              display: "flex", alignItems: "center", gap: 6, padding: "7px 12px", borderRadius: 9, fontSize: 13, fontWeight: 600, cursor: "pointer",
                              background: savedIds.includes(r.id) ? C.sage : "transparent",
                              color: savedIds.includes(r.id) ? "#fff" : C.sageD,
                              border: `1px solid ${savedIds.includes(r.id) ? C.sage : C.line}`,
                            }}>
                              <Bookmark size={14} fill={savedIds.includes(r.id) ? "#fff" : "none"} /> {savedIds.includes(r.id) ? "Saved" : "Save to Recipes"}
                            </button>
                          </div>
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
              Ask the assistant above for meals and add them to any day. To move a meal, drag it (on a computer) or tap its handle then tap another slot (on any device).
            </p>
            {moving && (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, background: "#FBF1DC", border: `1px solid ${C.clay}`, borderRadius: 10, padding: "10px 14px", marginBottom: 12, fontFamily: uiFont, fontSize: 14 }}>
                <span>Moving a meal — tap where you want it.</span>
                <button onClick={() => setMoving(null)} style={{ background: "none", border: `1px solid ${C.clay}`, color: C.clay, borderRadius: 8, padding: "4px 12px", fontSize: 13, cursor: "pointer", fontWeight: 600 }}>Cancel</button>
              </div>
            )}

            <div style={{ display: "grid", gap: 10 }}>
              {DAYS.map((day) => (
                <div key={day} style={{ background: C.cream, border: `1px solid ${C.line}`, borderRadius: 14, padding: isMobile ? "12px 12px" : "14px 18px" }}>
                  <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 10 }}>{day}</div>
                  <div style={{ display: "grid", gap: 8 }}>
                    {MEALS.map((m) => {
                      const slotKey = `${day}|${m.id}`;
                      const entry = plan[day]?.[m.id];
                      const r = entry && recipes.find((x) => x.id === entry.recipeId);
                      const isOver = dragOver === slotKey && dragDay !== slotKey;
                      const rColor = r ? recipeColors[r.id] : null;
                      const isPickedUp = moving === slotKey;
                      const isDropTarget = moving && moving !== slotKey;
                      const highlight = isOver || isDropTarget;
                      return (
                        <div
                          key={m.id}
                          onDragOver={(e) => { if (dragDay) { e.preventDefault(); setDragOver(slotKey); } }}
                          onDragLeave={() => setDragOver((k) => (k === slotKey ? null : k))}
                          onDrop={(e) => { e.preventDefault(); if (dragDay) moveSlot(dragDay, slotKey); setDragDay(null); setDragOver(null); }}
                          onClick={() => { if (moving) tapSlot(slotKey, !!r); }}
                          style={{
                            display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap",
                            background: highlight ? "#EEF2E8" : (isPickedUp ? "#FBF1DC" : (rColor ? rColor + "14" : C.bg)),
                            border: `${highlight || isPickedUp ? 2 : 1}px ${highlight ? "dashed" : "solid"} ${highlight ? C.sage : (isPickedUp ? C.clay : C.line)}`,
                            borderLeft: rColor && !highlight && !isPickedUp ? `4px solid ${rColor}` : undefined,
                            borderRadius: 10, padding: "10px 12px", transition: "background .12s",
                            cursor: isDropTarget ? "pointer" : "default",
                          }}
                        >
                          <span style={{ width: 74, flexShrink: 0, fontFamily: uiFont, fontSize: 12, fontWeight: 700, color: C.sageD, textTransform: "uppercase", letterSpacing: .5 }}>{m.label}</span>

                          {r ? (
                            <>
                              <div
                                draggable
                                onDragStart={() => setDragDay(slotKey)}
                                onDragEnd={() => { setDragDay(null); setDragOver(null); }}
                                style={{ flex: "1 1 180px", display: "flex", alignItems: "center", gap: 10, opacity: dragDay === slotKey ? .4 : 1 }}
                              >
                                <button
                                  onClick={(e) => { e.stopPropagation(); tapSlot(slotKey, true); }}
                                  title={isPickedUp ? "Tap a slot to move it here, or tap again to cancel" : "Tap to pick up, then tap another slot"}
                                  style={{ background: isPickedUp ? C.clay : "transparent", border: "none", borderRadius: 7, padding: 4, cursor: "pointer", display: "flex", flexShrink: 0, touchAction: "manipulation" }}
                                >
                                  <GripVertical size={16} color={isPickedUp ? "#fff" : C.sub} />
                                </button>
                                <div>
                                  <div style={{ fontSize: 16, cursor: "pointer", textDecoration: "underline dotted", textUnderlineOffset: 3, display: "flex", alignItems: "center", gap: 7 }} onClick={(e) => { e.stopPropagation(); setViewRecipe(r); }}>
                                    {rColor && <span style={{ width: 9, height: 9, borderRadius: "50%", background: rColor, flexShrink: 0 }} />}
                                    {r.name}
                                  </div>
                                  <div style={{ fontFamily: uiFont, fontSize: 12, color: C.sub, marginTop: 1 }}>
                                    {r.time} min · {defaultServings === (r.servings || defaultServings) ? `makes ${r.servings}` : `scaled to ${defaultServings}`}
                                    {recipeUsage[r.id] > 1 && ` · eaten ${recipeUsage[r.id]} days (1 batch)`}
                                  </div>
                                </div>
                              </div>
                              <div style={{ display: "flex", alignItems: "center", gap: 6, fontFamily: uiFont }}>
                                {(() => {
                                  const cooked = cookedSlots[slotKey];
                                  return (
                                    <button
                                      onClick={(e) => { e.stopPropagation(); cooked ? uncookRecipe(r.id) : cookMeal(r, slotKey); }}
                                      title={cooked ? "Cooked — tap to unmark (won't restore pantry)" : "Cooked it — subtract one batch from pantry (marks all days with this meal)"}
                                      style={{ ...stepBtn(C), width: "auto", padding: "0 8px", gap: 4, fontSize: 12, fontWeight: 600, color: cooked ? "#fff" : C.sageD, background: cooked ? C.sage : C.cream, borderColor: cooked ? C.sage : C.line }}
                                    >
                                      {cooked ? <><Check size={13} /> Cooked</> : <><Utensils size={13} /> Cooked</>}
                                    </button>
                                  );
                                })()}
                                <button
                                  onClick={(e) => { e.stopPropagation(); savedIds.includes(r.id) ? unsaveRecipe(r.id) : saveRecipe(r); }}
                                  title={savedIds.includes(r.id) ? "Saved to Recipes — tap to remove" : "Save to Recipes"}
                                  style={{ ...stepBtn(C), background: savedIds.includes(r.id) ? C.sage : C.cream, borderColor: savedIds.includes(r.id) ? C.sage : C.line }}
                                >
                                  <Bookmark size={14} color={savedIds.includes(r.id) ? "#fff" : C.ink} fill={savedIds.includes(r.id) ? "#fff" : "none"} />
                                </button>
                                <button onClick={(e) => { e.stopPropagation(); clearSlot(day, m.id); }} title="Remove meal" style={stepBtn(C)}><X size={14} /></button>
                              </div>
                            </>
                          ) : (
                            <span style={{ flex: "1 1 180px", color: isDropTarget ? C.sageD : C.sub, fontStyle: "italic", fontFamily: uiFont, fontSize: 13.5 }}>
                              {highlight ? "Tap or drop here" : "Empty — add from chat"}
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
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 8, paddingLeft: isMobile ? 0 : 82 }}>
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
                  <Archive size={16} /> Archive {activeWeek === "this" ? "this week" : "next week"}
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

        {/* ---------------- RECIPES ---------------- */}
        {tab === "recipes" && (
          <div>
            {/* Add from image */}
            <div style={{ background: C.cream, border: `1px solid ${C.line}`, borderRadius: 14, padding: isMobile ? 14 : 18, marginBottom: 18, fontFamily: uiFont }}>
              <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4, display: "flex", alignItems: "center", gap: 8 }}>
                <Camera size={17} color={C.sageD} /> Add a recipe from a photo
              </div>
              <p style={{ fontSize: 13, color: C.sub, margin: "0 0 12px" }}>
                Snap or upload a photo of a recipe card, cookbook page, or screenshot — it'll be read and saved to your library.
              </p>
              <label style={{
                display: "inline-flex", alignItems: "center", gap: 8, padding: "10px 18px", borderRadius: 10,
                background: parsing ? C.line : C.clay, color: parsing ? C.sub : "#fff", fontSize: 14, fontWeight: 600,
                cursor: parsing ? "default" : "pointer",
              }}>
                <Camera size={16} /> {parsing ? "Reading recipe…" : "Choose or take a photo"}
                <input type="file" accept="image/*" disabled={parsing}
                  onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; parseImageFile(f); }}
                  style={{ display: "none" }} />
              </label>
              {parseError && <div style={{ color: "#B4442E", fontSize: 13, marginTop: 10 }}>Couldn't read that image: {parseError}</div>}
            </div>

            {/* Save from this week */}
            {weekRecipesUnsaved.length > 0 && (
              <div style={{ marginBottom: 18, fontFamily: uiFont }}>
                <h3 style={{ fontSize: 12, letterSpacing: 1, textTransform: "uppercase", color: C.sageD, marginBottom: 8 }}>In this week — not yet saved</h3>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {weekRecipesUnsaved.map((r) => (
                    <button key={r.id} onClick={() => saveRecipe(r)} style={{
                      display: "flex", alignItems: "center", gap: 6, padding: "7px 12px", borderRadius: 20,
                      border: `1px solid ${C.line}`, background: C.cream, color: C.ink, fontSize: 13, cursor: "pointer",
                    }}>
                      <Plus size={13} color={C.sage} /> {r.name}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Saved library, grouped by category */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8, marginBottom: 8 }}>
              <h3 style={{ fontFamily: uiFont, fontSize: 12, letterSpacing: 1, textTransform: "uppercase", color: C.sageD, margin: 0 }}>
                Saved recipes ({savedRecipes.length})
              </h3>
            </div>

            {catPickup && (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, background: "#FBF1DC", border: `1px solid ${C.clay}`, borderRadius: 10, padding: "10px 14px", marginBottom: 12, fontFamily: uiFont, fontSize: 14 }}>
                <span>Categorizing — tap a category heading below to add/remove it.</span>
                <button onClick={() => setCatPickup(null)} style={{ background: "none", border: `1px solid ${C.clay}`, color: C.clay, borderRadius: 8, padding: "4px 12px", fontSize: 13, cursor: "pointer", fontWeight: 600 }}>Done</button>
              </div>
            )}

            {savedRecipes.length === 0 ? (
              <Empty C={C} icon={BookOpen} title="No saved recipes yet." sub="Add a photo above, or save recipes from your week." />
            ) : (() => {
              const uncategorized = savedRecipes.filter((r) => !(recipeCatMap[r.id]?.length));
              return (
                <div style={{ display: "grid", gap: 20 }}>
                  {recipeCats.map((cat) => {
                    const inCat = savedRecipes.filter((r) => (recipeCatMap[r.id] || []).includes(cat));
                    return (
                      <div key={cat}>
                        <div
                          onClick={() => { if (catPickup) assignCat(catPickup, cat); }}
                          style={{
                            display: "flex", alignItems: "center", gap: 8, marginBottom: 8, fontFamily: uiFont,
                            cursor: catPickup ? "pointer" : "default",
                            background: catPickup ? "#EEF2E8" : "transparent", border: catPickup ? `1px dashed ${C.sage}` : "1px solid transparent",
                            borderRadius: 8, padding: catPickup ? "6px 10px" : "0",
                          }}>
                          <span style={{ fontSize: 14, fontWeight: 700, color: C.ink }}>{cat}</span>
                          <span style={{ fontSize: 12, color: C.sub }}>({inCat.length})</span>
                          {catPickup && <span style={{ fontSize: 12, color: C.sageD, marginLeft: "auto" }}>tap to {(recipeCatMap[catPickup] || []).includes(cat) ? "remove" : "add"}</span>}
                          {!catPickup && (
                            <div style={{ marginLeft: "auto", display: "flex", gap: 4 }}>
                              <button onClick={() => { const n = prompt(`Rename "${cat}" to:`, cat); if (n) renameRecipeCat(cat, n); }} title="Rename category" style={{ background: "none", border: "none", cursor: "pointer", color: C.sub, display: "flex", padding: 2 }}><Pencil size={13} /></button>
                              <button onClick={() => { if (confirm(`Remove the "${cat}" category? Recipes stay saved, just uncategorized from it.`)) removeRecipeCat(cat); }} title="Remove category" style={{ background: "none", border: "none", cursor: "pointer", color: C.sub, display: "flex", padding: 2 }}><X size={14} /></button>
                            </div>
                          )}
                        </div>
                        {inCat.length > 0 ? (
                          <div style={{ display: "grid", gap: 10 }}>{inCat.map(renderRecipeCard)}</div>
                        ) : (
                          <div style={{ fontFamily: uiFont, fontSize: 13, color: C.sub, fontStyle: "italic", paddingLeft: 2 }}>No recipes here yet.</div>
                        )}
                      </div>
                    );
                  })}

                  {/* Add a new category */}
                  <div style={{ display: "flex", gap: 8, fontFamily: uiFont }}>
                    <input
                      value={newCatInput}
                      onChange={(e) => setNewCatInput(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") { addRecipeCat(newCatInput); setNewCatInput(""); } }}
                      placeholder="New category…"
                      style={{ flex: "0 1 200px", padding: "9px 12px", borderRadius: 9, border: `1px solid ${C.line}`, fontSize: 14, background: C.cream }}
                    />
                    <button onClick={() => { addRecipeCat(newCatInput); setNewCatInput(""); }} disabled={!newCatInput.trim()} style={{
                      display: "flex", alignItems: "center", gap: 5, padding: "9px 14px", borderRadius: 9, border: "none",
                      background: newCatInput.trim() ? C.sage : C.line, color: newCatInput.trim() ? "#fff" : C.sub, fontSize: 14, fontWeight: 600, cursor: newCatInput.trim() ? "pointer" : "default",
                    }}><Plus size={15} /> Add category</button>
                  </div>

                  {/* Uncategorized */}
                  {uncategorized.length > 0 && (
                    <div>
                      <div style={{ fontFamily: uiFont, fontSize: 14, fontWeight: 700, color: C.sub, marginBottom: 8 }}>Uncategorized <span style={{ fontWeight: 400, fontSize: 12 }}>({uncategorized.length})</span></div>
                      <div style={{ display: "grid", gap: 10 }}>{uncategorized.map(renderRecipeCard)}</div>
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
        )}

        {/* ---------------- GROCERY ---------------- */}
        {tab === "grocery" && (
          <div>
            {totalNeeded === 0 ? (
              <div style={{ textAlign: "center", padding: "40px 20px 24px", color: C.sub, fontFamily: uiFont }}>
                <ShoppingCart size={40} style={{ opacity: .4 }} />
                <p style={{ fontSize: 16, marginBottom: 4 }}>Nothing from your recipes to buy yet.</p>
                <p style={{ fontSize: 14, marginTop: 0 }}>Plan some meals, or add extras below.</p>
              </div>
            ) : (
              <>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, fontFamily: uiFont, flexWrap: "wrap", gap: 10 }}>
                  <span style={{ fontSize: 14, color: C.sub }}>{totalNeeded} items · each recipe once, scaled to {defaultServings} servings · pantry deducted</span>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button onClick={() => { setShopChecked({}); setShopMode(true); }} style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 16px", background: C.clay, color: "#fff", border: "none", borderRadius: 10, cursor: "pointer", fontSize: 14, fontWeight: 600 }}>
                      <ShoppingCart size={16} /> Shop
                    </button>
                    <button onClick={estimateCost} disabled={costEstimating} style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 16px", background: C.cream, color: C.ink, border: `1px solid ${C.line}`, borderRadius: 10, cursor: costEstimating ? "wait" : "pointer", fontSize: 14, fontWeight: 600, opacity: costEstimating ? .7 : 1 }}>
                      <DollarSign size={16} /> {costEstimating ? "Estimating…" : "Estimate cost"}
                    </button>
                    <button onClick={exportList} style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 16px", background: C.sage, color: "#fff", border: "none", borderRadius: 10, cursor: "pointer", fontSize: 14, fontWeight: 600 }}>
                      <Download size={16} /> Export
                    </button>
                  </div>
                </div>
                {costError && <div style={{ fontFamily: uiFont, fontSize: 13, color: "#B4442E", marginBottom: 14 }}>Couldn't estimate: {costError}</div>}
                {costEstimate !== null && (
                  <div style={{ display: "flex", alignItems: "baseline", gap: 10, background: "#F6F8F3", border: `1px solid ${C.sage}`, borderRadius: 12, padding: "12px 16px", marginBottom: 18, fontFamily: uiFont, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 22, fontWeight: 700, color: C.sageD }}>≈ ${costEstimate.toFixed(2)}</span>
                    <span style={{ fontSize: 12.5, color: C.sub }}>rough estimate · average US prices, not your store or current sales</span>
                  </div>
                )}
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
                              <span style={{ flex: 1, fontFamily: uiFont, fontSize: 15, textDecoration: done ? "line-through" : "none", color: done ? C.sub : C.ink }}>
                                {n.isSnack ? n.item : <><strong style={{ fontWeight: 600 }}>{fmtGrocery(n.needQty, n.unit)}</strong> {n.item}</>}
                              </span>
                              <button onClick={(e) => { e.stopPropagation(); takeOffItem(n); }} title="I already have this — take it off and add to pantry" style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: 4, padding: "4px 10px", background: "transparent", border: `1px solid ${C.line}`, borderRadius: 14, color: C.sub, fontSize: 12, fontFamily: uiFont, cursor: "pointer", fontWeight: 600 }}>
                                <Check size={12} /> have it
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </>
            )}

            {/* Extras — non-pantry add-ons */}
            <div style={{ marginBottom: 22 }}>
              <h3 style={{ fontFamily: uiFont, fontSize: 12, letterSpacing: 1, textTransform: "uppercase", color: C.sageD, marginBottom: 8 }}>Extras</h3>
              {extras.length > 0 && (
                <div style={{ background: C.cream, border: `1px solid ${C.line}`, borderRadius: 12, overflow: "hidden", marginBottom: 10 }}>
                  {extras.map((x, i) => (
                    <div key={x.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", borderTop: i ? `1px solid ${C.line}` : "none" }}>
                      <div onClick={() => toggleExtraDone(x.id)} style={{ width: 22, height: 22, borderRadius: 6, flexShrink: 0, cursor: "pointer", border: `2px solid ${x.done ? C.sage : C.line}`, background: x.done ? C.sage : "transparent", display: "flex", alignItems: "center", justifyContent: "center" }}>{x.done && <Check size={14} color="#fff" />}</div>
                      <span onClick={() => toggleExtraDone(x.id)} style={{ flex: 1, fontFamily: uiFont, fontSize: 15, cursor: "pointer", textDecoration: x.done ? "line-through" : "none", color: x.done ? C.sub : C.ink }}>{x.text}</span>
                      <button onClick={() => toggleExtraRecurring(x.id)} title={x.recurring ? "Recurring — kept each week. Tap to make one-time." : "One-time — clears next week. Tap to keep weekly."} style={{
                        flexShrink: 0, display: "flex", alignItems: "center", gap: 4, padding: "4px 10px", borderRadius: 14, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: uiFont,
                        border: `1px solid ${x.recurring ? C.sage : C.line}`, background: x.recurring ? C.sage : "transparent", color: x.recurring ? "#fff" : C.sub,
                      }}>
                        <RefreshCw size={12} /> {x.recurring ? "weekly" : "one-time"}
                      </button>
                      <button onClick={() => removeExtra(x.id)} title="Remove" style={{ background: "none", border: "none", cursor: "pointer", color: C.sub, display: "flex", padding: 2, flexShrink: 0 }}><X size={16} /></button>
                    </div>
                  ))}
                </div>
              )}
              <div style={{ display: "flex", gap: 8, fontFamily: uiFont }}>
                <input
                  value={extraInput}
                  onChange={(e) => setExtraInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && addExtra(extraInput)}
                  placeholder="Add an item (e.g. paper towels, coffee)"
                  style={{ flex: 1, padding: "10px 12px", borderRadius: 9, border: `1px solid ${C.line}`, fontSize: 14, background: C.cream }}
                />
                <button onClick={() => addExtra(extraInput)} disabled={!extraInput.trim()} style={{
                  display: "flex", alignItems: "center", gap: 6, padding: "10px 16px", borderRadius: 9, border: "none",
                  background: extraInput.trim() ? C.sage : C.line, color: extraInput.trim() ? "#fff" : C.sub,
                  fontSize: 14, fontWeight: 600, cursor: extraInput.trim() ? "pointer" : "default",
                }}><Plus size={16} /> Add</button>
              </div>
            </div>
          </div>
        )}

        {/* ---------------- INVENTORY ---------------- */}
        {tab === "inventory" && (
          <div>
            <p style={{ fontFamily: uiFont, fontSize: 14, color: C.sub, marginTop: 0 }}>
              Track what's in your kitchen with amounts. Set a "low at" threshold and you'll get a heads-up when you're running out.
            </p>

            {/* Scan a receipt */}
            <div style={{ background: C.cream, border: `1px solid ${C.line}`, borderRadius: 14, padding: isMobile ? 14 : 18, marginBottom: 18, fontFamily: uiFont }}>
              <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4, display: "flex", alignItems: "center", gap: 8 }}>
                <Camera size={17} color={C.sageD} /> Scan a grocery receipt
              </div>
              <p style={{ fontSize: 13, color: C.sub, margin: "0 0 12px" }}>
                Snap a photo of your receipt — the items will be read so you can review and add them to your pantry.
              </p>
              <label style={{
                display: "inline-flex", alignItems: "center", gap: 8, padding: "10px 18px", borderRadius: 10,
                background: receiptParsing ? C.line : C.clay, color: receiptParsing ? C.sub : "#fff", fontSize: 14, fontWeight: 600,
                cursor: receiptParsing ? "default" : "pointer",
              }}>
                <Camera size={16} /> {receiptParsing ? "Reading receipt…" : "Choose or take a photo"}
                <input type="file" accept="image/*" disabled={receiptParsing}
                  onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; parseReceiptFile(f); }}
                  style={{ display: "none" }} />
              </label>
              {receiptError && <div style={{ color: "#B4442E", fontSize: 13, marginTop: 10 }}>Couldn't read that receipt: {receiptError}</div>}

              {/* Review parsed items */}
              {receiptItems && (
                <div style={{ marginTop: 16, borderTop: `1px solid ${C.line}`, paddingTop: 14 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10, flexWrap: "wrap", gap: 8 }}>
                    <span style={{ fontSize: 13, color: C.sub }}>{receiptItems.filter((i) => i.include).length} of {receiptItems.length} selected · uncheck any you don't want, edit as needed</span>
                  </div>
                  <div style={{ display: "grid", gap: 6, marginBottom: 12 }}>
                    {receiptItems.map((it, idx) => (
                      <div key={idx} style={{ display: "flex", alignItems: isMobile ? "flex-start" : "center", gap: 8, background: it.include ? C.bg : "transparent", border: `1px solid ${C.line}`, borderRadius: 9, padding: "8px 10px", opacity: it.include ? 1 : .55 }}>
                        <button onClick={() => toggleReceiptItem(idx)} style={{ width: 22, height: 22, borderRadius: 6, flexShrink: 0, marginTop: isMobile ? 2 : 0, border: `2px solid ${it.include ? C.sage : C.line}`, background: it.include ? C.sage : "transparent", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
                          {it.include && <Check size={14} color="#fff" />}
                        </button>
                        <div style={{ flex: 1, display: "flex", flexDirection: isMobile ? "column" : "row", gap: 6, minWidth: 0 }}>
                          <input value={it.item} onChange={(e) => editReceiptItem(idx, "item", e.target.value)} placeholder="item" style={{ flex: isMobile ? "1 1 auto" : "2 1 100px", width: isMobile ? "100%" : "auto", padding: "7px 9px", borderRadius: 7, border: `1px solid ${C.line}`, fontSize: 13, background: C.cream }} />
                          <div style={{ display: "flex", gap: 6 }}>
                            <input value={it.qty} onChange={(e) => editReceiptItem(idx, "qty", e.target.value)} placeholder="qty" style={{ flex: isMobile ? "1 1 0" : "0 1 50px", width: isMobile ? "auto" : undefined, padding: "7px 9px", borderRadius: 7, border: `1px solid ${C.line}`, fontSize: 13, background: C.cream, minWidth: 0 }} />
                            <select value={it.unit} onChange={(e) => editReceiptItem(idx, "unit", e.target.value)} style={{ flex: isMobile ? "1 1 0" : "0 1 74px", width: isMobile ? "auto" : undefined, padding: "7px 6px", borderRadius: 7, border: `1px solid ${C.line}`, fontSize: 13, background: C.cream, minWidth: 0 }}>
                              {["", "oz", "lb", "g", "kg", "cup", "can", "bunch", "head", "pint", "bag"].map((u) => <option key={u || "each"} value={u}>{u || "each"}</option>)}
                            </select>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button onClick={confirmReceipt} style={{ display: "flex", alignItems: "center", gap: 6, padding: "9px 16px", background: C.sage, color: "#fff", border: "none", borderRadius: 9, fontSize: 14, fontWeight: 600, cursor: "pointer" }}>
                      <Plus size={15} /> Add selected to pantry
                    </button>
                    <button onClick={cancelReceipt} style={{ padding: "9px 16px", background: "transparent", color: C.sub, border: `1px solid ${C.line}`, borderRadius: 9, fontSize: 14, cursor: "pointer" }}>Cancel</button>
                  </div>
                </div>
              )}
            </div>

            <div style={{ display: "flex", gap: 8, marginBottom: 20, fontFamily: uiFont, flexWrap: "wrap", alignItems: "center" }}>
              <div style={{ position: "relative", flex: isMobile ? "1 1 100%" : "2 1 150px" }}>
                <input
                  placeholder="Item (e.g. olive oil)"
                  value={newInv.item}
                  onChange={(e) => { setNewInv({ ...newInv, item: e.target.value }); setShowSuggest(true); }}
                  onFocus={() => setShowSuggest(true)}
                  onBlur={() => setTimeout(() => setShowSuggest(false), 150)}
                  onKeyDown={(e) => { if (e.key === "Enter") addInventory(); if (e.key === "Escape") setShowSuggest(false); }}
                  style={{ ...inp(C, "1 1 100%"), width: "100%" }}
                />
                {showSuggest && itemSuggestions.length > 0 && (
                  <div style={{ position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, background: C.cream, border: `1px solid ${C.line}`, borderRadius: 10, zIndex: 40, overflow: "hidden", boxShadow: "0 8px 24px rgba(43,38,32,.12)", maxHeight: 260, overflowY: "auto" }}>
                    {itemSuggestions.map((it) => (
                      <div key={it.name} onMouseDown={(e) => { e.preventDefault(); pickSuggestion(it); }} style={{ padding: "9px 12px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, borderBottom: `1px solid ${C.bg}` }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = C.chip)}
                        onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}>
                        <span style={{ fontSize: 14 }}>{it.name}</span>
                        <span style={{ fontSize: 11, color: C.sub }}>{CAT_LABEL[it.cat] || it.cat}{it.unit ? ` · ${it.unit}` : ""}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <input placeholder="Qty" value={newInv.qty} onChange={(e) => setNewInv({ ...newInv, qty: e.target.value })} onKeyDown={(e) => e.key === "Enter" && addInventory()} style={inp(C, isMobile ? "1 1 60px" : "0 1 60px")} />
              <select value={newInv.unit} onChange={(e) => setNewInv({ ...newInv, unit: e.target.value })} style={inp(C, isMobile ? "1 1 80px" : "0 1 90px")}>
                {["oz", "lb", "g", "kg", "cup", "tbsp", "tsp", "can", "clove", "bunch", "head", "pint", "bag", "scoop", "each"].map((u) => <option key={u} value={u === "each" ? "" : u}>{u}</option>)}
              </select>
              <input placeholder="Low at" value={newInv.lowAt} onChange={(e) => setNewInv({ ...newInv, lowAt: e.target.value })} onKeyDown={(e) => e.key === "Enter" && addInventory()} style={inp(C, isMobile ? "1 1 70px" : "0 1 70px")} title="Warn when quantity drops to this" />
              <button onClick={addInventory} style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "10px 16px", background: C.sage, color: "#fff", border: "none", borderRadius: 9, cursor: "pointer", fontSize: 14, fontWeight: 600, flex: isMobile ? "1 1 100%" : "0 0 auto" }}><Plus size={16} /> Add</button>
            </div>

            {inventory.length === 0 ? (
              <Empty C={C} icon={Package} title="Your pantry is empty." sub="Add staples like oil, rice, or spices you keep on hand." />
            ) : (
              <>
                {mergeFrom !== null && (
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, background: "#FBF1DC", border: `1px solid ${C.clay}`, borderRadius: 10, padding: "10px 14px", marginBottom: 10, fontFamily: uiFont, fontSize: 14 }}>
                    <span>Merging <strong>{inventory[mergeFrom]?.item}</strong> — tap the item to combine it into.</span>
                    <button onClick={() => setMergeFrom(null)} style={{ background: "none", border: `1px solid ${C.clay}`, color: C.clay, borderRadius: 8, padding: "4px 12px", fontSize: 13, cursor: "pointer", fontWeight: 600 }}>Cancel</button>
                  </div>
                )}
                {inventory.length > 4 && (
                  <div style={{ position: "relative", marginBottom: 10, fontFamily: uiFont }}>
                    <Search size={15} color={C.sub} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)" }} />
                    <input
                      value={pantrySearch}
                      onChange={(e) => setPantrySearch(e.target.value)}
                      placeholder="Search pantry…"
                      style={{ width: "100%", padding: "9px 12px 9px 34px", borderRadius: 9, border: `1px solid ${C.line}`, fontSize: 14, background: C.cream }}
                    />
                    {pantrySearch && (
                      <button onClick={() => setPantrySearch("")} style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: C.sub, display: "flex", padding: 4 }}><X size={15} /></button>
                    )}
                  </div>
                )}
                {(() => {
                  const q = norm(pantrySearch);
                  const shown = inventory.filter((inv) => !q || norm(inv.item).includes(q));
                  if (!shown.length) {
                    return <div style={{ fontFamily: uiFont, fontSize: 14, color: C.sub, padding: "16px 4px" }}>No pantry items match "{pantrySearch}".</div>;
                  }
                  return (
                <div style={{ background: C.cream, border: `1px solid ${C.line}`, borderRadius: 12, overflow: "hidden" }}>
                  {inventory.map((inv, i) => {
                    if (q && !norm(inv.item).includes(q)) return null;
                    const low = inv.lowAt && parseFloat(inv.qty) <= parseFloat(inv.lowAt);
                    const isMergeSource = mergeFrom === i;
                    const isMergeTarget = mergeFrom !== null && mergeFrom !== i;
                    return (
                      <div key={i}
                        onClick={() => { if (isMergeTarget) mergeInventory(mergeFrom, i); }}
                        style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", borderTop: `1px solid ${C.line}`, fontFamily: uiFont, background: isMergeSource ? "#FBF1DC" : (low ? "#FDF6E7" : "transparent"), cursor: isMergeTarget ? "pointer" : "default", outline: isMergeTarget ? `1px dashed ${C.sage}` : "none", outlineOffset: -3 }}>
                        <span style={{ flex: 1, fontSize: 15 }}>
                          <strong style={{ fontWeight: 600 }}>{inv.qty}{inv.unit ? " " + inv.unit : ""}</strong> {inv.item}
                          {low && <span style={{ color: C.amber, fontSize: 12, marginLeft: 8 }}>· low</span>}
                          {isMergeTarget && <span style={{ color: C.sageD, fontSize: 12, marginLeft: 8 }}>· tap to merge here</span>}
                        </span>
                        {mergeFrom === null && (
                          <>
                            <button onClick={() => adjustInv(i, -1)} style={stepBtn(C)}><Minus size={13} /></button>
                            <button onClick={() => adjustInv(i, 1)} style={stepBtn(C)}><Plus size={13} /></button>
                            <button onClick={() => setMergeFrom(i)} title="Merge this into another item" style={{ background: "none", border: "none", cursor: "pointer", color: C.sub, display: "flex", padding: 4 }} disabled={inventory.length < 2}><GitMerge size={16} /></button>
                            <button onClick={() => removeInventory(i)} title="Remove" style={{ background: "none", border: "none", cursor: "pointer", color: C.sub, display: "flex" }}><Trash2 size={17} /></button>
                          </>
                        )}
                        {isMergeSource && <span style={{ fontSize: 12, color: C.clay, fontWeight: 600 }}>merging…</span>}
                      </div>
                    );
                  })}
                </div>
                  );
                })()}
              </>
            )}
          </div>
        )}
      </div>

      {/* Recipe modal */}
      {viewRecipe && (() => {
        const editing = editDraft && editDraft.id === viewRecipe.id;
        const baseServings = viewRecipe.servings || 1;
        const scale = defaultServings / baseServings;
        const scaled = scale !== 1;
        const closeAll = () => { setViewRecipe(null); setEditDraft(null); };
        return (
        <div onClick={closeAll} style={{ position: "fixed", inset: 0, background: "rgba(43,38,32,.5)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20, zIndex: 50 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: C.bg, borderRadius: 16, maxWidth: 520, width: "100%", maxHeight: "85vh", overflow: "auto", padding: isMobile ? 18 : 26 }}>

            {editing ? (
              /* ---- EDIT MODE ---- */
              <div style={{ fontFamily: uiFont }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                  <span style={{ fontFamily: "Georgia, serif", fontSize: 18, fontWeight: 700 }}>Edit recipe</span>
                  <button onClick={() => setEditDraft(null)} style={{ background: "none", border: "none", cursor: "pointer", color: C.sub }}><X size={22} /></button>
                </div>

                <label style={prefLabel(C)}>Name</label>
                <input value={editDraft.name} onChange={(e) => editField("name", e.target.value)} style={{ ...inp(C, "1 1 100%"), width: "100%", marginBottom: 12 }} />

                <div style={{ display: "flex", gap: 10, marginBottom: 12 }}>
                  <div style={{ flex: 1 }}>
                    <label style={prefLabel(C)}>Time (min)</label>
                    <input value={editDraft.time} onChange={(e) => editField("time", e.target.value)} inputMode="numeric" style={{ ...inp(C, "1 1 100%"), width: "100%" }} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={prefLabel(C)}>Servings</label>
                    <input value={editDraft.servings} onChange={(e) => editField("servings", e.target.value)} inputMode="numeric" style={{ ...inp(C, "1 1 100%"), width: "100%" }} />
                  </div>
                </div>

                <label style={prefLabel(C)}>Tags (comma-separated)</label>
                <input value={Array.isArray(editDraft.tags) ? editDraft.tags.join(", ") : editDraft.tags} onChange={(e) => editField("tags", e.target.value.split(",").map((t) => t.trim()).filter(Boolean))} placeholder="dinner, quick, vegetarian" style={{ ...inp(C, "1 1 100%"), width: "100%", marginBottom: 16 }} />

                <label style={prefLabel(C)}>Ingredients</label>
                <div style={{ display: "grid", gap: 6, marginBottom: 8 }}>
                  {editDraft.ingredients.map((ing, i) => (
                    <div key={i} style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: isMobile ? "wrap" : "nowrap" }}>
                      <input value={ing.qty} onChange={(e) => editIngredient(i, "qty", e.target.value)} placeholder="qty" inputMode="decimal" style={{ ...inp(C, "0 0 auto"), width: 52, padding: "7px 8px", fontSize: 13 }} />
                      <select value={ing.unit} onChange={(e) => editIngredient(i, "unit", e.target.value)} style={{ ...inp(C, "0 0 auto"), width: 72, padding: "7px 6px", fontSize: 13 }}>
                        {["", "oz", "lb", "g", "kg", "cup", "tbsp", "tsp", "can", "clove", "bunch", "head", "pint", "bag"].map((u) => <option key={u || "each"} value={u}>{u || "each"}</option>)}
                      </select>
                      <input value={ing.item} onChange={(e) => editIngredient(i, "item", e.target.value)} placeholder="ingredient" style={{ ...inp(C, "1 1 90px"), padding: "7px 9px", fontSize: 13 }} />
                      <select value={ing.cat} onChange={(e) => editIngredient(i, "cat", e.target.value)} style={{ ...inp(C, "0 0 auto"), width: 96, padding: "7px 6px", fontSize: 12 }}>
                        {CAT_ORDER.filter((c) => c !== "snacks").map((c) => <option key={c} value={c}>{CAT_LABEL[c]}</option>)}
                      </select>
                      <button onClick={() => removeEditIngredient(i)} style={{ background: "none", border: "none", cursor: "pointer", color: C.sub, display: "flex", flexShrink: 0, padding: 2 }}><X size={15} /></button>
                    </div>
                  ))}
                </div>
                <button onClick={addEditIngredient} style={{ display: "flex", alignItems: "center", gap: 5, padding: "6px 12px", background: "transparent", border: `1px dashed ${C.line}`, borderRadius: 8, color: C.sageD, fontSize: 13, cursor: "pointer", marginBottom: 16 }}><Plus size={14} /> Add ingredient</button>

                <label style={prefLabel(C)}>Steps</label>
                <div style={{ display: "grid", gap: 6, marginBottom: 8 }}>
                  {(editDraft.steps || []).map((s, i) => (
                    <div key={i} style={{ display: "flex", gap: 6, alignItems: "flex-start" }}>
                      <span style={{ fontSize: 13, color: C.sub, marginTop: 9, flexShrink: 0 }}>{i + 1}.</span>
                      <textarea value={s} onChange={(e) => editStep(i, e.target.value)} rows={2} style={{ ...inp(C, "1 1 100%"), width: "100%", padding: "7px 9px", fontSize: 13, resize: "vertical", fontFamily: uiFont }} />
                      <button onClick={() => removeEditStep(i)} style={{ background: "none", border: "none", cursor: "pointer", color: C.sub, display: "flex", flexShrink: 0, padding: 2, marginTop: 6 }}><X size={15} /></button>
                    </div>
                  ))}
                </div>
                <button onClick={addEditStep} style={{ display: "flex", alignItems: "center", gap: 5, padding: "6px 12px", background: "transparent", border: `1px dashed ${C.line}`, borderRadius: 8, color: C.sageD, fontSize: 13, cursor: "pointer", marginBottom: 18 }}><Plus size={14} /> Add step</button>

                <div style={{ display: "flex", gap: 8 }}>
                  <button onClick={saveEdit} style={{ display: "flex", alignItems: "center", gap: 6, padding: "10px 18px", background: C.sage, color: "#fff", border: "none", borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: "pointer" }}><Check size={16} /> Save changes</button>
                  <button onClick={() => setEditDraft(null)} style={{ padding: "10px 18px", background: "transparent", color: C.sub, border: `1px solid ${C.line}`, borderRadius: 10, fontSize: 14, cursor: "pointer" }}>Cancel</button>
                </div>
              </div>
            ) : (
              /* ---- VIEW MODE ---- */
              <>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
              <h2 style={{ margin: 0, fontSize: 24 }}>{viewRecipe.name}</h2>
              <div style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
                <button onClick={() => startEdit(viewRecipe)} title="Edit recipe" style={{ background: "none", border: "none", cursor: "pointer", color: C.sageD, display: "flex", padding: 4 }}><Pencil size={19} /></button>
                <button onClick={closeAll} style={{ background: "none", border: "none", cursor: "pointer", color: C.sub, display: "flex", padding: 4 }}><X size={22} /></button>
              </div>
            </div>
            <p style={{ fontFamily: uiFont, fontSize: 13, color: C.sub }}>
              {viewRecipe.time} min · scaled to {defaultServings} {defaultServings === 1 ? "serving" : "servings"}
              {scaled && <span style={{ color: C.clay }}> (recipe makes {baseServings})</span>}
            </p>
            <h3 style={{ fontFamily: uiFont, fontSize: 12, letterSpacing: 1, textTransform: "uppercase", color: C.sageD }}>Ingredients</h3>
            <ul style={{ fontFamily: uiFont, fontSize: 14, lineHeight: 1.8, paddingLeft: 20 }}>
              {viewRecipe.ingredients.map((ing, i) => <li key={i}>{fmtQty(ing.qty * scale)}{ing.unit ? " " + ing.unit : ""} {ing.item}</li>)}
            </ul>
            {viewRecipe.steps?.length > 0 && (
              <>
                <h3 style={{ fontFamily: uiFont, fontSize: 12, letterSpacing: 1, textTransform: "uppercase", color: C.sageD }}>Steps</h3>
                <ol style={{ fontFamily: uiFont, fontSize: 14, lineHeight: 1.7, paddingLeft: 20 }}>
                  {viewRecipe.steps.map((s, i) => <li key={i}>{s}</li>)}
                </ol>
              </>
            )}
              </>
            )}
          </div>
        </div>
        );
      })()}
      {/* Shopping mode — full-screen in-store checklist */}
      {shopMode && (() => {
        const remaining = shoppingItems.filter((it) => !shopChecked[it.key]).length;
        const groups = {};
        shoppingItems.forEach((it) => { (groups[it.group] ||= []).push(it); });
        const groupOrder = [...CAT_ORDER.map((c) => CAT_LABEL[c]), "Extras", "Restock"];
        return (
          <div style={{ position: "fixed", inset: 0, background: C.bg, zIndex: 60, display: "flex", flexDirection: "column", fontFamily: uiFont }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "16px 18px", borderBottom: `1px solid ${C.line}`, background: C.cream }}>
              <div>
                <div style={{ fontSize: 18, fontWeight: 700 }}>Shopping</div>
                <div style={{ fontSize: 13, color: C.sub }}>{remaining} of {shoppingItems.length} left</div>
              </div>
              <button onClick={() => setShopMode(false)} style={{ display: "flex", alignItems: "center", gap: 6, padding: "10px 18px", background: C.sage, color: "#fff", border: "none", borderRadius: 10, fontSize: 15, fontWeight: 600, cursor: "pointer" }}>
                <Check size={17} /> Done
              </button>
            </div>
            <div style={{ flex: 1, overflowY: "auto", padding: "12px 14px 40px", maxWidth: 700, margin: "0 auto", width: "100%" }}>
              {shoppingItems.length === 0 ? (
                <div style={{ textAlign: "center", color: C.sub, padding: "60px 20px", fontSize: 16 }}>Nothing to shop for.</div>
              ) : groupOrder.filter((g) => groups[g]?.length).map((g) => (
                <div key={g} style={{ marginBottom: 18 }}>
                  <h3 style={{ fontSize: 12, letterSpacing: 1, textTransform: "uppercase", color: C.sageD, marginBottom: 6 }}>{g}</h3>
                  <div style={{ display: "grid", gap: 8 }}>
                    {groups[g].map((it) => {
                      const done = shopChecked[it.key];
                      return (
                        <button key={it.key} onClick={() => setShopChecked((p) => ({ ...p, [it.key]: !p[it.key] }))} style={{
                          display: "flex", alignItems: "center", gap: 14, padding: "16px 16px", borderRadius: 12, cursor: "pointer", textAlign: "left", width: "100%",
                          border: `1px solid ${C.line}`, background: done ? "#F0EFE8" : C.cream,
                        }}>
                          <div style={{ width: 28, height: 28, borderRadius: 8, flexShrink: 0, border: `2px solid ${done ? C.sage : C.line}`, background: done ? C.sage : "transparent", display: "flex", alignItems: "center", justifyContent: "center" }}>{done && <Check size={18} color="#fff" />}</div>
                          <span style={{ fontSize: 17, textDecoration: done ? "line-through" : "none", color: done ? C.sub : C.ink }}>{it.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })()}
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
