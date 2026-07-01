# Makefile para gerenciar o projeto DevConcurseiro (Frontend e Backend)

.PHONY: help install setup-env backend frontend dev

# Exibe os comandos disponíveis
help:
	@echo "Comandos disponíveis:"
	@echo "  make install    - Instala todas as dependências (backend e frontend)"
	@echo "  make setup-env  - Cria o arquivo .env a partir do .env.example (se não existir)"
	@echo "  make backend    - Inicia o servidor backend"
	@echo "  make frontend   - Inicia o servidor frontend"
	@echo "  make dev        - Inicia frontend e backend em paralelo (usa -j 2)"

# Garante que o arquivo .env exista copiando o .env.example (roda de forma portável via Node.js)
setup-env:
	@node -e "const fs = require('fs'); if (!fs.existsSync('.env')) { fs.copyFileSync('.env.example', '.env'); console.log('Arquivo .env criado com sucesso a partir de .env.example!'); } else { console.log('Arquivo .env já existe.'); }"

# Instala as dependências do backend e do frontend
install: setup-env
	@echo "Instalando dependências do backend (raiz)..."
	npm install
	@echo "Instalando dependências do frontend..."
	npm --prefix frontend install

# Inicia o backend
backend: setup-env
	@echo "Iniciando o backend..."
	npm run dev

# Inicia o frontend
frontend:
	@echo "Iniciando o frontend..."
	npm --prefix frontend run dev

# Inicia ambos os servidores em paralelo
dev: setup-env
	@echo "Iniciando frontend e backend em paralelo..."
	$(MAKE) -j 2 backend frontend
