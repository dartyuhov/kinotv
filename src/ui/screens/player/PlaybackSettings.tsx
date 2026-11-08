import { useEffect, useRef, useState } from 'react';
import { languageName } from '../../../core/catalog/facts';
import { t } from '../../../core/i18n';
import { remoteBus } from '../../../core/input/remoteBus';
import { useBackHandler } from '../../nav/useBackHandler';
import { usePlayerKeyCapture } from './playerUi';
import type { usePlaybackChoices } from './usePlaybackChoices';
import './PlaybackSettings.css';

export type PlaybackChoices = ReturnType<typeof usePlaybackChoices>;

export function PlaybackSettings({ choices, title, onClose }: { choices: PlaybackChoices; title: string; onClose(): void }) {
  usePlayerKeyCapture(true);
  useBackHandler(() => { onClose(); return true; });
  const [tab, setTab] = useState(0);
  const [column, setColumn] = useState(0);
  const [row, setRow] = useState(-1);
  const root = useRef<HTMLDivElement>(null);
  const { tracks } = choices;
  const audio = tracks.audio.map((track) => ({ id: track.id, label: track.label.replace(track.lang, languageName(track.lang)),
    selected: track.selected, pending: track.pending, select: () => choices.chooseAudio(track.id) }));
  const subtitles = [
    { id: 'off', label: t('player.off'), selected: tracks.subtitlesOff === true && !choices.external, pending: false, select: () => choices.chooseSubtitle(null) },
    ...tracks.subtitles.map((track) => ({ id: track.id, label: track.label.replace(track.lang, languageName(track.lang)), selected: track.selected, pending: track.pending, select: () => choices.chooseSubtitle(track.id) })),
    ...choices.externalOptions.map((track) => ({ id: track.id, label: `${languageName(track.lang)} · ${t('player.external')}${track.forced ? ` · ${t('player.forced')}` : ''}`,
      selected: choices.external === track.id, pending: false, select: () => choices.chooseSubtitle(track.id) })),
  ];
  const quality = ['auto', ...choices.qualities].map((id) => ({ id, label: id === 'auto' ? t('player.auto') : id,
    selected: choices.quality === id, pending: false, select: () => choices.chooseQuality(id) }));
  const columns = tab === 1 ? [audio, subtitles] : tab === 2 ? [quality] : [];
  const activeColumn = Math.min(column, Math.max(0, columns.length - 1));
  const activeRow = Math.min(row, (columns[activeColumn]?.length ?? 0) - 1);
  const latest = useRef({ tab, row: activeRow, column: activeColumn, columns, choices, onClose });
  latest.current = { tab, row: activeRow, column: activeColumn, columns, choices, onClose };
  useEffect(() => remoteBus.subscribe((key) => {
    const state = latest.current;
    if (key === 'left' || key === 'right') {
      const direction = key === 'left' ? -1 : 1;
      if (state.row === -1) { setTab(Math.max(0, Math.min(2, state.tab + direction))); setColumn(0); }
      else { setColumn(Math.max(0, Math.min(state.columns.length - 1, state.column + direction))); setRow(0); }
    } else if (key === 'up') setRow(Math.max(-1, state.row - 1));
    else if (key === 'down') setRow(Math.min((state.columns[state.column]?.length ?? 0) - 1, state.row + 1));
    else if (key === 'ok' && state.row >= 0 && !state.choices.busy) state.columns[state.column]?.[state.row]?.select();
    else if (key === 'stop') state.onClose();
  }), []);
  useEffect(() => {
    const focused = root.current?.querySelector<HTMLElement>('[data-focused="true"]');
    focused?.focus({ preventScroll: true });
    focused?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [tab, activeColumn, activeRow]);
  const tabs = [t('player.info'), t('player.audioSubtitles'), t('player.quality')];
  return <div className="playback-settings-scrim"><div ref={root} className="playback-settings" role="dialog" aria-modal="true" aria-label={t('player.settings')}>
    <div className="playback-settings__heading"><h2>{t('player.settings')}</h2><span>{t('player.panelHint')}</span></div>
    <div className="playback-settings__tabs" role="tablist">{tabs.map((label, index) => <button key={label} role="tab" aria-selected={tab === index} tabIndex={tab === index && activeRow === -1 ? 0 : -1}
      data-focused={tab === index && activeRow === -1} onClick={() => { setTab(index); setRow(-1); }}>{label}</button>)}</div>
    {tab === 0 ? <div className="playback-settings__info"><h3>{title}</h3><p>{t('player.quality')}: {choices.quality === 'auto' ? t('player.auto') : choices.quality}</p>
      <p>{t('player.trackLabelHint')}</p><p>{t('player.fixedHint')}</p></div> : <div className="playback-settings__columns">
      {columns.map((options, col) => <section key={`${tab}:${col}`}><h3>{tab === 2 ? t('player.quality') : col === 0 ? t('player.audio') : t('player.subtitles')}</h3>
        <div className="playback-settings__list" role="group">{!options.length && <p>{t('player.noTracks')}</p>}
          {options.map((option, index) => <button key={option.id} tabIndex={activeColumn === col && activeRow === index ? 0 : -1}
            data-focused={activeColumn === col && activeRow === index} aria-pressed={option.selected === true} aria-disabled={choices.busy}
            onClick={() => { if (!choices.busy) option.select(); }}><span>{option.label}</span><span>{option.pending ? t('player.pending') : option.selected ? `✓ ${t('player.applied')}` : ''}</span></button>)}
        </div></section>)}
    </div>}
    <p className="playback-settings__status" role="status">{choices.busy ? t('player.switching') : choices.notice === 'subtitleFailed' ? t('player.subtitleFailed') :
      choices.notice === 'subtitleLoading' ? t('player.subtitleLoading') : choices.notice === 'fallback' ? t('player.fallback') : tracks.audio.some((track) => track.pending) ? t('player.pendingHint') : ''}</p>
  </div></div>;
}

export function PlaybackPills({ choices, open }: { choices: PlaybackChoices; open(): void }) {
  const audio = choices.tracks.audio.find((track) => track.pending) ?? choices.tracks.audio.find((track) => track.selected);
  const subtitle = choices.tracks.subtitles.find((track) => track.selected);
  return <div className="playback-pills" aria-label={t('player.settings')}>
    <button tabIndex={-1} onClick={open}>▲ {t('player.audio')}: {audio ? `${languageName(audio.lang)}${audio.pending ? ` · ${t('player.pending')}` : ''}` : '—'}</button>
    <button tabIndex={-1} onClick={open}>{t('player.subtitles')}: {choices.external ? t('player.external') : subtitle ? languageName(subtitle.lang) : t('player.off')}</button>
    <button tabIndex={-1} onClick={open}>{choices.quality === 'auto' ? t('player.auto') : choices.quality}</button>
  </div>;
}
