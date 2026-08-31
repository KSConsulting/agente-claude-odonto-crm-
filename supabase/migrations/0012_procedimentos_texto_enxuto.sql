-- =============================================================================
-- 0012 — PROCEDIMENTOS: os textos longos, enxutos
--
-- Substitui os textos escritos na 0011. Nada de schema muda aqui: é só o
-- conteúdo de `descricao_longa`.
--
-- POR QUE ENCURTAR. A Letícia responde em no máximo 50 palavras. Um texto de
-- 900 caracteres não vira resposta de 50 palavras: vira um resumo feito pelo
-- modelo, e resumo automático é onde nasce a frase que ninguém escreveu. Com
-- 400, o texto já está no tamanho da conversa e ela escolhe o que responder em
-- vez de reescrever tudo.
--
-- SEM TRAVESSÃO. O travessão (—) some quando o WhatsApp renderiza em algumas
-- versões, e o modelo tende a copiar a pontuação do texto que leu. Ponto final
-- e vírgula bastam.
--
-- ⚠️ CONTINUAM SENDO RASCUNHO e precisam da revisão de um dentista da clínica.
-- Prazos, número de sessões e condutas variam por clínica e por caso.
--
-- Documentação: agente-ia/README.md
-- =============================================================================


update public.servicos_clinica set descricao_longa =
'É a primeira consulta. O dentista examina os dentes, a gengiva e a mordida, faz um escaneamento e algumas fotos, e monta uma simulação do resultado no computador. Você vê como o seu sorriso pode ficar antes de decidir qualquer coisa. Dura cerca de uma hora, não dói e não tem nenhum procedimento invasivo. É nela que sai o plano de tratamento com as opções que fazem sentido para o seu caso.'
where nome = 'Avaliação e Planejamento Digital do Sorriso';

update public.servicos_clinica set descricao_longa =
'São lâminas finíssimas de porcelana coladas na frente dos dentes. Mudam a cor, o formato e o alinhamento aparente do sorriso, e não escurecem com café ou vinho. Em geral são de duas a quatro sessões, com dentes provisórios entre elas. É feito com anestesia local e costuma ser tranquilo, com alguma sensibilidade nos primeiros dias. Pede escovação, limpeza regular na clínica e placa para quem range os dentes.'
where nome = 'Lentes de Contato';

update public.servicos_clinica set descricao_longa =
'São camadas de resina aplicadas sobre o dente para corrigir cor, formato, pequenas fraturas ou espaços. O dentista esculpe ali mesmo, na cadeira, e você sai da consulta já com o resultado. Costuma levar menos sessões que a porcelana e quase nunca precisa de anestesia. A resina pigmenta com café e vinho e pede polimento de tempos em tempos. Na avaliação o dentista compara resina e porcelana para o seu caso.'
where nome = 'Facetas em Resina';

update public.servicos_clinica set descricao_longa =
'Usa um gel que remove manchas e deixa os dentes vários tons mais claros. Tem a versão feita na clínica, mais rápida, e a caseira, com moldeiras sob medida. Muita gente faz as duas. Não dói, mas é comum sentir sensibilidade durante e logo depois, e isso passa. Nos primeiros dias vale evitar café, vinho tinto, molho de tomate e cigarro. O gel age só no dente natural: resina e porcelana não clareiam, então restaurações da frente podem precisar de troca depois.'
where nome = 'Clareamento Dental';

update public.servicos_clinica set descricao_longa =
'É uma pequena cirurgia que ajusta o contorno da gengiva. Indicada para quem acha que mostra gengiva demais ao sorrir, ou tem dentes de tamanhos desiguais por causa do desenho dela. Uma sessão, com anestesia local, costuma levar menos de uma hora. Você não sente dor durante, e o pós tem inchaço leve por alguns dias. A gengiva leva algumas semanas para assentar. Muitas vezes é combinada com lentes ou facetas.'
where nome = 'Gengivoplastia';

update public.servicos_clinica set descricao_longa =
'São placas removíveis, feitas sob medida e quase invisíveis, que vão movendo os dentes até a posição planejada. Você tira para comer e escovar, o que facilita a higiene. A cada etapa troca por uma placa nova. Não dói, mas é normal sentir pressão nos primeiros dias de cada troca. O tempo total depende de quanto os dentes precisam se mover, e sai depois do escaneamento. No fim, você usa uma contenção para os dentes não voltarem.'
where nome = 'Alinhadores Transparentes';

