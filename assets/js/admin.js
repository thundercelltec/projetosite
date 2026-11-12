// ============================================================================
// admin.js — painel administrativo da Thunder Cell
// ----------------------------------------------------------------------------
// Cadastro, edição e remoção dos produtos do catálogo.
//
// Segurança: quem realmente impede escrita sem login são as REGRAS do Realtime
// Database (veja o README) — este login só decide se a interface aparece.
// Um visitante esperto pode até abrir esta página; sem estar autenticado, o
// Firebase recusa qualquer gravação.
//
// Fotos: enviadas direto do navegador para o Cloudinary com um upload preset
// "unsigned" — nenhum servidor nosso no caminho.
// ============================================================================

import {
  initializeApp,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getDatabase,
  ref,
  onValue,
  push,
  set,
  update,
  remove,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";
import {
  getAuth,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

import { firebaseConfig, DB_PATHS, firebaseConfigurado } from "./firebase-config.js";
import {
  imageConfig,
  cloudinaryConfigurado,
  otimizarUrl,
  miniaturaUrl,
  urlSemFundo,
} from "./image-config.js";
import {
  escapeHtml,
  formatarBRL,
  normalizarProduto,
  ordenarProdutos,
  categoriaDoStatus,
  camposLegadosDeStatus,
  camposDePreco,
  STATUS_ESTOQUE,
  ROTULO_STATUS_ESTOQUE,
} from "./produtos-utils.js";

// ---------------------------------------------------------------------------
// Atalhos e utilidades
// ---------------------------------------------------------------------------
const $ = (id) => document.getElementById(id);

const elToasts = $("toasts");

function toast(mensagem, tipo = "info") {
  const el = document.createElement("div");
  el.className = `toast toast--${tipo}`;
  el.textContent = mensagem;
  elToasts.appendChild(el);
  setTimeout(() => {
    el.style.transition = "opacity .3s ease";
    el.style.opacity = "0";
    setTimeout(() => el.remove(), 320);
  }, 4000);
}

function icone(nome) {
  return `<svg class="icon" aria-hidden="true"><use href="#i-${nome}"></use></svg>`;
}

/**
 * Aceita "1234", "1234,50", "1.234,50", "1.234" e "1234.50".
 * Formato brasileiro: vírgula é o decimal e ponto é o milhar. O ponto só conta
 * como decimal quando não há vírgula E ele não está na posição de milhar
 * ("1234.50" → 1234,50; já "1.500" → mil e quinhentos, que é o que a loja quer
 * dizer quando digita assim).
 */
function parsePreco(texto) {
  const limpo = String(texto ?? "").trim().replace(/[^\d.,-]/g, "");
  if (!limpo) return NaN;
  const temVirgula = limpo.includes(",");
  const soMilhar = /^\d{1,3}(\.\d{3})+$/.test(limpo);
  const normalizado = temVirgula
    ? limpo.replace(/\./g, "").replace(",", ".")
    : soMilhar
      ? limpo.replace(/\./g, "")
      : limpo;
  return Number(normalizado);
}

/** 1500 → "1.500,00" — o valor como aparece dentro do campo (o "R$" é o prefixo). */
function precoParaCampo(valor) {
  const n = Number(valor);
  if (!Number.isFinite(n) || n <= 0) return "";
  return n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/**
 * Formata o campo de preço ao sair dele: digitou "1500", vira "1.500,00".
 * Formatar só no blur (e não a cada tecla) deixa a pessoa digitar do jeito que
 * quiser, sem o cursor pular. Texto que não é número fica como está, para a
 * validação do envio apontar o erro.
 */
function ligarCampoDePreco(id) {
  const campo = $(id);
  campo.addEventListener("blur", () => {
    const n = parsePreco(campo.value);
    if (Number.isFinite(n) && n > 0) campo.value = precoParaCampo(n);
  });
}

function marcarErro(campoId, mensagem) {
  const campo = $(campoId);
  const p = campo.querySelector(".campo__erro");
  if (mensagem) {
    campo.classList.add("campo--erro");
    p.textContent = mensagem;
    p.hidden = false;
  } else {
    campo.classList.remove("campo--erro");
    p.hidden = true;
  }
}

function limparErros() {
  ["campoModelo", "campoPreco", "campoPrecoPrazo", "campoFotos"].forEach((id) => marcarErro(id, ""));
}

// ---------------------------------------------------------------------------
// Avisos de configuração pendente
// ---------------------------------------------------------------------------
function mostrarAvisosDeSetup() {
  const avisos = [];

  if (!firebaseConfigurado()) {
    avisos.push(
      `<strong>Firebase não configurado.</strong> Cole as chaves do seu projeto em <code>assets/js/firebase-config.js</code>. Sem isso, nada é salvo.`
    );
  }
  if (!cloudinaryConfigurado()) {
    avisos.push(
      `<strong>Cloudinary não configurado.</strong> Cole o cloud name e o upload preset em <code>assets/js/image-config.js</code> para conseguir enviar fotos.`
    );
  }

  $("avisos").innerHTML = avisos
    .map((texto) => `<div class="aviso">${icone("alert")}<span>${texto}</span></div>`)
    .join("");
}

// ---------------------------------------------------------------------------
// Firebase
// ---------------------------------------------------------------------------
// Sem config válida não dá nem para inicializar o SDK — nesse caso mostramos
// só o aviso de setup, em vez de estourar um erro incompreensível no console.
let db = null;
let auth = null;

if (firebaseConfigurado()) {
  const app = initializeApp(firebaseConfig);
  db = getDatabase(app);
  auth = getAuth(app);
}

// ---------------------------------------------------------------------------
// Login
// ---------------------------------------------------------------------------
const telaCarregando = $("telaCarregando");
const telaLogin = $("telaLogin");
const painel = $("painel");

function mostrar(qual) {
  telaCarregando.hidden = qual !== "carregando";
  telaLogin.hidden = qual !== "login";
  painel.hidden = qual !== "painel";
}

// A ligação com o onAuthStateChanged fica no FIM do arquivo, em
// `observarSessao()`. O callback pode disparar de imediato (sessão já em
// cache) e ele chama `iniciarPainel()`, que depende de `let`/`const`
// declarados mais abaixo — registrar aqui em cima quebraria por TDZ.

$("formLogin").addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!auth) return;

  const btn = $("btnLogin");
  const erro = $("loginErro");
  erro.hidden = true;
  btn.disabled = true;
  btn.textContent = "Entrando…";

  try {
    await signInWithEmailAndPassword(auth, $("email").value.trim(), $("senha").value);
    // onAuthStateChanged assume a partir daqui.
  } catch (err) {
    console.error("Erro no login:", err.code || err);
    erro.textContent =
      err.code === "auth/too-many-requests"
        ? "Muitas tentativas. Aguarde alguns minutos e tente de novo."
        : "E-mail ou senha incorretos.";
    erro.hidden = false;
  } finally {
    btn.disabled = false;
    btn.textContent = "Entrar";
  }
});

