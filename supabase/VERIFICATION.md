# Vérifier la synchronisation de bout en bout

Le lot 5 n'a jamais tourné contre un vrai projet Supabase. Cette procédure se
déroule une fois, après la [mise en service](README.md), et couvre ce qu'aucun
test automatisé ne peut atteindre.

## Ce qui est déjà couvert, et ce qui ne l'est pas

`tests/sync.test.ts` vérifie la matrice de décision complète — envoyer, tirer,
ne rien faire, conflit, blocage — ainsi que l'empreinte qui la nourrit. Inutile
de rejouer ces cas à la main : ils passent déjà.

Ce qui n'a jamais été exercé, c'est tout ce qui touche au serveur réel : la
signature de la fonction `push_finance_document` telle que le client l'appelle,
le comportement des politiques RLS pendant l'insertion, la persistance de la
session, et l'enchaînement des états dans l'écran Cloud. Un décalage sur l'un
de ces points ne se voit qu'ici.

## Préparation

Prévoir deux navigateurs **réellement séparés** — deux profils Chrome, ou
Chrome et Firefox. Une fenêtre de navigation privée convient aussi, à condition
de ne pas la fermer en cours de route : elle perdrait sa session et son
IndexedDB. Ils sont appelés **A** et **B** ci-dessous.

Deux comptes sont nécessaires : le compte principal, et un second créé de la
même façon (**Authentication > Users > Add user**) qui ne servira qu'au
contrôle d'isolation. Il sera supprimé à la fin.

Exporter les données depuis **Réglages > Données** avant de commencer. Plusieurs
étapes écrasent délibérément un côté par l'autre.

Les requêtes SQL ci-dessous se collent dans **SQL Editor**. Elles s'exécutent
avec les droits d'administration : elles servent à observer, jamais à prouver
qu'une protection fonctionne.

```sql
-- État du document, sans en afficher le contenu.
select user_id, revision, schema_version, updated_at
  from finance_documents;
```

---

## A. Câblage

**1. Sans configuration, rien ne part.** Renommer temporairement `.env.local`,
relancer le serveur, ouvrir **Réglages > Cloud**.

- *Attendu* : « Local uniquement » et le renvoi vers `supabase/README.md`.
  Aucune requête vers `supabase.co` dans l'onglet Réseau.
- *Ce que ça prouve* : le chargement paresseux tient. C'est la promesse qui
  permet de garder l'application utilisable sans compte.

**2. Avec configuration.** Remettre `.env.local`, relancer le serveur — Vite ne
lit les variables qu'au démarrage.

- *Attendu* : « Déconnecté » et le formulaire de connexion.

## B. Authentification

**3. Mauvais mot de passe.**

- *Attendu* : « Adresse ou mot de passe incorrect. » en français.
- *Ce que ça prouve* : `translateCloudError` reconnaît le message réellement
  renvoyé par le projet. Les libellés de Supabase changent d'une version à
  l'autre ; si l'anglais passe au travers, c'est ici qu'on le voit.

**4. Bon mot de passe.**

- *Attendu* : l'écran bascule sur l'état connecté, statut « À jour » puis, au
  bout de ~2,5 s et sans rien avoir touché, « Synchronisation… » et « Dernière
  synchro » qui se remplit.
- *À savoir* : la connexion suffit à déclencher le premier envoi. Il n'y a pas
  besoin de modifier quoi que ce soit, et la ligne existe donc déjà avant
  l'étape 6.

**5. Recharger la page.**

- *Attendu* : toujours connecté, sans ressaisie.

## C. Première écriture

**6. Regarder la ligne créée** par la connexion, avec la requête ci-dessus.

- *Attendu* : une ligne, `revision` à 1, `schema_version` à 4.
- *Ce que ça prouve* : c'est le contrôle central de tout ce document. La
  fonction est en `security invoker`, donc elle insère **sous** RLS : il faut
  que la politique `finance_documents_insert_own` laisse passer l'insertion
  faite depuis la fonction. Si aucune ligne n'apparaît ou qu'une erreur de
  politique remonte dans l'écran Cloud, tout le reste est inutile. Ce contrôle
  valide aussi que les quatre paramètres nommés (`p_data`, `p_schema_version`,
  `p_expected_revision`, `p_force`) correspondent exactement à ce que le client
  envoie — une signature décalée échoue seulement à l'exécution.

**7. Modifier une donnée** — par exemple un palier de CA — et ne plus rien
toucher.

- *Attendu* : au bout de ~2,5 s, « Synchronisation… » puis « À jour », et
  `revision` passe à 2.
- *Ce que ça prouve* : le chemin `update` de la fonction, distinct du chemin
  `insert` vérifié à l'étape 6, et le déclenchement automatique après un temps
  de repos.

**8. Modifier une seconde fois.**

