# Déployer DOROX V1 sur GitHub Pages

## 1. Préparer le dépôt

Conservez le dépôt `dorox-app`. Vous pouvez supprimer les anciens fichiers du prototype avant de charger cette version, mais ne supprimez ni le dépôt ni sa configuration Pages.

## 2. Charger les fichiers

Sur la page principale du dépôt :

1. cliquez sur **Add file** ;
2. choisissez **Upload files** ;
3. ouvrez le dossier décompressé `DOROX_V1_OFFICIELLE` ;
4. sélectionnez tout son contenu ;
5. glissez les fichiers dans GitHub ;
6. saisissez le message `Publication de DOROX V1 officielle 1.0.0` ;
7. cliquez sur **Commit changes**.

Le dépôt doit afficher directement :

```text
assets/
css/
docs/
js/
index.html
manifest.webmanifest
sw.js
.nojekyll
README.md
VERSION.txt
```

Il ne faut pas obtenir :

```text
DOROX_V1_OFFICIELLE/index.html
```

Dans ce cas, les fichiers ont été déposés un niveau trop bas.

## 3. Vérifier GitHub Pages

Dans le dépôt :

```text
Settings → Pages
```

Configuration attendue :

- Source : `Deploy from a branch`
- Branch : `main`
- Folder : `/(root)`

## 4. Attendre la publication

Après le commit, GitHub Pages peut prendre quelques minutes. Ouvrez ensuite :

```text
https://dorox-app.github.io/dorox-app/
```

Puis vérifiez :

```text
https://dorox-app.github.io/dorox-app/manifest.webmanifest
https://dorox-app.github.io/dorox-app/sw.js
```

Les deux adresses doivent afficher du contenu et non une page 404.