$("btnSair").addEventListener("click", () => {
  if (auth) signOut(auth);
});

// ---------------------------------------------------------------------------
// Estado do painel
// ---------------------------------------------------------------------------
/** Registros crus vindos do Firebase, por id (guardam também `observacoes`). */
let brutos = {};
/** Lista normalizada para exibição — inclui os inativos. */
let produtos = [];
/** Id em edição; null quando o formulário é de cadastro novo. */
let editandoId = null;

let painelIniciado = false;

function iniciarPainel() {
  if (painelIniciado || !db) return;
  painelIniciado = true;

  onValue(
    ref(db, DB_PATHS.produtos),
    (snap) => {
      brutos = snap.val() || {};
      produtos = ordenarProdutos(
        Object.entries(brutos)
          .map(([id, bruto]) => normalizarProduto(id, bruto))
          .filter(Boolean)
      );
      renderizarLista();
      migrarStatusEstoque();
      migrarPrecos();
    },
    (erro) => {
      console.error("Erro ao ler produtos:", erro);
      $("lista").innerHTML = listaVaziaHtml(
        "Não foi possível carregar",
        "Verifique sua conexão e as regras do Realtime Database."
      );
    }
  );

  // Galerias de configuração. `definirSalvo` não pisa numa edição em
  // andamento — só sincroniza quando a tela está igual ao que está salvo.
  [
    [DB_PATHS.heroFotos, galeriaHero, "banner"],
    [DB_PATHS.instagram, galeriaInstagram, "Instagram"],
  ]
    // Um caminho ausente no firebase-config.js viraria `ref(db, undefined)` e
    // derrubaria a escuta inteira. Melhor pular a galeria e seguir.
    .filter(([caminho, , nome]) => {
      if (caminho) return true;
      console.warn(`Caminho do ${nome} não definido em DB_PATHS — galeria desativada.`);
      return false;
    })
    .forEach(([caminho, galeria, nome]) => {
    onValue(
      ref(db, caminho),
      (snap) => galeria.definirSalvo(snap.val()),
      (erro) => {
        console.error(`Erro ao ler o ${nome}:`, erro);
        galeria.renderizar();
      }
    );
  });
}

// ---------------------------------------------------------------------------
// Migração para `status_estoque`
// ---------------------------------------------------------------------------
// Antes desta versão o estado do produto morava em dois booleanos separados
// (`ativo` + `emEstoque`). Ler os dois continua funcionando — `statusEstoqueDe`
// deriva o estado novo a partir deles —, mas deixar o banco meio convertido
// significaria que o campo `status_estoque` não é confiável para consultar
// direto no console do Firebase.
//
// Então, na primeira vez que alguém abre o painel depois do deploy, todo
// registro que ainda não tem `status_estoque` recebe o valor derivado dos
// booleanos: `ativo: false` → "inativo", `emEstoque: false` → "esgotado",
// o resto → "ativo". Nenhum produto é criado, removido ou reordenado, e o
// `atualizadoEm` não é tocado — isto não é uma edição da loja.
//
// Roda uma vez por sessão: `onValue` dispara de novo com o resultado da
// própria escrita, e sem essa trava daria laço.
let migracaoFeita = false;

async function migrarStatusEstoque() {
  if (migracaoFeita || !db) return;

  // Percorre a lista já normalizada, e não os registros crus: um registro
  // quebrado (sem modelo, por exemplo) seria recusado pela validação das
  // regras e derrubaria a escrita inteira junto com os produtos bons.
  const pendentes = produtos.filter(
    (p) =>
      !STATUS_ESTOQUE.includes(
        String(brutos[p.id]?.status_estoque ?? "").trim().toLowerCase()
      )
  );

  // Marca antes de gravar: uma segunda passada do onValue durante a escrita
  // não pode reenviar a mesma migração.
  migracaoFeita = true;
  if (pendentes.length === 0) return;

  // Uma escrita só, com os caminhos de todos os produtos: ou o banco converte
  // o catálogo inteiro, ou não converte nada — nunca um meio-termo.
  // `p.statusEstoque` já é o estado derivado dos booleanos antigos.
  const alteracoes = {};
  pendentes.forEach((p) => {
    Object.entries(camposDeStatus(p.statusEstoque)).forEach(([campo, valor]) => {
      alteracoes[`${p.id}/${campo}`] = valor;
    });
  });

  try {
    await update(ref(db, DB_PATHS.produtos), alteracoes);
    console.info(`status_estoque preenchido em ${pendentes.length} produto(s).`);
    toast(
      `${pendentes.length} produto(s) migrado(s) para o novo campo de status.`,
      "ok"
    );
  } catch (erro) {
    console.error("Não foi possível migrar o status dos produtos:", erro);
    // Sem alarde: o painel e o site continuam corretos pela derivação em
    // `statusEstoqueDe`. Só o campo no banco é que fica para a próxima.
    migracaoFeita = false;
  }
}

// ---------------------------------------------------------------------------
// Migração para `precoAVista`
// ---------------------------------------------------------------------------
// Mesma ideia da migração do status: antes desta versão o aparelho tinha um
// preço só, no campo `preco`. Agora são dois — `precoAVista` e `precoAPrazo`.
// Ler o campo antigo continua funcionando (`precosDe`, no produtos-utils.js,
// cai nele quando o novo não existe), mas um banco meio convertido não seria
// confiável para consultar direto no console do Firebase.
//
// Na primeira vez que alguém abre o painel depois do deploy, todo registro sem
// `precoAVista` recebe nele o valor que já estava em `preco`. Nada é apagado:
// o `preco` antigo fica onde está (segue como espelho do à vista), nenhum
// produto é criado, removido ou reordenado, e o `atualizadoEm` não é tocado.
// O `precoAPrazo` não é inventado — fica vazio até a loja cadastrar.
let migracaoPrecosFeita = false;

