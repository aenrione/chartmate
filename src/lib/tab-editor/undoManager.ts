import {exportToGp7} from './exporters';
import {model, importer, Settings} from '@coderline/alphatab';

type Score = InstanceType<typeof model.Score>;

const MAX_HISTORY = 50;

export class UndoManager {
  private undoStack: Uint8Array[] = [];
  private redoStack: Uint8Array[] = [];
  // Stack depth at the last save/load — used to detect "back to clean state"
  private cleanDepth = 0;

  /**
   * Take a snapshot of the current score state.
   * Call this BEFORE making any mutation.
   */
  pushSnapshot(score: Score): void {
    const snapshot = exportToGp7(score);
    this.undoStack.push(snapshot);
    if (this.undoStack.length > MAX_HISTORY) {
      this.undoStack.shift();
      // cleanDepth tracks an absolute position; clamp so it never goes negative
      if (this.cleanDepth > 0) this.cleanDepth--;
    }
    this.redoStack.length = 0;
  }

  undo(currentScore: Score): Score | null {
    if (this.undoStack.length === 0) return null;
    this.redoStack.push(exportToGp7(currentScore));
    return this.deserialize(this.undoStack.pop()!);
  }

  redo(currentScore: Score): Score | null {
    if (this.redoStack.length === 0) return null;
    this.undoStack.push(exportToGp7(currentScore));
    return this.deserialize(this.redoStack.pop()!);
  }

  get canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  get canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  /** True when the current state matches the last save/load point. */
  get isAtCleanState(): boolean {
    return this.undoStack.length === this.cleanDepth;
  }

  /** Call after saving or loading to record the current clean point. */
  markClean(): void {
    this.cleanDepth = this.undoStack.length;
  }

  clear(): void {
    this.undoStack.length = 0;
    this.redoStack.length = 0;
    this.cleanDepth = 0;
  }

  private deserialize(data: Uint8Array): Score | null {
    try {
      return importer.ScoreLoader.loadScoreFromBytes(data, new Settings());
    } catch {
      return null;
    }
  }
}
