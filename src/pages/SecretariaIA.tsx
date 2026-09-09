import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Save, Check, Power, Bot, Trash2, Plus, AlertTriangle, FileText, X,
  ChevronDown, ChevronUp, Lock, CircleAlert,
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import CampoTelefone from '../components/CampoTelefone'
import { formatarParaExibicao } from '../lib/telefones'
import { useAgente } from '../lib/agente'
import ConexaoWhatsApp from '../components/ConexaoWhatsApp'
import ApagarPessoa from '../components/ApagarPessoa'
import { useConexao, conexaoDePe } from '../lib/whatsappConexao'
import {
  FORNECEDORES, ORDEM_FORNECEDORES, modelosDe, acharModelo, impedimento,
  useChavesIA,
} from '../lib/modelosIA'
import type { ConfiguracoesAgente, ModeloAgente } from '../types'

/**
 * Aba "Agente de IA" de Configurações.
 *
 * É por aqui que a clínica liga, desliga, escolhe o modelo, controla o modo
 * teste e ajusta o prompt da Gabriela — **sem deploy e sem ninguém programar**.
 *
 * O LIGA/DESLIGA SALVA NA HORA, de propósito. Ele é o botão de pânico: se ela
 * falar alguma bobagem com um paciente, ninguém quer descobrir que esqueceu de
 * clicar em "Salvar". O resto da tela tem Salvar normal.
 *
 * O prompt oficial vem de `agente-ia/prompt.md`, embutido na Edge Function. A
 * tela não guarda uma segunda cópia — pede pela rota `/prompt-oficial`. Se ela
 * guardasse, as duas divergiriam no primeiro ajuste.
 */

const FONTE = "'Plus Jakarta Sans', sans-serif"
const MONO = "ui-monospace, 'SFMono-Regular', Menlo, Consolas, monospace"

/**
 * A etiqueta de chave ao lado do nome do fornecedor.
 *
 * Verde e ambar, e nao verde e vermelho: falta de chave nao e defeito do
 * sistema, e um campo que ninguem preencheu ainda.
 */
function Pilula({ ok }: { ok: boolean }) {
  return (
    <span style={{
      fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 999,
      background: ok ? '#E8F8EF' : '#FFFBEB',
      color: ok ? '#1A7A48' : '#B45309',
      border: `1px solid ${ok ? '#BFE8D0' : '#FDE68A'}`,
      whiteSpace: 'nowrap',
    }}>
      {ok ? 'Chave configurada' : 'Sem chave'}
    </span>
  )
}

const cartao: React.CSSProperties = {
  background: '#fff', borderRadius: 14, border: '1px solid #DCE6EA',
  padding: '22px 26px', marginBottom: 16,
}

const titulo: React.CSSProperties = {
  fontSize: 14, fontWeight: 700, color: '#16232B', marginBottom: 6,
}

const legenda: React.CSSProperties = {
  fontSize: 12.5, color: '#6B818C', margin: '0 0 18px', lineHeight: 1.6,
}

/** Divide um card em duas partes — hoje só o da secretária, com Nome e Modelo. */
const subtitulo: React.CSSProperties = {
  fontSize: 13, fontWeight: 700, color: '#16232B', marginBottom: 5,
}

const botao = (fundo: string): React.CSSProperties => ({
  display: 'flex', alignItems: 'center', gap: 6, padding: '8px 18px',
  borderRadius: 9, border: 'none', background: fundo, color: '#fff',
  cursor: 'pointer', fontSize: 13, fontWeight: 600, fontFamily: FONTE,
  transition: 'background 0.2s',
})

/**
 * O Salvar da pagina inteira -- e so ele.
 *
 * Maior que os outros de proposito: e a acao que faz valer tudo o que foi
 * mexido acima, e estava do mesmo tamanho do "Adicionar" de um numero de
 * teste. Botao que fecha a tarefa nao pode ter o peso de botao de campo.
 */
const botaoGrande = (fundo: string): React.CSSProperties => ({
  display: 'flex', alignItems: 'center', gap: 9, padding: '13px 30px',
  borderRadius: 11, border: 'none', background: fundo, color: '#fff',
  cursor: 'pointer', fontSize: 14.5, fontWeight: 700, fontFamily: FONTE,
  transition: 'background 0.2s', whiteSpace: 'nowrap', flexShrink: 0,
})

function Aviso({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      display: 'flex', gap: 10, alignItems: 'flex-start', padding: '12px 14px',
      background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 10,
      fontSize: 12.5, color: '#92400E', lineHeight: 1.55, marginTop: 14,
    }}>
      <AlertTriangle size={15} style={{ flexShrink: 0, marginTop: 1 }} />
      <div>{children}</div>
    </div>
  )
}

