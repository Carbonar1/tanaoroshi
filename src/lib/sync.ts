"use client";

import {
  CountEntry,
  Item,
  Member,
  Stocktake,
  Supplier,
  Unit,
  UNITS,
  db,
} from "./db";
import {
  RemoteEntry,
  RemoteItem,
  RemoteSupplier,
  hasSupabase,
  supabase,
} from "./supabase";
import { humanize } from "./humanError";
import { mergeItems, mergeSuppliers } from "./syncMerge";
import { dedupePayload, pickKeeperMap } from "./dedupe";

export type SyncResult = {
  pulledSuppliers: number;
  pulledItems: number;
  pushedSuppliers: number;
  pushedItems: number;
  pushedEntries: number;
  pulledEntries: number;
  pulledMembers: number;
  pushedMembers: number;
  errors: string[];
};

const EMPTY_RESULT = (): SyncResult => ({
  pulledSuppliers: 0,
  pulledItems: 0,
  pushedSuppliers: 0,
  pushedItems: 0,
  pushedEntries: 0,
  pulledEntries: 0,
  pulledMembers: 0,
  pushedMembers: 0,
  errors: [],
});

function toUnit(u: string): Unit {
  return (UNITS as string[]).includes(u) ? (u as Unit) : "箱";
}

// 発注先：同名はサーバーの既存行を使う（upsert onConflict=name）
async function syncSuppliers(result: SyncResult): Promise<Map<number, number>> {
  const map = new Map<number, number>();
  const sb = supabase();
  if (!sb) return map;

  const locals = await db.suppliers.toArray();

  // 1. ローカルの発注先をまとめて upsert（名前で突き合わせ）
  if (locals.length > 0) {
    const payload = dedupePayload(
      locals.map((l) => ({
        name: l.name,
        sort_order: l.sort_order,
      })),
      ["name"],
    );
    const { data, error } = await sb
      .from("suppliers")
      .upsert(payload, { onConflict: "name" })
      .select("id, name, sort_order");
    if (error) {
      result.errors.push(`発注先の送信：${humanize(error.message)}`);
    } else {
      const map1 = mergeSuppliers(
        locals.map((l) => ({ id: l.id!, name: l.name })),
        (data ?? []) as Array<{ id: number; name: string }>,
      );
      map1.forEach((srv, loc) => map.set(loc, srv));
      result.pushedSuppliers += data?.length ?? 0;
    }
  }

  // 2. サーバーの発注先を取得して、ローカルに無いものを追加
  const { data: remote, error } = await sb
    .from("suppliers")
    .select("id, name, sort_order")
    .order("sort_order");
  if (error) {
    result.errors.push(`発注先の取得：${humanize(error.message)}`);
    return map;
  }
  const localByName = new Map<string, Supplier>();
  locals.forEach((l) => localByName.set(l.name, l));
  for (const r of (remote ?? []) as RemoteSupplier[]) {
    const l = localByName.get(r.name);
    if (l) {
      map.set(l.id!, r.id);
    } else {
      const id = await db.suppliers.add({
        name: r.name,
        sort_order: r.sort_order,
      });
      map.set(id, r.id);
      result.pulledSuppliers += 1;
    }
  }
  return map;
}

