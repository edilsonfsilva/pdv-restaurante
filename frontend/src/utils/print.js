/**
 * Opens a new window with the given HTML content styled for thermal printer output,
 * triggers the browser print dialog, then closes the window.
 */
export function printContent(htmlContent, title = 'Impressao') {
  const printWindow = window.open('', '_blank', 'width=320,height=600')

  if (!printWindow) {
    alert('Popup bloqueado. Permita popups para imprimir.')
    return
  }

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <title>${title}</title>
      <style>
        * {
          margin: 0;
          padding: 0;
          box-sizing: border-box;
        }

        body {
          font-family: 'Courier New', Courier, monospace;
          font-size: 12px;
          width: 280px;
          padding: 10px;
          color: #000;
          background: #fff;
        }

        .header {
          text-align: center;
          font-weight: bold;
          font-size: 14px;
          margin-bottom: 8px;
        }

        .sub-header {
          text-align: center;
          font-size: 11px;
          margin-bottom: 4px;
        }

        .dashed-line {
          border: none;
          border-top: 1px dashed #000;
          margin: 8px 0;
        }

        .item-row {
          display: flex;
          justify-content: space-between;
          margin: 2px 0;
        }

        .item-name {
          flex: 1;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          margin-right: 8px;
        }

        .item-price {
          text-align: right;
          white-space: nowrap;
          font-weight: bold;
        }

        .item-obs {
          font-size: 10px;
          font-style: italic;
          padding-left: 10px;
          color: #333;
        }

        .total {
          font-weight: bold;
          font-size: 14px;
          text-align: right;
          margin-top: 4px;
        }

        .total-row {
          display: flex;
          justify-content: space-between;
          font-weight: bold;
          font-size: 13px;
        }

        .center {
          text-align: center;
        }

        .bold {
          font-weight: bold;
        }

        .small {
          font-size: 10px;
        }

        .mt {
          margin-top: 8px;
        }

        .mb {
          margin-bottom: 8px;
        }

        table {
          width: 100%;
          border-collapse: collapse;
          font-size: 11px;
        }

        table th,
        table td {
          text-align: left;
          padding: 2px 4px;
          border-bottom: 1px solid #ccc;
        }

        table th {
          font-weight: bold;
          border-bottom: 2px solid #000;
        }

        @media print {
          body {
            width: 280px;
          }
        }
      </style>
    </head>
    <body>
      ${htmlContent}
    </body>
    </html>
  `

  printWindow.document.write(html)
  printWindow.document.close()

  // Wait for the content to render before triggering print
  printWindow.onload = () => {
    printWindow.focus()
    printWindow.print()
    printWindow.close()
  }
}
