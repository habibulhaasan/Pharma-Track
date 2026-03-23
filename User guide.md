# PharmaTrack — User Guide

## Table of Contents
1. [Getting Started](#getting-started)
2. [Dashboard](#dashboard)
3. [Products](#products)
4. [Main Stock — Purchase Entry](#main-stock)
5. [Transfer to Pharmacy](#transfer)
6. [Dispense Medicines](#dispense)
7. [Ledger](#ledger)
8. [Reports (Admin)](#reports)
9. [Admin Panel](#admin-panel)
10. [Mobile Usage](#mobile-usage)
11. [User Roles](#user-roles)
12. [FAQ](#faq)

---

## 1. Getting Started

### Requesting Access
1. Go to the app URL and click **Request Access**
2. Fill in your name, email, phone number, and a password
3. Submit — your account is now **pending approval**
4. Wait for an administrator to approve your account
5. Once approved, log in with your email and password

> **Note:** All staff share the same database. There is only one pharmacy system — everyone works on the same stock, same products, same records.

### Logging In
1. Go to the app URL
2. Enter your email and password
3. Click **Sign In**
4. Admins are taken to the **Admin Panel**, staff are taken to the **Dashboard**

---

## 2. Dashboard

The dashboard gives you a quick overview of the pharmacy's current status.

| Card | What it shows |
|---|---|
| Total Products | Number of active medicines in the system |
| Low Stock Alerts | Medicines at or below their reorder level |
| Dispensed Today | Number of dispense transactions today |
| Pending Approvals | (Admin only) New user registrations waiting |

**Low Stock Items** panel shows the medicines that need restocking, sorted by urgency.

**Quick Actions** panel gives one-click access to the most common tasks.

---

## 3. Products

**Who can access:** Everyone can view. Only admins can add, edit, or remove.

### Viewing Products
- Products are listed sorted by type: Tablets first, then Capsules, Syrups, then others
- Each row shows: Brand Name, Generic Name, Type, Main Stock, Pharmacy Stock, Price
- Use the **search box** to filter by brand name, generic name, or company
- **Orange/red badge** means the product is at or below its reorder level

### Adding a Single Product (Admin)
1. Click **Add Product** (top right)
2. Fill in:
   - **Brand Name** — the product's trade name (e.g. "Tab. Paracetamol")
   - **Generic Name** — searchable from 1,695 generics. Type to filter, or type a custom name
   - **Type** — Tablet, Capsule, Syrup, Injection, etc.
   - **Unit** — piece, bottle, vial, etc.
   - **Company** — searchable from 216 companies. Type to filter
   - **Default Price** — selling price per unit (can be 0)
   - **Reorder Level** — when stock drops to this number, a warning appears
3. Click **Create Product**

### Bulk Import Products (Admin)
1. Click **Template** to download a CSV template
2. Fill in the CSV with your products (one per row)
3. Click **Bulk Import** and select your CSV or JSON file
4. A preview shows all rows — review for errors
5. Click **Import X Products** to confirm

**CSV format:**
```
brandName,genericName,type,company,unit,defaultPrice,reorderLevel
Tab. Paracetamol,Paracetamol,tablet,Govt. Supply,piece,0,500
```

Valid types: `tablet`, `capsule`, `syrup`, `injection`, `cream`, `ointment`, `drops`, `inhaler`, `patch`, `suppository`, `other`

### Editing a Product (Admin)
Click the **pencil icon** on any product row.

### Removing a Product (Admin)
Click the **trash icon**. This is a soft delete — the product disappears from the list but all historical ledger data is preserved.

---

## 4. Main Stock — Purchase Entry

**Path:** Stock IN (sidebar)

This page is for recording **new stock received from suppliers/government**.

### How to Enter a Purchase
1. Use the **search box** to find specific medicines, or scroll through the full list
2. For each medicine received, type the **quantity** in the Qty IN column
3. Optionally fill in:
   - **Unit Price** — cost per unit from supplier
   - **Batch No.** — batch/lot number from the packaging
   - **Expiry** — expiry date from the packaging
   - **Supplier** — supplier or distributor name
4. Press **Enter** to jump to the next row quickly
5. Rows with quantity entered are highlighted in blue
6. The **Submit Purchase** button shows how many items are ready
7. Click **Submit Purchase** to save

> **Tip:** Only rows where you entered a quantity are saved. Empty rows are automatically skipped — you don't need to clear them.

> **Tip:** Use the **Purchase Date** picker at the top to record stock received on a different date.

---

## 5. Transfer to Pharmacy

**Path:** To Pharmacy (sidebar)

This moves medicines from **Main Stock** into **Pharmacy Stock** so they can be dispensed to patients.

### How to Transfer
1. All medicines with available main stock are listed
2. Enter the **quantity to transfer** for each medicine needed
3. Optionally enter a **Batch No.** for tracking
4. The system checks you don't transfer more than what's available — a red warning appears if you exceed the stock
5. Click **Confirm Transfer**

The transfer is atomic — if anything fails, nothing is deducted.

---

## 6. Dispense Medicines

**Path:** Dispense (sidebar)

This records medicines given to patients, deducting them from **Pharmacy Stock**.

### How to Dispense
1. Optionally fill in **Patient Name** and **Prescription No.** at the top (can be left blank)
2. Set the **Date** if dispensing for a past date
3. Scroll through the list and enter the **quantity** for each medicine being dispensed
4. **Grey/disabled rows** mean that medicine has no pharmacy stock — transfer it first
5. The **Total** column shows the value of each line item
6. The **Grand Total** shows at the bottom when items are selected
7. Click **Confirm Dispense**

> **Tip:** Press **Enter** to move quickly between quantity fields.

> **Warning:** You cannot dispense more than what's in pharmacy stock. A red warning shows if you try.

---

## 7. Ledger

**Path:** Ledger (sidebar)

The ledger works like a **bank statement** — showing every IN and OUT transaction for a medicine with a running balance.

### How to Use
1. **Select a product** from the left panel (or dropdown on mobile)
2. Choose **Pharmacy** or **Main Stock** at the top right
3. The statement shows all transactions with:
   - Date
   - Description (Stock IN, Dispensed, Transfer, etc.)
   - IN quantity (green)
   - OUT quantity (red)
   - Running Balance
4. The **Closing Balance** row at the bottom shows totals

### Filtering
- **Month filter** — select a specific month to view
- **Year filter** — select a specific year
- When filtered, an **Opening Balance** row shows the balance brought forward from before the filter period

### Understanding the Entries

| Description | Means |
|---|---|
| Stock IN (Purchase) | Medicine received from supplier into Main Stock |
| OUT → Pharmacy | Transferred from Main Stock to Pharmacy Stock |
| IN ← Main Stock | Received into Pharmacy Stock from Main Stock |
| Dispensed | Given to a patient from Pharmacy Stock |
| Adjustment | Admin correction with reason |

---

## 8. Reports (Admin Only)

**Path:** Reports (sidebar)

### Stock Value Report
Shows all products with their current main stock quantity and total stock value.
- **Export CSV** button downloads the data for Excel

### Expiry Report
Shows all batches expiring within 90 days.
- Red badge = already expired or expiring within 30 days
- Orange badge = expiring within 60 days
- **Export CSV** button downloads the data

---

## 9. Admin Panel

**Path:** Admin Panel (sidebar) — Admin only

### Approving New Users
When staff register, their accounts are **pending** until approved.
1. Go to **Admin Panel** or **Users**
2. Pending users appear at the top with a warning badge
3. Click **Approve** to give access
4. Click **Disable** to reject or disable an existing user

### Managing Users
**Admin Panel → Users** shows all users grouped by status:
- **Pending** — registered but not yet approved
- **Active** — can log in and use the system
- **Disabled** — cannot log in

### Stock Corrections (Adjustments)
**Admin Panel → Adjustments** — for correcting stock discrepancies found during physical count.

1. Find the product
2. Click **Adjust**
3. Select Main Stock or Pharmacy Stock
4. Enter the **correct quantity** (not the difference — the actual current count)
5. Enter a **reason** (minimum 10 characters — required for audit trail)
6. Click **Apply Adjustment**

This creates a permanent ledger entry showing what changed and why.

---

## 10. Mobile Usage

The app is designed to work on phones and tablets.

- Tap the **☰ menu icon** (top left) to open the navigation sidebar
- Tap anywhere outside the sidebar to close it
- All stock entry tables show the essential columns on mobile — extra columns (batch, expiry, supplier) are hidden on small screens but still saved when submitted
- The **Ledger** page has a dropdown product selector on mobile instead of the side panel

---

## 11. User Roles

| Feature | Admin | User (Staff) |
|---|---|---|
| View dashboard | ✓ | ✓ |
| View products | ✓ | ✓ |
| Add/edit/remove products | ✓ | ✗ |
| Bulk import products | ✓ | ✗ |
| Stock IN (purchase entry) | ✓ | ✓ |
| Transfer to pharmacy | ✓ | ✓ |
| Dispense medicines | ✓ | ✓ |
| View ledger | ✓ | ✓ |
| View reports | ✓ | ✗ |
| Approve/disable users | ✓ | ✗ |
| Stock corrections | ✓ | ✗ |
| Admin panel | ✓ | ✗ |

---

## 12. FAQ

**Q: I registered but can't log in.**
A: Your account is pending admin approval. Contact your system administrator to approve your account.

**Q: I entered the wrong quantity. How do I fix it?**
A: Contact an administrator. They can use **Stock Corrections** (Admin → Adjustments) to correct the quantity with a logged reason.

**Q: The medicine I want to dispense shows 0 stock.**
A: The medicine has run out in the **Pharmacy Stock**. Go to **To Pharmacy** and transfer more from Main Stock first.

**Q: Main Stock shows 0 but we have stock in the store.**
A: Go to **Stock IN** and enter the quantity received. If this is opening stock being entered for the first time, enter the current physical count.

**Q: How do I record that stock was damaged or expired?**
A: Ask an administrator to use **Stock Corrections** to reduce the quantity, entering the reason (e.g. "5 pieces expired batch BT2024-001 destroyed").

**Q: Can two people use the app at the same time?**
A: Yes. All stock operations use database transactions — if two people try to dispense the same medicine simultaneously, the system handles it safely and prevents over-dispensing.

**Q: The ledger balance doesn't match the current stock shown on the products page.**
A: This can happen if stock was adjusted directly without a proper ledger entry. Contact your administrator to run a stock correction with a reason.

**Q: How do I export data for reporting?**
A: Go to **Reports** (admin only) and use the **Export CSV** button on the Stock Value or Expiry report. The CSV can be opened in Excel or Google Sheets.