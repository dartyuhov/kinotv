import { tizen } from './tizenGlobals';

/**
 * Closes the app. On Tizen this exits the application. In the browser there is nothing to close,
 * so it marks <html data-exit-requested="true">, which the e2e tests (and you, in dev) can observe.
 */
export function exitApp(): void {
  const application = tizen()?.application;
  if (application) {
    application.getCurrentApplication().exit();
    return;
  }
  document.documentElement.dataset.exitRequested = 'true';
}
