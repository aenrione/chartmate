import {exportToGp7} from './exporters';
import {model, importer, Settings} from '@coderline/alphatab';

type Score = InstanceType<typeof model.Score>;

const MAX_HISTORY = 50;

export class UndoManager {
  private undoStack: Uint8Array[] = [];
  private redoStack: Uint8Array[] = [];

  /**
   * Take a snapshot of the current score state.
   * Call this BEFORE making any mutation.
   */
  pushSnapshot(score: Score): void {
    const snapshot = exportToGp7(score);
    this.undoStack.push(snapshot);
    if (this.undoStack.length > MAX_HISTORY) {
      this.undoStack.shift();
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

  clear(): void {
    this.undoStack.length = 0;
    this.redoStack.length = 0;
  }

  private deserialize(data: Uint8Array): Score | null {
    try {
      return importer.ScoreLoader.loadScoreFromBytes(data, new Settings());
    } catch {
      return null;
    }
  }
}
