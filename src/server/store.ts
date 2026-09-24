// Storage dispatcher.
//
// Supabase is the real store — it is what makes the follower growth curve
// accumulate across restarts. When the service-role key is absent the app falls
// back to an in-process store so a sync still works and real numbers still
// render; `isEphemeral` tells the UI to say that history is not being kept.
export type {
  ClientRecord,
  TrendObservationRow,
  QueueItem,
  UserRow,
  NicheModelRow,
  OutcomeRow,
  PredictionRow,
  PriorSuggestion,
  PublishedSubject,
  UsedSuggestion,
} from "./store.supabase";

import * as memory from "./store.memory";
import * as supabase from "./store.supabase";

export function hasDurableStore(): boolean {
  return Boolean(process.env["SUPABASE_SERVICE_ROLE_KEY"] && process.env["SUPABASE_URL"]);
}

const store = () => (hasDurableStore() ? supabase : memory);

export const recordRun: typeof supabase.recordRun = (...args) => store().recordRun(...args);
export const recordFailedRun: typeof supabase.recordFailedRun = (...args) =>
  store().recordFailedRun(...args);
export const finishRun: typeof supabase.finishRun = (...args) => store().finishRun(...args);
export const saveSnapshots: typeof supabase.saveSnapshots = (...args) =>
  store().saveSnapshots(...args);
export const savePosts: typeof supabase.savePosts = (...args) => store().savePosts(...args);
export const latestSnapshot: typeof supabase.latestSnapshot = (...args) =>
  store().latestSnapshot(...args);
export const growthSeries: typeof supabase.growthSeries = (...args) =>
  store().growthSeries(...args);
export const competitorSnapshots: typeof supabase.competitorSnapshots = (...args) =>
  store().competitorSnapshots(...args);
export const readPosts: typeof supabase.readPosts = (...args) => store().readPosts(...args);
export const lastSyncAt: typeof supabase.lastSyncAt = (...args) => store().lastSyncAt(...args);
export const runAlreadyIngested: typeof supabase.runAlreadyIngested = (...args) =>
  store().runAlreadyIngested(...args);
export const saveAnalysis: typeof supabase.saveAnalysis = (...args) =>
  store().saveAnalysis(...args);
export const readAnalysis: typeof supabase.readAnalysis = (...args) =>
  store().readAnalysis(...args);
export const saveWatchlist: typeof supabase.saveWatchlist = (...args) =>
  store().saveWatchlist(...args);
export const readWatchlist: typeof supabase.readWatchlist = (...args) =>
  store().readWatchlist(...args);
export const saveInsights: typeof supabase.saveInsights = (...args) =>
  store().saveInsights(...args);
export const readInsights: typeof supabase.readInsights = (...args) =>
  store().readInsights(...args);
export const saveSuggestedIdeas: typeof supabase.saveSuggestedIdeas = (...args) =>
  store().saveSuggestedIdeas(...args);
export const markIdeaUsed: typeof supabase.markIdeaUsed = (...args) =>
  store().markIdeaUsed(...args);
export const markIdeaDismissed: typeof supabase.markIdeaDismissed = (...args) =>
  store().markIdeaDismissed(...args);
export const readTaxonomy: typeof supabase.readTaxonomy = (...args) =>
  store().readTaxonomy(...args);
export const saveTaxonomy: typeof supabase.saveTaxonomy = (...args) =>
  store().saveTaxonomy(...args);
export const savePostLanes: typeof supabase.savePostLanes = (...args) =>
  store().savePostLanes(...args);
export const readUsedSuggestions: typeof supabase.readUsedSuggestions = (...args) =>
  store().readUsedSuggestions(...args);
export const findPostByLink: typeof supabase.findPostByLink = (...args) =>
  store().findPostByLink(...args);
export const saveOutcome: typeof supabase.saveOutcome = (...args) => store().saveOutcome(...args);
export const readOutcomes: typeof supabase.readOutcomes = (...args) =>
  store().readOutcomes(...args);
export const savePrediction: typeof supabase.savePrediction = (...args) =>
  store().savePrediction(...args);
export const readPredictions: typeof supabase.readPredictions = (...args) =>
  store().readPredictions(...args);
export const saveNicheModel: typeof supabase.saveNicheModel = (...args) =>
  store().saveNicheModel(...args);
export const readNicheModel: typeof supabase.readNicheModel = (...args) =>
  store().readNicheModel(...args);
export const readRecentSuggestions: typeof supabase.readRecentSuggestions = (...args) =>
  store().readRecentSuggestions(...args);
export const readPublishedSubjects: typeof supabase.readPublishedSubjects = (...args) =>
  store().readPublishedSubjects(...args);
export const readClient: typeof supabase.readClient = (...args) => store().readClient(...args);
export const readUsers: typeof supabase.readUsers = (...args) => store().readUsers(...args);
export const saveUser: typeof supabase.saveUser = (...args) => store().saveUser(...args);
export const readAssignments: typeof supabase.readAssignments = (...args) =>
  store().readAssignments(...args);
export const assignUser: typeof supabase.assignUser = (...args) => store().assignUser(...args);
export const readQueue: typeof supabase.readQueue = (...args) => store().readQueue(...args);
export const transitionIdea: typeof supabase.transitionIdea = (...args) =>
  store().transitionIdea(...args);
export const saveTrendObservations: typeof supabase.saveTrendObservations = (...args) =>
  store().saveTrendObservations(...args);
export const readTrendObservations: typeof supabase.readTrendObservations = (...args) =>
  store().readTrendObservations(...args);
export const saveTrendSignals: typeof supabase.saveTrendSignals = (...args) =>
  store().saveTrendSignals(...args);
export const readTrendSignals: typeof supabase.readTrendSignals = (...args) =>
  store().readTrendSignals(...args);
export const setIdeaSourceSignal: typeof supabase.setIdeaSourceSignal = (...args) =>
  store().setIdeaSourceSignal(...args);
export const saveSourceItems: typeof supabase.saveSourceItems = (...args) =>
  store().saveSourceItems(...args);
export const readSourceItems: typeof supabase.readSourceItems = (...args) =>
  store().readSourceItems(...args);
export const readSourceItemsById: typeof supabase.readSourceItemsById = (...args) =>
  store().readSourceItemsById(...args);
export const readUsedSourceIds: typeof supabase.readUsedSourceIds = (...args) =>
  store().readUsedSourceIds(...args);
export const lastSourceFetch: typeof supabase.lastSourceFetch = (...args) =>
  store().lastSourceFetch(...args);
