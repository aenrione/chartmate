import {useEffect, useState} from 'react';
import SearchCombobox from '@/components/ui/search-combobox';
import type {ComboboxOption} from '@/components/ui/search-combobox';
import {getSavedCharts} from '@/lib/local-db/saved-charts';

interface SongPickerProps {
  value: string;
  onSelect: (value: string, label: string) => void;
}

export default function SongPicker({value, onSelect}: SongPickerProps) {
  const [options, setOptions] = useState<ComboboxOption[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getSavedCharts()
      .then(charts =>
        setOptions(
          charts.map(c => ({
            value: c.md5,
            label: c.name,
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
      placeholder="Search saved songs…"
      searchPlaceholder="Type song or artist name…"
      emptyText={loading ? 'Loading…' : 'No saved songs found'}
      loading={loading}
    />
  );
}
