/**
 * The app going to the background and coming back (Home button, standby, another app). Tizen web apps
 * get the standard `visibilitychange`, so the browser and the TV share one implementation. JS timers
 * stop while the TV is in standby, so do what must happen before sleeping (saving progress) right
 * away in the listener.
 */
export function onVisibilityChange(listener: (visible: boolean) => void): () => void {
  const handle = () => listener(document.visibilityState !== 'hidden');
  document.addEventListener('visibilitychange', handle);
  return () => document.removeEventListener('visibilitychange', handle);
}
