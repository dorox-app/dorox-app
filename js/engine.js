import { FLEXIBILITY, LEVEL_LABELS } from './config.js';
import { isoToday, numberOr, uid } from './utils.js';

const FLEX_RANK = Object.freeze({
  Faible: 1,
  Moyenne: 2,
  Élevée: 3,
  'Très élevée': 4
});

export function normalizeProduct(product) {
  const level = Math.min(4, Math.max(1, Number(product.niveau || product.level || 2)));
  const flexibility = FLEXIBILITY.includes(product.souplesse) ? product.souplesse : 'Moyenne';
  return {
    id: product.id || uid('p'),
    categorie: String(product.categorie || product.category || 'Autres').trim() || 'Autres',
    nom: String(product.nom || product.name || 'Produit sans nom').trim() || 'Produit sans nom',
    quantite: String(product.quantite || product.quantity || '').trim(),
    frequence: String(product.frequence || product.frequency || '').trim(),
    seuil: String(product.seuil || product.threshold || '').trim(),
    niveau: level,
    niveauLibelle: LEVEL_LABELS[level],
    souplesse: flexibility,
    stock: ['Plein', 'Moyen', 'Bas', 'Épuisé'].includes(product.stock) ? product.stock : 'Moyen',
    aAcheter: Boolean(product.aAcheter ?? product.manualBuy ?? false),
    dernierAchat: String(product.dernierAchat || product.lastPurchase || ''),
    canal: String(product.canal || product.channel || 'Supermarché').trim() || 'Supermarché',
    prix: Math.max(0, numberOr(product.prix ?? product.price, 0)),
    createdAt: product.createdAt || new Date().toISOString(),
    updatedAt: product.updatedAt || new Date().toISOString()
  };
}

export function daysForFrequency(text) {
  const value = String(text || '').toLowerCase();
  if (value.includes('hebdom')) return 7;
  if (value.includes('bi-mens') || value.includes('bimens')) return 14;
  if (value.includes('mens')) return 30;
  return null;
}

export function isDue(product, today = new Date()) {
  const days = daysForFrequency(product.frequence);
  if (!days || !product.dernierAchat) return false;
  const last = new Date(`${product.dernierAchat}T12:00:00`);
  if (Number.isNaN(last.getTime())) return false;
  return (today.getTime() - last.getTime()) / 86_400_000 >= days;
}

export function attentionStatus(product) {
  if (product.aAcheter) return { status: 'examine', reasons: ['Ajouté manuellement'] };
  if (product.stock === 'Épuisé') return { status: 'examine', reasons: ['Stock épuisé'] };
  if (product.stock === 'Bas') return { status: 'examine', reasons: ['Stock bas'] };
  if (product.stock === 'Moyen' && isDue(product)) {
    return { status: 'monitor', reasons: ['Fréquence habituelle atteinte'] };
  }
  return { status: 'none', reasons: [] };
}

function hiddenPriority(product) {
  let score = 0;
  score += product.stock === 'Épuisé' ? 40 : product.stock === 'Bas' ? 25 : 0;
  score += ({ 1: 40, 2: 30, 3: 20, 4: 10 })[product.niveau] || 0;
  score += ({ Faible: 20, Moyenne: 12, Élevée: 6, 'Très élevée': 0 })[product.souplesse] || 0;
  if (product.aAcheter) score += 15;
  if (isDue(product)) score += 5;
  return score;
}

export function recommendationReasons(product) {
  const reasons = [...attentionStatus(product).reasons];
  if (isDue(product) && !reasons.includes('Fréquence habituelle atteinte')) {
    reasons.push('Fréquence habituelle atteinte');
  }
  if (product.niveau === 1) reasons.push('Produit Socle');
  if (product.niveau === 2) reasons.push('Produit Stratégique');
  if (product.souplesse === 'Faible') reasons.push('Souplesse faible');
  return reasons;
}

export function productsToExamine(products) {
  return products
    .filter(product => attentionStatus(product).status === 'examine')
    .sort((a, b) => hiddenPriority(b) - hiddenPriority(a) || a.nom.localeCompare(b.nom, 'fr'));
}

export function productsToMonitor(products) {
  return products.filter(product => attentionStatus(product).status === 'monitor');
}

