# DevConcurseiro.ms 🚀

Plataforma *local-first* de estudos inteligente e focada em aprovação. O projeto foi arquitetado especificamente para o concurso da **Petrobras — Ênfase 4: Engenharia de Software**, mas estruturado de forma modular e expansível para gerenciar múltiplos concursos, trilhas e programas de aprendizado (incluindo cursos e pós-graduação).

---

## 🏗️ Arquitetura do Sistema

O sistema é dividido em duas partes principais:

### 1. Backend (`/server`)
* **Core**: Node.js + Express.
* **Banco de Dados**: SQLite com o driver de alta performance `better-sqlite3`, operando em modo **WAL (Write-Ahead Logging)** para máxima velocidade em operações locais.
* **Segurança e Robustez**:
  * Migrations transacionais e automáticas controladas por versão na inicialização da aplicação.
  * Backup automatizado do banco de dados na pasta `data/backups/` a cada boot.
  * Proteção estrita contra *path traversal* (acesso a caminhos externos) e regras de exclusão estática (bloqueio de arquivos `.env`, `.db`, código-fonte, etc.).
  * Validação de payload em todas as rotas de escrita.
* **Integração de IA**: Sistema de compilação dinâmica de prompts com suporte à API do **Gemini (Google)** e caching de páginas lidas de PDFs em banco (`pdf_page_text_cache`) para geração rápida de simulados de 10 questões no estilo da banca.

### 2. Frontend (`/frontend`)
* **Core**: Vue 3 + Vite + TypeScript.
* **Biblioteca de Componentes**: PrimeVue (Aura Preset) com ícones da biblioteca PrimeIcons.
* **Gerenciamento de Estado**: Pinia.
* **Roteamento**: Vue Router.
* **Interface**: Tema escuro customizado e estilizado com base na identidade visual original, otimizado para longas sessões de estudo.

---

## 📁 Estrutura de Diretórios

```txt
DevConcurseiro.ms/
├── data/                      # Banco de dados e configurações de concursos
│   ├── estudos.db             # Banco SQLite local
│   ├── backups/               # Backups automáticos gerados no boot
│   └── contests/              # Configurações de concursos (ex: Petrobras)
├── server/                    # Backend (Express, DB, Services)
│   ├── db/                    # Conexão e scripts de migrations
│   ├── middleware/            # Tratamento de erros e controle de acesso
│   ├── routes/                # Rotas modularizadas da API
│   └── services/              # Serviços (Leitor PDF, Gerador IA, Seeder)
├── frontend/                  # Frontend (Vue 3, Vite, PrimeVue, Pinia)
│   ├── src/                   # Código-fonte (views, stores, assets, components)
│   ├── vite.config.ts         # Configuração do Vite (com Proxy configurado)
│   └── package.json           # Dependências do frontend
├── public/                    # Arquivos públicos e PDFs
└── package.json               # Dependências do backend e scripts raiz
```

---

## 🚀 Como Rodar o Projeto

Siga os passos abaixo para instalar e rodar a aplicação em seu ambiente local (Windows/macOS/Linux).

### Pré-requisitos
* **Node.js** (versão 18 ou superior recomendada)
* **npm** (instalado junto com o Node)
* **Chave de API do Gemini** (caso queira utilizar a funcionalidade de geração de exercícios por IA)

---

### Passo 1: Clonar o Repositório e Instalar as Dependências

Abra um terminal na raiz do projeto e instale as dependências do **backend**:
```bash
npm install
```

Navegue até a pasta `/frontend` e instale as dependências do **frontend**:
```bash
cd frontend
npm install
cd ..
```

---

### Passo 2: Configurar as Variáveis de Ambiente

Na pasta raiz do projeto, crie um arquivo `.env` a partir do exemplo fornecido:
```bash
copy .env.example .env
```
*(Se estiver no Linux/macOS, use `cp .env.example .env`)*

Abra o arquivo `.env` e configure suas variáveis:
```env
PORT=3000
DB_PATH=./data/estudos.db
PDF_ROOT=./public/pdfs
GEMINI_API_KEY=sua_chave_gemini_aqui
NODE_ENV=development
```

---

### Passo 3: Executar a Aplicação

Para rodar o projeto localmente em ambiente de desenvolvimento, recomenda-se iniciar o backend e o frontend em dois terminais separados.

#### Terminal 1: Iniciar o Backend
Na raiz do projeto, execute:
```bash
npm run dev
```
*O servidor backend subirá em `http://localhost:3000`. Ele criará o banco de dados caso não exista, executará todas as migrations pendentes e fará o seed inicial do concurso da Petrobras.*

#### Terminal 2: Iniciar o Frontend
Navegue até a pasta `/frontend` e inicie o servidor de desenvolvimento do Vite:
```bash
cd frontend
npm run dev
```
*O frontend subirá e estará acessível em `http://localhost:5173` (ou na porta indicada pelo Vite).*

Abra o navegador e acesse **`http://localhost:5173`**.

---

## 🛠️ Comandos Úteis

### Compilar o Frontend para Produção
Para verificar se as tipagens TypeScript estão corretas e gerar a build otimizada de produção do frontend:
```bash
cd frontend
npm run build
```

---

## 📝 Notas de Versão e Migrações
O banco de dados SQLite é automaticamente mantido atualizado através dos scripts localizados em `server/db/migrations/`. 

Se você já possuía progresso de estudo no app monolítico legado, a rota `/api/backup/import` detecta automaticamente backups antigos em formato JSON e os mapeia de forma transparente para a nova estrutura relacional modular.