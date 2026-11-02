"use client";

import {
  CountEntry,
  Item,
  Stocktake,
  Supplier,
  Unit,
  UNITS,
  db,
  newClientUid,
} from "./db";
import {
  RemoteEntry,
  RemoteItem,
  RemoteStocktake,
  RemoteSupplier,
  hasSupabase,
  supabase,
} from "./supabase";

export type SyncResult = {
  pulledSuppliers: number;
  pulledItems: number;
  pushedSuppliers: number;
  pushedItems: number;
  pushedEntries: number;
  pulledEntries: number;
  errors: string[];
};

const EMPTY_RESULT = (): SyncResult => ({
  pulledSuppliers: 0,
  pulledItems: 0,
  pushedSuppliers: 0,
  pushedItems: 0,
  pushedEntries: 0,
  pulledEntries: 0,
  errors: [],
});

function toUnit(u: string): Unit {
  return (UNITS as string[]).includes(u) ? (u as Unit) : "箱";
}

// 発注先：ローカル → サーバー（名前で突き合わせ、無ければ作成）
// サーバー → ローカル（名前で突き合わせ、無ければ作成）
async function syncSuppliers(result: SyncResult): Promise<Map<number, number>> {
  const sb = supabase();
  const localToServer = new Map<number, number>();
  if (!sb) return localToServer;

  const { data: remote, error } = await sb
    .from("suppliers")
    .select("id,name,sort_order")
    .order("sort_order");
  if (error) {
    result.errors.push(`発注先の取得: ${error.message}`);
    return localToServer;
  }
  const remoteByName = new Map<string, RemoteSupplier>();
  (remote ?? []).forEach((r) =>
    remoteByName.set(r.name, r as RemoteSupplier),
  );

  const locals = await db.suppliers.toArray();
  const localByName = new Map<string, Supplier>();
  locals.forEach((l) => localByName.set(l.name, l));

  // サーバーのみに存在するもの → ローカルに作成
  for (const r of remoteByName.values()) {
    if (!localByName.has(r.name)) {
      const id = await db.suppliers.add({
        name: r.name,
        sort_order: r.sort_order,
      });
      localToServer.set(id, r.id);
      result.pulledSuppliers += 1;
    } else {
      const l = localByName.get(r.name)!;
      localToServer.set(l.id!, r.id);
    }
  }

  // ローカルのみ → サーバーに作成
  const localOnly = locals.filter((l) => !remoteByName.has(l.name));
  if (localOnly.length > 0) {
    const payload = localOnly.map((l) => ({
      name: l.name,
      sort_order: l.sort_order,
    }));
    const { data: inserted, error: insErr } = await sb
      .from("suppliers")
      .insert(payload)
      .select("id,name,sort_order");
    if (insErr) {
      result.errors.push(`発注先の送信: ${insErr.message}`);
    } else {
      (inserted ?? []).forEach((r) => {
        const local = locals.find((l) => l.name === r.name);
        if (local) localToServer.set(local.id!, r.id);
      });
      result.pushedSuppliers += inserted?.length ?? 0;
    }
  }

  return localToServer;
}

