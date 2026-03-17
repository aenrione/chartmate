import {Button} from '@/components/ui/button';
import {Plus, Minus} from 'lucide-react';
import Tip from './Tip';

interface TempoControlProps {
  tempo: number;
  onTempoChange: (tempo: number) => void;
  min?: number;
  max?: number;
  step?: number;
}

export default function TempoControl({
  tempo,
  onTempoChange,
  min = 0.25,
  max = 4.0,
  step = 0.1,
}: TempoControlProps) {
  return (
    <div className="space-y-4 pt-4 border-t">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">Speed</span>
        <div className="flex items-center space-x-2">
          <Tip label="Slow down">
            <Button
              variant="outline"
              size="icon"
              onClick={() => {
                const newTempo = Math.max(tempo - step, min);
                onTempoChange(newTempo);
              }}
              className="h-6 w-6">
              <Minus className="h-3 w-3" />
            </Button>
          </Tip>
          <Tip label="Click to reset to 100%">
            <span
              className="text-sm font-mono bg-muted px-2 py-1 rounded min-w-[3rem] text-center cursor-pointer hover:bg-muted/80 transition-colors"
              onClick={() => onTempoChange(1.0)}>
              {Math.round(tempo * 100)}%
            </span>
          </Tip>
          <Tip label="Speed up">
            <Button
              variant="outline"
              size="icon"
              onClick={() => {
                const newTempo = Math.min(tempo + step, max);
                onTempoChange(newTempo);
              }}
              className="h-6 w-6">
              <Plus className="h-3 w-3" />
            </Button>
          </Tip>
        </div>
      </div>
    </div>
  );
}
