import {act, fireEvent, render, screen} from '@testing-library/react';
import {createMemoryRouter, RouterProvider, useNavigate} from 'react-router-dom';
import {describe, expect, it} from 'vitest';
import {useUnsavedChanges} from '../useUnsavedChanges';

function Editor() {
  const {isDirty, markDirty, markClean, blocker} = useUnsavedChanges();
  const navigate = useNavigate();
  return <>
    <span>{isDirty ? 'Dirty' : 'Clean'}</span>
    <button onClick={markDirty}>Edit</button>
    <button onClick={() => navigate('/saved')}>Leave</button>
    <button onClick={() => { markDirty(); navigate('/saved'); }}>Edit and leave</button>
    <button onClick={() => { markClean(); navigate('/saved'); }}>Save and continue</button>
    {blocker.state === 'blocked' && <span>Unsaved changes</span>}
  </>;
}

function setup() {
  const router = createMemoryRouter([
    {path: '/', element: <Editor />},
    {path: '/saved', element: <span>Saved composition</span>},
  ]);
  render(<RouterProvider router={router} />);
  return router;
}

describe('useUnsavedChanges', () => {
  it('lets the first save navigate immediately without a stale dirty-state prompt', async () => {
    const router = setup();
    fireEvent.click(screen.getByText('Edit'));
    expect(screen.getByText('Dirty')).toBeTruthy();

    await act(async () => { fireEvent.click(screen.getByText('Save and continue')); });

    expect(router.state.location.pathname).toBe('/saved');
    expect(screen.getByText('Saved composition')).toBeTruthy();
    expect(screen.queryByText('Unsaved changes')).toBeNull();
  });

  it('still blocks leaving an edited composition', async () => {
    const router = setup();
    fireEvent.click(screen.getByText('Edit'));
    await act(async () => { fireEvent.click(screen.getByText('Leave')); });

    expect(router.state.location.pathname).toBe('/');
    expect(screen.getByText('Unsaved changes')).toBeTruthy();
  });

  it('blocks navigation even when an edit and navigation occur in the same event', async () => {
    const router = setup();
    await act(async () => { fireEvent.click(screen.getByText('Edit and leave')); });

    expect(router.state.location.pathname).toBe('/');
    expect(screen.getByText('Unsaved changes')).toBeTruthy();
  });
});
