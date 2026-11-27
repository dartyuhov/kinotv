import { useEffect } from 'react';
import type { HistoryEntry } from '../../core/api/types';
import { t } from '../../core/i18n';
import { createPreviewPublisher, launchPreviewService, previewData, previewTarget, requestedAppControlData } from '../../core/platform/preview';
import { tizen } from '../../core/platform/tizenGlobals';
import { screenStack } from '../nav/stack';
import { historyQuery } from '../screens/history/historyQueries';
import { queryClient } from './queries';

/** A tile that started the app is opened once, the first time a signed-in app shows. */
let coldStartHandled = false;

/**
 * Smart Hub preview, while signed in on a TV (core/platform/preview.ts):
 * - a tapped tile opens its title, both when it starts the app and when it resumes it ('appcontrol');
 * - the tiles follow History: whenever its data is created or updated they are re-sent (the publisher
 *   skips unchanged data and keeps to the TV's 10-minute limit);
 * - History is read in the background after startup, so the tiles stay current without opening it.
 */
export function useSmartHubPreview(): void {
  useEffect(() => {
    if (!tizen()?.application) return;
    const open = () => {
      const target = previewTarget(requestedAppControlData());
      if (target) screenStack.push('title', { id: target.itemId });
    };
    if (!coldStartHandled) { coldStartHandled = true; open(); }
    window.addEventListener('appcontrol', open);

    const publisher = createPreviewPublisher({ launch: launchPreviewService });
    const publish = (entries: HistoryEntry[] | undefined) => {
      const json = entries && previewData(entries, t('preview.history'));
      if (json) void publisher.publish(json);
    };
    publish(queryClient.getQueryData(historyQuery.queryKey));
    const unsubscribe = queryClient.getQueryCache().subscribe((event) => {
      if ((event.type === 'added' || event.type === 'updated') && event.query.queryKey[0] === historyQuery.queryKey[0]) {
        publish(event.query.state.data as HistoryEntry[] | undefined);
      }
    });
    const prefetch = setTimeout(() => { void queryClient.prefetchQuery(historyQuery); }, 15_000);
    return () => { window.removeEventListener('appcontrol', open); unsubscribe(); clearTimeout(prefetch); };
  }, []);
}
