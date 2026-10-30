// ============================================================================
// boleto.js — seção "Boleto em até 24x" (#boleto) e barra de aviso do topo
// ----------------------------------------------------------------------------
// Tudo aqui é opcional para o conteúdo: o HTML já traz o estado final (cadeado
// aberto, R$ 0, datas genéricas), então sem JavaScript — ou com a preferência
// de menos movimento — a seção aparece completa e estática. O JS só:
//   • preenche as datas reais (hoje, +30, +60 dias) e roda as animações;
//   • monta passos e chips a partir do site-config.js;
//   • liga o CTA do WhatsApp com a parcela escolhida e o evento do Analytics.
// Nenhum valor de parcela ou juros é calculado: a simulação é no atendimento.
// ============================================================================

import { siteConfig, linkWhatsapp, mensagemBoleto } from "./site-config.js";
import { escapeHtml } from "./produtos-utils.js";

const semMovimento = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const CHAVE_BARRA = "tc_promo_boleto_fechada";

// ---------------------------------------------------------------------------
// Datas (sempre calculadas a partir de `new Date()`, nunca fixas)
// ---------------------------------------------------------------------------
const doisDigitos = (n) => String(n).padStart(2, "0");

/**
 * Soma dias pelo calendário local. Usar `new Date(a, m, d + n)` deixa o próprio
 * JavaScript resolver a virada de mês/ano (e o horário de verão), o que somar
 * milissegundos não garante.
 */
function somarDias(data, dias) {
  return new Date(data.getFullYear(), data.getMonth(), data.getDate() + dias);
}

const ddmm = (data) => `${doisDigitos(data.getDate())}/${doisDigitos(data.getMonth() + 1)}`;

// Meses e dias da semana em português, mesmo em navegador configurado em outro idioma.
const porExtenso = new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "numeric", month: "long" });

let diaPreenchido = "";

function preencherDatas(secao) {
  const hoje = new Date();
  const chave = hoje.toDateString();
  if (chave === diaPreenchido) return;
  diaPreenchido = chave;

  const total = siteConfig.boleto.diasPrimeiraParcela;
  const marcos = [0, Math.round(total / 2), total];

  secao.querySelectorAll("[data-marco]").forEach((el) => {
    el.textContent = ddmm(somarDias(hoje, marcos[Number(el.dataset.marco)]));
  });
  const rotulos = secao.querySelectorAll("[data-marco-rotulo]");
  rotulos.forEach((el) => {
    const dias = marcos[Number(el.dataset.marcoRotulo)];
    el.textContent = dias === 0 ? "Hoje" : `${dias} dias`;
  });
  secao.querySelectorAll("[data-boleto-dias]").forEach((el) => (el.textContent = total));

  const final = somarDias(hoje, total);
  const elFinal = secao.querySelector("[data-parcela-data]");
  if (elFinal) elFinal.textContent = ddmm(final);
  const elExtenso = secao.querySelector("[data-parcela-extenso]");
  if (elExtenso) elExtenso.textContent = porExtenso.format(final);
}

// ---------------------------------------------------------------------------
// Passos e chips (vêm do site-config.js)
// ---------------------------------------------------------------------------
function renderizarPassos(secao) {
  const lista = secao.querySelector("#boletoPassos");
  if (!lista) return;

  lista.innerHTML = siteConfig.boleto.passos
    .map(
      (p, i) => `<li class="passos__item">
          <span class="passos__ico"><svg class="icon" aria-hidden="true"><use href="#i-${escapeHtml(p.icone)}"></use></svg><b>${i + 1}</b></span>
          <div><h4>${escapeHtml(p.titulo)}</h4><p>${escapeHtml(p.texto)}</p></div>
        </li>`
    )
    .join("");

  const docs = siteConfig.boleto.documentos || [];
  const elDocs = secao.querySelector("#boletoDocs");
  if (elDocs) {
    elDocs.hidden = docs.length === 0;
    elDocs.querySelector("ul").innerHTML = docs.map((d) => `<li>${escapeHtml(d)}</li>`).join("");
  }
}

function iniciarChips(secao) {
  const grupo = secao.querySelector("#boletoChips");
  const cta = secao.querySelector("#boletoCta");
  if (!grupo || !cta) return;

  let parcelas = siteConfig.boleto.parcelasPadrao;

  const aplicar = () => {
    grupo.querySelectorAll(".chip").forEach((chip) => {
      const ativo = Number(chip.dataset.parcelas) === parcelas;
      chip.setAttribute("aria-checked", String(ativo));
      chip.tabIndex = ativo ? 0 : -1;
    });
    cta.href = linkWhatsapp(mensagemBoleto(parcelas));
  };

  grupo.innerHTML = siteConfig.boleto.parcelas
    .map((n) => `<button class="chip" type="button" role="radio" data-parcelas="${n}">${n}x</button>`)
    .join("");

  grupo.addEventListener("click", (e) => {
    const chip = e.target.closest(".chip");
    if (!chip) return;
    parcelas = Number(chip.dataset.parcelas);
    aplicar();
  });

  // Setas movem a seleção, como em qualquer grupo de rádio.
  grupo.addEventListener("keydown", (e) => {
    const opcoes = siteConfig.boleto.parcelas;
    const i = opcoes.indexOf(parcelas);
    let novo = i;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") novo = Math.min(i + 1, opcoes.length - 1);
    else if (e.key === "ArrowLeft" || e.key === "ArrowUp") novo = Math.max(i - 1, 0);
    else return;
    e.preventDefault();
    parcelas = opcoes[novo];
    aplicar();
    grupo.querySelector(`[data-parcelas="${parcelas}"]`)?.focus();
  });

  cta.addEventListener("click", () => {
    // O que mais converte: o evento leva a parcela escolhida.
    if (typeof window.gtag === "function") {
      window.gtag("event", "quero_no_boleto", {
        event_category: "boleto",
        event_label: `${parcelas}x`,
        parcelas,
      });
    }
  });

  aplicar();
}

