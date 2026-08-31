-- =============================================================================
-- 0011 — PROCEDIMENTOS: a descrição longa
--
-- Duas camadas de informação sobre cada procedimento:
--
--   `descricao`        curta, uma linha. Vai no prompt do Agente de IA, em
--                      TODA mensagem, junto com os outros 19. É o catálogo:
--                      serve para ele saber que o procedimento existe.
--
--   `descricao_longa`  esta coluna. NÃO vai no prompt. O agente busca pela
--                      ferramenta `detalhes_do_procedimento`, só quando o
--                      paciente pergunta de um procedimento específico.
--
-- POR QUE SEPARADO: com ~1.500 caracteres cada, os 20 textos somam ~30.000 —
-- e triplicariam o custo de toda mensagem, inclusive a de quem só mandou
-- "oi", para carregar textos que a conversa usa no máximo um.
--
-- ⚠️ OS TEXTOS ABAIXO SÃO UM PRIMEIRO RASCUNHO e precisam da revisão de um
-- dentista da clínica antes de irem para a boca do agente. Eles descrevem os
-- procedimentos em termos gerais; prazos, número de sessões e condutas variam
-- por clínica e por caso.
--
-- Documentação: agente-ia/README.md
-- =============================================================================


alter table public.servicos_clinica
  add column descricao_longa text;

comment on column public.servicos_clinica.descricao_longa is
  'Explicação completa do procedimento, para o Agente de IA buscar quando o '
  'paciente perguntar. NÃO entra no prompt — só a `descricao` curta entra. '
  'Vazia, o agente usa a curta.';


-- =============================================================================
-- OS TEXTOS
--
-- Escritos para serem FALADOS a um paciente no WhatsApp: linguagem simples,
-- sem termo técnico solto, sempre terminando na avaliação. Sem preço, sem
-- promessa de resultado e sem marca registrada.
-- =============================================================================

update public.servicos_clinica set descricao_longa =
'É a primeira consulta, e ela é bem diferente de um exame comum. O dentista faz um escaneamento da sua boca e algumas fotos, e com isso monta uma simulação do resultado no computador — você vê como o seu sorriso pode ficar antes de decidir qualquer coisa.

Nessa consulta o dentista examina os dentes, a gengiva e a mordida, entende o que te incomoda e o que você espera, e a partir daí monta o plano de tratamento com as opções que fazem sentido para o seu caso.

Costuma durar cerca de uma hora. Não dói e não tem nenhum procedimento invasivo — é conversa, exame e imagens.

É por aqui que todo tratamento começa, inclusive porque é só vendo de perto que o dentista consegue dizer o que dá para fazer, em quantas sessões e qual o investimento.'
where nome = 'Avaliação e Planejamento Digital do Sorriso';

update public.servicos_clinica set descricao_longa =
'São lâminas finíssimas de porcelana, coladas na frente dos dentes, que mudam a cor, o formato e o alinhamento aparente do sorriso. A porcelana tem um brilho parecido com o do dente natural e não escurece com café, vinho ou cigarro.

Em geral são de duas a quatro sessões: uma para o planejamento e a moldagem, uma para você aprovar o modelo de teste, e a de colagem. Entre uma e outra você fica com dentes provisórios, sem passar constrangimento.

Costuma ser feito com anestesia local e é bem tranquilo — a maior parte das pessoas relata desconforto pequeno. Pode haver alguma sensibilidade nos primeiros dias.

É um trabalho durável, mas exige cuidado: escovação, limpeza regular na clínica e placa de proteção para quem range os dentes à noite.

Quantas lâminas e se o seu caso é indicado é o dentista quem define na avaliação.'
where nome = 'Lentes de Contato';

update public.servicos_clinica set descricao_longa =
'São camadas de resina aplicadas diretamente sobre o dente para corrigir cor, formato, pequenas fraturas ou espaços entre os dentes. O dentista trabalha esculpindo a resina ali mesmo, na cadeira.

A grande vantagem é que costuma ser feito em menos sessões que a porcelana, e em muitos casos preserva mais estrutura do dente. É uma porta de entrada mais acessível para quem quer melhorar o sorriso.

Normalmente não precisa de anestesia e o desconforto é mínimo. Você sai da consulta já com o resultado.

