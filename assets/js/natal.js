// ============================================================================
// natal.js — tema de Natal das páginas públicas
// ----------------------------------------------------------------------------
// Par do natal.css. Só faz alguma coisa quando o <body> tem a classe
// `tema-natal`: sem ela este arquivo sai na primeira linha e o site fica
// exatamente como era. Não depende de nenhum outro módulo do site.
//
// O que ele liga:
//   • neve caindo num <canvas> (atrás do conteúdo, sem receber toques);
//   • enfeites do hero (galho de pinheiro, bolas, estrelas, flocos);
//   • o brilho que corre pelos títulos dourados;
//   • a contagem regressiva do sorteio e a troca automática de texto depois
//     que ele acontece;
//   • a entrada dos blocos do tema ao rolar e a pausa das animações que
//     saíram da tela.
//
// O conteúdo (faixa, seção do sorteio, prêmios) está no HTML, marcado com
// `data-natal`. A data do sorteio é lida do atributo `data-sorteio` da seção
// #sorteio — para mudar a data, mude lá.
// ============================================================================

const corpo = document.body;

if (corpo.classList.contains("tema-natal")) iniciar();

function iniciar() {
  const semMovimento = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const temObservador = "IntersectionObserver" in window;

  // A barra do navegador acompanha a faixa vermelha do topo.
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", "#7D0F17");

  injetarSimbolos();
  enfeitarHero();
  iniciarSorteio();

  if (semMovimento) return; // quem pediu menos movimento fica só com o visual

  iniciarBrilho();
  if (temObservador) {
    // Só agora o CSS pode esconder os blocos para animar a entrada: se algo
    // acima falhar, a classe nunca entra e nada fica invisível.
    corpo.classList.add("natal-js");
    iniciarEntradas();
    pausarForaDaTela();
  }
  iniciarNeve();
}

// ---------------------------------------------------------------------------
// Símbolos SVG do tema
// ---------------------------------------------------------------------------
// Ficam aqui (e não no HTML) para as duas páginas compartilharem os mesmos
// desenhos sem repetir marcação.
function injetarSimbolos() {
  const NS = "http://www.w3.org/2000/svg";
  const sprite = document.createElementNS(NS, "svg");
  sprite.setAttribute("aria-hidden", "true");
  sprite.style.display = "none";
  sprite.innerHTML = `
    <symbol id="natal-estrela" viewBox="0 0 24 24"><path fill="currentColor" d="M12 0c1 7 5 11 12 12-7 1-11 5-12 12-1-7-5-11-12-12 7-1 11-5 12-12Z"/></symbol>
    <symbol id="natal-floco" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M12 2v20M3.3 7l17.4 10M3.3 17l17.4-10M12 5.5l-2-2M12 5.5l2-2M12 18.5l-2 2M12 18.5l2 2M6.4 8.8l-2.7-.7M6.4 8.8l-.7-2.7M17.6 15.2l2.7.7M17.6 15.2l.7 2.7M6.4 15.2l-2.7.7M6.4 15.2l-.7 2.7M17.6 8.8l2.7-.7M17.6 8.8l.7-2.7"/></symbol>
    <defs><g id="natal-agulhas" fill="none" stroke-linecap="round" stroke-width="2.3"><path d="M0 0l17-9M0 0l19-3M0 0l19 4M0 0l16 10M0 0l9-14M0 0l8 15M0 0l-1-15M0 0l-2 15"/></g></defs>`;
  corpo.prepend(sprite);
}