// 品目：同じ発注先＋同じ品名はサーバーの既存行を使う（upsert onConflict=supplier_id,name）
async function syncItems(
  supplierMap: Map<number, number>,
  result: SyncResult,
): Promise<Map<number, number>> {
  const itemMap = new Map<number, number>();
  const sb = supabase();
  if (!sb) return itemMap;

  const locals = await db.items.toArray();

  // 1. 送信対象（発注先 id が解決できるものだけ）
  type P = { local_id: number; row: Record<string, unknown>; name: string };
  const payload: P[] = [];
  for (const l of locals) {
    const srvSid = supplierMap.get(l.supplier_id);
    if (srvSid == null) continue;
    payload.push({
      local_id: l.id!,
      name: l.name,
      row: {
        name: l.name,
        reading: l.reading ?? "",
        supplier_id: srvSid,
        sheet_order: l.sheet_order,
        spec: l.spec ?? null,
        unit: l.unit,
        is_weight: l.is_weight === 1,
        pack_qty: l.pack_qty ?? null,
        unit_price: l.unit_price ?? null,
        active: l.active === 1,
        is_provisional: l.is_provisional === 1,
        last_month_qty: l.last_month_qty ?? null,
      },
    });
  }

  if (payload.length > 0) {
    const deduped = dedupePayload(
      payload.map((p) => p.row as Record<string, unknown>),
      ["supplier_id", "name"],
    );
    const { data, error } = await sb
      .from("items")
      .upsert(deduped, { onConflict: "supplier_id,name" })
      .select("id, supplier_id, name");
    if (error) {
      result.errors.push(`品目の送信：${humanize(error.message)}`);
    } else {
      const byKey = new Map<string, number>();
      (data ?? []).forEach((r) =>
        byKey.set(
          `${(r as { supplier_id: number }).supplier_id}:${(r as { name: string }).name}`,
          (r as { id: number }).id,
        ),
      );
      for (const p of payload) {
        const sid = (p.row as { supplier_id: number }).supplier_id;
        const srvId = byKey.get(`${sid}:${p.name}`);
        if (srvId != null) itemMap.set(p.local_id, srvId);
      }
      result.pushedItems += data?.length ?? 0;
    }
  }

  // 2. サーバーから取得して、ローカルを更新・追加
  const { data: remote, error: fetchErr } = await sb.from("items").select("*");
  if (fetchErr) {
    result.errors.push(`品目の取得：${humanize(fetchErr.message)}`);
    return itemMap;
  }
  const serverSupToLocal = new Map<number, number>();
  supplierMap.forEach((srv, loc) => serverSupToLocal.set(srv, loc));
  const existingByKey = new Map<string, Item>();
  locals.forEach((l) =>
    existingByKey.set(`${l.supplier_id}:${l.name}`, l),
  );

  for (const r of (remote ?? []) as RemoteItem[]) {
    const localSup = serverSupToLocal.get(r.supplier_id);
    if (localSup == null) continue;
    const key = `${localSup}:${r.name}`;
    const existing = existingByKey.get(key);
    const payloadLocal: Omit<Item, "id"> = {
      name: r.name,
      reading: r.reading ?? "",
      supplier_id: localSup,
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
      await db.items.update(existing.id!, payloadLocal);
      itemMap.set(existing.id!, r.id);
    } else {
      const id = await db.items.add(payloadLocal);
      itemMap.set(id, r.id);
      result.pulledItems += 1;
    }
  }

  // 3. 念のため、サーバーに存在する行をローカル→サーバー対応表に合流
  const remoteByKey = new Map<string, number>();
  (remote ?? []).forEach((r) => {
    const ls = serverSupToLocal.get(r.supplier_id);
    if (ls != null) remoteByKey.set(`${ls}:${r.name}`, r.id);
  });
  for (const l of locals) {
    if (itemMap.has(l.id!)) continue;
    const srv = remoteByKey.get(`${l.supplier_id}:${l.name}`);
    if (srv != null) itemMap.set(l.id!, srv);
  }
  const map2 = mergeItems(
    locals.map((l) => ({
      id: l.id!,
      supplier_id: l.supplier_id,
      name: l.name,
    })),
    (remote ?? []).map((r) => ({
      id: r.id,
      supplier_id: r.supplier_id,
      name: r.name,
    })),
    supplierMap,
  );
  map2.forEach((srv, loc) => {
    if (!itemMap.has(loc)) itemMap.set(loc, srv);
  });

  return itemMap;
}

// 棚卸しは「月」で突き合わせ、全端末で同じサーバー行を共有する。
// 1. 月で既存を検索
// 2. 無ければ作成（他端末との競合で失敗したら、もう一度検索）
async function syncStocktake(
  localStock: Stocktake,
  result?: SyncResult,
): Promise<number | null> {
  const sb = supabase();
  if (!sb) return null;

  const { data: existing, error: fetchErr } = await sb
    .from("stocktakes")
    .select("id")
    .eq("month", localStock.month)
    .maybeSingle();
  if (fetchErr) {
    result?.errors.push(`棚卸しの取得：${humanize(fetchErr.message)}`);
    return null;
  }
  if (existing) return (existing as { id: number }).id;

  const { data: inserted, error: insErr } = await sb
    .from("stocktakes")
    .insert({
      month: localStock.month,
      status: localStock.status,
      tax_mode: localStock.tax_mode,
      tax_rate: localStock.tax_rate,
    })
    .select("id")
    .maybeSingle();

  if (insErr) {
    // 他端末が先に作った可能性 → もう一度月で検索
    const { data: again } = await sb
      .from("stocktakes")
      .select("id")
      .eq("month", localStock.month)
      .maybeSingle();
    if (again) return (again as { id: number }).id;
    result?.errors.push(`棚卸しの作成：${humanize(insErr.message)}`);
    return null;
  }
  return inserted ? (inserted as { id: number }).id : null;
}

