---
name: marzpay-integration
description: >-
  Integrate all MarzPay products: collections (mobile money + card), disbursements,
  bank transfers, bill payments, airtime/data, phone verification, balance, transactions,
  and webhooks. Use when building Uganda or Kenya payment features with MarzPay.
---

# MarzPay — Full API Integration Skill

Complete reference for integrating **all MarzPay merchant API products**.

**Live markets**
| Country | Code | Currency | Mobile money |
|---------|------|----------|--------------|
| Uganda | `UG` | UGX | MTN, Airtel |
| Kenya | `KE` | KES | M-Pesa |

Always send `country` on money-movement requests. Bills, bank transfer, card, and airtime are Uganda-primary today; Kenya collect/send (M-Pesa) uses the same endpoints with `country: "KE"`.

- **Docs:** https://wallet.wearemarz.com/documentation (Kenya guide: `https://wallet.wearemarz.com/documentation/kenya`)
- **API base:** `https://wallet.wearemarz.com/api/v1`
- **Auth:** HTTP Basic — `Authorization: Basic base64(api_key:api_secret)`
- **Content-Type:** `application/json` (form-data also accepted on some collection endpoints)

---

## Product catalog

| Product | Primary endpoints | Callbacks | IP whitelist | Markets |
|---------|-------------------|-----------|--------------|---------|
| **Collections** (mobile money) | `POST /collect-money` | Yes (`callback_url`) | No | UG MTN/Airtel · KE M-Pesa |
| **Card payments** | `POST /collect-money` (`method: card`) | Yes | No | UG (primary) |
| **Send money** (disbursement) | `POST /send-money` | Yes | **Yes** | UG MTN/Airtel · KE M-Pesa |
| **Bank transfer** | `POST /bank-transfer` | Poll / webhook | **Yes** | UG (primary) |
| **Bill payments** (LIGHT, NWSC, DSTV, GOTV) | `POST /bill-payment` | Optional | POST **Yes** | UG |
| **Airtime & data** (MTN, Airtel, Lyca) | `POST /airtime-data` | **No** — poll status | POST **Yes** | UG |
| **Phone verification** | `POST /phone-verification/verify` | N/A | No | UG (+ expanding) |
| **Balance** | `GET /balance` | N/A | **Yes** | Per-country wallets |
| **Transactions** | `GET /transactions` | N/A | No | All |
| **Webhooks** (dashboard config) | `POST /webhooks` | Receives events | No | All |
| **Payment links** | Dashboard UI | Yes | — | Not on API-key routes* |
| **WhatsApp channel** | `/api/v1/whatsapp/*` | Varies | — | UG (primary) |
| **USSD channel** | `/api/v1/ussd/*` | Session-based | — | UG (primary) |

\*Payment links are created in the **MarzPay dashboard** (or MarzPay mobile app). Customers pay at `https://wallet.wearemarz.com/pay/{uuid}`. There is no `POST /payment-links` on the standard API-key merchant routes.

---

## Setup

### Environment variables

```env
MARZPAY_API_BASE=https://wallet.wearemarz.com/api/v1
MARZPAY_API_KEY=your_api_key
MARZPAY_API_SECRET=your_api_secret
MARZPAY_WEBHOOK_SECRET=optional_signing_secret
MARZPAY_CALLBACK_URL=https://your-app.com/webhooks/marzpay
```

### Authentication header

```http
Authorization: Basic bXlfa2V5Om15X3NlY3JldA==
Accept: application/json
Content-Type: application/json
```

`Basic` value = `base64_encode("api_key:api_secret")`

### Prerequisites (all products)

1. MarzPay business account + verified documents
2. API key pair from dashboard → API Keys
3. **Subscribe** to each product in the service marketplace before calling its API
4. **IP whitelist** your server IPs for: balance, send-money, bank-transfer POST, bill-payment POST, airtime-data POST
5. Enable **API disbursement** permission for send-money and bank-transfer
6. Use **sandbox mode** on the business account to test without real money

### Wallets

