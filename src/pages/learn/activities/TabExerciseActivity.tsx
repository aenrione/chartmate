import type {TabExerciseActivity as TabExerciseActivityType} from '@/lib/curriculum/types';
interface Props { activity: TabExerciseActivityType; onPass: () => void; }
export default function TabExerciseActivity({onPass}: Props) {
  return <div onClick={onPass} className="p-8 text-center text-on-surface-variant cursor-pointer">[Tab Exercise — tap to continue]</div>;
}
