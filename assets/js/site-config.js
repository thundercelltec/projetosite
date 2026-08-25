// ============================================================================
// site-config.js — Thunder Cell
// ----------------------------------------------------------------------------
// Tudo o que a loja costuma querer trocar sem mexer no HTML: telefone, prazo
// de garantia, endereços, horários e os textos das seções institucionais.
// Alterou aqui → o site público se atualiza no próximo carregamento.
// ============================================================================

export const siteConfig = {
  nome: "Thunder Cell",
  cidade: "Tangará-SC",
  urlSite: "https://thundercell.netlify.app",

  // --- Contato -------------------------------------------------------------
  whatsapp: "5549998404821", // só dígitos, com DDI 55
  whatsappExibicao: "(49) 99840-4821",
  instagram: "https://www.instagram.com/thundercelltec",
  instagramExibicao: "@thundercelltec",

  // Mensagem padrão do botão flutuante / CTA do topo
  mensagemPadrao: "Olá! Vim pelo site e gostaria de atendimento.",

  // --- Garantia ------------------------------------------------------------
  // O prazo depende do estado do aparelho: novo tem garantia de fábrica de um
  // ano; seminovo tem a garantia da loja, de 90 dias. Os dois textos aparecem
  // na seção "Garantia e informações", no modal do produto e na política.
  garantia: {
    Novo: { texto: "1 ano", detalhe: "contra defeitos de fabricação" },
    Seminovo: { texto: "90 dias", detalhe: "sobre o funcionamento do aparelho" },
  },

  // --- Parcelamento --------------------------------------------------------
  // Texto usado quando o produto não tem um texto de parcelamento próprio
  // (campo "parcelamento" no admin). Deixe "" para não mostrar nada.
  parcelamentoPadrao: "Em até 12x com juros da máquina",
  payjoyUrl:
    "https://www.payjoy.com/br/pfsh-valueprop?utm_source=admin_br&utm_medium=admin_link&utm_campaign=admin_br_admin_link&utm_content=17930",

  // --- Endereços -----------------------------------------------------------
  unidades: [
    {
      rotulo: "Matriz",
      endereco: "Rua Francisco Nardi, 10, Sala 3, Centro — Tangará-SC, CEP 89642-000",
      mapa: "https://www.google.com/maps/search/?api=1&query=Rua+Francisco+Nardi+10+Centro+Tangar%C3%A1+SC+89642-000",
    },
    {
      rotulo: "Filial",
      endereco: "Rua Irmãos Picolli, 280, Centro — Tangará-SC, CEP 89642-000",
      mapa: "https://www.google.com/maps/search/?api=1&query=Rua+Irm%C3%A3os+Picolli+280+Centro+Tangar%C3%A1+SC+89642-000",
    },
  ],

  // --- Horários ------------------------------------------------------------
  horarios: [
    "Segunda a sexta: 8h às 12h · 13h às 18h",
    "Sábados: 8h30 às 12h",
  ],

  // --- Dados legais --------------------------------------------------------
  razaoSocial: "THUNDERCELL COMÉRCIO DE CELULARES LTDA.",
  cnpj: "52.315.101/0001-55",
};

/**
 * Monta um link do WhatsApp já com a mensagem pronta.
 * Usado no header, no botão flutuante e em cada card de produto.
 */
export function linkWhatsapp(mensagem = siteConfig.mensagemPadrao) {
  const texto = encodeURIComponent(mensagem);
  return `https://wa.me/${siteConfig.whatsapp}?text=${texto}`;
}

/** Mensagem padrão de interesse num produto. */
export function mensagemInteresse(nomeProduto) {
  return `Olá! Tenho interesse no ${nomeProduto}. Ele ainda está disponível?`;
}

/** Mensagem de quem quer ser avisado quando um esgotado voltar. */
export function mensagemAvisoRetorno(nomeProduto) {
  return `Olá! O ${nomeProduto} está esgotado no site. Podem me avisar quando chegar?`;
}

/**
 * Garantia que vale para um determinado status ("Novo" | "Seminovo").
 * Qualquer valor inesperado cai no prazo mais curto — errar para menos é o
 * lado seguro de uma promessa feita ao cliente.
 */
export function garantiaDoStatus(status) {
  return siteConfig.garantia[status] || siteConfig.garantia.Seminovo;
}