Every business has two wallets:

| `wallet_source` | Wallet | Funded by |
|-----------------|--------|-----------|
| `main` (default) | Main wallet | Mobile money collections (UG MTN/Airtel, KE M-Pesa) |
| `card` | Card wallet | Card payment collections |

Each business has a wallet per country (`UG`, `KE`). Bank transfers and some debits accept `wallet_source: main|card`.

---

## 1. Collections — mobile money

Collect from customers via mobile money. **Uganda:** MTN/Airtel (auto-detected from phone). **Kenya:** M-Pesa (`country: "KE"`, `+254…`, amounts in KES).

### Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/collect-money` | Initiate collection |
| GET | `/collect-money/services` | Available countries/providers |
| GET | `/collect-money/{uuid}` | Transaction status |

### Request

```json
{
  "amount": 5000,
  "phone_number": "+256712345678",
  "reference": "c97fae8b-9b7f-4192-9f72-6f0859d33e67",
  "country": "UG",
  "description": "Order #1042",
  "callback_url": "https://your-app.com/webhooks/marzpay",
  "metadata": [
    { "orderId": "ORD-123456789" },
    { "customerId": "customer@email.com", "isPII": true }
  ]
}
```

| Field | Required | Rules |
|-------|----------|-------|
| `amount` | yes | UG: 500 – 10,000,000 UGX · KE: use Kenya collection limits (KES) |
| `reference` | yes | **UUID v4**, unique per API collection |
| `country` | yes | `UG` or `KE` |
| `phone_number` | yes | E.164 `+256…` (UG) or `+254…` (KE) |
| `method` | no | `mobile_money` (default) |
| `description` | no | max 255 |
| `callback_url` | no | HTTPS webhook |
| `metadata` | no | Array max 10; each item one field + value, optional `isPII: true`. Echoed on create (`data.collection.metadata`) and webhooks (top-level `metadata`). **Not** the same as `data.metadata` on some API responses (those are response diagnostics: timestamps / sandbox flags). |

### Kenya example

```json
{
  "amount": 100,
  "phone_number": "+254710000000",
  "reference": "123e4567-e89b-12d3-a456-426614174000",
  "country": "KE",
  "description": "Payment for services",
  "callback_url": "https://your-app.com/webhooks/marzpay",
  "metadata": [
    { "orderId": "ORD-123456789" },
    { "customerId": "customer@email.com", "isPII": true }
  ]
}
```

Subscribe to **M-Pesa Collection** for Kenya. Webhook `provider` is `mpesa`.

### Response notes

- Status starts `processing` / `pending` — confirm via **webhook** or `GET /collect-money/{uuid}`
- Map provider ID from webhook `collection.provider_transaction_id` (not `provider_reference` on create response)
- If you sent `metadata`, the same array is returned on create and on collection callbacks

---

## 2. Card payments

Same `POST /collect-money` with `method: "card"`. **No phone_number.**

```json
{
  "amount": 5000,
  "method": "card",
  "reference": "123e4567-e89b-12d3-a456-426614174000",
  "country": "UG",
  "description": "Order payment",
  "callback_url": "https://your-app.com/thank-you"
}
```

Response includes `data.redirect_url` — **redirect customer** to that URL to pay on the card gateway.

Funds settle in the **card wallet**. Card return URL: `https://wallet.wearemarz.com/pay/card-return`

---

## 3. Send money (disbursements)

Send funds to a mobile money number. **Uganda:** MTN/Airtel (auto-detected). **Kenya:** M-Pesa (`country: "KE"`).

### Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/send-money` | Disburse to phone |
| GET | `/send-money/services` | Limits, allowed phones |
| GET | `/send-money/{uuid}` | Status |

### Request (Uganda)

```json
{
  "amount": 10000,
  "phone_number": "+256712345678",
  "reference": "payout-2026-07-31-001",
  "country": "UG",
  "description": "Salary payment",
  "callback_url": "https://your-app.com/webhooks/marzpay",
  "metadata": [
    { "orderId": "ORD-123456789" },
    { "customerId": "customer@email.com", "isPII": true }
  ]
}
```

