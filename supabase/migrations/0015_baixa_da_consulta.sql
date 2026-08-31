-- =============================================================================
-- 0015 — A BAIXA DA CONSULTA: COMPARECEU OU FALTOU
--
-- Fecha o furo que impedia qualquer pessoa de virar paciente.
--
-- ── O QUE ESTAVA QUEBRADO ────────────────────────────────────────────────────
--
-- `src/lib/pessoas.ts` diz que Paciente é quem tem status `consulta_realizada`
-- ou `paciente_recorrente`. Só que NADA no sistema escrevia esses dois:
--
--   • O trigger `consultas_sincroniza_lead` (0002) só tinha ramo para
--     `agendada` e `cancelada`. Consulta virar `realizada` não mexia no funil.
--   • E, antes disso: **nenhuma tela marcava consulta como realizada.** A
--     Agenda só sabia cancelar. O status existia no CHECK, era desenhado em
--     verde-escuro e a API se recusava a cancelar uma consulta realizada —
--     mas ninguém o escrevia.
--
-- Resultado: o paciente era atendido e ficava em "Consulta Agendada" para
-- sempre. A lista de Pacientes só enchia à mão, e a conversão do Dashboard
-- nunca saía de zero.
--
-- ── O QUE ESTA MIGRAÇÃO FAZ ──────────────────────────────────────────────────
--
-- 1. `consultas.status` ganha um quarto valor: **`faltou`**. Não comparecer não
--    é cancelar. Quem liga avisando e quem simplesmente não aparece exigem
--    telefonemas diferentes, e a clínica precisa medir a taxa de falta — o que
--    é impossível se os dois virarem a mesma linha.
--
-- 2. O trigger passa a reagir a `realizada` e a `faltou`.
--
-- ── AS REGRAS DO FUNIL, E POR QUÊ ────────────────────────────────────────────
--
-- | Consulta vira | O que acontece com a pessoa |
-- |---|---|
-- | `realizada` (1ª) | vira `consulta_realizada` — **é aqui que ela deixa de ser lead e passa a ser Paciente** |
-- | `realizada` (2ª+) | vira `paciente_recorrente` — recorrente é quem voltou, e agora isso é contado, não digitado |
-- | `faltou` | igual a cancelar: se não sobrou sessão ativa, volta para `consulta_cancelada` (precisa reagendar) |
-- | `cancelada` | como antes |
--
-- A contagem de realizadas é feita na hora (`count(*)`), e não deduzida do
-- status anterior: assim a regra é idempotente e se corrige sozinha se alguém
-- editar uma consulta antiga na mão.
--
-- **Paciente nunca é rebaixado.** `consulta_realizada` e `paciente_recorrente`
-- resistem a falta e a cancelamento, pelo mesmo motivo de sempre: é por esses
-- dois status que `pessoas.ts` separa /leads de /clientes, e rebaixá-los
-- jogaria um paciente de volta na lista de contatos.
--
-- **Falta não zera o tratamento.** Enquanto sobrar consulta ativa, o funil não
-- se mexe — faltar a uma sessão de seis não é desistir do tratamento.
--
-- ⚠️ INSERT já com `realizada` continua não mexendo no funil. Nenhuma tela faz
-- isso hoje (registrar atendimento passado se faz por /clientes → Novo
-- Paciente, que grava o status direto). Se um dia alguém quiser importar
-- histórico, é aqui que o ramo entra.
--
-- Documentação: DATABASE.md seções 4.7 e 5
-- =============================================================================


-- =============================================================================
-- 1. O QUARTO STATUS
--
-- A restrição de exclusão `consultas_sem_sobreposicao` filtra por
-- `status = 'agendada'`, então `faltou` não bloqueia horário nenhum — conferido
-- antes de escrever, não suposto.
-- =============================================================================

alter table public.consultas drop constraint consultas_status_check;

alter table public.consultas add constraint consultas_status_check
  check (status in ('agendada', 'realizada', 'cancelada', 'faltou'));

comment on column public.consultas.status is
  'agendada = marcada e ainda de pé. realizada = o paciente compareceu (é o '
  'que promove a pessoa a Paciente). cancelada = desmarcada com aviso. '
  'faltou = não compareceu e não avisou. Só `agendada` bloqueia o horário.';


-- =============================================================================
-- 2. O TRIGGER FECHA O FUNIL
-- =============================================================================

