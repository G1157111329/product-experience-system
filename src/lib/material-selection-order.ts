export function orderMaterialsByIds<T extends { id: string }>(ids: string[], materials: T[]): T[] {
  const byId = new Map(materials.map((material) => [material.id, material]));
  return ids.map((id) => byId.get(id)).filter((material): material is T => Boolean(material));
}