### Request (Kenya M-Pesa)

```json
{
  "amount": 100,
  "phone_number": "+254710000000",
  "reference": "123e4567-e89b-12d3-a456-426614174001",
  "country": "KE",
  "description": "Payout to customer",
  "callback_url": "https://your-app.com/webhooks/marzpay",
  "metadata": [
    { "orderId": "ORD-123456789" },
    { "customerId": "customer@email.com", "isPII": true }
  ]
}
```

| Field | Required | Rules |
|-------|----------|-------|
| `amount` | yes | Within business min/max withdrawal (UGX or KES by country) |
| `phone_number` | yes | E.164 `+256…` (UG) or `+254…` (KE) |
| `reference` | yes | Unique (max 50 chars; UUID recommended) |
| `country` | yes | `UG` or `KE` |
| `metadata` | no | Same format as collect-money; echoed on create (`data.withdrawal.metadata`) and webhooks (top-level `metadata`) |

**Requires:** sufficient **country** main-wallet balance, IP whitelist, API disbursement enabled. Some businesses restrict disbursements to pre-registered withdrawal phone numbers. Kenya: subscribe to **M-Pesa Disbursement**.

Check balance first: `GET /balance` (scoped by country wallet)

---

## 4. Bank transfer

Push funds from MarzPay wallet to any supported Uganda bank account.

### Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/bank-transfer` | Create transfer |
| POST | `/bank-transfer/validate` | Validate account before sending |
| GET | `/bank-transfer/banks` | Supported banks |
| GET | `/bank-transfer/services` | Limits, pricing tiers |
| GET | `/bank-transfer/{reference}` | Status |

### Validate account (recommended first)

```json
POST /bank-transfer/validate
{
  "bank_name": "Equity Bank",
  "account_number": "60001256421"
}
```

### Create transfer

```json
{
  "amount": 100000,
  "description": "Vendor payment",
  "bank_name": "Equity Bank",
  "bank_account_number": "60001256421",
  "bank_account_name": "John Doe",
  "bank_branch": "Kampala",
  "wallet_source": "main"
}
```

- You pay **amount + tiered charge**; recipient receives `amount`
- Min transfer ~2,500 UGX (check `/bank-transfer/services`)
- Balance debited immediately; refunded on failure
- Poll `GET /bank-transfer/{reference}` for final status

---

## 5. Bill payments

Pay utility bills: electricity (LIGHT/UMEME), water (NWSC), TV (DSTV, GOTV).

### Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/bill-payment/verify` | Verify meter/account |
| POST | `/bill-payment` | Pay bill |
| GET | `/bill-payment` | List transactions |
| GET | `/bill-payment/services` | Utility requirements |
| GET | `/bill-payment/nwsc/areas` | NWSC areas |
| GET | `/bill-payment/dstv/bouquet-codes` | DSTV bouquets + prices |
| GET | `/bill-payment/gotv/bouquet-codes` | GOTV bouquets + prices |
| GET | `/bill-payment/{reference}` | Status |

### Verify first

**LIGHT:**
```json
{ "utility_code": "LIGHT", "meter_number": "12345678901" }
```

**NWSC:**
```json
{ "utility_code": "NWSC", "meter_number": "12345678901", "area": "Kampala" }
```

**DSTV/GOTV:**
```json
{ "utility_code": "DSTV", "meter_number": "7039132763" }
```

### Pay bill

**LIGHT:**
```json
{
  "reference": "550e8400-e29b-41d4-a716-446655440000",
  "utility_code": "LIGHT",
  "meter_number": "12345678901",
  "phone_number": "+256700000000",
  "amount": 10000,
  "customer_name": "John Doe",
  "email": "john@example.com",
  "callback_url": "https://your-app.com/webhooks/marzpay"
}
```

**NWSC** — add `"area": "Kampala"`

**DSTV/GOTV** — add `"bouquet_code": "PREE36"`; **amount must exactly match bouquet price**

