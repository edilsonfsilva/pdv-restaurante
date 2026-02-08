const bcrypt = require('bcrypt');
const { query } = require('./db');

const seedAdmin = async () => {
  try {
    // Verificar se a tabela usuarios existe
    const tableCheck = await query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_name = 'usuarios'
      )
    `);

    if (!tableCheck.rows[0].exists) {
      // Criar tabela se não existir
      await query(`
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
        )
      `);
      console.log('📋 Tabela usuarios criada');
    }

    // Verificar se coluna garcom_id existe em pedidos
    const colCheck = await query(`
      SELECT EXISTS (
        SELECT FROM information_schema.columns
        WHERE table_name = 'pedidos' AND column_name = 'garcom_id'
      )
    `);

    if (!colCheck.rows[0].exists) {
      await query('ALTER TABLE pedidos ADD COLUMN garcom_id INT REFERENCES usuarios(id)');
      console.log('📋 Coluna garcom_id adicionada a pedidos');
    }

    // Verificar se colunas de estoque existem
    const estoqueCheck = await query(`
      SELECT EXISTS (
        SELECT FROM information_schema.columns
        WHERE table_name = 'produtos' AND column_name = 'estoque_quantidade'
      )
    `);

    if (!estoqueCheck.rows[0].exists) {
      await query('ALTER TABLE produtos ADD COLUMN estoque_quantidade INT DEFAULT NULL');
      await query('ALTER TABLE produtos ADD COLUMN estoque_minimo INT DEFAULT NULL');
      console.log('📋 Colunas de estoque adicionadas a produtos');
    }

    // Verificar se já existe um admin
    const existing = await query("SELECT id FROM usuarios WHERE perfil = 'admin' LIMIT 1");

    if (existing.rows.length === 0) {
      const hash = await bcrypt.hash('admin123', 10);
      await query(
        'INSERT INTO usuarios (nome, email, senha_hash, perfil) VALUES ($1, $2, $3, $4)',
        ['Administrador', 'admin@restaurante.com', hash, 'admin']
      );
      console.log('👤 Admin padrão criado: admin@restaurante.com / admin123');
    }
  } catch (error) {
    console.error('❌ Erro no seed:', error.message);
  }
};

module.exports = seedAdmin;
