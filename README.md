# Thunder Cell — catálogo + painel administrativo

Site estático (HTML/CSS/JS puro, sem framework) publicado na Netlify, com
catálogo de aparelhos alimentado por um painel administrativo que a loja usa
pelo celular. Os produtos ficam no **Firebase Realtime Database** e as fotos
no **Cloudinary** — os dois no plano gratuito, sem servidor próprio.

Cadastrou no painel → aparece no site na hora, sem redeploy.

---

## Sumário

1. [Arquivos](#1-arquivos)
2. [Criar o projeto Firebase](#2-criar-o-projeto-firebase)
3. [Criar a conta Cloudinary](#3-criar-a-conta-cloudinary)
3.1. [Fotos sem fundo](#31-fotos-sem-fundo)
4. [Regras de segurança do banco](#4-regras-de-segurança-do-banco)
5. [Importar o catálogo antigo](#5-importar-o-catálogo-antigo-uma-vez-só)
6. [Ajustar os dados da loja](#6-ajustar-os-dados-da-loja)
7. [Rodar localmente](#7-rodar-localmente)
8. [Publicar na Netlify](#8-publicar-na-netlify)
9. [Usando o painel](#9-usando-o-painel)
10. [Como o catálogo chega na tela](#10-como-o-catálogo-chega-na-tela)
11. [Problemas comuns](#11-problemas-comuns)

---

## 1. Arquivos

| Arquivo | O que é |
|---|---|
| `index.html` | Página pública (hero, catálogo, garantia, sobre, assistência, rodapé) |
| `garantia.html` | Política de garantia e trocas |
| `admin.html` | Painel administrativo, servido em `/admin` (login + cadastro) |
| `assets/css/style.css` | Design system do site (cores, cards, botões, seções) |
| `assets/css/admin.css` | Só o que é específico do painel |
| `assets/js/main.js` | Catálogo público: carrega do Firebase, filtra, abre o modal |
| `assets/js/admin.js` | Painel: login, lista, formulário, upload, exclusão |
| `assets/js/produtos-utils.js` | Formato canônico do produto (usado pelos três) |
| `assets/js/produto-card.js` | HTML de um card — compartilhado entre navegador e build |
| **`assets/js/firebase-config.js`** | **Chaves do Firebase — preencher** |
| **`assets/js/image-config.js`** | **Cloud name + upload preset do Cloudinary — preencher** |
| **`assets/js/site-config.js`** | **Telefone, endereços, horários, prazo de garantia** |
| `scripts/build-catalog.js` | Pré-renderiza o catálogo no deploy (SEO) |
| `scripts/gerar-importacao-firebase.js` | Converte o catálogo antigo para o formato novo |
| `data/produtos.json` | Catálogo antigo. **Não alimenta mais o site** — serve só de material para a importação inicial (seção 5) |

> **O estoque vem do Firebase, ponto.** O `data/produtos.json` só entra em cena
> se o Firebase ainda não estiver configurado. Com ele configurado (é o caso
> hoje), o site e o build leem exclusivamente do banco.

> As chaves do Firebase e o upload preset do Cloudinary **não são segredo** —
> qualquer site que usa esses serviços as expõe no navegador. Quem protege os
> dados são as regras do banco (seção 4).

---

## 2. Criar o projeto Firebase

✅ **Já configurado.** O projeto `thundercell-49af1` está preenchido em
`assets/js/firebase-config.js`. Este projeto é exclusivo da Thunder Cell,
separado do site de leilão (Thunder Diecast).

Falta você fazer **dois passos no Console** (não dá para fazer pelo código):

1. **Criar o login do painel.** Console do Firebase → **Authentication** →
   **Vamos começar** → aba **Sign-in method** → ative **E-mail/senha**.
   Depois, aba **Users** → **Adicionar usuário** com o e-mail e a senha da loja.
   Sem isso, ninguém entra no `/admin`.
2. **Publicar as regras do banco** — veja a seção 4. **Isso é urgente:** hoje o
   banco ainda está com as regras de teste, ou seja, aberto.

> **Por que estas chaves estão no repositório?** Porque o site é estático: a
> Netlify publica exatamente o que está versionado, e o navegador precisa delas
> para se conectar. Chaves de cliente do Firebase são públicas por natureza —
> todo site que usa Firebase as expõe. Elas não dão acesso a nada sozinhas;
> quem controla o acesso são as regras da seção 4 e o login do Authentication.

---

## 3. Criar a conta Cloudinary

✅ **Já configurado.** Cloud name `ecryyjxy` e upload preset `thundercell`
estão em `assets/js/image-config.js`. Conta exclusiva da Thunder Cell.

Confira uma coisa no painel do Cloudinary (**Settings → Upload → Upload
presets → `thundercell`**):

- **Signing Mode** precisa estar em **`Unsigned`**. Se estiver `Signed`, o
  upload pelo painel falha com erro 401.
- **Folder**: `thundercell-produtos` (opcional, só organiza).

As fotos são salvas já com `f_auto,q_auto,c_limit,w_1200`: o Cloudinary entrega
WebP/AVIF comprimido e redimensionado, então o site fica leve mesmo com foto
tirada direto do celular.

### 3.1. Fotos sem fundo

O painel tenta recortar o fundo de toda foto nova automaticamente, deixando só
o aparelho — é a transformação `e_background_removal` do Cloudinary.

**Isso depende da sua conta ter essa transformação liberada.** Ela é cobrada
como transformação (não é mais um add-on separado) e contas criadas depois de
**1º de fevereiro de 2026** não conseguem assinar o add-on antigo. Confira em
**Settings → Add-ons** / no seu plano se o recurso está disponível.

Como o painel lida com isso — você não precisa fazer nada:

| Situação | O que acontece |
|---|---|
| Conta com o recurso liberado | A URL recortada é testada no upload e gravada no banco |
| Cloudinary ainda processando (HTTP 423) | O painel espera e tenta de novo (até 4 vezes) |
| Conta sem cota/plano (HTTP 403) | Grava a foto **original** e mostra o aviso "Recorte de fundo indisponível" |

Testar no upload tem dois motivos: o visitante nunca pega uma imagem a meio
processar, e uma conta sem o recurso **não** deixa o catálogo inteiro com foto
quebrada.

Para desligar o recorte, mude `removerFundo` para `false` em
`assets/js/image-config.js`. Fotos já cadastradas continuam como estão — para
recortá-las, reenvie a foto pelo painel.

> **Dica:** mesmo com o recorte automático, foto tirada sobre uma superfície
> lisa e bem iluminada gera um recorte bem melhor.

---

## 4. Regras de segurança do banco

> 🔴 **Faça isto antes de qualquer outra coisa.** Testei o banco e a leitura da
> raiz responde normalmente, o que indica que ele ainda está com as **regras de
> teste** — nesse estado, qualquer pessoa na internet pode ler *e apagar* seus
> produtos. As regras abaixo resolvem.

No Console do Firebase: **Realtime Database** → aba **Regras** → cole isto e
clique em **Publicar**.

```json
{
  "rules": {
    "produtos": {
      ".read": true,
      ".write": "auth != null"
    },
    ".read": false,
    ".write": false
  }
}
```

O que isso faz:

- **Leitura pública** de `produtos` — é assim que o site (e o script de build)
  monta o catálogo sem ninguém precisar logar.
- **Escrita só para quem está autenticado** — sem login do Firebase, qualquer
  tentativa de gravar é recusada pelo servidor. O login do painel controla só a
  interface; a barreira de verdade é esta regra.
- **Raiz fechada** (`".read": false` / `".write": false`) — nada além de
  `produtos` fica exposto, hoje ou no futuro.

### Versão opcional, mais rígida

As regras acima já garantem o essencial. Se quiser que o Firebase também
recuse dados malformados (útil como rede de segurança contra um bug no
painel), use esta versão no lugar:

```json
{
  "rules": {
    "produtos": {
      ".read": true,
      ".write": "auth != null",
      "$produtoId": {
        ".validate": "newData.hasChildren(['modelo','preco','fotos'])",
        "modelo":    { ".validate": "newData.isString() && newData.val().length > 0 && newData.val().length <= 120" },
        "preco":     { ".validate": "newData.isNumber() && newData.val() > 0" },
        "ativo":     { ".validate": "newData.isBoolean()" },
        "destaque":  { ".validate": "newData.isBoolean()" },
        "bateria":   { ".validate": "newData.isNumber() && newData.val() >= 0 && newData.val() <= 100" },
        "condicao":  { ".validate": "newData.val() == '' || newData.val() == 'Boa' || newData.val() == 'Muito boa' || newData.val() == 'Excelente'" },
        "status":    { ".validate": "newData.val() == 'Seminovo' || newData.val() == 'Novo'" },
        "categoria": { ".validate": "newData.val() == 'novo' || newData.val() == 'usado'" },
        "fotos":     { ".validate": "newData.hasChildren()" }
      }
    },
    ".read": false,
    ".write": false
  }
}
```

### Duas ressalvas honestas sobre a leitura pública

`".read": true` em `produtos` libera o nó inteiro. Isso significa que:

- **Produtos inativos também são legíveis** por quem consultar a API direto.
  O site esconde os inativos, mas eles não são secretos. O Realtime Database
  não consegue filtrar por campo na leitura de uma lista — para esconder de
  verdade, seria preciso separar em outro nó (`rascunhos/`), o que não vale a
  complexidade aqui.
- **`observacoes` fica acessível** pelo mesmo motivo. O campo não aparece em
  lugar nenhum do site (o `produtos-utils.js` nem o carrega para o objeto
  público), mas **não escreva ali nada sigiloso** — use para anotações
  operacionais, tipo "comprado do cliente X por Y".

---

## 5. Importar o catálogo antigo (uma vez só)

> ℹ️ **Hoje o banco está vazio** — o site mostra "Estoque em atualização" até
> existir algum produto. Você tem duas opções: importar o catálogo antigo
> (abaixo) ou cadastrar os aparelhos direto no `/admin`. Se o plano é começar
> só com o estoque atual da loja, pode pular esta seção inteira.

Para não começar com a loja vazia:

```bash
node scripts/gerar-importacao-firebase.js
```

Isso gera `data/importar-no-firebase.json`. No Console do Firebase:
**Realtime Database** → menu **⋮** ao lado do nó raiz → **Importar JSON** →
escolha o arquivo.

Depois disso, revise cada produto no painel para preencher **bateria** e
**condição** (o catálogo antigo não tinha esses campos).

---

## 6. Ajustar os dados da loja

Tudo o que muda com o tempo está em **`assets/js/site-config.js`**: telefone do
WhatsApp, prazos de garantia, texto padrão de parcelamento, endereços das duas
unidades, horários, Instagram e CNPJ. Alterou lá → o header, o botão flutuante,
a seção de garantia, o modal do produto, a política e o rodapé se atualizam
sozinhos.

**Prazos de garantia** ficam em `siteConfig.garantia` e são diferentes por tipo
de aparelho:

```js
garantia: {
  Novo:     { texto: "1 ano",   detalhe: "contra defeitos de fabricação" },
  Seminovo: { texto: "90 dias", detalhe: "sobre o funcionamento do aparelho" },
},
```

Todo lugar do site que cita um prazo lê daqui (o HTML usa
`data-garantia="Novo"` / `data-garantia="Seminovo"`), então mudar a política é
editar essas duas linhas.

---

## 7. Rodar localmente

O site usa módulos ES (`import`), que **não funcionam abrindo o arquivo com
duplo clique** (o navegador bloqueia por CORS). Suba um servidor local:

```bash
npx serve .
# ou
python -m http.server 8000
```

Depois abra <http://localhost:8000> (site) e
<http://localhost:8000/admin.html> (painel).

Para regenerar o HTML pré-renderizado:

```bash
node scripts/build-catalog.js
```

---

## 8. Publicar na Netlify

O `netlify.toml` já está pronto: build `node scripts/build-catalog.js`,
publish `.`. Basta conectar o repositório — cada `git push` gera um deploy.

Lembre-se: **cadastrar produto não precisa de deploy.** O deploy só atualiza o
HTML pré-renderizado (SEO) e o código.

---

## 9. Usando o painel

Endereço: `https://thundercell.netlify.app/admin`

- **Entrar** com o e-mail/senha criados no passo 2.4.
- **+ Novo produto** abre o formulário. Obrigatórios: **modelo**, **preço** e
  **ao menos uma foto**.
- **Fotos:** toque na área tracejada para escolher da galeria ou tirar na hora
  (ou arraste os arquivos, no computador). A **primeira foto é a capa** do card;
  use as setas `‹ ›` para reordenar e a lixeira para remover antes de salvar.
- **Status** decide em qual seção do site o produto entra: *Novo* vai para
  "Aparelhos novos", *Seminovo* para "Aparelhos seminovos". O selo do card e o
  prazo de garantia mostrado seguem esse campo.
- **Destaque:** joga o produto para o topo do seu grupo, com selo laranja sólido.
- **Ativo:** desligado, o produto some do site mas continua no painel.
- Na lista, **Ativo** e **Destaque** também podem ser ligados/desligados com um
  toque, sem abrir o formulário.
- **Observações internas** nunca aparecem no site (leia a ressalva na seção 4).

Dica: salve o painel na tela inicial do celular (menu do navegador → "Adicionar
à tela de início") para abrir como se fosse um app.

---

## 10. Como o catálogo chega na tela

```
Painel admin ──grava──> Firebase Realtime Database
                              │
                              ├──> navegador do visitante (onValue, ao vivo)
                              │        └── é o que ele realmente vê
                              │
                              └──> build na Netlify (REST, no deploy)
                                       └── cards no index.html, para Google
                                           e para a primeira pintura
```

Se o Firebase não responder no navegador (internet ruim do visitante), o site
mostra a cópia embutida no HTML — que é um retrato do próprio banco, tirado no
último deploy — e avisa para confirmar a disponibilidade pelo WhatsApp. Nunca
uma tela vazia, e nunca o catálogo antigo.

Se o Firebase não responder **durante o build**, o script não sobrescreve nada:
mantém o último catálogo pré-renderizado e deixa o deploy passar. Assim uma
instabilidade do Firebase nunca coloca no ar aparelhos que já foram vendidos.

---

## 11. Problemas comuns

| Sintoma | Causa provável |
|---|---|
| Painel abre já mostrando avisos amarelos | `firebase-config.js` ou `image-config.js` ainda com `COLE_AQUI` |
| "E-mail ou senha incorretos" com a senha certa | O usuário não foi criado em *Authentication > Users*, ou o método E-mail/senha não está ativo |
| Salva e aparece "Sem permissão para salvar" | Regras do banco não publicadas (seção 4) |
| Foto não envia | Upload preset não está como **Unsigned**, ou o cloud name está errado |
| Produto salvo não aparece no site | O interruptor **Ativo** está desligado |
| Aviso "Recorte de fundo indisponível" | A conta Cloudinary não tem essa transformação liberada (seção 3.1) — a foto é salva sem recorte |
| Produto aparece no grupo errado | O campo **Status** (Novo/Seminovo) define em qual seção do catálogo ele entra |
| Site em branco e erro de CORS no console | Abriu o `index.html` por duplo clique — use um servidor local (seção 7) |
| Build do Netlify avisa "Firebase indisponível" | Normal antes de configurar; ele usa o `data/produtos.json` |
