interface NoteButtonsProps {
  options: string[];
  onSelect: (note: string) => void;
  selectedNote?: string | null;
  correctNote?: string | null;
  disabled?: boolean;
  showResult?: boolean;
}

// Keyboard shortcut labels for the 12 chromatic notes
const KEY_LABELS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '-', '='];

export default function NoteButtons({
  options,
  onSelect,
  selectedNote,
  correctNote,
  disabled = false,
  showResult = false,
}: NoteButtonsProps) {
  function getButtonStyle(note: string) {
    if (showResult && correctNote) {
      if (note === correctNote) {
        return 'bg-secondary-container/20 border-secondary-container ring-1 ring-secondary-container text-secondary';
      }
      if (note === selectedNote && note !== correctNote) {
        return 'bg-error-container/20 border-error ring-1 ring-error text-error';
      }
    }
    if (note === selectedNote && !showResult) {
      return 'bg-surface-container-high border-primary-container ring-1 ring-primary-container ring-offset-4 ring-offset-surface shadow-xl text-primary';
    }
    return 'bg-surface-container hover:bg-surface-container-high border-outline-variant/10 text-on-surface';
  }

  return (
    <div className="grid grid-cols-6 lg:grid-cols-12 gap-1.5 lg:gap-3 w-full">
      {options.map((note, idx) => (
        <button
          key={note}
          onClick={() => !disabled && onSelect(note)}
          disabled={disabled}
          className={`group flex flex-col items-center justify-center py-2 lg:py-4 px-1 lg:px-3 rounded-xl border transition-all duration-200 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed ${getButtonStyle(note)}`}
        >
          <span className="text-sm lg:text-lg font-headline font-extrabold">{note}</span>
          {idx < KEY_LABELS.length && (
            <span className="text-[8px] font-mono text-on-surface-variant/40 mt-0.5 hidden lg:block">
              {KEY_LABELS[idx]}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}
