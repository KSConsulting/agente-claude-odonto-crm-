-- =============================================================================
-- 0020 — APAGAR A FOTO DE PERFIL E A LOGO DA CLÍNICA
--
-- Dava para TROCAR as duas e não dava para TIRAR. E o que faltava não era o
-- botão: `storage.objects` tem RLS ligado, e não existia política de DELETE em
-- bucket nenhum. Um `remove()` do cliente voltaria sem apagar nada — e a tela,
-- achando que deu certo, nularia a coluna e deixaria o arquivo para trás.
--
-- Órfão em bucket público é pior que arquivo grande: a URL continua de pé, e
-- quem a tiver continua vendo a foto que a pessoa mandou apagar.
--
-- ── A REGRA DE CADA UMA É A MESMA DO UPLOAD ────────────────────────────────
--
-- Nenhuma permissão nova é inventada aqui: quem pode pôr, pode tirar.
--
--   avatars → só a própria pasta (`auth.uid()`), como no INSERT e no UPDATE
--   logos   → qualquer autenticado, porque a logo é da clínica e não de alguém
--
-- ⚠️ `midias-whatsapp` continua SEM delete, de propósito. Ali quem apaga é a
-- Edge Function com a `service_role key`, pela rota `/whatsapp/apagar-pessoa`,
-- e a ordem importa (mídia primeiro, ficha depois — o caminho do arquivo é
-- `{lead_id}/...`). Dar delete à equipe abriria um segundo caminho para o
-- mesmo estrago, sem essa ordem e sem a contagem na frente.
--
-- Documentação: DATABASE.md seção 7
-- =============================================================================

-- Foto de perfil: cada um apaga a sua, na própria pasta.
drop policy if exists "avatars_own_delete" on storage.objects;
create policy "avatars_own_delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

-- Logo da clínica: qualquer um da equipe, igual ao insert e ao update.
drop policy if exists "logos_team_delete" on storage.objects;
create policy "logos_team_delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'logos');


-- =============================================================================
-- CONFERÊNCIA
-- =============================================================================

-- As duas nasceram? (esperado: 2 linhas, cmd = DELETE)
--   select policyname, cmd from pg_policies
--   where schemaname = 'storage' and tablename = 'objects'
--     and policyname in ('avatars_own_delete', 'logos_team_delete');

-- E `midias-whatsapp` continua sem? (esperado: 0 linhas)
--   select policyname from pg_policies
--   where schemaname = 'storage' and tablename = 'objects'
--     and cmd = 'DELETE' and qual like '%midias-whatsapp%';