/**
 * `['o modelo', 'os números']` vira `o modelo e os números`.
 *
 * Com vírgula até o penúltimo e "e" no último, como se fala. Montar isso com
 * `join(', ')` daria "o modelo, os números", que soa como lista de compras.
 */
function listar(itens: string[]): string {
  if (itens.length <= 1) return itens[0] ?? ''
  return `${itens.slice(0, -1).join(', ')} e ${itens[itens.length - 1]}`
}

function Erro({ texto }: { texto: string }) {
  if (!texto) return null
  return (
    <div style={{
      padding: '10px 14px', background: '#FEF2F2', border: '1px solid #FECACA',
      borderRadius: 9, fontSize: 12.5, color: '#DC2626', marginTop: 12,
    }}>{texto}</div>
  )
}

export default function SecretariaIA() {
  const { nome: nomeAgente, titulo: agenteTitulo, porExtenso: agentePorExtenso } = useAgente()
  const [cfg, setCfg] = useState<ConfiguracoesAgente | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [salvando, setSalvando] = useState(false)
  const [salvo, setSalvo] = useState(false)
  const [erro, setErro] = useState('')

  // Estado editável
  const [modelo, setModelo] = useState<ModeloAgente>('gpt-4.1-mini')
  const [modoTeste, setModoTeste] = useState(true)
  const [numeros, setNumeros] = useState<string[]>([])
  const [prompt, setPrompt] = useState<string | null>(null)

  const {
    conexao, recarregar: recarregarConexao, verificando, verificadoEm, intervaloMs,
  } = useConexao()

  // Quais fornecedores de IA têm chave no servidor. `null` = ainda não sei, e
  // enquanto não sei a tela não desliga nada.
  const chavesIA = useChavesIA()

  const [novoNumero, setNovoNumero] = useState('')
  const [novoValido, setNovoValido] = useState(false)
  const [buscandoOficial, setBuscandoOficial] = useState(false)
  // O prompt é longo e quase nunca é o que a pessoa veio ver. Nasce fechado, e
  // o oficial só é buscado quando ela abre — não em todo carregamento da página.
  const [promptAberto, setPromptAberto] = useState(false)

  useEffect(() => {
    supabase.from('configuracoes_agente').select('*').limit(1).single()
      .then(({ data }) => {
        if (data) {
          const c = data as ConfiguracoesAgente
          setCfg(c)
          setModelo(c.modelo)
          setModoTeste(c.modo_teste)
          setNumeros(c.numeros_teste ?? [])
          setPrompt(c.prompt)
        }
        setCarregando(false)
      })
  }, [])

  /** O botão de pânico: grava na hora, sem passar por "Salvar". */
  async function alternarAtivo() {
    if (!cfg) return
    const novo = !cfg.ativo
    setErro('')
    const { error } = await supabase
      .from('configuracoes_agente').update({ ativo: novo }).eq('id', cfg.id)
    if (error) { setErro('Não consegui mudar o estado do agente. Tente de novo.'); return }
    setCfg({ ...cfg, ativo: novo })
  }

  /** Troca a ponte ativa. Grava na hora, como o liga/desliga — não é rascunho. */
  async function trocarProvedor(novo: string) {
    if (!cfg || novo === cfg.provedor_whatsapp) return
    setErro('')
    const { error } = await supabase
      .from('configuracoes_agente')
      .update({ provedor_whatsapp: novo }).eq('id', cfg.id)
    if (error) { setErro('Não consegui trocar o provedor.'); return }
    setCfg({ ...cfg, provedor_whatsapp: novo as ConfiguracoesAgente['provedor_whatsapp'] })
    void recarregarConexao()
  }

  async function salvar() {
    if (!cfg) return
    setSalvando(true)
    setErro('')
    const { data, error } = await supabase.from('configuracoes_agente')
      .update({
        modelo,
        modo_teste: modoTeste,
        numeros_teste: numeros,
        // `prompt` NÃO entra aqui. A tela só mostra; quem edita é a IA da IDE,
        // pelo `agente-ia/prompt.md`. Gravar daqui reabriria a porta que a
        // decisão de produto fechou — e sem passar pelo Git.
      })
      .eq('id', cfg.id).select().single()
    setSalvando(false)
    if (error) { setErro('Erro ao salvar. Tente novamente.'); return }
    setCfg(data as ConfiguracoesAgente)
    setSalvo(true)
    setTimeout(() => setSalvo(false), 2000)
  }

  /**
   * Abre ou fecha o prompt. Na primeira abertura sem prompt personalizado,
   * busca o oficial — que mora na função publicada, não nesta tela.
   */
  async function alternarPrompt() {
    if (promptAberto) { setPromptAberto(false); return }
    setPromptAberto(true)
    if (prompt === null) await carregarOficial()
  }

  /** Busca o prompt oficial na Edge Function — a tela não guarda cópia. */
  async function carregarOficial() {
    setBuscandoOficial(true)
    setErro('')
    try {
      const { data: sessao } = await supabase.auth.getSession()
      const token = sessao.session?.access_token
      const r = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/whatsapp/prompt-oficial`,
        { headers: { Authorization: `Bearer ${token}` } },
      )
      const dados = await r.json()
      if (!dados?.ok) throw new Error('resposta inválida')
      setPrompt(dados.prompt)
    } catch {
      setErro('Não consegui carregar o prompt oficial. A função está publicada?')
    }
    setBuscandoOficial(false)
  }

  function adicionarNumero() {
    if (!novoValido || !novoNumero) return
    if (numeros.includes(novoNumero)) { setErro('Esse número já está na lista.'); return }
    setNumeros([...numeros, novoNumero])
    setNovoNumero('')
    setNovoValido(false)
    setErro('')
  }

  if (carregando) {
    return <div style={{ padding: 40, textAlign: 'center', color: '#6B818C' }}>Carregando...</div>
  }
  if (!cfg) {
    return (
      <div style={cartao}>
        <div style={titulo}>Configuração não encontrada</div>
        <p style={legenda}>
          A tabela <code style={{ fontFamily: MONO }}>configuracoes_agente</code> está vazia.
          A migração <code style={{ fontFamily: MONO }}>0010</code> foi aplicada?
        </p>
      </div>
    )
  }

  const ativo = cfg.ativo
  const usandoOficial = !cfg.prompt

  /**
   * O que dizer no card de cima.
   *
   * ⚠️ ATENDER DEPENDE DE DUAS COISAS: o agente ligado **e** o WhatsApp
   * conectado. O card antigo só conhecia a primeira, e por isso afirmava "está
   * atendendo" em 01/09 enquanto a ponte estava fora do ar e nenhuma mensagem
   * chegava. Um painel que afirma o que não sabe é pior que um painel vazio.
   */
  function situacaoDoAgente() {
    if (!ativo) {
      return {
        cor: '#6B818C', fundo: '#F2F6F7', borda: '#DCE6EA',
        titulo: `A ${agentePorExtenso} está desligada`,
        detalhe: 'As mensagens continuam sendo registradas, mas ninguém recebe resposta.',
      }
    }
    if (!conexao || conexao.estado === 'verificando') {
      return {
        cor: '#6B818C', fundo: '#F2F6F7', borda: '#DCE6EA',
        titulo: `A ${agentePorExtenso} está ligada`,
        detalhe: 'Verificando a conexão com o WhatsApp...',
      }
    }
    if (!conexaoDePe(conexao)) {
      return {
        cor: '#DC2626', fundo: '#FEF2F2', borda: '#FECACA',
        titulo: `Ligada, mas o WhatsApp está desconectado`,
        detalhe: 'Ela não recebe nem responde nada enquanto a conexão estiver fora. Veja logo abaixo, em Conexão do WhatsApp.',
      }
    }
    return {
      cor: '#1A7A48', fundo: '#E8F8EF', borda: '#A7D8C0',
      titulo: `A ${agentePorExtenso} está atendendo`,
      detalhe: modoTeste
        ? `Respondendo só aos ${numeros.length} número(s) de teste.`
        : 'Respondendo a qualquer número que mandar mensagem.',
    }
  }

  // ── O que foi mexido e ainda não foi salvo ────────────────────────────────
  //
  // A comparação é contra `cfg`, que é a ÚLTIMA LINHA GRAVADA — e não contra
  // um "sujo/limpo" que alguém precise lembrar de ligar em cada `onChange`.
  // Assim, mexer e voltar ao valor original NÃO conta como alteração, e o
  // `setCfg(data)` do salvar zera tudo sozinho.
  //
  // `prompt` e `nome_agente` ficam de fora: são só leitura. O `ativo` também,
  // porque grava no clique.
  const alteracoes: string[] = []
  if (cfg) {
    if (modelo !== cfg.modelo) alteracoes.push('o modelo')
    if (modoTeste !== cfg.modo_teste) alteracoes.push('o modo de teste')
    if (numeros.join(',') !== (cfg.numeros_teste ?? []).join(',')) {
      alteracoes.push('os números de teste')
    }
  }
  const alterado = alteracoes.length > 0

  const situacao = situacaoDoAgente()

  return (
    <div style={{ padding: '32px 36px', maxWidth: 900, margin: '0 auto' }}>

      <div className="fade-in-1" style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: '#16232B', margin: 0 }}>Secretária de IA</h1>
        <p style={{ fontSize: 13, color: '#6B818C', marginTop: 4 }}>Ligar, desligar, escolher o modelo e ajustar o que ela sabe dizer.</p>
      </div>

      {/* ---------------- Estado ---------------- */}
      <div style={{ ...cartao, borderColor: situacao.borda }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
          <div style={{
            width: 44, height: 44, borderRadius: 12, flexShrink: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: situacao.fundo,
          }}>
            <Bot size={22} color={situacao.cor} />
          </div>

          <div style={{ flex: 1, minWidth: 200 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: situacao.cor }}>
              {situacao.titulo}
            </div>
            <div style={{ fontSize: 12.5, color: '#6B818C', marginTop: 2, lineHeight: 1.5 }}>
              {situacao.detalhe}
            </div>
          </div>

        </div>

        {/* O interruptor não mora aqui — mora no fim da página. Este card é
            painel, e painel se lê de relance; a chave que cala a secretária
            para a clínica inteira não deve estar no caminho do olho de quem só
            queria conferir se está tudo certo. */}
        <p style={{ ...legenda, margin: '16px 0 0', paddingTop: 14, borderTop: '1px solid #EDF2F4' }}>
          {ativo
            ? `Para desligar a ${nomeAgente}, vá até o fim desta página.`
            : `Para ligar a ${nomeAgente}, vá até o fim desta página.`}
        </p>

        <Erro texto={erro} />
      </div>

      {/* ---------------- A secretária: nome, modelo e prompt ----------------

          ⚠️ SÓ LEITURA, POR DECISÃO DO PRODUTO. A coluna `nome_agente` é
          gravável e a tela poderia editá-la; o campo é inerte de propósito,
          para que trocar o nome seja um ato deliberado feito no projeto — e
          não um clique de passagem numa tela que a recepção abre todo dia.

          Trocar o nome no meio da operação confunde quem fala com ela há
          meses, e a mudança vale para toda conversa em andamento. */}
      <div style={cartao}>
        <div style={titulo}>A secretária</div>
        <p style={{ ...legenda, marginBottom: 18 }}>
          Como ela se chama e quem pensa as respostas dela.
        </p>

        <div style={subtitulo}>Nome</div>
        <p style={{ ...legenda, marginBottom: 6 }}>
          O nome que ela usa para se apresentar aos pacientes — e o mesmo que
          identifica a secretária dentro do sistema.
        </p>

        <input
          value={cfg.nome_agente}
          readOnly
          aria-readonly="true"
          title="Este campo não é editado por aqui."
          style={{
            padding: '9px 12px', borderRadius: 9, border: '1px solid #DCE6EA',
            fontSize: 13.5, fontFamily: FONTE, color: '#16232B',
            background: '#F7FAFB', outline: 'none', minWidth: 220,
            cursor: 'default',
          }}
        />

        <div style={{
          display: 'flex', alignItems: 'flex-start', gap: 9, marginTop: 14,
          background: '#EAF3F6', border: '1px solid #CFE2E9', borderRadius: 10,
          padding: '11px 13px',
        }}>
          <Bot size={16} color="#1E6E8C" style={{ flexShrink: 0, marginTop: 1 }} />
          <div style={{ fontSize: 12.5, color: '#1E6E8C', lineHeight: 1.6 }}>
            <strong>Quer trocar o nome da secretária?</strong><br />
            Abra a pasta do sistema no Claude Code, no Codex ou na IDE que você usar,
            e peça a troca. O nome aparece nas telas e dentro do prompt.
          </div>
        </div>

        {/* ---- Modelo, no mesmo card ----

            Nome e modelo respondem à mesma pergunta — quem é essa secretária —
            e estavam separados por três cards, com a conexão e o modo teste no
            meio. O nome é identidade e o modelo é a cabeça: quem abre a página
            para saber "com quem estou lidando" quer os dois de uma vez. */}
        <div style={{ height: 1, background: '#EDF2F4', margin: '20px 0' }} />

        <div style={subtitulo}>Modelo de IA</div>
        <p style={legenda}>
          Quem pensa as respostas. Trocar aqui vale na mensagem seguinte — não há nada
          para publicar.
        </p>

        {/* Um bloco por empresa, e a grade em duas colunas.

            A lista corrida servia para quatro modelos. Com oito ela vira uma
            coluna alta em que "GPT" e "Claude" se intercalam, e a pergunta que
            a pessoa faz primeiro — *de qual empresa dá para usar?* — não tem
            onde ser respondida. Com o bloco, a resposta é o cabeçalho.

            Cards, e não uma lista suspensa: a nota de cada um é o que decide a
            escolha (barato / caro / pensa antes), e num `select` ela não cabe.
            É a mesma regra dos Procedimentos — item com texto quer card. */}
        {ORDEM_FORNECEDORES.map((f) => {
          const temChave = chavesIA?.[f] ?? true
          return (
            <div key={f} style={{ marginTop: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 9 }}>
                <span style={{ fontSize: 12.5, fontWeight: 700, color: '#16232B' }}>
                  {FORNECEDORES[f].nome}
                </span>
                {/* Enquanto `chavesIA` é nulo não sabemos, e não afirmamos nada:
                    acusar "sem chave" numa falha de rede de meio segundo é o
                    mesmo erro do `webhook: 'desconhecido'`. */}
                {chavesIA !== null && <Pilula ok={temChave} />}
                <div style={{ flex: 1, height: 1, background: '#EDF2F4' }} />
              </div>

              <div style={{
                display: 'grid', gap: 8,
                gridTemplateColumns: 'repeat(auto-fit, minmax(236px, 1fr))',
              }}>
                {modelosDe(f).map((m) => {
                  const travado = impedimento(m, chavesIA)
                  const escolhido = modelo === m.valor
                  return (
                    <label key={m.valor} style={{
                      display: 'flex', alignItems: 'flex-start', gap: 10, padding: '11px 13px',
                      border: `1px solid ${escolhido ? '#1E6E8C' : '#DCE6EA'}`,
                      background: travado ? '#F7FAFB' : escolhido ? '#EAF3F6' : '#fff',
                      borderRadius: 10, cursor: travado ? 'not-allowed' : 'pointer',
                    }}>
                      <input
                        type="radio" name="modelo" checked={escolhido} disabled={!!travado}
                        onChange={() => { setModelo(m.valor) }}
                        style={{
                          marginTop: 2, accentColor: '#1E6E8C',
                          cursor: travado ? 'not-allowed' : 'pointer',
                        }}
                      />
                      <div style={{ minWidth: 0 }}>
                        <div style={{
                          fontSize: 13.5, fontWeight: 600,
                          color: travado ? '#6B818C' : '#16232B',
                        }}>{m.nome}</div>
                        <div style={{
                          fontSize: 12, color: '#6B818C', marginTop: 1, lineHeight: 1.5,
                        }}>{m.nota}</div>

                        {/* O motivo NÃO esmaece junto com o card. Apagar a
                            explicação de um item desligado é apagar a saída —
                            mesma regra do rodapé dos Procedimentos. */}
                        {travado && (
                          <div style={{
                            display: 'flex', gap: 5, alignItems: 'flex-start', marginTop: 7,
                            fontSize: 11.5, color: '#B45309', lineHeight: 1.45,
                          }}>
                            <Lock size={12} style={{ flexShrink: 0, marginTop: 2 }} />
                            <span>{travado}</span>
                          </div>
                        )}
                      </div>
                    </label>
                  )
                })}
              </div>
            </div>
          )
        })}

        {/* O modelo GRAVADO parou de existir ou perdeu a chave.

            É o caso caro e mudo: a tela mostra o nome dele em cima, tudo
            parece normal, e a secretária não responde ninguém. O card
            desligado sozinho não conta isso — ele está no meio da grade, e o
            que está errado é o que está VALENDO. */}
        {(() => {
          const atual = acharModelo(modelo)
          if (!atual) {
            return (
              <Aviso>
                O modelo gravado (<code style={{ fontFamily: MONO }}>{modelo}</code>) não está
                mais na lista. A {nomeAgente} continua tentando usá-lo — escolha um acima e
                salve.
              </Aviso>
            )
          }
          const travado = impedimento(atual, chavesIA)
          if (!travado) return null
          return (
            <Aviso>
              <strong>{atual.nome} está em uso, e não pode responder.</strong> {travado} Enquanto
              isso a {nomeAgente} falha em silêncio: a mensagem chega, aparece em Conversas e
              fica sem resposta. Escolha outro modelo acima e salve.
            </Aviso>
          )
        })()}

        {/* ---- Prompt, no mesmo card ----

            SÓ LEITURA, pela mesma decisão do nome logo acima: quem edita é a IA
            da IDE, que lê o repositório inteiro antes de escrever e grava no
            `prompt.md`, que é versionado. Editar por aqui criava uma versão que
            **não ia para o Git** — e o dia em que alguém precisasse entender por
            que ela mudou de comportamento, não haveria histórico nenhum.

            E NASCE FECHADO. São umas duzentas linhas: aberto, ele empurrava
            todo o resto da página para fora da tela, e quase nunca é o que a
            pessoa veio ver. */}
        <div style={{ height: 1, background: '#EDF2F4', margin: '20px 0' }} />

        <div style={subtitulo}>Prompt</div>
        <p style={legenda}>
          Quem a {nomeAgente} é: tom de voz, fluxo de atendimento e regras.
        </p>

        <div style={{
          display: 'flex', alignItems: 'center', gap: 9, padding: '10px 14px',
          background: usandoOficial ? '#E8F8EF' : '#FFFBEB',
          border: `1px solid ${usandoOficial ? '#A7D8C0' : '#FDE68A'}`,
          borderRadius: 9, fontSize: 12.5, marginBottom: 14,
          color: usandoOficial ? '#1A7A48' : '#92400E',
        }}>
          <FileText size={15} style={{ flexShrink: 0 }} />
          <span>
            {usandoOficial
              ? <>No ar agora: <strong>o prompt oficial</strong>, direto do arquivo.</>
              : <>No ar agora: <strong>um prompt personalizado</strong>, gravado no banco.</>}
          </span>
        </div>

        <button
          onClick={() => { void alternarPrompt() }}
          style={{
            display: 'flex', alignItems: 'center', gap: 6, padding: 0,
            background: 'none', border: 'none', cursor: 'pointer',
            fontSize: 13, fontWeight: 700, color: '#1E6E8C', fontFamily: FONTE,
          }}
        >
          {promptAberto ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
          {promptAberto ? 'Ocultar o prompt' : 'Ver o prompt'}
        </button>

        {promptAberto && (
          <div style={{
            marginTop: 12, padding: '14px 16px', borderRadius: 9,
            border: '1px solid #DCE6EA', background: '#F7FAFB',
            fontSize: 12.5, fontFamily: MONO, color: '#16232B',
            lineHeight: 1.65, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
            maxHeight: 440, overflowY: 'auto',
          }}>
            {buscandoOficial
              ? 'Carregando o prompt...'
              : prompt ?? 'Não consegui carregar o prompt. A função está publicada?'}
          </div>
        )}

        <div style={{
          display: 'flex', alignItems: 'flex-start', gap: 9, marginTop: 14,
          background: '#EAF3F6', border: '1px solid #CFE2E9', borderRadius: 10,
          padding: '11px 13px',
        }}>
          <Bot size={16} color="#1E6E8C" style={{ flexShrink: 0, marginTop: 1 }} />
          <div style={{ fontSize: 12.5, color: '#1E6E8C', lineHeight: 1.6 }}>
            <strong>Quer mudar o que a {nomeAgente} fala?</strong><br />
            Abra a pasta do sistema no Claude Code, no Codex ou na IDE que você usar,
            e peça a mudança. O prompt é editado no arquivo{' '}
            <code style={{ fontFamily: MONO }}>agente-ia/prompt.md</code>, que fica
            registrado no Git — assim dá para saber o que mudou, quando e por quê.
          </div>
        </div>
      </div>

      {/* ---------------- Conexão do WhatsApp ---------------- */}
      {/* Depois de quem ela é, e antes do modo teste: a ordem da página é a
          ordem de quem chega — quem é a secretária, por onde ela fala, para
          quem ela responde, e o que ela diz. */}
      <ConexaoWhatsApp
        conexao={conexao}
        recarregar={recarregarConexao}
        verificando={verificando}
        verificadoEm={verificadoEm}
        intervaloMs={intervaloMs}
        provedor={cfg.provedor_whatsapp ?? 'evolution'}
        onTrocarProvedor={trocarProvedor}
      />

      {/* ---------------- Modo teste ---------------- */}
      <div style={cartao}>
        <div style={titulo}>Modo de teste</div>
        <p style={{ ...legenda, marginBottom: 10, color: '#3A5560', fontWeight: 500 }}>
          Teste a {nomeAgente} ({agenteTitulo}) antes de liberar o atendimento para todos.
        </p>
        <p style={legenda}>
          Adicione abaixo os números de WhatsApp que poderão conversar com a {nomeAgente}{' '}
          ({agenteTitulo}) durante os testes. Assim, você pode enviar mensagens e conferir
          como ela responde antes de começar o atendimento aos pacientes.
        </p>
        <p style={{ ...legenda, marginBottom: 16 }}>
          Enquanto o modo de teste estiver ativo, a {nomeAgente} ({agenteTitulo}) responderá
          apenas aos números cadastrados abaixo. As mensagens dos demais contatos continuarão
          chegando normalmente, mas não serão respondidas pela {nomeAgente} ({agenteTitulo}).
        </p>

        <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', marginBottom: 16 }}>
          <input type="checkbox" checked={modoTeste} onChange={(e) => setModoTeste(e.target.checked)}
            style={{ width: 16, height: 16, accentColor: '#1E6E8C', cursor: 'pointer' }} />
          <span style={{ fontSize: 13.5, fontWeight: 600, color: '#16232B' }}>
            Ativar modo de teste
          </span>
        </label>

        {modoTeste && (
          <>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
              {numeros.length === 0 && (
                <div style={{ fontSize: 12.5, color: '#6B818C', fontStyle: 'italic' }}>
                  Nenhum número na lista — assim ela não responde a ninguém.
                </div>
              )}
              {numeros.map((n) => (
                <div key={n} style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '9px 14px', background: '#F7FAFB', border: '1px solid #DCE6EA',
                  borderRadius: 9,
                }}>
                  <span style={{ fontFamily: MONO, fontSize: 13, color: '#16232B' }}>
                    {formatarParaExibicao(n)}
                  </span>
                  <button onClick={() => setNumeros(numeros.filter((x) => x !== n))}
                    title="Remover"
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#DC2626', display: 'flex', padding: 4 }}>
                    <Trash2 size={15} />
                  </button>
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: 240 }}>
                <CampoTelefone
                  valor={novoNumero}
                  onChange={(canonico, valido) => { setNovoNumero(canonico); setNovoValido(valido) }}
                  rotulo="Adicionar número para teste"
                />
              </div>
              <button onClick={adicionarNumero} disabled={!novoValido}
                style={{ ...botao(novoValido ? '#1E6E8C' : '#B8CBD3'), cursor: novoValido ? 'pointer' : 'not-allowed' }}>
                <Plus size={14} /> Adicionar
              </button>
            </div>
          </>
        )}

        {!modoTeste && (
          <Aviso>
            <strong>Sem o modo teste, ela responde a qualquer pessoa</strong> que mandar
            mensagem para o WhatsApp da clínica — inclusive número desconhecido. Só
            desligue quando o prompt já tiver sido testado de verdade.
          </Aviso>
        )}
      </div>

      {/* ---------------- Ligar e desligar ----------------

          NO FIM DA PÁGINA, DE PROPÓSITO. No topo, junto do painel de estado, o
          interruptor ficava no caminho do olho de quem só queria conferir se
          estava tudo certo — e ele cala a secretária para a clínica INTEIRA.

          E a lista existe porque o botão sozinho não conta a parte que
          tranquiliza: desligar não perde mensagem nenhuma. Quem não sabe disso
          hesita em desligar quando deveria, ou desliga achando que está
          fechando o WhatsApp da clínica.

          O aviso aponta para "Assumir a conversa" porque é ali que mora o erro
          caro: um paciente irritado, e alguém desliga o atendimento de todos
          para resolver o caso de um. */}
      <div style={cartao}>
        <div style={titulo}>Ligar e desligar a {nomeAgente}</div>
        <p style={{ ...legenda, marginBottom: 12 }}>Com ela desligada:</p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
          {[
            { ok: true, texto: 'As mensagens dos pacientes continuam chegando.' },
            { ok: true, texto: 'Tudo fica guardado na página Conversas.' },
            { ok: false, texto: 'Ela não responde ninguém.' },
          ].map(({ ok, texto }) => (
            <div key={texto} style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 13, color: '#16232B' }}>
              <span style={{
                width: 20, height: 20, borderRadius: '50%', flexShrink: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: ok ? '#E8F8EF' : '#FEF2F2',
              }}>
                {ok ? <Check size={12} color="#1A7A48" /> : <X size={12} color="#DC2626" />}
              </span>
              {texto}
            </div>
          ))}
        </div>

        <div style={{
          display: 'flex', alignItems: 'flex-start', gap: 9, marginBottom: 18,
          background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 10,
          padding: '11px 13px',
        }}>
          <AlertTriangle size={16} color="#D97706" style={{ flexShrink: 0, marginTop: 1 }} />
          <div style={{ fontSize: 12.5, color: '#B45309', lineHeight: 1.6 }}>
            <strong>Isto vale para todos os pacientes.</strong><br />
            Quer que ela pare de responder só uma pessoa? Não desligue aqui. Abra{' '}
            <Link to="/conversas" style={{ color: '#B45309', fontWeight: 700 }}>Conversas</Link>,
            escolha a conversa e clique em <strong>Assumir a conversa</strong>. Assim ela
            continua atendendo o resto da clínica.
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
          <button onClick={alternarAtivo} style={botao(ativo ? '#DC2626' : '#1A7A48')}>
            <Power size={14} />
            {ativo ? `Desligar a ${nomeAgente}` : `Ligar a ${nomeAgente}`}
          </button>
          <span style={{ fontSize: 12.5, color: '#6B818C' }}>
            Vale na hora. Não precisa salvar.
          </span>
        </div>
      </div>

      {/* ---------------- Zona de perigo ----------------
          Por último, de propósito: nada aqui passa por "Salvar", e ninguém
          deve topar com isso a caminho de outra coisa. */}
      <ApagarPessoa />

      {/* ---------------- Salvar ----------------

          NO FIM DE TUDO, E GRUDADO NO RODAPÉ ENQUANTO HOUVER PENDÊNCIA.

          Ele morava no meio da página, do tamanho do "Adicionar" de um número
          de teste: quem trocasse o modelo lá em cima e não rolasse até ele
          saía da página achando que tinha trocado. Nada dizia o contrário —
          a tela já mostrava o valor novo, porque o estado local muda na hora.

          `position: sticky` com `bottom`, e não `fixed`: fixo precisaria saber
          onde a barra lateral termina (e ela encolhe), e viveria dentro do
          `ModalPortal` pelo problema do `transform`. Sticky fica na coluna do
          conteúdo sozinho, e como é o ÚLTIMO elemento, ele desgruda no fim da
          rolagem em vez de dar salto.

          E ele não é um card: é uma barra, com sombra. A forma diferente é o
          que diz "isto é da página inteira" — senão, colado embaixo de
          "Apagar uma pessoa", pareceria salvar aquilo. */}
      <div style={{
        position: alterado ? 'sticky' : 'static',
        bottom: 16, zIndex: 5,
        display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap',
        padding: '16px 20px', borderRadius: 14,
        background: alterado ? '#EAF3F6' : '#fff',
        border: `1px solid ${alterado ? '#1E6E8C' : '#DCE6EA'}`,
        boxShadow: alterado ? '0 6px 20px rgba(22, 35, 43, 0.13)' : 'none',
        transition: 'background 0.2s, border-color 0.2s, box-shadow 0.2s',
      }}>
        <button
          onClick={salvar}
          disabled={salvando || !alterado}
          style={{
            ...botaoGrande(salvo ? '#1A7A48' : alterado ? '#1E6E8C' : '#B8CBD3'),
            cursor: salvando || !alterado ? 'default' : 'pointer',
          }}
        >
          {salvo ? <Check size={17} /> : <Save size={17} />}
          {salvo ? 'Salvo!' : salvando ? 'Salvando...' : 'Salvar'}
        </button>

        <div style={{ minWidth: 0, flex: 1 }}>
          {alterado ? (
            <>
              <div style={{
                display: 'flex', alignItems: 'center', gap: 7,
                fontSize: 13.5, fontWeight: 700, color: '#1E6E8C',
              }}>
                <CircleAlert size={15} style={{ flexShrink: 0 }} />
                Você mudou {listar(alteracoes)}, e ainda não salvou.
              </div>
              <div style={{ fontSize: 12.5, color: '#6B818C', marginTop: 3, lineHeight: 1.55 }}>
                Enquanto não clicar em Salvar, a {nomeAgente} continua atendendo do jeito
                antigo. Sair da página agora perde a alteração.
              </div>
            </>
          ) : (
            <>
              <div style={{
                display: 'flex', alignItems: 'center', gap: 7,
                fontSize: 13.5, fontWeight: 700, color: '#16232B',
              }}>
                <Check size={15} color="#1A7A48" style={{ flexShrink: 0 }} />
                Tudo salvo.
              </div>
              <div style={{ fontSize: 12.5, color: '#6B818C', marginTop: 3, lineHeight: 1.55 }}>
                Este botão vale para o modelo, o modo de teste e os números. Ligar, desligar
                e apagar uma pessoa valem no clique, sem passar por aqui.
              </div>
            </>
          )}
          <Erro texto={erro} />
        </div>
      </div>
    </div>
  )
}
