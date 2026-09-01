import React, { useEffect, useState } from 'react'
import {
  Save, Check, Power, Bot, Trash2, Plus, AlertTriangle, RotateCcw, FileText,
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import CampoTelefone from '../components/CampoTelefone'
import { formatarParaExibicao } from '../lib/telefones'
import { useAgente } from '../lib/agente'
import ConexaoWhatsApp from '../components/ConexaoWhatsApp'
import ApagarPessoa from '../components/ApagarPessoa'
import { useConexao, conexaoDePe } from '../lib/whatsappConexao'
import type { ConfiguracoesAgente, ModeloAgente } from '../types'

/**
 * Aba "Agente de IA" de Configurações.
 *
 * É por aqui que a clínica liga, desliga, escolhe o modelo, controla o modo
 * teste e ajusta o prompt da Letícia — **sem deploy e sem ninguém programar**.
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

const MODELOS: { valor: ModeloAgente; nome: string; nota: string; anthropic: boolean }[] = [
  { valor: 'gpt-4.1-mini',   nome: 'GPT-4.1 mini',    nota: 'Mais barato. É o que está em uso.', anthropic: false },
  { valor: 'gpt-4.1',        nome: 'GPT-4.1',         nota: 'Mais capaz que o mini.',            anthropic: false },
  { valor: 'claude-sonnet-5', nome: 'Claude Sonnet 5', nota: 'Equilíbrio entre custo e conversa.', anthropic: true },
  { valor: 'claude-opus-5',  nome: 'Claude Opus 5',   nota: 'O mais capaz. Mais caro.',          anthropic: true },
]

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

const botao = (fundo: string): React.CSSProperties => ({
  display: 'flex', alignItems: 'center', gap: 6, padding: '8px 18px',
  borderRadius: 9, border: 'none', background: fundo, color: '#fff',
  cursor: 'pointer', fontSize: 13, fontWeight: 600, fontFamily: FONTE,
  transition: 'background 0.2s',
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

  const { conexao, recarregar: recarregarConexao } = useConexao()

  const [novoNumero, setNovoNumero] = useState('')
  const [novoValido, setNovoValido] = useState(false)
  const [buscandoOficial, setBuscandoOficial] = useState(false)

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
    recarregarConexao()
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
        prompt: prompt && prompt.trim() ? prompt : null,
      })
      .eq('id', cfg.id).select().single()
    setSalvando(false)
    if (error) { setErro('Erro ao salvar. Tente novamente.'); return }
    setCfg(data as ConfiguracoesAgente)
    setSalvo(true)
    setTimeout(() => setSalvo(false), 2000)
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

          <button onClick={alternarAtivo} style={botao(ativo ? '#DC2626' : '#1A7A48')}>
            <Power size={14} />
            {ativo ? 'Desligar agora' : 'Ligar o agente'}
          </button>
        </div>

        <p style={{ ...legenda, margin: '16px 0 0', paddingTop: 14, borderTop: '1px solid #EDF2F4' }}>
          Este botão vale na hora — não precisa salvar. Desligado, o WhatsApp continua
          recebendo e tudo fica guardado; ela só não responde.
        </p>

        <Erro texto={erro} />
      </div>

      {/* ---------------- O nome da secretária ----------------

          ⚠️ SÓ LEITURA, POR DECISÃO DO PRODUTO. A coluna `nome_agente` é
          gravável e a tela poderia editá-la; o campo é inerte de propósito,
          para que trocar o nome seja um ato deliberado feito no projeto — e
          não um clique de passagem numa tela que a recepção abre todo dia.

          Trocar o nome no meio da operação confunde quem fala com ela há
          meses, e a mudança vale para toda conversa em andamento. */}
      <div style={cartao}>
        <div style={titulo}>Nome da secretária</div>
        <p style={legenda}>
          É assim que ela se apresenta ao paciente no WhatsApp, e é o nome que a
          equipe vê nas telas do sistema. Um nome só, nos dois lugares: o prompt
          dela lê deste mesmo campo.
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
            <strong>Para trocar o nome, peça a uma IA no projeto.</strong> Abra a
            pasta do sistema no Claude Code, no Codex ou na IDE que você usar, e
            peça a troca. O nome aparece nas telas e dentro do prompt — a IA
            acerta os dois de uma vez, e é por isso que não se troca por aqui.
          </div>
        </div>
      </div>

      {/* ---------------- Conexão do WhatsApp ---------------- */}
      {/* Fica logo depois do card de estado de propósito: quando o card avisa
          que o WhatsApp caiu, o conserto está na linha de baixo. */}
      <ConexaoWhatsApp
        conexao={conexao}
        recarregar={recarregarConexao}
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

      {/* ---------------- Modelo ---------------- */}
      <div style={cartao}>
        <div style={titulo}>Modelo de IA</div>
        <p style={legenda}>
          Quem pensa as respostas. Trocar aqui vale na mensagem seguinte — não há nada
          para publicar.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {MODELOS.map((m) => (
            <label key={m.valor} style={{
              display: 'flex', alignItems: 'flex-start', gap: 11, padding: '11px 14px',
              border: `1px solid ${modelo === m.valor ? '#1E6E8C' : '#DCE6EA'}`,
              background: modelo === m.valor ? '#EAF3F6' : '#fff',
              borderRadius: 10, cursor: 'pointer',
            }}>
              <input type="radio" name="modelo" checked={modelo === m.valor}
                onChange={() => setModelo(m.valor)}
                style={{ marginTop: 2, accentColor: '#1E6E8C', cursor: 'pointer' }} />
              <div>
                <div style={{ fontSize: 13.5, fontWeight: 600, color: '#16232B' }}>{m.nome}</div>
                <div style={{ fontSize: 12, color: '#6B818C', marginTop: 1 }}>{m.nota}</div>
              </div>
            </label>
          ))}
        </div>

        {MODELOS.find((m) => m.valor === modelo)?.anthropic && (
          <Aviso>
            Os modelos Claude exigem a <code style={{ fontFamily: MONO }}>ANTHROPIC_API_KEY</code>{' '}
            configurada nos secrets do Supabase. Sem ela, a {nomeAgente} para de responder — e
            o erro só aparece no log da função.
          </Aviso>
        )}
      </div>

      {/* ---------------- Prompt ---------------- */}
      <div style={cartao}>
        <div style={titulo}>Prompt</div>
        <p style={legenda}>
          Quem a {nomeAgente} é: tom de voz, fluxo de atendimento e regras. O prompt oficial
          vive no arquivo <code style={{ fontFamily: MONO }}>agente-ia/prompt.md</code>,
          versionado no Git. Editar aqui cria uma versão personalizada, que passa a valer
          no lugar dele.
        </p>

        <div style={{
          display: 'flex', alignItems: 'center', gap: 9, padding: '10px 14px',
          background: usandoOficial ? '#E8F8EF' : '#FFFBEB',
          border: `1px solid ${usandoOficial ? '#A7D8C0' : '#FDE68A'}`,
          borderRadius: 9, fontSize: 12.5, marginBottom: 16,
          color: usandoOficial ? '#1A7A48' : '#92400E',
        }}>
          <FileText size={15} style={{ flexShrink: 0 }} />
          <span>
            {usandoOficial
              ? <>No ar agora: <strong>o prompt oficial</strong>, direto do arquivo.</>
              : <>No ar agora: <strong>um prompt personalizado</strong>, editado nesta tela.</>}
          </span>
        </div>

        <textarea
          value={prompt ?? ''}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Vazio = usando o prompt oficial. Clique em “Carregar o oficial” para partir dele."
          rows={16}
          style={{
            width: '100%', padding: '12px 14px', borderRadius: 9,
            border: '1px solid #DCE6EA', fontSize: 12.5, fontFamily: MONO,
            color: '#16232B', outline: 'none', background: '#fff',
            boxSizing: 'border-box', lineHeight: 1.6, resize: 'vertical',
          }}
        />

        <div style={{ display: 'flex', gap: 10, marginTop: 14, flexWrap: 'wrap' }}>
          <button onClick={carregarOficial} disabled={buscandoOficial}
            style={{
              ...botao('#fff'), color: '#1E6E8C', border: '1px solid #DCE6EA',
              cursor: buscandoOficial ? 'wait' : 'pointer',
            }}>
            <FileText size={14} />
            {buscandoOficial ? 'Carregando...' : 'Carregar o oficial para editar'}
          </button>

          {!usandoOficial && (
            <button onClick={() => setPrompt(null)}
              style={{ ...botao('#fff'), color: '#6B818C', border: '1px solid #DCE6EA' }}>
              <RotateCcw size={14} /> Voltar ao oficial
            </button>
          )}
        </div>

        <Aviso>
          Mexer aqui muda o comportamento dela na <strong>mensagem seguinte</strong>. Um
          prompt personalizado <strong>não vai para o Git</strong> — para uma mudança que
          deva ficar registrada, edite o <code style={{ fontFamily: MONO }}>prompt.md</code>.
        </Aviso>
      </div>

      {/* ---------------- Salvar ---------------- */}
      <div style={{ ...cartao, display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
        <button onClick={salvar} disabled={salvando} style={botao(salvo ? '#1A7A48' : '#1E6E8C')}>
          {salvo ? <Check size={14} /> : <Save size={14} />}
          {salvo ? 'Salvo!' : salvando ? 'Salvando...' : 'Salvar'}
        </button>
        <span style={{ fontSize: 12.5, color: '#6B818C' }}>
          Vale para modo teste, números, modelo e prompt. O liga/desliga já foi salvo.
        </span>
        <Erro texto={erro} />
      </div>

      {/* ---------------- Zona de perigo ----------------
          Por último, e depois do botão Salvar, de propósito: nada aqui passa
          por "Salvar", e ninguém deve topar com isso a caminho de outra coisa. */}
      <ApagarPessoa />
    </div>
  )
}
