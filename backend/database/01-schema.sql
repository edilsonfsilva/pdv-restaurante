-- PDV Restaurante - Schema do Banco de Dados
-- Executa automaticamente ao subir o container PostgreSQL

-- Categorias de produtos
CREATE TABLE categorias (
    id SERIAL PRIMARY KEY,
    nome VARCHAR(100) NOT NULL,
    icone VARCHAR(50),
    ordem INT DEFAULT 0,
    ativo BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Produtos do cardápio
CREATE TABLE produtos (
    id SERIAL PRIMARY KEY,
    categoria_id INT REFERENCES categorias(id) ON DELETE SET NULL,
    codigo VARCHAR(20),
    nome VARCHAR(150) NOT NULL,
    descricao TEXT,
    preco DECIMAL(10,2) NOT NULL,
    imagem_url VARCHAR(255),
    tempo_preparo INT DEFAULT 15, -- minutos
    ativo BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Mesas do restaurante
CREATE TABLE mesas (
    id SERIAL PRIMARY KEY,
    numero VARCHAR(20) NOT NULL UNIQUE,
    capacidade INT DEFAULT 4,
    localizacao VARCHAR(50), -- salao, varanda, vip
    status VARCHAR(20) DEFAULT 'livre', -- livre, ocupada, reservada
    created_at TIMESTAMP DEFAULT NOW()
);

-- Pedidos
CREATE TABLE pedidos (
    id SERIAL PRIMARY KEY,
    mesa_id INT REFERENCES mesas(id) ON DELETE SET NULL,
    tipo VARCHAR(20) DEFAULT 'mesa', -- mesa, balcao, delivery
    cliente_nome VARCHAR(100),
    status VARCHAR(20) DEFAULT 'aberto', -- aberto, producao, pronto, pago, cancelado
    subtotal DECIMAL(10,2) DEFAULT 0,
    desconto DECIMAL(10,2) DEFAULT 0,
    taxa_servico DECIMAL(10,2) DEFAULT 0,
    total DECIMAL(10,2) DEFAULT 0,
    observacao TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    closed_at TIMESTAMP
);

-- Itens do pedido
CREATE TABLE itens_pedido (
    id SERIAL PRIMARY KEY,
    pedido_id INT REFERENCES pedidos(id) ON DELETE CASCADE,
    produto_id INT REFERENCES produtos(id) ON DELETE SET NULL,
    produto_nome VARCHAR(150) NOT NULL, -- snapshot do nome
    quantidade INT NOT NULL DEFAULT 1,
    preco_unitario DECIMAL(10,2) NOT NULL,
    subtotal DECIMAL(10,2) NOT NULL,
    observacao TEXT,
    status VARCHAR(20) DEFAULT 'pendente', -- pendente, preparando, pronto, entregue, cancelado
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Pagamentos
CREATE TABLE pagamentos (
    id SERIAL PRIMARY KEY,
    pedido_id INT REFERENCES pedidos(id) ON DELETE CASCADE,
    forma VARCHAR(50) NOT NULL, -- dinheiro, pix, credito, debito
    valor DECIMAL(10,2) NOT NULL,
    troco DECIMAL(10,2) DEFAULT 0,
    observacao VARCHAR(255),
    created_at TIMESTAMP DEFAULT NOW()
);

-- Índices para performance
CREATE INDEX idx_pedidos_status ON pedidos(status);
CREATE INDEX idx_pedidos_mesa ON pedidos(mesa_id);
CREATE INDEX idx_pedidos_created ON pedidos(created_at DESC);
CREATE INDEX idx_itens_pedido ON itens_pedido(pedido_id);
CREATE INDEX idx_itens_status ON itens_pedido(status);
CREATE INDEX idx_produtos_categoria ON produtos(categoria_id);
CREATE INDEX idx_produtos_ativo ON produtos(ativo);

-- Trigger para atualizar updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tr_pedidos_updated
    BEFORE UPDATE ON pedidos
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER tr_itens_updated
    BEFORE UPDATE ON itens_pedido
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER tr_produtos_updated
    BEFORE UPDATE ON produtos
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Função para recalcular total do pedido
CREATE OR REPLACE FUNCTION recalcular_pedido(p_pedido_id INT)
RETURNS VOID AS $$
DECLARE
    v_subtotal DECIMAL(10,2);
    v_taxa DECIMAL(10,2);
    v_desconto DECIMAL(10,2);
BEGIN
    SELECT COALESCE(SUM(subtotal), 0) INTO v_subtotal
    FROM itens_pedido
    WHERE pedido_id = p_pedido_id AND status != 'cancelado';
    
    SELECT desconto INTO v_desconto FROM pedidos WHERE id = p_pedido_id;
    
    v_taxa := v_subtotal * 0.10; -- 10% taxa de serviço
    
    UPDATE pedidos
    SET subtotal = v_subtotal,
        taxa_servico = v_taxa,
        total = v_subtotal + v_taxa - COALESCE(v_desconto, 0)
    WHERE id = p_pedido_id;
END;
$$ LANGUAGE plpgsql;
