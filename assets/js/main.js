/* =========================================================
   THUNDER CELL — main.js
   Responsável por: buscar os produtos (fetch), aplicar os
   filtros em tempo real, calcular as parcelas de cada
   produto de acordo com as taxas reais da maquininha,
   controlar o carrossel do modal (com autoplay), o menu
   mobile e as animações de scroll/contadores.
   ========================================================= */

const WHATSAPP_NUMBER = '5549998404821';

// Taxas reais da maquininha da loja para crédito parcelado (1x = à vista)
const INSTALLMENT_RATES = {
    1: 3.68,
    2: 4.86,
    3: 5.74,
    4: 6.62,
    5: 7.50,
    6: 8.38,
    7: 9.27,
    8: 10.15,
    9: 11.03,
    10: 11.91,
    11: 12.79,
    12: 13.67
};

// Classes de cor de cada selo suportado no produtos.json (campo "selo")
const BADGE_CLASSES = {
    'Novo': 'badge-novo',
    'Seminovo': 'badge-seminovo',
    'Oferta': 'badge-oferta',
    'Promoção': 'badge-promocao'
};

const state = {
    products: [],
    activeCategoria: '' // categoria atualmente aplicada no filtro do catálogo
};

/* ---------- Utilitários ---------- */

function formatCurrency(value) {
    return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function whatsappLink(productName) {
    const message = `Olá! Tenho interesse no ${productName}. Ele está disponível?`;
    return `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`;
}

/* ---------- Carregamento dos produtos ---------- */

// Os dados vêm do <script id="productsData"> injetado no index.html pelo
// build (scripts/build-catalog.js). Sem o build (desenvolvimento), cai
// para o fetch do produtos.json.
async function loadProducts() {
    const grid = document.getElementById('productsGrid');
    const inlineData = document.getElementById('productsData');

    try {
        if (inlineData) {
            state.products = JSON.parse(inlineData.textContent);
        } else {
            const response = await fetch('data/produtos.json');
            if (!response.ok) throw new Error('Não foi possível carregar o catálogo.');
            state.products = await response.json();
        }

        populateCategoryFilter();

        // Os cards já vêm pré-renderizados no HTML pelo build (SEO: o Google
        // vê o catálogo sem JS). O JS não os recria — apenas filtra.
        // Sem o build, renderiza os cards uma única vez aqui.
        if (!grid.querySelector('.product-card')) {
            grid.innerHTML = state.products.map(createProductCard).join('');
        }

        applyFilters();
    } catch (error) {
        grid.innerHTML = `<div class="empty-state">${error.message}</div>`;
    }
}

/* ---------- Filtros em tempo real ---------- */

function populateCategoryFilter() {
    const select = document.getElementById('categoriaFilter');
    const categorias = [...new Set(state.products.map((p) => p.categoria))];
    categorias.forEach((categoria) => {
        const option = document.createElement('option');
        option.value = categoria;
        option.textContent = categoria;
        select.appendChild(option);
    });
}

// Filtra exibindo/ocultando os cards já presentes no DOM (pré-renderizados
// pelo build ou renderizados uma única vez pelo loadProducts) — não recria nada.
function applyFilters() {
    const termo = document.getElementById('searchInput').value.trim().toLowerCase();
    const cards = document.querySelectorAll('#productsGrid .product-card');
    let visiveis = 0;

    cards.forEach((card) => {
        const matchNome = (card.dataset.nome || '').includes(termo);
        const matchCategoria = !state.activeCategoria || card.dataset.categoria === state.activeCategoria;
        const mostra = matchNome && matchCategoria;
        card.classList.toggle('is-hidden', !mostra);
        if (mostra) visiveis += 1;
    });

    document.getElementById('resultsInfo').textContent =
        `${visiveis} produto${visiveis === 1 ? '' : 's'} encontrado${visiveis === 1 ? '' : 's'}`;

    toggleEmptyState(visiveis === 0 && cards.length > 0);
}

// Cria/remove a mensagem de "nenhum resultado" conforme o filtro
function toggleEmptyState(mostrar) {
    const grid = document.getElementById('productsGrid');
    let vazio = grid.querySelector('.empty-state');

    if (mostrar && !vazio) {
        vazio = document.createElement('div');
        vazio.className = 'empty-state';
        vazio.textContent = 'Nenhum produto encontrado com esse filtro.';
        grid.appendChild(vazio);
    } else if (!mostrar && vazio) {
        vazio.remove();
    }
}

// Define a categoria ativa e reflete a escolha no <select> manual quando ela
// existir entre as opções carregadas. Usada tanto pelo filtro do catálogo
// quanto pela splash screen, para não duplicar a mesma lógica nos dois lugares.
function applyCategoryFilter(categoria) {
    state.activeCategoria = categoria;

    const select = document.getElementById('categoriaFilter');
    const optionExists = Array.from(select.options).some((option) => option.value === categoria);
    select.value = optionExists ? categoria : '';

    applyFilters();
}

/* ---------- Renderização do catálogo (fallback sem build) ---------- */

// IMPORTANTE: manter este markup em sincronia com o gerador do build
// (scripts/build-catalog.js), que produz os mesmos cards no index.html.
function createProductCard(product, index) {
    // Selo opcional (campo "selo" no produtos.json): Novo, Seminovo, Oferta, Promoção
    const badge = product.selo
        ? `<span class="product-badge ${BADGE_CLASSES[product.selo] || 'badge-novo'}">${product.selo}</span>`
        : '';

    // Estimativa de 12x no cartão, usando as mesmas taxas da tabela do modal
    const parcela12 = (product.preco * (1 + INSTALLMENT_RATES[12] / 100)) / 12;

    // Delay em cascata para a animação de entrada dos cards (limitado a 480ms)
    const delay = Math.min(index * 80, 480);

    return `
        <article class="product-card" style="--delay: ${delay}ms" data-id="${product.id}" data-nome="${product.nome.toLowerCase()}" data-categoria="${product.categoria}">
            <div class="product-image">
                ${badge}
                <img src="${product.imagens[0]}" alt="${product.nome}" loading="lazy" />
            </div>
            <div class="product-body">
                <div class="product-meta">
                    <span class="product-brand">${product.marca}</span>
                    <span class="product-category">${product.categoria}</span>
                </div>
                <h3>${product.nome}</h3>
                <p class="product-specs">${product.especificacoes.join(' • ')}</p>
                <div class="product-price-box">
                    <p class="product-price">${formatCurrency(product.preco)}</p>
                    <p class="product-installment">ou 12x de ${formatCurrency(parcela12)} no cartão</p>
                </div>
                <div class="product-actions">
                    <button class="btn btn-small btn-outline btn-block open-modal" type="button" data-id="${product.id}">
                        <i class="fa-regular fa-eye"></i> Ver Detalhes
                    </button>
                    <a class="btn btn-small btn-whatsapp btn-block" href="${whatsappLink(product.nome)}" target="_blank" rel="noopener noreferrer">
                        <i class="fa-brands fa-whatsapp"></i> Comprar pelo WhatsApp
                    </a>
                </div>
            </div>
        </article>
    `;
}

/* ---------- Simulador de parcelas ---------- */

// Preço com Juros = Preço Base * (1 + Taxa / 100)
function buildInstallmentsTable(preco) {
    const linhas = Object.entries(INSTALLMENT_RATES).map(([parcelas, taxa]) => {
        const totalComJuros = preco * (1 + taxa / 100);
        const valorParcela = totalComJuros / Number(parcelas);
        const rotulo = parcelas === '1' ? 'À vista no crédito' : `${parcelas}x`;
        return `
            <tr>
                <td>${rotulo}</td>
                <td>${formatCurrency(valorParcela)}</td>
                <td>${formatCurrency(totalComJuros)}</td>
            </tr>
        `;
    }).join('');

    return `
        <table class="installments-table">
            <thead>
                <tr>
                    <th>Parcelas</th>
                    <th>Valor da parcela</th>
                    <th>Total</th>
                </tr>
            </thead>
            <tbody>${linhas}</tbody>
        </table>
    `;
}

/* ---------- Carrossel de imagens do produto ---------- */

// Guardam as imagens e o índice atual do produto aberto no modal, para que
// os botões de navegação (prev/next/dots) e o autoplay saibam o que exibir.
let galleryImages = [];
let galleryIndex = 0;
let galleryTimer = null;

const GALLERY_AUTOPLAY_MS = 4000; // tempo de troca automática (~4s)

function buildGallery(images, nomeProduto) {
    // Com uma única imagem, exibe só a foto, sem setas/dots de navegação
    if (images.length <= 1) {
        return `
            <div class="gallery">
                <div class="gallery-main">
                    <img id="galleryImage" src="${images[0]}" alt="${nomeProduto}" />
                </div>
            </div>
        `;
    }

    return `
        <div class="gallery">
            <div class="gallery-main">
                <img id="galleryImage" src="${images[0]}" alt="${nomeProduto}" />
                <button type="button" class="gallery-arrow gallery-prev" aria-label="Imagem anterior">
                    <i class="fa-solid fa-chevron-left"></i>
                </button>
                <button type="button" class="gallery-arrow gallery-next" aria-label="Próxima imagem">
                    <i class="fa-solid fa-chevron-right"></i>
                </button>
            </div>
            <div class="gallery-dots">
                ${images.map((_, i) => `
                    <button type="button" class="gallery-dot ${i === 0 ? 'active' : ''}" data-index="${i}" aria-label="Ir para imagem ${i + 1}"></button>
                `).join('')}
            </div>
        </div>
    `;
}

// Troca a imagem principal com um crossfade suave e atualiza o dot ativo
function showGalleryImage(index) {
    galleryIndex = (index + galleryImages.length) % galleryImages.length; // navegação circular (infinito)
    const img = document.getElementById('galleryImage');

    if (img) {
        img.classList.add('swapping'); // fade-out (ver .swapping no style.css)
        setTimeout(() => {
            img.src = galleryImages[galleryIndex];
            img.classList.remove('swapping'); // fade-in com a nova imagem
        }, 220);
    }

    document.querySelectorAll('.gallery-dot').forEach((dot, i) => {
        dot.classList.toggle('active', i === galleryIndex);
    });
}

// Autoplay: troca automática a cada 4s, em loop infinito
function startGalleryAutoplay() {
    stopGalleryAutoplay();
    if (galleryImages.length <= 1) return;
    galleryTimer = setInterval(() => showGalleryImage(galleryIndex + 1), GALLERY_AUTOPLAY_MS);
}

function stopGalleryAutoplay() {
    if (galleryTimer) {
        clearInterval(galleryTimer);
        galleryTimer = null;
    }
}

/* ---------- Modal de detalhes ---------- */

// Elemento que abriu o modal ("Ver Detalhes"): recebe o foco de volta ao fechar
let modalOpenerEl = null;

function openModal(id) {
    const product = state.products.find((p) => p.id === Number(id));
    if (!product) return;

    galleryImages = product.imagens;
    galleryIndex = 0;

    const modal = document.getElementById('productModal');
    const modalBody = document.getElementById('modalBody');

    const badge = product.selo
        ? `<span class="product-badge ${BADGE_CLASSES[product.selo] || 'badge-novo'}" style="position: static; margin-bottom: .7rem; display: inline-block;">${product.selo}</span>`
        : '';

    modalBody.innerHTML = `
        ${buildGallery(galleryImages, product.nome)}
        <div class="modal-info">
            ${badge}
            <span class="product-brand">${product.marca} • ${product.categoria}</span>
            <h2>${product.nome}</h2>
            <p>${product.descricao}</p>
            <ul>
                ${product.especificacoes.map((spec) => `<li>${spec}</li>`).join('')}
            </ul>
            <p class="modal-price">${formatCurrency(product.preco)}</p>
            <div class="product-actions">
                <a class="btn btn-whatsapp" href="${whatsappLink(product.nome)}" target="_blank" rel="noopener noreferrer">
                    <i class="fa-brands fa-whatsapp"></i> Comprar pelo WhatsApp
                </a>
            </div>
        </div>
        <div class="modal-info modal-installments">
            <h3 class="installments-title">Simulação de Parcelamento no Cartão</h3>
            ${buildInstallmentsTable(product.preco)}
        </div>
    `;

    // Pausa o autoplay quando o mouse está sobre a imagem; retoma ao sair
    const galleryMain = modalBody.querySelector('.gallery-main');
    if (galleryMain) {
        galleryMain.addEventListener('mouseenter', stopGalleryAutoplay);
        galleryMain.addEventListener('mouseleave', startGalleryAutoplay);
    }

    modalOpenerEl = document.activeElement; // normalmente o botão "Ver Detalhes"

    modal.classList.add('open');
    modal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('modal-open'); // trava o scroll da página atrás do modal
    document.getElementById('closeModal').focus();
    startGalleryAutoplay();
}

function closeModal() {
    const modal = document.getElementById('productModal');
    modal.classList.remove('open');
    modal.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('modal-open');
    stopGalleryAutoplay();

    // Devolve o foco ao botão que abriu o modal (acessibilidade por teclado)
    if (modalOpenerEl && document.contains(modalOpenerEl)) modalOpenerEl.focus();
    modalOpenerEl = null;
}

/* ---------- Tela de boas-vindas (Splash Screen) ---------- */

// Cada card da splash leva a uma área do site (data-target = âncora da
// seção: catálogo, TIM, assistência ou PayJoy). O card "Ver Tudo" não
// tem alvo: apenas fecha a splash e mostra a home desde o topo.
function initSplash() {
    document.body.classList.add('splash-active'); // trava o scroll do catálogo por trás da splash

    document.querySelectorAll('.splash-card').forEach((card) => {
        card.addEventListener('click', () => {
            const target = card.dataset.target || '';
            hideSplash();
            if (target) {
                const section = document.querySelector(target);
                if (section) section.scrollIntoView({ behavior: 'smooth' });
            }
        });
    });
}

function hideSplash() {
    const splash = document.getElementById('splashScreen');
    if (!splash) return;

    document.body.classList.remove('splash-active');
    splash.setAttribute('aria-hidden', 'true');
    splash.classList.add('fade-out'); // dispara a transição de opacidade (ver style.css)

    // Só remove a splash do fluxo de exibição depois que o fade-out termina,
    // para a animação não ser cortada no meio.
    splash.addEventListener('transitionend', () => {
        splash.classList.add('hidden');
    }, { once: true });
}

/* ---------- Cabeçalho: efeito blur/sombra ao rolar ---------- */

function initHeaderScroll() {
    const header = document.getElementById('siteHeader');
    const onScroll = () => header.classList.toggle('scrolled', window.scrollY > 10);
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll(); // estado inicial (ex: página recarregada já rolada)
}

/* ---------- Menu mobile (hambúrguer) ---------- */

function initMobileNav() {
    const toggle = document.getElementById('navToggle');

    toggle.addEventListener('click', () => {
        const open = document.body.classList.toggle('nav-open');
        toggle.setAttribute('aria-expanded', String(open));
        toggle.setAttribute('aria-label', open ? 'Fechar menu' : 'Abrir menu');
    });

    // Fecha o menu ao clicar em qualquer link/botão dele
    document.querySelectorAll('#mainNav a').forEach((link) => {
        link.addEventListener('click', () => {
            document.body.classList.remove('nav-open');
            toggle.setAttribute('aria-expanded', 'false');
        });
    });
}

/* ---------- Animações de scroll (fade-in / slide-up) ---------- */

function initScrollReveal() {
    const elements = document.querySelectorAll('.reveal');
    if (!('IntersectionObserver' in window)) {
        elements.forEach((el) => el.classList.add('revealed'));
        return;
    }

    const observer = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
            if (entry.isIntersecting) {
                entry.target.classList.add('revealed');
                observer.unobserve(entry.target); // anima apenas uma vez
            }
        });
    }, { threshold: 0.15 });

    elements.forEach((el) => observer.observe(el));
}

