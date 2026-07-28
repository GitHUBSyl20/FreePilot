-- FreePilot — synchronisation cloud.
--
-- Le moteur de calcul travaille sur un document `FinanceData` entier : les
-- factures, l'ARE et le CRM se lisent ensemble, et la migration de schéma est
-- écrite pour le document complet. Éclater ce document en tables jetterait
-- cette cohérence par-dessus bord pour un seul utilisateur par ligne. On
-- stocke donc le document tel quel, avec une révision qui arbitre les
-- écritures concurrentes entre le téléphone et l'ordinateur.

create table if not exists public.finance_documents (
  user_id uuid primary key references auth.users (id) on delete cascade,
  -- Version du schéma applicatif ayant écrit ce document. Un appareil qui lit
  -- une version supérieure à la sienne doit refuser : il perdrait des champs.
  schema_version integer not null,
  -- Incrémentée à chaque écriture : un envoi ne passe que s'il connaît la
  -- révision courante, sinon deux appareils s'écraseraient en silence.
  revision bigint not null default 1,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.finance_documents enable row level security;

-- Une politique par opération : chacun ne voit et n'écrit que sa propre ligne.
-- `with check` est indispensable sur insert et update, sans quoi on pourrait
-- écrire une ligne au nom d'un autre.
drop policy if exists "finance_documents_select_own" on public.finance_documents;
create policy "finance_documents_select_own" on public.finance_documents
  for select using (auth.uid() = user_id);

drop policy if exists "finance_documents_insert_own" on public.finance_documents;
create policy "finance_documents_insert_own" on public.finance_documents
  for insert with check (auth.uid() = user_id);

drop policy if exists "finance_documents_update_own" on public.finance_documents;
create policy "finance_documents_update_own" on public.finance_documents
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "finance_documents_delete_own" on public.finance_documents;
create policy "finance_documents_delete_own" on public.finance_documents
  for delete using (auth.uid() = user_id);

-- Écriture atomique du document.
--
-- Renvoie la nouvelle révision, ou `null` quand la révision attendue ne
-- correspond plus : un autre appareil a écrit entre-temps, et c'est à
-- l'utilisateur de trancher. `p_force` sert précisément à appliquer ce choix.
--
-- `security invoker` : la fonction s'exécute avec les droits de l'appelant,
-- donc sous RLS. En `security definer` elle contournerait les politiques
-- ci-dessus et `auth.uid()` deviendrait la seule barrière.
create or replace function public.push_finance_document(
  p_data jsonb,
  p_schema_version integer,
  p_expected_revision bigint,
  p_force boolean default false
) returns bigint
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_current bigint;
  v_next bigint;
begin
  if v_user is null then
    raise exception 'Authentification requise.';
  end if;

  -- `for update` verrouille la ligne : deux envois simultanés du même compte
  -- se sérialisent au lieu de lire la même révision et de s'écraser.
  select revision into v_current
    from finance_documents
   where user_id = v_user
     for update;

  if v_current is null then
    insert into finance_documents (user_id, schema_version, revision, data)
    values (v_user, p_schema_version, 1, p_data);
    return 1;
  end if;

  -- `is distinct from` traite le cas d'un appareil qui n'a jamais synchronisé
  -- (révision attendue nulle) alors qu'un document existe déjà : c'est un
  -- conflit, pas une première écriture.
  if not p_force and p_expected_revision is distinct from v_current then
    return null;
  end if;

  v_next := v_current + 1;

  update finance_documents
     set data = p_data,
         schema_version = p_schema_version,
         revision = v_next,
         updated_at = now()
   where user_id = v_user;

  return v_next;
end;
$$;