// ---------------------------------------------------------------------------
// Observadores: animar só quando aparece, pausar quando sai
// ---------------------------------------------------------------------------
/** Chama `aoMudar(visivel)` sempre que o elemento entra ou sai da tela. */
function observar(el, aoMudar, threshold = 0) {
  if (!el) return;
  const obs = new IntersectionObserver(
    (entradas) => entradas.forEach((e) => aoMudar(e.isIntersecting)),
    { threshold }
  );
  obs.observe(el);
}

/** Dispara `acao` uma única vez, na primeira vez que o elemento aparece. */
function umaVez(el, acao, threshold = 0.5) {
  if (!el) return;
  const obs = new IntersectionObserver(
    (entradas) => {
      if (!entradas.some((e) => e.isIntersecting)) return;
      obs.disconnect();
      acao();
    },
    { threshold }
  );
  obs.observe(el);
}

const suave = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const desacelera = (t) => 1 - Math.pow(1 - t, 3);

/** Roda `passo(t)` com t de 0 a 1 durante `duracao` ms. */
function animar(duracao, passo, fim) {
  const inicio = performance.now();
  const quadro = (agora) => {
    const t = Math.min(1, (agora - inicio) / duracao);
    passo(t);
    if (t < 1) requestAnimationFrame(quadro);
    else fim?.();
  };
  requestAnimationFrame(quadro);
}

// ---- Entrada: R$ 1.500 → R$ 0 ----------------------------------------------
function animarEntrada(secao) {
  const num = secao.querySelector("#entradaNum");
  const selo = secao.querySelector("#entradaSelo");
  if (!num) return;

  const ponto = 1500;
  const formatar = (v) => `R$ ${Math.round(v).toLocaleString("pt-BR")}`;
  num.textContent = formatar(ponto);

  umaVez(num.closest(".b-card"), () => {
    animar(
      1400,
      (t) => (num.textContent = formatar(ponto * (1 - desacelera(t)))),
      () => {
        num.textContent = "R$ 0";
        selo?.classList.add("is-pulso");
      }
    );
  });
}

// ---- Linha do tempo: hoje → +60 dias -------------------------------------------
function animarCalendario(secao) {
  const cal = secao.querySelector("#boletoCal");
  const trilho = secao.querySelector(".tl__trilho");
  const fill = secao.querySelector(".tl__fill");
  const dot = secao.querySelector(".tl__dot");
  if (!cal || !trilho || !fill || !dot) return;

  const ticks = [...cal.querySelectorAll(".tl__tick")];

  // Estado inicial da animação: tudo recolhido. Sem isto (JS desligado ou
  // menos movimento) o CSS já mostra a linha completa e a data final.
  cal.classList.add("is-anim");
  ticks.forEach((tick) => tick.classList.remove("is-hit"));
  dot.style.left = "0";
  fill.style.transform = "scaleX(0)";

  umaVez(cal, () => {
    const largura = trilho.offsetWidth;
    animar(
      2600,
      (t) => {
        const p = suave(t);
        fill.style.transform = `scaleX(${p})`;
        dot.style.transform = `translateX(${p * largura}px)`;
        ticks.forEach((tick, i) => {
          if (p >= i / (ticks.length - 1) - 0.001) tick.classList.add("is-hit");
        });
      },
      () => {
        // Devolve o ponto ao CSS (left: 100%) para acompanhar rotação de tela.
        dot.style.left = "";
        dot.style.transform = "";
        fill.style.transform = "";
        cal.classList.add("is-done");
      }
    );
  }, 0.6);
}

// ---------------------------------------------------------------------------
// Barra fina do topo (dispensável, lembra a escolha)
// ---------------------------------------------------------------------------
function iniciarBarra() {
  const botao = document.getElementById("promoFechar");
  if (!botao) return;
  botao.addEventListener("click", () => {
    document.documentElement.classList.remove("has-promo");
    try {
      localStorage.setItem(CHAVE_BARRA, "1");
    } catch {
      /* modo privado / storage bloqueado: some só nesta visita */
    }
  });
}

// ---------------------------------------------------------------------------
export function iniciarBoleto() {
  iniciarBarra();

  const secao = document.getElementById("boleto");
  if (!secao) return;

  const legal = secao.querySelector(".boleto__legal");
  if (legal && siteConfig.boleto.aviso) legal.textContent = siteConfig.boleto.aviso;

  renderizarPassos(secao);
  iniciarChips(secao);
  preencherDatas(secao);

  // Passou da meia-noite com a aba aberta: refaz as datas ao voltar.
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) preencherDatas(secao);
  });

  if (semMovimento()) return;
  if (!("IntersectionObserver" in window)) {
    secao.classList.add("is-ativa");
    return;
  }

  // Loops (cadeado, ondas do sinal) só rodam com a seção na tela.
  observar(secao, (visivel) => secao.classList.toggle("is-ativa", visivel));

  animarEntrada(secao);
  animarCalendario(secao);
}