/* ---------- Contadores animados (números do hero) ---------- */

function animateCounter(el) {
    const target = Number(el.dataset.count);
    const suffix = el.dataset.suffix || '';
    const duration = 1400;
    const start = performance.now();

    function tick(now) {
        const progress = Math.min((now - start) / duration, 1);
        const eased = 1 - Math.pow(1 - progress, 3); // ease-out cúbico
        const value = Math.round(target * eased);
        // data-format="milhar" exibe o número com separador de milhar (ex: 5.000)
        el.textContent = (el.dataset.format === 'milhar' ? value.toLocaleString('pt-BR') : value) + suffix;
        if (progress < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
}

function initCounters() {
    const counters = document.querySelectorAll('.stat-number');

    // O HTML já traz o valor final (SEO/robustez: se o JS não rodar, o
    // número correto permanece). Sem IntersectionObserver, não animamos
    // e o valor final do HTML fica como está.
    if (!('IntersectionObserver' in window)) return;

    const observer = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
            if (entry.isIntersecting) {
                animateCounter(entry.target);
                observer.unobserve(entry.target); // conta apenas uma vez
            }
        });
    }, { threshold: 0.4 });

    counters.forEach((el) => {
        el.textContent = '0' + (el.dataset.suffix || ''); // zera só quando a animação vai rodar
        observer.observe(el);
    });
}