A resina pede manutenção com o tempo: pode pigmentar com café, chá e vinho, e costuma precisar de polimento ou retoque periódico. É um material que dura menos que a porcelana, e isso é levado em conta na hora de escolher.

Na avaliação o dentista compara resina e porcelana para o seu caso, considerando o que você quer e a condição dos seus dentes.'
where nome = 'Facetas em Resina';

update public.servicos_clinica set descricao_longa =
'É o tratamento que remove manchas e escurecimentos e deixa os dentes vários tons mais claros, usando um gel clareador. Existe a versão feita na clínica, com resultado mais rápido, e a versão caseira, com moldeiras sob medida que você usa em casa por um período combinado. Muita gente faz as duas juntas.

O resultado aparece nas primeiras sessões e costuma continuar melhorando ao longo do tratamento.

Não dói, mas é comum sentir sensibilidade nos dentes durante e logo depois — aquela pontada com gelado. É passageiro, e o dentista pode indicar produtos que reduzem bastante isso.

Nos primeiros dias vale evitar café, vinho tinto, molho de tomate, açaí e cigarro, que mancham mais nesse período.

O clareamento age no dente natural: resina, porcelana e coroa não clareiam. Por isso, quem tem restaurações na frente costuma precisar trocá-las depois, para a cor combinar. Isso o dentista avalia antes de começar.'
where nome = 'Clareamento Dental';

update public.servicos_clinica set descricao_longa =
'É uma pequena cirurgia que ajusta o contorno da gengiva. Serve principalmente para quem acha que mostra gengiva demais ao sorrir, ou para quem tem os dentes com tamanhos desiguais por causa do desenho da gengiva.

O dentista redesenha a linha da gengiva de forma harmônica com o rosto e com os dentes. Costuma ser feita em uma sessão, com anestesia local, e leva menos de uma hora na maioria dos casos.

Você não sente dor durante, e o pós é geralmente tranquilo: pode haver inchaço e incômodo leve nos primeiros dias, controlados com a medicação que o dentista indicar. Nesse período a orientação costuma ser comer alimentos mais frios e macios.

A gengiva leva algumas semanas para assentar no formato final.

Em muitos casos é combinada com lentes ou facetas, porque o desenho da gengiva muda bastante a aparência do sorriso. O dentista avalia se o seu caso precisa só do ajuste da gengiva ou de mais alguma coisa.'
where nome = 'Gengivoplastia';

update public.servicos_clinica set descricao_longa =
'São placas removíveis, feitas sob medida e quase invisíveis, que vão movendo os dentes aos poucos até a posição planejada. Funcionam como alternativa ao aparelho fixo, aquele de bracket colado no dente.

Você usa a maior parte do dia e tira para comer e escovar os dentes — o que facilita muito a higiene e não exige mudar a alimentação. A cada etapa você troca por uma placa nova, seguindo o plano que o dentista montou.

O tempo total depende de quanto os dentes precisam se mover, e isso só dá para dizer depois da avaliação com o escaneamento.

Não dói, mas é normal sentir pressão e um incômodo nos primeiros dias de cada placa nova — é sinal de que está funcionando.

O resultado depende bastante do uso: quem usa menos horas do que o combinado atrasa o tratamento. No fim, costuma-se usar uma contenção para os dentes não voltarem para o lugar antigo.

Se o seu caso é indicado para alinhador ou pede outro tipo de tratamento, o dentista define na avaliação.'
where nome = 'Alinhadores Transparentes';

update public.servicos_clinica set descricao_longa =
'É a reposição de um dente perdido. O dentista coloca um pino de titânio no osso, que faz o papel da raiz, e sobre ele vai uma coroa com a aparência de dente natural. Diferente da ponte, não precisa desgastar os dentes vizinhos.

O tratamento tem etapas: a cirurgia para colocar o implante, um período de alguns meses em que o osso se integra ao pino, e depois a instalação da coroa definitiva. Em boa parte dos casos é possível usar um dente provisório nesse meio-tempo, para você não ficar com o espaço aparecendo.

A cirurgia é feita com anestesia local e costuma ser mais tranquila do que as pessoas imaginam — muita gente compara com uma extração. O pós tem inchaço e incômodo por alguns dias, controlados com medicação.

É uma solução duradoura, desde que bem cuidada: escovação, fio dental e acompanhamento na clínica.

Se há osso suficiente e se o seu caso é indicado, o dentista avalia com exame de imagem.'
where nome = 'Implante Unitário';

