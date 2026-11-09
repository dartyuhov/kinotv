import { t } from '../../../core/i18n';
import { Button } from '../../components/Button';
import { screenStack, type ScreenParams } from '../../nav/stack';
import './DemoScreen.css';

/** Exercises nested navigation from placeholder tabs and in navigation tests. */
export function DemoScreen({ params }: { params: ScreenParams['demo'] }) {
  const next = params.n + 1;
  return (
    <div className="demo-screen">
      <h1 className="demo-screen__title">{t('demo.title', { n: params.n })}</h1>
      <p className="demo-screen__hint">{t('demo.hint')}</p>
      <div className="demo-screen__actions">
        <Button
          focusKey={`demo:${params.n}:next`}
          variant="primary"
          label={t('demo.open', { n: next })}
          onPress={() => screenStack.push('demo', { n: next })}
        />
      </div>
    </div>
  );
}
