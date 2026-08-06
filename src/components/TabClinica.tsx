import React, { useEffect, useState } from 'react'
import { Save, Check } from 'lucide-react'
import { supabase } from '../lib/supabase'
import type { ConfiguracoesClinica, InformacaoClinica } from '../types'

/**
 * Aba "Clínica" de Configurações: endereço, bairro, cidade, UF, CEP e os links
 * públicos da clínica.
 *
 * O que se preenche aqui vai para `configuracoes_clinica`, campo a campo. Quem
 * monta as frases é a view `informacoes_clinica_agente` (migração 0006), lida
 * pelo Agente de IA através do n8n.
 *
 * O bloco do fim da tela **lê a view de verdade**, não uma imitação: é a mesma
 * consulta que o agente faz. Se ele fosse montar a prévia por conta própria,
 * haveria duas implementações da mesma regra — e um dia a tela mostraria uma
 * coisa e o paciente ouviria outra.
 */

const UFS = [
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG',
  'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO',
]

const FONTE = "'Plus Jakarta Sans', sans-serif"
const MONO = "ui-monospace, 'SFMono-Regular', Menlo, Consolas, monospace"

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '9px 12px', borderRadius: 9, border: '1px solid #DCE6EA',
  fontSize: 13.5, fontFamily: FONTE, color: '#16232B',
  outline: 'none', background: '#fff', boxSizing: 'border-box',
}

const rotuloStyle: React.CSSProperties = {
  fontSize: 12.5, fontWeight: 600, color: '#16232B', display: 'block', marginBottom: 6,
}

const opcionalStyle: React.CSSProperties = { color: '#6B818C', fontWeight: 400 }

/** '88040600' → '88040-600'. Só na tela; o banco guarda os dígitos. */
function formatarCep(digitos: string): string {
  const d = digitos.replace(/\D/g, '').slice(0, 8)
  return d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d
}

/** Campo em branco vira NULL, não string vazia — senão a view produz linha pelada. */
function ouNulo(texto: string): string | null {
  const limpo = texto.trim()
  return limpo === '' ? null : limpo
}

interface Formulario {
  endereco: string
  bairro: string
  cidade: string
  estado: string
  cep: string
  google_maps_url: string
  instagram_url: string
  site_url: string
}

const VAZIO: Formulario = {
  endereco: '', bairro: '', cidade: '', estado: '', cep: '',
  google_maps_url: '', instagram_url: '', site_url: '',
}

