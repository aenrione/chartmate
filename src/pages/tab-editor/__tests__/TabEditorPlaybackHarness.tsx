import {useEffect, useMemo} from 'react';
import {createMemoryRouter, RouterProvider, useLocation} from 'react-router-dom';
import {AlphaTabApi} from '@coderline/alphatab';
import TabEditorPage from '../TabEditorPage';

declare global {
  interface Window { __editorApi?: AlphaTabApi }
}

function EditorRoute() {
  const location = useLocation();
  return <><output data-testid="editor-path">{location.pathname}</output><TabEditorPage /></>;
}

export function TabEditorPlaybackHarness() {
  useEffect(() => {
    // Test-only observation of the real engine; transport actions still use the UI.
    const render = AlphaTabApi.prototype.renderScore;
    AlphaTabApi.prototype.renderScore = function (...args) {
      window.__editorApi = this;
      return render.apply(this, args);
    };
    return () => {
      AlphaTabApi.prototype.renderScore = render;
      delete window.__editorApi;
    };
  }, []);
  const router = useMemo(
    () => createMemoryRouter(
      [{path: '/tab-editor/:id?', element: <EditorRoute />}],
      {initialEntries: ['/tab-editor']},
    ),
    [],
  );

  return <RouterProvider router={router} />;
}
