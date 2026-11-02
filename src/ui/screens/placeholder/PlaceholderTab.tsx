import { t } from '../../../core/i18n';
import { Button } from '../../components/Button';
import { screenStack } from '../../nav/stack';
import type { TabId } from '../../root/tabs';
import './PlaceholderTab.css';

const DEMO_ACTIONS = [1, 2, 3, 4, 5, 6, 7, 8];

/**
 * Stand-in for a tab's real screen until its ticket lands. Its actions push a demo screen, so
 * push/pop focus and scroll restore can be exercised from every tab.
 */
export function PlaceholderTab({ tab }: { tab: TabId }) {
  return (
    <div className="placeholder-tab">
      <h1 className="placeholder-tab__title">{t(`tabs.${tab}`)}</h1>
      <p className="placeholder-tab__note">{t('placeholder.comingSoon')}</p>
      <div className="placeholder-tab__actions">
        {DEMO_ACTIONS.map((n) => (
          <Button
            key={n}
            focusKey={`${tab}:demo:${n}`}
            label={t('demo.open', { n })}
            onPress={() => screenStack.push('demo', { n })}
          />
        ))}
      </div>
    </div>
  );
}
