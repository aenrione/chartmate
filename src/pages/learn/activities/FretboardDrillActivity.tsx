import type {FretboardDrillActivity as FretboardDrillActivityType} from '@/lib/curriculum/types';
interface Props { activity: FretboardDrillActivityType; onPass: () => void; }
export default function FretboardDrillActivity({onPass}: Props) {
  return <div onClick={onPass} className="p-8 text-center text-on-surface-variant cursor-pointer">[Fretboard Drill — tap to continue]</div>;
}
