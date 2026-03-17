import {Button} from '@/components/ui/button';
import {Plus, Minus} from 'lucide-react';
import Tip from './Tip';

interface ZoomControlProps {
  zoom: number;
  onZoomChange: (zoom: number) => void;
  min?: number;
  max?: number;
  step?: number;
}

export default function ZoomControl({
  zoom,
  onZoomChange,
  min = 0.3,
  max = 3.0,
  step = 0.1,
}: ZoomControlProps) {
  return (
    <div className="space-y-4 pt-4 border-t">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">Zoom</span>
        <div className="flex items-center space-x-2">
          <Tip label="Zoom out">
            <Button
              variant="outline"
              size="icon"
              onClick={() => onZoomChange(Math.max(zoom - step, min))}
              className="h-6 w-6">
              <Minus className="h-3 w-3" />
            </Button>
          </Tip>
          <Tip label="Click to reset to 100%">
            <span
              className="text-sm font-mono bg-muted px-2 py-1 rounded min-w-[3rem] text-center cursor-pointer hover:bg-muted/80 transition-colors"
              onClick={() => onZoomChange(1.0)}>
              {Math.round(zoom * 100)}%
            </span>
          </Tip>
          <Tip label="Zoom in">
            <Button
              variant="outline"
              size="icon"
              onClick={() => onZoomChange(Math.min(zoom + step, max))}
              className="h-6 w-6">
              <Plus className="h-3 w-3" />
            </Button>
          </Tip>
        </div>
      </div>
    </div>
  );
}