export default function TabClinica() {
  const [clinica, setClinica] = useState<ConfiguracoesClinica | null>(null)
  const [form, setForm] = useState<Formulario>(VAZIO)
  const [linhas, setLinhas] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [salvando, setSalvando] = useState(false)
  const [salvo, setSalvo] = useState(false)
  const [erro, setErro] = useState('')

  useEffect(() => {
    let vivo = true
    Promise.all([
      supabase.from('configuracoes_clinica').select('*').limit(1).single(),
      supabase.from('informacoes_clinica_agente').select('informacao'),
    ]).then(([resClinica, resView]) => {
      if (!vivo) return
      const c = resClinica.data as ConfiguracoesClinica | null
      if (c) {
        setClinica(c)
        setForm({
          endereco: c.endereco ?? '',
          bairro: c.bairro ?? '',
          cidade: c.cidade ?? '',
          estado: c.estado ?? '',
          cep: c.cep ?? '',
          google_maps_url: c.google_maps_url ?? '',
          instagram_url: c.instagram_url ?? '',
          site_url: c.site_url ?? '',
        })
      }
      setLinhas(((resView.data ?? []) as InformacaoClinica[]).map((l) => l.informacao))
      setLoading(false)
    })
    return () => { vivo = false }
  }, [])

  const set = (campo: keyof Formulario, valor: string) => {
    setForm((prev) => ({ ...prev, [campo]: valor }))
    setErro('')
    setSalvo(false)
  }

  const recarregarPrevia = async () => {
    const { data } = await supabase.from('informacoes_clinica_agente').select('informacao')
    setLinhas(((data ?? []) as InformacaoClinica[]).map((l) => l.informacao))
  }

  const salvar = async () => {
    const cepDigitos = form.cep.replace(/\D/g, '')
    if (cepDigitos !== '' && cepDigitos.length !== 8) {
      setErro('O CEP precisa ter 8 dígitos.')
      return
    }
    for (const [campo, rotulo] of [
      ['google_maps_url', 'link do Google Maps'],
      ['instagram_url', 'Instagram'],
      ['site_url', 'site'],
    ] as [keyof Formulario, string][]) {
      const valor = form[campo].trim()
      if (valor !== '' && !/^https?:\/\//i.test(valor)) {
        setErro(`O ${rotulo} precisa começar com https://`)
        return
      }
    }

    setSalvando(true)
    setErro('')

    const dados = {
      endereco: ouNulo(form.endereco),
      bairro: ouNulo(form.bairro),
      cidade: ouNulo(form.cidade),
      estado: ouNulo(form.estado),
      cep: cepDigitos === '' ? null : cepDigitos,
      google_maps_url: ouNulo(form.google_maps_url),
      instagram_url: ouNulo(form.instagram_url),
      site_url: ouNulo(form.site_url),
    }

    const { data, error } = clinica
      ? await supabase.from('configuracoes_clinica').update(dados).eq('id', clinica.id).select().single()
      : await supabase.from('configuracoes_clinica').insert(dados).select().single()

    setSalvando(false)
    if (error) { setErro('Erro ao salvar. Tente novamente.'); return }

    setClinica(data as ConfiguracoesClinica)
    await recarregarPrevia()
    setSalvo(true)
    setTimeout(() => setSalvo(false), 2000)
  }

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: '#6B818C' }}>Carregando...</div>

  const foco = (e: React.FocusEvent<HTMLInputElement | HTMLSelectElement>) => (e.target.style.borderColor = '#1E6E8C')
  const desfoco = (e: React.FocusEvent<HTMLInputElement | HTMLSelectElement>) => (e.target.style.borderColor = '#DCE6EA')

  return (
    <div>
      <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #DCE6EA', padding: '22px 26px', marginBottom: 16 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: '#16232B', marginBottom: 6 }}>Dados da Clínica</div>
        <p style={{ fontSize: 12.5, color: '#6B818C', margin: '0 0 18px', paddingBottom: 14, borderBottom: '1px solid #EDF2F4', lineHeight: 1.6 }}>
          O Agente de IA consulta estas informações no banco sempre que precisa falar do
          endereço, do Instagram ou do site com um paciente. O que você salvar aqui vale
          na conversa seguinte — não há nada para publicar ou sincronizar.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={rotuloStyle}>Endereço <span style={opcionalStyle}>(rua, número e complemento)</span></label>
            <input value={form.endereco} onChange={(e) => set('endereco', e.target.value)}
              placeholder="Ex: Rua Samuel Scott, 212 A - bloco 3"
              style={inputStyle} onFocus={foco} onBlur={desfoco} />
          </div>

          <div>
            <label style={rotuloStyle}>Bairro</label>
            <input value={form.bairro} onChange={(e) => set('bairro', e.target.value)}
              placeholder="Ex: Carvoeira" style={inputStyle} onFocus={foco} onBlur={desfoco} />
          </div>

          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <div style={{ flex: 2, minWidth: 180 }}>
              <label style={rotuloStyle}>Cidade</label>
              <input value={form.cidade} onChange={(e) => set('cidade', e.target.value)}
                placeholder="Ex: Florianópolis" style={inputStyle} onFocus={foco} onBlur={desfoco} />
            </div>
            <div style={{ flex: 1, minWidth: 110 }}>
              <label style={rotuloStyle}>Estado</label>
              <select value={form.estado} onChange={(e) => set('estado', e.target.value)}
                style={{ ...inputStyle, cursor: 'pointer' }} onFocus={foco} onBlur={desfoco}>
                <option value="">—</option>
                {UFS.map((uf) => <option key={uf} value={uf}>{uf}</option>)}
              </select>
            </div>
            <div style={{ flex: 1, minWidth: 130 }}>
              <label style={rotuloStyle}>CEP</label>
              <input value={formatarCep(form.cep)} onChange={(e) => set('cep', e.target.value.replace(/\D/g, '').slice(0, 8))}
                placeholder="00000-000" inputMode="numeric"
                style={inputStyle} onFocus={foco} onBlur={desfoco} />
            </div>
          </div>

          <div>
            <label style={rotuloStyle}>Link do Google Maps</label>
            <input value={form.google_maps_url} onChange={(e) => set('google_maps_url', e.target.value)}
              placeholder="https://maps.app.goo.gl/..." style={inputStyle} onFocus={foco} onBlur={desfoco} />
          </div>

          <div>
            <label style={rotuloStyle}>Instagram</label>
            <input value={form.instagram_url} onChange={(e) => set('instagram_url', e.target.value)}
              placeholder="https://instagram.com/suaclinica" style={inputStyle} onFocus={foco} onBlur={desfoco} />
          </div>

          <div>
            <label style={rotuloStyle}>Site</label>
            <input value={form.site_url} onChange={(e) => set('site_url', e.target.value)}
              placeholder="https://suaclinica.com.br" style={inputStyle} onFocus={foco} onBlur={desfoco} />
          </div>
        </div>

        {erro && (
          <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 8, padding: '8px 12px', fontSize: 12.5, color: '#DC2626', marginTop: 14 }}>{erro}</div>
        )}

        <div style={{ marginTop: 18 }}>
          <button onClick={salvar} disabled={salvando}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 18px', borderRadius: 9, border: 'none', background: salvo ? '#1A7A48' : '#1E6E8C', color: '#fff', cursor: salvando ? 'not-allowed' : 'pointer', fontSize: 13, fontWeight: 600, fontFamily: FONTE, transition: 'background 0.2s' }}>
            {salvo ? <Check size={14} /> : <Save size={14} />}
            {salvo ? 'Salvo!' : salvando ? 'Salvando...' : 'Salvar'}
          </button>
        </div>
      </div>

      {/* O que o agente lê — consulta real à view, não uma imitação */}
      <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #DCE6EA', padding: '22px 26px' }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: '#16232B', marginBottom: 6 }}>O que o Agente de IA lê</div>
        <p style={{ fontSize: 12.5, color: '#6B818C', margin: '0 0 16px', lineHeight: 1.6 }}>
          Exatamente estas linhas, uma informação por linha, direto da view{' '}
          <code style={{ fontFamily: MONO, fontSize: 11.5, color: '#16232B' }}>informacoes_clinica_agente</code>.
          Campo em branco não vira linha — some da lista em vez de virar um rótulo vazio.
          A linha <strong style={{ color: '#16232B' }}>Atendimento</strong> não se digita aqui:
          ela é montada sozinha a partir da aba <strong style={{ color: '#16232B' }}>Horários de
          Funcionamento</strong>.
        </p>

        {linhas.length === 0 ? (
          <div style={{ background: '#F7FAFB', border: '1px dashed #DCE6EA', borderRadius: 9, padding: '18px 16px', fontSize: 12.5, color: '#6B818C', textAlign: 'center' }}>
            Nada preenchido ainda. Salve os dados acima e as linhas aparecem aqui.
          </div>
        ) : (
          <pre style={{ background: '#F7FAFB', border: '1px solid #DCE6EA', borderRadius: 9, padding: '13px 15px', margin: 0, overflowX: 'auto', fontFamily: MONO, fontSize: 12, lineHeight: 1.9, color: '#16232B' }}>
            {linhas.join('\n')}
          </pre>
        )}
      </div>
    </div>
  )
}
