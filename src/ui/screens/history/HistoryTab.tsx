import { useQuery } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import type { HistoryEntry } from '../../../core/api/types';
import { api } from '../../../core/services';
import { historyTarget } from '../../../core/catalog/history';
import { formatDuration } from '../../../core/catalog/facts';
import { splitTitle } from '../../../core/catalog/titles';
import { t } from '../../../core/i18n';
import { Button } from '../../components/Button';
import { Card, type CardSlot } from '../../components/Card';
import { Grid } from '../../components/Grid';
import { artwork } from '../../components/artwork';
import { screenStack } from '../../nav/stack';
import { useRootBackdrop } from '../../root/rootBackdrop';
import { historyQuery } from './historyQueries';
import './HistoryTab.css';

export function HistoryTab() {
  const query = useQuery(historyQuery);
  const [focused, setFocused] = useState<HistoryEntry | null>(null);
  const [message, setMessage] = useState('');
  const busy = useRef(false);
  const generation = useRef(0);
  useEffect(() => () => { generation.current++; }, []);
  useRootBackdrop((focused ?? query.data?.[0])?.item.posters ?? null);
  const open = async (entry: HistoryEntry) => {
    if (busy.current) return;
    if (!entry.mediaId) { setMessage(t('history.unavailable')); return; }
    busy.current = true;
    const request = generation.current;
    setMessage(t('history.opening'));
    try {
      const [item, progress] = await Promise.all([api.item(entry.item.id), api.watching(entry.item.id)]);
      if (request !== generation.current) return;
      const target = historyTarget(item, entry, progress);
      if (!target) { setMessage(t('history.unavailable')); return; }
      setMessage('');
      screenStack.push('player', target);
    } catch { if (request === generation.current) setMessage(t('history.openFailed')); }
    finally { busy.current = false; }
  };
  // A failed refresh keeps the list it already shows (saved or earlier); only a list never read fails.
  const failed = query.isError && query.data === undefined;
  const state = failed ? t('history.failed') : query.isPending ? t('history.loading')
    : (query.data ?? []).length === 0 ? t('history.empty') : undefined;
  return (
    <div className="history">
      <h1>{t('tabs.history')}</h1>
      <p className="history__status" role="status">{message || state}</p>
      {failed && <Button focusKey="history:retry" label={t('history.retry')} onPress={() => void query.refetch()} />}
      <Grid<HistoryEntry> focusKey="history:grid" title={t('tabs.history')} variant="landscape" height={760}
        items={failed ? [] : query.data ?? []} itemKey={(entry) => entry.item.id}
        renderCard={renderEntry} onItemFocus={(entry) => setFocused(entry)} onItemPress={(entry) => void open(entry)} message={state} />
    </div>
  );
}

function renderEntry(entry: HistoryEntry, slot: CardSlot) {
  const { title } = splitTitle(entry.item.title);
  const subtitle = entry.mediaId ? t('history.position', { time: formatDuration(entry.time) }) : t('history.unavailable');
  return <Card {...slot} label={`${title}, ${subtitle}`} title={title} subtitle={subtitle}
    progress={entry.duration > 0 ? Math.min(1, entry.time / entry.duration) : null}
    image={artwork(entry.item.posters, 'landscape')} />;
}