async function migrarPrecos() {
  if (migracaoPrecosFeita || !db) return;

  const pendentes = produtos.filter(
    (p) => p.precoAVista > 0 && !(Number(brutos[p.id]?.precoAVista) > 0)
  );

  migracaoPrecosFeita = true;
  if (pendentes.length === 0) return;

  // Uma escrita só: ou o catálogo inteiro ganha o campo, ou nada muda.
  const alteracoes = {};
  pendentes.forEach((p) => {
    alteracoes[`${p.id}/precoAVista`] = p.precoAVista;
  });

  try {
    await update(ref(db, DB_PATHS.produtos), alteracoes);
    console.info(`precoAVista preenchido em ${pendentes.length} produto(s).`);
    toast(
      `Preço de ${pendentes.length} produto(s) migrado para "à vista". Já dá para cadastrar o preço a prazo.`,
      "ok"
    );
  } catch (erro) {
    console.error("Não foi possível migrar os preços:", erro);
    // Sem alarde: o painel e o site continuam corretos pela derivação em
    // `precosDe`. Só o campo no banco é que fica para a próxima.
    migracaoPrecosFeita = false;
  }
}

// ---------------------------------------------------------------------------
// Lista
// ---------------------------------------------------------------------------
const elLista = $("lista");
const elBusca = $("buscaAdmin");

function produtosFiltrados() {
  const termo = elBusca.value.trim().toLowerCase();
  if (!termo) return produtos;
  return produtos.filter((p) =>
    `${p.modelo} ${p.capacidade}`.toLowerCase().includes(termo)
  );
}

function listaVaziaHtml(titulo, texto) {
  return `<div class="ap-vazio">
            ${icone("box")}
            <h3>${escapeHtml(titulo)}</h3>
            <p>${escapeHtml(texto)}</p>
          </div>`;
}

function renderizarLista() {
  const lista = produtosFiltrados();

  atualizarStats();

  if (lista.length === 0) {
    elLista.innerHTML = produtos.length
      ? listaVaziaHtml("Nenhum resultado", "Nenhum produto casa com essa busca.")
      : listaVaziaHtml("Nenhum produto ainda", 'Toque em "Novo produto" para cadastrar o primeiro.');
    return;
  }

  elLista.innerHTML = lista.map(itemHtml).join("");
}

/** Ícone de cada estado — o mesmo no botão da lista e na leitura de relance. */
const ICONE_STATUS = { ativo: "eye", esgotado: "alert", inativo: "eye-off" };

/** Os três botões de troca rápida de status, com o atual já marcado. */
function segStatusHtml(p) {
  const botoes = STATUS_ESTOQUE.map((estado) => {
    const atual = p.statusEstoque === estado;
    const rotulo = ROTULO_STATUS_ESTOQUE[estado];
    return `<button class="ap-seg__btn ap-seg__btn--${estado}${atual ? " is-on" : ""}"
                    type="button" data-acao="status" data-status="${estado}" data-id="${escapeHtml(p.id)}"
                    aria-pressed="${atual}" title="${rotulo}">
              ${icone(ICONE_STATUS[estado])}<span class="ap-seg__rotulo">${rotulo}</span>
            </button>`;
  }).join("");

  return `<div class="ap-seg" role="group" aria-label="Status de ${escapeHtml(p.titulo)}">${botoes}</div>`;
}

function itemHtml(p) {
  const capa = p.fotos[0];
  const foto = capa
    ? `<img class="ap-item__foto" src="${escapeHtml(miniaturaUrl(capa, 200))}" alt="" loading="lazy" />`
    : `<div class="ap-item__foto ap-item__foto--vazia">${icone("image")}</div>`;

  const classes = ["ap-item", `ap-item--${p.statusEstoque}`].join(" ");

  return `
    <article class="${classes}" data-id="${escapeHtml(p.id)}">
      <div class="ap-item__topo">
        ${foto}
        <div class="ap-item__info">
          <h3 class="ap-item__nome">${escapeHtml(p.titulo)}</h3>
          <p class="ap-item__preco">
            <span class="ap-item__preco-linha"><small>À vista</small> ${formatarBRL(p.precoAVista)}</span>
            <span class="ap-item__preco-linha ap-item__preco-linha--prazo"><small>A prazo</small> ${p.precoAPrazo ? formatarBRL(p.precoAPrazo) : "—"}</span>
          </p>
          <div class="ap-item__tags">
            <span class="ap-tag ap-tag--${p.statusEstoque}">${ROTULO_STATUS_ESTOQUE[p.statusEstoque]}</span>
            ${p.destaque ? `<span class="ap-tag ap-tag--destaque">Destaque</span>` : ""}
            <span class="ap-tag">${escapeHtml(p.status)}</span>
            ${p.condicao ? `<span class="ap-tag">${escapeHtml(p.condicao)}</span>` : ""}
            ${p.bateria !== null ? `<span class="ap-tag">Bat. ${p.bateria}%</span>` : ""}
          </div>
        </div>
      </div>

      ${segStatusHtml(p)}

      <div class="ap-item__acoes">
        <button class="ap-btn-lista ${p.destaque ? "is-on" : ""}" type="button" data-acao="destaque" data-id="${escapeHtml(p.id)}">
          ${icone("star")} Destaque
        </button>
        <button class="ap-btn-lista" type="button" data-acao="editar" data-id="${escapeHtml(p.id)}">
          ${icone("edit")} Editar
        </button>
        <button class="ap-btn-lista ap-btn-lista--perigo" type="button" data-acao="excluir" data-id="${escapeHtml(p.id)}">
          ${icone("trash")} Excluir
        </button>
      </div>
    </article>`;
}

