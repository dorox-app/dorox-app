export const APP_CONFIG = Object.freeze({
  name: 'DOROX',
  version: '1.0.0',
  build: '2026.07.26',
  schemaVersion: 2,
  databaseName: 'dorox-local-db',
  databaseVersion: 1,
  stateStore: 'app-state',
  stateKey: 'current',
  legacyKeys: ['dorox_v1_state', 'madoey_inventaire_v1_1'],
  defaultBudget: 400,
  defaultReserve: 20,
  minimumReserve: 15,
  maximumReserve: 30,
  defaultWaterLitresPerWeek: 45,
  currency: 'EUR',
  locale: 'fr-FR'
});

export const LEVEL_LABELS = Object.freeze({
  1: 'Socle',
  2: 'Stratégique',
  3: 'Rotation',
  4: 'Confort'
});

export const FLEXIBILITY = Object.freeze(['Faible', 'Moyenne', 'Élevée', 'Très élevée']);
export const STOCK_STATES = Object.freeze(['Plein', 'Moyen', 'Bas', 'Épuisé']);
export const CHANNELS = Object.freeze(['Supermarché', 'Drive', 'Marché', 'Boulangerie', 'Autre']);

export const DECISION_LABELS = Object.freeze({
  pending: 'À examiner',
  validated: 'Validé',
  modified: 'Modifié',
  postponed: 'Reporté',
  excluded: 'Écarté'
});
