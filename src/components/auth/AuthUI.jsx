import { useState } from 'react';

// (Copiado do Gestor Coppi, sem a foto da fábrica e a logo da Coppi: o painel mostra o ícone do app.)
//
// AS PEÇAS DA ILHA DE AUTENTICAÇÃO — o cartão, o painel de marca e o campo de label flutuante.
//
// É uma ILHA VISUAL DELIBERADA, e não um desvio: o `.btn-primary` do app é GRAFITE (`gray-800`) e o
// `.input` é a caixa com borda das telas internas; aqui a linguagem é o indigo do handoff 3a, com
// campos sem caixa. Por isso a paleta vive em valores arbitrários e nenhuma classe global entra.
//
// Elas moram FORA das páginas porque são DUAS as telas que as usam — o login e o "Defina sua senha",
// que é a segunda coisa que todo usuário novo vê. Duplicá-las entre as duas seria criar a divergência
// antes do primeiro commit, que é como o `Campo` do app acabou copiado em dois arquivos e o
// `CampoErro` em catorze.
//
// O handoff cita `components/Button` e `components/Input` como se existissem (README.md:15). Não
// existem — vale o app, e o que existe de verdade é reusado: o `Checkbox` (com `size="sm"`, que bate
// literalmente com o que ele descreve) e o `Spinner`.

const COR_TEXTO = '#2b2f52';
const COR_APOIO = '#6b7089';
const COR_REGUA = '#e3e5ee';
const COR_FOCO = '#2f5cff';

// Aviso de campo obrigatório vazio — substitui a bolha nativa do navegador (quadrada, vermelha) pela
// grafite do `Tooltip.jsx`, ancorada sob o campo. É o mesmo desenho copiado em catorze arquivos do
// app; aqui as duas telas ao menos compartilham uma cópia.
export function CampoErro({ show, texto = 'Preencha esse campo' }) {
  if (!show) return null;
  return (
    <div className="relative mt-1.5">
      <div className="absolute -top-[3px] left-2 h-2 w-2 rotate-45 rounded-[2px] bg-gray-800" />
      <div className="inline-block rounded-md bg-gray-800 px-2.5 py-1 text-xs font-medium text-white shadow-lg">{texto}</div>
    </div>
  );
}

// O olho da senha. É o PRIMEIRO do app — nenhum campo de senha tinha como revelar o conteúdo até
// aqui. O risco diagonal existe quando a senha está OCULTA e some quando ela aparece: o ícone mostra
// o que está acontecendo agora, não o que o clique fará.
export function IconOlhoSenha({ oculta }) {
  return (
    <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M1.7 12S5.5 5.5 12 5.5 22.3 12 22.3 12 18.5 18.5 12 18.5 1.7 12 1.7 12Z" />
      <circle cx="12" cy="12" r="3.2" />
      {oculta && <line x1="4" y1="20" x2="20" y2="4" />}
    </svg>
  );
}

