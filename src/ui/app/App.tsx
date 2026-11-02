import { ScreenStack } from '../nav/ScreenStack';
import { SignInScreen } from '../screens/signin/SignInScreen';
import { SCREENS } from './screens';
import { Stage } from './Stage';
import { useSessionStatus } from './useSession';

export function App() {
  const signedIn = useSessionStatus() === 'signedIn';
  return <Stage>{signedIn ? <ScreenStack screens={SCREENS} /> : <SignInScreen />}</Stage>;
}
