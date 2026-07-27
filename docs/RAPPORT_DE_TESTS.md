# Rapport de tests — DOROX V1 officielle

Date : 26 juillet 2026  
Version : 1.0.0  
Build : 2026.07.26

## Contrôles réussis

### Intégrité du projet

- syntaxe JavaScript valide pour tous les modules et le service worker ;
- manifeste JSON valide ;
- 61 produits présents dans l’inventaire initial ;
- identifiants HTML uniques ;
- toutes les références DOM utilisées par l’application correspondent à un élément existant ;
- toutes les ressources du cache hors ligne existent ;
- dimensions des icônes conformes au manifeste ;
- captures PWA mobiles conformes à 390 × 844 pixels.

### Moteur métier

- budget habituel de 400 € ;
- réserve protégée de 20 € par défaut ;
- priorité du choix manuel et du stock réel ;
- génération de la liste proposée ;
- classement interne sans affichage de score ;
- suggestions de report en cas de dépassement ;
- conservation de la décision finale par l’utilisateur ;
- clôture avec mise à jour du stock et du prix réel ;
- maintien d’un produit non trouvé dans les achats à prévoir ;
- passage contrôlé à la phase suivante ;
- calcul des dépenses et du budget restant.

### Parcours d’interface automatisé

Un parcours mobile de 390 × 844 pixels a été exécuté dans un navigateur sans interface graphique :

1. ouverture du tableau de bord ;
2. vérification du budget de 400 € ;
3. affichage des 61 produits ;
4. recherche d’un produit ;
5. modification rapide d’un stock ;
6. génération d’une préparation ;
7. ouverture de « Pourquoi ? » ;
8. validation d’un produit ;
9. passage en mode Courses ;
10. modification du prix réel ;
11. marquage du produit comme acheté ;
12. clôture du cycle ;
13. vérification de l’historique ;
14. modification du budget exceptionnel.

Résultat : parcours terminé sans erreur JavaScript.

## Validation restant à effectuer

L’installation réelle, l’ouverture en plein écran et le fonctionnement en mode Avion doivent encore être vérifiés sur l’iPhone de l’utilisatrice après publication sur GitHub Pages. Cette vérification dépend de Safari, de la version d’iOS et de la mise en ligne HTTPS.
