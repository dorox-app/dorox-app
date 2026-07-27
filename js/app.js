import { APP_CONFIG, DECISION_LABELS, LEVEL_LABELS } from './config.js';
import {
  activeSessionItems,
  actualSessionTotal,
  attentionStatus,
  closeSession,
  createSession,
  effectiveBudget,
  estimatedSessionTotal,
  monthSpent,
  normalizeProduct,
  productsToExamine,
  productsToMonitor,
  protectedReserve,
  recalculateReportSuggestions,
  remainingBudget,
  spendableBudget
} from './engine.js';
import { LocalDatabase } from './storage.js';
import { AppStore } from './state.js';
import {
  $,
  $$,
  debounce,
  downloadJson,
  escapeHtml,
  euro,
  formatDate,
  formatMonth,
  isIOS,
  isSecureContextForPwa,
  isStandalone,
  isoToday,
  normalizeText,
  numberOr,
  readJsonFile,
  uid
} from './utils.js';

class DoroxApp {
  constructor() {
    this.store = new AppStore(new LocalDatabase());
    this.currentView = 'dashboard';
    this.deferredInstallPrompt = null;
    this.waitingServiceWorker = null;
    this.versionTaps = [];
    this.toastTimer = null;
    this.priceUpdate = debounce((id, value) => this.updateActualPrice(id, value), 180);
  }

  get state() {
    return this.store.state;
  }

  async init() {
    await this.store.init();
    this.bindEvents();
    this.store.addEventListener('change', () => this.renderAll());
    this.renderAll();
    this.applyRequestedView();
    this.updateNetworkStatus();
    await this.registerPwa();
  }

  bindEvents() {
    document.addEventListener('click', event => this.handleClick(event));
    document.addEventListener('change', event => this.handleChange(event));
    document.addEventListener('input', event => this.handleInput(event));

    $('#budgetForm').addEventListener('submit', event => this.saveBudget(event));
    $('#productForm').addEventListener('submit', event => this.saveProduct(event));
    $('#itemForm').addEventListener('submit', event => this.saveSessionItem(event));
    $('#closeCycleForm').addEventListener('submit', event => this.confirmCloseCycle(event));
    $('#importInput').addEventListener('change', event => this.importData(event));
    $('#applyUpdateButton').addEventListener('click', () => this.applyUpdate());

    window.addEventListener('online', () => this.updateNetworkStatus());
    window.addEventListener('offline', () => this.updateNetworkStatus());
    window.addEventListener('beforeinstallprompt', event => {
      event.preventDefault();
      this.deferredInstallPrompt = event;
      this.renderPwaPanel();
    });
    window.addEventListener('appinstalled', () => {
      this.deferredInstallPrompt = null;
      this.toast('DOROX est installée sur cet appareil.');
      this.renderPwaPanel();
    });

    $$('dialog').forEach(dialog => {
      dialog.addEventListener('close', () => {
        if (!$$('dialog').some(item => item.open)) document.body.classList.remove('dialog-open');
      });
      dialog.addEventListener('click', event => {
        if (event.target === dialog) this.closeDialog(dialog.id);
      });
    });
  }

  handleClick(event) {
    const button = event.target.closest('button');
    if (!button) return;

    const view = button.dataset.viewTarget || button.dataset.viewJump;
    if (view) {
      this.setView(view);
      return;
    }

    if (button.dataset.closeDialog) {
      this.closeDialog(button.dataset.closeDialog);
      return;
    }

    const { action, id, decision, stock } = button.dataset;
    if (!action) return;

    const actions = {
      'open-budget': () => this.openBudgetDialog(),
      'open-settings': () => this.openSettingsDialog(),
      'add-product': () => this.openProductDialog(),
      'edit-product': () => this.openProductDialog(id),
      'delete-product': () => this.deleteProduct(id),
      'toggle-manual': () => this.toggleManualBuy(id),
      'set-stock': () => this.setProductStock(id, stock),
      'generate-session': () => this.generateSession(),
      'cancel-session': () => this.cancelSession(),
      'set-decision': () => this.setDecision(id, decision),
      'edit-session-item': () => this.openSessionItemDialog(id),
      'toggle-why': () => this.toggleWhy(id),
      'start-shopping': () => this.setView('shopping'),
      'close-cycle': () => this.openCloseCycleDialog(),
      'install-app': () => this.installApp(),
      'export-data': () => this.exportData(),
      'trigger-import': () => $('#importInput').click(),
      'reset-app': () => this.resetApp(),
      'open-history': () => this.setView('history')
    };
    actions[action]?.();
  }

  handleChange(event) {
    const target = event.target;
    if (['inventoryCategory', 'inventoryStock', 'inventoryLevel', 'inventoryFlex'].includes(target.id)) {
      this.renderInventory();
    }
    if (target.matches('[data-shopping-purchased]')) {
      this.setPurchased(target.dataset.shoppingPurchased, target.checked);
    }
    if (target.matches('[data-shopping-not-found]')) {
      this.setNotFound(target.dataset.shoppingNotFound, target.checked);
    }
  }

  handleInput(event) {
    const target = event.target;
    if (target.id === 'inventorySearch' || ['inventoryCategory', 'inventoryStock', 'inventoryLevel', 'inventoryFlex'].includes(target.id)) {
      this.renderInventory();
    }
    if (target.matches('[data-actual-price]')) {
      this.priceUpdate(target.dataset.actualPrice, target.value);
    }
  }