// CAMPO COM LABEL FLUTUANTE.
//
// O estado é do REACT (`foco || valor.length > 0`) e não do CSS (`:not(:placeholder-shown)`, como no
// protótipo). O CSS puro funciona, mas o app já controla o valor — duas fontes de verdade para o
// mesmo estado é exatamente como elas divergem.
//
// A RÉGUA VIVE DENTRO DE UMA CAIXA DE ALTURA FIXA. Ela engorda de 1 para 1,5px ao focar, e se fosse
// o próprio elemento a crescer (ou um `border-bottom`), tudo abaixo dela desceria 0,5px a cada foco
// — é a regra registrada de que estado selecionado muda a COR, nunca a espessura da caixa. A caixa
// reserva 1,5px sempre; a linha cresce para baixo dentro dela.
export function CampoFlutuante({
  id, label, tipo = 'text', valor, onChange, erro, autoFocus, autoComplete, acessorio, dica,
  // Opcionais, para o campo do CÓDIGO da recuperação de senha: teclado numérico no celular e teto.
  inputMode, maxLength, textoErro,
}) {
  const [foco, setFoco] = useState(false);
  // O navegador preencheu sozinho? O `onChange` do React NÃO dispara quando o preenchimento
  // acontece sem um gesto na página, então `valor` continua vazio e o rótulo desceria por cima do
  // texto preenchido. O aviso chega pelas duas animações vazias que o `index.css` prende ao
  // `:-webkit-autofill` — é o único evento que o navegador dispara nesse momento.
  const [auto, setAuto] = useState(false);
  const flutua = foco || valor.length > 0 || auto;
  return (
    <div>
      <div className="relative">
        <label htmlFor={id}
          className="pointer-events-none absolute left-0 whitespace-nowrap"
          style={{
            top: flutua ? -15 : 11,
            fontSize: flutua ? 10.5 : 14,
            fontWeight: flutua ? 600 : 500,
            letterSpacing: flutua ? '.05em' : 0,
            textTransform: flutua ? 'uppercase' : 'none',
            color: COR_APOIO,
            transition: 'top .22s cubic-bezier(.2,.7,.3,1), font-size .22s cubic-bezier(.2,.7,.3,1), letter-spacing .22s',
          }}>
          {label}
        </label>
        {/* `campo-auth` é o gancho do `index.css` que mata o fundo azul do preenchimento automático
            do navegador — ver a regra `:-webkit-autofill` lá. */}
        <input id={id} type={tipo} value={valor} autoFocus={autoFocus} autoComplete={autoComplete}
          inputMode={inputMode} maxLength={maxLength}
          onChange={onChange} onFocus={() => setFoco(true)} onBlur={() => setFoco(false)}
          onAnimationStart={(e) => {
            if (e.animationName === 'autofill-liga') setAuto(true);
            else if (e.animationName === 'autofill-desliga') setAuto(false);
          }}
          className="campo-auth w-full bg-transparent py-[9px] text-[14px] leading-[21px] outline-none"
          style={{ color: COR_TEXTO, paddingRight: acessorio ? 30 : 0 }} />
        {acessorio}
        {/* A RÉGUA ATIVA É 2px, E NÃO 1,5 — é o que a faz cair na grade de pixels do dispositivo.
            Com 1,5 as duas réguas eram IDÊNTICAS no CSS e desenhavam diferente: num monitor de
            `devicePixelRatio` 1,5, a distância entre elas (65px) dava 97,5 device px, meia grade de
            defasagem, e o antialiasing repartia a tinta como `0,688+1+0,562` numa e `0,188+1+1+0,062`
            na outra — a de baixo lia como mais fina. Um valor PAR em CSS px é inteiro em device px
            nos DPRs comuns (1 → 2, 1,5 → 3, 2 → 4), e a distância virou 68 (ver o `gap` de quem
            chama): as duas passam a ter a mesma fase.
            A CAIXA de 2px é fixa: é ela que impede o conteúdo abaixo de descer ao focar. */}
        <div style={{ height: 2 }}>
          <div style={{
            height: flutua ? 2 : 1,
            background: flutua ? COR_FOCO : COR_REGUA,
            transition: 'background-color .2s ease-out, height .2s',
          }} />
        </div>
      </div>
      {dica && !erro && <div className="mt-1.5 text-[11px] text-hx-9aa0b8">{dica}</div>}
      <CampoErro show={erro} texto={textoErro} />
    </div>
  );
}

export const BOTAO_AUTH = 'w-full h-[48px] rounded-[6px] bg-hx-242850 hover:bg-hx-2e3364 text-white '
  + 'font-bold text-[14px] tracking-[0.01em] flex items-center justify-center gap-2 '
  + 'transition-colors duration-150 disabled:opacity-50 disabled:cursor-not-allowed';

// O PAINEL DE MARCA, em camadas — a ordem é o desenho, não arrumação:
//   gradiente (fundo do próprio painel) → escurecimento → grade de pontos → anéis → conteúdo.
export function PainelMarca({ largura = 456, children }) {
  return (
    <div className="relative hidden md:flex shrink-0 flex-col overflow-hidden"
      style={{
        width: largura,
        padding: largura >= 400 ? '52px 48px' : '38px 32px',
        isolation: 'isolate',
        background: 'linear-gradient(160deg,#31356b 0%,#242850 58%,#1c1f42 100%)',
      }}>
      <div className="pointer-events-none absolute inset-0"
        style={{ background: 'linear-gradient(to bottom,rgba(49,53,107,.45) 0%,rgba(40,44,86,.6) 22%,rgba(30,33,70,.92) 38%,#1c1f42 52%)' }} />
      <div className="pointer-events-none absolute inset-0"
        style={{ backgroundImage: 'radial-gradient(rgba(255,255,255,.09) 1.3px, transparent 1.3px)', backgroundSize: '24px 24px', opacity: 0.7 }} />
      <div className="pointer-events-none absolute rounded-full" style={{ top: -110, right: -110, width: 340, height: 340, border: '1.5px solid rgba(120,140,255,.22)' }} />
      <div className="pointer-events-none absolute rounded-full" style={{ top: -55, right: -55, width: 215, height: 215, border: '1.5px solid rgba(120,140,255,.16)' }} />

      <div className="relative flex items-center gap-3">
        <img src={`${import.meta.env.BASE_URL}icon.svg`} alt="" className="h-[44px] w-[44px] rounded-[10px]" />
        <span className="text-[17px] font-bold tracking-[-0.01em] text-white">Meus Gastos</span>
      </div>
      {children}
    </div>
  );
}

// O cartão. Raio 8 (era 28) e a mesma sombra de sempre.
export function CartaoAuth({ children, alturaMin = 648 }) {
  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-hx-f4f5f9 px-[14px] py-[28px]">
      <div className="flex w-full max-w-[1080px] overflow-hidden rounded-[8px] bg-white"
        style={{ boxShadow: '0 34px 90px -36px rgba(30,34,80,.4)', minHeight: alturaMin }}>
        {children}
      </div>
    </div>
  );
}
