import {describe, it, expect} from 'vitest';
import {reorderItems, insertIndexToPosition} from '../setlist-order';

describe('reorderItems', () => {
  it('moves item up', () => {
    expect(reorderItems([0, 1, 2, 3], 3, 0)).toEqual([3, 0, 1, 2]);
  });

  it('moves item down', () => {
    expect(reorderItems([0, 1, 2, 3], 0, 3)).toEqual([1, 2, 3, 0]);
  });

  it('moves item one step up', () => {
    expect(reorderItems(['a', 'b', 'c'], 2, 1)).toEqual(['a', 'c', 'b']);
  });

  it('moves item one step down', () => {
    expect(reorderItems(['a', 'b', 'c'], 0, 1)).toEqual(['b', 'a', 'c']);
  });

  it('no-op when same index returns copy', () => {
    const items = [0, 1, 2];
    const result = reorderItems(items, 1, 1);
    expect(result).toEqual([0, 1, 2]);
    expect(result).not.toBe(items);
  });

  it('handles two-item swap', () => {
    expect(reorderItems(['x', 'y'], 0, 1)).toEqual(['y', 'x']);
    expect(reorderItems(['x', 'y'], 1, 0)).toEqual(['y', 'x']);
  });

  it('does not mutate original array', () => {
    const original = [1, 2, 3, 4];
    reorderItems(original, 0, 3);
    expect(original).toEqual([1, 2, 3, 4]);
  });
});

describe('insertIndexToPosition', () => {
  // insertIndex is 0..n (insertion point in original array)
  // Returned value is the final position to pass to the DB reorder function

  it('drop before same item is no-op', () => {
    // dragging item at index 2, dropping insert before it (insertIndex=2)
    expect(insertIndexToPosition(2, 2)).toBe(2);
  });

  it('drop after same item is no-op', () => {
    // dragging item at index 2, dropping insert after it (insertIndex=3)
    expect(insertIndexToPosition(3, 2)).toBe(2);
  });

  it('moving up: insert before index 0 from index 3', () => {
    expect(insertIndexToPosition(0, 3)).toBe(0);
  });

  it('moving down: insert after last from index 0 (4-item list)', () => {
    // items=[a,b,c,d], drag a (index 0) to after d (insertIndex=4)
    // after removing a, d is at index 2, so final position = 3
    expect(insertIndexToPosition(4, 0)).toBe(3);
  });

  it('moving down by one', () => {
    // drag index 1 to insertIndex 3 in a 4-item list
    // after removal index 1, target slot is now at 2
    expect(insertIndexToPosition(3, 1)).toBe(2);
  });

  it('moving up by one', () => {
    // drag index 2 to insertIndex 1
    expect(insertIndexToPosition(1, 2)).toBe(1);
  });
});
