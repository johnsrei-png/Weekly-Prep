import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = url && anonKey ? createClient(url, anonKey) : null;

// Household code: everyone who enters the same code shares one kitchen.
// Stored locally so a device remembers which household it belongs to.
const KEY = "wt_household_code";

export function getHousehold() {
  return localStorage.getItem(KEY) || "";
}
export function setHousehold(code) {
  const clean = normalizeCode(code);
  if (clean) localStorage.setItem(KEY, clean);
  return clean;
}
export function clearHousehold() {
  localStorage.removeItem(KEY);
}
// Normalize so "Smith Family", "smith-family", "SMITH  FAMILY" all match.
export function normalizeCode(code) {
  return (code || "").trim().toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
}
// A friendly random suggestion like "maple-otter-418"
export function suggestCode() {
  const a = ["maple", "cedar", "sage", "amber", "river", "harbor", "meadow", "juniper"];
  const b = ["otter", "finch", "heron", "willow", "bramble", "pepper", "basil", "clover"];
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  return `${pick(a)}-${pick(b)}-${Math.floor(100 + Math.random() * 900)}`;
}

