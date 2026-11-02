import { FocusContext, useFocusable } from '@noriginmedia/norigin-spatial-navigation';
import { useQuery } from '@tanstack/react-query';
import { ChevronDown } from 'lucide-react';
import { useState } from 'react';
import {
  sectionTypes,
  withType,
  yearOptions,
  type CatalogFilter,
  type CatalogSection,
  type CatalogSort,
} from '../../../core/catalog/catalogFilter';
import { typeLabel } from '../../../core/catalog/facts';
import { t, type MessageKey } from '../../../core/i18n';
import { OptionPicker, type PickerOption } from '../../components/OptionPicker';
import { countriesQuery, genresQuery, typesQuery } from './catalogQueries';
import './FilterBar.css';

type FilterId = 'type' | 'genre' | 'year' | 'country' | 'sort';

interface FilterSpec {
  id: FilterId;
  name: string;
  options: PickerOption[];
  /** The option value of the current choice ('' is "any"). */
  selected: string;
  apply(value: string): CatalogFilter;
}

const SORTS: CatalogSort[] = ['newest', 'popular', 'rating'];
const SORT_LABEL: Record<CatalogSort, MessageKey> = {
  newest: 'catalog.sort.newest',
  popular: 'catalog.sort.popular',
  rating: 'catalog.sort.rating',
};

/** Focus key of a section's filter row; its chips are `<section>:filter:<type|genre|year|country|sort>`. */
export const filterBarKey = (section: CatalogSection) => `${section}:filters`;

interface FilterBarProps {
  section: CatalogSection;
  filter: CatalogFilter;
  /** A different choice was picked. */
  onChange(filter: CatalogFilter): void;
}

/**
 * The filter row of Movies and Series (spec §4): a chip per filter showing its current choice. OK on a
 * chip opens a picker of its choices. Remote only: Left/Right along the chips, Down to the grid.
 */
export function FilterBar({ section, filter, onChange }: FilterBarProps) {
  const filters = useFilterSpecs(section, filter);
  const [open, setOpen] = useState<FilterId | null>(null);
  const { ref, focusKey } = useFocusable<object, HTMLDivElement>({ focusKey: filterBarKey(section) });
  const openSpec = filters.find((f) => f.id === open);

  return (
    <FocusContext.Provider value={focusKey}>
      <div ref={ref} className="filter-bar">
        {filters.map((spec) => (
          <FilterChip
            key={spec.id}
            focusKey={`${section}:filter:${spec.id}`}
            name={spec.name}
            value={spec.options.find((o) => o.value === spec.selected)?.label ?? spec.selected}
            onPress={() => setOpen(spec.id)}
          />
        ))}
      </div>
      {openSpec && (
        <OptionPicker
          id={`${section}:picker:${openSpec.id}`}
          title={openSpec.name}
          options={openSpec.options}
          selected={openSpec.selected}
          onClose={() => setOpen(null)}
          onPick={(value) => {
            setOpen(null);
            if (value !== openSpec.selected) onChange(openSpec.apply(value));
          }}
        />
      )}
    </FocusContext.Provider>
  );
}

/** Each filter's choices: types, genres and countries from the API, years and sorts from the app. */
function useFilterSpecs(section: CatalogSection, filter: CatalogFilter): FilterSpec[] {
  const types = useQuery(typesQuery).data;
  const genres = useQuery(genresQuery(filter.type)).data ?? [];
  const countries = useQuery(countriesQuery).data ?? [];

  const typeOptions = sectionTypes(section, types ?? []).map((type) => ({ value: type.id, label: type.title }));
  // Until the types arrive (or if they can't), the current type is the only choice.
  if (!typeOptions.some((o) => o.value === filter.type)) {
    typeOptions.unshift({ value: filter.type, label: typeLabel(filter.type) ?? filter.type });
  }
  const years = yearOptions(new Date().getFullYear()).map((year) => {
    const [from, to] = year.split('-');
    return { value: year, label: to ? t('catalog.years', { from: from!, to }) : year };
  });

  return [
    {
      id: 'type',
      name: t('catalog.filter.type'),
      options: typeOptions,
      selected: filter.type,
      apply: (value) => withType(filter, value),
    },
    {
      id: 'genre',
      name: t('catalog.filter.genre'),
      options: [any('catalog.anyGenre'), ...genres.map((g) => ({ value: String(g.id), label: g.title }))],
      selected: filter.genre === null ? '' : String(filter.genre),
      apply: (value) => ({ ...filter, genre: value ? Number(value) : null }),
    },
    {
      id: 'year',
      name: t('catalog.filter.year'),
      options: [any('catalog.anyYear'), ...years],
      selected: filter.year ?? '',
      apply: (value) => ({ ...filter, year: value || null }),
    },
    {
      id: 'country',
      name: t('catalog.filter.country'),
      options: [any('catalog.anyCountry'), ...countries.map((c) => ({ value: String(c.id), label: c.title }))],
      selected: filter.country === null ? '' : String(filter.country),
      apply: (value) => ({ ...filter, country: value ? Number(value) : null }),
    },
    {
      id: 'sort',
      name: t('catalog.filter.sort'),
      options: SORTS.map((sort) => ({ value: sort, label: t(SORT_LABEL[sort]) })),
      selected: filter.sort,
      apply: (value) => ({ ...filter, sort: value as CatalogSort }),
    },
  ];
}

const any = (key: MessageKey): PickerOption => ({ value: '', label: t(key) });

/** A compact pill showing a filter's choice. Its accessible name says which filter it is: "Жанр: Драма". */
function FilterChip({ focusKey, name, value, onPress }: { focusKey: string; name: string; value: string; onPress(): void }) {
  const { ref } = useFocusable<object, HTMLDivElement>({ focusKey, onEnterPress: onPress });
  return (
    <div ref={ref} role="button" aria-haspopup="dialog" aria-label={t('catalog.chip', { name, value })} className="filter-chip">
      <span className="filter-chip__value">{value}</span>
      <ChevronDown className="filter-chip__icon" aria-hidden strokeWidth={2.5} />
    </div>
  );
}
