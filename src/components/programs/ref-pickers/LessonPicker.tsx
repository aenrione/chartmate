import {useEffect, useState} from 'react';
import SearchCombobox from '@/components/ui/search-combobox';
import type {ComboboxOption} from '@/components/ui/search-combobox';
import {loadAllUnits} from '@/lib/curriculum/loader';
import type {Instrument} from '@/lib/curriculum/types';

interface LessonPickerProps {
  value: string;
  onSelect: (value: string, label: string) => void;
  instrument?: string;
}

const KNOWN_INSTRUMENTS: Instrument[] = ['guitar', 'drums'];

export default function LessonPicker({value, onSelect, instrument}: LessonPickerProps) {
  const [options, setOptions] = useState<ComboboxOption[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const instruments: Instrument[] =
        instrument === 'guitar' || instrument === 'drums'
          ? [instrument]
          : KNOWN_INSTRUMENTS;

      const perInstrument = await Promise.all(
        instruments.map(async instr => {
          const units = await loadAllUnits(instr);
          const opts: ComboboxOption[] = [];
          for (const unit of units) {
            for (const lesson of unit.loadedLessons) {
              const sublabel =
                instruments.length > 1
                  ? `${instr.charAt(0).toUpperCase() + instr.slice(1)} — ${unit.title}`
                  : unit.title;
              opts.push({
                value: `${instr}/${unit.id}/${lesson.id}`,
                label: lesson.title,
                sublabel,
              });
            }
          }
          return opts;
        }),
      );

      setOptions(perInstrument.flat());
    }

    load().finally(() => setLoading(false));
  }, [instrument]);

  return (
    <SearchCombobox
      options={options}
      value={value}
      onSelect={onSelect}
      placeholder="Search curriculum lessons…"
      searchPlaceholder="Type lesson or unit name…"
      emptyText={loading ? 'Loading…' : 'No lessons found'}
      loading={loading}
    />
  );
}
