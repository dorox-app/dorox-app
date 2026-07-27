# Installation de DOROX sur iPhone

## Avant de commencer

DOROX doit être publiée sur une adresse HTTPS, par exemple :

```text
https://dorox-app.github.io/dorox-app/
```

L’ouverture directe de `index.html` depuis l’application Fichiers ne permet pas d’activer correctement toutes les fonctions PWA.

## Installation

1. Ouvrez l’adresse publiée dans **Safari** sur l’iPhone.
2. Attendez la fin du premier chargement.
3. Appuyez sur le bouton **Partager** : le carré avec une flèche dirigée vers le haut.
4. Faites défiler la liste et choisissez **Sur l’écran d’accueil**.
5. Conservez le nom **DOROX**.
6. Appuyez sur **Ajouter**.
7. Revenez à l’écran d’accueil et ouvrez DOROX depuis son icône.

L’application doit s’ouvrir en plein écran, sans la barre habituelle de Safari.

## Vérification hors ligne

1. Ouvrez DOROX une première fois avec une connexion Internet.
2. Fermez l’application.
3. Activez le mode Avion.
4. Relancez DOROX depuis son icône.
5. Vérifiez que l’inventaire et les écrans restent accessibles.

Les données déjà présentes restent modifiables hors ligne. La mise à jour d’une nouvelle version nécessite une reconnexion.

## Sauvegarde recommandée

Dans DOROX :

```text
⚙ Paramètres → Exporter
```

Conservez le fichier JSON dans iCloud Drive ou dans un autre espace fiable. Safari peut supprimer les données locales si l’utilisateur efface les données de sites.

## En cas de problème

### L’ancienne version apparaît encore

- fermez complètement DOROX ;
- rouvrez l’adresse dans Safari ;
- rechargez la page ;
- attendez l’affichage de la proposition de mise à jour ;
- au besoin, supprimez l’ancienne icône puis ajoutez de nouveau DOROX à l’écran d’accueil.

### L’application ne fonctionne pas hors ligne

Vérifiez que les adresses suivantes ne renvoient pas d’erreur 404 :

```text
https://dorox-app.github.io/dorox-app/manifest.webmanifest
https://dorox-app.github.io/dorox-app/sw.js
https://dorox-app.github.io/dorox-app/js/app.js
```

Ouvrez ensuite DOROX en ligne une nouvelle fois avant de refaire le test en mode Avion.
