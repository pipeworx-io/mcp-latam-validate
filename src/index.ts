interface McpToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
}

interface McpToolExport {
  tools: McpToolDefinition[];
  callTool: (name: string, args: Record<string, unknown>) => Promise<unknown>;
  meter?: { credits: number };
  cost?: Record<string, unknown>;
  provider?: string;
}

/**
 * LatAm Validate MCP — validate Latin-American banking and tax identifiers.
 *
 * - Mexican CLABE (18-digit interbank account number): pure checksum compute
 *   plus a local catalog of ABM bank codes (no network call).
 * - Brazilian CNPJ (company tax ID): checksum (numeric and the 2026
 *   alphanumeric format) plus company registration lookup via BrasilAPI.
 * - Brazilian CPF (personal tax ID): pure checksum compute (no lookup —
 *   personal data).
 * - Brazilian CEP (postal code) → address, and the bank list, via BrasilAPI
 *   (brasilapi.com.br — keyless).
 */


const BRASILAPI = 'https://brasilapi.com.br/api';
const UA = 'pipeworx/1.0 (+https://pipeworx.io)';

const tools: McpToolExport['tools'] = [
  {
    name: 'validate_clabe',
    description:
      'Validate a Mexican CLABE (Clave Bancaria Estandarizada, the 18-digit interbank account number used for SPEI transfers). Checks the control-digit checksum and decodes the bank code, plaza (branch city) code, and account number. Resolves the bank name for major Mexican banks (BBVA, Banorte, Santander, Banamex, Banco Azteca, STP, Nu, Mercado Pago, ...). Pure computation — accepts spaces or dashes in the input.',
    inputSchema: {
      type: 'object',
      properties: {
        clabe: { type: 'string', description: 'The 18-digit CLABE, e.g. "002010077777777771". Spaces and dashes are allowed.' },
      },
      required: ['clabe'],
    },
  },
  {
    name: 'validate_cnpj',
    description:
      'Validate a Brazilian CNPJ (Cadastro Nacional da Pessoa Jurídica, the 14-character company tax ID) and look up the company registration: legal name (razão social), trade name, CNAE activity, address, registration status (situação cadastral), and partners (QSA). Checksum supports both the classic numeric format and the alphanumeric CNPJ introduced in 2026. Punctuation (12.345.678/0001-95) is accepted. Set skip_lookup to validate the checksum only.',
    inputSchema: {
      type: 'object',
      properties: {
        cnpj: { type: 'string', description: 'The CNPJ, e.g. "33.000.167/0001-01" or "33000167000101".' },
        skip_lookup: { type: 'boolean', description: 'If true, only run the checksum and skip the BrasilAPI company-registration lookup. Default false.' },
      },
      required: ['cnpj'],
    },
  },
  {
    name: 'validate_cpf',
    description:
      'Validate a Brazilian CPF (Cadastro de Pessoas Físicas, the 11-digit personal tax ID) checksum. Pure computation, no lookup — returns whether the two check digits are correct and the formatted form. Punctuation (123.456.789-09) is accepted.',
    inputSchema: {
      type: 'object',
      properties: {
        cpf: { type: 'string', description: 'The CPF, e.g. "123.456.789-09" or "12345678909".' },
      },
      required: ['cpf'],
    },
  },
  {
    name: 'brasil_cep',
    description:
      'Look up a Brazilian CEP (postal code) and return the address: street, neighborhood, city, and state, with coordinates when available. Example: CEP 01310-100 → Avenida Paulista, Bela Vista, São Paulo, SP.',
    inputSchema: {
      type: 'object',
      properties: {
        cep: { type: 'string', description: 'The 8-digit CEP, e.g. "01310-100" or "01310100".' },
      },
      required: ['cep'],
    },
  },
  {
    name: 'brasil_banks',
    description:
      'List Brazilian banks (COMPE code, ISPB, and name) from the central-bank registry, optionally filtered by name or code. Use to resolve a bank code from a boleto or PIX/TED transfer to the institution name, e.g. code 1 → Banco do Brasil, 260 → Nubank.',
    inputSchema: {
      type: 'object',
      properties: {
        search: { type: 'string', description: 'Filter by bank name substring (case-insensitive), e.g. "nubank" or "itau".' },
        code: { type: 'number', description: 'Exact COMPE bank code to look up, e.g. 341 for Itaú.' },
        limit: { type: 'number', description: 'Max results when listing/filtering (default 25).' },
      },
    },
  },
];