update public.servicos_clinica set descricao_longa =
'É quando o implante e um dente provisório são instalados na mesma sessão. Você entra sem o dente e sai com ele, sem passar o período de espera com o espaço aparecendo.

O provisório fica ali enquanto o osso se integra ao implante. Depois desse período, ele é trocado pelo dente definitivo.

A cirurgia é com anestesia local e o pós é parecido com o de um implante comum: inchaço e incômodo por alguns dias.

Nos primeiros meses a orientação costuma ser evitar forçar a mordida naquele lado e manter uma alimentação mais macia, para não atrapalhar a integração.

Nem todo caso permite carga imediata — depende muito da quantidade e da qualidade do osso, e da posição do dente. É exatamente isso que o dentista verifica na avaliação com exame de imagem.'
where nome = 'Carga Imediata';

update public.servicos_clinica set descricao_longa =
'É uma arcada inteira de dentes fixos, apoiada sobre implantes. Indicada para quem perdeu todos ou quase todos os dentes de uma arcada e não quer usar dentadura removível.

A grande diferença para a dentadura é que ela não sai da boca: fica presa nos implantes, o que devolve a firmeza para mastigar e acaba com o medo de a prótese soltar ao falar ou rir.

O tratamento tem etapas: planejamento com exames de imagem, a cirurgia para instalar os implantes, um período de integração e a instalação da prótese definitiva. Em muitos casos é possível sair da cirurgia já com uma prótese provisória fixa.

A cirurgia é feita com anestesia local, e o pós tem inchaço e incômodo por alguns dias, com medicação.

A manutenção é parte do tratamento: escovação, produtos específicos de higiene e revisões regulares na clínica.

Quantos implantes o seu caso precisa e qual o tipo de prótese, o dentista define depois dos exames.'
where nome = 'Prótese Fixa sobre Implantes';

update public.servicos_clinica set descricao_longa =
'É um procedimento que reconstrói o osso na região onde ele foi perdido, para que ela consiga receber um implante. A perda de osso costuma acontecer quando o dente ficou muito tempo ausente, ou por causa de doença na gengiva.

O dentista coloca o material de enxerto no local e ele serve de base para o próprio corpo formar osso novo ali. Depois de um período de cicatrização, a região fica preparada para o implante.

É feito com anestesia local. O pós tem inchaço e incômodo por alguns dias, controlados com medicação, e a orientação costuma incluir alimentação macia e cuidado redobrado com a higiene na região.

O tempo de espera até o implante varia bastante conforme o tamanho da área e o tipo de enxerto.

Nem todo mundo precisa: só o exame de imagem mostra se falta osso e quanto. Isso é verificado na avaliação, antes de qualquer plano de implante.'
where nome = 'Enxerto Ósseo';

update public.servicos_clinica set descricao_longa =
'É um procedimento que cria altura de osso na parte de trás da arcada de cima, para viabilizar um implante ali.

Acima dos dentes superiores existe uma cavidade natural, o seio maxilar. Quando um dente dessa região é perdido há muito tempo, o osso costuma diminuir e não sobra altura suficiente para o implante. O procedimento levanta cuidadosamente a membrana dessa cavidade e coloca material de enxerto no espaço criado.

É feito com anestesia local. O pós tem inchaço por alguns dias e algumas orientações específicas — como evitar assoar o nariz com força e não fazer esforço nos primeiros dias — que o dentista explica em detalhe.

Depois de um período de cicatrização, a região fica pronta para receber o implante. Em alguns casos, o implante pode ser colocado na mesma cirurgia.

Só o exame de imagem mostra se o seu caso precisa disso. É uma das coisas que a avaliação esclarece.'
where nome = 'Levantamento de Seio Maxilar';

update public.servicos_clinica set descricao_longa =
'É a reposição de dentes perdidos ou muito danificados. Existem vários tipos, e o certo depende de quantos dentes faltam, do estado dos dentes que restaram e da condição do osso.

De forma geral, há as próteses fixas — que ficam presas em dentes ou em implantes e não saem da boca — e as removíveis, que você tira para higienizar. Cada uma tem vantagens, e a escolha é feita junto com você.

Uma prótese bem feita devolve duas coisas: a aparência do sorriso e a capacidade de mastigar bem, que é o que costuma incomodar mais no dia a dia.

