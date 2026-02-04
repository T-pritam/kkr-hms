# Daily Ledger Summary & Employee Shift Management - Complete Documentation

## Table of Contents

1. [Overview](#overview)
2. [Database Schema](#database-schema)
3. [API Endpoints](#api-endpoints)
4. [Frontend - Daily Ledger Summary](#frontend---daily-ledger-summary)
5. [Frontend - Employee Shift Settlement](#frontend---employee-shift-settlement)
6. [UI Components & Modals](#ui-components--modals)
7. [Backend Logic & Controllers](#backend-logic--controllers)
8. [Implementation Guide](#implementation-guide)
9. [Testing Checklist](#testing-checklist)

---

## Overview

This module provides two key features for hospital financial management:

### 1. **Daily Ledger Summary** (Public - Visible to All Users)
- Tracks all financial transactions for a specific date
- Shows credits (patient payments, OPD collections) and debits (expenses)
- Allows users to view, add, edit, and delete their transactions
- Admins can verify and update transaction statuses
- Generates PDF reports for daily and monthly summaries

### 2. **Employee Shift Settlement** (Admin Only)
- Manages per-employee financial transactions for a shift/day
- Shows employee-wise credit/debit balance
- Allows admins to settle employee days (mark as paid)
- Calculates net balance for each employee
- Prevents modifications after day closure

**Technologies Used:**
- **Database:** Supabase PostgreSQL
- **Backend:** Fastify with TypeScript
- **Frontend:** React with Ant Design
- **Authentication:** JWT Bearer tokens
- **Validation:** Zod schemas

---

## Database Schema

### 1. **daily_ledger_transactions** Table

Stores all financial transactions with complete audit trail.

#### **Schema:**

```sql
CREATE TABLE daily_ledger_transactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- Transaction Details
    transaction_date DATE NOT NULL DEFAULT CURRENT_DATE,
    transaction_type VARCHAR(20) NOT NULL,          -- 'credit' or 'debit'
    source VARCHAR(50) NOT NULL,                    -- 'patient', 'opd', 'expense'
    
    -- Financial Details
    amount DECIMAL(10,2) NOT NULL,                  -- Amount > 0
    payment_mode VARCHAR(50) NOT NULL,              -- 'cash', 'upi', 'card', 'bank_transfer', 'cheque'
    reference_number VARCHAR(100),                  -- UPI ID, cheque number, etc.
    
    -- Relationships
    patient_id UUID REFERENCES patients(id) ON DELETE SET NULL,  -- Nullable, for non-patient transactions
    
    -- Description
    description TEXT NOT NULL,                      -- What is this transaction for
    notes TEXT,                                     -- Additional notes
    
    -- Status & Audit Trail
    status VARCHAR(20) DEFAULT 'pending',           -- 'pending', 'verified', 'day_closed'
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_by UUID NOT NULL REFERENCES users(id),  -- Employee who created the transaction
    verified_at TIMESTAMP WITH TIME ZONE,
    verified_by UUID REFERENCES users(id),          -- Admin who verified
    
    -- Constraints
    CHECK (transaction_type IN ('credit', 'debit')),
    CHECK (source IN ('patient', 'opd', 'expense')),
    CHECK (amount > 0),
    CHECK (payment_mode IN ('cash', 'upi', 'card', 'bank_transfer', 'cheque')),
    CHECK (status IN ('pending', 'verified', 'day_closed')),
    CHECK (payment_mode != 'upi' OR (reference_number IS NOT NULL AND reference_number != ''))
);
```

#### **Indexes:**

```
- idx_ledger_transaction_date         → (transaction_date DESC)
- idx_ledger_created_by               → (created_by)
- idx_ledger_status                   → (status)
- idx_ledger_patient                  → (patient_id) WHERE patient_id IS NOT NULL
- idx_ledger_type_source              → (transaction_type, source)
- idx_ledger_payment_mode             → (payment_mode)
- idx_ledger_date_status              → (transaction_date DESC, status)
```

#### **Column Details:**

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | UUID | NO | uuid_generate_v4() | Unique transaction ID |
| transaction_date | DATE | NO | CURRENT_DATE | Date of transaction |
| transaction_type | VARCHAR(20) | NO | - | 'credit' = money in, 'debit' = money out |
| source | VARCHAR(50) | NO | - | Where did money come from? patient/opd/expense |
| amount | DECIMAL(10,2) | NO | - | Amount in rupees (must be > 0) |
| payment_mode | VARCHAR(50) | NO | - | How was it paid? cash/upi/card/bank_transfer/cheque |
| reference_number | VARCHAR(100) | YES | - | UPI ID, cheque #, transaction ID (required for UPI) |
| patient_id | UUID | YES | NULL | Link to patient (if applicable) |
| description | TEXT | NO | - | What is this payment for? |
| notes | TEXT | YES | NULL | Additional remarks |
| status | VARCHAR(20) | YES | 'pending' | pending→verified→day_closed |
| created_at | TIMESTAMP | YES | CURRENT_TIMESTAMP | When was it created |
| created_by | UUID | NO | - | Who created it (employee/user) |
| verified_at | TIMESTAMP | YES | NULL | When admin verified it |
| verified_by | UUID | YES | NULL | Which admin verified it |

---

### 2. **daily_ledger_closures** Table

Stores daily closure summaries.

```sql
CREATE TABLE daily_ledger_closures (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    closure_date DATE NOT NULL UNIQUE,
    
    -- Payment Mode Breakdown
    total_credits_cash DECIMAL(10,2) DEFAULT 0.00,
    total_credits_upi DECIMAL(10,2) DEFAULT 0.00,
    total_credits_other DECIMAL(10,2) DEFAULT 0.00,
    
    -- Totals
    total_credits DECIMAL(10,2) NOT NULL,
    total_debits DECIMAL(10,2) NOT NULL,
    net_balance DECIMAL(10,2) NOT NULL,
    
    -- Counts
    transaction_count INTEGER DEFAULT 0,
    credit_count INTEGER DEFAULT 0,
    debit_count INTEGER DEFAULT 0,
    
    -- Closure Info
    closed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    closed_by UUID NOT NULL REFERENCES users(id),
    notes TEXT,
    opening_balance DECIMAL(10,2) DEFAULT 0.00,
    closing_balance DECIMAL(10,2) NOT NULL
);
```

---

## API Endpoints

### Base URL: `/ledger`

All endpoints require JWT authentication.

#### **1. Create Transaction**

```http
POST /ledger/transactions
```

**Authentication:** Required (any authenticated user)

**Request Body:**
```typescript
interface CreateTransactionInput {
  transaction_date: string;        // YYYY-MM-DD
  transaction_type: 'credit' | 'debit';
  source: 'patient' | 'opd' | 'expense';
  amount: number;                  // > 0, max 2 decimal places
  payment_mode: 'cash' | 'upi' | 'card' | 'bank_transfer' | 'cheque';
  reference_number?: string;       // Required if payment_mode = 'upi'
  patient_id?: string;             // UUID (optional)
  description: string;             // What is this transaction
  notes?: string;                  // Optional notes
}
```

**Response:**
```json
{
  "success": true,
  "message": "Transaction created successfully",
  "data": {
    "id": "uuid",
    "transaction_date": "2026-02-04",
    "transaction_type": "credit",
    "source": "opd",
    "amount": 500,
    "payment_mode": "cash",
    "reference_number": null,
    "patient_id": null,
    "description": "OPD walk-in collection",
    "notes": null,
    "status": "pending",
    "created_at": "2026-02-04T10:30:00Z",
    "created_by": "user-uuid",
    "verified_at": null,
    "verified_by": null
  }
}
```

**Status Codes:**
- `201`: Transaction created
- `400`: Day already closed or validation error
- `401`: Unauthorized
- `500`: Server error

---

#### **2. Get Transactions**

```http
GET /ledger/transactions?start_date=2026-02-01&end_date=2026-02-04&transaction_type=credit&source=opd&status=pending
```

**Authentication:** Required

**Query Parameters:**
```typescript
interface GetTransactionsQuery {
  start_date?: string;             // YYYY-MM-DD
  end_date?: string;               // YYYY-MM-DD
  transaction_type?: 'credit' | 'debit';
  source?: 'patient' | 'opd' | 'expense';
  payment_mode?: string;
  status?: 'pending' | 'verified' | 'day_closed';
  created_by?: string;             // UUID (admin only)
  patient_id?: string;             // UUID
}
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid-1",
      "transaction_date": "2026-02-04",
      "transaction_type": "credit",
      "source": "opd",
      "amount": 500,
      "payment_mode": "cash",
      "status": "pending",
      "created_at": "2026-02-04T10:30:00Z",
      "created_by": "user-uuid",
      "created_by_user": {
        "id": "user-uuid",
        "username": "receptionist_1"
      }
    }
  ]
}
```

**Filtering Logic:**
- Regular users see only their own transactions
- Admins see all transactions
- Filters are applied in addition to role-based filtering

---

#### **3. Get Daily Summary**

```http
GET /ledger/daily-summary/2026-02-04
```

**Authentication:** Required

**Response:**
```json
{
  "success": true,
  "data": {
    "date": "2026-02-04",
    "total_credits": 5000,
    "total_debits": 1500,
    "net_balance": 3500,
    "total_credits_cash": 3000,
    "total_credits_upi": 2000,
    "total_credits_card": 0,
    "total_credits_other": 0,
    "credit_count": 8,
    "debit_count": 3,
    "transaction_count": 11,
    "payment_mode_summary": {
      "cash": 3000,
      "upi": 2000,
      "card": 0,
      "bank_transfer": 0,
      "cheque": 0
    },
    "transactions": [
      {
        "id": "uuid",
        "transaction_type": "credit",
        "source": "opd",
        "amount": 500,
        "payment_mode": "cash",
        "description": "OPD walk-in collection",
        "status": "pending",
        "created_at": "2026-02-04T10:30:00Z",
        "created_by": "user-uuid"
      }
    ],
    "is_day_closed": false
  }
}
```

---

#### **4. Update Transaction Status** (Admin Only)

```http
PUT /ledger/transactions/:id/status
```

**Authentication:** Admin only

**Request Body:**
```typescript
interface UpdateTransactionStatusInput {
  status: 'verified' | 'pending';
}
```

**Response:**
```json
{
  "success": true,
  "message": "Transaction status updated",
  "data": { ... }
}
```

---

#### **5. Update Transaction Details**

```http
PUT /ledger/transactions/:id
```

**Authentication:** User can update own, Admin can update any

**Request Body:**
```typescript
{
  "amount"?: number;
  "payment_mode"?: string;
  "reference_number"?: string;
  "description"?: string;
}
```

**Response:**
```json
{
  "success": true,
  "message": "Transaction updated successfully",
  "data": { ... }
}
```

---

#### **6. Delete Transaction**

```http
DELETE /ledger/transactions/:id
```

**Authentication:** User can delete own, Admin can delete any

**Response:**
```json
{
  "success": true,
  "message": "Transaction deleted successfully"
}
```

---

#### **7. Get Employee Shift Summary** (Admin Only)

```http
GET /ledger/employee-shift-summary?date=2026-02-04
```

**Authentication:** Admin only

**Response:**
```json
{
  "success": true,
  "data": {
    "settlementDate": "2026-02-04",
    "employeeSummaries": [
      {
        "employeeId": "user-uuid-1",
        "employeeName": "John Doe",
        "totalCredits": 2500,
        "totalDebits": 500,
        "netBalance": 2000,
        "creditCount": 5,
        "debitCount": 2,
        "transactionCount": 7,
        "isClosed": false,
        "transactions": [...]
      }
    ]
  }
}
```

---

#### **8. Get Employee Transactions** (Admin Only)

```http
GET /ledger/employee-transactions?employeeId=user-uuid&date=2026-02-04
```

**Authentication:** Admin only

**Query Parameters:**
- `employeeId`: UUID (required)
- `date`: YYYY-MM-DD (required)

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "transaction_type": "credit",
      "amount": 500,
      "status": "pending",
      "created_at": "2026-02-04T10:30:00Z"
    }
  ]
}
```

---

#### **9. Close Employee Day** (Admin Only)

```http
POST /ledger/close-employee-day
```

**Authentication:** Admin only

**Request Body:**
```typescript
{
  employee_id: string;           // UUID
  settlement_date: string;        // YYYY-MM-DD
  notes?: string;                 // Optional settlement notes
}
```

**Response:**
```json
{
  "success": true,
  "message": "Employee marked as paid successfully",
  "data": {
    "employee_id": "user-uuid",
    "settlement_date": "2026-02-04",
    "totalCredits": 2500,
    "totalDebits": 500,
    "netBalance": 2000,
    "transactionsClosed": 7
  }
}
```

**What Happens:**
- Marks all pending transactions for this employee on this date as 'day_closed'
- Prevents adding new transactions for this employee on this date
- Resets employee's balance to 0 for next day

---

#### **10. Close Daily Ledger** (Admin Only)

```http
POST /ledger/close-day
```

**Authentication:** Admin only

**Request Body:**
```typescript
interface CloseDayInput {
  closure_date: string;           // YYYY-MM-DD
  opening_balance?: number;        // Previous day's closing balance
  notes?: string;                  // Optional closing notes
}
```

**Response:**
```json
{
  "success": true,
  "message": "Daily ledger closed successfully",
  "data": {
    "closure_date": "2026-02-04",
    "totalCredits": 5000,
    "totalDebits": 1500,
    "netBalance": 3500,
    "closingBalance": 3500,
    "transactionCount": 11,
    "creditCount": 8,
    "debitCount": 3,
    "closedAt": "2026-02-04T23:00:00Z",
    "closedBy": "admin-uuid"
  }
}
```

**What Happens:**
- Marks all 'pending' transactions as 'day_closed'
- Creates record in daily_ledger_closures table
- Prevents adding new transactions for that date

---

## Frontend - Daily Ledger Summary

### **File:** `frontend/src/pages/ledger/daily-summary.tsx`

### **Purpose:**
Display all transactions for a specific date with ability to:
- View daily summary (credits, debits, net balance)
- Add new transactions (OPD entry, expense entry)
- Edit existing transactions
- Delete transactions
- Verify transactions (admin only)
- Generate PDF reports

### **Key Features:**

#### **1. Date Selector**
```tsx
<DatePicker
  value={selectedDate}
  onChange={(date) => date && setSelectedDate(date)}
  format="DD/MM/YYYY"
  disabledDate={(current) => current && current > dayjs().endOf('day')}
/>
```
- Users can select any date up to today
- Cannot select future dates
- Fetches data for selected date

#### **2. Summary Statistics Cards**

Shows at the top:
- **Total Credits:** Sum of all credit transactions for the day
- **Total Debits:** Sum of all debit transactions for the day
- **Net Balance:** Total Credits - Total Debits
- **Transaction Count:** Total number of transactions

```tsx
<Row gutter={16}>
  <Col xs={12} sm={6}>
    <Statistic
      title="Total Credits"
      value={summary?.total_credits || 0}
      prefix="₹"
      valueStyle={{ color: '#52c41a' }}
    />
  </Col>
  <Col xs={12} sm={6}>
    <Statistic
      title="Total Debits"
      value={summary?.total_debits || 0}
      prefix="₹"
      valueStyle={{ color: '#ff4d4f' }}
    />
  </Col>
</Row>
```

#### **3. Payment Mode Breakdown**

Shows breakdown of credits by payment mode:
- Cash
- UPI
- Card
- Bank Transfer
- Cheque

#### **4. Transactions Table**

Displays all transactions with columns:
| Column | Description |
|--------|-------------|
| Time | Transaction timestamp (HH:mm:ss) |
| Type | 'CREDIT' (green) or 'DEBIT' (red) tag |
| Source | patient/opd/expense |
| Amount | Transaction amount |
| Mode | cash/upi/card/bank_transfer/cheque |
| Reference | Reference number (for UPI/cheque) |
| Description | What the transaction is for |
| Status | pending/verified/day_closed (colored tags) |
| Actions | Edit, Delete, Verify (if admin) |

#### **5. Action Buttons**

**Add OPD Entry:**
- Opens OpdEntryModal
- Creates credit transaction with source='opd'
- Default description: "OPD walk-in collection"

**Add Expense:**
- Opens ExpenseEntryModal
- Creates debit transaction with source='expense'

**Edit Transaction:**
- Opens modal to edit amount, payment_mode, reference_number, description
- Only can edit non-closed transactions
- User can edit own, admin can edit any

**Delete Transaction:**
- Requires confirmation popup
- Only can delete non-closed transactions
- User can delete own, admin can delete any

**Verify Transaction (Admin Only):**
- Changes status from 'pending' to 'verified'
- Marks as cleared by admin

**Download PDF Report:**
- Generates PDF with daily or monthly summary
- Includes all statistics and transaction details
- Uses html2pdf library for PDF generation

### **Data Flow:**

```
1. Component mounts → fetchDailySummary()
2. User selects date → fetchDailySummary()
3. API returns DailySummary object
4. UI renders statistics and transaction table
5. User clicks "Add OPD" → Modal opens
6. User submits → API creates transaction
7. UI refreshes via fetchDailySummary()
```

---

## Frontend - Employee Shift Settlement

### **File:** `frontend/src/pages/ledger/employee-shift.tsx`

### **Purpose:**
Allows admins to manage per-employee transactions and settle their shift/day.

**Access:** Admin only (via role check)

### **Key Features:**

#### **1. Date & Refresh Controls**

```tsx
<Space>
  <DatePicker
    value={selectedDate}
    onChange={(date) => date && setSelectedDate(date)}
    format="DD/MM/YYYY"
    disabledDate={(current) => current && current > dayjs().endOf('day')}
  />
  <Button
    icon={<ReloadOutlined />}
    onClick={fetchEmployeeShiftSummary}
    loading={loading}
  >
    Refresh
  </Button>
</Space>
```

#### **2. Employee Summary Table**

Shows list of all employees with transactions on selected date:

| Column | Description |
|--------|-------------|
| Employee Name | Name from users table |
| Credits (₹) | Total credit amount |
| Debits (₹) | Total debit amount |
| Balance (₹) | Credits - Debits (green if positive, red if negative) |
| Transactions | Count of transactions |
| Status | Tag: 'PENDING' (orange) or '🔒 CLOSED' (purple) |
| Actions | "View Details" button |

**Example Row:**
```
| John Doe | ₹2,500 | ₹500 | ₹2,000 | 7 | PENDING | [View Details] |
```

#### **3. Employee Details Modal**

When clicking "View Details", shows:

**Employee Summary Card:**
```
Credits:     ₹2,500 (green, large font)
Debits:      ₹500   (red, large font)
Balance:     ₹2,000 (green or red depending on sign)
Transactions: 7
```

**All Transactions Table:**
Shows all transactions for this employee on this date:
- Time (HH:mm:ss)
- Type (CREDIT/DEBIT)
- Source (patient/opd/expense)
- Amount
- Mode (cash/upi/etc.)
- Status (tag)

**Settlement Form:**
```tsx
<Form layout="vertical">
  <Form.Item label="Notes" name="notes">
    <TextArea 
      rows={3}
      placeholder="Optional notes (e.g., payment method, remarks)"
    />
  </Form.Item>
</Form>
```

**Actions:**
- **Mark as Paid (Red Button):** Settles employee's day
  - Updates all transactions to 'day_closed'
  - Saves notes if provided
  - Shows confirmation dialog first

#### **4. Workflow:**

```
User opens page
    ↓
Selects date
    ↓
fetchEmployeeShiftSummary() API call
    ↓
Display employee list with credits/debits
    ↓
Admin clicks "View Details" on employee
    ↓
Modal opens showing all transactions
    ↓
Admin enters settlement notes (optional)
    ↓
Admin clicks "Mark as Paid"
    ↓
Confirmation dialog appears
    ↓
closeEmployeeDay() API call
    ↓
Status changed to '🔒 CLOSED'
    ↓
Modal closes, employee list refreshes
```

---

## UI Components & Modals

### **1. OpdEntryModal**

**File:** `frontend/src/components/ledger/OpdEntryModal.tsx`

**Purpose:** Create OPD walk-in payment entry

**Form Fields:**
```tsx
<Form layout="vertical">
  <Form.Item
    label="OPD Amount"
    name="amount"
    rules={[
      { required: true, message: 'Amount is required' },
      { pattern: /^\d+(\.\d{1,2})?$/, message: 'Valid decimal number' },
      { 
        validator: (_, value) => value > 0 ? Promise.resolve() : Promise.reject('Must be > 0')
      }
    ]}
  >
    <InputNumber
      prefix="₹"
      step={100}
      min={0}
      max={100000}
      placeholder="Enter amount"
    />
  </Form.Item>

  <Form.Item
    label="Payment Mode"
    name="payment_mode"
    rules={[{ required: true }]}
  >
    <Select placeholder="Select payment method">
      <Option value="cash">Cash</Option>
      <Option value="upi">UPI</Option>
      <Option value="card">Card</Option>
      <Option value="bank_transfer">Bank Transfer</Option>
      <Option value="cheque">Cheque</Option>
    </Select>
  </Form.Item>

  <Form.Item
    label="Reference (Required for UPI)"
    name="reference_number"
    dependencies={['payment_mode']}
    rules={[
      {
        validator: (_, value) => {
          const paymentMode = form.getFieldValue('payment_mode');
          if (paymentMode === 'upi' && !value) {
            return Promise.reject('UPI reference is required');
          }
          return Promise.resolve();
        }
      }
    ]}
  >
    <Input placeholder="UPI ID / Cheque # / Transaction ID" />
  </Form.Item>

  <Form.Item label="Notes (Optional)" name="notes">
    <TextArea rows={2} placeholder="Any additional notes" />
  </Form.Item>
</Form>
```

**On Submit:**
```typescript
createTransaction({
  transaction_date: selectedDate.format('YYYY-MM-DD'),
  transaction_type: 'credit',
  source: 'opd',
  amount: values.amount,
  payment_mode: values.payment_mode,
  reference_number: values.reference_number,
  description: 'OPD walk-in collection',
  notes: values.notes
})
```

---

### **2. ExpenseEntryModal**

**File:** `frontend/src/components/ledger/ExpenseEntryModal.tsx`

**Purpose:** Create expense (debit) entry

**Form Fields:**
```tsx
<Form layout="vertical">
  <Form.Item
    label="Expense Category"
    name="expense_category"
    rules={[{ required: true }]}
  >
    <Select placeholder="Select category">
      <Option value="supplies">Medical Supplies</Option>
      <Option value="utilities">Utilities & Rent</Option>
      <Option value="maintenance">Maintenance</Option>
      <Option value="staff">Staff Bonus</Option>
      <Option value="other">Other</Option>
    </Select>
  </Form.Item>

  <Form.Item
    label="Expense Amount"
    name="amount"
    rules={[
      { required: true, message: 'Amount is required' },
      { 
        validator: (_, value) => value > 0 ? Promise.resolve() : Promise.reject('Must be > 0')
      }
    ]}
  >
    <InputNumber
      prefix="₹"
      step={100}
      min={0}
      max={100000}
    />
  </Form.Item>

  <Form.Item
    label="Payment Mode"
    name="payment_mode"
    rules={[{ required: true }]}
  >
    <Select>
      <Option value="cash">Cash</Option>
      <Option value="bank_transfer">Bank Transfer</Option>
      <Option value="cheque">Cheque</Option>
    </Select>
  </Form.Item>

  <Form.Item label="Description" name="description">
    <Input placeholder="What is this expense for?" />
  </Form.Item>

  <Form.Item label="Notes (Optional)" name="notes">
    <TextArea rows={2} />
  </Form.Item>
</Form>
```

**On Submit:**
```typescript
createTransaction({
  transaction_date: selectedDate.format('YYYY-MM-DD'),
  transaction_type: 'debit',
  source: 'expense',
  amount: values.amount,
  payment_mode: values.payment_mode,
  reference_number: values.reference_number,
  description: values.description,
  notes: values.notes
})
```

---

### **3. Edit Transaction Modal**

**File:** `frontend/src/pages/ledger/daily-summary.tsx` (inline)

**Purpose:** Edit existing transaction

**Restrictions:**
- Cannot edit 'day_closed' status transactions
- User can edit own, admin can edit any
- Cannot change transaction_type or source

**Editable Fields:**
- Amount
- Payment Mode
- Reference Number
- Description

---

## Backend Logic & Controllers

### **File:** `backend/src/controllers/ledger.controller.ts`

### **Key Functions:**

#### **1. createTransaction()**

```typescript
export const createTransaction = async (request, reply) => {
  // 1. Validate input with Zod schema
  // 2. Get userId from JWT token
  // 3. Check if day is already closed (status = 'day_closed')
  // 4. If closed, reject with error message
  // 5. Insert transaction with created_by = userId
  // 6. Return transaction with 201 status
};
```

**Logic:**
```
Request → Validate schema
         ↓
Check if day closed (transaction_date already has day_closed status)
         ↓
If closed: return 400 error
         ↓
If open: Insert transaction
         ↓
Set status = 'pending'
Set created_by = current user
         ↓
Return 201 with transaction data
```

#### **2. getDailySummary()**

```typescript
export const getDailySummary = async (request, reply) => {
  // 1. Get date from URL params or query
  // 2. Fetch all transactions for that date
  // 3. Calculate totals by payment mode and type
  // 4. Count transactions by type
  // 5. Return summary object with:
  //    - total_credits, total_debits, net_balance
  //    - payment_mode breakdown
  //    - transaction list
};
```

**Calculation:**
```
Fetch transactions where transaction_date = selected_date
         ↓
Group by transaction_type and payment_mode
         ↓
Sum amounts:
  - totalCredits = SUM(amount) WHERE transaction_type = 'credit'
  - totalDebits = SUM(amount) WHERE transaction_type = 'debit'
  - totalCreditsCash = SUM(amount) WHERE transaction_type = 'credit' AND payment_mode = 'cash'
  - totalCreditsUpi = SUM(amount) WHERE transaction_type = 'credit' AND payment_mode = 'upi'
         ↓
Calculate:
  - netBalance = totalCredits - totalDebits
         ↓
Count:
  - creditCount = COUNT(*) WHERE transaction_type = 'credit'
  - debitCount = COUNT(*) WHERE transaction_type = 'debit'
  - transactionCount = COUNT(*)
         ↓
Return DailySummary object
```

#### **3. getEmployeeShiftSummary()**

```typescript
export const getEmployeeShiftSummary = async (request, reply) => {
  // 1. Get date from query params
  // 2. Fetch all transactions for that date
  // 3. Group by created_by (employee)
  // 4. For each employee, calculate:
  //    - totalCredits, totalDebits, netBalance
  //    - transaction count
  //    - isClosed status (if any transaction has status = 'day_closed')
  // 5. Return array of employee summaries with transaction list for each
};
```

**Detailed Logic:**

```
Fetch all transactions WHERE transaction_date = selected_date
         ↓
Create Map<employee_id, employeeData>
         ↓
For each transaction:
    employee_id = created_by
    If not in map: create entry with zeros
    
    If transaction_type = 'credit':
      employeeData.totalCredits += amount
      employeeData.creditCount += 1
    Else if transaction_type = 'debit':
      employeeData.totalDebits += amount
      employeeData.debitCount += 1
    
    employeeData.transactionCount += 1
    employeeData.transactions.push(transaction)
    
    If transaction.status = 'day_closed':
      employeeData.isClosed = true
         ↓
For each employee:
    Calculate:
      - netBalance = totalCredits - totalDebits
    
    Fetch user details (name) using employee_id
         ↓
Return array of employee summaries
```

#### **4. closeEmployeeDay()**

```typescript
export const closeEmployeeDay = async (request, reply) => {
  // 1. Validate input (employee_id, settlement_date)
  // 2. Check admin role
  // 3. Fetch all transactions for this employee on this date
  // 4. Check if already closed (any with status = 'day_closed')
  // 5. If closed, reject with error
  // 6. Calculate totalCredits and totalDebits
  // 7. Update all transaction statuses to 'day_closed'
  // 8. Add settlement notes to each transaction
  // 9. Return settlement summary
};
```

**Execution Flow:**

```
GET transactions for (employee_id AND transaction_date AND status != 'day_closed')
         ↓
If none found: Return error "No transactions found"
         ↓
Check: any transaction with status = 'day_closed'
         ↓
If yes: Return error "Already closed"
         ↓
Calculate:
  totalCredits = SUM(amount) WHERE transaction_type = 'credit'
  totalDebits = SUM(amount) WHERE transaction_type = 'debit'
  netBalance = totalCredits - totalDebits
         ↓
UPDATE all transactions SET:
  status = 'day_closed'
  notes = notes (from parameter) or 'Marked as paid'
         ↓
Return settlement data:
  {
    employee_id,
    settlement_date,
    totalCredits,
    totalDebits,
    netBalance,
    transactionsClosed: count
  }
```

---

### **Validation Schemas (Zod)**

```typescript
// Create Transaction
export const createTransactionSchema = z.object({
  transaction_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  transaction_type: z.enum(['credit', 'debit']),
  source: z.enum(['patient', 'opd', 'expense']),
  amount: z.number().positive().multipleOf(0.01),
  payment_mode: z.enum(['cash', 'upi', 'card', 'bank_transfer', 'cheque']),
  reference_number: z.string().optional(),
  patient_id: z.string().uuid().optional(),
  description: z.string().min(1).max(500),
  notes: z.string().optional(),
}).refine(
  (data) => data.payment_mode !== 'upi' || !!data.reference_number,
  { message: 'Reference number required for UPI' }
);

// Update Transaction Status
export const updateTransactionStatusSchema = z.object({
  status: z.enum(['pending', 'verified']),
});

// Close Day
export const closeDaySchema = z.object({
  closure_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  opening_balance: z.number().default(0),
  notes: z.string().optional(),
});
```

---

## Implementation Guide

### **Step 1: Database Setup**

1. Run migration 013 to create tables:
   - `daily_ledger_transactions`
   - `daily_ledger_closures`

2. Verify indexes are created:
   ```sql
   SELECT indexname FROM pg_indexes 
   WHERE tablename = 'daily_ledger_transactions';
   ```

3. Test constraints:
   ```sql
   -- This should fail (amount must be > 0)
   INSERT INTO daily_ledger_transactions 
   (transaction_date, transaction_type, source, amount, payment_mode, description, created_by)
   VALUES ('2026-02-04', 'credit', 'opd', 0, 'cash', 'Test', 'uuid');
   ```

### **Step 2: Backend Implementation**

1. Create validators in `src/validators/ledger.validator.ts`
   - All Zod schemas provided above

2. Create controller functions in `src/controllers/ledger.controller.ts`
   - All functions documented above

3. Create routes in `src/routes/ledger.routes.ts`
   ```typescript
   // Public authenticated endpoints
   fastify.post('/transactions', createTransaction);
   fastify.get('/transactions', getTransactions);
   fastify.get('/daily-summary/:date', getDailySummary);
   fastify.put('/transactions/:id', updateTransaction);
   fastify.delete('/transactions/:id', deleteTransaction);
   
   // Admin only
   fastify.put('/transactions/:id/status', { preHandler: adminMiddleware }, updateTransactionStatus);
   fastify.post('/close-day', { preHandler: adminMiddleware }, closeDailyLedger);
   fastify.get('/employee-shift-summary', { preHandler: adminMiddleware }, getEmployeeShiftSummary);
   fastify.get('/employee-transactions', { preHandler: adminMiddleware }, getEmployeeTransactions);
   fastify.post('/close-employee-day', { preHandler: adminMiddleware }, closeEmployeeDay);
   ```

4. Add middleware to verify all routes need authentication

### **Step 3: Frontend Implementation**

1. Create Daily Summary page (`pages/ledger/daily-summary.tsx`)
   - Date picker
   - Summary statistics
   - Transaction table
   - Action buttons

2. Create Employee Shift page (`pages/ledger/employee-shift.tsx`)
   - Date picker
   - Employee summary table
   - Details modal
   - Settlement form

3. Create modals:
   - `components/ledger/OpdEntryModal.tsx`
   - `components/ledger/ExpenseEntryModal.tsx`

4. Add API methods to `services/api.ts`:
   ```typescript
   getDailySummary(date: string)
   createTransaction(data: CreateTransactionInput)
   updateTransaction(id: string, data: UpdateTransactionData)
   deleteTransaction(id: string)
   updateTransactionStatus(id: string, status: string)
   getEmployeeShiftSummary(date?: string)
   getEmployeeTransactions(employeeId: string, date: string)
   closeEmployeeDay(data: CloseEmployeeDayData)
   closeDailyLedger(data: CloseDayData)
   ```

5. Update routing in `App.tsx`:
   ```tsx
   {
     name: "daily-summary",
     list: "/ledger/daily-summary",
     meta: {
       label: "Daily Summary",
       icon: <WalletOutlined />,
     },
   },
   {
     name: "employee-shift",
     list: "/ledger/employee-shift",
     meta: {
       label: "Employee Shift (Admin)",
       parent: "admin",
       // Only admin
     },
   }
   ```

### **Step 4: Testing**

See Testing Checklist section below.

---

## Testing Checklist

### **Daily Ledger Summary Tests**

- [ ] View daily summary for current date
  - [ ] Verify statistics are calculated correctly
  - [ ] Verify transaction list displays all transactions
  - [ ] Verify payment mode breakdown is accurate

- [ ] Add OPD Entry
  - [ ] Create new OPD credit transaction
  - [ ] Verify source = 'opd'
  - [ ] Verify transaction_type = 'credit'
  - [ ] Verify summary updates immediately

- [ ] Add Expense Entry
  - [ ] Create new expense debit transaction
  - [ ] Verify source = 'expense'
  - [ ] Verify transaction_type = 'debit'
  - [ ] Verify amount is deducted from balance

- [ ] Edit Transaction
  - [ ] User can edit own transaction
  - [ ] Admin can edit any transaction
  - [ ] Cannot edit after day is closed
  - [ ] Changes reflect immediately in summary

- [ ] Delete Transaction
  - [ ] User can delete own transaction
  - [ ] Admin can delete any transaction
  - [ ] Requires confirmation
  - [ ] Cannot delete after day is closed
  - [ ] Summary updates after deletion

- [ ] Verify Transaction (Admin)
  - [ ] Status changes from pending to verified
  - [ ] Verified date/time recorded
  - [ ] Verified by user recorded

- [ ] Day Closure
  - [ ] Cannot add transaction after closure
  - [ ] Cannot edit transaction after closure
  - [ ] Cannot delete transaction after closure
  - [ ] All transactions show status = 'day_closed'

- [ ] PDF Export
  - [ ] Daily PDF generates correctly
  - [ ] Monthly till-date PDF aggregates data
  - [ ] Statistics match displayed values
  - [ ] Payment mode breakdown shows correctly

### **Employee Shift Settlement Tests**

- [ ] View employee shift summary
  - [ ] All employees with transactions display
  - [ ] Credits/debits calculated correctly
  - [ ] Balance shows correct sign (green/red)
  - [ ] Transaction count accurate

- [ ] View employee details
  - [ ] Modal opens with all transactions
  - [ ] Summary statistics display
  - [ ] All transactions visible with correct details

- [ ] Settlement form
  - [ ] Can enter optional notes
  - [ ] Form validation works

- [ ] Mark as paid
  - [ ] Confirmation dialog appears
  - [ ] All employee transactions status changes to 'day_closed'
  - [ ] Employee list refreshes
  - [ ] Employee status shows '🔒 CLOSED'
  - [ ] Cannot mark already closed employee

- [ ] Admin-only access
  - [ ] Non-admin users cannot access page
  - [ ] Shows 403 error or redirects
  - [ ] Admin sees all employees

### **Edge Cases**

- [ ] Multiple employees with transactions same day
  - [ ] Each employee's balance calculated independently
  - [ ] Closing one employee doesn't affect others

- [ ] UPI transaction without reference
  - [ ] Form validation prevents submission
  - [ ] Error message shown

- [ ] Negative balance employee
  - [ ] Shows balance in red
  - [ ] Can still be settled

- [ ] Transaction with past date
  - [ ] Can add transaction for any past date
  - [ ] Cannot add for future dates

- [ ] Zero balance employee
  - [ ] Shows ₹0 balance
  - [ ] Can be settled

- [ ] Concurrent modifications
  - [ ] Last write wins (optimistic locking not needed for this app)

### **API Tests**

- [ ] Create transaction
  - [ ] Validates amount > 0
  - [ ] Validates date format
  - [ ] Validates transaction_type enum
  - [ ] Validates payment_mode enum
  - [ ] Rejects if day closed

- [ ] Get daily summary
  - [ ] Returns all transactions for date
  - [ ] Calculates totals correctly
  - [ ] Payment mode breakdown accurate

- [ ] Update transaction status
  - [ ] Admin can update
  - [ ] Non-admin gets 403
  - [ ] Only pending can be verified

- [ ] Close employee day
  - [ ] Admin can close
  - [ ] Updates all transactions to day_closed
  - [ ] Prevents duplicate closure

---

## Common Issues & Solutions

### **Issue: "Cannot create transaction for [date]. The day has been closed."**

**Cause:** Trying to add transaction after day closure

**Solution:** 
- Check daily_ledger_closures table to find closure date
- Or ask admin to reopen the day (if needed)

### **Issue: UPI transaction rejected with validation error**

**Cause:** Missing reference_number for UPI payment_mode

**Solution:**
- Provide UPI ID or transaction ID in reference_number field
- This is required by system to prevent fraud

### **Issue: Employee balance shows wrong amount**

**Cause:** Pending or unverified transactions affecting calculation

**Solution:**
- Verify all transactions are in the list
- Check transaction_type and amount for each
- Ensure day hasn't been partially closed

### **Issue: Cannot edit settled transaction**

**Cause:** Transaction has status = 'day_closed'

**Solution:**
- This is correct behavior - closed transactions are locked
- If must edit, admin should first delete and recreate

---

## Performance Optimizations

1. **Indexes:** All key queries are indexed
   - transaction_date DESC (most common filter)
   - created_by (for employee shift summary)
   - status (to check day closure)
   - date + status combo (common query)

2. **Query Efficiency:**
   - Daily summary aggregates in database (not application)
   - Employee shift summary groups by created_by in query
   - Pagination for transaction lists (if > 1000 records)

3. **Caching (Optional):**
   - Cache daily summary for 5 minutes
   - Invalidate on new transaction creation

---

## Future Enhancements

1. **Batch Operations:**
   - Import transactions from CSV
   - Bulk verify transactions

2. **Reporting:**
   - Monthly trend analysis
   - Payment mode preferences
   - Employee settlement history

3. **Notifications:**
   - Email confirmation on large transactions
   - Daily summary email to finance team

4. **Reconciliation:**
   - Match with actual bank statements
   - Flag discrepancies

---

**Last Updated:** February 4, 2026
**Status:** ✅ Complete
**Database Verification:** ✅ Live Supabase Instance