| Field | Required | Notes |
|-------|----------|-------|
| `utility_code` | yes | LIGHT, UMEME, NWSC, DSTV, GOTV |
| `meter_number` | yes | Meter or smartcard number |
| `phone_number` | yes | `+256XXXXXXXXX` |
| `amount` | yes | min 1,000 UGX |
| `reference` | yes | Unique |
| `area` | NWSC only | From `/bill-payment/nwsc/areas` |
| `bouquet_code` | DSTV/GOTV | From bouquet-codes endpoint |

Wallet debited for amount + bill payment charge (~1,500 UGX). Auto-refund on failure.

---

## 6. Airtime & data

Buy MTN, Airtel, or Lyca Uganda airtime and data bundles. **No merchant webhooks** — poll for status.

### Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/airtime-data/catalog` | Bundles by network |
| GET | `/airtime-data/detect-network?msisdn=256771234567` | Preview routing |
| GET | `/airtime-data/provider-balances` | Provider float (admin) |
| POST | `/airtime-data` | Purchase |
| GET | `/airtime-data` | List purchases |
| GET | `/airtime-data/{reference}` | Status |

### Networks

| Network | Airtime | Data bundles | Delivery |
|---------|---------|--------------|----------|
| MTN | yes | yes | Immediate |
| Airtel | yes | yes | Data may be async (`pending`) |
| Lyca | yes | **no** | Immediate |

Network is **auto-detected** from MSISDN — do not send a `network` field.

### Buy airtime

```json
{
  "reference": "550e8400-e29b-41d4-a716-446655440000",
  "purchase_type": "airtime",
  "msisdn": "256771234567",
  "amount": 5000
}
```

### Buy data bundle

```json
{
  "reference": "660e8400-e29b-41d4-a716-446655440001",
  "purchase_type": "bundle",
  "msisdn": "256771234567",
  "bundle_id": "RACT_UG_Data_201"
}
```

Use `product_id` from catalog as `bundle_id`. Do **not** send `amount` for bundles.

- Wallet debited on submit; auto-refund if delivery fails
- Airtel data may return HTTP `202` + `pending` — poll until `completed` or `failed`

---

## 7. Phone verification

Verify Uganda mobile numbers and retrieve registered subscriber name (KYC).

### Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/phone-verification/verify` | Verify number |
| GET | `/phone-verification/service-info` | Service details |
| GET | `/phone-verification/subscription-status` | Subscription check |

### Request

```json
{
  "phone_number": "256712345678"
}
```

Returns verification status and subscriber details when found.

---

## 8. Balance & account

### Balance

```
GET /balance          (IP whitelist required)
GET /balance/history  (IP whitelist required)
```

### Account

```
GET /account          (IP whitelist)
PUT /account          (IP whitelist)
```

Always check balance before disbursements, bank transfers, bill payments, and airtime purchases.

---

## 9. Transactions

```
GET /transactions              — list (paginated, filterable)
GET /transactions/{uuid}       — single transaction
GET /collect-money/{uuid}      — collection detail
GET /send-money/{uuid}         — disbursement detail
```

Use these as fallback when webhooks are delayed.

---

## 10. Services

```
GET /services          — subscribed + available services
GET /services/{uuid}   — service detail
```

Check subscriptions before integrating a product.

---

## 11. Webhooks

Two mechanisms:

### A. Per-request `callback_url`

Pass on collect-money, send-money, bill-payment, etc. MarzPay POSTs JSON when status is final.

### B. Dashboard webhooks (API-managed)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/webhooks` | List |
| POST | `/webhooks` | Create |
| GET | `/webhooks/{uuid}` | Detail |
| PUT | `/webhooks/{uuid}` | Update |
| DELETE | `/webhooks/{uuid}` | Delete |

Create webhook:

```json
{
  "name": "Production collections",
  "url": "https://your-app.com/webhooks/marzpay",
  "event_type": "collection.completed",
  "environment": "production",
  "is_active": true
}
```

Event types: `success`, `failure`, `collection.completed`, `collection.failed`, `collection.cancelled`

