import { useParams, Navigate } from 'react-router-dom';
import { getFillById } from './fillsData';
import FillPracticeView from './FillPracticeView';

export default function FillPracticePage() {
  const { id } = useParams<{ id: string }>();
  const fill = getFillById(id ?? '');
  if (!fill) return <Navigate to="/fills" replace />;
  return <FillPracticeView fill={fill} />;
}