// ---------------------------------------------------------------------------
// Enfeites do hero
// ---------------------------------------------------------------------------
/** Galho de pinheiro com três bolas penduradas (balançam pelo CSS). */
function galhoSvg(classe) {
  // Tufos de agulhas ao longo do ramo: [x, y, ângulo, tom].
  const tufos = [
    [200, 7.5, 177, 0], [184, 9.7, 175, 1], [170, 12.4, 172, 0], [154, 16.3, 169, 1],
    [140, 20.4, 166, 0], [123.5, 26, 163, 1], [109, 31.6, 160, 0], [93, 38.8, 157, 1],
    [79, 46, 154, 0], [63, 54.8, 151, 1], [48.6, 63.4, 148, 0], [32, 74, 146, 1], [20, 83, 144, 0],
  ];
  const tons = ["#0F4D36", "#1F7A4D"];

  // Bolas: [x do fio, y do fio, comprimento, raio, cor clara, cor, cor escura].
  const bolas = [
    [140, 21, 34, 11, "#FF8A91", "#D92B38", "#8E1420"],
    [79, 46, 26, 9.5, "#FFF1B8", "#E3C04D", "#A8821A"],
    [176, 11, 22, 7.5, "#8FE0B4", "#28A866", "#0F5C36"],
  ];

  return `<svg class="natal-galho ${classe}" viewBox="0 0 220 112" aria-hidden="true">
    <defs>
      ${bolas
        .map(
          (b, i) => `<radialGradient id="natal-bola-${classe}-${i}" cx="34%" cy="30%" r="75%">
            <stop offset="0" stop-color="${b[4]}"/><stop offset=".45" stop-color="${b[5]}"/><stop offset="1" stop-color="${b[6]}"/>
          </radialGradient>`
        )
        .join("")}
    </defs>
    <path d="M222 5Q120 9 16 86" fill="none" stroke="#4A3220" stroke-width="3" stroke-linecap="round"/>
    ${tufos
      .map(
        ([x, y, ang, tom]) =>
          `<use href="#natal-agulhas" stroke="${tons[tom]}" transform="translate(${x} ${y}) rotate(${ang}) scale(${tom ? 1 : 1.25})"/>`
      )
      .join("")}
    ${bolas
      .map(([x, y, fio, r], i) => {
        const cy = y + fio + r;
        return `<g class="natal-pendente" style="transform-origin:${x}px ${y}px">
          <path d="M${x} ${y}v${fio}" stroke="rgba(255,255,255,.6)" stroke-width="1"/>
          <rect x="${x - 3}" y="${y + fio - 3.5}" width="6" height="5" rx="1.2" fill="#E3C04D"/>
          <circle cx="${x}" cy="${cy}" r="${r}" fill="url(#natal-bola-${classe}-${i})"/>
          <ellipse cx="${x - r * 0.32}" cy="${cy - r * 0.36}" rx="${r * 0.22}" ry="${r * 0.32}" fill="#fff" opacity=".55"/>
        </g>`;
      })
      .join("")}
  </svg>`;
}

function enfeitarHero() {
  // Estrelas e flocos espalhados: [tipo, topo %, esquerda %, tamanho px, duração s, atraso s].
  const faiscas = [
    ["estrela", 9, 6, 13, 2.4, 0],
    ["floco", 22, 88, 18, 3.4, -1.1],
    ["estrela", 37, 94, 10, 2.8, -0.6],
    ["estrela", 56, 3, 9, 3.1, -1.8],
    ["floco", 70, 90, 15, 3.8, -0.3],
    ["estrela", 82, 12, 12, 2.6, -1.4],
  ];

  document.querySelectorAll(".hero, .page-hero").forEach((secao) => {
    const camada = document.createElement("div");
    camada.className = "natal-enfeites";
    camada.setAttribute("aria-hidden", "true");
    camada.innerHTML =
      galhoSvg("natal-galho--dir") +
      galhoSvg("natal-galho--esq") +
      faiscas
        .map(
          ([tipo, topo, esq, tam, dur, atraso]) =>
            `<svg class="natal-faisca natal-faisca--${tipo}" style="top:${topo}%;left:${esq}%;--t:${tam}px;--d:${dur}s;--a:${atraso}s"><use href="#natal-${tipo}"></use></svg>`
        )
        .join("");
    secao.prepend(camada);
  });
}

// ---------------------------------------------------------------------------
// Brilho correndo pelos títulos dourados
// ---------------------------------------------------------------------------
// Duas camadas por cima do texto: uma "janela" que atravessa da esquerda para
// a direita e, dentro dela, uma cópia branca do texto que anda no sentido
// contrário na mesma velocidade — então a cópia fica parada no lugar e só
// aparece onde a janela está. O resultado é um reflexo passando pelas letras
// usando apenas `transform`.
function iniciarBrilho() {
  document.querySelectorAll("[data-brilho]").forEach((el) => {
    const janela = document.createElement("span");
    janela.className = "natal-brilho__janela";
    janela.setAttribute("aria-hidden", "true");

    const copia = document.createElement("span");
    copia.className = "natal-brilho__copia";
    copia.textContent = el.textContent;

    janela.append(copia);
    el.append(janela);
  });
}

