import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/inter/latin-400.css';
import '@fontsource/inter/latin-600.css';
import '@fontsource/inter/latin-700.css';
import '@fontsource/inter/latin-800.css';
import '@fontsource/inter/cyrillic-400.css';
import '@fontsource/inter/cyrillic-600.css';
import '@fontsource/inter/cyrillic-700.css';
import '@fontsource/inter/cyrillic-800.css';
import './ui/theme/tokens.css';
import './ui/theme/global.css';
import { remoteBus } from './core/input/remoteBus';
import { registerRemoteKeys } from './core/platform/keys';
import { startSpatialNavigation } from './ui/focus/spatialNavigation';
import { App } from './ui/app/App';

registerRemoteKeys();
startSpatialNavigation(remoteBus);
remoteBus.listen(window);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
