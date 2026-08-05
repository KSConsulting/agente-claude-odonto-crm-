-- =============================================================================
-- WHATSAPP ÚNICO E NORMALIZADO
-- Rode depois de 0001 e 0002.
--
-- ✅ APLICADO E VERIFICADO NO BANCO (projeto Odonto Clinica).
--
-- O problema que originou este arquivo: a tela deixou cadastrar duas pessoas
-- com o mesmo WhatsApp. Uma pessoa, um número — e a garantia disso tem que
-- estar aqui, porque o Agente de IA também cria contato e não passa pela tela.
--
-- FORMATO CANÔNICO: só dígitos, com o código do país, sem `+`, espaço ou
-- traço — `5511987654321`. É o formato que o n8n já grava ao abrir o lead da
-- conversa do WhatsApp; a partir daqui o sistema grava igual.
--
-- POR QUE O FORMATO IMPORTA TANTO QUANTO A UNICIDADE:
-- se a tela gravasse `+55 (11) 98765-4321` e o agente `5511987654321`, seriam
-- dois textos diferentes para o mesmo telefone. O índice único deixaria os dois
-- entrarem, a busca do agendamento não acharia o contato criado pelo agente, e
-- a recepção cadastraria a pessoa de novo — exatamente o bug que se quer matar,
-- só que por outro caminho.
-- =============================================================================


-- =============================================================================
-- 1. NORMALIZAÇÃO NA ESCRITA
--
-- Tira qualquer pontuação antes de gravar. É a rede que protege de colar um
-- número copiado do WhatsApp (`+55 11 98765-4321`) direto no campo.
--
-- O que ele NÃO faz: inventar código de país. Um número sem DDI continua sem
-- DDI — adivinhar o país a partir do tamanho acertaria no Brasil e erraria
-- silenciosamente em todo o resto. Quem garante o DDI é quem escreve: a tela,
-- pelo seletor de país, e o n8n, que já manda o número inteiro.
-- =============================================================================

create or replace function public.normalizar_whatsapp()
returns trigger
language plpgsql
as $$
begin
  if new.whatsapp_lead is not null then
    new.whatsapp_lead := nullif(regexp_replace(new.whatsapp_lead, '[^0-9]', '', 'g'), '');
  end if;
  return new;
end;
$$;

create trigger crm_clinica_normaliza_whatsapp
  before insert or update of whatsapp_lead on public.crm_clinica_dados
  for each row execute function public.normalizar_whatsapp();


-- =============================================================================
-- 2. AJUSTE DOS DADOS QUE JÁ EXISTEM
--
-- Antes desta migração o formulário aceitava qualquer coisa, e gravou números
-- locais de 10/11 dígitos (`11985254512`), sem o 55. Eles precisam virar
-- canônicos, senão o mesmo telefone continuaria existindo em duas formas.
--
-- ⚠️ Só é seguro assumir +55 aqui porque a clínica é brasileira e todo o dado
-- pré-existente veio do formulário antigo, que não tinha seletor de país.
-- Num banco com contatos internacionais gravados sem DDI, isto estaria errado.
-- =============================================================================

update public.crm_clinica_dados
   set whatsapp_lead = '55' || regexp_replace(whatsapp_lead, '[^0-9]', '', 'g')
 where whatsapp_lead is not null
   and length(regexp_replace(whatsapp_lead, '[^0-9]', '', 'g')) in (10, 11);

-- Tira a pontuação do que sobrou (números que já tinham DDI mas vieram
-- formatados). O trigger da seção 1 só age em escritas novas.
update public.crm_clinica_dados
   set whatsapp_lead = regexp_replace(whatsapp_lead, '[^0-9]', '', 'g')
 where whatsapp_lead is not null
   and whatsapp_lead <> regexp_replace(whatsapp_lead, '[^0-9]', '', 'g');


-- =============================================================================
-- 3. UM NÚMERO, UMA PESSOA
--
-- ⚠️ ESTE ÍNDICE NÃO SOBE SE HOUVER DUPLICATA NO BANCO. Se a migração falhar
-- aqui, é porque existem contatos repetidos — resolva antes, com:
--
--   select whatsapp_lead, count(*), string_agg(nome_lead, ' | ')
--     from public.crm_clinica_dados
--    where whatsapp_lead is not null
--    group by 1 having count(*) > 1;
--
-- Índice PARCIAL: contatos sem telefone não conflitam entre si. A tela exige o
-- número em quem ela cria, mas nada impede que exista lead sem WhatsApp vindo
-- de outro caminho, e vários deles têm que poder coexistir.
-- =============================================================================

create unique index crm_clinica_whatsapp_unico
  on public.crm_clinica_dados (whatsapp_lead)
  where whatsapp_lead is not null;

-- O índice único atende as mesmas buscas que o antigo, então ele vira
-- redundante — dois índices na mesma coluna só custam escrita.
drop index if exists public.crm_clinica_whatsapp_idx;

-- Quem violar recebe o SQLSTATE 23505 (unique_violation). As telas traduzem
-- para "esse número já é de Fulano" e oferecem abrir/usar o contato existente.
--
-- Para o n8n nada muda: o fluxo já procura o lead pelo WhatsApp antes de
-- inserir, então ele nunca esbarra neste índice na operação normal. Ele existe
-- para o caso anormal — duas gravações no mesmo instante, importação de
-- planilha, um fluxo alterado no futuro.


-- =============================================================================
-- 4. VERIFICAÇÃO
-- =============================================================================

-- Não sobrou número fora do formato canônico? (esperado: 0 linhas)
-- select id, nome_lead, whatsapp_lead from public.crm_clinica_dados
--  where whatsapp_lead is not null
--    and whatsapp_lead <> regexp_replace(whatsapp_lead, '[^0-9]', '', 'g');

-- O índice existe? (esperado: 1 linha, indisunique = true)
-- select indexname from pg_indexes
--  where schemaname = 'public' and indexname = 'crm_clinica_whatsapp_unico';

-- O bloqueio funciona? A segunda inserção DEVE falhar com 23505:
-- insert into public.crm_clinica_dados (nome_lead, whatsapp_lead) values ('A','5511999999999');
-- insert into public.crm_clinica_dados (nome_lead, whatsapp_lead) values ('B','+55 (11) 99999-9999');
-- ↑ o trigger normaliza o segundo para o mesmo texto do primeiro e o índice barra.
-- delete from public.crm_clinica_dados where whatsapp_lead = '5511999999999';
