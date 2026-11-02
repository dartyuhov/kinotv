import { FocusContext, setFocus, useFocusable } from '@noriginmedia/norigin-spatial-navigation';
import { useEffect, useRef, useState } from 'react';
import { startDeviceFlow, type DeviceFlow, type DeviceFlowState } from '../../../core/auth/deviceFlow';
import { t } from '../../../core/i18n';
import { oauth, session } from '../../../core/services';
import { Button } from '../../components/Button';
import { QrCode } from '../../components/QrCode';
import './SignInScreen.css';

const ACTION_FOCUS_KEY = 'signin:action';

/**
 * Shown instead of the app while there is no session (spec §4, §7.1): the code, the address and a QR code.
 * It moves on by itself once the viewer approves the code; the screen stack underneath is kept, so the
 * viewer returns to where they were.
 */
export function SignInScreen() {
  const [state, setState] = useState<DeviceFlowState>({ status: 'requesting' });
  const flow = useRef<DeviceFlow | null>(null);
  const { ref, focusKey } = useFocusable({ focusKey: 'signin', isFocusBoundary: true, preferredChildFocusKey: ACTION_FOCUS_KEY });

  useEffect(() => {
    const running = startDeviceFlow({ oauth, onState: setState, onApproved: (tokens) => session.signIn(tokens) });
    flow.current = running;
    return () => running.stop();
  }, []);

  useEffect(() => {
    void setFocus(ACTION_FOCUS_KEY);
  }, []);

  return (
    <FocusContext.Provider value={focusKey}>
      <div ref={ref} className="signin" data-screen="signin">
        <h1 className="signin__title">{t('signin.title')}</h1>
        {state.status === 'failed' ? (
          <p className="signin__message">{t('signin.failed')}</p>
        ) : (
          <div className="signin__body">
            <ol className="signin__steps">
              <li>
                <p className="signin__label">{t('signin.open')}</p>
                <p className="signin__address">{state.status === 'waiting' ? displayAddress(state.verificationUri) : ' '}</p>
              </li>
              <li>
                <p className="signin__label">{t('signin.enterCode')}</p>
                <p className="signin__code">{state.status === 'waiting' ? state.userCode : ' '}</p>
              </li>
            </ol>
            <div className="signin__qr">
              {state.status === 'waiting' && (
                <QrCode value={state.verificationUri} size={360} label={t('signin.qr', { url: state.verificationUri })} />
              )}
              <p className="signin__hint">{t('signin.scan')}</p>
            </div>
          </div>
        )}
        <div className="signin__actions">
          <Button
            focusKey={ACTION_FOCUS_KEY}
            label={state.status === 'failed' ? t('signin.retry') : t('signin.newCode')}
            onPress={() => flow.current?.restart()}
          />
        </div>
      </div>
    </FocusContext.Provider>
  );
}

/** "https://kino.watch/device" → "kino.watch/device": shorter to read off a TV and to type. */
function displayAddress(uri: string): string {
  return uri.replace(/^https?:\/\//, '').replace(/\/$/, '');
}
