import React, { useState, useEffect, useMemo } from "react";
import { Calendar, ShoppingCart, Package, Plus, X, Check, Download, RefreshCw, Trash2, ChefHat, Sparkles, Minus, AlertTriangle, BookOpen } from "lucide-react";
import { supabase, getDeviceId } from "./supabase.js";

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
const CAT_ORDER = ["produce", "meat", "dairy", "bakery", "pantry"];
const CAT_LABEL = { produce: "Produce", meat: "Meat & Seafood", dairy: "Dairy & Eggs", bakery: "Bakery", pantry: "Pantry & Dry Goods" };
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
  const deviceId = useMemo(() => (supabase ? getDeviceId() : null), []);

  // ---- Load state (Supabase if configured, else localStorage) -------------
  useEffect(() => {
    (async () => {
      if (supabase) {
        const { data } = await supabase.from("meal_planner").select("*").eq("device_id", deviceId).single();
        if (data?.state) {
          const s = data.state;
          if (s.recipes) setRecipes(s.recipes);
          if (s.plan) setPlan(s.plan);
          if (s.inventory) setInventory(s.inventory);
          if (s.checked) setChecked(s.checked);
          if (s.defaultServings) setDefaultServings(s.defaultServings);
        }
      } else {
        const raw = localStorage.getItem("wt_state");
        if (raw) {
          const s = JSON.parse(raw);
          if (s.recipes) setRecipes(s.recipes);
          if (s.plan) setPlan(s.plan);
          if (s.inventory) setInventory(s.inventory);
          if (s.checked) setChecked(s.checked);
          if (s.defaultServings) setDefaultServings(s.defaultServings);
        }
      }
      setLoaded(true);
    })();
  }, [deviceId]);

  // ---- Persist on any change ----------------------------------------------
  useEffect(() => {
    if (!loaded) return;
    const state = { recipes, plan, inventory, checked, defaultServings };
    if (supabase) {
      supabase.from("meal_planner").upsert({ device_id: deviceId, state, updated_at: new Date().toISOString() }).then(() => {});
    } else {
      localStorage.setItem("wt_state", JSON.stringify(state));
    }
  }, [recipes, plan, inventory, checked, defaultServings, loaded, deviceId]);

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

  function setDay(day, recipeId) {
    const next = { ...plan };
    if (!recipeId) delete next[day];
    else next[day] = { recipeId, servings: plan[day]?.servings || defaultServings };
    setPlan(next);
  }
  function setDayServings(day, servings) {
    if (!plan[day]) return;
    setPlan({ ...plan, [day]: { ...plan[day], servings: Math.max(1, servings) } });
  }

  // ---- Aggregate ingredients (scaled by per-day servings) -----------------
  const aggregated = useMemo(() => {
    const map = {};
    DAYS.forEach((day) => {
      const entry = plan[day];
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
    return byCat;
  }, [aggregated, inventory]);

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

  function exportList() {
    let txt = "GROCERY LIST\n" + "=".repeat(30) + "\n\n";
    CAT_ORDER.forEach((cat) => {
      const arr = groceryList[cat];
      if (!arr?.length) return;
      txt += CAT_LABEL[cat].toUpperCase() + "\n";
      arr.forEach((n) => { txt += `  [ ] ${fmtQty(n.needQty)}${n.unit ? " " + n.unit : ""} ${n.item}\n`; });
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

  if (!loaded) return <div style={{ padding: 40, fontFamily: "system-ui", color: "#7A7264" }}>Loading your kitchen…</div>;

  const uiFont = "system-ui, -apple-system, sans-serif";

  return (
    <div style={{ fontFamily: "Georgia, serif", background: C.bg, minHeight: "100vh", color: C.ink }}>
      <div style={{ maxWidth: 900, margin: "0 auto", padding: "28px 20px 60px" }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 6 }}>
          <div style={{ background: C.sage, borderRadius: 12, padding: 10, display: "flex" }}><ChefHat size={26} color="#fff" /></div>
          <div>
            <h1 style={{ margin: 0, fontSize: 30, letterSpacing: "-0.5px" }}>The Weekly Table</h1>
            <p style={{ margin: 0, color: C.sub, fontFamily: uiFont, fontSize: 14 }}>Plan meals, track your pantry, shop only for what you need.</p>
          </div>
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
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center", marginBottom: 16, fontFamily: uiFont }}>
              <span style={{ fontSize: 14, color: C.sub }}>Preference:</span>
              {DIETS.map((d) => (
                <button key={d.id} onClick={() => setDiet(d.id)} style={{
                  padding: "6px 14px", borderRadius: 20, fontSize: 13, cursor: "pointer", fontWeight: 500,
                  border: `1px solid ${diet === d.id ? C.sage : C.line}`,
                  background: diet === d.id ? C.sage : C.cream, color: diet === d.id ? "#fff" : C.ink,
                }}>{d.label}</button>
              ))}
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginLeft: 8 }}>
                <span style={{ fontSize: 14, color: C.sub }}>Servings:</span>
                <button onClick={() => setDefaultServings(Math.max(1, defaultServings - 1))} style={stepBtn(C)}><Minus size={14} /></button>
                <span style={{ minWidth: 20, textAlign: "center", fontWeight: 600 }}>{defaultServings}</span>
                <button onClick={() => setDefaultServings(defaultServings + 1)} style={stepBtn(C)}><Plus size={14} /></button>
              </div>
            </div>

            <div style={{ display: "flex", gap: 10, marginBottom: 20, fontFamily: uiFont, flexWrap: "wrap" }}>
              <button onClick={() => generateRecipes(7)} disabled={generating} style={{
                display: "flex", alignItems: "center", gap: 8, padding: "10px 18px", background: C.clay,
                color: "#fff", border: "none", borderRadius: 10, cursor: generating ? "wait" : "pointer",
                fontSize: 14, fontWeight: 600, opacity: generating ? .7 : 1,
              }}>
                <Sparkles size={16} /> {generating ? "Cooking up recipes…" : "Generate New Recipes (AI)"}
              </button>
              <button onClick={generateFromExisting} style={{
                display: "flex", alignItems: "center", gap: 8, padding: "10px 18px", background: C.cream,
                color: C.ink, border: `1px solid ${C.line}`, borderRadius: 10, cursor: "pointer", fontSize: 14, fontWeight: 600,
              }}>
                <RefreshCw size={16} /> Shuffle Saved Recipes
              </button>
            </div>
            {genError && <div style={{ color: "#B4442E", fontFamily: uiFont, fontSize: 13, marginBottom: 16 }}>Couldn't generate: {genError}. Check that the Netlify function and API key are set up.</div>}

            <div style={{ display: "grid", gap: 10 }}>
              {DAYS.map((day) => {
                const entry = plan[day];
                const r = entry && recipes.find((x) => x.id === entry.recipeId);
                return (
                  <div key={day} style={{ background: C.cream, border: `1px solid ${C.line}`, borderRadius: 14, padding: "14px 18px", display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
                    <div style={{ width: 92, flexShrink: 0, fontSize: 15, fontWeight: 700 }}>{day}</div>
                    <div style={{ flex: "1 1 200px" }}>
                      {r ? (
                        <div>
                          <div style={{ fontSize: 17, cursor: "pointer", textDecoration: "underline dotted", textUnderlineOffset: 3 }} onClick={() => setViewRecipe(r)}>{r.name}</div>
                          <div style={{ fontFamily: uiFont, fontSize: 12.5, color: C.sub, marginTop: 2 }}>{r.time} min · {(r.tags || []).filter((t) => t !== "dinner").join(", ")}</div>
                        </div>
                      ) : <span style={{ color: C.sub, fontStyle: "italic" }}>No meal planned</span>}
                    </div>
                    {r && (
                      <div style={{ display: "flex", alignItems: "center", gap: 6, fontFamily: uiFont }}>
                        <button onClick={() => setDayServings(day, (entry.servings || r.servings) - 1)} style={stepBtn(C)}><Minus size={13} /></button>
                        <span style={{ fontSize: 13, minWidth: 54, textAlign: "center", color: C.sub }}>{entry.servings || r.servings} serv</span>
                        <button onClick={() => setDayServings(day, (entry.servings || r.servings) + 1)} style={stepBtn(C)}><Plus size={13} /></button>
                      </div>
                    )}
                    <select value={entry?.recipeId || ""} onChange={(e) => setDay(day, e.target.value)} style={{ fontFamily: uiFont, fontSize: 13, padding: "8px 10px", borderRadius: 8, border: `1px solid ${C.line}`, background: C.bg, color: C.ink, cursor: "pointer", maxWidth: 180 }}>
                      <option value="">— choose —</option>
                      {recipes.map((rec) => <option key={rec.id} value={rec.id}>{rec.name}</option>)}
                    </select>
                  </div>
                );
              })}
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
                                <strong style={{ fontWeight: 600 }}>{fmtQty(n.needQty)}{n.unit ? " " + n.unit : ""}</strong> {n.item}
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
function Empty({ C, icon: Icon, title, sub }) {
  return (
    <div style={{ textAlign: "center", padding: "56px 20px", color: C.sub, fontFamily: "system-ui" }}>
      <Icon size={40} style={{ opacity: .4 }} />
      <p style={{ fontSize: 16, marginBottom: 4 }}>{title}</p>
      <p style={{ fontSize: 14, marginTop: 0 }}>{sub}</p>
    </div>
  );
}
