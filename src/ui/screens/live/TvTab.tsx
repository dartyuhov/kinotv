import { useQuery } from '@tanstack/react-query';
import { setFocus } from '@noriginmedia/norigin-spatial-navigation';
import { useEffect } from 'react';
import { api } from '../../../core/services';
import { t } from '../../../core/i18n';
import type { LiveChannel } from '../../../core/api/types';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { Grid } from '../../components/Grid';
import { screenStack } from '../../nav/stack';
import { tabFocusKey, useTabStore } from '../../root/tabs';
import './live.css';

export function TvTab() {
  const query = useQuery({ queryKey: ['tv'], queryFn: () => api.tvChannels(), staleTime: 0, refetchOnMount: 'always', retry: false });
  const state = query.isError ? t('live.failed') : query.isPending ? t('live.loading') : !query.data.length ? t('live.empty') : undefined;
  useEffect(() => { if (query.isError) void setFocus('tv:retry'); }, [query.isError]);
  return <div className="live-tab">
    <h1>{t('tabs.tv')}</h1>
    <p role="status">{state}</p>
    {(query.isError || query.data?.length === 0) && <Button focusKey="tv:retry" label={t('player.retry')} onPress={() => void query.refetch()} />}
    <Grid<LiveChannel> focusKey="tv:grid" title={t('tabs.tv')} variant="landscape" height={760}
      items={query.isError ? [] : query.data ?? []} itemKey={(channel) => channel.id}
      renderCard={(channel, slot) => {
        const subtitle = channel.playback.kind === 'hls' ? t('live.label') : t('live.unavailable');
        return <Card {...slot} title={channel.title} label={`${channel.title}, ${subtitle}`} subtitle={subtitle} image={channel.logoUrl ?? ''} />;
      }}
      onItemPress={(channel) => screenStack.push('livePlayer', { channelId: channel.id, lineupIds: query.data!.map((c) => c.id), originTab: 'tv' })}
      message={query.isPending ? undefined : state} />
  </div>;
}

export function SportTab() {
  return <div className="live-tab">
    <h1>{t('tabs.sport')}</h1>
    <p role="status">{t('live.sportUnavailable')}</p>
    <Button focusKey="sport:tv" label={t('live.goToTv')} onPress={() => {
      useTabStore.getState().setActiveTab('tv');
      void setFocus(tabFocusKey('tv'));
    }} />
  </div>;
}
