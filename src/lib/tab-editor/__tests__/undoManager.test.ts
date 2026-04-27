import {describe, it, expect, beforeEach} from 'vitest';
import {UndoManager} from '../undoManager';
import {createBlankScore} from '../newScore';
import {model} from '@coderline/alphatab';

type Score = InstanceType<typeof model.Score>;

function makeScore(): Score {
  return createBlankScore({measureCount: 2, tempo: 120});
}

describe('UndoManager', () => {
  let mgr: UndoManager;
  let score: Score;

  beforeEach(() => {
    mgr = new UndoManager();
    score = makeScore();
  });

  describe('basic push/undo/redo', () => {
    it('canUndo is false initially', () => {
      expect(mgr.canUndo).toBe(false);
    });

    it('canRedo is false initially', () => {
      expect(mgr.canRedo).toBe(false);
    });

    it('canUndo is true after pushSnapshot', () => {
      mgr.pushSnapshot(score);
      expect(mgr.canUndo).toBe(true);
    });

    it('undo returns the previous snapshot', () => {
      mgr.pushSnapshot(score);
      const restored = mgr.undo(score);
      expect(restored).not.toBeNull();
      // The returned value should be a Score (has masterBars)
      expect(restored!.masterBars).toBeDefined();
    });

    it('canUndo is false after undoing the only snapshot', () => {
      mgr.pushSnapshot(score);
      mgr.undo(score);
      expect(mgr.canUndo).toBe(false);
    });

    it('canRedo is true after undo', () => {
      mgr.pushSnapshot(score);
      mgr.undo(score);
      expect(mgr.canRedo).toBe(true);
    });

    it('redo returns the undone snapshot', () => {
      mgr.pushSnapshot(score);
      mgr.undo(score);
      const redone = mgr.redo(score);
      expect(redone).not.toBeNull();
      expect(redone!.masterBars).toBeDefined();
    });

    it('canRedo is false after redo', () => {
      mgr.pushSnapshot(score);
      mgr.undo(score);
      mgr.redo(score);
      expect(mgr.canRedo).toBe(false);
    });

    it('pushSnapshot after undo clears redo stack', () => {
      mgr.pushSnapshot(score);
      mgr.undo(score);
      expect(mgr.canRedo).toBe(true);
      mgr.pushSnapshot(score);
      expect(mgr.canRedo).toBe(false);
    });

    it('undo returns null when stack is empty', () => {
      expect(mgr.undo(score)).toBeNull();
    });

    it('redo returns null when stack is empty', () => {
      expect(mgr.redo(score)).toBeNull();
    });
  });

  describe('isAtCleanState / markClean', () => {
    it('isAtCleanState is true initially', () => {
      expect(mgr.isAtCleanState).toBe(true);
    });

    it('isAtCleanState is false after pushSnapshot', () => {
      mgr.pushSnapshot(score);
      expect(mgr.isAtCleanState).toBe(false);
    });

    it('isAtCleanState is true after markClean', () => {
      mgr.pushSnapshot(score);
      mgr.markClean();
      expect(mgr.isAtCleanState).toBe(true);
    });

    it('isAtCleanState is false after mutation after markClean', () => {
      mgr.pushSnapshot(score);
      mgr.markClean();
      mgr.pushSnapshot(score);
      expect(mgr.isAtCleanState).toBe(false);
    });

    it('isAtCleanState is true after undo back to clean state', () => {
      // Mark clean at depth 0, push one snapshot (depth 1), then undo (back to depth 0)
      mgr.markClean(); // clean at undoStack.length = 0
      mgr.pushSnapshot(score); // undoStack.length = 1 → not clean
      expect(mgr.isAtCleanState).toBe(false);
      mgr.undo(score); // undoStack.length = 0 again → clean
      expect(mgr.isAtCleanState).toBe(true);
    });
  });

  describe('stack overflow (MAX_HISTORY = 50)', () => {
    it('cleanDepth decrements when old snapshot overflows', () => {
      // markClean at depth 0, then push 51 snapshots (MAX_HISTORY + 1)
      // The first push overflows at 51 entries, shifting off the oldest.
      // cleanDepth was 0 → no change since it's already 0 (clamped to max(0, cleanDepth-1)).
      // But if we markClean after 1 push (cleanDepth=1) then push 50 more,
      // the 51st push shifts oldest, cleanDepth decrements to 0, isAtCleanState becomes ambiguous.
      mgr.pushSnapshot(score); // undoStack.length = 1
      mgr.markClean();         // cleanDepth = 1

      // Push MAX_HISTORY more (50 more) → total will be 51 → oldest gets shifted
      // → cleanDepth decrements from 1 to 0
      for (let i = 0; i < 50; i++) {
        mgr.pushSnapshot(score);
      }

      // cleanDepth should have been decremented (from 1 toward 0)
      // isAtCleanState: undoStack.length (50 after shift+50 more = 50) vs cleanDepth (0)
      // Not equal → no longer at clean state
      expect(mgr.isAtCleanState).toBe(false);
    });
  });

  describe('clear()', () => {
    it('clear() resets canUndo to false', () => {
      mgr.pushSnapshot(score);
      mgr.clear();
      expect(mgr.canUndo).toBe(false);
    });

    it('clear() resets canRedo to false', () => {
      mgr.pushSnapshot(score);
      mgr.undo(score);
      mgr.clear();
      expect(mgr.canRedo).toBe(false);
    });

    it('clear() resets to clean state (cleanDepth = 0, undoStack empty)', () => {
      mgr.pushSnapshot(score);
      mgr.markClean();
      mgr.pushSnapshot(score);
      mgr.clear();
      // After clear: undoStack.length = 0, cleanDepth = 0 → isAtCleanState = true
      expect(mgr.isAtCleanState).toBe(true);
    });

    it('cleanDepth resets to 0 after clear()', () => {
      mgr.pushSnapshot(score);
      mgr.markClean();
      mgr.clear();
      // After clear, markClean with 0 snapshots means next push → not clean
      mgr.pushSnapshot(score);
      expect(mgr.isAtCleanState).toBe(false);
    });
  });
});