O tratamento passa por moldagem ou escaneamento, provas para ajustar cor e formato, e a instalação. Costuma envolver algumas sessões, com ajustes finos até ficar confortável.

Prótese pede acompanhamento: com o tempo, a boca muda e ela precisa de ajuste ou troca. Isso faz parte.

Qual tipo é o melhor para você é a conversa da avaliação.'
where nome = 'Prótese Dentária';

update public.servicos_clinica set descricao_longa =
'É o tratamento que salva um dente cujo nervo inflamou ou infeccionou — geralmente por uma cárie profunda, uma fratura ou uma pancada. O dentista remove esse tecido de dentro do dente, limpa os canais e os preenche com um material próprio.

A fama de tratamento dolorido vem de outra época. Hoje é feito com anestesia, e a maioria das pessoas relata que foi bem mais tranquilo do que esperava. Na verdade, o canal costuma ser o que acaba com a dor — muita gente chega com dor forte e sai aliviada.

Pode ser feito em uma ou mais sessões, dependendo do dente e do quadro.

Nos primeiros dias é normal sentir o dente sensível à mordida. Passa.

Depois do canal, o dente costuma precisar de uma restauração maior ou de uma coroa, porque fica mais frágil. Isso faz parte do plano e o dentista explica no momento.

Se você está com dor forte agora, não espere: procure a clínica.'
where nome = 'Tratamento de Canal';

update public.servicos_clinica set descricao_longa =
'É uma placa feita sob medida, para dormir, que protege os dentes de quem range ou aperta durante a noite — o bruxismo.

O bruxismo desgasta o esmalte, pode trincar dentes e restaurações, e costuma vir acompanhado de dor de cabeça ao acordar, dor no rosto e sensibilidade. A placa não cura o hábito, mas recebe a força no lugar dos dentes e evita o estrago.

Para fazer, o dentista faz um escaneamento ou uma moldagem da sua boca, e a placa é confeccionada no formato exato dos seus dentes. Depois há uma sessão de ajuste, para ela ficar confortável e a mordida ficar equilibrada.

É normal estranhar nas primeiras noites — em poucos dias a maioria das pessoas nem percebe mais.

Como o bruxismo tem relação com estresse, sono e mordida, o dentista costuma avaliar o conjunto, não só a placa.

Quem já desgastou bastante os dentes ou fez trabalho estético costuma precisar dela para proteger o investimento.'
where nome = 'Placa de Bruxismo';

update public.servicos_clinica set descricao_longa =
'DTM é a sigla para os problemas na articulação que liga a mandíbula ao crânio — aquela que você sente mexer na frente da orelha ao abrir a boca.

Os sinais mais comuns são estalo ao abrir ou fechar, dor no rosto ou perto do ouvido, sensação de travamento, dificuldade para abrir bem a boca e dor de cabeça frequente. Muita gente convive com isso por anos achando que é outra coisa.

O tratamento é feito por etapas e depende bastante da causa. Pode envolver placa, ajustes na mordida, orientações de hábitos do dia a dia e encaminhamento para outros profissionais quando faz sentido — fisioterapia, por exemplo.

Não é um procedimento único: é um acompanhamento, com reavaliações ao longo do caminho.

O primeiro passo é sempre a avaliação, porque os sintomas de DTM se parecem com os de outras coisas, e o tratamento certo depende de identificar de onde vem.'
where nome = 'Tratamento de DTM';

update public.servicos_clinica set descricao_longa =
'É a limpeza profissional: o dentista remove a placa e o tártaro que a escovação em casa não dá conta, inclusive abaixo da linha da gengiva, e termina com um polimento que deixa os dentes lisos e mais resistentes ao acúmulo de placa.

É o procedimento mais simples e o que mais evita problema caro depois. A maior parte das cáries e das doenças de gengiva começa por acúmulo que dá para remover a tempo.

Costuma levar de trinta minutos a uma hora, em uma sessão. Não precisa de anestesia na maioria dos casos. Pode haver um incômodo pontual em quem tem a gengiva inflamada ou os dentes sensíveis — e é justamente quem mais precisa.

Também é o momento em que o dentista percebe cedo o que está começando.

A recomendação geral é a cada seis meses, mas quem tem tendência a tártaro, usa aparelho ou fuma costuma precisar de intervalos menores. O dentista indica o seu.'
where nome = 'Limpeza e Profilaxia';

