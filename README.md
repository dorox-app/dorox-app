# DOROX V1 officielle

DOROX est une Progressive Web App mobile-first destinée à la gestion familiale des courses, des stocks et du budget. Elle fonctionne sans compte et conserve ses données localement sur l’appareil.

## Version

- Version : 1.0.0
- Build : 2026.07.26
- Schéma de données : 2

## Fonctions incluses

- inventaire de départ de 61 produits ;
- modification rapide des niveaux de stock ;
- budget mensuel habituel de 400 € par défaut ;
- budget exceptionnel propre au mois suivi ;
- quatre phases d’inventaire ;
- réserve de phase 4 réglable entre 15 € et 30 € ;
- moteur interne d’attention, de classement et d’arbitrage ;
- décisions utilisateur : valider, modifier, reporter, écarter ;
- explication facultative « Pourquoi ? » ;
- mode Courses avec prix réel, achat coché et produit non trouvé ;
- clôture explicite, mise à jour du stock et archivage ;
- historique des achats et des arbitrages ;
- export et restauration JSON ;
- fonctionnement hors connexion après la première ouverture ;
- installation sur l’écran d’accueil de l’iPhone ;
- détection des mises à jour.

## Architecture

```text
assets/icons/              Icônes de l’application
css/app.css                Interface mobile-first
js/config.js               Configuration et constantes
js/data/default-products.js Inventaire initial
js/engine.js               Règles métier et moteur d’arbitrage
js/storage.js              Base locale IndexedDB et repli localStorage
js/state.js                État, migration et persistance
js/utils.js                Fonctions utilitaires
js/app.js                  Contrôleur d’interface
index.html                 Structure des écrans
manifest.webmanifest       Installation PWA
sw.js                      Cache hors ligne et mises à jour
```

## Déploiement sur GitHub Pages

Déposez le contenu de ce dossier à la racine du dépôt GitHub. Le fichier `index.html` doit être directement visible sur la page principale du dépôt, et non placé dans un sous-dossier supplémentaire.

Activez ensuite :

```text
Settings → Pages → Deploy from a branch → main → /(root)
```

La publication doit utiliser HTTPS. Consultez `docs/INSTALLATION_IPHONE.md`.

## Données et confidentialité

DOROX n’envoie pas les données vers un serveur. IndexedDB est utilisé en priorité ; localStorage sert de solution de repli. La suppression des données du navigateur peut effacer l’inventaire et l’historique. Utilisez régulièrement la fonction **Exporter**.

## Mode développeur

Le mode développeur est désactivé et masqué par défaut. Dans les paramètres, appuyez sept fois rapidement sur le bloc indiquant la version. Il permet de consulter des informations techniques et de réinitialiser l’application.
