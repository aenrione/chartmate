import {useState, useRef, useEffect} from 'react';
import * as PopoverPrimitive from '@radix-ui/react-popover';
import {ChevronDown, X, Search} from 'lucide-react';
import {cn} from '@/lib/utils';

export interface ComboboxOption {
  value: string;
  label: string;
  sublabel?: string;
}

interface SearchComboboxProps {
  options: ComboboxOption[];
  value: string;
  onSelect: (value: string, label: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  loading?: boolean;
  className?: string;
}

export default function SearchCombobox({
  options,
  value,
  onSelect,
  placeholder = 'Select…',
  searchPlaceholder = 'Search…',
  emptyText = 'No results',
  loading = false,
  className,
}: SearchComboboxProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const selected = options.find(o => o.value === value);

  const filtered = query.trim()
    ? options.filter(o =>
        o.label.toLowerCase().includes(query.toLowerCase()) ||
        (o.sublabel ?? '').toLowerCase().includes(query.toLowerCase()),
      )
    : options;

  useEffect(() => {
    if (open) {
      setQuery('');
      const id = setTimeout(() => inputRef.current?.focus(), 0);
      return () => clearTimeout(id);
    }
  }, [open]);

  function handleSelect(opt: ComboboxOption) {
    onSelect(opt.value, opt.label);
    setOpen(false);
  }

  function handleClear() {
    onSelect('', '');
  }

  return (
    <PopoverPrimitive.Root open={open} onOpenChange={setOpen}>
      <div className="relative flex">
        <PopoverPrimitive.Trigger asChild>
          <button
            type="button"
            aria-haspopup="listbox"
            aria-expanded={open}
            aria-label={selected ? selected.label : placeholder}
            className={cn(
              'w-full flex items-center justify-between gap-2 rounded-lg border border-outline-variant/20 bg-surface-container-high px-3 py-2 text-sm text-left transition-colors hover:bg-surface-container-highest focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
              !selected && 'text-on-surface-variant',
              selected && 'pr-8',
              className,
            )}
          >
            <div className="flex-1 min-w-0">
              {selected ? (
                <>
                  <div className="truncate text-on-surface">{selected.label}</div>
                  {selected.sublabel && (
                    <div className="truncate text-xs text-on-surface-variant">{selected.sublabel}</div>
                  )}
                </>
              ) : (
                <span>{placeholder}</span>
              )}
            </div>
            <ChevronDown className="h-3.5 w-3.5 text-on-surface-variant shrink-0" />
          </button>
        </PopoverPrimitive.Trigger>

        {selected && (
          <button
            type="button"
            aria-label="Clear selection"
            onClick={handleClear}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-on-surface-variant hover:text-on-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          className="z-50 w-[var(--radix-popover-trigger-width)] rounded-lg border border-outline-variant/20 bg-surface-container shadow-xl overflow-hidden"
          sideOffset={4}
          align="start"
        >
          <div className="flex items-center gap-2 px-3 py-2 border-b border-outline-variant/10">
            <Search className="h-3.5 w-3.5 text-on-surface-variant shrink-0" />
            <input
              ref={inputRef}
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder={searchPlaceholder}
              aria-label={searchPlaceholder}
              className="flex-1 bg-transparent text-sm text-on-surface placeholder:text-on-surface-variant outline-none"
            />
          </div>

          <div role="listbox" className="max-h-60 overflow-y-auto py-1">
            {loading ? (
              <div className="px-3 py-2 text-xs text-on-surface-variant">Loading…</div>
            ) : filtered.length === 0 ? (
              <div className="px-3 py-2 text-xs text-on-surface-variant">{emptyText}</div>
            ) : (
              filtered.map(opt => (
                <div
                  key={opt.value}
                  role="option"
                  aria-selected={opt.value === value}
                  tabIndex={0}
                  onClick={() => handleSelect(opt)}
                  onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleSelect(opt); } }}
                  className={cn(
                    'w-full text-left px-3 py-2 text-sm transition-colors hover:bg-surface-container-high cursor-pointer',
                    opt.value === value && 'bg-primary/10',
                  )}
                >
                  <div className={cn('font-medium truncate', opt.value === value ? 'text-primary' : 'text-on-surface')}>
                    {opt.label}
                  </div>
                  {opt.sublabel && (
                    <div className="text-xs text-on-surface-variant truncate">{opt.sublabel}</div>
                  )}
                </div>
              ))
            )}
          </div>
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}