function atualizarStats() {
  const total = produtos.length;
  const contar = (estado) => produtos.filter((p) => p.statusEstoque === estado).length;
  const esgotados = contar("esgotado");
  const inativos = contar("inativo");
  // "No site" inclui os esgotados: eles continuam na vitrine, só marcados.
  const noSite = total - inativos;
  const destaques = produtos.filter((p) => p.destaque).length;

  $("stats").innerHTML = `
    <span class="ap-chip">${icone("box")} <strong>${total}</strong> cadastrados</span>
    <span class="ap-chip">${icone("eye")} <strong>${noSite}</strong> no site</span>
    <span class="ap-chip">${icone("star")} <strong>${destaques}</strong> em destaque</span>
    ${esgotados ? `<span class="ap-chip ap-chip--alerta">${icone("alert")} <strong>${esgotados}</strong> esgotado${esgotados > 1 ? "s" : ""}</span>` : ""}
    ${inativos ? `<span class="ap-chip">${icone("eye-off")} <strong>${inativos}</strong> inativo${inativos > 1 ? "s" : ""}</span>` : ""}`;
}

elBusca.addEventListener("input", renderizarLista);

// Delegação: a lista é recriada a cada mudança no banco, então escutamos o
// clique no container e não em cada botão.
elLista.addEventListener("click", (e) => {
  const botao = e.target.closest("[data-acao]");
  if (!botao) return;

  const { acao, id } = botao.dataset;
  const produto = produtos.find((p) => p.id === id);
  if (!produto) return;

  if (acao === "editar") abrirFormulario(id);
  else if (acao === "excluir") pedirConfirmacaoExclusao(produto);
  else if (acao === "destaque") gravarCampos(botao, id, { destaque: !produto.destaque });
  else if (acao === "status") {
    const novo = botao.dataset.status;
    // Tocar no estado que já está marcado não é erro nem troca: só ignora.
    if (novo === produto.statusEstoque) return;
    gravarCampos(botao, id, camposDeStatus(novo));
  }
});

/**
 * O que vai para o banco quando o estado muda.
 * `status_estoque` é a fonte da verdade; `ativo` e `emEstoque` seguem junto
 * como espelho, porque as regras publicadas do Realtime Database e o catálogo
 * de reserva ainda falam a língua dos booleanos. Sempre gravados na MESMA
 * escrita, para nunca existir um instante em que discordem.
 */
function camposDeStatus(statusEstoque) {
  return { status_estoque: statusEstoque, ...camposLegadosDeStatus(statusEstoque) };
}

async function gravarCampos(botao, id, campos) {
  // Desabilita durante a escrita para não disparar duas trocas no mesmo item
  // (o `onValue` redesenha a lista e o estado voltaria a ficar ambíguo).
  botao.disabled = true;
  try {
    await update(ref(db, `${DB_PATHS.produtos}/${id}`), {
      ...campos,
      atualizadoEm: serverTimestamp(),
    });
  } catch (erro) {
    console.error("Erro ao alterar produto:", erro);
    toast("Não foi possível salvar a alteração.", "erro");
    botao.disabled = false;
  }
  // Em caso de sucesso o onValue redesenha a lista inteira — não precisa
  // reabilitar este botão, ele deixa de existir.
}

// ---------------------------------------------------------------------------
// Exclusão
// ---------------------------------------------------------------------------
const elConfirmar = $("confirmar");
let idParaExcluir = null;

function pedirConfirmacaoExclusao(produto) {
  idParaExcluir = produto.id;
  $("confirmarTexto").textContent =
    `"${produto.titulo}" será removido do painel e do site. Essa ação não pode ser desfeita.`;
  elConfirmar.hidden = false;
  requestAnimationFrame(() => elConfirmar.classList.add("is-open"));
  $("confirmarNao").focus();
}

function fecharConfirmacao() {
  elConfirmar.classList.remove("is-open");
  setTimeout(() => {
    elConfirmar.hidden = true;
  }, 200);
  idParaExcluir = null;
}

$("confirmarNao").addEventListener("click", fecharConfirmacao);
elConfirmar.addEventListener("click", (e) => {
  if (e.target === elConfirmar) fecharConfirmacao();
});

$("confirmarSim").addEventListener("click", async () => {
  if (!idParaExcluir) return;
  const id = idParaExcluir;
  const btn = $("confirmarSim");
  btn.disabled = true;
  btn.textContent = "Excluindo…";

  try {
    await remove(ref(db, `${DB_PATHS.produtos}/${id}`));
    toast("Produto excluído.", "ok");
    fecharConfirmacao();
  } catch (erro) {
    console.error("Erro ao excluir:", erro);
    toast("Não foi possível excluir. Tente de novo.", "erro");
  } finally {
    btn.disabled = false;
    btn.textContent = "Excluir";
  }
});

// ---------------------------------------------------------------------------
// Fotos (Cloudinary)
// ---------------------------------------------------------------------------
/** URLs já salvas/enviadas, na ordem em que aparecerão no site. */
let fotos = [];
/** Quantos uploads estão em andamento — trava o "Salvar" enquanto houver. */
let uploadsPendentes = 0;

const dropzone = $("dropzone");
const inputFotos = $("inputFotos");
const fotosGrid = $("fotosGrid");

const TAMANHO_MAXIMO = 10 * 1024 * 1024; // 10 MB

function renderizarFotos() {
  const enviando = Array.from({ length: uploadsPendentes }, () => {
    return `<div class="foto-item foto-item--enviando"><div class="spinner"></div></div>`;
  }).join("");

  fotosGrid.innerHTML =
    fotos
      .map(
        (url, i) => `
      <div class="foto-item ${i === 0 ? "foto-item--capa" : ""}">
        <img src="${escapeHtml(miniaturaUrl(url, 300))}" alt="Foto ${i + 1}" />
        ${i === 0 ? `<span class="foto-item__capa-tag">Capa</span>` : ""}
        <div class="foto-item__acoes">
          <button type="button" data-foto="esquerda" data-i="${i}" ${i === 0 ? "disabled" : ""} aria-label="Mover para a esquerda">${icone("left")}</button>
          <button type="button" data-foto="direita" data-i="${i}" ${i === fotos.length - 1 ? "disabled" : ""} aria-label="Mover para a direita">${icone("right")}</button>
          <button type="button" data-foto="remover" data-i="${i}" aria-label="Remover foto">${icone("trash")}</button>
        </div>
      </div>`
      )
      .join("") + enviando;

  $("btnSalvar").disabled = uploadsPendentes > 0;
}