// 品目：発注先IDの対応表を使って双方向同期
async function syncItems(
  supplierMap: Map<number, number>,
  result: SyncResult,
): Promise<Map<number, number>> {
  const sb = supabase();
  const itemLocalToServer = new Map<number, number>();
  if (!sb) return itemLocalToServer;

  const serverSupplierToLocal = new Map<number, number>();
  supplierMap.forEach((srv, loc) => serverSupplierToLocal.set(srv, loc));

  const { data: remote, error } = await sb.from("items").select("*");
  if (error) {
    result.errors.push(`品目の取得: ${error.message}`);
    return itemLocalToServer;
  }

  const key = (supplierId: number, name: string) => `${supplierId}:${name}`;

  const remoteByKey = new Map<string, RemoteItem>();
  (remote ?? []).forEach((r) => {
    const localSupId = serverSupplierToLocal.get(r.supplier_id);
    if (localSupId != null) {
      remoteByKey.set(key(localSupId, r.name), r as RemoteItem);
    }
  });

  const locals = await db.items.toArray();
  const localByKey = new Map<string, Item>();
  locals.forEach((l) => localByKey.set(key(l.supplier_id, l.name), l));

  // サーバー → ローカル
  for (const [k, r] of remoteByKey) {
    const localSupId = serverSupplierToLocal.get(r.supplier_id)!;
    const existing = localByKey.get(k);
    const payload: Omit<Item, "id"> = {
      name: r.name,
      reading: r.reading ?? "",
      supplier_id: localSupId,
      sheet_order: r.sheet_order,
      spec: r.spec ?? undefined,
      unit: toUnit(r.unit),
      is_weight: r.is_weight ? 1 : 0,
      pack_qty: r.pack_qty ?? undefined,
      unit_price: r.unit_price ?? undefined,
      active: r.active ? 1 : 0,
      is_provisional: r.is_provisional ? 1 : 0,
      last_month_qty: r.last_month_qty ?? undefined,
    };
    if (existing) {
      await db.items.update(existing.id!, payload);
      itemLocalToServer.set(existing.id!, r.id);
    } else {
      const id = await db.items.add(payload);
      itemLocalToServer.set(id, r.id);
      result.pulledItems += 1;
    }
  }

  // ローカルのみ → サーバー
  const localOnly = locals.filter(
    (l) => !remoteByKey.has(key(l.supplier_id, l.name)),
  );
  if (localOnly.length > 0) {
    const payload = localOnly
      .map((l) => {
        const srvSup = supplierMap.get(l.supplier_id);
        if (srvSup == null) return null;
        return {
          name: l.name,
          reading: l.reading ?? "",
          supplier_id: srvSup,
          sheet_order: l.sheet_order,
          spec: l.spec ?? null,
          unit: l.unit,
          is_weight: l.is_weight === 1,
          pack_qty: l.pack_qty ?? null,
          unit_price: l.unit_price ?? null,
          active: l.active === 1,
          is_provisional: l.is_provisional === 1,
          last_month_qty: l.last_month_qty ?? null,
          _local_id: l.id!,
        };
      })
      .filter(Boolean) as Array<Record<string, unknown> & { _local_id: number }>;

    const { data: inserted, error: insErr } = await sb
      .from("items")
      .insert(payload.map(({ _local_id, ...rest }) => rest))
      .select("id,name,supplier_id");
    if (insErr) {
      result.errors.push(`品目の送信: ${insErr.message}`);
    } else {
      (inserted ?? []).forEach((r) => {
        const match = payload.find(
          (p) => p.name === r.name && p.supplier_id === r.supplier_id,
        );
        if (match) itemLocalToServer.set(match._local_id, r.id);
      });
      result.pushedItems += inserted?.length ?? 0;
    }
  }

  return itemLocalToServer;
}

async function syncStocktake(
  localStock: Stocktake,
): Promise<number | null> {
  const sb = supabase();
  if (!sb) return null;
  const { data: existing, error } = await sb
    .from("stocktakes")
    .select("*")
    .eq("month", localStock.month)
    .maybeSingle();
  if (error) return null;
  if (existing) return (existing as RemoteStocktake).id;
  const { data: inserted, error: insErr } = await sb
    .from("stocktakes")
    .insert({
      month: localStock.month,
      status: localStock.status,
      tax_mode: localStock.tax_mode,
      tax_rate: localStock.tax_rate,
    })
    .select("id")
    .single();
  if (insErr) return null;
  return inserted.id as number;
}