  setView(view) {
    if (!['dashboard', 'inventory', 'prepare', 'shopping', 'history'].includes(view)) return;
    this.currentView = view;
    $$('.view').forEach(section => section.classList.toggle('active', section.dataset.view === view));
    $$('.nav-button').forEach(button => button.classList.toggle('active', button.dataset.viewTarget === view));
    try {
      history.replaceState(null, '', `${location.pathname}#${view}`);
    } catch {
      // Certains contextes de prévisualisation bloquent la modification de l’URL.
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
    this.renderCurrentView();
  }

  applyRequestedView() {
    const hash = location.hash.replace('#', '');
    const query = new URLSearchParams(location.search).get('view');
    const requested = query || hash;
    if (['dashboard', 'inventory', 'prepare', 'shopping', 'history'].includes(requested)) this.setView(requested);
  }

  renderAll() {
    this.renderHeader();
    this.renderDashboard();
    this.renderInventory();
    this.renderPreparation();
    this.renderShopping();
    this.renderHistory();
    this.renderSettings();
  }

  renderCurrentView() {
    const renderers = {
      dashboard: () => this.renderDashboard(),
      inventory: () => this.renderInventory(),
      prepare: () => this.renderPreparation(),
      shopping: () => this.renderShopping(),
      history: () => this.renderHistory()
    };
    renderers[this.currentView]?.();
  }

  renderHeader() {
    $('#headerPhase').textContent = `Phase ${this.state.settings.currentPhase} · ${euro(effectiveBudget(this.state.settings))}`;
  }

  renderDashboard() {
    const budget = effectiveBudget(this.state.settings);
    const spent = monthSpent(this.state);
    const remaining = remainingBudget(this.state);
    const reserve = protectedReserve(this.state.settings);
    const available = spendableBudget(this.state);
    const low = this.state.products.filter(product => ['Bas', 'Épuisé'].includes(product.stock)).length;
    const examine = productsToExamine(this.state.products).length;
    const cycles = this.state.history.filter(entry => entry.month === this.state.settings.activeMonth).length;
    const progress = budget > 0 ? Math.min(100, Math.max(0, (spent / budget) * 100)) : 0;

    $('#metricRemaining').textContent = euro(remaining);
    $('#metricBudgetDetail').textContent = `sur ${euro(budget)}`;
    $('#metricLowStock').textContent = low;
    $('#metricExamine').textContent = examine;
    $('#metricCycles').textContent = cycles;

    $('#welcomeNotice').innerHTML = this.state.history.length === 0 && !this.state.session
      ? `<div class="notice pink"><strong>DOROX V1 officielle</strong><span>Commencez par mettre à jour quelques stocks, puis laissez l’application préparer la première liste.</span></div>`
      : '';

    $('#budgetPanel').innerHTML = `
      <div class="panel-header">
        <div><p class="eyebrow">${escapeHtml(formatMonth(this.state.settings.activeMonth))}</p><h3>Budget du mois</h3><p class="panel-subtitle">${this.state.settings.adjustedBudget === null || this.state.settings.adjustedBudget === '' ? 'Budget mensuel habituel' : 'Budget exceptionnel appliqué ce mois'}</p></div>
        <button class="button secondary compact" type="button" data-action="open-budget">Modifier</button>
      </div>
      <strong class="big-amount">${euro(remaining)}</strong><span class="amount-caption">restant après ${euro(spent)} de dépenses clôturées</span>
      <div class="progress-track"><div class="progress-bar" style="width:${progress}%"></div></div>
      <div class="inline-stats">
        <div class="inline-stat"><span>Budget total</span><strong>${euro(budget)}</strong></div>
        <div class="inline-stat"><span>Réserve protégée</span><strong>${euro(reserve)}</strong></div>
        <div class="inline-stat"><span>Disponible maintenant</span><strong>${euro(available)}</strong></div>
      </div>`;

    if (!this.state.session) {
      const monitor = productsToMonitor(this.state.products).length;
      $('#cyclePanel').innerHTML = `
        <div class="panel-header"><div><p class="eyebrow">Phase ${this.state.settings.currentPhase}</p><h3>Prochaine préparation</h3><p class="panel-subtitle">${examine} produit(s) à examiner${monitor ? ` et ${monitor} à surveiller` : ''}.</p></div></div>
        <div class="button-row"><button class="button primary" type="button" data-action="generate-session">Préparer la liste</button><button class="button secondary" type="button" data-view-jump="inventory">Mettre à jour le stock</button></div>`;
    } else {
      const validated = activeSessionItems(this.state.session).length;
      const pending = this.state.session.items.filter(item => item.decision === 'pending').length;
      $('#cyclePanel').innerHTML = `
        <div class="panel-header"><div><p class="eyebrow">Cycle en cours</p><h3>Inventaire ${this.state.session.phase} · ${escapeHtml(formatMonth(this.state.session.month))}</h3><p class="panel-subtitle">${validated} produit(s) validé(s)${pending ? `, ${pending} encore à examiner` : ''}.</p></div></div>
        <div class="inline-stats">
          <div class="inline-stat"><span>Propositions</span><strong>${this.state.session.items.length}</strong></div>
          <div class="inline-stat"><span>Sélectionnés</span><strong>${validated}</strong></div>
          <div class="inline-stat"><span>Estimation</span><strong>${euro(estimatedSessionTotal(this.state.session))}</strong></div>
        </div>
        <div class="button-row"><button class="button primary" type="button" data-view-jump="prepare">Continuer l’arbitrage</button>${validated ? '<button class="button success" type="button" data-view-jump="shopping">Mode Courses</button>' : ''}</div>`;
    }
    this.renderPwaPanel();
  }

  renderPwaPanel() {
    const panel = $('#pwaPanel');
    if (!panel) return;
    const installed = isStandalone();
    const secure = isSecureContextForPwa();
    const offlineReady = Boolean(navigator.serviceWorker?.controller);
    let status = installed ? 'Installée sur cet appareil' : secure ? (offlineReady ? 'Prête pour une utilisation hors ligne' : 'Initialisation du mode hors ligne') : 'Publication HTTPS nécessaire';
    let detail = installed ? 'DOROX s’ouvre en plein écran depuis son icône.' : 'Installez-la depuis Safari sur iPhone ou depuis le navigateur sur ordinateur.';
    panel.innerHTML = `
      <img src="./assets/icons/icon-192.png" alt="Icône DOROX">
      <div><p class="eyebrow">Application</p><h3>${escapeHtml(status)}</h3><p class="panel-subtitle">${escapeHtml(detail)}</p><div class="status-line"><span class="status-dot ${installed || offlineReady ? 'ok' : ''}"></span>${navigator.onLine ? 'Connexion disponible' : 'Mode hors connexion'}</div></div>
      <div class="button-row">${installed ? '' : '<button class="button secondary compact" type="button" data-action="install-app">Installer / Voir la procédure</button>'}<button class="button secondary compact" type="button" data-action="export-data">Sauvegarder les données</button></div>`;
  }

  filteredProducts() {
    const query = normalizeText($('#inventorySearch')?.value);
    const category = $('#inventoryCategory')?.value || '';
    const stock = $('#inventoryStock')?.value || '';
    const level = $('#inventoryLevel')?.value || '';
    const flex = $('#inventoryFlex')?.value || '';
    return this.state.products.filter(product => {
      const haystack = normalizeText([product.nom, product.categorie, product.canal].join(' '));
      return (!query || haystack.includes(query))
        && (!category || product.categorie === category)
        && (!stock || product.stock === stock)
        && (!level || String(product.niveau) === level)
        && (!flex || product.souplesse === flex);
    });
  }

  fillInventoryFilters() {
    const categories = [...new Set(this.state.products.map(product => product.categorie).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'fr'));
    const select = $('#inventoryCategory');
    const selected = select.value;
    select.innerHTML = '<option value="">Toutes les catégories</option>' + categories.map(category => `<option value="${escapeHtml(category)}">${escapeHtml(category)}</option>`).join('');
    select.value = selected;
    $('#categorySuggestions').innerHTML = categories.map(category => `<option value="${escapeHtml(category)}"></option>`).join('');
  }

  stockClass(stock) {
    return { Plein: 'stock-full', Moyen: 'stock-medium', Bas: 'stock-low', 'Épuisé': 'stock-empty' }[stock] || '';
  }

  renderInventory() {
    this.fillInventoryFilters();
    const products = this.filteredProducts().sort((a, b) => a.categorie.localeCompare(b.categorie, 'fr') || a.niveau - b.niveau || a.nom.localeCompare(b.nom, 'fr'));
    $('#inventoryCount').textContent = `${products.length} produit(s) affiché(s) sur ${this.state.products.length}`;
    if (!products.length) {
      $('#inventoryList').innerHTML = `<div class="empty-state"><span class="empty-icon">⌕</span><h2>Aucun résultat</h2><p>Modifiez la recherche ou les filtres.</p></div>`;
      return;
    }

    const groups = Map.groupBy ? Map.groupBy(products, product => product.categorie) : products.reduce((map, product) => map.set(product.categorie, [...(map.get(product.categorie) || []), product]), new Map());
    $('#inventoryList').innerHTML = [...groups.entries()].map(([category, items]) => `
      <h2 class="category-heading">${escapeHtml(category)} · ${items.length}</h2>
      ${items.map(product => this.productCard(product)).join('')}`).join('');
  }

  productCard(product) {
    const stockButtons = ['Plein', 'Moyen', 'Bas', 'Épuisé'].map(stock => `<button class="stock-button ${product.stock === stock ? 'active' : ''}" type="button" data-action="set-stock" data-id="${product.id}" data-stock="${stock}">${stock}</button>`).join('');
    return `<article class="product-card">
      <div class="card-top"><div><h3 class="card-title">${escapeHtml(product.nom)}</h3><p class="card-meta">${escapeHtml(product.quantite || 'Quantité non renseignée')} · ${escapeHtml(product.frequence || 'Fréquence non renseignée')}<br>${escapeHtml(product.canal || 'Canal non renseigné')}</p></div><div class="card-price">${euro(product.prix)}</div></div>
      <div class="badge-row"><span class="badge ${this.stockClass(product.stock)}">${escapeHtml(product.stock)}</span><span class="badge">${escapeHtml(product.niveauLibelle)}</span><span class="badge">Souplesse ${escapeHtml(product.souplesse.toLowerCase())}</span>${product.aAcheter ? '<span class="badge manual">Ajout manuel</span>' : ''}</div>
      <div class="stock-control" aria-label="Modifier rapidement le stock de ${escapeHtml(product.nom)}">${stockButtons}</div>
      <div class="card-actions"><button class="button secondary compact" type="button" data-action="edit-product" data-id="${product.id}">Modifier</button><button class="button secondary compact" type="button" data-action="toggle-manual" data-id="${product.id}">${product.aAcheter ? 'Retirer de la préparation' : 'Ajouter à la préparation'}</button><button class="button danger compact" type="button" data-action="delete-product" data-id="${product.id}">Supprimer</button></div>
    </article>`;
  }

  renderPreparation() {
    if (!this.state.session) {
      const examine = productsToExamine(this.state.products).length;
      $('#prepareSummary').innerHTML = '';
      $('#prepareList').innerHTML = `<div class="empty-state"><span class="empty-icon">☑</span><h2>Aucune préparation en cours</h2><p>DOROX a repéré ${examine} produit(s) qui méritent votre attention.</p><div class="button-row"><button class="button primary" type="button" data-action="generate-session">Générer la liste proposée</button><button class="button secondary" type="button" data-view-jump="inventory">Vérifier l’inventaire</button></div></div>`;
      return;
    }

    recalculateReportSuggestions(this.state);
    const selected = activeSessionItems(this.state.session);
    const estimate = estimatedSessionTotal(this.state.session);
    const available = spendableBudget(this.state);
    const pending = this.state.session.items.filter(item => item.decision === 'pending').length;
    const over = estimate - available;
    const suggestions = this.state.session.items.filter(item => item.suggestedReport && !['postponed', 'excluded'].includes(item.decision)).length;

    $('#prepareSummary').innerHTML = `<div class="summary-sticky"><div class="summary-card">
      <div class="summary-grid"><div><span>Validés</span><strong>${selected.length}</strong></div><div><span>Total estimé</span><strong>${euro(estimate)}</strong></div><div><span>Disponible</span><strong>${euro(available)}</strong></div></div>
      <div class="button-row"><button class="button light compact" type="button" data-action="start-shopping" ${selected.length ? '' : 'disabled'}>Passer aux courses</button><button class="button secondary compact" type="button" data-action="cancel-session">Annuler ce cycle</button></div>
    </div></div>
    ${over > 0 ? `<div class="notice danger"><strong>Dépassement estimé de ${euro(over)}</strong><span>DOROX indique ${suggestions} report(s) cohérent(s). Aucun produit ne sera retiré sans votre décision.</span></div>` : `<div class="notice success"><strong>Budget maîtrisé</strong><span>La sélection validée reste dans le budget disponible. ${pending ? `${pending} proposition(s) restent à examiner.` : ''}</span></div>`}`;

    if (!this.state.session.items.length) {
      $('#prepareList').innerHTML = `<div class="empty-state"><span class="empty-icon">✓</span><h2>Rien à proposer</h2><p>Les stocks actuels ne déclenchent aucun achat. Vous pouvez revenir à l’inventaire ou annuler ce cycle.</p></div>`;
      return;
    }

    $('#prepareList').innerHTML = this.state.session.items.map(item => this.decisionCard(item)).join('');
  }

  decisionCard(item) {
    const product = this.state.products.find(entry => entry.id === item.productId);
    const decision = DECISION_LABELS[item.decision] || item.decision;
    const reasons = item.reasons?.length ? item.reasons : ['Produit ajouté à la proposition'];
    const isOut = ['postponed', 'excluded'].includes(item.decision);
    const actions = isOut
      ? `<button class="button secondary compact" type="button" data-action="set-decision" data-id="${item.productId}" data-decision="pending">Réintégrer</button>`
      : `${item.decision === 'pending' ? `<button class="button primary compact" type="button" data-action="set-decision" data-id="${item.productId}" data-decision="validated">Valider</button>` : ''}
         <button class="button secondary compact" type="button" data-action="edit-session-item" data-id="${item.productId}">Modifier</button>
         <button class="button secondary compact" type="button" data-action="set-decision" data-id="${item.productId}" data-decision="postponed">Reporter</button>
         <button class="button danger compact" type="button" data-action="set-decision" data-id="${item.productId}" data-decision="excluded">Écarter</button>`;

    return `<article class="decision-card ${isOut ? 'muted-card' : ''}">
      <div class="card-top"><div><h3 class="card-title">${escapeHtml(item.name)}</h3><p class="card-meta">${escapeHtml(item.quantity || 'Quantité à préciser')} · ${escapeHtml(item.channel || product?.canal || 'Canal non renseigné')}</p></div><div class="card-price">${euro(item.estimatedPrice)}</div></div>
      <div class="badge-row"><span class="badge decision">${escapeHtml(decision)}</span>${item.suggestedReport && !isOut ? '<span class="badge suggested">Report suggéré</span>' : ''}<span class="badge ${this.stockClass(product?.stock)}">${escapeHtml(product?.stock || 'Stock inconnu')}</span></div>
      <div class="card-actions">${actions}<button class="text-button" type="button" data-action="toggle-why" data-id="${item.productId}">Pourquoi ?</button></div>
      <div class="why-box" id="why-${item.productId}" hidden><strong>Éléments pris en compte</strong><ul>${reasons.map(reason => `<li>${escapeHtml(reason)}</li>`).join('')}</ul></div>
    </article>`;
  }

  renderShopping() {
    if (!this.state.session || !activeSessionItems(this.state.session).length) {
      $('#shoppingSummary').innerHTML = '';
      $('#shoppingList').innerHTML = `<div class="empty-state"><span class="empty-icon">🛒</span><h2>Aucune liste validée</h2><p>Validez d’abord les produits retenus dans l’espace Préparation.</p><div class="button-row"><button class="button primary" type="button" data-view-jump="prepare">Ouvrir la préparation</button></div></div>`;
      return;
    }

    const items = activeSessionItems(this.state.session);
    this.renderShoppingSummary();

    const groups = Map.groupBy ? Map.groupBy(items, item => item.channel || 'Autre') : items.reduce((map, item) => map.set(item.channel || 'Autre', [...(map.get(item.channel || 'Autre') || []), item]), new Map());
    $('#shoppingList').innerHTML = [...groups.entries()].map(([channel, group]) => `
      <h2 class="channel-heading">${escapeHtml(channel)}<span>${group.length} produit(s)</span></h2>
      ${group.map(item => this.shoppingCard(item)).join('')}`).join('');
  }


  renderShoppingSummary() {
    if (!this.state.session) {
      $('#shoppingSummary').innerHTML = '';
      return;
    }
    const items = activeSessionItems(this.state.session);
    const estimate = estimatedSessionTotal(this.state.session);
    const actual = actualSessionTotal(this.state.session);
    const purchasedCount = items.filter(item => item.purchased && !item.notFound).length;
    const notFoundCount = items.filter(item => item.notFound).length;
    const projectedRemaining = remainingBudget(this.state) - actual;

    $('#shoppingSummary').innerHTML = `<div class="summary-sticky"><div class="summary-card">
      <div class="summary-grid"><div><span>Achetés</span><strong>${purchasedCount} / ${items.length}</strong></div><div><span>Panier réel</span><strong>${euro(actual)}</strong></div><div><span>Budget après panier</span><strong>${euro(projectedRemaining)}</strong></div></div>
      <div class="button-row"><button class="button light compact" type="button" data-action="close-cycle">Clôturer l’inventaire</button><button class="button secondary compact" type="button" data-view-jump="prepare">Revenir à l’arbitrage</button></div>
    </div></div>
    ${projectedRemaining < 0 ? `<div class="notice danger"><strong>Budget dépassé de ${euro(Math.abs(projectedRemaining))}</strong><span>Le constat est informatif : DOROX ne retire aucun achat.</span></div>` : `<div class="notice success"><strong>${euro(projectedRemaining)} resteront après ce panier</strong><span>Estimation initiale : ${euro(estimate)}${notFoundCount ? ` · ${notFoundCount} produit(s) non trouvé(s)` : ''}.</span></div>`}`;
  }

  shoppingCard(item) {
    const className = item.notFound ? 'not-found' : item.purchased ? 'purchased' : '';
    return `<article class="shopping-card ${className}">
      <div class="shopping-line">
        <input class="shopping-check" type="checkbox" data-shopping-purchased="${item.productId}" ${item.purchased && !item.notFound ? 'checked' : ''} aria-label="Marquer ${escapeHtml(item.name)} comme acheté">
        <div><h3 class="card-title">${escapeHtml(item.name)}</h3><p class="card-meta">${escapeHtml(item.quantity || 'Quantité à préciser')} · estimé ${euro(item.estimatedPrice)}</p></div>
        <label class="actual-price"><span class="sr-only">Prix réel de ${escapeHtml(item.name)}</span><input type="number" min="0" step="0.01" inputmode="decimal" value="${numberOr(item.actualPrice, 0).toFixed(2)}" data-actual-price="${item.productId}" ${item.notFound ? 'disabled' : ''}></label>
      </div>
      <div class="shopping-options"><label class="not-found-label"><input type="checkbox" data-shopping-not-found="${item.productId}" ${item.notFound ? 'checked' : ''}>Produit non trouvé</label><span class="badge decision">${escapeHtml(DECISION_LABELS[item.decision])}</span></div>
    </article>`;
  }

  renderHistory() {
    if (!this.state.history.length) {
      $('#historyList').innerHTML = `<div class="empty-state"><span class="empty-icon">↺</span><h2>Aucun inventaire clôturé</h2><p>Le premier cycle apparaîtra ici après la clôture du mode Courses.</p></div>`;
      return;
    }

    $('#historyList').innerHTML = this.state.history.map(entry => {
      const purchased = entry.items.filter(item => item.purchased && !item.notFound);
      const notFound = entry.items.filter(item => item.notFound);
      const postponed = entry.items.filter(item => item.decision === 'postponed');
      const excluded = entry.items.filter(item => item.decision === 'excluded');
      const unpurchased = entry.items.filter(item => ['validated', 'modified'].includes(item.decision) && !item.purchased && !item.notFound);
      return `<details class="history-card">
        <summary><div class="history-summary"><div><h3>Phase ${entry.phase} · ${escapeHtml(formatMonth(entry.month))}</h3><p>${formatDate(entry.closedAt)} · ${purchased.length} achat(s)</p></div><span class="history-total">${euro(entry.totalActual)}</span></div></summary>
        <div class="history-body">
          <div class="inline-stats"><div class="inline-stat"><span>Estimé</span><strong>${euro(entry.totalEstimated)}</strong></div><div class="inline-stat"><span>Réel</span><strong>${euro(entry.totalActual)}</strong></div><div class="inline-stat"><span>Écart</span><strong>${euro(numberOr(entry.totalActual) - numberOr(entry.totalEstimated))}</strong></div></div>
          ${this.historyGroup('Achetés', purchased, item => `${escapeHtml(item.name)} — ${euro(item.finalPrice ?? item.actualPrice)}`)}
          ${this.historyGroup('Non trouvés', notFound, item => escapeHtml(item.name))}
          ${this.historyGroup('Reportés', postponed, item => escapeHtml(item.name))}
          ${this.historyGroup('Écartés', excluded, item => escapeHtml(item.name))}
          ${this.historyGroup('Validés mais non cochés', unpurchased, item => escapeHtml(item.name))}
        </div>
      </details>`;
    }).join('');
  }

  historyGroup(title, items, formatter) {
    if (!items.length) return '';
    return `<section class="history-group"><h4>${title} · ${items.length}</h4><ul class="history-list">${items.map(item => `<li>${formatter(item)}</li>`).join('')}</ul></section>`;
  }

  renderSettings() {
    $('#aboutVersion').textContent = `v${APP_CONFIG.version}`;
    $('#aboutBuild').textContent = `Build ${APP_CONFIG.build}`;
    $('#storageModeText').textContent = `Stockage actif : ${this.store.storageMode}. Données mises à jour le ${formatDate(this.state.updatedAt, { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}.`;
    $('#developerPanel').hidden = !this.state.settings.developerMode;
    $('#devProducts').textContent = this.state.products.length;
    $('#devHistory').textContent = this.state.history.length;
    $('#devStorage').textContent = this.store.storageMode;
    $('#devSchema').textContent = this.state.schemaVersion;
  }

  openBudgetDialog() {
    if ($('#settingsDialog').open) this.closeDialog('settingsDialog');
    const settings = this.state.settings;
    $('#budgetMonth').value = settings.activeMonth;
    $('#budgetPhase').value = String(settings.currentPhase);
    $('#budgetBase').value = settings.baseBudget;
    $('#budgetAdjusted').value = settings.adjustedBudget ?? '';
    $('#budgetReserve').value = settings.reserve;
    $('#budgetWater').value = settings.waterLitresPerWeek;
    $('#budgetUseReserve').checked = Boolean(settings.useReserve);
    this.openDialog('budgetDialog');
  }

  saveBudget(event) {
    event.preventDefault();
    const reserve = numberOr($('#budgetReserve').value, APP_CONFIG.defaultReserve);
    if (reserve < APP_CONFIG.minimumReserve || reserve > APP_CONFIG.maximumReserve) {
      this.toast('La réserve doit être comprise entre 15 € et 30 €.');
      return;
    }
    this.store.update(state => {
      state.settings.activeMonth = $('#budgetMonth').value;
      state.settings.currentPhase = Number($('#budgetPhase').value);
      state.settings.baseBudget = Math.max(0, numberOr($('#budgetBase').value, APP_CONFIG.defaultBudget));
      state.settings.adjustedBudget = $('#budgetAdjusted').value === '' ? null : Math.max(0, numberOr($('#budgetAdjusted').value, 0));
      state.settings.reserve = reserve;
      state.settings.waterLitresPerWeek = Math.max(0, numberOr($('#budgetWater').value, APP_CONFIG.defaultWaterLitresPerWeek));
      state.settings.useReserve = $('#budgetUseReserve').checked;
      recalculateReportSuggestions(state);
    });
    this.closeDialog('budgetDialog');
    this.toast('Budget mis à jour.');
  }

  openProductDialog(id = null) {
    const product = id ? this.state.products.find(entry => entry.id === id) : null;
    $('#productForm').reset();
    $('#productDialogTitle').textContent = product ? 'Modifier le produit' : 'Ajouter un produit';
    $('#productId').value = product?.id || '';
    $('#productName').value = product?.nom || '';
    $('#productCategory').value = product?.categorie || '';
    $('#productChannel').value = product?.canal || 'Supermarché';
    $('#productQuantity').value = product?.quantite || '';
    $('#productFrequency').value = product?.frequence || '';
    $('#productThreshold').value = product?.seuil || '';
    $('#productPrice').value = product?.prix ?? '';
    $('#productLastPurchase').value = product?.dernierAchat || '';
    $('#productLevel').value = String(product?.niveau || 2);
    $('#productFlex').value = product?.souplesse || 'Moyenne';
    $('#productStock').value = product?.stock || 'Moyen';
    $('#productManual').checked = Boolean(product?.aAcheter);
    this.openDialog('productDialog');
  }

  saveProduct(event) {
    event.preventDefault();
    const id = $('#productId').value;
    const existing = this.state.products.find(product => product.id === id);
    const product = normalizeProduct({
      ...(existing || {}),
      id: id || uid('p'),
      nom: $('#productName').value,
      categorie: $('#productCategory').value,
      canal: $('#productChannel').value,
      quantite: $('#productQuantity').value,
      frequence: $('#productFrequency').value,
      seuil: $('#productThreshold').value,
      prix: $('#productPrice').value,
      dernierAchat: $('#productLastPurchase').value,
      niveau: $('#productLevel').value,
      souplesse: $('#productFlex').value,
      stock: $('#productStock').value,
      aAcheter: $('#productManual').checked,
      createdAt: existing?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
    this.store.update(state => {
      const index = state.products.findIndex(entry => entry.id === product.id);
      if (index >= 0) state.products[index] = product;
      else state.products.push(product);
    });
    this.closeDialog('productDialog');
    this.toast(existing ? 'Produit modifié.' : 'Produit ajouté.');
  }

  deleteProduct(id) {
    const product = this.state.products.find(entry => entry.id === id);
    if (!product) return;
    if (this.state.session?.items.some(item => item.productId === id)) {
      this.toast('Ce produit appartient au cycle en cours. Clôturez ou annulez le cycle avant de le supprimer.');
      return;
    }
    if (!confirm(`Supprimer « ${product.nom} » de l’inventaire ?`)) return;
    this.store.update(state => { state.products = state.products.filter(entry => entry.id !== id); });
    this.toast('Produit supprimé.');
  }

  toggleManualBuy(id) {
    this.store.update(state => {
      const product = state.products.find(entry => entry.id === id);
      if (product) {
        product.aAcheter = !product.aAcheter;
        product.updatedAt = new Date().toISOString();
      }
    });
    this.toast('Préparation mise à jour.');
  }

  setProductStock(id, stock) {
    this.store.update(state => {
      const product = state.products.find(entry => entry.id === id);
      if (product) {
        product.stock = stock;
        product.updatedAt = new Date().toISOString();
      }
    });
  }

  generateSession() {
    if (this.state.session) {
      this.setView('prepare');
      return;
    }
    this.store.update(state => { state.session = createSession(state); });
    this.toast('Liste proposée générée.');
    this.setView('prepare');
  }

  cancelSession() {
    if (!this.state.session) return;
    if (!confirm('Annuler ce cycle ? Les décisions prises dans cette préparation seront supprimées, mais l’inventaire restera intact.')) return;
    this.store.update(state => { state.session = null; });
    this.toast('Cycle annulé.');
  }

  setDecision(productId, decision) {
    this.store.update(state => {
      const item = state.session?.items.find(entry => entry.productId === productId);
      if (!item) return;
      item.decision = decision;
      if (['postponed', 'excluded', 'pending'].includes(decision)) {
        item.purchased = false;
        item.notFound = false;
      }
      recalculateReportSuggestions(state);
    });
  }

  openSessionItemDialog(productId) {
    const item = this.state.session?.items.find(entry => entry.productId === productId);
    if (!item) return;
    $('#itemProductId').value = productId;
    $('#itemDialogName').textContent = item.name;
    $('#itemQuantity').value = item.quantity;
    $('#itemEstimatedPrice').value = item.estimatedPrice;
    this.openDialog('itemDialog');
  }

  saveSessionItem(event) {
    event.preventDefault();
    const id = $('#itemProductId').value;
    this.store.update(state => {
      const item = state.session?.items.find(entry => entry.productId === id);
      if (!item) return;
      item.quantity = $('#itemQuantity').value;
      item.estimatedPrice = Math.max(0, numberOr($('#itemEstimatedPrice').value, item.estimatedPrice));
      if (!item.purchased) item.actualPrice = item.estimatedPrice;
      item.decision = 'modified';
      recalculateReportSuggestions(state);
    });
    this.closeDialog('itemDialog');
    this.toast('Proposition modifiée et validée.');
  }

  toggleWhy(productId) {
    const element = $(`#why-${CSS.escape(productId)}`);
    if (element) element.hidden = !element.hidden;
  }

  setPurchased(productId, checked) {
    this.store.update(state => {
      const item = state.session?.items.find(entry => entry.productId === productId);
      if (!item) return;
      item.purchased = checked;
      if (checked) item.notFound = false;
    });
  }

  setNotFound(productId, checked) {
    this.store.update(state => {
      const item = state.session?.items.find(entry => entry.productId === productId);
      if (!item) return;
      item.notFound = checked;
      if (checked) item.purchased = false;
    });
  }

  updateActualPrice(productId, value) {
    this.store.update(state => {
      const item = state.session?.items.find(entry => entry.productId === productId);
      if (item) item.actualPrice = Math.max(0, numberOr(value, 0));
    }, { announce: false });
    this.renderShoppingSummary();
  }

  openCloseCycleDialog() {
    if (!this.state.session) return;
    const items = activeSessionItems(this.state.session);
    const purchased = items.filter(item => item.purchased && !item.notFound);
    const notFound = items.filter(item => item.notFound);
    $('#closeCycleSummary').textContent = `${purchased.length} produit(s) acheté(s) pour ${euro(actualSessionTotal(this.state.session))}. ${notFound.length} produit(s) sont signalés comme non trouvés.`;
    $('#closeAdvancePhase').checked = this.state.settings.currentPhase < 4;
    $('#closeAdvancePhase').disabled = this.state.settings.currentPhase >= 4;
    this.openDialog('closeCycleDialog');
  }

  confirmCloseCycle(event) {
    event.preventDefault();
    let entry;
    this.store.update(state => {
      entry = closeSession(state, { advancePhase: $('#closeAdvancePhase').checked });
    });
    this.closeDialog('closeCycleDialog');
    this.toast(`Inventaire clôturé : ${euro(entry.totalActual)}.`);
    this.setView('history');
  }

  openSettingsDialog() {
    this.renderSettings();
    this.openDialog('settingsDialog');
  }

  exportData() {
    const payload = {
      app: APP_CONFIG.name,
      appVersion: APP_CONFIG.version,
      schemaVersion: APP_CONFIG.schemaVersion,
      exportedAt: new Date().toISOString(),
      state: this.state
    };
    downloadJson(`dorox-sauvegarde-${isoToday()}.json`, payload);
    this.toast('Sauvegarde exportée.');
  }

  async importData(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    try {
      const payload = await readJsonFile(file);
      const nextState = payload.state || payload;
      if (!Array.isArray(nextState.products)) throw new Error('Cette sauvegarde ne contient pas d’inventaire DOROX valide.');
      if (!confirm(`Restaurer cette sauvegarde contenant ${nextState.products.length} produit(s) ? Les données actuelles seront remplacées.`)) return;
      this.store.replace(nextState);
      this.closeDialog('settingsDialog');
      this.toast('Sauvegarde restaurée.');
    } catch (error) {
      alert(error.message || 'Import impossible.');
    }
  }

  async resetApp() {
    if (!confirm('Réinitialiser DOROX ? Tous les produits modifiés, budgets, cycles et historiques locaux seront effacés.')) return;
    if (!confirm('Dernière confirmation : avez-vous exporté une sauvegarde si nécessaire ?')) return;
    await this.store.reset();
    this.closeDialog('settingsDialog');
    this.toast('DOROX a été réinitialisée.');
    this.setView('dashboard');
  }

  trackVersionTap() {
    const now = Date.now();
    this.versionTaps = this.versionTaps.filter(time => now - time < 8000);
    this.versionTaps.push(now);
    const remaining = 7 - this.versionTaps.length;
    if (remaining > 0 && remaining <= 3) this.toast(`Encore ${remaining} appui(s) pour le mode développeur.`);
    if (this.versionTaps.length >= 7) {
      this.versionTaps = [];
      this.store.update(state => { state.settings.developerMode = !state.settings.developerMode; });
      this.toast(this.state.settings.developerMode ? 'Mode développeur activé.' : 'Mode développeur désactivé.');
    }
  }

  openDialog(id) {
    const dialog = document.getElementById(id);
    if (!dialog) return;
    $$('dialog').filter(item => item.open && item !== dialog).forEach(item => item.close());
    if (!dialog.open) dialog.showModal();
    document.body.classList.add('dialog-open');
  }

  closeDialog(id) {
    const dialog = document.getElementById(id);
    if (dialog?.open) dialog.close();
  }

  async installApp() {
    if (isStandalone()) {
      this.toast('DOROX est déjà installée.');
      return;
    }
    if (this.deferredInstallPrompt) {
      this.deferredInstallPrompt.prompt();
      await this.deferredInstallPrompt.userChoice;
      this.deferredInstallPrompt = null;
      this.renderPwaPanel();
      return;
    }
    this.showInstallHelp();
  }

  showInstallHelp() {
    let html;
    if (!isSecureContextForPwa()) {
      html = `<div class="notice danger"><strong>Adresse sécurisée nécessaire</strong><span>Publiez DOROX sur GitHub Pages puis ouvrez son adresse HTTPS.</span></div>`;
    } else if (isIOS()) {
      html = `<p class="dialog-intro">Sur iPhone, l’installation se fait depuis Safari.</p><ol class="install-steps"><li>Ouvrez l’adresse de DOROX dans <strong>Safari</strong>.</li><li>Appuyez sur le bouton <strong>Partager</strong> (carré avec une flèche vers le haut).</li><li>Choisissez <strong>Sur l’écran d’accueil</strong>.</li><li>Conservez le nom <strong>DOROX</strong>, puis appuyez sur <strong>Ajouter</strong>.</li><li>Lancez ensuite DOROX depuis sa nouvelle icône.</li></ol>`;
    } else {
      html = `<p class="dialog-intro">L’option peut se trouver dans le menu du navigateur même lorsqu’aucune icône n’apparaît dans la barre d’adresse.</p><ol class="install-steps"><li>Ouvrez le menu du navigateur <strong>⋮</strong>.</li><li>Choisissez <strong>Installer DOROX</strong> ou <strong>Installer la page en tant qu’application</strong>.</li><li>Confirmez l’installation.</li></ol><div class="notice"><strong>Installation non proposée ?</strong><span>Rechargez la page après quelques secondes et vérifiez que le manifeste et le service worker ne renvoient pas d’erreur 404.</span></div>`;
    }
    $('#installContent').innerHTML = html;
    this.openDialog('installDialog');
  }

  updateNetworkStatus() {
    $('#offlineBanner').hidden = navigator.onLine;
    this.renderPwaPanel();
  }

  async registerPwa() {
    if (!('serviceWorker' in navigator) || !isSecureContextForPwa()) return;
    try {
      const registration = await navigator.serviceWorker.register('./sw.js', { scope: './', updateViaCache: 'none' });
      await registration.update().catch(() => undefined);
      if (registration.waiting) this.showUpdate(registration.waiting);
      registration.addEventListener('updatefound', () => {
        const worker = registration.installing;
        worker?.addEventListener('statechange', () => {
          if (worker.state === 'installed' && navigator.serviceWorker.controller) this.showUpdate(worker);
        });
      });
      navigator.serviceWorker.addEventListener('controllerchange', () => location.reload());
      this.renderPwaPanel();
    } catch (error) {
      console.error('[DOROX] Service worker non enregistré.', error);
    }
  }

  showUpdate(worker) {
    this.waitingServiceWorker = worker;
    $('#updateBanner').hidden = false;
  }

  applyUpdate() {
    this.waitingServiceWorker?.postMessage({ type: 'SKIP_WAITING' });
    $('#updateBanner').hidden = true;
  }

  toast(message) {
    const element = $('#toast');
    element.textContent = message;
    element.classList.add('show');
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => element.classList.remove('show'), 2200);
  }
}

const app = new DoroxApp();

$('#versionTap').addEventListener('click', () => app.trackVersionTap());

app.init().catch(error => {
  console.error(error);
  const fatal = $('#fatalError');
  fatal.hidden = false;
  fatal.innerHTML = `<strong>DOROX n’a pas pu démarrer.</strong><br>${escapeHtml(error.message || String(error))}`;
});
