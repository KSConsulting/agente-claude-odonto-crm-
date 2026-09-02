-- =============================================================================
-- 0021 — O nome do paciente entra na ficha ao marcar a consulta
-- =============================================================================
--
-- O PROBLEMA
--
-- A Letícia perguntou "pode me confirmar seu nome completo para eu registrar a
-- avaliação?", o paciente respondeu "Rogério Cardoso Albuquerque", a consulta
-- foi marcada — e o CRM continuou mostrando o lead sem nome.
--
-- `agenda_marcar` recebia o `p_nome` e só o usava no `insert` do lead. Mas o
-- lead **já existia**: ele nasce na primeira mensagem do WhatsApp, muito antes
-- de alguém falar em agendar. Na prática, o único caminho em que o nome era
-- gravado é o que quase nunca acontece.
--
-- A CORREÇÃO
--
-- Quando o lead já existe e a ficha está sem nome, o `p_nome` preenche.
--
-- ⚠️ **Só o que está vazio.** Nome já gravado pode ter vindo da recepção, que
-- fala com a pessoa na cadeira; o agente não sobrescreve isso.
--
-- Isto NÃO substitui a `atualizar_ficha` — o nome continua devendo ser gravado
-- assim que for dito, e não só se houver agendamento. Esta é a rede embaixo:
-- quem marca consulta nunca mais fica sem nome no CRM.
--
-- Nada além do bloco do paciente mudou nesta função.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.agenda_marcar(p_nome text, p_whatsapp text, p_procedimento text, p_data_hora timestamp with time zone, p_profissional_id uuid DEFAULT NULL::uuid, p_duracao integer DEFAULT NULL::integer, p_chave_externa text DEFAULT NULL::text, p_interesse text DEFAULT NULL::text)
 RETURNS TABLE(ok boolean, motivo text, consulta_id uuid, data_hora timestamp with time zone, profissional text, sugestao text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_whats  text;
  v_lead   uuid;
  v_prof   uuid;
  v_nome   text;
  v_id     uuid;
  v_fuso   text;
  v_dia    date;
  v_serv   record;
  v_porta  text;
  v_dur    integer;
begin
  -- IDEMPOTÊNCIA: mesma chave, mesma consulta. Retry do n8n não duplica.
  if p_chave_externa is not null then
    select c.id, c.data_consulta, trim(coalesce(pr.nome,'') || ' ' || coalesce(pr.sobrenome,''))
      into v_id, data_hora, v_nome
      from public.consultas c
      left join public.profissionais pr on pr.id = c.profissional_id
     where c.chave_externa = p_chave_externa;
    if v_id is not null then
      return query select true, null::text, v_id, data_hora, nullif(v_nome,''), null::text;
      return;
    end if;
  end if;

  v_whats := regexp_replace(coalesce(p_whatsapp, ''), '[^0-9]', '', 'g');
  if length(v_whats) < 10 then
    return query select false, 'whatsapp_invalido', null::uuid, null::timestamptz, null::text, null::text;
    return;
  end if;

  if p_data_hora is null or p_procedimento is null or trim(p_procedimento) = '' then
    return query select false, 'dados_invalidos', null::uuid, null::timestamptz, null::text, null::text;
    return;
  end if;

  -- A PORTA DE ENTRADA. Casa por nome, sem diferenciar maiúscula nem espaço
  -- sobrando: o que chega aqui foi escrito por um modelo de linguagem.
  select s.exige_avaliacao, s.duracao_minutos, s.e_avaliacao
    into v_serv
    from public.servicos_clinica s
   where lower(trim(s.nome)) = lower(trim(p_procedimento))
     and s.ativo
   limit 1;

  if found and v_serv.exige_avaliacao then
    select a.nome into v_porta
      from public.servicos_clinica a
     where a.e_avaliacao and a.ativo
     limit 1;
    -- Sem porta cadastrada não há para onde mandar, e recusar deixaria o
    -- paciente sem saída. Marca como antes.
    if v_porta is not null then
      return query select false, 'exige_avaliacao', null::uuid, null::timestamptz, null::text, v_porta;
      return;
    end if;
  end if;

  v_dur := coalesce(p_duracao, v_serv.duracao_minutos, 60);

  select coalesce(max(fuso_horario), 'America/Sao_Paulo') into v_fuso
    from public.configuracoes_clinica;
  v_dia := (p_data_hora at time zone v_fuso)::date;

  -- Escolha do profissional
  if p_profissional_id is null then
    select l.profissional_id, l.nome into v_prof, v_nome
      from public.agenda_profissionais_livres(p_data_hora, v_dur) l
     limit 1;
    if v_prof is null then
      return query select false, 'sem_profissional_livre', null::uuid, null::timestamptz, null::text, null::text;
      return;
    end if;
  else
    if not exists (select 1 from public.profissionais where id = p_profissional_id and ativo) then
      return query select false, 'profissional_inexistente', null::uuid, null::timestamptz, null::text, null::text;
      return;
    end if;
    -- Motivo preciso: o agente precisa saber SE é horário ocupado (oferece
    -- outro) ou fora de expediente (oferece outro dia). "Não deu" não serve.
    if not exists (
      select 1 from public.profissional_horarios h
       where h.profissional_id = p_profissional_id and h.ativo
         and h.dia_semana = extract(dow from (p_data_hora at time zone v_fuso))::smallint
         and (p_data_hora at time zone v_fuso)::time >= h.hora_inicio
         and ((p_data_hora + make_interval(mins => v_dur)) at time zone v_fuso)::time <= h.hora_fim
    ) then
      return query select false, 'fora_expediente', null::uuid, null::timestamptz, null::text, null::text;
      return;
    end if;
    if exists (
      select 1 from public.profissional_bloqueios b
       where (b.profissional_id is null or b.profissional_id = p_profissional_id)
         and tstzrange(b.inicio, b.fim)
             && tstzrange(p_data_hora, p_data_hora + make_interval(mins => v_dur))
    ) then
      return query select false, 'fora_expediente', null::uuid, null::timestamptz, null::text, null::text;
      return;
    end if;
    v_prof := p_profissional_id;
    select trim(nome || ' ' || sobrenome) into v_nome from public.profissionais where id = v_prof;
  end if;

  -- Paciente: acha pelo WhatsApp, cria se não existir.
  select id into v_lead from public.crm_clinica_dados where whatsapp_lead = v_whats;
  if v_lead is null then
    insert into public.crm_clinica_dados (nome_lead, whatsapp_lead, status, inicio_atendimento)
    values (nullif(trim(coalesce(p_nome,'')), ''), v_whats, 'iniciou_conversa', now())
    returning id into v_lead;
  else
    -- O NOME, QUANDO A FICHA AINDA NÃO TEM UM.
    --
    -- Antes disto, `p_nome` só era usado na CRIAÇÃO do lead. Quem já vinha
    -- conversando há meia hora -- que é o caso normal, porque a conversa cria
    -- a ficha na primeira mensagem -- tinha o nome perguntado, confirmado e
    -- jogado fora: a linha já existia, e o insert nunca rodava.
    --
    -- E este é o nome mais confiável que o sistema chega a ver. Não é o
    -- `pushName` do WhatsApp (o apelido do perfil, que por isso é ignorado);
    -- é o nome completo que a pessoa ditou para ser registrado numa consulta.
    --
    -- ⚠️ **Só preenche o que está vazio.** Um nome já gravado pode ter sido
    -- digitado pela recepção, e a recepção fala com a pessoa na cadeira. O
    -- agente não sobrescreve isso.
    update public.crm_clinica_dados
       set nome_lead = nullif(trim(coalesce(p_nome, '')), '')
     where id = v_lead
       and nullif(trim(coalesce(nome_lead, '')), '') is null
       and nullif(trim(coalesce(p_nome, '')), '') is not null;
  end if;

  -- O INTERESSE, QUANDO NINGUÉM MANDOU. Só vale para a avaliação: é a única
  -- consulta em que "o que a pessoa quer" é diferente do que está marcado. Numa
  -- limpeza, o procedimento JÁ é o que ela quer, e copiar a ficha para cá
  -- encheria a agenda de "Limpeza · Lentes de Contato".
  --
  -- Vem de `procedimento_interesse`, que a Letícia mantém pela `atualizar_ficha`.
  -- É palpite? Não: é o que ela registrou desta pessoa, e no ato de marcar é o
  -- valor corrente. O que ela mandar explícito continua ganhando.
  if nullif(trim(coalesce(p_interesse, '')), '') is null
     and coalesce(v_serv.e_avaliacao, false) then
    select nullif(trim(coalesce(d.procedimento_interesse, '')), '')
      into p_interesse
      from public.crm_clinica_dados d
     where d.id = v_lead;
  end if;

  begin
    insert into public.consultas (
      lead_id, profissional_id, procedimento, data_consulta,
      duracao_minutos, status, origem, chave_externa, interesse
    ) values (
      v_lead, v_prof, trim(p_procedimento), p_data_hora,
      v_dur, 'agendada', 'agente_ia', p_chave_externa,
      nullif(trim(coalesce(p_interesse, '')), '')
    ) returning id into v_id;
  exception
    -- 23P01: a restrição de exclusão pegou uma sobreposição criada entre a
    -- checagem acima e este insert. É o caso da recepção marcando no mesmo
    -- instante — raro, e exatamente por isso o banco é quem decide.
    when exclusion_violation then
      return query select false, 'horario_ocupado', null::uuid, null::timestamptz, null::text, null::text;
      return;
  end;

  return query select true, null::text, v_id, p_data_hora, v_nome, null::text;
end;
$function$
;
