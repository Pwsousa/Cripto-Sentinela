# Cripto-Sentinela

Sistema de comunicação segura ponta-a-ponta sobre canal MQTT público, desenvolvido para a atividade Cripto sentiela com o foco em aplicar os conceitos de criptografia garantindo a Confidencialidade, a Integridade e a Autencidade de mensagens **Operação Cripto-Sentinela** do CDCiber (Comando de Defesa Cibernética).

O sistema é simulação com o nome ficticio de  **Canal de Comando Unificado (CCU)** do SISDEF, onde Unidades Táticas (UTs) trocam ordens de combate por um broker MQTT público comprometido pela entidade hostil **SOMBRA**, que possui acesso de leitura e capacidade de alterar mensagens em trânsito.

---

## Modelo de Ameaça

| Capacidade da SOMBRA | Proteção implementada |
|---|---|
| Leitura de todo o tráfego MQTT | AES-256-GCM — payload ilegível sem a chave de sessão |
| Alteração de mensagens em trânsito | Tag AEAD do AES-GCM + assinatura ECDSA P-256 — adulteração detectada |
| Injeção de mensagens falsas | ECDSA P-256 — sem a chave privada da UT, assinatura inválida |
| Falsificação de identidade | IFF — chaves públicas verificadas antes de aceitar mensagens |
| Revogação falsa de UTs | Revogações assinadas — só UTs confiáveis com ECDSA válido podem revogar |

---

## Garantias Criptográficas

- **Confidencialidade** — AES-256-GCM com chave de sessão aleatória por mensagem, wrapped com RSA-OAEP-2048
- **Integridade** — Tag AEAD (16 bytes) do AES-GCM + SHA-256 do plaintext
- **Autenticidade** — Assinatura ECDSA P-256/SHA-256 com chave privada do remetente
- **Não-repúdio** — Assinatura digital vincula a mensagem à chave privada exclusiva da UT
- **Controle de acesso dinâmico** — Lista de revogação local, broadcast assinado de revogações

---

## Tópicos MQTT

| Tópico | Direção | Conteúdo |
|---|---|---|
| `sisdef/broadcast/chaves/<id>` | UT → todos | Chaves públicas RSA + ECDSA (IFF) |
| `sisdef/direto/<id>` | UT → UT específica | Envelope cifrado |
| `sisdef/broadcast/revogacao` | UT → todos | Pacote de revogação assinado |
| `sisdef/broadcast/notas` | bidirecional | Placar público (Oráculo) |
| `sisdef/direto/oraculo` | UT → Oráculo | Comandos: `echo`, `desafio`, `resposta` |

---

## Formato do Envelope Seguro

```json
{
  "id_unidade":               "ut-november",
  "ciphertext_b64":           "<AES-GCM ciphertext em Base64>",
  "tag_autenticacao_b64":     "<tag AEAD 16 bytes em Base64>",
  "nonce_b64":                "<nonce 12 bytes em Base64>",
  "chave_sessao_cifrada_b64": "<chave AES wrapped com RSA-OAEP em Base64>",
  "assinatura_b64":           "<assinatura ECDSA do SHA-256(plaintext) em Base64>"
}
```

Para respostas ao Oráculo, `"cmd": "resposta"` é adicionado no nível externo (não cifrado).

---

## Estrutura do Projeto

```
Cripto-Sentinela/
├── backend/                   # Lógica de negócio, crypto, MQTT (Python)
│   ├── crypto.py
│   ├── store.py
│   ├── mqtt_client.py
│   ├── ws_manager.py
│   ├── protocol.py
│   ├── deps.py
│   ├── main.py
│   ├── routers/
│   │   ├── identity.py
│   │   ├── messages.py
│   │   ├── trust.py
│   │   └── revocation.py
│   ├── requirements.txt
│   └── data/                  # GITIGNORED — chaves privadas geradas em runtime
│
├── frontend/                  # Interface web (React + Tailwind)
│   ├── src/
│   │   ├── components/SisdefApp.tsx
│   │   ├── lib/api.ts
│   │   ├── lib/ws.ts
│   │   ├── main.tsx
│   │   └── index.css
│   ├── index.html
│   ├── package.json
│   ├── vite.config.ts
│   └── tsconfig.json
│
├── .gitignore
└── README.md
```

---

### Pré-requisitos

- Python 3.11+
- Node.js 18+
- Acesso à internet (broker público (mqtt))

### 1. Backend

```powershell
cd Cripto-Sentinela
python -m venv .venv
.venv\Scripts\activate
pip install -r backend/requirements.txt
uvicorn backend.main:app --reload --port 8000
```

### 2. Frontend

```powershell
cd frontend
npm install
npm run dev
```

Acesse `http://localhost:5173`.

---

## Fluxo de Operação Completo

### Fase 1 — Estabelecimento de Identidade (IFF)

1. UT abre a interface e insere o codinome (ex: `ut-zulu`)
2. Backend gera par RSA-2048 e par ECDSA P-256
3. Chaves privadas salvas em `backend/data/identity.json`
4. Chaves públicas publicadas em `sisdef/broadcast/chaves/ut-november` com `retain=true`
5. Outras UTs recebem o broadcast e armazenam as chaves no trust store local

### Fase 2 — Envio de Ordem Sigilosa

1. Remetente seleciona destinatário da rede confiável
2. Backend gera chave de sessão AES-256 aleatória (32 bytes)
3. Cifra o payload com AES-256-GCM → ciphertext + tag + nonce
4. Cifra a chave de sessão com RSA-OAEP-2048 da chave pública do destinatário
5. Assina SHA-256(plaintext) com ECDSA P-256 privada do remetente
6. Publica envelope JSON em `sisdef/direto/<destinatario>`

### Fase 3 — Recepção e Validação

1. Backend do destinatário recebe via MQTT
2. Verifica se remetente não está na lista de revogação
3. Busca chave pública ECDSA do remetente no trust store
4. Decifra chave de sessão com RSA privada própria
5. Decifra ciphertext com AES-GCM — falha automática se tag inválida (adulteração)
6. Verifica assinatura ECDSA sobre SHA-256(plaintext)
7. Resultado enviado ao frontend via WebSocket com status `ok` ou `tampered`

### Fase 4 — Desafio do Oráculo

1. UT clica em **Solicitar Desafio** → `POST /messages/challenge/request`
2. Backend envia `{"id_unidade": "...", "cmd": "desafio"}` cifrado ao Oráculo
3. Oráculo responde com pergunta cifrada em `sisdef/direto/<id>`
4. Frontend detecta mensagem do oráculo e exibe a pergunta automaticamente
5. UT insere a resposta numérica como string pura (ex: `"12"`)
6. Backend envia com `"cmd": "resposta"` no envelope externo (não cifrado)

### Fase 5 — Revogação de Unidade Comprometida

1. UT emite `POST /revocation` com `unit_id` da unidade comprometida
2. Backend assina `{unidade_revogada, timestamp}` com ECDSA privada
3. Publica pacote assinado em `sisdef/broadcast/revogacao`
4. Todas as UTs verificam assinatura e aplicam revogação localmente
5. Mensagens futuras da unidade revogada são rejeitadas automaticamente

---

