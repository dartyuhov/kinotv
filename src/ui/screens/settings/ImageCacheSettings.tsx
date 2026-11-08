import { useEffect, useRef, useState } from 'react';
import { getLocale, t } from '../../../core/i18n';
import { imageCache } from '../../../core/images';
import type { ImageDiagnostics, ImageUsage } from '../../../core/images/cache';
import { Button } from '../../components/Button';

export function ImageCacheSettings() {
  const [snapshot, setSnapshot] = useState<{ usage: ImageUsage; diagnostics: ImageDiagnostics }>();
  const [feedback, setFeedback] = useState<'clearing' | 'cleared' | 'failed'>();
  const busy = useRef(false);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    const update = async () => {
      const [usage, diagnostics] = await Promise.all([imageCache().usage(), imageCache().diagnostics()]);
      if (!active) return;
      setSnapshot({ usage, diagnostics });
      timer = setTimeout(() => { void update(); }, 1000);
    };
    void update();
    return () => { active = false; clearTimeout(timer); };
  }, [revision]);
  const clear = async () => {
    if (busy.current) return;
    busy.current = true;
    setFeedback('clearing');
    try { await imageCache().clear(); setFeedback('cleared'); }
    catch { setFeedback('failed'); }
    finally { busy.current = false; setRevision((value) => value + 1); }
  };
  const mib = (bytes: number) => (bytes / (1024 * 1024)).toLocaleString(getLocale(), { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  return (
    <section className="settings-tab__cache" aria-label={t('settings.imageCacheClear')} aria-busy={feedback === 'clearing'}>
      <h2>{snapshot ? t('settings.imageCache', { used: mib(snapshot.usage.managedBytes) }) : t('settings.imageCacheLoading')}</h2>
      {snapshot && <>
        <p>{t(snapshot.usage.persistenceAvailable ? 'settings.imageCacheAvailable' : 'settings.imageCacheUnavailable')}</p>
        <p className="settings-tab__diagnostics">{t('settings.imageCacheDiagnostics', {
          hits: snapshot.diagnostics.hits, misses: snapshot.diagnostics.misses,
          evictions: snapshot.diagnostics.evictions, downloaded: mib(snapshot.diagnostics.downloadedBytes),
        })}</p>
      </>}
      <Button focusKey="settings:clear-images" label={t('settings.imageCacheClear')} onPress={() => { void clear(); }} />
      <p role={feedback === 'failed' ? 'alert' : 'status'}>{feedback ? t(feedback === 'clearing' ? 'settings.imageCacheClearing'
        : feedback === 'cleared' ? 'settings.imageCacheCleared' : 'settings.imageCacheFailed') : ' '}</p>
    </section>
  );
}
