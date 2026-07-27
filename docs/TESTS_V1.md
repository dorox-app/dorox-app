# Parcours de validation de DOROX V1

## Test 1 — Démarrage

- DOROX s’ouvre sans message d’erreur.
- Le tableau de bord affiche un budget habituel de 400 €.
- L’inventaire contient 61 produits.

## Test 2 — Inventaire

- Rechercher un produit.
- Filtrer par catégorie, stock, niveau et souplesse.
- Modifier rapidement un stock depuis la carte.
- Modifier un produit dans la fenêtre complète.
- Ajouter manuellement un produit à la préparation.

## Test 3 — Budget

- Modifier le budget habituel.
- Renseigner un budget exceptionnel du mois.
- Vérifier que le budget exceptionnel remplace le budget habituel pour le mois suivi.
- Modifier la réserve entre 15 € et 30 €.
- Vérifier que le calcul se met à jour sans supprimer de produit.

## Test 4 — Préparation

- Générer la liste proposée.
- Ouvrir « Pourquoi ? ».
- Valider un produit.
- Modifier sa quantité et son prix estimé.
- Reporter un produit.
- Écarter un produit.
- Réintégrer un produit reporté ou écarté.
- Vérifier que les reports suggérés apparaissent en cas de dépassement.

## Test 5 — Mode Courses

- Cocher un produit acheté.
- Modifier son prix réel.
- Signaler un produit non trouvé.
- Vérifier le recalcul immédiat du panier et du budget restant.

## Test 6 — Clôture

- Clôturer l’inventaire.
- Confirmer que les produits achetés passent à « Plein ».
- Confirmer que leur dernier prix et leur dernière date d’achat sont mis à jour.
- Confirmer qu’un produit non trouvé reste à acheter.
- Vérifier l’archivage des reports et des exclusions.

## Test 7 — Sauvegarde

- Exporter les données.
- Modifier un produit.
- Importer la sauvegarde.
- Vérifier la restauration de l’état précédent.

## Test 8 — PWA iPhone

- Ajouter DOROX à l’écran d’accueil depuis Safari.
- Ouvrir depuis l’icône.
- Vérifier l’ouverture en plein écran.
- Tester une seconde ouverture en mode Avion.
