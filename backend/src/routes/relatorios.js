const express = require('express');
const { query } = require('../db');

const router = express.Router();

// GET /api/relatorios/vendas - Vendas por período
router.get('/vendas', async (req, res, next) => {
  try {
    const { periodo = 'day', data_inicio, data_fim } = req.query;

    const periodoMap = { diario: 'day', semanal: 'week', mensal: 'month', day: 'day', week: 'week', month: 'month' };
    const truncPeriodo = periodoMap[periodo] || 'day';

    let whereClause = "WHERE p.status = 'pago'";
    const params = [];

    if (data_inicio) {
      params.push(data_inicio);
      whereClause += ` AND p.closed_at >= $${params.length}`;
    }
    if (data_fim) {
      params.push(data_fim + ' 23:59:59');
      whereClause += ` AND p.closed_at <= $${params.length}`;
    }

    const result = await query(`
      SELECT
        DATE_TRUNC('${truncPeriodo}', p.closed_at) as periodo,
        COUNT(DISTINCT p.id) as total_pedidos,
        COALESCE(SUM(p.total), 0) as receita_total,
        COALESCE(AVG(p.total), 0) as ticket_medio,
        COALESCE(SUM(p.subtotal), 0) as subtotal,
        COALESCE(SUM(p.taxa_servico), 0) as taxa_servico,
        COALESCE(SUM(p.desconto), 0) as descontos
      FROM pedidos p
      ${whereClause}
      GROUP BY DATE_TRUNC('${truncPeriodo}', p.closed_at)
      ORDER BY periodo DESC
    `, params);

    // Totais gerais
    const totais = await query(`
      SELECT
        COUNT(DISTINCT p.id) as total_pedidos,
        COALESCE(SUM(p.total), 0) as receita_total,
        COALESCE(AVG(p.total), 0) as ticket_medio
      FROM pedidos p
      ${whereClause}
    `, params);

    res.json({
      periodos: result.rows,
      totais: totais.rows[0],
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/relatorios/produtos - Produtos mais vendidos
router.get('/produtos', async (req, res, next) => {
  try {
    const { data_inicio, data_fim, limit = 20 } = req.query;

    let whereClause = "WHERE p.status = 'pago' AND ip.status != 'cancelado'";
    const params = [];

    if (data_inicio) {
      params.push(data_inicio);
      whereClause += ` AND p.closed_at >= $${params.length}`;
    }
    if (data_fim) {
      params.push(data_fim + ' 23:59:59');
      whereClause += ` AND p.closed_at <= $${params.length}`;
    }

    params.push(parseInt(limit));

    const result = await query(`
      SELECT
        ip.produto_nome,
        ip.produto_id,
        SUM(ip.quantidade) as total_vendido,
        COALESCE(SUM(ip.subtotal), 0) as receita,
        COUNT(DISTINCT ip.pedido_id) as num_pedidos,
        ROUND(AVG(ip.preco_unitario), 2) as preco_medio
      FROM itens_pedido ip
      INNER JOIN pedidos p ON ip.pedido_id = p.id
      ${whereClause}
      GROUP BY ip.produto_nome, ip.produto_id
      ORDER BY total_vendido DESC
      LIMIT $${params.length}
    `, params);

    res.json(result.rows);
  } catch (error) {
    next(error);
  }
});

// GET /api/relatorios/categorias - Receita por categoria
router.get('/categorias', async (req, res, next) => {
  try {
    const { data_inicio, data_fim } = req.query;

    let whereClause = "WHERE p.status = 'pago' AND ip.status != 'cancelado'";
    const params = [];

    if (data_inicio) {
      params.push(data_inicio);
      whereClause += ` AND p.closed_at >= $${params.length}`;
    }
    if (data_fim) {
      params.push(data_fim + ' 23:59:59');
      whereClause += ` AND p.closed_at <= $${params.length}`;
    }

    const result = await query(`
      SELECT
        c.nome as categoria,
        c.icone,
        SUM(ip.quantidade) as itens_vendidos,
        COALESCE(SUM(ip.subtotal), 0) as receita,
        COUNT(DISTINCT ip.pedido_id) as num_pedidos
      FROM itens_pedido ip
      INNER JOIN produtos pr ON ip.produto_id = pr.id
      INNER JOIN categorias c ON pr.categoria_id = c.id
      INNER JOIN pedidos p ON ip.pedido_id = p.id
      ${whereClause}
      GROUP BY c.id, c.nome, c.icone
      ORDER BY receita DESC
    `, params);

    res.json(result.rows);
  } catch (error) {
    next(error);
  }
});

// GET /api/relatorios/garcons - Vendas por garçom
router.get('/garcons', async (req, res, next) => {
  try {
    const { data_inicio, data_fim } = req.query;

    let whereClause = "WHERE p.status = 'pago' AND p.garcom_id IS NOT NULL";
    const params = [];

    if (data_inicio) {
      params.push(data_inicio);
      whereClause += ` AND p.closed_at >= $${params.length}`;
    }
    if (data_fim) {
      params.push(data_fim + ' 23:59:59');
      whereClause += ` AND p.closed_at <= $${params.length}`;
    }

    const result = await query(`
      SELECT
        u.id as garcom_id,
        u.nome as garcom,
        COUNT(DISTINCT p.id) as total_pedidos,
        COALESCE(SUM(p.total), 0) as receita_total,
        COALESCE(AVG(p.total), 0) as ticket_medio
      FROM pedidos p
      INNER JOIN usuarios u ON p.garcom_id = u.id
      ${whereClause}
      GROUP BY u.id, u.nome
      ORDER BY receita_total DESC
    `, params);

    res.json(result.rows);
  } catch (error) {
    next(error);
  }
});

// GET /api/relatorios/horarios - Vendas por hora do dia
router.get('/horarios', async (req, res, next) => {
  try {
    const { data_inicio, data_fim } = req.query;

    let whereClause = "WHERE p.status = 'pago'";
    const params = [];

    if (data_inicio) {
      params.push(data_inicio);
      whereClause += ` AND p.closed_at >= $${params.length}`;
    }
    if (data_fim) {
      params.push(data_fim + ' 23:59:59');
      whereClause += ` AND p.closed_at <= $${params.length}`;
    }

    const result = await query(`
      SELECT
        EXTRACT(HOUR FROM p.created_at) as hora,
        COUNT(*) as total_pedidos,
        COALESCE(SUM(p.total), 0) as receita
      FROM pedidos p
      ${whereClause}
      GROUP BY EXTRACT(HOUR FROM p.created_at)
      ORDER BY hora
    `, params);

    res.json(result.rows);
  } catch (error) {
    next(error);
  }
});

// GET /api/relatorios/formas-pagamento - Breakdown por forma de pagamento
router.get('/formas-pagamento', async (req, res, next) => {
  try {
    const { data_inicio, data_fim } = req.query;

    let whereClause = 'WHERE 1=1';
    const params = [];

    if (data_inicio) {
      params.push(data_inicio);
      whereClause += ` AND pg.created_at >= $${params.length}`;
    }
    if (data_fim) {
      params.push(data_fim + ' 23:59:59');
      whereClause += ` AND pg.created_at <= $${params.length}`;
    }

    const result = await query(`
      SELECT
        pg.forma,
        COUNT(*) as quantidade,
        COALESCE(SUM(pg.valor), 0) as total
      FROM pagamentos pg
      ${whereClause}
      GROUP BY pg.forma
      ORDER BY total DESC
    `, params);

    res.json(result.rows);
  } catch (error) {
    next(error);
  }
});

module.exports = router;
