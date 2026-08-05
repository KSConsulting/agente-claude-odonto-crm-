-- =============================================================================
-- AGENDA E PROFISSIONAIS
-- Rode este arquivo no SQL Editor DEPOIS de 0001_schema_inicial.sql.
--
-- ✅ APLICADO E VERIFICADO NO BANCO (projeto Odonto Clinica, PostgreSQL 17.6).
--    A restrição da seção 6 foi testada com consultas sobrepostas de verdade.
--
-- O que entra aqui:
--   • profissionais            → os dentistas da clínica
--   • profissional_horarios    → jornada de cada um, 1 linha por dia da semana
--   • profissional_bloqueios   → férias, feriado, almoço, compromisso
--   • colunas novas em consultas (profissional, duração, origem, idempotência)
--   • restrição que IMPEDE agendamento duplo no próprio banco
--   • fuso horário da clínica, para o cálculo de disponibilidade
--
-- DECISÃO CENTRAL: não existe tabela "agenda". A agenda de um profissional é
-- o conjunto de consultas com o `profissional_id` dele. Criar o profissional
-- já cria a agenda, e não existe estado inconsistente possível entre os dois.
--
-- Este schema já nasce preparado para a API que o Agente de IA vai consumir
-- (ver seção 8 do DATABASE.md): as garantias que uma automação precisa estão
-- no BANCO, não na interface, porque a interface não participa dessas chamadas.
-- =============================================================================


-- =============================================================================
-- 1. EXTENSÃO — btree_gist
--
-- Necessária para a restrição de exclusão da seção 6: ela combina uma
-- comparação de igualdade (`profissional_id`) com uma de sobreposição
-- (intervalo de tempo) no MESMO índice, e o GiST nativo não sabe comparar
-- uuid por igualdade sem esta extensão.
-- =============================================================================

create extension if not exists btree_gist;


-- =============================================================================
-- 2. TABELA: profissionais
-- Usada em: Profissionais.tsx, Agenda.tsx, LeadDetail.tsx
-- =============================================================================