update public.servicos_clinica set descricao_longa =
'É a remoção do tártaro que se acumulou abaixo da linha da gengiva, na raiz do dente — onde a escovação não alcança.

Diferente da limpeza de rotina, aqui o trabalho é mais profundo, feito em quem já tem a gengiva comprometida. Costuma ser dividido por regiões da boca, em mais de uma sessão, e é comum usar anestesia local para você não sentir nada.

Depois é normal a gengiva ficar sensível por alguns dias e os dentes reagirem mais ao gelado. Passa conforme a gengiva cicatriza e volta a ficar firme.

O resultado depende da higiene em casa: sem isso, o tártaro volta.

Se o seu caso precisa de raspagem ou de uma limpeza comum, o dentista define olhando a gengiva e, quando necessário, com radiografia.'
where nome = 'Raspagem';

update public.servicos_clinica set descricao_longa =
'É o tratamento da gengiva inflamada, que sangra, e do osso que sustenta os dentes quando já foi afetado — o que se chama de doença periodontal.

Os sinais são gengiva vermelha ou inchada, sangramento ao escovar ou usar fio, mau hálito persistente, gengiva que retrai e, nos casos mais avançados, dentes que amolecem. É a principal causa de perda de dentes em adultos, e costuma avançar sem dor, silenciosamente.

O tratamento começa com a limpeza profunda das raízes, geralmente com anestesia e dividida em sessões. Conforme o caso, pode envolver outros procedimentos e um acompanhamento mais próximo.

O osso já perdido não volta sozinho, mas dá para parar a perda e manter os dentes por muito tempo — quanto antes começar, mais dente se preserva.

O sucesso depende de duas coisas em partes iguais: o tratamento na clínica e a higiene em casa. O dentista ensina exatamente como fazer.'
where nome = 'Tratamento Periodontal';

update public.servicos_clinica set descricao_longa =
'É o procedimento que recupera a gengiva que retraiu e deixou a raiz do dente exposta. Quando isso acontece, o dente parece mais comprido, fica sensível ao gelado e a raiz — que não tem esmalte — fica desprotegida.

A retração pode vir de escovação com força demais, de doença na gengiva, de bruxismo ou da própria anatomia da pessoa.

O dentista recobre a área com tecido, devolvendo a proteção da raiz e melhorando a aparência do sorriso. É feito com anestesia local, e o pós costuma pedir alimentação macia e cuidado especial com a região por alguns dias.

Além da estética, tem uma função prática: raiz exposta é mais sujeita a sensibilidade e a desgaste.

Junto com o enxerto, o dentista costuma investigar a causa da retração — senão ela volta.

Se o seu caso é indicado, e qual técnica usar, é o que a avaliação define.'
where nome = 'Enxerto Gengival';

update public.servicos_clinica set descricao_longa =
'É a remoção do dente do siso, o último a nascer, geralmente entre os 17 e os 25 anos. Nem todo siso precisa sair — o problema é quando ele nasce torto, fica preso no osso ou na gengiva, empurra os dentes vizinhos ou vive causando inflamação e dor.

Como fica bem no fundo, o siso é difícil de higienizar, e por isso costuma acumular placa e provocar inflamação repetida na gengiva ao redor.

A cirurgia é feita com anestesia local e você não sente dor durante. Dependendo da posição do dente, pode ser bem rápida ou levar mais tempo.

O pós é a parte que as pessoas mais perguntam: é normal ter inchaço e incômodo nos primeiros dias, com pico por volta do segundo. Gelo, repouso, alimentação fria e macia e a medicação indicada resolvem bem. A maioria volta à rotina em poucos dias.

Só a radiografia mostra a posição dos seus sisos e se eles precisam sair. É o que a avaliação esclarece.'
where nome = 'Extração de Siso';


-- =============================================================================
-- CONFERÊNCIA
-- =============================================================================

-- Todos os 20 ficaram com texto? Deve devolver 20 e 0.
--   select count(*) filter (where descricao_longa is not null) as com_texto,
--          count(*) filter (where descricao_longa is null)     as sem_texto
--     from public.servicos_clinica;

-- O prompt do agente NÃO deve ter crescido: a view só entrega a curta.
--   select sum(length(procedimento)) from public.procedimentos_clinica_agente;
--   → tem que continuar em ~1.961 caracteres
