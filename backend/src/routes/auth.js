const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { query } = require('../db');
const { authMiddleware, roleMiddleware } = require('../middleware/auth');

const router = express.Router();

const JWT_SECRET = process.env.JWT_SECRET || 'pdv-restaurante-jwt-secret-dev';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '8h';

// POST /api/auth/login
router.post('/login', async (req, res, next) => {
  try {
    const { email, senha } = req.body;

    if (!email || !senha) {
      return res.status(400).json({ error: 'Email e senha são obrigatórios' });
    }

    const result = await query(
      'SELECT id, nome, email, senha_hash, perfil, ativo FROM usuarios WHERE email = $1',
      [email.toLowerCase().trim()]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Email ou senha inválidos' });
    }

    const usuario = result.rows[0];

    if (!usuario.ativo) {
      return res.status(401).json({ error: 'Usuário desativado. Contate o administrador.' });
    }

    const senhaValida = await bcrypt.compare(senha, usuario.senha_hash);

    if (!senhaValida) {
      return res.status(401).json({ error: 'Email ou senha inválidos' });
    }

    const token = jwt.sign(
      { id: usuario.id, perfil: usuario.perfil },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );

    res.json({
      token,
      usuario: {
        id: usuario.id,
        nome: usuario.nome,
        email: usuario.email,
        perfil: usuario.perfil,
      },
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/auth/me
router.get('/me', authMiddleware, async (req, res, next) => {
  try {
    const result = await query(
      'SELECT id, nome, email, perfil, created_at FROM usuarios WHERE id = $1 AND ativo = true',
      [req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    next(error);
  }
});

// POST /api/auth/registro (apenas admin)
router.post('/registro', authMiddleware, roleMiddleware('admin'), async (req, res, next) => {
  try {
    const { nome, email, senha, perfil } = req.body;

    if (!nome || !email || !senha) {
      return res.status(400).json({ error: 'Nome, email e senha são obrigatórios' });
    }

    const perfisValidos = ['admin', 'gerente', 'garcom', 'cozinheiro', 'caixa'];
    if (perfil && !perfisValidos.includes(perfil)) {
      return res.status(400).json({ error: `Perfil inválido. Válidos: ${perfisValidos.join(', ')}` });
    }

    // Verificar email duplicado
    const existing = await query('SELECT id FROM usuarios WHERE email = $1', [email.toLowerCase().trim()]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'Email já cadastrado' });
    }

    const senhaHash = await bcrypt.hash(senha, 10);

    const result = await query(
      `INSERT INTO usuarios (nome, email, senha_hash, perfil)
       VALUES ($1, $2, $3, $4)
       RETURNING id, nome, email, perfil, ativo, created_at`,
      [nome.trim(), email.toLowerCase().trim(), senhaHash, perfil || 'garcom']
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    next(error);
  }
});

// GET /api/auth/usuarios (admin - listar usuarios)
router.get('/usuarios', authMiddleware, roleMiddleware('admin', 'gerente'), async (req, res, next) => {
  try {
    const result = await query(
      'SELECT id, nome, email, perfil, ativo, created_at FROM usuarios ORDER BY nome'
    );
    res.json(result.rows);
  } catch (error) {
    next(error);
  }
});

// PUT /api/auth/usuarios/:id (admin - atualizar usuario)
router.put('/usuarios/:id', authMiddleware, roleMiddleware('admin'), async (req, res, next) => {
  try {
    const { id } = req.params;
    const { nome, email, senha, perfil, ativo } = req.body;

    const fields = [];
    const values = [];
    let idx = 1;

    if (nome) { fields.push(`nome = $${idx++}`); values.push(nome.trim()); }
    if (email) { fields.push(`email = $${idx++}`); values.push(email.toLowerCase().trim()); }
    if (perfil) { fields.push(`perfil = $${idx++}`); values.push(perfil); }
    if (ativo !== undefined) { fields.push(`ativo = $${idx++}`); values.push(ativo); }
    if (senha) {
      const hash = await bcrypt.hash(senha, 10);
      fields.push(`senha_hash = $${idx++}`);
      values.push(hash);
    }

    if (fields.length === 0) {
      return res.status(400).json({ error: 'Nenhum campo para atualizar' });
    }

    values.push(id);
    const result = await query(
      `UPDATE usuarios SET ${fields.join(', ')} WHERE id = $${idx}
       RETURNING id, nome, email, perfil, ativo`,
      values
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    next(error);
  }
});

module.exports = router;
