import {useMemo} from 'react';
import {createMemoryRouter, RouterProvider} from 'react-router-dom';
import TabEditorPage from '../TabEditorPage';

export function TabEditorPlaybackHarness() {
  const router = useMemo(
    () => createMemoryRouter(
      [{path: '/tab-editor', element: <TabEditorPage />}],
      {initialEntries: ['/tab-editor']},
    ),
    [],
  );

  return <RouterProvider router={router} />;
}
