import { QueryClientProvider } from '@tanstack/react-query';
import { useEffect } from 'react';
import { ScreenStack } from '../nav/ScreenStack';
import { SignInScreen } from '../screens/signin/SignInScreen';
import { queryClient, userQuery } from './queries';
import { SCREENS } from './screens';
import { Stage } from './Stage';
import { useSessionStatus } from './useSession';

export function App() {
  const signedIn = useSessionStatus() === 'signedIn';
  return (
    <QueryClientProvider client={queryClient}>
      <Stage>{signedIn ? <SignedIn /> : <SignInScreen />}</Stage>
    </QueryClientProvider>
  );
}

/**
 * The app while a session exists. The screen stack is kept across a session expiry, so after signing
 * in again the viewer is back on the screen they were on.
 */
function SignedIn() {
  // Each session starts by loading the account: it checks the session and is shown in Settings.
  useEffect(() => {
    void queryClient.prefetchQuery(userQuery);
  }, []);
  return <ScreenStack screens={SCREENS} />;
}
