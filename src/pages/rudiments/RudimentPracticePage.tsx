import { useParams, Navigate } from 'react-router-dom';
import { getRudimentById } from './rudimentData';
import RudimentPracticeView from './RudimentPracticeView';

export default function RudimentPracticePage() {
  const { id } = useParams<{ id: string }>();
  const rudimentId = Number(id);
  const rudiment = getRudimentById(rudimentId);

  if (!rudiment) {
    return <Navigate to="/rudiments" replace />;
  }

  return <RudimentPracticeView rudiment={rudiment} />;
}