/* ---------- Links de WhatsApp com mensagem personalizada ---------- */

// Qualquer <a data-wa-message="..."> das novas seções (assistência, TIM,
// CTA final) ganha automaticamente o href formatado do WhatsApp com a
// mensagem já codificada. O href estático no HTML serve de fallback
// (abre a conversa sem texto) caso o JS não carregue.
function initWhatsAppMessageLinks() {
    document.querySelectorAll('a[data-wa-message]').forEach((link) => {
        link.href = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(link.dataset.waMessage)}`;
    });
}

/* ---------- Banner rotativo da Assistência Técnica ---------- */

// Frases exibidas em sequência no banner widescreen. A última é a
// "resposta" e ganha destaque em degradê (classe .highlight no CSS).
const ASSIST_PHRASES = ['Quebrou?', 'Molhou?', 'Parou de carregar?', 'A Thunder Cell tem a solução!'];
const ASSIST_ROTATE_MS = 2600; // tempo de exibição de cada frase
const ASSIST_FADE_MS = 350;    // deve acompanhar a transição de .assist-rotator no CSS

function initAssistRotator() {
    const el = document.getElementById('assistRotator');
    if (!el) return;

    // Com "reduzir movimento" ativo, exibe a frase final fixa, sem animação
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        el.textContent = ASSIST_PHRASES[ASSIST_PHRASES.length - 1];
        el.classList.add('highlight');
        return;
    }

    let index = 0;
    setInterval(() => {
        el.classList.add('is-leaving'); // fade-out da frase atual
        setTimeout(() => {
            index = (index + 1) % ASSIST_PHRASES.length;
            el.textContent = ASSIST_PHRASES[index];
            el.classList.toggle('highlight', index === ASSIST_PHRASES.length - 1);
            el.classList.remove('is-leaving'); // fade-in da nova frase
        }, ASSIST_FADE_MS);
    }, ASSIST_ROTATE_MS);
}

/* ---------- Eventos ---------- */

function bindEvents() {
    document.getElementById('searchInput').addEventListener('input', applyFilters);
    document.getElementById('categoriaFilter').addEventListener('change', (event) => {
        applyCategoryFilter(event.target.value);
    });

    document.getElementById('productsGrid').addEventListener('click', (event) => {
        const button = event.target.closest('.open-modal');
        if (button) openModal(button.dataset.id);
    });

    document.getElementById('closeModal').addEventListener('click', closeModal);
    document.getElementById('productModal').addEventListener('click', (event) => {
        if (event.target.id === 'productModal') closeModal();
    });

    // Navegação do carrossel: delega os cliques porque o conteúdo do modal
    // é recriado a cada produto aberto. Toda navegação manual reinicia o
    // cronômetro do autoplay, para a foto escolhida não trocar cedo demais.
    document.getElementById('modalBody').addEventListener('click', (event) => {
        if (event.target.closest('.gallery-prev')) {
            showGalleryImage(galleryIndex - 1);
            startGalleryAutoplay();
        } else if (event.target.closest('.gallery-next')) {
            showGalleryImage(galleryIndex + 1);
            startGalleryAutoplay();
        } else {
            const dot = event.target.closest('.gallery-dot');
            if (dot) {
                showGalleryImage(Number(dot.dataset.index));
                startGalleryAutoplay();
            }
        }
    });

    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') closeModal();

        const modalAberto = document.getElementById('productModal').classList.contains('open');
        if (!modalAberto) return;
        if (event.key === 'ArrowLeft') { showGalleryImage(galleryIndex - 1); startGalleryAutoplay(); }
        if (event.key === 'ArrowRight') { showGalleryImage(galleryIndex + 1); startGalleryAutoplay(); }
    });
}

document.addEventListener('DOMContentLoaded', () => {
    initSplash();
    initHeaderScroll();
    initMobileNav();
    initScrollReveal();
    initCounters();
    initWhatsAppMessageLinks();
    initAssistRotator();
    bindEvents();
    loadProducts();
});
