# Synchronisation cloud

FreePilot fonctionne sans serveur. Cette partie est optionnelle : elle sert à
retrouver les mêmes données sur le téléphone et sur l'ordinateur. Tant que les
variables d'environnement sont absentes, aucun code réseau n'est chargé et
l'application reste strictement locale.

## Le modèle retenu

Un document par compte, pas une table par entité.

Le moteur de calcul travaille sur un `FinanceData` entier : les factures,
l'ARE et le CRM se lisent ensemble, et la migration de schéma est écrite pour
le document complet. Éclater ce document en tables relationnelles imposerait
d'écrire — et de maintenir — une seconde représentation des mêmes données,
pour un seul utilisateur par ligne. Le document est donc stocké tel quel dans
une colonne `jsonb`.

Les écritures concurrentes sont arbitrées par une révision, incrémentée côté
serveur. Un appareil n'écrit que s'il annonce la révision qu'il croit
courante ; sinon l'envoi est refusé et l'application demande à l'utilisateur
quelle version garder. Personne n'écrase personne en silence.

## Mise en service

1. Créer un projet sur [supabase.com](https://supabase.com) (le palier gratuit
   suffit largement pour un document de quelques dizaines de kilo-octets).
2. Ouvrir **SQL Editor**, coller le contenu de [`schema.sql`](schema.sql) et
   l'exécuter. Le script est ré-exécutable sans dommage.
3. Aller dans **Authentication > Users > Add user**, créer le compte avec une
   adresse et un mot de passe, et cocher la confirmation automatique de
   l'adresse. C'est le seul compte à créer : l'inscription libre n'est pas
   ouverte dans l'application.
4. Dans **Authentication > Sign In / Providers**, laisser *Email* activé et
   désactiver **Allow new users to sign up** — le projet n'a pas vocation à
   accueillir d'autres comptes.
5. Relever l'URL du projet et la clé `anon` dans **Project Settings > API**.
6. Copier `.env.example` en `.env.local` à la racine du dépôt et y coller les
   deux valeurs, puis relancer `npm run dev` (Vite ne lit les variables qu'au
   démarrage).
7. Dans l'application, onglet **Réglages**, se connecter avec l'adresse et le
   mot de passe créés à l'étape 3.

Pour l'application Android, les mêmes variables doivent être présentes au
moment du `npm run build` qui précède `cap sync` : elles sont figées dans le
bundle.

## Vérifier que la protection fonctionne

Dans **SQL Editor**, `select * from finance_documents;` s'exécute avec les
droits d'administration et renvoie tout : ce n'est pas un test. La bonne
vérification est côté application, avec un second compte : il ne doit voir
aucune ligne. Les politiques `finance_documents_*` de [`schema.sql`](schema.sql)
limitent chaque compte à `auth.uid() = user_id`, en lecture comme en écriture.

## Ce que le cloud ne remplace pas

L'export JSON reste la vraie sauvegarde : il ne dépend d'aucun service, se
relit tel quel et survit à la suppression du projet Supabase. La
synchronisation résout un problème de commodité entre appareils, pas un
problème d'archivage.

Attention à un enchaînement : **Réinitialisation** efface les données locales
et les remplace par les données de démonstration, qui partiront au cloud à la
synchronisation suivante. Exporter avant.