update public.servicos_clinica set descricao_longa =
'Repõe um dente perdido. O dentista coloca um pino de titânio no osso, que faz o papel da raiz, e sobre ele vai uma coroa com aparência de dente natural. Não precisa desgastar os dentes vizinhos. São etapas: a cirurgia, alguns meses para o osso integrar, e depois a coroa definitiva. Em boa parte dos casos dá para usar um provisório nesse período. A cirurgia é com anestesia local e o pós tem inchaço por alguns dias.'
where nome = 'Implante Unitário';

update public.servicos_clinica set descricao_longa =
'É quando o implante e um dente provisório são colocados na mesma sessão. Você entra sem o dente e sai com ele, sem esperar com o espaço aparecendo. O provisório fica até o osso integrar, e depois vem o definitivo. Cirurgia com anestesia local, e pós parecido com o de um implante comum. Nos primeiros meses a orientação é evitar forçar a mordida daquele lado. Nem todo caso permite: depende do osso, e o exame de imagem mostra.'
where nome = 'Carga Imediata';

update public.servicos_clinica set descricao_longa =
'É uma arcada inteira de dentes fixos apoiada em implantes, para quem perdeu todos ou quase todos os dentes de uma arcada. Diferente da dentadura, não sai da boca: devolve firmeza para mastigar e acaba com o medo de a prótese soltar ao falar. São etapas: exames, cirurgia, integração e a prótese definitiva. Em muitos casos dá para sair da cirurgia já com uma provisória fixa. Pede higiene específica e revisões regulares.'
where nome = 'Prótese Fixa sobre Implantes';

update public.servicos_clinica set descricao_longa =
'Reconstrói o osso na região onde ele foi perdido, para que ela consiga receber um implante. A perda costuma acontecer quando o dente ficou muito tempo ausente, ou por doença na gengiva. O material colocado serve de base para o corpo formar osso novo ali. É feito com anestesia local, e o pós tem inchaço por alguns dias e alimentação macia. O tempo até o implante varia com o tamanho da área. Só o exame de imagem mostra se falta osso.'
where nome = 'Enxerto Ósseo';

update public.servicos_clinica set descricao_longa =
'Cria altura de osso na parte de trás da arcada de cima, para viabilizar um implante ali. Acima dos dentes superiores existe uma cavidade natural, o seio maxilar. Quando um dente dessa região é perdido há muito tempo, o osso diminui e não sobra altura. O procedimento levanta a membrana dessa cavidade e coloca enxerto no espaço. Anestesia local, inchaço por alguns dias e orientações como evitar assoar o nariz com força. Às vezes o implante entra na mesma cirurgia.'
where nome = 'Levantamento de Seio Maxilar';

update public.servicos_clinica set descricao_longa =
'Repõe dentes perdidos ou muito danificados. Há as fixas, que ficam presas em dentes ou implantes e não saem da boca, e as removíveis, que você tira para higienizar. Uma prótese bem feita devolve a aparência do sorriso e a capacidade de mastigar bem. O caminho passa por moldagem ou escaneamento, provas de cor e formato, e ajustes até ficar confortável. Com o tempo a boca muda e ela pede ajuste ou troca.'
where nome = 'Prótese Dentária';

update public.servicos_clinica set descricao_longa =
'Salva um dente cujo nervo inflamou ou infeccionou, geralmente por cárie profunda, fratura ou pancada. O dentista remove esse tecido, limpa os canais e os preenche. A fama de tratamento dolorido vem de outra época: hoje é feito com anestesia, e costuma ser justamente o que acaba com a dor. Pode levar uma ou mais sessões. Nos primeiros dias o dente fica sensível à mordida. Depois ele costuma precisar de uma restauração maior ou de coroa.'
where nome = 'Tratamento de Canal';