async function callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
  try {
    switch (name) {
      case 'validate_clabe':
        return validateClabe(args);
      case 'validate_cnpj':
        return await validateCnpj(args);
      case 'validate_cpf':
        return validateCpf(args);
      case 'brasil_cep':
        return await brasilCep(args);
      case 'brasil_banks':
        return await brasilBanks(args);
      default:
        return { error: `Unknown tool: ${name}` };
    }
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}

// ── CLABE (Mexico) ───────────────────────────────────────────────────

// ABM 3-digit bank codes — major institutions. The full Banxico catalog has
// ~100 entries; unknown codes return bank_name: null with a note rather than
// failing validation (the checksum is authoritative, the name is a courtesy).
const CLABE_BANKS: Record<string, string> = {
  '002': 'Citibanamex',
  '006': 'Bancomext',
  '009': 'Banobras',
  '012': 'BBVA México',
  '014': 'Santander México',
  '019': 'Banjército',
  '021': 'HSBC México',
  '030': 'Banco del Bajío',
  '036': 'Banco Inbursa',
  '042': 'Banca Mifel',
  '044': 'Scotiabank México',
  '058': 'Banregio',
  '059': 'Banco Invex',
  '060': 'Bansí',
  '062': 'Banca Afirme',
  '072': 'Banorte',
  '103': 'American Express Bank México',
  '106': 'Bank of America México',
  '108': 'MUFG Bank México',
  '110': 'J.P. Morgan México',
  '112': 'Banco Monex',
  '113': 'Banco Ve por Más (Bx+)',
  '127': 'Banco Azteca',
  '128': 'Banco Autofin México',
  '129': 'Barclays Bank México',
  '130': 'Compartamos Banco',
  '132': 'Banco Multiva',
  '133': 'Banco Actinver',
  '135': 'Nacional Financiera (Nafin)',
  '136': 'Intercam Banco',
  '137': 'BanCoppel',
  '138': 'ABC Capital',
  '140': 'Consubanco',
  '141': 'Volkswagen Bank México',
  '143': 'CIBanco',
  '145': 'Banco Base',
  '147': 'Bankaool',
  '148': 'Banco PagaTodo',
  '150': 'Banco Inmobiliario Mexicano',
  '152': 'Banco Bancrea',
  '155': 'ICBC México',
  '156': 'Banco Sabadell México',
  '157': 'Shinhan Bank México',
  '158': 'Mizuho Bank México',
  '159': 'Bank of China México',
  '160': 'Banco S3 México',
  '166': 'Banco del Bienestar',
  '168': 'Sociedad Hipotecaria Federal',
  '601': 'GBM Grupo Bursátil Mexicano',
  '602': 'Masari Casa de Bolsa',
  '605': 'Value Casa de Bolsa',
  '608': 'Vector Casa de Bolsa',
  '616': 'Finamex Casa de Bolsa',
  '620': 'Profuturo',
  '638': 'Nu México',
  '646': 'STP (Sistema de Transferencias y Pagos)',
  '653': 'Kuspit Casa de Bolsa',
  '684': 'Operadora de Pagos Móviles (Transfer)',
  '706': 'Arcus Financial Intelligence',
  '710': 'NVIO Pagos México',
  '722': 'Mercado Pago',
};

function validateClabe(args: Record<string, unknown>): unknown {
  const raw = typeof args.clabe === 'string' ? args.clabe : String(args.clabe ?? '');
  const clabe = raw.replace(/[\s-]/g, '');
  if (!/^\d+$/.test(clabe)) {
    return { valid: false, error: 'user_error', message: 'CLABE must contain only digits (spaces/dashes allowed). Example: 002010077777777771.' };
  }
  if (clabe.length !== 18) {
    return { valid: false, error: 'user_error', message: `CLABE must be exactly 18 digits (got ${clabe.length}). Example: 002010077777777771.` };
  }
  // Control digit: weights 3,7,1 cycling over the first 17 digits;
  // control = (10 − (sum mod 10)) mod 10.
  const weights = [3, 7, 1];
  let sum = 0;
  for (let i = 0; i < 17; i++) {
    sum += (Number(clabe[i]) * weights[i % 3]) % 10;
  }
  const expected = (10 - (sum % 10)) % 10;
  const actual = Number(clabe[17]);
  const bankCode = clabe.slice(0, 3);
  const bankName = CLABE_BANKS[bankCode] ?? null;
  return {
    valid: expected === actual,
    clabe,
    bank_code: bankCode,
    bank_name: bankName,
    ...(bankName === null ? { bank_note: 'Bank code not in the local catalog of major banks — the checksum result is still authoritative.' } : {}),
    plaza_code: clabe.slice(3, 6),
    account_number: clabe.slice(6, 17),
    control_digit: actual,
    ...(expected !== actual ? { expected_control_digit: expected, message: 'Checksum failed — the CLABE is mistyped or invalid.' } : {}),
  };
}

