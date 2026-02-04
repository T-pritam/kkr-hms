# Daily Ledger & Employee Shift - Quick Start Guide

## 🚀 Access the System

### 1. Daily Ledger Summary (Public)
**URL**: `/ledger/daily-summary`

**What you can do:**
- View all transactions for a selected date
- Add OPD entries (walk-in collections)
- Add expenses
- Edit your own transactions
- Delete your own transactions
- See payment mode breakdown

**How to use:**
1. Select a date using the date picker
2. View statistics in the top cards
3. Scroll down to see transaction table
4. Click "Add OPD Entry" or "Add Expense" to create new transactions
5. Click edit icon to modify, trash icon to delete

---

### 2. Employee Shift Settlement (Admin Only)
**URL**: `/ledger/employee-shift`

**What you can do:**
- View all employees with transactions
- See each employee's credits, debits, and balance
- View detailed transaction list per employee
- Mark employees as paid (settled)
- Add settlement notes

**How to use:**
1. Select a settlement date using the date picker
2. View overall summary at top
3. Scroll down to see employee list
4. Click "View Details" on an employee
5. In modal, review transactions and add notes if needed
6. Click "Mark as Paid" to settle the employee

---

## 📊 Database Tables

### daily_ledger_transactions
Stores all financial transactions with:
- transaction_date
- transaction_type (credit/debit)
- source (patient/opd/expense)
- amount
- payment_mode (cash/upi/card/bank_transfer/cheque)
- status (pending/verified/day_closed)
- created_by (user who created it)
- verified_by (admin who verified it)

### daily_ledger_closures
Stores daily closure summaries with:
- closure_date
- total_credits, total_debits, net_balance
- Payment mode breakdown
- closed_by (admin who closed it)

---

## 🔌 API Endpoints

### Create Transaction
```bash
POST /api/ledger/transactions
Content-Type: application/json

{
  "transaction_date": "2026-02-04",
  "transaction_type": "credit",
  "source": "opd",
  "amount": 500,
  "payment_mode": "cash",
  "description": "OPD walk-in collection",
  "notes": "Optional notes"
}
```

### Get Daily Summary
```bash
GET /api/ledger/daily-summary/2026-02-04
```

### Get Employee Shift Summary
```bash
GET /api/ledger/employee-shift-summary?date=2026-02-04
```

### Update Transaction Status (Admin)
```bash
PUT /api/ledger/transactions/{id}/status
Content-Type: application/json

{
  "status": "verified"
}
```

### Mark Employee as Paid (Admin)
```bash
POST /api/ledger/close-employee-day
Content-Type: application/json

{
  "employee_id": "uuid",
  "settlement_date": "2026-02-04",
  "notes": "Optional settlement notes"
}
```

### Close Daily Ledger (Admin)
```bash
POST /api/ledger/close-day
Content-Type: application/json

{
  "closure_date": "2026-02-04",
  "opening_balance": 0,
  "notes": "Optional notes"
}
```

---

## 🔐 Access Control

| Feature | User | Admin |
|---------|------|-------|
| View own transactions | ✅ | ✅ |
| View all transactions | ❌ | ✅ |
| Create transaction | ✅ | ✅ |
| Edit own transaction | ✅ | ✅ |
| Edit any transaction | ❌ | ✅ |
| Delete own transaction | ✅ | ✅ |
| Delete any transaction | ❌ | ✅ |
| Verify transaction | ❌ | ✅ |
| Settle employee day | ❌ | ✅ |
| Close daily ledger | ❌ | ✅ |
| View employee shift | ❌ | ✅ |

---

## 💡 Tips & Tricks

### OPD Entries
- Automatically set as credit transaction
- Source automatically set as "opd"
- Perfect for walk-in collections

### Expense Entries
- Automatically set as debit transaction
- Source automatically set as "expense"
- Can specify expense category

### UPI Payments
- Always require reference number (UPI ID or transaction ID)
- System validates this requirement

### Day Closure
- Once a day is closed, no new transactions can be added
- Existing transactions become read-only
- Historical data preserved for reporting

### Settlement
- Mark individual employees as paid per day
- Or close entire daily ledger at once
- Settlement notes are recorded for audit trail

---

## 🆘 Common Issues

### Cannot add transaction
- Check if day is already closed
- Verify all required fields are filled
- For UPI, ensure reference number is provided

### Cannot verify transaction
- Only admins can verify transactions
- Transaction status must be "pending"
- Transaction must not be closed

### Cannot settle employee
- Only admins can settle employees
- Check if employee has transactions for that date
- Verify employee hasn't already been settled

---

## 📋 Payment Modes Supported

1. **Cash** - Physical currency exchange
2. **UPI** - Digital payment (requires UPI ID)
3. **Card** - Credit/Debit card payments
4. **Bank Transfer** - Direct bank transfer
5. **Cheque** - Physical cheque payment

---

## 📱 Mobile Support

Both pages are fully responsive:
- **Desktop**: Full table view with all columns
- **Tablet**: Optimized table layout
- **Mobile**: Card-based layout for easy viewing

---

## 🔄 Data Flow

### Adding a Transaction
1. Click "Add OPD Entry" or "Add Expense"
2. Fill form with required details
3. Submit
4. Transaction appears in ledger with "Pending" status
5. Admin can verify to change status to "Verified"

### Settling an Employee (Admin)
1. Go to Employee Shift page
2. Select settlement date
3. Click "View Details" on employee
4. Review all transactions
5. Add optional settlement notes
6. Click "Mark as Paid"
7. All employee transactions marked as closed
8. Employee moved to closed status

---

## 🧹 Maintenance

### Regular Tasks
- **Daily**: Review and verify pending transactions
- **Weekly**: Review payment mode breakdown
- **Monthly**: Generate monthly summaries
- **Quarterly**: Audit transaction history

### Backup
- Database is automatically backed up by Supabase
- All transaction history is preserved
- Closed transactions cannot be modified

---

**Last Updated**: February 4, 2026
**Version**: 1.0
**Status**: Production Ready

For detailed API documentation, see: `DAILY_LEDGER_AND_EMPLOYEE_SHIFT_DOCUMENTATION.md`
