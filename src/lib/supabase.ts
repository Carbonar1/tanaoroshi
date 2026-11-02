"use client";

import { createClient, SupabaseClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

let client: SupabaseClient | null = null;

export function supabase(): SupabaseClient | null {
  if (!url || !anon) return null;
  if (!client) {
    client = createClient(url, anon, {
      auth: { persistSession: false },
    });
  }
  return client;
}

export function hasSupabase(): boolean {
  return Boolean(url && anon);
}

export type RemoteSupplier = {
  id: number;
  name: string;
  sort_order: number;
};

export type RemoteItem = {
  id: number;
  name: string;
  reading: string;
  supplier_id: number;
  sheet_order: number;
  spec: string | null;
  unit: string;
  is_weight: boolean;
  pack_qty: number | null;
  unit_price: number | null;
  active: boolean;
  is_provisional: boolean;
  last_month_qty: number | null;
};

export type RemoteStocktake = {
  id: number;
  month: string;
  status: "open" | "closed";
  tax_mode: "included" | "excluded";
  tax_rate: number;
};

export type RemoteEntry = {
  id: number;
  client_uid: string;
  stocktake_id: number;
  item_id: number;
  qty: number;
  mode: "set" | "add";
  counted_by: string;
  device_id: string;
  counted_at: string;
  synced_at: string;
};