// ---------------------------------------------------------------------------
// Sorteio: contagem regressiva e estado "já aconteceu"
// ---------------------------------------------------------------------------
const TEXTO_FIM = "Sorteio realizado! Confira o resultado no nosso Instagram";

function iniciarSorteio() {
  const secao = document.getElementById("sorteio");
  // A data mora no HTML da home. Nas outras páginas (que só têm a faixa do
  // topo) vale esta mesma data de reserva.
  const alvo = new Date(secao?.dataset.sorteio || "2026-12-24T18:00:00-03:00").getTime();
  if (Number.isNaN(alvo)) return;

  const campos = {};
  secao?.querySelectorAll("[data-cd]").forEach((el) => (campos[el.dataset.cd] = el));
  const elFalta = document.querySelectorAll("[data-natal-falta]");
  let encerrado = false;
  let relogio = null;

  const doisDigitos = (n) => String(n).padStart(2, "0");

  function escrever(el, texto) {
    if (!el || el.textContent === texto) return;
    el.textContent = texto;
    // Reinicia a animação de troca do dígito (só transform/opacity).
    el.classList.remove("natal-troca");
    void el.offsetWidth;
    el.classList.add("natal-troca");
  }

  function encerrar() {
    if (encerrado) return;
    encerrado = true;
    clearInterval(relogio);

    document.querySelectorAll("[data-natal-faixa]").forEach((el) => {
      el.textContent = `🎄 ${TEXTO_FIM}`;
    });
    elFalta.forEach((el) => (el.textContent = "Sorteio realizado — veja o resultado"));
    document.querySelectorAll("[data-natal-chamada]").forEach((el) => {
      el.textContent = "Confira o resultado no nosso Instagram";
    });

    if (!secao) return;
    secao.classList.add("is-encerrado");
    // A contagem, a regra e o "Quero participar" saem; entra o aviso.
    secao.querySelectorAll("[data-antes-do-sorteio]").forEach((el) => (el.hidden = true));
    secao.querySelectorAll("[data-depois-do-sorteio]").forEach((el) => (el.hidden = false));
  }

  function atualizar() {
    const resta = alvo - Date.now();
    if (resta <= 0) {
      encerrar();
      return;
    }

    const seg = Math.floor(resta / 1000);
    const dias = Math.floor(seg / 86400);
    escrever(campos.dias, String(dias));
    escrever(campos.horas, doisDigitos(Math.floor((seg % 86400) / 3600)));
    escrever(campos.min, doisDigitos(Math.floor((seg % 3600) / 60)));
    escrever(campos.seg, doisDigitos(seg % 60));

    const falta =
      dias > 1 ? `Faltam ${dias} dias para o sorteio` : dias === 1 ? "Falta 1 dia para o sorteio" : "O sorteio é hoje, às 18h!";
    elFalta.forEach((el) => {
      if (el.textContent !== falta) el.textContent = falta;
    });
  }

  atualizar();
  if (encerrado) return;

  // O relógio só bate com a seção na tela e a aba visível — fora disso ele
  // para, e ao voltar recalcula a partir da hora real (nunca "atrasa").
  let naTela = !secao || !("IntersectionObserver" in window);
  const ajustar = () => {
    clearInterval(relogio);
    relogio = null;
    if (encerrado) return;
    atualizar();
    if (!encerrado && naTela && !document.hidden) relogio = setInterval(atualizar, 1000);
  };

  if (secao && "IntersectionObserver" in window) {
    new IntersectionObserver((entradas) => {
      naTela = entradas.some((e) => e.isIntersecting);
      ajustar();
    }).observe(secao);
  }
  document.addEventListener("visibilitychange", ajustar);
  ajustar();

  // Analytics: quem tocou em "Quero participar".
  secao?.querySelector("[data-sorteio-cta]")?.addEventListener("click", () => {
    if (typeof window.gtag === "function") {
      window.gtag("event", "quero_participar_sorteio", { event_category: "natal" });
    }
  });
}

// ---------------------------------------------------------------------------
// Entrada ao rolar + pausa do que saiu da tela
// ---------------------------------------------------------------------------
function iniciarEntradas() {
  const observador = new IntersectionObserver(
    (entradas, obs) => {
      entradas.forEach((entrada) => {
        if (!entrada.isIntersecting) return;
        entrada.target.classList.add("natal-visivel");
        obs.unobserve(entrada.target); // anima uma vez só
      });
    },
    { threshold: 0.15, rootMargin: "0px 0px -40px 0px" }
  );
  document.querySelectorAll("[data-natal-anim]").forEach((el) => observador.observe(el));
}