### Optional `metadata` on callbacks

If the client sent `metadata` on `POST /collect-money` or `POST /send-money`, **every** final callback includes the same array at the top level:

- Direct `callback_url` and dashboard webhooks
- Collection and disbursement events (`*.completed` / `*.failed`)
- Sandbox mocks

If `metadata` was omitted on create, the key is absent.

```json
{
  "event_type": "collection.completed",
  "transaction": { "reference": "...", "status": "completed" },
  "collection": { "provider": "mpesa", "provider_transaction_id": "ABC123" },
  "metadata": [
    { "orderId": "ORD-123456789" },
    { "customerId": "customer@email.com", "isPII": true }
  ]
}
```

### Webhook handler rules

1. Accept `POST`, return **HTTP 200** quickly
2. **Idempotent** — same `reference` may be delivered more than once
3. Update your DB by `reference` or transaction UUID
4. For collections: use `collection.provider_transaction_id` for provider ID
5. Read optional top-level `metadata` when present (do not require it)
6. Optionally verify HMAC signature if signing enabled in dashboard

---

## 12. Payment links (dashboard product)

Not available on standard API-key routes. Merchants create links in the **MarzPay dashboard**:

1. Create link (fixed or flexible amount, mobile money + card)
2. Share public URL: `https://wallet.wearemarz.com/pay/{uuid}`
3. Customer pays on hosted checkout page
4. Configure `callback_url` / `redirect_url` on the link

For programmatic link creation, use the MarzPay **mobile app API** (`/api/v1/app/payment-links` with Sanctum auth) — separate from merchant API keys.

---

## 13. WhatsApp channel (optional)

Separate integration at `https://wallet.wearemarz.com/api/v1/whatsapp/*` for WhatsApp bot flows.

**Public helpers (no API key):**
- `POST /whatsapp/business-by-phone`
- `POST /whatsapp/verify-phone`
- `POST /whatsapp/verify-meter-number`
- `POST /whatsapp/verify-bank-details`
- `GET /whatsapp/banks`

**Protected (business must have WhatsApp enabled):**
- `POST /whatsapp/deposit-money` — collect
- `POST /whatsapp/send-money` — disburse
- `POST /whatsapp/push-to-bank` — bank transfer
- `POST /whatsapp/pay-utility-bill` — bill payment
- `POST /whatsapp/pay-merchant` / `pay-merchant-product`
- `POST /whatsapp/account-balance` / `account-status`
- `POST /whatsapp/transfer-wallet`

Contact MarzPay to enable WhatsApp for your business.

---

## 14. USSD channel (optional)

Gateway integration at `https://wallet.wearemarz.com/api/v1/ussd/*` for telco USSD menus.

```
POST /ussd/process
{ "phoneNumber": "256...", "text": "1*2*5000", "sessionId": "..." }
→ { "response": "CON menu...", "endSession": false }
```

Optional JSON helpers (USSD enabled on business):
- `POST /ussd/pin/status`, `/pin/create`, `/pin/verify`
- `POST /ussd/business-by-phone`

Contact MarzPay to provision a USSD short code.

---

## Error responses

```json
{
  "status": "error",
  "message": "Human-readable explanation",
  "error_code": "VALIDATION_ERROR",
  "errors": { "field": ["message"] }
}
```

| error_code | Meaning | Action |
|------------|---------|--------|
| `VALIDATION_ERROR` | Invalid input | Fix `errors` fields |
| `DUPLICATE_REFERENCE` | Reference reused | New UUID/reference |
| `REQUEST_ERROR` | Business rule failed | Read `message` |
| `INSUFFICIENT_BALANCE` | Low wallet balance | Top up or reduce amount |
| `INVALID_PHONE_NUMBER` | Phone not allowed | Use registered number |
| `SERVICE_NOT_SUBSCRIBED` | Missing marketplace subscription | Subscribe in dashboard |
| `SERVICE_NOT_AVAILABLE` | Product disabled | Contact support |
| `ACCOUNT_FROZEN` | Business frozen | Contact support |
| `UNAUTHORIZED` | Bad credentials | Check API key/secret |
| `FORBIDDEN` | Permission denied | Check IP whitelist / disbursement flag |
| `NOT_FOUND` | Resource missing | Check UUID/reference |
| `SERVER_ERROR` | Internal error | Retry with backoff |