fotosGrid.addEventListener("click", (e) => {
  const botao = e.target.closest("[data-foto]");
  if (!botao) return;

  const i = Number(botao.dataset.i);
  const acao = botao.dataset.foto;

  if (acao === "remover") {
    fotos.splice(i, 1);
  } else {
    // Reordenar = trocar de lugar com o vizinho. Dois botões funcionam bem no
    // celular, onde arrastar miniatura é sofrível.
    const destino = acao === "esquerda" ? i - 1 : i + 1;
    if (destino < 0 || destino >= fotos.length) return;
    [fotos[i], fotos[destino]] = [fotos[destino], fotos[i]];
  }

  renderizarFotos();
  if (fotos.length) marcarErro("campoFotos", "");
});

// ---------------------------------------------------------------------------
// Recorte de fundo
// ---------------------------------------------------------------------------
// A remoção de fundo é uma transformação de entrega do Cloudinary: ela só
// acontece quando alguém pede a URL recortada. Se a gente simplesmente
// gravasse essa URL no banco, dois riscos cairiam no colo do visitante:
//   • 423 na primeiríssima visita, enquanto o Cloudinary processa;
//   • 403 para sempre, se a conta não tiver essa transformação liberada —
//     e aí TODAS as fotos do catálogo apareceriam quebradas.
// Por isso o painel pede a URL recortada aqui, na hora do upload: isso
// aquece o cache (o visitante nunca pega o 423) e prova que a conta suporta
// o recurso. Não deu certo? Guarda a foto original e avisa a loja.

const TENTATIVAS_RECORTE = 4;
const ESPERA_RECORTE_MS = 1500;

/** Avisa uma vez por sessão, para não encher a tela de toasts iguais. */
let jaAvisouSemRecorte = false;

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Confirma que a URL recortada realmente entrega uma imagem.
 * @returns {Promise<"ok" | "indisponivel" | "demorou">}
 */
async function confirmarRecorte(url) {
  for (let tentativa = 1; tentativa <= TENTATIVAS_RECORTE; tentativa++) {
    let resposta;
    try {
      // `cache: no-store` para não ler um 423 guardado de uma tentativa antes.
      resposta = await fetch(url, { method: "GET", cache: "no-store" });
    } catch (erro) {
      console.error("Falha de rede ao conferir o recorte:", erro);
      return "indisponivel";
    }

    if (resposta.ok) return "ok";

    // 423 = ainda processando. É o único caso em que vale esperar e insistir.
    if (resposta.status === 423) {
      if (tentativa < TENTATIVAS_RECORTE) await esperar(ESPERA_RECORTE_MS);
      continue;
    }

    // 403 (sem cota/plano), 400 (transformação recusada) e afins: não adianta
    // tentar de novo.
    console.warn(`Recorte de fundo indisponível (HTTP ${resposta.status}).`);
    return "indisponivel";
  }
  return "demorou";
}

/** Envia um arquivo para o Cloudinary e devolve a URL pronta para o banco. */
async function enviarParaCloudinary(arquivo) {
  const dados = new FormData();
  dados.append("file", arquivo);
  dados.append("upload_preset", imageConfig.uploadPreset);
  if (imageConfig.folder) dados.append("folder", imageConfig.folder);

  const resposta = await fetch(
    `https://api.cloudinary.com/v1_1/${imageConfig.cloudName}/image/upload`,
    { method: "POST", body: dados }
  );

  if (!resposta.ok) {
    const detalhe = await resposta.text().catch(() => "");
    throw new Error(`Cloudinary respondeu ${resposta.status}: ${detalhe}`);
  }

  const { secure_url: original } = await resposta.json();

  // Guardamos a URL já com f_auto/q_auto (e, quando dá, com o recorte): o site
  // público recebe a versão leve sem precisar transformar nada na hora.
  if (!imageConfig.removerFundo) return otimizarUrl(original);

  const recortada = urlSemFundo(original);
  const situacao = await confirmarRecorte(recortada);

  if (situacao === "ok") return recortada;

  if (!jaAvisouSemRecorte) {
    jaAvisouSemRecorte = true;
    toast(
      situacao === "demorou"
        ? "O recorte de fundo está demorando; a foto foi salva sem recorte."
        : "Recorte de fundo indisponível nesta conta Cloudinary. Foto salva como está.",
      "erro"
    );
  }
  return otimizarUrl(original);
}

async function receberArquivos(listaArquivos) {
  if (!cloudinaryConfigurado()) {
    toast("Configure o Cloudinary em image-config.js para enviar fotos.", "erro");
    return;
  }

  const arquivos = [...listaArquivos].filter((a) => {
    if (!a.type.startsWith("image/")) {
      toast(`"${a.name}" não é uma imagem.`, "erro");
      return false;
    }
    if (a.size > TAMANHO_MAXIMO) {
      toast(`"${a.name}" passa de 10 MB.`, "erro");
      return false;
    }
    return true;
  });

  if (!arquivos.length) return;

  uploadsPendentes += arquivos.length;
  renderizarFotos();

  // Envia em paralelo, mas cada um resolve por conta própria: uma foto que
  // falhe não derruba as outras.
  await Promise.all(
    arquivos.map(async (arquivo) => {
      try {
        const url = await enviarParaCloudinary(arquivo);
        fotos.push(url);
      } catch (erro) {
        console.error("Falha no upload:", erro);
        toast(`Não foi possível enviar "${arquivo.name}".`, "erro");
      } finally {
        uploadsPendentes -= 1;
        renderizarFotos();
      }
    })
  );

  if (fotos.length) marcarErro("campoFotos", "");
}

dropzone.addEventListener("click", () => inputFotos.click());
dropzone.addEventListener("keydown", (e) => {
  if (e.key === "Enter" || e.key === " ") {
    e.preventDefault();
    inputFotos.click();
  }
});

inputFotos.addEventListener("change", () => {
  receberArquivos(inputFotos.files);
  inputFotos.value = ""; // permite reenviar o mesmo arquivo depois
});

["dragenter", "dragover"].forEach((evento) => {
  dropzone.addEventListener(evento, (e) => {
    e.preventDefault();
    dropzone.classList.add("is-dragover");
  });
});
["dragleave", "drop"].forEach((evento) => {
  dropzone.addEventListener(evento, (e) => {
    e.preventDefault();
    dropzone.classList.remove("is-dragover");
  });
});
dropzone.addEventListener("drop", (e) => {
  if (e.dataTransfer?.files?.length) receberArquivos(e.dataTransfer.files);
});

