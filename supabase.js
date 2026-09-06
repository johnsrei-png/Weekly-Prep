import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = url && anonKey ? createClient(url, anonKey) : null;

// A stable per-device id so data persists without a login system.
// (Swap this for real auth later if you want per-user accounts.)
export function getDeviceId() {
  let id = localStorage.getItem("wt_device_id");
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem("wt_device_id", id);
  }
  return id;
}
