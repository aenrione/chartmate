import {useEffect, useState} from 'react';
import SearchCombobox from '@/components/ui/search-combobox';
import type {ComboboxOption} from '@/components/ui/search-combobox';
import {listCompositions} from '@/lib/local-db/tab-compositions';

interface TabPickerProps {
  value: string;
  onSelect: (value: string, label: string) => void;
}

export default function TabPicker({value, onSelect}: TabPickerProps) {
  const [options, setOptions] = useState<ComboboxOption[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    listCompositions()
      .then(comps =>
        setOptions(
          comps.map(c => ({
            value: String(c.id),
            label: c.title,
            sublabel: c.artist || undefined,
          })),
        ),
      )
      .finally(() => setLoading(false));
  }, []);

  return (
    <SearchCombobox
      options={options}
      value={value}
      onSelect={onSelect}
      placeholder="Search tab compositions…"
      searchPlaceholder="Type title or artist…"
      emptyText={loading ? 'Loading…' : 'No tab compositions found'}
      loading={loading}
    />
  );
}
