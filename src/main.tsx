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
import { config } from './core/config';
import { remoteBus } from './core/input/remoteBus';
import { registerRemoteKeys } from './core/platform/keys';
import { loadWebapis } from './core/platform/tizenGlobals';
import { startServices } from './core/services';
import { startUpdateCheck } from './core/updates/updateCheck';
import { startSpatialNavigation } from './ui/focus/spatialNavigation';
import { screenStack } from './ui/nav/stack';
import { App } from './ui/app/App';

registerRemoteKeys();
startSpatialNavigation(remoteBus);
// The bottom of the Back stack: pop the top screen. Screens and dialogs push their own handlers above it.
remoteBus.pushBackHandler(() => screenStack.pop());
remoteBus.listen(window);
startServices();
// At most once a day; Settings shows "Update available" when GitHub has a newer release.
startUpdateCheck({ releasesUrl: config.releasesUrl, currentVersion: config.appVersion, storage: window.localStorage });

// Factory selection must wait for the Samsung script, including with a restored session.
void loadWebapis().then(() => createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
));
