import {useParams} from 'react-router-dom';

export default function LessonRunnerPage() {
  const {instrument, unitId, lessonId} = useParams();
  return (
    <div className="flex-1 flex items-center justify-center text-on-surface-variant">
      <p>Lesson: {instrument}/{unitId}/{lessonId}</p>
    </div>
  );
}