// 入力の記録：1 件ずつ upsert（client_uid で二重登録を防止）
// 1 件失敗しても他は送る。失敗した行は synced_at を立てないので次回自動で再送される。
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

  for (const e of unsynced) {
    const serverItemId = itemMap.get(e.item_id);
    if (serverItemId == null) continue; // 品目の送信失敗。次回。
    const row = {
      client_uid: e.client_uid,
      stocktake_id: serverStocktakeId,
      item_id: serverItemId,
      qty: e.qty,
      mode: e.mode,
      counted_by: e.counted_by ?? "",
      device_id: e.device_id ?? "",
      counted_at: new Date(e.counted_at).toISOString(),
    };
    const { error } = await sb
      .from("count_entries")
      .upsert(row, { onConflict: "client_uid", ignoreDuplicates: true });
    if (error) {
      result.errors.push(`入力の送信：${humanize(error.message)}`);
      continue;
    }
    await db.count_entries.update(e.id!, { synced_at: Date.now() });
    result.pushedEntries += 1;
  }
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
    result.errors.push(`入力の取得：${humanize(error.message)}`);
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
    try {
      await db.count_entries.bulkAdd(toInsert);
      result.pulledEntries += toInsert.length;
    } catch {
      // 競合（client_uid の重複）があった場合は 1 件ずつ入れ直す
      for (const r of toInsert) {
        try {
          await db.count_entries.add(r);
          result.pulledEntries += 1;
        } catch {
          // 既にある。無視。
        }
      }
    }
  }
}

// 名前の一覧：Last-Write-Wins by updated_at
// 1. サーバーの現状を取得
// 2. 新規／変更したローカルのみ送る（サーバー側の updated_at が新しいものは送らない）
// 3. サーバーの最新をローカルに適用
async function syncMembers(result: SyncResult): Promise<void> {
  const sb = supabase();
  if (!sb) return;

  const locals = await db.members.toArray();

  // 1. サーバーの現状を取得
  const { data: remote, error: fetchErr } = await sb
    .from("members")
    .select("id, name, active, updated_at");
  if (fetchErr) {
    result.errors.push(`名前の取得：${humanize(fetchErr.message)}`);
    return;
  }
  const remoteByName = new Map<
    string,
    { active: boolean; updated_at: number }
  >();
  for (const r of (remote ?? []) as Array<{
    name: string;
    active: boolean;
    updated_at: string;
  }>) {
    remoteByName.set(r.name, {
      active: r.active,
      updated_at: new Date(r.updated_at).getTime(),
    });
  }

  // 2. ローカルの中で、サーバーに無い or ローカル updated_at がサーバーより新しいものだけ送る
  const toPush: Array<{ name: string; active: boolean }> = [];
  for (const l of locals) {
    const r = remoteByName.get(l.name);
    if (!r) {
      toPush.push({ name: l.name, active: l.active === 1 });
      continue;
    }
    if (l.updated_at > r.updated_at && (l.active === 1) !== r.active) {
      toPush.push({ name: l.name, active: l.active === 1 });
    }
  }
  if (toPush.length > 0) {
    const payload = dedupePayload(toPush, ["name"]);
    const { data, error } = await sb
      .from("members")
      .upsert(payload, { onConflict: "name" })
      .select("id, name, active, updated_at");
    if (error) {
      result.errors.push(`名前の送信：${humanize(error.message)}`);
    } else {
      result.pushedMembers += data?.length ?? 0;
      // サーバーが時刻を返してきたら、ローカルにも反映
      for (const r of (data ?? []) as Array<{
        name: string;
        active: boolean;
        updated_at: string;
      }>) {
        remoteByName.set(r.name, {
          active: r.active,
          updated_at: new Date(r.updated_at).getTime(),
        });
      }
    }
  }

  // 3. サーバーの最新をローカルに適用
  const localByName = new Map<string, Member>();
  locals.forEach((l) => localByName.set(l.name, l));
  for (const [name, srv] of remoteByName) {
    const activeNum: 0 | 1 = srv.active ? 1 : 0;
    const existing = localByName.get(name);
    if (!existing) {
      await db.members.add({
        name,
        active: activeNum,
        updated_at: srv.updated_at,
      });
      result.pulledMembers += 1;
    } else if (
      srv.updated_at > existing.updated_at &&
      (existing.active !== activeNum || existing.updated_at < srv.updated_at)
    ) {
      await db.members.update(existing.id!, {
        active: activeNum,
        updated_at: srv.updated_at,
      });
      result.pulledMembers += 1;
    }
  }
}