export function createSession(state) {
  const items = productsToExamine(state.products).map(product => ({
    productId: product.id,
    name: product.nom,
    category: product.categorie,
    channel: product.canal,
    quantity: product.quantite,
    estimatedPrice: numberOr(product.prix, 0),
    actualPrice: numberOr(product.prix, 0),
    decision: 'pending',
    purchased: false,
    notFound: false,
    reasons: recommendationReasons(product),
    hiddenPriority: hiddenPriority(product),
    suggestedReport: false
  }));

  const session = {
    id: uid('cycle'),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    phase: Number(state.settings.currentPhase),
    month: state.settings.activeMonth,
    items
  };
  recalculateReportSuggestions(state, session);
  return session;
}

export function effectiveBudget(settings) {
  return settings.adjustedBudget === null || settings.adjustedBudget === ''
    ? numberOr(settings.baseBudget, 0)
    : numberOr(settings.adjustedBudget, 0);
}

export function monthSpent(state) {
  return state.history
    .filter(entry => entry.month === state.settings.activeMonth)
    .reduce((sum, entry) => sum + numberOr(entry.totalActual, 0), 0);
}

export function protectedReserve(settings) {
  return settings.useReserve ? 0 : numberOr(settings.reserve, 0);
}

export function remainingBudget(state) {
  return effectiveBudget(state.settings) - monthSpent(state);
}

export function spendableBudget(state) {
  return Math.max(0, remainingBudget(state) - protectedReserve(state.settings));
}

export function activeSessionItems(session) {
  if (!session) return [];
  return session.items.filter(item => ['validated', 'modified'].includes(item.decision));
}

export function estimatedSessionTotal(session) {
  return activeSessionItems(session).reduce((sum, item) => sum + numberOr(item.estimatedPrice, 0), 0);
}

export function actualSessionTotal(session) {
  return activeSessionItems(session)
    .filter(item => item.purchased && !item.notFound)
    .reduce((sum, item) => sum + numberOr(item.actualPrice, 0), 0);
}

export function recalculateReportSuggestions(state, session = state.session) {
  if (!session) return session;
  session.items.forEach(item => { item.suggestedReport = false; });

  const candidatesInBasket = session.items.filter(item => !['postponed', 'excluded'].includes(item.decision));
  const projected = candidatesInBasket.reduce((sum, item) => sum + numberOr(item.estimatedPrice, 0), 0);
  let excess = projected - spendableBudget(state);
  if (excess <= 0) return session;

  const candidates = [...candidatesInBasket].sort((a, b) => {
    const productA = state.products.find(product => product.id === a.productId);
    const productB = state.products.find(product => product.id === b.productId);
    return (productB?.niveau || 3) - (productA?.niveau || 3)
      || (FLEX_RANK[productB?.souplesse] || 2) - (FLEX_RANK[productA?.souplesse] || 2)
      || a.hiddenPriority - b.hiddenPriority
      || numberOr(b.estimatedPrice, 0) - numberOr(a.estimatedPrice, 0);
  });

  for (const item of candidates) {
    if (excess <= 0) break;
    item.suggestedReport = true;
    excess -= numberOr(item.estimatedPrice, 0);
  }
  session.updatedAt = new Date().toISOString();
  return session;
}

export function closeSession(state, { advancePhase = false } = {}) {
  if (!state.session) throw new Error('Aucun cycle en cours.');
  const session = state.session;
  const today = isoToday();

  const archivedItems = session.items.map(item => ({
    ...item,
    finalPrice: item.purchased && !item.notFound ? numberOr(item.actualPrice, 0) : 0
  }));

  for (const item of session.items) {
    const product = state.products.find(entry => entry.id === item.productId);
    if (!product) continue;

    if (item.purchased && !item.notFound && ['validated', 'modified'].includes(item.decision)) {
      product.stock = 'Plein';
      product.dernierAchat = today;
      product.prix = numberOr(item.actualPrice, product.prix);
      product.aAcheter = false;
      product.updatedAt = new Date().toISOString();
    } else if (item.notFound) {
      product.aAcheter = true;
      product.updatedAt = new Date().toISOString();
    }
  }

  const historyEntry = {
    id: uid('history'),
    sessionId: session.id,
    closedAt: new Date().toISOString(),
    month: session.month,
    phase: session.phase,
    totalEstimated: activeSessionItems(session).reduce((sum, item) => sum + numberOr(item.estimatedPrice, 0), 0),
    totalActual: actualSessionTotal(session),
    items: archivedItems
  };

  state.history.unshift(historyEntry);
  state.session = null;

  if (advancePhase && state.settings.currentPhase < 4) {
    state.settings.currentPhase += 1;
  }

  return historyEntry;
}
