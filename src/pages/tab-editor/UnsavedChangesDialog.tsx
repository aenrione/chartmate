interface UnsavedChangesDialogProps {
  isOpen: boolean;
  onDiscard: () => void;
  onSave: () => void;
  onCancel: () => void;
}

export function UnsavedChangesDialog({isOpen, onDiscard, onSave, onCancel}: UnsavedChangesDialogProps) {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-surface-container rounded-2xl p-6 max-w-sm w-full mx-4 shadow-xl space-y-4">
        <h2 className="text-base font-bold text-on-surface">Unsaved Changes</h2>
        <p className="text-sm text-on-surface-variant">You have unsaved changes. Save before continuing?</p>
        <div className="flex gap-2 justify-end">
          <button
            onClick={onCancel}
            className="px-3 py-1.5 text-sm rounded-lg text-on-surface-variant hover:bg-surface-container-high transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onDiscard}
            className="px-3 py-1.5 text-sm rounded-lg text-on-surface-variant hover:bg-surface-container-high transition-colors"
          >
            Discard
          </button>
          <button
            onClick={onSave}
            className="px-3 py-1.5 text-sm rounded-lg bg-primary text-on-primary hover:bg-primary/90 transition-colors"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