/** Seção fora da tela = animações dela congeladas (ver `.natal-pausa` no CSS). */
function pausarForaDaTela() {
  const observador = new IntersectionObserver(
    (entradas) => {
      entradas.forEach((e) => e.target.classList.toggle("natal-pausa", !e.isIntersecting));
    },
    { rootMargin: "80px 0px" }
  );
  document.querySelectorAll("main > section, .footer").forEach((el) => observador.observe(el));
}

// ---------------------------------------------------------------------------
// Neve
// ---------------------------------------------------------------------------
// Um canvas fixo cobrindo a tela, atrás do conteúdo. Pensado para Android
// intermediário: poucos flocos no celular (menos ainda em aparelho fraco),
// densidade de pixels limitada, ~30 quadros por segundo e parado sempre que a
// aba não está visível.
function iniciarNeve() {
  const canvas = document.createElement("canvas");
  canvas.className = "natal-neve";
  canvas.setAttribute("aria-hidden", "true");
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  corpo.prepend(canvas);

  const celular = window.matchMedia("(max-width: 899px)").matches;
  const fraco = (navigator.hardwareConcurrency || 4) <= 4 || (navigator.deviceMemory || 4) < 4;
  const QUANTOS = celular ? (fraco ? 14 : 24) : 60;
  const INTERVALO = 1000 / 30;

  let largura = 0;
  let altura = 0;
  let flocos = [];
  let quadro = null;
  let ultimo = 0;

  const novoFloco = (noTopo) => {
    const profundidade = Math.random(); // 0 = longe (pequeno e lento), 1 = perto
    return {
      x: Math.random() * largura,
      y: noTopo ? -8 : Math.random() * altura,
      r: 1.1 + profundidade * 2.3,
      v: 16 + profundidade * 34, // px por segundo
      fase: Math.random() * Math.PI * 2,
      balanco: 6 + Math.random() * 14,
      alfa: 0.5 + profundidade * 0.45,
    };
  };

  function dimensionar() {
    const l = window.innerWidth;
    const a = window.innerHeight;
    // No celular a altura muda toda vez que a barra de endereço some/aparece:
    // ignorar variações pequenas evita recriar o canvas durante a rolagem.
    if (l === largura && Math.abs(a - altura) < 140) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    largura = l;
    altura = a + 140; // folga para a barra de endereço que encolhe
    canvas.width = Math.round(largura * dpr);
    canvas.height = Math.round(altura * dpr);
    canvas.style.height = `${altura}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    flocos = Array.from({ length: QUANTOS }, () => novoFloco(false));
  }

  function desenhar(agora) {
    quadro = requestAnimationFrame(desenhar);
    const passou = agora - ultimo;
    if (passou < INTERVALO) return;
    ultimo = agora;
    const dt = Math.min(passou, 80) / 1000; // aba voltou? nada de salto

    ctx.clearRect(0, 0, largura, altura);
    // Azul-gelo: aparece sobre as faixas escuras e fica discreto nas claras,
    // sem atrapalhar a leitura.
    ctx.fillStyle = "#CFDDEE";

    for (let i = 0; i < flocos.length; i++) {
      const f = flocos[i];
      f.y += f.v * dt;
      f.fase += dt * 0.9;
      if (f.y > altura + 8) flocos[i] = novoFloco(true);

      ctx.globalAlpha = f.alfa;
      ctx.beginPath();
      ctx.arc(f.x + Math.sin(f.fase) * f.balanco, f.y, f.r, 0, 6.2832);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  const ligar = () => {
    if (quadro === null && !document.hidden) {
      ultimo = performance.now();
      quadro = requestAnimationFrame(desenhar);
    }
  };
  const desligar = () => {
    if (quadro !== null) cancelAnimationFrame(quadro);
    quadro = null;
  };

  let espera = null;
  window.addEventListener(
    "resize",
    () => {
      clearTimeout(espera);
      espera = setTimeout(dimensionar, 200);
    },
    { passive: true }
  );
  document.addEventListener("visibilitychange", () => (document.hidden ? desligar() : ligar()));

  dimensionar();
  ligar();
}
