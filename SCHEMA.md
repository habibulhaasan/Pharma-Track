# Firestore Schema — PharmaTrack

## Collections Overview

```
users/{userId}
products/{productId}
mainStock/{productId}
  └── mainLedger/{ledgerId}
pharmacyStock/{productId}
  └── pharmacyLedger/{ledgerId}
sales/{saleId}
activityLog/{logId}
```

---

## users/{userId}

| Field | Type | Values |
|---|---|---|
| name | string | "Dr. Jane Doe" |
| email | string | "jane@hospital.com" |
| phone | string | "+880 1700-000000" |
| role | string | "admin" \| "user" |
| status | string | "pending" \| "active" \| "disabled" |
| createdAt | Timestamp | server timestamp |
| lastLoginAt | Timestamp? | server timestamp |

---

## products/{productId}

| Field | Type | Example |
|---|---|---|
| genericName | string | "Paracetamol" |
| brandName | string | "Napa" |
| type | string | "tablet" \| "capsule" \| "syrup" \| "injection" \| "inhaler" \| ... |
| company | string | "Beximco Pharma" |
| unit | string | "strip" \| "bottle" \| "vial" \| "piece" |
| defaultPrice | number | 10.50 |
| reorderLevel | number | 50 |
| deleted | boolean | false |
| createdAt | Timestamp | |
| updatedAt | Timestamp | |

---

## mainStock/{productId}

| Field | Type | Notes |
|---|---|---|
| quantity | number | Current stock level |
| updatedAt | Timestamp | Updated on every transaction |

### mainStock/{productId}/mainLedger/{ledgerId}

| Field | Type | Notes |
|---|---|---|
| type | string | "IN" \| "OUT" \| "ADJUSTMENT" |
| quantity | number | Absolute quantity of operation |
| batch | string | Batch number |
| expiry | Timestamp? | Expiry date (null if unknown) |
| price | number | Purchase price per unit |
| supplier | string | Supplier name |
| reference | string | Invoice number or "TRANSFER" / "ADMIN_ADJUSTMENT" |
| reason | string? | Required for ADJUSTMENT type |
| timestamp | Timestamp | Server timestamp |
| userId | string | User who performed operation |

---

## pharmacyStock/{productId}

Same structure as mainStock.

### pharmacyStock/{productId}/pharmacyLedger/{ledgerId}

| Field | Type | Notes |
|---|---|---|
| type | string | "IN" \| "OUT" |
| reference | string | "TRANSFER" \| "DISPENSE" |
| quantity | number | |
| batch | string | |
| expiry | Timestamp? | |
| patientName | string? | For DISPENSE entries |
| prescriptionNo | string? | For DISPENSE entries |
| timestamp | Timestamp | |
| userId | string | |

---

## sales/{saleId}

| Field | Type | Notes |
|---|---|---|
| productId | string | Reference to products/{id} |
| quantity | number | |
| price | number | Selling price per unit |
| patientName | string? | |
| prescriptionNo | string? | |
| timestamp | Timestamp | |
| userId | string | |

---

## activityLog/{logId}

| Field | Type | Notes |
|---|---|---|
| userId | string | Actor |
| action | string | "STOCK_IN" \| "TRANSFER" \| "DISPENSE" \| "STOCK_ADJUST" \| "APPROVE_USER" \| "DISABLE_USER" |
| productId | string? | |
| beforeQty | number? | |
| afterQty | number? | |
| details | map? | Action-specific metadata |
| timestamp | Timestamp | |
| ip | string? | Client IP (optional) |

---

## Example Documents

### products/ABC123
```json
{
  "genericName": "Paracetamol",
  "brandName": "Napa",
  "type": "tablet",
  "company": "Beximco Pharma",
  "unit": "strip",
  "defaultPrice": 10,
  "reorderLevel": 50,
  "deleted": false,
  "createdAt": "2024-01-15T10:00:00Z",
  "updatedAt": "2024-01-15T10:00:00Z"
}
```

### mainStock/ABC123
```json
{
  "quantity": 245,
  "updatedAt": "2024-06-01T14:30:00Z"
}
```

### mainStock/ABC123/mainLedger/XYZ789
```json
{
  "type": "IN",
  "quantity": 100,
  "batch": "BT2024-001",
  "expiry": "2026-03-31T00:00:00Z",
  "price": 8.50,
  "supplier": "Beximco Distributor Ltd",
  "reference": "INV-2024-00445",
  "timestamp": "2024-06-01T14:30:00Z",
  "userId": "user123"
}
```

### pharmacyStock/ABC123/pharmacyLedger/DEF456
```json
{
  "type": "OUT",
  "reference": "DISPENSE",
  "quantity": 2,
  "batch": "BT2024-001",
  "expiry": null,
  "patientName": "Ahmed Karim",
  "prescriptionNo": "RX-2024-0091",
  "timestamp": "2024-06-01T16:00:00Z",
  "userId": "pharmacist01"
}
```