// ── CNPJ / CPF (Brazil) ──────────────────────────────────────────────

// Mod-11 check digit over char values (digit value, or ASCII−48 for the 2026
// alphanumeric CNPJ letters). Returns the expected check digit.
function cnpjDigit(values: number[], weights: number[]): number {
  const sum = values.reduce((acc, v, i) => acc + v * weights[i], 0);
  const mod = sum % 11;
  return mod < 2 ? 0 : 11 - mod;
}

function validateCnpjChecksum(cnpj: string): { valid: boolean; reason?: string } {
  if (!/^[A-Z0-9]{12}\d{2}$/.test(cnpj)) {
    return { valid: false, reason: 'CNPJ must be 14 characters: 12 alphanumeric (digits, or letters in the 2026 format) followed by 2 numeric check digits.' };
  }
  if (/^(\d)\1{13}$/.test(cnpj)) return { valid: false, reason: 'All-repeated-digit CNPJs are invalid.' };
  const vals = [...cnpj.slice(0, 12)].map((c) => c.charCodeAt(0) - 48);
  const d1 = cnpjDigit(vals, [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const d2 = cnpjDigit([...vals, d1], [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  if (Number(cnpj[12]) !== d1 || Number(cnpj[13]) !== d2) {
    return { valid: false, reason: `Check digits failed (expected ${d1}${d2}).` };
  }
  return { valid: true };
}

async function validateCnpj(args: Record<string, unknown>): Promise<unknown> {
  const raw = typeof args.cnpj === 'string' ? args.cnpj : String(args.cnpj ?? '');
  const cnpj = raw.toUpperCase().replace(/[\s./-]/g, '');
  const check = validateCnpjChecksum(cnpj);
  const base: Record<string, unknown> = {
    valid: check.valid,
    cnpj,
    formatted: cnpj.length === 14 ? `${cnpj.slice(0, 2)}.${cnpj.slice(2, 5)}.${cnpj.slice(5, 8)}/${cnpj.slice(8, 12)}-${cnpj.slice(12)}` : cnpj,
    alphanumeric: /[A-Z]/.test(cnpj),
  };
  if (!check.valid) return { ...base, message: check.reason };
  if (args.skip_lookup === true) return base;

  // Company-registration lookup (best-effort — checksum result stands alone).
  try {
    const res = await fetch(`${BRASILAPI}/cnpj/v1/${encodeURIComponent(cnpj)}`, {
      headers: { Accept: 'application/json', 'User-Agent': UA },
    });
    if (res.status === 404) return { ...base, company: null, company_note: 'Checksum valid, but no registration found in the Receita Federal mirror (new, unregistered, or alphanumeric-format CNPJ).' };
    if (!res.ok) return { ...base, company: null, company_note: `Checksum valid; registration lookup unavailable (BrasilAPI ${res.status}).` };
    const d = (await res.json()) as Record<string, any>;
    return {
      ...base,
      company: {
        legal_name: d.razao_social ?? null,
        trade_name: d.nome_fantasia || null,
        status: d.descricao_situacao_cadastral ?? null,
        opened: d.data_inicio_atividade ?? null,
        legal_nature: d.natureza_juridica ?? null,
        main_activity: d.cnae_fiscal_descricao ?? null,
        cnae_code: d.cnae_fiscal ?? null,
        share_capital: d.capital_social ?? null,
        company_size: d.porte ?? null,
        address: {
          street: [d.descricao_tipo_de_logradouro, d.logradouro].filter(Boolean).join(' ') || null,
          number: d.numero ?? null,
          neighborhood: d.bairro ?? null,
          city: d.municipio ?? null,
          state: d.uf ?? null,
          cep: d.cep ?? null,
        },
        phone: d.ddd_telefone_1 || null,
        partners: Array.isArray(d.qsa)
          ? d.qsa.slice(0, 20).map((p: Record<string, any>) => ({
              name: p.nome_socio ?? null,
              role: p.qualificacao_socio ?? null,
              joined: p.data_entrada_sociedade ?? null,
            }))
          : [],
      },
    };
  } catch {
    return { ...base, company: null, company_note: 'Checksum valid; registration lookup unavailable (BrasilAPI unreachable).' };
  }
}

function validateCpf(args: Record<string, unknown>): unknown {
  const raw = typeof args.cpf === 'string' ? args.cpf : String(args.cpf ?? '');
  const cpf = raw.replace(/[\s.-]/g, '');
  if (!/^\d{11}$/.test(cpf)) {
    return { valid: false, error: 'user_error', message: `CPF must be exactly 11 digits (got ${cpf.length}). Example: 123.456.789-09.` };
  }
  if (/^(\d)\1{10}$/.test(cpf)) {
    return { valid: false, cpf, message: 'All-repeated-digit CPFs are invalid.' };
  }
  const digits = [...cpf].map(Number);
  const check = (count: number): number => {
    let sum = 0;
    for (let i = 0; i < count; i++) sum += digits[i] * (count + 1 - i);
    const mod = (sum * 10) % 11;
    return mod === 10 ? 0 : mod;
  };
  const d1 = check(9);
  const d2 = check(10);
  const valid = d1 === digits[9] && d2 === digits[10];
  return {
    valid,
    cpf,
    formatted: `${cpf.slice(0, 3)}.${cpf.slice(3, 6)}.${cpf.slice(6, 9)}-${cpf.slice(9)}`,
    ...(valid ? {} : { message: `Check digits failed (expected ${d1}${d2}).` }),
  };
}

// ── BrasilAPI lookups ────────────────────────────────────────────────

async function brasilFetch(path: string): Promise<Response> {
  return fetch(`${BRASILAPI}${path}`, { headers: { Accept: 'application/json', 'User-Agent': UA } });
}

async function brasilCep(args: Record<string, unknown>): Promise<unknown> {
  const raw = typeof args.cep === 'string' ? args.cep : String(args.cep ?? '');
  const cep = raw.replace(/[\s.-]/g, '');
  if (!/^\d{8}$/.test(cep)) {
    return { error: 'user_error', message: `CEP must be 8 digits (got "${raw}"). Example: 01310-100.` };
  }
  const res = await brasilFetch(`/cep/v2/${cep}`);
  if (res.status === 404) return { cep, found: false, message: 'CEP not found.' };
  if (!res.ok) return { error: 'upstream_error', message: `BrasilAPI: ${res.status}` };
  const d = (await res.json()) as Record<string, any>;
  const coords = d.location?.coordinates ?? {};
  return {
    cep: d.cep ?? cep,
    found: true,
    street: d.street ?? null,
    neighborhood: d.neighborhood ?? null,
    city: d.city ?? null,
    state: d.state ?? null,
    latitude: coords.latitude ?? null,
    longitude: coords.longitude ?? null,
  };
}

// Accent-fold + lowercase for search ("itau" must match "ITAÚ"). Common brand
// names differ from registry names (Nubank = "NU PAGAMENTOS - IP"), so a small
// alias map keeps household-name searches working.
function foldBank(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}
const BANK_ALIASES: Record<string, string> = {
  nubank: 'nu pagamentos',
  inter: 'bco inter',
  bb: 'bco do brasil',
  caixa: 'caixa economica',
};

async function brasilBanks(args: Record<string, unknown>): Promise<unknown> {
  const res = await brasilFetch('/banks/v1');
  if (!res.ok) return { error: 'upstream_error', message: `BrasilAPI: ${res.status}` };
  let banks = (await res.json()) as Array<{ ispb: string; name: string | null; code: number | null; fullName: string | null }>;
  const code = typeof args.code === 'number' ? args.code : undefined;
  let search = typeof args.search === 'string' && args.search.trim() ? foldBank(args.search.trim()) : undefined;
  if (search && BANK_ALIASES[search]) search = BANK_ALIASES[search];
  if (code !== undefined) banks = banks.filter((b) => b.code === code);
  if (search) banks = banks.filter((b) => foldBank(b.name ?? '').includes(search!) || foldBank(b.fullName ?? '').includes(search!));
  const limit = typeof args.limit === 'number' && args.limit > 0 ? Math.min(args.limit, 200) : 25;
  return {
    total_matching: banks.length,
    count: Math.min(banks.length, limit),
    banks: banks.slice(0, limit).map((b) => ({ code: b.code, name: b.name, full_name: b.fullName, ispb: b.ispb })),
  };
}

export default { tools, callTool, meter: { credits: 1 } } satisfies McpToolExport;
