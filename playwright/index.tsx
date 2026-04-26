import {beforeMount} from '@playwright/experimental-ct-react/hooks';
import {MemoryRouter} from 'react-router-dom';
import '../src/index.css';

export type HooksConfig = {
  routing?: boolean;
};

beforeMount<HooksConfig>(async ({App, hooksConfig}) => {
  if (hooksConfig?.routing) {
    return (
      <MemoryRouter>
        <App />
      </MemoryRouter>
    );
  }
});