- *Attendu* : `revision` passe à 3, sans intervention.

## D. Aller-retour entre deux appareils

**9. Ouvrir B, se connecter avec le même compte.**

- *Attendu* : « Conflit à trancher » et le panneau « Quelle version garder ? ».
- *Ce que ça prouve* : c'est le comportement voulu, pas une anomalie. B a ses
  propres données de démonstration et ne connaît aucune révision ; rien ne dit
  lequel des deux côtés est le bon.

**10. Sur B, choisir « Prendre la version du cloud ».**

- *Attendu* : « Données du cloud récupérées. », les données de A apparaissent,
  `revision` inchangée côté serveur.

**11. Modifier une donnée sur B**, attendre la synchro, puis revenir sur
l'onglet A sans le recharger.

- *Attendu* : A se synchronise seul au retour au premier plan et affiche la
  modification faite sur B.
- *Ce que ça prouve* : l'écoute de `visibilitychange`. Sans elle, un appareil
  laissé ouvert reste sur des données périmées jusqu'à sa prochaine
  modification.

## E. Conflit réel

**12. Passer A hors ligne** (DevTools > Réseau > Offline) et y modifier une
donnée. Modifier autre chose sur B, resté en ligne, et attendre sa synchro.

- *Attendu sur A* : statut « Hors ligne », sans message d'erreur.
- *Ce que ça prouve* : l'absence de réseau est traitée comme un état normal.

**13. Remettre A en ligne.**

- *Attendu* : A se synchronise au retour du réseau et affiche « Conflit à
  trancher » — les deux côtés ont bougé depuis la dernière synchro commune.

**14. Sur A, choisir « Garder cet appareil ».**

- *Attendu* : `revision` s'incrémente, les données de A l'emportent, et B
  récupère la version de A à son prochain retour au premier plan.
- *Ce que ça prouve* : l'envoi forcé passe outre la révision attendue. C'est la
  seule écriture du système qui écrase sciemment, et elle ne doit se produire
  que sur ce clic.

## F. Isolation entre comptes

**15. Sur un troisième profil, se connecter avec le second compte.**

- *Attendu* : aucune donnée du compte principal. L'application part de ses
  données locales et signale un conflit ou envoie, selon son état.
- *Ce que ça prouve* : les politiques RLS isolent réellement. C'est le seul
  contrôle de sécurité de la liste, et il ne vaut que fait depuis
  l'application : `select` en SQL Editor contourne RLS et renverrait tout.

**16. Laisser le second compte écrire, puis compter les lignes.**

- *Attendu* : deux lignes, deux `user_id` distincts, et chaque application ne
  voit toujours que la sienne.

## G. Refus d'un document trop récent

**17. Simuler un cloud écrit par une version future :**

```sql
update finance_documents
   set schema_version = schema_version + 1
 where user_id = '<user_id du compte principal>';
```

Puis, sur A, modifier une donnée.

- *Attendu* : « Mise à jour requise », et **aucune écriture** — `revision` ne
  bouge pas.
- *Ce que ça prouve* : un appareil resté en arrière ne réécrit pas un document
  dont il ne comprend pas tous les champs. Sans ce refus, il les effacerait
  définitivement.

**18. Remettre la valeur d'origine.**

```sql
update finance_documents
   set schema_version = schema_version - 1
 where user_id = '<user_id du compte principal>';
```

- *Attendu* : la synchro repart normalement.

## H. Déconnexion

**19. Se déconnecter sur A.**

- *Attendu* : retour au formulaire ; les données locales sont intactes. En se
  reconnectant, « Dernière synchro » repart de « Jamais », puis un conflit
  s'affiche au bout de ~2,5 s — l'appareil ne connaît plus de révision face à
  un cloud rempli, exactement comme à l'étape 9. Trancher « Prendre la version
  du cloud » remet tout en ordre.
- *Ce que ça prouve* : l'état de synchro est effacé avec la session. Le
  conserver ferait croire au compte suivant qu'il connaît une révision qui ne
  le concerne pas — c'est précisément ce conflit, un peu pénible, qui protège
  d'un écrasement silencieux entre deux comptes sur la même machine.

---

## Remise à zéro entre deux passages

```sql
delete from finance_documents where user_id = '<user_id>';
```

Côté navigateur, vider IndexedDB (Application > Storage) supprime aussi les
données locales et l'état de synchro : réimporter l'export fait en préparation.

Supprimer le second compte dans **Authentication > Users** une fois l'étape 16
validée.

## Android

Les variables sont figées dans le bundle au moment du `npm run build` qui
précède `cap sync`. Un APK construit sans `.env.local` reste en local
définitivement, sans message d'erreur — l'écran Cloud affiche simplement
« Local uniquement ». Le vérifier sur l'appareil avant de conclure que la
synchro est en panne.
