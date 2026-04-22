import {useState, useCallback} from 'react';
import {useBlocker} from 'react-router-dom';

export function useUnsavedChanges() {
  const [isDirty, setIsDirty] = useState(false);

  const blocker = useBlocker(isDirty);

  const markDirty = useCallback(() => setIsDirty(true), []);
  const markClean = useCallback(() => setIsDirty(false), []);

  return {isDirty, markDirty, markClean, blocker};
}