// ---------------------------------------------------------------------------
// Formulário
// ---------------------------------------------------------------------------
const sheet = $("sheetForm");

/** Marca no formulário o estado do produto (grupo de rádios do status). */
function definirStatusNoFormulario(statusEstoque) {
  const alvo = STATUS_ESTOQUE.includes(statusEstoque) ? statusEstoque : "ativo";
  document.querySelectorAll('input[name="statusEstoque"]').forEach((radio) => {
    radio.checked = radio.value === alvo;
  });
}

/** Estado escolhido no formulário. */
function statusDoFormulario() {
  const marcado = document.querySelector('input[name="statusEstoque"]:checked');
  return STATUS_ESTOQUE.includes(marcado?.value) ? marcado.value : "ativo";
}

function abrirFormulario(id = null) {
  editandoId = id;
  limparErros();

  const bruto = id ? brutos[id] : null;
  const p = id ? produtos.find((x) => x.id === id) : null;

  $("formTitulo").textContent = id ? "Editar produto" : "Novo produto";
  $("fModelo").value = p?.modelo ?? "";
  $("fCapacidade").value = p?.capacidade ?? "";
  $("fPreco").value = p ? precoParaCampo(p.precoAVista) : "";
  $("fPrecoPrazo").value = p ? precoParaCampo(p.precoAPrazo) : "";
  $("fParcelamento").value = p?.parcelamento ?? "";
  $("fBateria").value = p?.bateria ?? "";
  $("fCondicao").value = p?.condicao ?? "";
  $("fStatus").value = p?.status ?? "Seminovo";
  $("fCategoria").value = p?.categoria ?? categoriaDoStatus(p?.status ?? "Seminovo");
  $("fDescricao").value = p?.descricao ?? "";
  $("fDestaque").checked = p?.destaque ?? false;
  definirStatusNoFormulario(p ? p.statusEstoque : "ativo");
  // `observacoes` só existe no registro cru: de propósito, não passa pelo
  // objeto canônico que o site público consome.
  $("fObservacoes").value = bruto?.observacoes ?? "";

  fotos = p ? [...p.fotos] : [];
  uploadsPendentes = 0;
  renderizarFotos();

  sheet.hidden = false;
  requestAnimationFrame(() => sheet.classList.add("is-open"));
  document.body.style.overflow = "hidden";
  $("fModelo").focus();
}

function fecharFormulario() {
  sheet.classList.remove("is-open");
  document.body.style.overflow = "";
  setTimeout(() => {
    sheet.hidden = true;
  }, 280);
  editandoId = null;
}

$("btnNovo").addEventListener("click", () => abrirFormulario(null));
$("btnFecharForm").addEventListener("click", fecharFormulario);
$("btnCancelar").addEventListener("click", fecharFormulario);
sheet.addEventListener("click", (e) => {
  if (e.target === sheet) fecharFormulario();
});
document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  if (!elConfirmar.hidden) fecharConfirmacao();
  else if (!sheet.hidden) fecharFormulario();
});

$("formProduto").addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!db) {
    toast("Firebase não configurado — não há onde salvar.", "erro");
    return;
  }

  limparErros();

  const modelo = $("fModelo").value.trim();
  const preco = parsePreco($("fPreco").value);
  // Preço a prazo é opcional: campo em branco = sem preço a prazo.
  const prazoTexto = $("fPrecoPrazo").value.trim();
  const precoPrazo = prazoTexto === "" ? null : parsePreco(prazoTexto);

  // Validação: modelo, preço à vista e ao menos uma foto são obrigatórios.
  let valido = true;
  if (!modelo) {
    marcarErro("campoModelo", "Informe o modelo do aparelho.");
    valido = false;
  }
  if (!Number.isFinite(preco) || preco <= 0) {
    marcarErro("campoPreco", "Informe o preço à vista.");
    valido = false;
  }
  if (precoPrazo !== null) {
    if (!Number.isFinite(precoPrazo) || precoPrazo <= 0) {
      marcarErro("campoPrecoPrazo", "Valor inválido. Deixe em branco se não vende a prazo.");
      valido = false;
    } else if (Number.isFinite(preco) && precoPrazo < preco) {
      // Quase sempre é erro de digitação (faltou um zero) — e publicar um
      // "a prazo" mais barato que o à vista confundiria o cliente.
      marcarErro("campoPrecoPrazo", "O preço a prazo não pode ser menor que o à vista.");
      valido = false;
    }
  }
  if (fotos.length === 0) {
    marcarErro("campoFotos", "Envie ao menos uma foto.");
    valido = false;
  }
  if (uploadsPendentes > 0) {
    toast("Aguarde o envio das fotos terminar.", "erro");
    valido = false;
  }
  if (!valido) {
    document.querySelector(".campo--erro")?.scrollIntoView({ behavior: "smooth", block: "center" });
    return;
  }

  const bateriaTexto = $("fBateria").value.trim();
  const bateria = bateriaTexto === "" ? null : Math.round(Number(bateriaTexto));

  const dados = {
    modelo,
    capacidade: $("fCapacidade").value.trim(),
    // precoAVista + precoAPrazo (null apaga o campo) + `preco` como espelho.
    ...camposDePreco(preco, precoPrazo),
    parcelamento: $("fParcelamento").value.trim(),
    bateria: Number.isFinite(bateria) ? bateria : null,
    condicao: $("fCondicao").value,
    status: $("fStatus").value,
    categoria: $("fCategoria").value,
    descricao: $("fDescricao").value.trim(),
    destaque: $("fDestaque").checked,
    ...camposDeStatus(statusDoFormulario()),
    fotos,
    observacoes: $("fObservacoes").value.trim(),
    atualizadoEm: serverTimestamp(),
  };

  const btn = $("btnSalvar");
  btn.disabled = true;
  btn.textContent = "Salvando…";

  try {
    if (editandoId) {
      await update(ref(db, `${DB_PATHS.produtos}/${editandoId}`), dados);
      toast("Produto atualizado.", "ok");
    } else {
      const novo = push(ref(db, DB_PATHS.produtos));
      await set(novo, { ...dados, criadoEm: serverTimestamp() });
      toast(
        dados.status_estoque === "inativo"
          ? "Produto cadastrado como inativo — ainda não aparece no site."
          : "Produto cadastrado e já no ar.",
        "ok"
      );
    }
    fecharFormulario();
  } catch (erro) {
    console.error("Erro ao salvar:", erro);
    toast(
      erro?.code === "PERMISSION_DENIED"
        ? "Sem permissão para salvar. Confira as regras do banco."
        : "Não foi possível salvar. Tente de novo.",
      "erro"
    );
  } finally {
    btn.disabled = false;
    btn.textContent = "Salvar produto";
  }
});

