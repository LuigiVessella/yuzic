import { createSlice, PayloadAction } from '@reduxjs/toolkit';

export type SearchScope = 'client' | 'server';

/**
 * Spelled out here rather than imported from `features/search`.
 *
 * The search modules reach the store through the provider registry, so a type
 * import back from this slice closes a cycle — which `check-cycles` caught.
 * Two two-member unions are cheaper to restate than to untangle that, and the
 * search side keeps the canonical copies (`searchLegs`, `searchPolicy`).
 */
type SearchResultScope = 'all' | 'library' | 'other';
type SearchEntityType = 'song' | 'album' | 'artist';

/**
 * Where a search runs. Which outside catalogues Search may query is each
 * source's search use in `settingsSources`, with every other outside switch.
 */
interface SearchSettingsState {
  searchScope: SearchScope;
  /**
   * The filters the search sheet sets: which side to search, which outside
   * sources, and which kinds of thing.
   *
   * Here rather than in the screen's own state because they were local
   * `useState` and so were forgotten every time the screen unmounted — a user
   * who had chosen two sources and albums-only got them back as "Library,
   * everything" without being told. They are a choice about how search
   * behaves, which is a setting, so they persist with the rest.
   *
   * `sourceIds: null` means "whichever sources are enabled", so a source
   * switched on later is included rather than silently left out by a list
   * written before it existed.
   */
  resultScope: SearchResultScope;
  sourceIds: string[] | null;
  entityTypes: SearchEntityType[];
}

const initialState: SearchSettingsState = {
  searchScope: 'server',
  // External requests still require each source's Search use to be enabled.
  resultScope: 'all',
  sourceIds: null,
  entityTypes: ['song', 'album', 'artist'],
};

/** Upgrade the old exclusive scope without changing source permissions. */
export function migrateSearchSettings(state: any): any {
  if (!state) return state;
  const oldVersion = state._persist?.version ?? 1;
  return {
    ...state,
    resultScope: oldVersion < 2 ? 'all' : (state.resultScope ?? 'all'),
    entityTypes: oldVersion < 2
      ? ['song', ...((state.entityTypes ?? ['album', 'artist']) as string[]).filter(type => type !== 'song')]
      : (state.entityTypes ?? ['song', 'album', 'artist']),
  };
}

const searchSlice = createSlice({
  name: 'settingsSearch',
  initialState,
  reducers: {
    setSearchScope(state, action: PayloadAction<SearchScope>) {
      state.searchScope = action.payload;
    },
    setResultScope(state, action: PayloadAction<SearchResultScope>) {
      state.resultScope = action.payload;
    },
    setSearchSourceIds(state, action: PayloadAction<string[] | null>) {
      state.sourceIds = action.payload;
    },
    setSearchEntityTypes(state, action: PayloadAction<SearchEntityType[]>) {
      state.entityTypes = action.payload;
    },
  },
});

export const { setSearchScope, setResultScope, setSearchSourceIds, setSearchEntityTypes } = searchSlice.actions;

export default searchSlice.reducer;

interface SearchRootState {
  settingsSearch: SearchSettingsState;
}

export const selectSearchScope = (state: SearchRootState): SearchScope =>
  state.settingsSearch.searchScope;

export const selectResultScope = (state: SearchRootState): SearchResultScope =>
  state.settingsSearch.resultScope;

/** Null means "whichever sources are enabled" — resolved by the caller. */
export const selectSearchSourceIds = (state: SearchRootState): string[] | null =>
  state.settingsSearch.sourceIds;

export const selectSearchEntityTypes = (state: SearchRootState): SearchEntityType[] =>
  state.settingsSearch.entityTypes;