create table public.profissionais (
  id         uuid primary key default gen_random_uuid(),
  nome       text not null,
  sobrenome  text not null default '',
  cor        text not null default '#1E6E8C'
    check (cor ~ '^#[0-9A-Fa-f]{6}$'),
  ativo      boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- DECISÃO (cor): guardada como hex validado por CHECK, e não como referência a
-- uma tabela de cores. A paleta oferecida na interface é fixa
-- (src/lib/cores.ts), mas o banco aceita qualquer hex válido — assim, trocar a
-- paleta no futuro não exige migração nem invalida dado existente.

-- DECISÃO (sem vínculo com `usuarios`): o profissional NÃO é um usuário do
-- sistema. Foi decidido que dentista não faz login — ele é apenas um recurso de
-- agenda. Se um dia cada um precisar ver só a própria agenda, será preciso
-- acrescentar `usuario_id` aqui e reescrever as políticas de RLS da seção 7.

create index profissionais_ativo_idx on public.profissionais (ativo, nome);

create trigger profissionais_updated_at
  before update on public.profissionais
  for each row execute function public.set_updated_at();


-- =============================================================================
-- 3. TABELA: profissional_horarios
-- Jornada de trabalho — mesma modelagem de `horario_comercial` (0001, seção 4),
-- só que por profissional. Cada um pode ter uma grade diferente.
-- Usada em: Profissionais.tsx (edição), Agenda.tsx (faixas fora de expediente)
-- =============================================================================

create table public.profissional_horarios (
  id              uuid primary key default gen_random_uuid(),
  profissional_id uuid not null references public.profissionais(id) on delete cascade,
  dia_semana      smallint not null check (dia_semana between 0 and 6),
  hora_inicio     time not null,
  hora_fim        time not null,
  ativo           boolean not null default true,
  unique (profissional_id, dia_semana),
  check (hora_fim > hora_inicio)
);

-- `dia_semana`: 0 = domingo ... 6 = sábado — o mesmo do getDay() do JavaScript
-- e o mesmo de `horario_comercial`. Manter idêntico é o que permite comparar as
-- duas grades sem conversão.

-- O UNIQUE existe pelo mesmo motivo do original: a interface acha o dia com um
-- .find(), e linhas duplicadas fariam todas menos a primeira sumirem em
-- silêncio. Aqui é pior que no original, porque a API de disponibilidade também
-- leria só a primeira e ofereceria horário errado ao paciente.

create index profissional_horarios_prof_idx
  on public.profissional_horarios (profissional_id);


-- =============================================================================
-- 4. TABELA: profissional_bloqueios
-- Férias, feriado, almoço, congresso, compromisso pessoal.
-- Usada em: Agenda.tsx e, na fase 2, pelo cálculo de disponibilidade da API.
-- =============================================================================

create table public.profissional_bloqueios (
  id              uuid primary key default gen_random_uuid(),
  profissional_id uuid references public.profissionais(id) on delete cascade,
  inicio          timestamptz not null,
  fim             timestamptz not null,
  motivo          text not null default '',
  created_at      timestamptz not null default now(),
  check (fim > inicio)
);

-- DECISÃO (`profissional_id` aceita NULL): bloqueio sem profissional vale para
-- a CLÍNICA INTEIRA — feriado, dedetização, confraternização. Sem isso, marcar
-- um feriado exigiria uma linha por dentista, e esquecer um deles significaria
-- o Agente de IA oferecendo consulta em dia de clínica fechada.

-- DECISÃO (bloqueio NÃO entra na restrição de exclusão da seção 6): ele impede
-- que a agenda OFEREÇA o horário, mas não impede a equipe de encaixar alguém
-- por cima conscientemente. Emergência odontológica no feriado existe.

create index profissional_bloqueios_periodo_idx
  on public.profissional_bloqueios (inicio, fim);

create index profissional_bloqueios_prof_idx
  on public.profissional_bloqueios (profissional_id, inicio);


-- =============================================================================
-- 5. TABELA consultas — colunas novas
-- =============================================================================

alter table public.consultas
  add column profissional_id     uuid references public.profissionais(id) on delete restrict,
  add column duracao_minutos     integer not null default 60
    check (duracao_minutos > 0 and duracao_minutos <= 600),
  add column origem              text not null default 'equipe'
    check (origem in ('equipe', 'agente_ia')),
  add column chave_externa       text,
  add column cancelado_em        timestamptz,
  add column motivo_cancelamento text,
  add column updated_at          timestamptz not null default now();

-- DECISÃO (`profissional_id` aceita NULL): as consultas que já existem no banco
-- não têm profissional, e o Agente de IA pode marcar antes de a clínica decidir
-- quem atende. Consulta sem profissional aparece na agenda numa faixa
-- "Sem profissional definido", para a recepção distribuir depois.

-- DECISÃO (`on delete restrict`): excluir um profissional com consultas é
-- BLOQUEADO pelo banco. A interface nem oferece exclusão — oferece desativar
-- (`ativo = false`), que tira da agenda e dos seletores sem apagar histórico
-- financeiro nem quebrar consulta antiga.

-- DECISÃO (`duracao_minutos`): um calendário precisa saber onde o bloco TERMINA
-- para desenhá-lo e para detectar sobreposição. Sem esta coluna, a restrição da
-- seção 6 não teria como existir. Padrão de 60 minutos, editável por consulta.

-- DECISÃO (`origem`): distingue o que a equipe marcou do que o Agente de IA
-- marcou. Sem isso, é impossível medir o agente ou auditar um agendamento
-- estranho — e ele vai marcar sozinho, 24h por dia.

create unique index consultas_chave_externa_idx
  on public.consultas (chave_externa)
  where chave_externa is not null;

-- IDEMPOTÊNCIA: toda automação repete chamada quando a resposta demora. Sem
-- esta chave, um retry do n8n cria uma segunda consulta idêntica e o paciente
-- recebe duas confirmações. O n8n manda um identificador estável (o id da
-- mensagem, por exemplo) e a segunda tentativa esbarra no índice em vez de
-- duplicar. Índice PARCIAL porque quem marca pela tela não tem chave nenhuma, e
-- vários NULL não podem colidir entre si.

create trigger consultas_updated_at
  before update on public.consultas
  for each row execute function public.set_updated_at();

create index consultas_profissional_data_idx
  on public.consultas (profissional_id, data_consulta);
-- Consulta da agenda: "tudo do profissional X entre as datas A e B"

create index consultas_data_idx
  on public.consultas (data_consulta);
-- Consulta da agenda sem filtro de profissional: "tudo entre A e B"


-- =============================================================================
-- 6. ⚠️ A RESTRIÇÃO MAIS IMPORTANTE DESTE ARQUIVO
--    Um profissional não pode ter duas consultas ativas se sobrepondo.
--
-- POR QUE NO BANCO, E NÃO NA TELA: a recepção e o Agente de IA escrevem pelo
-- mesmo caminho e ao mesmo tempo. Uma verificação em JavaScript — "já tem algo
-- nesse horário?" seguida de um INSERT — tem uma janela entre a leitura e a
-- escrita em que o outro lado grava. É raro, é intermitente, e o resultado é
-- dois pacientes na mesma cadeira. O banco fecha essa janela; nenhuma
-- verificação em código fecha.
--
-- Vale só para `status = 'agendada'`: consulta cancelada libera o horário,
-- consulta realizada é passado e não deve bloquear remarcação.
--
-- POR QUE EXISTE A COLUNA `data_fim`:
-- o caminho óbvio seria calcular o fim dentro da própria restrição, com
-- `data_consulta + make_interval(mins => duracao_minutos)`. O Postgres RECUSA:
--
--     42P17 -> functions in index expression must be marked IMMUTABLE
--
-- Não é culpa do `make_interval` (que é imutável). O problema é o operador
-- `timestamptz + interval`, que é apenas STABLE: um intervalo pode conter dias
-- e meses, e somar dias a um timestamptz depende do fuso e do horário de verão.
-- O planejador não aceita isso num índice, ainda que aqui o intervalo seja
-- sempre em minutos — que seria exato.
--
-- A saída é materializar o fim numa coluna comum, mantida por trigger. A
-- restrição passa a comparar duas colunas, o que é imutável por definição.
-- (Coluna GENERATED não resolveria: sofre da mesma exigência de imutabilidade.)
-- =============================================================================

alter table public.consultas
  add column data_fim timestamptz;

create or replace function public.calcular_fim_consulta()
returns trigger
language plpgsql
as $$
begin
  new.data_fim := new.data_consulta + make_interval(mins => new.duracao_minutos);
  return new;
end;
$$;

-- BEFORE, e não AFTER: a restrição de exclusão é verificada na inserção da
-- linha, depois dos triggers BEFORE. Num AFTER, `data_fim` ainda estaria nula
-- na hora da checagem.
create trigger consultas_data_fim
  before insert or update of data_consulta, duracao_minutos on public.consultas
  for each row execute function public.calcular_fim_consulta();

-- Preenche o que já existia antes desta migração.
update public.consultas
   set data_fim = data_consulta + make_interval(mins => duracao_minutos)
 where data_fim is null;

alter table public.consultas
  alter column data_fim set not null;

alter table public.consultas
  add constraint consultas_sem_sobreposicao
  exclude using gist (
    profissional_id with =,
    tstzrange(data_consulta, data_fim) with &&
  )
  where (status = 'agendada' and profissional_id is not null);

-- Quem violar recebe o SQLSTATE 23P01 (exclusion_violation). A interface traduz
-- isso para "Já existe consulta nesse horário"; a API da fase 2 deve devolver
-- 409, e NUNCA tentar de novo — repetir dá o mesmo erro.

-- `data_fim` é derivada: NUNCA grave nela direto. Escreva `data_consulta` e
-- `duracao_minutos`; o trigger cuida do resto.


-- =============================================================================
-- 7. ROW LEVEL SECURITY
-- Mesma premissa de 0001: sistema interno, todo autenticado vê tudo.
-- =============================================================================

alter table public.profissionais           enable row level security;
alter table public.profissional_horarios   enable row level security;
alter table public.profissional_bloqueios  enable row level security;

create policy "profissionais_all" on public.profissionais
  for all to authenticated using (true) with check (true);

create policy "profissional_horarios_all" on public.profissional_horarios
  for all to authenticated using (true) with check (true);

create policy "profissional_bloqueios_all" on public.profissional_bloqueios
  for all to authenticated using (true) with check (true);

-- Lembrete que vale para as três: a automação do Agente de IA precisa da
-- `service_role key`. Com a `anon key`, as gravações devolvem 200 OK e zero
-- linhas — falha silenciosa.


-- =============================================================================
-- 8. FUSO HORÁRIO DA CLÍNICA
--
-- `profissional_horarios.hora_inicio/hora_fim` são `time` SEM fuso, e
-- `consultas.data_consulta` é `timestamptz`. Cruzar os dois exige saber em que
-- fuso "08:00" foi escrito. O servidor do Supabase roda em UTC: sem fixar isto,
-- o cálculo de disponibilidade erra em 3 horas e o Agente de IA oferece
-- consulta às 5 da manhã com toda a convicção do mundo.
--
-- Fica no BANCO e não no código para poder mudar sem novo deploy.
-- =============================================================================

alter table public.configuracoes_clinica
  add column fuso_horario text not null default 'America/Sao_Paulo';


-- =============================================================================
-- 9. SINCRONIZAÇÃO ENTRE AGENDA E FUNIL
--
-- O CRM guarda `data_agendamento` na ficha do lead; a agenda guarda a consulta.
-- Sem ligar os dois, marcar pela Agenda deixaria o card parado no Kanban e o
-- Dashboard sem contar a marcação — duas telas contando histórias diferentes
-- sobre o mesmo fato.
--
-- Fica num TRIGGER, e não no React, justamente porque a fase 2 (API do Agente)
-- não passa pelo React. Escreveu consulta, o funil acompanha — venha de onde
-- vier.
-- =============================================================================

create or replace function public.sincronizar_agendamento_lead()
returns trigger
language plpgsql
as $$
declare
  -- A consulta ativa mais próxima que o lead tem AGORA. É sempre recalculada
  -- em vez de deduzida da linha que disparou o trigger: um paciente de
  -- odontologia costuma ter várias sessões marcadas ao mesmo tempo, e supor
  -- que a consulta desta operação é a única leva a ficha para o valor errado.
  v_proxima timestamptz;
begin
  if new.status = 'agendada' then
    select min(c.data_consulta) into v_proxima
      from public.consultas c
     where c.lead_id = new.lead_id and c.status = 'agendada';

    update public.crm_clinica_dados d
       set data_agendamento = v_proxima,
           -- "quando marcou" só é carimbado na criação; remarcar não é uma
           -- marcação nova, senão o Dashboard contaria a mesma consulta duas
           -- vezes no mês em que ela foi adiada.
           data_marcacao_agendamento = case
             when tg_op = 'INSERT' then now()
             else d.data_marcacao_agendamento
           end,
           -- Quem já é paciente NÃO volta para o funil de contatos: src/lib/
           -- pessoas.ts separa as telas /leads e /clientes justamente por
           -- estes dois status, e rebaixá-los jogaria um paciente recorrente
           -- de volta na lista de leads a cada retorno que ele marcasse.
           status = case
             when d.status in ('consulta_realizada', 'paciente_recorrente') then d.status
             else 'consulta_agendada'
           end
     where d.id = new.lead_id;

  elsif new.status = 'cancelada' and tg_op = 'UPDATE' then
    -- `old` só é tocado DENTRO deste ramo, e não na condição acima: o mesmo
    -- trigger dispara em INSERT, onde `old` não existe. Um AND na mesma
    -- expressão não garante ordem de avaliação.
    if old.status = 'agendada' then
      -- O trigger é AFTER, então esta consulta já consta como cancelada aqui e
      -- fica de fora da conta.
      select min(c.data_consulta) into v_proxima
        from public.consultas c
       where c.lead_id = new.lead_id and c.status = 'agendada';

      update public.crm_clinica_dados d
         set data_agendamento = v_proxima,
             status = case
               when d.status in ('consulta_realizada', 'paciente_recorrente') then d.status
               -- Cancelar UMA sessão de um tratamento com várias marcadas não
               -- é desistir do tratamento: enquanto sobrar consulta ativa, o
               -- lead continua em "Consulta Agendada".
               when v_proxima is not null then d.status
               else 'consulta_cancelada'
             end
       where d.id = new.lead_id;
    end if;
  end if;

  return new;
end;
$$;

-- Sem `security definer`: a função roda com as permissões de quem chamou, que
-- já tem acesso total pelas políticas. Elevar privilégio aqui só ampliaria o
-- estrago de uma chamada indevida da API, sem ganho nenhum.

create trigger consultas_sincroniza_lead
  after insert or update of data_consulta, status on public.consultas
  for each row execute function public.sincronizar_agendamento_lead();


-- =============================================================================
-- 10. REALTIME
--
-- A agenda fica aberta na recepção o dia inteiro enquanto o Agente de IA marca
-- pelo WhatsApp. Sem isto, a tela mente até alguém apertar F5.
-- Publica-se a TABELA — `consultas` já é tabela, então não há a pegadinha da
-- view que existe no CRM (0001, seção 11).
-- =============================================================================

alter publication supabase_realtime add table public.consultas;


-- =============================================================================
-- 11. VERIFICAÇÃO
-- =============================================================================

-- Tabelas novas (esperado: 3)
-- select table_name from information_schema.tables
-- where table_schema = 'public'
--   and table_name in ('profissionais','profissional_horarios','profissional_bloqueios');

-- A restrição anti-conflito existe? (esperado: 1 linha, contype = 'x')
-- select conname, contype from pg_constraint where conname = 'consultas_sem_sobreposicao';

-- Teste real do bloqueio — a segunda inserção DEVE falhar com 23P01:
-- insert into public.profissionais (nome, cor) values ('Teste', '#1E6E8C');
-- insert into public.consultas (lead_id, profissional_id, procedimento, data_consulta, duracao_minutos)
--   select (select id from public.crm_clinica_dados limit 1),
--          (select id from public.profissionais where nome = 'Teste'),
--          'Teste A', now() + interval '1 day', 60;
-- insert into public.consultas (lead_id, profissional_id, procedimento, data_consulta, duracao_minutos)
--   select (select id from public.crm_clinica_dados limit 1),
--          (select id from public.profissionais where nome = 'Teste'),
--          'Teste B', now() + interval '1 day 30 minutes', 60;
-- ↑ ERROR: conflicting key value violates exclusion constraint
-- Limpe depois: delete from public.profissionais where nome = 'Teste';
-- (só funciona depois de apagar as consultas de teste — o on delete restrict age)
