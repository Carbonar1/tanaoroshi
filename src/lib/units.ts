import { Unit } from "./db";

export function altUnit(u: Unit): Unit | null {
  if (u === "kg") return "g";
  if (u === "g") return "kg";
  return null;
}

export function convertToItemUnit(value: number, from: Unit, to: Unit): number {
  if (from === to) return value;
  if (from === "g" && to === "kg") return value / 1000;
  if (from === "kg" && to === "g") return value * 1000;
  return value;
}
