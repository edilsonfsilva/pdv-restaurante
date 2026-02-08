-- Adicionar colunas de controle de estoque na tabela produtos
-- NULL = sem controle de estoque (ex: bebidas de fornecedor)
ALTER TABLE produtos ADD COLUMN IF NOT EXISTS estoque_quantidade INT DEFAULT NULL;
ALTER TABLE produtos ADD COLUMN IF NOT EXISTS estoque_minimo INT DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_produtos_estoque ON produtos(estoque_quantidade) WHERE estoque_quantidade IS NOT NULL;