// Feedback imediato: limpa o erro do campo assim que a pessoa corrige.
$("fModelo").addEventListener("input", () => marcarErro("campoModelo", ""));
$("fPreco").addEventListener("input", () => marcarErro("campoPreco", ""));
$("fPrecoPrazo").addEventListener("input", () => marcarErro("campoPrecoPrazo", ""));
ligarCampoDePreco("fPreco");
ligarCampoDePreco("fPrecoPrazo");

// ---------------------------------------------------------------------------
// Navegação: Produtos × Banner inicial
// ---------------------------------------------------------------------------
const VIEWS = { produtos: "viewProdutos", hero: "viewHero", instagram: "viewInstagram" };

function mostrarView(nome) {
  Object.entries(VIEWS).forEach(([chave, id]) => {
    $(id).hidden = chave !== nome;
  });
  document.querySelectorAll(".ap-nav__item").forEach((botao) => {
    const ativo = botao.dataset.view === nome;
    botao.classList.toggle("is-active", ativo);
    if (ativo) botao.setAttribute("aria-current", "page");
    else botao.removeAttribute("aria-current");
  });
  // O botão flutuante "Novo produto" só faz sentido na lista.
  $("btnNovo").hidden = nome !== "produtos";
  window.scrollTo({ top: 0, behavior: "smooth" });
}

document.querySelectorAll(".ap-nav__item").forEach((botao) => {
  botao.addEventListener("click", () => mostrarView(botao.dataset.view));
});

// Status e seção do site são a mesma informação em 99% dos casos. Mexer no
// status já ajusta a seção, para ninguém cadastrar um "Novo" que vai parar na
// prateleira dos seminovos por descuido. Quem precisar ainda pode trocar a
// seção na mão depois.
$("fStatus").addEventListener("change", () => {
  $("fCategoria").value = categoriaDoStatus($("fStatus").value);
});

// ---------------------------------------------------------------------------
// Galerias de configuração (Banner inicial e Instagram)
// ---------------------------------------------------------------------------
// As duas telas fazem exatamente a mesma coisa: uma fila de fotos que a loja
// envia, reordena e salva num nó do banco. Em vez de duplicar isso, aqui vai
// uma fábrica — cada galeria é uma instância com seus próprios elementos e
// seu próprio caminho no Firebase.

/**
 * @param {object} cfg
 * @param {string} cfg.caminho    nó do Realtime Database (DB_PATHS.*)
 * @param {number} cfg.maximo     quantas fotos a galeria aceita
 * @param {string} cfg.slots      id do container dos quadros
 * @param {string} cfg.input      id do <input type="file">
 * @param {string} cfg.campo      id do .campo (para marcar erro)
 * @param {string} cfg.salvar     id do botão de salvar
 * @param {string} cfg.desfazer   id do botão de desfazer
 * @param {string} cfg.rotulo     nome usado nas mensagens
 * @param {(fotos: string[]) => void} [cfg.aoMudar]  eco em uma prévia, se houver
 */