create or replace function public.sincronizar_agendamento_lead()
returns trigger
language plpgsql
as $function$
declare
  -- A consulta ativa mais próxima que o lead tem AGORA. É sempre recalculada
  -- em vez de deduzida da linha que disparou o trigger: um paciente de
  -- odontologia costuma ter várias sessões marcadas ao mesmo tempo, e supor
  -- que a consulta desta operação é a única leva a ficha para o valor errado.
  v_proxima timestamptz;
  -- Quantas ele já compareceu, contadas na hora. O trigger é AFTER, então a
  -- consulta desta operação já está incluída.
  v_realizadas int;
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

  elsif new.status in ('cancelada', 'faltou', 'realizada') and tg_op = 'UPDATE' then
    -- `old` só é tocado DENTRO deste ramo, e não na condição acima: o mesmo
    -- trigger dispara em INSERT, onde `old` não existe. Um AND na mesma
    -- expressão não garante ordem de avaliação.
    if old.status = 'agendada' then
      -- O trigger é AFTER, então esta consulta já saiu de 'agendada' aqui e
      -- fica de fora da conta das ativas.
      select min(c.data_consulta) into v_proxima
        from public.consultas c
       where c.lead_id = new.lead_id and c.status = 'agendada';

      select count(*) into v_realizadas
        from public.consultas c
       where c.lead_id = new.lead_id and c.status = 'realizada';

      update public.crm_clinica_dados d
         set data_agendamento = v_proxima,
             status = case
               -- COMPARECEU. É a única porta de entrada automática para
               -- Pacientes. Da segunda em diante, recorrente — "voltou" é um
               -- fato contável, não uma opinião que alguém digita.
               when new.status = 'realizada' and v_realizadas >= 2 then 'paciente_recorrente'
               when new.status = 'realizada' then 'consulta_realizada'

               -- Daqui para baixo é falta ou cancelamento. Paciente não é
               -- rebaixado por nenhum dos dois.
               when d.status in ('consulta_realizada', 'paciente_recorrente') then d.status

               -- Faltar ou cancelar UMA sessão de um tratamento com várias
               -- marcadas não é desistir do tratamento: enquanto sobrar
               -- consulta ativa, o lead continua onde está.
               when v_proxima is not null then d.status

               -- Não sobrou nada marcado. Faltou e cancelou caem na mesma
               -- coluna de propósito (decisão do produto): as duas significam
               -- "não tem consulta e precisa reagendar". O motivo fica na
               -- consulta, que é onde ele pertence.
               else 'consulta_cancelada'
             end
       where d.id = new.lead_id;
    end if;
  end if;

  return new;
end;
$function$;

comment on function public.sincronizar_agendamento_lead() is
  'Mantém a ficha do lead coerente com a agenda: recalcula data_agendamento e '
  'move o funil. Compareceu promove a Paciente (e a recorrente na 2ª vez); '
  'falta e cancelamento devolvem para "Consulta Cancelada" apenas quando não '
  'sobra sessão ativa. Paciente nunca é rebaixado.';


-- =============================================================================
-- 3. A API NÃO CANCELA QUEM JÁ FALTOU
--
-- `agenda_cancelar` já recusava consulta `realizada`. `faltou` é igualmente
-- passado: cancelar uma consulta a que a pessoa não compareceu não quer dizer
-- nada, e apagaria a falta da estatística.
--
-- (`agenda_remarcar` já está coberta: ela exige `status = 'agendada'`.)
-- =============================================================================

CREATE OR REPLACE FUNCTION public.agenda_cancelar(p_consulta_id uuid, p_whatsapp text DEFAULT NULL::text, p_motivo text DEFAULT NULL::text)
 RETURNS TABLE(ok boolean, motivo text, data_hora timestamp with time zone, profissional text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$

declare

  v_c record;

  v_whats text;

begin

  select c.id, c.status, c.data_consulta, c.lead_id,

         trim(coalesce(pr.nome,'') || ' ' || coalesce(pr.sobrenome,'')) as prof,

         d.whatsapp_lead

    into v_c

    from public.consultas c

    join public.crm_clinica_dados d on d.id = c.lead_id

    left join public.profissionais pr on pr.id = c.profissional_id

   where c.id = p_consulta_id;



  if v_c is null then

    return query select false, 'nao_encontrada', null::timestamptz, null::text;

    return;

  end if;



  -- ConferÃªncia: com o WhatsApp em mÃ£os, um ID trocado no fluxo nÃ£o cancela a

  -- consulta de outra pessoa.

  if p_whatsapp is not null then

    v_whats := regexp_replace(p_whatsapp, '[^0-9]', '', 'g');

    if v_c.whatsapp_lead is distinct from v_whats then

      return query select false, 'nao_pertence', null::timestamptz, null::text;

      return;

    end if;

  end if;



  if v_c.status = 'cancelada' then

    return query select false, 'ja_cancelada', v_c.data_consulta, nullif(v_c.prof,'');

    return;

  end if;

  -- 0015: `faltou` é tão passado quanto `realizada`. Cancelar uma consulta
  -- a que a pessoa não compareceu não quer dizer nada, e apagaria a falta
  -- da estatística.
  if v_c.status in ('realizada', 'faltou') then

    return query select false, 'nao_cancelavel', v_c.data_consulta, nullif(v_c.prof,'');

    return;

  end if;



  update public.consultas

     set status = 'cancelada',

         cancelado_em = now(),

         motivo_cancelamento = p_motivo

   where id = p_consulta_id;

  -- O funil acompanha sozinho, pelo trigger consultas_sincroniza_lead.



  return query select true, null::text, v_c.data_consulta, nullif(v_c.prof,'');

end;

$function$;


-- =============================================================================
-- CONFERÊNCIA
-- =============================================================================

-- O quarto status entrou?
--   select pg_get_constraintdef(oid) from pg_constraint
--    where conname = 'consultas_status_check';

-- A restrição de sobreposição continua olhando só 'agendada'?
--   select pg_get_constraintdef(oid) from pg_constraint
--    where conname = 'consultas_sem_sobreposicao';

-- A FILA DA BAIXA: consultas cuja hora já passou e ninguém confirmou.
-- É exatamente o que o aviso da tela mostra.
--   select c.data_consulta, d.nome_lead, d.status
--     from public.consultas c
--     join public.crm_clinica_dados d on d.id = c.lead_id
--    where c.status = 'agendada' and c.data_consulta < now()
--    order by c.data_consulta;

-- Depois de dar baixa em uma: a pessoa saiu de /leads e entrou em /clientes?
--   select nome_lead, status, data_agendamento from public.crm_clinica_dados
--    where id = 'UUID_DO_LEAD';
