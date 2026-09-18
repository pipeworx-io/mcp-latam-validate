# mcp-latam-validate

LatAm Validate MCP — validate Latin-American banking and tax identifiers.

Part of [Pipeworx](https://pipeworx.io) — an MCP gateway connecting AI agents to 1476+ live data sources.

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

### What this endpoint actually serves

`tools/list` at `https://gateway.pipeworx.io/latam-validate/mcp` returns the tools in the table
above **plus the shared Pipeworx meta-tools** — `ask_pipeworx`,
`discover_tools`, `search_within`, `remember`/`recall` and the rest of the
gateway-wide set. So the tool count you see is larger than this table: a
single-pack endpoint currently lists roughly 30 shared tools alongside the
pack's own. The connection's `initialize` response states its exact scope, and
is the authoritative answer for a given day.

This is deliberate, not multiplexing by accident. The meta-tools are what let a
scoped connection answer a question this pack does not cover — via
`ask_pipeworx`, which routes across the whole catalog — without you adding a
second MCP server. There is currently no way to mount a pack endpoint without
them; if the extra schemas cost you more context than the routing is worth,
connect to the full gateway once rather than to several pack endpoints.

Or connect to the full Pipeworx gateway to get every pack's tools listed
directly, instead of just this one's:

```json
{
  "mcpServers": {
    "pipeworx": {
      "url": "https://gateway.pipeworx.io/mcp"
    }
  }
}
```

Both URLs reach the same gateway and the same 1476+ data sources. The
only difference is which pack's tools are listed **directly**; `ask_pipeworx`
reaches all of them from either one.

## Using with ask_pipeworx

Instead of calling tools directly, you can ask questions in plain English —
this works on the pack endpoint above as well as on the full gateway:

```
ask_pipeworx({ question: "your question about Latam Validate data" })
```

The gateway picks the right tool and fills the arguments automatically.

## More

- [Docs and guides](https://pipeworx.io/docs)
- [pipeworx.io](https://pipeworx.io)

## License

MIT

## No MCP client? Call it over HTTP

```bash
curl -X POST https://gateway.pipeworx.io/v1/tools/validate_clabe \
  -H 'Content-Type: application/json' \
  -d '{"clabe":"002010077777777771"}'
```

No account needed for the first calls. Inspect any tool: `GET https://gateway.pipeworx.io/v1/tools/validate_clabe`. Find one: `POST https://gateway.pipeworx.io/v1/tools/search_packs` with `{"query":"..."}`.
