import { messagesModule } from './../messages/messages.slice';
import { createModule, thunk } from '@epikodelabs/actionstack';
import { action, selector } from '@epikodelabs/actionstack';
import type { Hero } from '../hero';
import { HeroService } from '../hero.service';

export const slice = "heroDetails";

// Typed state interface
export interface HeroDetailsState {
  hero?: Hero;
  loading: boolean;
  error: Error | null;
}

// Initial state
export const initialState: HeroDetailsState = {
  hero: undefined,
  loading: true,
  error: null,
};

export const loadHeroRequest = action(
  'LOAD_HERO_REQUEST',
  (state: HeroDetailsState) => ({
    ...state,
    hero: undefined,
    error: null,
    loading: true
  })
);

export const loadHeroSuccess = action(
  'LOAD_HERO_SUCCESS',
  (state: HeroDetailsState, { hero }: { hero: Hero }) => ({
    ...state,
    loading: false,
    error: null,
    hero
  })
);

export const loadHeroFailure = action(
  'LOAD_HERO_FAILURE',
  (state: HeroDetailsState, { error }: { error: Error }) => ({
    ...state,
    hero: undefined,
    loading: false,
    error
  })
);

export const loadHero = thunk("LOAD_HEROES", (id: number) => async (dispatch: any, getState: any, { heroService }: any) => {
    heroDetailsModule.actions.loadHeroRequest();
    try {
      const hero = await heroService.getHero(id) as Hero;
      messagesModule.actions.addMessage(`HeroService: fetched hero id=${id}`);
      heroDetailsModule.actions.loadHeroSuccess({ hero });
    } catch (error: any) {
      heroDetailsModule.actions.loadHeroFailure({ error });
    }
  });

export const renameHeroSuccess = action(
  'RENAME_HERO_SUCCESS',
  (state: HeroDetailsState, { hero }: { hero: Hero }) => ({
    ...state,
    hero
  })
);

export const renameHero = thunk("RENAME_HERO", (id: number, name: string) => async (dispatch: any, getState: any, { heroService }: any) => {
    const hero = await heroService.renameHero(id, name) as Hero;
    heroDetailsModule.actions.renameHeroSuccess({ hero });
    messagesModule.actions.addMessage(`HeroService: renamed hero id=${id} to ${name}`);
  });

// Selectors
export const heroSelector = selector((state: HeroDetailsState) => state.hero);
// One view-model atom drives the details card; status and hero change together.
export const profileSelector = selector((state: HeroDetailsState) => state);

export const heroDetailsModule = createModule({
  slice,
  initialState,
  actions: { loadHeroRequest, loadHeroSuccess, loadHeroFailure, loadHero, renameHeroSuccess, renameHero },
  selectors: { heroSelector, profileSelector },
  dependencies: { heroService: new HeroService() }
});
