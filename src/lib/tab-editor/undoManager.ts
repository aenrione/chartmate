import {exportToAlphaTex} from './exporters';
import {model, importer, Settings} from '@coderline/alphatab';

type Score = InstanceType<typeof model.Score>;

const MAX_HISTORY = 50;

export class UndoManager {
  private undoStack: string[] = [];
  private redoStack: string[] = [];

  /**
   * Take a snapshot of the current score state.
   * Call this BEFORE making any mutation.
   */
  pushSnapshot(score: Score): void {
    const snapshot = exportToAlphaTex(score);
    this.undoStack.push(snapshot);
    if (this.undoStack.length > MAX_HISTORY) {
      this.undoStack.shift();
    }
    // Any new action clears the redo stack
    this.redoStack.length = 0;
  }

  /**
   * Undo: restore the previous state.
   * Returns the restored Score, or null if nothing to undo.
   */
  undo(currentScore: Score): Score | null {
    if (this.undoStack.length === 0) return null;

    // Save current state to redo stack
    const currentSnapshot = exportToAlphaTex(currentScore);
    this.redoStack.push(currentSnapshot);

    // Pop and restore previous state
    const previousSnapshot = this.undoStack.pop()!;
    return this.deserialize(previousSnapshot);
  }

  /**
   * Redo: restore the next state.
   * Returns the restored Score, or null if nothing to redo.
   */
  redo(currentScore: Score): Score | null {
    if (this.redoStack.length === 0) return null;

    // Save current state to undo stack
    const currentSnapshot = exportToAlphaTex(currentScore);
    this.undoStack.push(currentSnapshot);

    // Pop and restore next state
    const nextSnapshot = this.redoStack.pop()!;
    return this.deserialize(nextSnapshot);
  }

  get canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  get canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  clear(): void {
    this.undoStack.length = 0;
    this.redoStack.length = 0;
  }

  private deserialize(alphaTex: string): Score | null {
    try {
      const settings = new Settings();
      const tex = new importer.AlphaTexImporter();
      tex.initFromString(alphaTex, settings);
      const score = tex.readScore();
      return score;
    } catch {
      return null;
    }
  }
}
