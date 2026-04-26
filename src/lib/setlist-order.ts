export function reorderItems<T>(items: readonly T[], fromIndex: number, toIndex: number): T[] {
  if (fromIndex === toIndex) return [...items];
  const result = [...items];
  const [removed] = result.splice(fromIndex, 1);
  result.splice(toIndex, 0, removed);
  return result;
}

// insertIndex is 0..items.length (insertion point in original array).
// Returns the final position to pass to reorderSetlistItem.
export function insertIndexToPosition(insertIndex: number, fromIndex: number): number {
  return insertIndex > fromIndex ? insertIndex - 1 : insertIndex;
}
