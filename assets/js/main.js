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
    filtered: [],
    activeCategoria: '' // categoria atualmente aplicada (via <select> ou via splash screen)
};

/* ---------- Utilitários ---------- */

function formatCurrency(value) {
    return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function whatsappLink(productName) {
    const message = `Olá! Tenho interesse no produto: ${productName}`;
    return `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`;
}

/* ---------- Carregamento dos produtos ---------- */

async function loadProducts() {
    const grid = document.getElementById('productsGrid');
    try {
        const response = await fetch('data/produtos.json');
        if (!response.ok) throw new Error('Não foi possível carregar o catálogo.');

        state.products = await response.json();
        state.filtered = [...state.products];

        populateCategoryFilter();
        renderProducts(state.filtered);
    } catch (error) {
        grid.innerHTML = `<div class="empty-state">${error.message}</div>`;
    } finally {
        resolveProductsReady(); // libera quem estiver aguardando o catálogo (ex: a splash screen)
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

function applyFilters() {
    const termo = document.getElementById('searchInput').value.trim().toLowerCase();

    state.filtered = state.products.filter((product) => {
        const matchNome = product.nome.toLowerCase().includes(termo);
        const matchCategoria = !state.activeCategoria || product.categoria === state.activeCategoria;
        return matchNome && matchCategoria;
    });

    renderProducts(state.filtered);
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

/* ---------- Renderização do catálogo ---------- */

function renderProducts(products) {
    const grid = document.getElementById('productsGrid');
    const resultsInfo = document.getElementById('resultsInfo');

    resultsInfo.textContent = `${products.length} produto${products.length === 1 ? '' : 's'} encontrado${products.length === 1 ? '' : 's'}`;

    if (!products.length) {
        grid.innerHTML = '<div class="empty-state">Nenhum produto encontrado com esse filtro.</div>';
        return;
    }

    grid.innerHTML = products.map(createProductCard).join('');
}

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
        <article class="product-card" style="--delay: ${delay}ms">
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

    modal.classList.add('open');
    modal.setAttribute('aria-hidden', 'false');
    startGalleryAutoplay();
}

function closeModal() {
    const modal = document.getElementById('productModal');
    modal.classList.remove('open');
    modal.setAttribute('aria-hidden', 'true');
    stopGalleryAutoplay();
}

/* ---------- Tela de boas-vindas (Splash Screen) ---------- */

// Resolvida quando loadProducts() termina (com sucesso ou erro). A splash
// aguarda essa promise antes de aplicar a categoria escolhida, evitando uma
// condição de corrida entre o clique do usuário e o fetch do produtos.json.
let resolveProductsReady;
const productsReady = new Promise((resolve) => { resolveProductsReady = resolve; });

function initSplash() {
    document.body.classList.add('splash-active'); // trava o scroll do catálogo por trás da splash

    document.querySelectorAll('.splash-card').forEach((card) => {
        card.addEventListener('click', () => {
            const categoria = card.dataset.categoria || '';
            hideSplash();
            selectSplashCategory(categoria);
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

async function selectSplashCategory(categoria) {
    await productsReady; // garante que os produtos e o <select> de categorias já existem no DOM
    applyCategoryFilter(categoria);
    document.getElementById('catalogo').scrollIntoView({ behavior: 'smooth' });
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
        el.textContent = Math.round(target * eased) + suffix;
        if (progress < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
}

function initCounters() {
    const counters = document.querySelectorAll('.stat-number');
    if (!('IntersectionObserver' in window)) {
        counters.forEach((el) => { el.textContent = el.dataset.count + (el.dataset.suffix || ''); });
        return;
    }

    const observer = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
            if (entry.isIntersecting) {
                animateCounter(entry.target);
                observer.unobserve(entry.target); // conta apenas uma vez
            }
        });
    }, { threshold: 0.4 });

    counters.forEach((el) => observer.observe(el));
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
    bindEvents();
    loadProducts();
});