function criarGaleria(cfg) {
  /** Como está salvo no banco (base do "Desfazer"). */
  let salvo = [];
  /** Como está na tela. */
  let atual = [];
  let enviando = 0;
  /** Índice do quadro que abriu o seletor de arquivo. */
  let alvo = null;

  const elSlots = $(cfg.slots);
  const elInput = $(cfg.input);
  const elSalvar = $(cfg.salvar);
  const elDesfazer = $(cfg.desfazer);

  const mudou = () => JSON.stringify(salvo) !== JSON.stringify(atual);

  function renderizar() {
    const quadros = [];

    for (let i = 0; i < cfg.maximo; i++) {
      const url = atual[i];

      if (url) {
        quadros.push(`
          <div class="ap-slot ap-slot--cheio" data-slot="${i}">
            <span class="ap-slot__ordem">${i + 1}</span>
            <img src="${escapeHtml(miniaturaUrl(url, 400))}" alt="Foto ${i + 1}" />
            <div class="ap-slot__acoes">
              <button type="button" data-galeria="esquerda" data-i="${i}" ${i === 0 ? "disabled" : ""} aria-label="Mover para a esquerda">${icone("left")}</button>
              <button type="button" data-galeria="direita" data-i="${i}" ${i === atual.length - 1 ? "disabled" : ""} aria-label="Mover para a direita">${icone("right")}</button>
              <button type="button" data-galeria="remover" data-i="${i}" aria-label="Remover foto">${icone("trash")}</button>
            </div>
          </div>`);
        continue;
      }

      // Só o primeiro quadro vago aceita clique: as fotos entram em sequência,
      // sem buraco no meio da fila.
      const proximoVago = atual.length === i;
      quadros.push(`
        <div class="ap-slot" data-slot="${i}" ${proximoVago ? 'tabindex="0" role="button"' : 'aria-hidden="true" style="opacity:.45"'}>
          ${icone("upload")}
          <span>${proximoVago ? "Enviar foto" : "Vazio"}</span>
        </div>`);
    }

    const emEnvio = Array.from(
      { length: enviando },
      () => `<div class="ap-slot ap-slot--enviando"><div class="spinner"></div></div>`
    ).join("");

    elSlots.innerHTML = quadros.join("") + emEnvio;

    cfg.aoMudar?.([...atual]);
    elSalvar.disabled = enviando > 0 || !mudou();
    elDesfazer.disabled = enviando > 0 || !mudou();
  }

  elSlots.addEventListener("click", (e) => {
    const acao = e.target.closest("[data-galeria]");
    if (acao) {
      const i = Number(acao.dataset.i);
      if (acao.dataset.galeria === "remover") {
        atual.splice(i, 1);
      } else {
        const destino = acao.dataset.galeria === "esquerda" ? i - 1 : i + 1;
        if (destino < 0 || destino >= atual.length) return;
        [atual[i], atual[destino]] = [atual[destino], atual[i]];
      }
      renderizar();
      marcarErro(cfg.campo, "");
      return;
    }

    const slot = e.target.closest(".ap-slot[tabindex]");
    if (!slot) return;
    alvo = Number(slot.dataset.slot);
    elInput.click();
  });

  elSlots.addEventListener("keydown", (e) => {
    if (e.key !== "Enter" && e.key !== " ") return;
    const slot = e.target.closest(".ap-slot[tabindex]");
    if (!slot) return;
    e.preventDefault();
    alvo = Number(slot.dataset.slot);
    elInput.click();
  });

  elInput.addEventListener("change", async () => {
    const arquivo = elInput.files?.[0];
    elInput.value = "";
    if (!arquivo) return;

    if (!cloudinaryConfigurado()) {
      toast("Configure o Cloudinary para enviar fotos.", "erro");
      return;
    }
    if (!arquivo.type.startsWith("image/")) {
      toast("Escolha um arquivo de imagem.", "erro");
      return;
    }
    if (arquivo.size > TAMANHO_MAXIMO) {
      toast("A imagem passa de 10 MB.", "erro");
      return;
    }
    if (atual.length >= cfg.maximo) {
      toast(`${cfg.rotulo} aceita no máximo ${cfg.maximo} fotos.`, "erro");
      return;
    }

    enviando += 1;
    renderizar();
    try {
      const url = await enviarParaCloudinary(arquivo);
      if (alvo !== null && alvo < atual.length) atual[alvo] = url;
      else atual.push(url);
      marcarErro(cfg.campo, "");
    } catch (erro) {
      console.error("Falha no upload:", erro);
      toast("Não foi possível enviar a foto.", "erro");
    } finally {
      enviando -= 1;
      alvo = null;
      renderizar();
    }
  });

  elDesfazer.addEventListener("click", () => {
    atual = [...salvo];
    marcarErro(cfg.campo, "");
    renderizar();
  });

  elSalvar.addEventListener("click", async () => {
    if (!db) {
      toast("Firebase não configurado — não há onde salvar.", "erro");
      return;
    }

    const textoOriginal = elSalvar.textContent;
    elSalvar.disabled = true;
    elSalvar.textContent = "Salvando…";

    try {
      // `set` com a lista inteira: o nó vira exatamente o que está na tela,
      // inclusive quando a loja esvazia tudo.
      await set(ref(db, cfg.caminho), atual);
      salvo = [...atual];
      toast(`${cfg.rotulo} atualizado. Já está no ar.`, "ok");
    } catch (erro) {
      console.error("Erro ao salvar:", erro);
      toast(
        erro?.code === "PERMISSION_DENIED"
          ? "Sem permissão para salvar. Libere o nó config nas regras do banco."
          : "Não foi possível salvar.",
        "erro"
      );
    } finally {
      elSalvar.textContent = textoOriginal;
      renderizar();
    }
  });

  return {
    /** Recebe o que veio do banco. Não pisa na edição em andamento. */
    definirSalvo(lista) {
      salvo = Array.isArray(lista)
        ? lista
            .map((item) => (typeof item === "string" ? item : item?.url))
            .filter((u) => typeof u === "string" && u.trim() !== "")
        : [];
      if (!mudou()) atual = [...salvo];
      renderizar();
    },
    renderizar,
  };
}

// ---- Banner inicial ------------------------------------------------------
const galeriaHero = criarGaleria({
  caminho: DB_PATHS.heroFotos,
  maximo: 3,
  slots: "heroSlots",
  input: "inputHero",
  campo: "campoHero",
  salvar: "btnHeroSalvar",
  desfazer: "btnHeroDesfazer",
  rotulo: "Banner",
  aoMudar: (fotos) => {
    // Prévia com o mesmo HTML/CSS da home, para não haver surpresa.
    $("heroPreview").innerHTML = fotos.length
      ? fotos
          .map((url) => `<img class="hero__phone" src="${escapeHtml(miniaturaUrl(url, 400))}" alt="" />`)
          .join("")
      : `<p class="hero__gallery-vazio">Sem fotos no banner — o site mostra o topo sem imagens.</p>`;
  },
});

// ---- Instagram -----------------------------------------------------------
const galeriaInstagram = criarGaleria({
  caminho: DB_PATHS.instagram,
  maximo: 8,
  slots: "igSlots",
  input: "inputIg",
  campo: "campoIg",
  salvar: "btnIgSalvar",
  desfazer: "btnIgDesfazer",
  rotulo: "Instagram",
  aoMudar: (fotos) => {
    $("igPreview").innerHTML = fotos.length
      ? fotos
          .map((url) => `<span class="ig-foto"><img src="${escapeHtml(miniaturaUrl(url, 300))}" alt="" /></span>`)
          .join("")
      : `<p class="campo__dica">Sem fotos — o site mostra só o convite para seguir o perfil.</p>`;
  },
});

// ---------------------------------------------------------------------------
// Sessão — última coisa a rodar
// ---------------------------------------------------------------------------
// Só aqui, com o módulo inteiro já avaliado, é seguro reagir ao estado de
// login: o callback pode vir na hora (sessão em cache) e vai direto para
// `iniciarPainel()`, que usa tudo o que foi declarado acima.
function observarSessao() {
  if (!auth) {
    // Setup pendente: mostra o painel só para o aviso ficar visível.
    mostrar("painel");
    mostrarAvisosDeSetup();
    elLista.innerHTML = listaVaziaHtml(
      "Configuração pendente",
      "Preencha o firebase-config.js para começar a cadastrar produtos."
    );
    return;
  }

  // onAuthStateChanged dispara quando o Firebase termina de checar a sessão
  // salva — só então decidimos qual tela mostrar (sem piscar a errada).
  onAuthStateChanged(auth, (usuario) => {
    if (usuario) {
      mostrar("painel");
      mostrarAvisosDeSetup();
      iniciarPainel();
    } else {
      mostrar("login");
    }
  });
}

observarSessao();