// ローカル DB の重複行をまとめる。
// - 発注先：同名が複数 → id の小さい方を残し、品目の supplier_id をそちらへ付け替え、重複行を削除
// - 品目：同じ (supplier_id, name) が複数 → id の小さい方を残し、入力記録の item_id を付け替え、重複行を削除
export async function dedupeLocalDb(): Promise<{
  mergedSuppliers: number;
  mergedItems: number;
  mergedStocktakes: number;
}> {
  let mergedSuppliers = 0;
  let mergedItems = 0;
  let mergedStocktakes = 0;

  await db.transaction(
    "rw",
    db.suppliers,
    db.items,
    db.stocktakes,
    db.count_entries,
    db.settings,
    async () => {
      // 棚卸し：同じ月は 1 つにまとめ、入力記録を残す側に付け替える。
      const stocktakes = await db.stocktakes.toArray();
      const { remap: stRemap } = pickKeeperMap(
        stocktakes.map((s) => ({ id: s.id!, month: s.month })),
        (r) => r.month,
      );
      if (stRemap.size > 0) {
        for (const [removed, keeper] of stRemap) {
          await db.count_entries
            .where("stocktake_id")
            .equals(removed)
            .modify({ stocktake_id: keeper });
        }
        await db.stocktakes.bulkDelete([...stRemap.keys()]);
        mergedStocktakes = stRemap.size;
        // active_stocktake_id を残す側に付け替える
        const row = await db.settings.get("active_stocktake_id");
        const activeId = row ? Number(row.value) : 0;
        if (stRemap.has(activeId)) {
          await db.settings.put({
            key: "active_stocktake_id",
            value: String(stRemap.get(activeId)),
          });
        }
      }
    },
  );
  await db.transaction(
    "rw",
    db.suppliers,
    db.items,
    db.count_entries,
    async () => {
      // 発注先
      const suppliers = await db.suppliers.toArray();
      const { remap: supRemap } = pickKeeperMap(
        suppliers.map((s) => ({ id: s.id!, name: s.name, sort_order: s.sort_order })),
        (r) => r.name,
      );
      if (supRemap.size > 0) {
        for (const [removed, keeper] of supRemap) {
          await db.items
            .where("supplier_id")
            .equals(removed)
            .modify({ supplier_id: keeper });
        }
        await db.suppliers.bulkDelete([...supRemap.keys()]);
        mergedSuppliers = supRemap.size;
      }

      // 品目
      const items = await db.items.toArray();
      const { remap: itemRemap } = pickKeeperMap(
        items.map((it) => ({
          id: it.id!,
          supplier_id: it.supplier_id,
          name: it.name,
        })),
        (r) => `${r.supplier_id}:${r.name}`,
      );
      if (itemRemap.size > 0) {
        for (const [removed, keeper] of itemRemap) {
          await db.count_entries
            .where("item_id")
            .equals(removed)
            .modify({ item_id: keeper });
        }
        await db.items.bulkDelete([...itemRemap.keys()]);
        mergedItems = itemRemap.size;
      }
    },
  );

  return { mergedSuppliers, mergedItems, mergedStocktakes };
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
    try {
      await dedupeLocalDb();
    } catch (e) {
      result.errors.push(`重複の整理：${humanize(e)}`);
    }
    const supplierMap = await syncSuppliers(result);
    const itemMap = await syncItems(supplierMap, result);
    await syncMembers(result);
    const serverStocktakeId = await syncStocktake(stocktake, result);
    if (serverStocktakeId != null) {
      await pushEntries(stocktake, serverStocktakeId, itemMap, result);
      await pullEntries(stocktake, serverStocktakeId, itemMap, result);
    } else {
      result.errors.push("棚卸しの登録に失敗しました。");
    }
  } catch (e) {
    result.errors.push(humanize(e));
  } finally {
    syncing = false;
  }
  return result;
}