---

## Implementation rules for AI agents

1. **New UUID v4** for every collection and airtime/data `reference`
2. **Never reuse references** across API calls
3. **Idempotent webhooks** keyed on `reference` + final status
4. **Don't mark paid** on create response — wait for webhook or confirmed GET status
5. **Credentials in env** only — never commit secrets
6. **HTTPS** for all `callback_url` values in production
7. **Check subscriptions** via `/services` before building a product UI
8. **Whitelist server IPs** before testing balance/disbursements
9. **Verify meters/accounts** before bill payments (`/bill-payment/verify`)
10. **Validate bank accounts** before transfers (`/bank-transfer/validate`)
11. **Poll airtime/data** when status is `pending` (Airtel data bundles)
12. **Two wallets** — use correct `wallet_source` for bank transfers

---

## Code snippets

### Node.js

```javascript
const auth = Buffer.from(`${process.env.MARZPAY_API_KEY}:${process.env.MARZPAY_API_SECRET}`).toString('base64');
const base = process.env.MARZPAY_API_BASE;

async function marzpay(path, method = 'GET', body) {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || 'MarzPay error');
  return data;
}

// Collection
await marzpay('/collect-money', 'POST', {
  amount: 5000, phone_number: '+256712345678',
  reference: crypto.randomUUID(), country: 'UG',
  callback_url: process.env.MARZPAY_CALLBACK_URL,
});
```

### PHP (Laravel)

```php
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Str;

$http = Http::withBasicAuth(config('services.marzpay.key'), config('services.marzpay.secret'))
    ->baseUrl(config('services.marzpay.base_url'));

$http->post('/collect-money', [
    'amount' => 5000,
    'phone_number' => '+256712345678',
    'reference' => (string) Str::uuid(),
    'country' => 'UG',
    'callback_url' => route('webhooks.marzpay'),
]);
```

### Python

```python
import os, uuid, requests
from requests.auth import HTTPBasicAuth

BASE = os.environ["MARZPAY_API_BASE"]
AUTH = HTTPBasicAuth(os.environ["MARZPAY_API_KEY"], os.environ["MARZPAY_API_SECRET"])

def marzpay(path, json=None, method="GET"):
    r = requests.request(method, f"{BASE}{path}", json=json, auth=AUTH, timeout=60)
    r.raise_for_status()
    return r.json()

marzpay("/collect-money", {
    "amount": 5000, "phone_number": "+256712345678",
    "reference": str(uuid.uuid4()), "country": "UG",
}, method="POST")
```

---

## Sandbox

When the business account is in **sandbox mode**, API calls return simulated responses without real money movement. Test full flows including webhook handlers before going live.

---

## Integration checklist

- [ ] API keys in environment variables
- [ ] Server IPs whitelisted
- [ ] Subscribed to required services (collections, disbursements, etc.)
- [ ] Collect-money with UUID references + webhook handler
- [ ] Send-money / bank-transfer tested with balance checks
- [ ] Bill payment verify → pay flow tested
- [ ] Airtime/data catalog + purchase + poll for pending
- [ ] Error handling for all `error_code` values
- [ ] Sandbox end-to-end test
- [ ] Production HTTPS callback URLs

---

## Starter prompt (paste into any AI)

> Integrate **MarzPay** using this skill. API base: `https://wallet.wearemarz.com/api/v1`. Docs: `https://wallet.wearemarz.com/documentation`. I need: [collections / card / send-money / bank-transfer / bill-payments / airtime-data / phone-verification / all]. Stack: [Laravel / Node / Python]. Use env vars for credentials. UUID references for collections. Idempotent webhooks. Uganda (UG) only.
