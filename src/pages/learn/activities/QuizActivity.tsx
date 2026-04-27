import type {QuizActivity as QuizActivityType} from '@/lib/curriculum/types';
interface Props { activity: QuizActivityType; onPass: () => void; }
export default function QuizActivity({onPass}: Props) {
  return <div onClick={onPass} className="p-8 text-center text-on-surface-variant cursor-pointer">[Quiz — tap to continue]</div>;
}