update public.servicos_clinica set descricao_longa =
'É uma placa feita sob medida, para dormir, que protege os dentes de quem range ou aperta à noite. O bruxismo desgasta o esmalte, trinca dentes e restaurações, e costuma vir com dor de cabeça ao acordar. A placa não cura o hábito, mas recebe a força no lugar dos dentes. O dentista escaneia ou molda a sua boca, e depois há uma sessão de ajuste. É normal estranhar nas primeiras noites. Quem fez trabalho estético costuma precisar dela.'
where nome = 'Placa de Bruxismo';

update public.servicos_clinica set descricao_longa =
'DTM são os problemas na articulação que liga a mandíbula ao crânio, aquela que se mexe na frente da orelha. Os sinais comuns são estalo ao abrir a boca, dor no rosto ou perto do ouvido, travamento e dor de cabeça frequente. O tratamento depende da causa e pode envolver placa, ajuste na mordida, mudança de hábitos e encaminhamento para fisioterapia. Não é um procedimento único, é acompanhamento. O primeiro passo é sempre a avaliação.'
where nome = 'Tratamento de DTM';

update public.servicos_clinica set descricao_longa =
'É a limpeza profissional: o dentista remove a placa e o tártaro que a escovação em casa não alcança, inclusive abaixo da linha da gengiva, e termina com um polimento. É o procedimento mais simples e o que mais evita problema caro depois. Leva de trinta minutos a uma hora, em uma sessão, e quase nunca precisa de anestesia. Pode incomodar um pouco quem está com a gengiva inflamada. A recomendação geral é a cada seis meses.'
where nome = 'Limpeza e Profilaxia';

update public.servicos_clinica set descricao_longa =
'É a remoção do tártaro que se acumulou abaixo da linha da gengiva, na raiz do dente, onde a escovação não chega. É mais profunda que a limpeza de rotina, e feita em quem já tem a gengiva comprometida. Costuma ser dividida por regiões da boca, em mais de uma sessão, com anestesia local para você não sentir nada. Depois a gengiva fica sensível por alguns dias. O resultado depende da higiene em casa: sem ela, o tártaro volta.'
where nome = 'Raspagem';

update public.servicos_clinica set descricao_longa =
'Trata a gengiva inflamada que sangra, e o osso que sustenta os dentes quando já foi afetado. É a chamada doença periodontal. Os sinais são gengiva vermelha ou inchada, sangramento ao escovar, mau hálito persistente e, nos casos avançados, dentes que amolecem. Começa com a limpeza profunda das raízes, com anestesia e dividida em sessões. O osso já perdido não volta, mas dá para parar a perda: quanto antes começar, mais dente se preserva.'
where nome = 'Tratamento Periodontal';

update public.servicos_clinica set descricao_longa =
'Recupera a gengiva que retraiu e deixou a raiz do dente exposta. Quando isso acontece, o dente parece mais comprido e fica sensível ao gelado. A retração vem de escovação com força demais, doença na gengiva, bruxismo ou da anatomia da pessoa. O dentista recobre a área com tecido, devolvendo a proteção e melhorando a aparência do sorriso. É com anestesia local, e o pós pede alimentação macia por alguns dias. A causa também precisa ser tratada.'
where nome = 'Enxerto Gengival';

update public.servicos_clinica set descricao_longa =
'É a remoção do dente do siso, o último a nascer, geralmente entre os 17 e os 25 anos. Nem todo siso precisa sair: o problema é quando ele nasce torto, fica preso, empurra os vizinhos ou vive inflamando. Como fica no fundo, é difícil de higienizar. A cirurgia é com anestesia local e você não sente dor durante. O pós tem inchaço e incômodo nos primeiros dias, com pico por volta do segundo, e gelo e repouso resolvem bem. Só a radiografia mostra se os seus precisam sair.'
where nome = 'Extração de Siso';


-- =============================================================================
-- CONFERÊNCIA
-- =============================================================================

-- Nenhum texto pode ter sobrado com travessão nem passar de 500 caracteres.
--   select nome, length(descricao_longa) as tam
--     from public.servicos_clinica
--    where descricao_longa like '%—%' or length(descricao_longa) > 500;
--   → tem que voltar vazio

-- O prompt do agente continua igual: a view só entrega a `descricao` curta.
--   select sum(length(procedimento)) from public.procedimentos_clinica_agente;
--   → continua em ~1.961 caracteres