async function pushEntries(
  stocktake: Stocktake,
  serverStocktakeId: number,
  itemMap: Map<number, number>,
  result: SyncResult,
): Promise<void> {
  const sb = supabase();
  if (!sb) return;
  const unsynced = await db.count_entries
    .where("stocktake_id")
    .equals(stocktake.id!)
    .filter((e) => !e.synced_at)
    .toArray();
  if (unsynced.length === 0) return;

  const payload = unsynced
    .map((e) => {
      const serverItemId = itemMap.get(e.item_id);
      if (serverItemId == null) return null;
      return {
        local_id: e.id!,
        row: {
          client_uid: e.client_uid,
          stocktake_id: serverStocktakeId,
          item_id: serverItemId,
          qty: e.qty,
          mode: e.mode,
          counted_by: e.counted_by ?? "",
          device_id: e.device_id ?? "",
          counted_at: new Date(e.counted_at).toISOString(),
        },
      };
    })
    .filter(Boolean) as Array<{
    local_id: number;
    row: Record<string, unknown>;
  }>;

  if (payload.length === 0) return;

  const { error } = await sb
    .from("count_entries")
    .upsert(
      payload.map((p) => p.row),
      { onConflict: "client_uid", ignoreDuplicates: true },
    );
  if (error) {
    result.errors.push(`入力記録の送信: ${error.message}`);
    return;
  }

  const now = Date.now();
  await Promise.all(
    payload.map((p) =>
      db.count_entries.update(p.local_id, { synced_at: now }),
    ),
  );
  result.pushedEntries += payload.length;
}

async function pullEntries(
  stocktake: Stocktake,
  serverStocktakeId: number,
  itemMap: Map<number, number>,
  result: SyncResult,
): Promise<void> {
  const sb = supabase();
  if (!sb) return;
  const serverToLocalItem = new Map<number, number>();
  itemMap.forEach((srv, loc) => serverToLocalItem.set(srv, loc));

  const { data, error } = await sb
    .from("count_entries")
    .select("*")
    .eq("stocktake_id", serverStocktakeId);
  if (error) {
    result.errors.push(`入力記録の取得: ${error.message}`);
    return;
  }
  const remotes = (data ?? []) as RemoteEntry[];
  if (remotes.length === 0) return;

  const existing = await db.count_entries
    .where("stocktake_id")
    .equals(stocktake.id!)
    .toArray();
  const existingByUid = new Map<string, CountEntry>();
  existing.forEach((e) => existingByUid.set(e.client_uid, e));

  const toInsert: Omit<CountEntry, "id">[] = [];
  for (const r of remotes) {
    if (existingByUid.has(r.client_uid)) continue;
    const localItemId = serverToLocalItem.get(r.item_id);
    if (localItemId == null) continue;
    toInsert.push({
      client_uid: r.client_uid,
      stocktake_id: stocktake.id!,
      item_id: localItemId,
      qty: Number(r.qty),
      mode: r.mode,
      counted_by: r.counted_by,
      device_id: r.device_id,
      counted_at: new Date(r.counted_at).getTime(),
      synced_at: new Date(r.synced_at).getTime(),
    });
  }
  if (toInsert.length > 0) {
    await db.count_entries.bulkAdd(toInsert);
    result.pulledEntries += toInsert.length;
  }
}

let syncing = false;

export async function syncNow(stocktake: Stocktake): Promise<SyncResult> {
  const result = EMPTY_RESULT();
  if (!hasSupabase()) {
    result.errors.push("Supabase が設定されていません。");
    return result;
  }
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    result.errors.push("電波がありません。");
    return result;
  }
  if (syncing) {
    result.errors.push("送信中です。");
    return result;
  }
  syncing = true;
  try {
    const supplierMap = await syncSuppliers(result);
    const itemMap = await syncItems(supplierMap, result);
    const serverStocktakeId = await syncStocktake(stocktake);
    if (serverStocktakeId != null) {
      await pushEntries(stocktake, serverStocktakeId, itemMap, result);
      await pullEntries(stocktake, serverStocktakeId, itemMap, result);
    } else {
      result.errors.push("棚卸しの登録に失敗しました。");
    }
  } finally {
    syncing = false;
  }
  return result;
}

export async function unsyncedCount(stocktakeId: number): Promise<number> {
  return db.count_entries
    .where("stocktake_id")
    .equals(stocktakeId)
    .filter((e) => !e.synced_at)
    .count();
}
