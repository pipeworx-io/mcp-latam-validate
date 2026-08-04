# mcp-latam-validate

LatAm Validate MCP — validate Latin-American banking and tax identifiers.

Part of [Pipeworx](https://pipeworx.io) — an MCP gateway connecting AI agents to 1394+ live data sources.

## Tools

| Tool | Description |
|------|-------------|
| `validate_clabe` | Validate a Mexican CLABE (Clave Bancaria Estandarizada, the 18-digit interbank account number used for SPEI transfers). Checks the control-digit checksum and decodes the bank code, plaza (branch city) code, and account number. Resolves the bank name for major Mexican banks (BBVA, Banorte, Santander, Banamex, Banco Azteca, STP, Nu, Mercado Pago, ...). Pure computation — accepts spaces or dashes in the input. |
| `validate_cnpj` | Validate a Brazilian CNPJ (Cadastro Nacional da Pessoa Jurídica, the 14-character company tax ID) and look up the company registration: legal name (razão social), trade name, CNAE activity, address, registration status (situação cadastral), and partners (QSA). Checksum supports both the classic numeric format and the alphanumeric CNPJ introduced in 2026. Punctuation (12.345.678/0001-95) is accepted. Set skip_lookup to validate the checksum only. |
| `validate_cpf` | Validate a Brazilian CPF (Cadastro de Pessoas Físicas, the 11-digit personal tax ID) checksum. Pure computation, no lookup — returns whether the two check digits are correct and the formatted form. Punctuation (123.456.789-09) is accepted. |
| `brasil_cep` | Look up a Brazilian CEP (postal code) and return the address: street, neighborhood, city, and state, with coordinates when available. Example: CEP 01310-100 → Avenida Paulista, Bela Vista, São Paulo, SP. |
| `brasil_banks` | List Brazilian banks (COMPE code, ISPB, and name) from the central-bank registry, optionally filtered by name or code. Use to resolve a bank code from a boleto or PIX/TED transfer to the institution name, e.g. code 1 → Banco do Brasil, 260 → Nubank. |

## Quick Start

Add to your MCP client (Claude Desktop, Cursor, Windsurf, etc.):

```json
{
  "mcpServers": {
    "latam-validate": {
      "url": "https://gateway.pipeworx.io/latam-validate/mcp"
    }
  }
}
```

Or connect to the full Pipeworx gateway for access to all 1394+ data sources:

```json
{
  "mcpServers": {
    "pipeworx": {
      "url": "https://gateway.pipeworx.io/mcp"
    }
  }
}
```

## Using with ask_pipeworx

Instead of calling tools directly, you can ask questions in plain English:

```
ask_pipeworx({ question: "your question about Latam Validate data" })
```

The gateway picks the right tool and fills the arguments automatically.

## More

- [Docs and guides](https://pipeworx.io/docs)
- [pipeworx.io](https://pipeworx.io)

## License

MIT
