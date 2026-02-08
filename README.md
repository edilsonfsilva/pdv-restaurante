# 🍽️ PDV Restaurante

Sistema de Ponto de Venda básico para restaurantes, desenvolvido com Node.js, React e PostgreSQL.

## 📋 Funcionalidades

- **Mapa de Mesas**: Visualização em tempo real do status de todas as mesas
- **PDV**: Lançamento de pedidos com cardápio categorizado
- **KDS (Kitchen Display)**: Tela para cozinha com gestão de itens em produção
- **Caixa**: Fechamento de contas com múltiplas formas de pagamento
- **Tempo Real**: Atualizações instantâneas via Socket.IO

## 🛠️ Tecnologias

| Camada | Tecnologia |
|--------|------------|
| Frontend | React 18 + Vite + Tailwind CSS |
| Backend | Node.js + Express + Socket.IO |
| Banco | PostgreSQL 15 |
| Container | Docker + Docker Compose |

## 🚀 Como Executar

### Pré-requisitos

- Docker e Docker Compose
- Node.js 18+ (para desenvolvimento local)

### 1. Subir o banco de dados

```bash
docker-compose up -d postgres
```

Isso criará o banco `pdv_restaurante` com o schema e dados de exemplo (cardápio pernambucano).

### 2. Configurar o Backend

```bash
cd backend
cp .env.example .env  # Copiar configuração
npm install
npm run dev
```

O servidor iniciará em `http://localhost:3001`

### 3. Configurar o Frontend

```bash
cd frontend
npm install
npm run dev
```

O frontend estará disponível em `http://localhost:5173`

## 📱 Telas

### Mapa de Mesas (`/`)
Visão geral das mesas com status (livre/ocupada/reservada). Clique em uma mesa para abrir ou acessar o pedido.

### PDV (`/pdv` ou `/pdv/:mesaId`)
Tela de lançamento de pedidos:
- Busca de produtos
- Categorias do cardápio
- Adição de itens com observações
- Visualização do pedido em tempo real

### KDS - Cozinha (`/kds`)
Tela para monitores na cozinha:
- Pedidos em produção
- Tempo de espera de cada item
- Marcar itens como "preparando" ou "pronto"
- Atualização automática em tempo real

### Caixa (`/caixa`)
Tela de fechamento:
- Lista de pedidos para pagamento
- Formas de pagamento (Dinheiro, PIX, Crédito, Débito)
- Cálculo de troco
- Resumo do dia

## 🔌 API Endpoints

### Categorias
- `GET /api/categorias` - Listar categorias

### Produtos
- `GET /api/produtos` - Listar produtos
- `GET /api/produtos/cardapio` - Cardápio agrupado

### Mesas
- `GET /api/mesas` - Listar mesas com status
- `GET /api/mesas/:id` - Detalhes da mesa com pedido ativo
- `PUT /api/mesas/:id/status` - Atualizar status

### Pedidos
- `GET /api/pedidos` - Listar pedidos
- `GET /api/pedidos/cozinha` - Pedidos para KDS
- `POST /api/pedidos` - Criar pedido
- `POST /api/pedidos/:id/itens` - Adicionar item
- `PUT /api/pedidos/:id/itens/:itemId/status` - Atualizar status do item
- `DELETE /api/pedidos/:id/itens/:itemId` - Remover item
- `PUT /api/pedidos/:id/fechar` - Fechar pedido
- `PUT /api/pedidos/:id/cancelar` - Cancelar pedido

### Pagamentos
- `GET /api/pagamentos` - Listar pagamentos
- `GET /api/pagamentos/resumo` - Resumo do dia
- `POST /api/pagamentos` - Registrar pagamento

## 🔄 Eventos Socket.IO

| Evento | Direção | Descrição |
|--------|---------|-----------|
| `pedido-criado` | Server → Client | Novo pedido criado |
| `pedido-atualizado` | Server → Client | Pedido teve itens alterados |
| `pedido-fechado` | Server → Client | Pedido foi pago e fechado |
| `pedido-cancelado` | Server → Client | Pedido cancelado |
| `mesa-atualizada` | Server → Client | Status da mesa mudou |
| `novo-item` | Server → Cozinha | Novo item para produção |
| `item-atualizado` | Server → All | Status do item mudou |
| `pagamento-registrado` | Server → Client | Pagamento efetuado |
| `join-room` | Client → Server | Entrar em sala (ex: "cozinha") |

## 🏗️ Estrutura do Projeto

```
pdv-restaurante/
├── backend/
│   ├── database/           # SQL de schema e seed
│   ├── src/
│   │   ├── routes/         # Rotas da API
│   │   ├── app.js          # Servidor Express
│   │   └── db.js           # Conexão PostgreSQL
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── pages/          # Componentes de página
│   │   ├── services/       # Chamadas à API
│   │   ├── contexts/       # Context API (Socket)
│   │   └── App.jsx         # Roteamento
│   └── package.json
└── docker-compose.yml
```

## 📝 Próximos Passos

Para evoluir o sistema, considere implementar:

1. **Autenticação**: Login de usuários com níveis de acesso
2. **Impressão**: Integração com impressoras térmicas (ESC/POS)
3. **NFC-e/SAT**: Emissão de documentos fiscais
4. **TEF**: Integração com maquinetas de cartão
5. **Relatórios**: Dashboard com métricas de vendas
6. **Delivery**: Integração com iFood, Rappi, etc.
7. **Estoque**: Controle de insumos
8. **PWA**: Funcionamento offline

## 📄 Licença

MIT - Sinta-se livre para usar e modificar conforme necessário.
