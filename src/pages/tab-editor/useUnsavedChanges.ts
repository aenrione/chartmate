import {useState, useCallback, useRef} from 'react';
import {useBlocker} from 'react-router-dom';

export function useUnsavedChanges() {
  const [isDirty, setIsDirty] = useState(false);
  const dirtyRef = useRef(false);

  // A successful save may navigate before React commits the clean-state render.
  const blocker = useBlocker(useCallback(() => dirtyRef.current, []));

  const markDirty = useCallback(() => {
    dirtyRef.current = true;
    setIsDirty(true);
  }, []);
  const markClean = useCallback(() => {
    dirtyRef.current = false;
    setIsDirty(false);
  }, []);

  return {isDirty, markDirty, markClean, blocker};
}
