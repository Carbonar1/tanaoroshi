// サーバーから引いた行とローカル行を名前で突き合わせて id 対応表を作る純関数。
// Supabase を呼ばないのでテストしやすい。

export function mergeSuppliers(
  locals: Array<{ id: number; name: string }>,
  remote: Array<{ id: number; name: string }>,
): Map<number, number> {
  const byName = new Map<string, number>();
  locals.forEach((l) => byName.set(l.name, l.id));
  const map = new Map<number, number>();
  remote.forEach((r) => {
    const localId = byName.get(r.name);
    if (localId != null) map.set(localId, r.id);
  });
  return map;
}

export function mergeItems(
  locals: Array<{ id: number; supplier_id: number; name: string }>,
  remote: Array<{ id: number; supplier_id: number; name: string }>,
  supplierLocalToServer: Map<number, number>,
): Map<number, number> {
  const serverSupToLocal = new Map<number, number>();
  supplierLocalToServer.forEach((srv, loc) => serverSupToLocal.set(srv, loc));

  const byKey = new Map<string, number>();
  locals.forEach((l) =>
    byKey.set(`${l.supplier_id}:${l.name}`, l.id),
  );

  const map = new Map<number, number>();
  remote.forEach((r) => {
    const localSup = serverSupToLocal.get(r.supplier_id);
    if (localSup == null) return;
    const localId = byKey.get(`${localSup}:${r.name}`);
    if (localId != null) map.set(localId, r.id);
  });
  return map;
}
