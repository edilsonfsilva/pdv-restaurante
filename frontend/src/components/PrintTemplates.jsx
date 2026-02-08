/**
 * All functions return HTML strings (not JSX) for use with printContent().
 */

function formatCurrency(value) {
  return `R$ ${parseFloat(value || 0).toFixed(2)}`
}

function formatDateTime(dateStr) {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  return d.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatTime(dateStr) {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  return d.toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
  })
}

/**
 * Kitchen order slip (comanda de cozinha)
 * Shows table number, items with quantities & observations, and timestamp
 */
export function ComandaCozinha({ pedido }) {
  const itens = pedido.itens || []
  const agora = new Date().toLocaleString('pt-BR')
  const mesaLabel = pedido.mesa_numero
    ? `MESA ${pedido.mesa_numero}`
    : 'BALCAO'

  const itensHtml = itens
    .map(
      (item) => `
      <div class="item-row">
        <span class="item-name">${item.quantidade}x ${item.produto_nome || item.nome}</span>
      </div>
      ${
        item.observacao
          ? `<div class="item-obs">* ${item.observacao}</div>`
          : ''
      }
    `
    )
    .join('')

  return `
    <div class="header">*** COZINHA ***</div>
    <div class="header">${mesaLabel}</div>
    <div class="center small">Pedido #${pedido.id}</div>
    <div class="center small">${agora}</div>
    <hr class="dashed-line" />
    ${itensHtml}
    <hr class="dashed-line" />
    ${
      pedido.observacao
        ? `<div class="mt"><strong>OBS:</strong> ${pedido.observacao}</div><hr class="dashed-line" />`
        : ''
    }
    <div class="center small mt">Impresso em ${formatTime(new Date().toISOString())}</div>
  `
}

/**
 * Payment receipt (cupom de pagamento)
 * Shows restaurant header, items, subtotal, tax, total, payments, and change
 */
export function CupomPagamento({ pedido, pagamentos = [] }) {
  const itens = pedido.itens || []
  const mesaLabel = pedido.mesa_numero
    ? `Mesa ${pedido.mesa_numero}`
    : 'Balcao'

  const itensHtml = itens
    .map(
      (item) => `
      <div class="item-row">
        <span class="item-name">${item.quantidade}x ${item.produto_nome || item.nome}</span>
        <span class="item-price">${formatCurrency(item.subtotal)}</span>
      </div>
    `
    )
    .join('')

  const subtotal = parseFloat(pedido.subtotal || 0)
  const taxaServico = parseFloat(pedido.taxa_servico || 0)
  const total = parseFloat(pedido.total || 0)

  const totalPago = pagamentos.reduce(
    (sum, p) => sum + parseFloat(p.valor || 0),
    0
  )
  const troco = totalPago > total ? totalPago - total : 0

  const metodosMap = {
    dinheiro: 'Dinheiro',
    credito: 'Cartao Credito',
    debito: 'Cartao Debito',
    pix: 'PIX',
  }

  const pagamentosHtml = pagamentos
    .map(
      (p) => `
      <div class="item-row">
        <span>${metodosMap[p.metodo] || p.metodo}</span>
        <span class="item-price">${formatCurrency(p.valor)}</span>
      </div>
    `
    )
    .join('')

  return `
    <div class="header">PDV RESTAURANTE</div>
    <div class="center small">CNPJ: 00.000.000/0001-00</div>
    <div class="center small">Rua Exemplo, 123 - Centro</div>
    <hr class="dashed-line" />
    <div class="item-row">
      <span>${mesaLabel}</span>
      <span>Pedido #${pedido.id}</span>
    </div>
    <div class="center small">${formatDateTime(pedido.created_at || new Date().toISOString())}</div>
    <hr class="dashed-line" />
    ${itensHtml}
    <hr class="dashed-line" />
    <div class="item-row">
      <span>Subtotal</span>
      <span>${formatCurrency(subtotal)}</span>
    </div>
    <div class="item-row">
      <span>Taxa Servico (10%)</span>
      <span>${formatCurrency(taxaServico)}</span>
    </div>
    <div class="total-row mt">
      <span>TOTAL</span>
      <span>${formatCurrency(total)}</span>
    </div>
    <hr class="dashed-line" />
    <div class="bold mb">PAGAMENTO:</div>
    ${pagamentosHtml}
    ${
      troco > 0
        ? `<div class="item-row mt"><span class="bold">TROCO</span><span class="item-price">${formatCurrency(troco)}</span></div>`
        : ''
    }
    <hr class="dashed-line" />
    <div class="center small mt">Obrigado pela preferencia!</div>
    <div class="center small">Volte sempre!</div>
    <div class="center small mt">${formatDateTime(new Date().toISOString())}</div>
  `
}

/**
 * Daily summary report (relatorio diario)
 * Shows a summary table with key metrics
 */
export function RelatorioDiario({ resumo, data }) {
  const dataFormatada = data
    ? new Date(data + 'T12:00:00').toLocaleDateString('pt-BR')
    : new Date().toLocaleDateString('pt-BR')

  const rows = [
    { label: 'Total de Pedidos', value: resumo.total_pedidos || 0 },
    { label: 'Pedidos Finalizados', value: resumo.pedidos_finalizados || 0 },
    { label: 'Pedidos Cancelados', value: resumo.pedidos_cancelados || 0 },
    { label: 'Faturamento Bruto', value: formatCurrency(resumo.faturamento_bruto) },
    { label: 'Taxa de Servico', value: formatCurrency(resumo.taxa_servico_total) },
    { label: 'Faturamento Liquido', value: formatCurrency(resumo.faturamento_liquido) },
    { label: 'Ticket Medio', value: formatCurrency(resumo.ticket_medio) },
  ]

  const pagamentosHtml = (resumo.pagamentos_por_metodo || [])
    .map(
      (p) => `
      <tr>
        <td>${p.metodo}</td>
        <td style="text-align:right">${formatCurrency(p.total)}</td>
      </tr>
    `
    )
    .join('')

  const resumoRowsHtml = rows
    .map(
      (r) => `
      <tr>
        <td>${r.label}</td>
        <td style="text-align:right">${r.value}</td>
      </tr>
    `
    )
    .join('')

  return `
    <div class="header">RELATORIO DIARIO</div>
    <div class="center">${dataFormatada}</div>
    <hr class="dashed-line" />
    <table>
      <thead>
        <tr>
          <th>Indicador</th>
          <th style="text-align:right">Valor</th>
        </tr>
      </thead>
      <tbody>
        ${resumoRowsHtml}
      </tbody>
    </table>
    ${
      pagamentosHtml
        ? `
        <hr class="dashed-line" />
        <div class="bold mt mb">Pagamentos por Metodo:</div>
        <table>
          <thead>
            <tr>
              <th>Metodo</th>
              <th style="text-align:right">Total</th>
            </tr>
          </thead>
          <tbody>
            ${pagamentosHtml}
          </tbody>
        </table>
      `
        : ''
    }
    <hr class="dashed-line" />
    <div class="center small mt">Impresso em ${formatDateTime(new Date().toISOString())}</div>
  `
}
