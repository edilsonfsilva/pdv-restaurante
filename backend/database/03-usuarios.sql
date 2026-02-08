-- Tabela de usuarios do sistema
CREATE TABLE IF NOT EXISTS usuarios (
    id SERIAL PRIMARY KEY,
    nome VARCHAR(100) NOT NULL,
    email VARCHAR(150) NOT NULL UNIQUE,
    senha_hash VARCHAR(255) NOT NULL,
    perfil VARCHAR(20) NOT NULL DEFAULT 'garcom'
        CHECK (perfil IN ('admin', 'gerente', 'garcom', 'cozinheiro', 'caixa')),
    ativo BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_usuarios_email ON usuarios(email);
CREATE INDEX IF NOT EXISTS idx_usuarios_perfil ON usuarios(perfil);

CREATE TRIGGER tr_usuarios_updated
    BEFORE UPDATE ON usuarios
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Adicionar coluna garcom_id na tabela pedidos para rastrear quem criou o pedido
ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS garcom_id INT REFERENCES usuarios(id);
CREATE INDEX IF NOT EXISTS idx_pedidos_garcom ON pedidos(garcom_id);
