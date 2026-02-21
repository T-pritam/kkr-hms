# Lab/Pathology Module - Complete End-to-End Documentation

## Table of Contents
1. [Overview](#overview)
   - [Module Structure](#module-structure)
   - [Sub-Module Interaction Flow](#sub-module-interaction-flow)
   - [Current Database Statistics](#current-database-statistics)
2. [Database Schema](#database-schema)
   - [Sub-Module 1: Lab Tests Tables](#sub-module-1-lab-tests-tables)
   - [Sub-Module 2: Patient Test Results Tables](#sub-module-2-patient-test-results-tables)
   - [Entity Relationship Diagram](#entity-relationship-diagram-ascii)
3. [API Endpoints](#api-endpoints)
   - [API Endpoints Summary](#api-endpoints-summary)
   - [Sub-Module 1: Lab Tests APIs](#sub-module-1-lab-tests-apis)
   - [Sub-Module 2: Patient Test Results APIs](#sub-module-2-patient-test-results-apis)
4. [UI/UX Components](#uiux-components)
   - [Sub-Module 1: Lab Tests UI Components](#sub-module-1-lab-tests-ui-components)
   - [Sub-Module 2: Patient Test Results UI Components](#sub-module-2-patient-test-results-ui-components)
5. [Business Logic](#business-logic)
6. [Implementation Flow](#implementation-flow)
7. [Sub-Module Integration](#sub-module-integration)
8. [Best Practices](#best-practices)
9. [Integration Guide](#integration-guide)
10. [Quick Reference Guide](#quick-reference-guide)
11. [Troubleshooting](#troubleshooting)
12. [Appendix](#appendix-sample-data)

---

## Overview

The Lab/Pathology module is a comprehensive system for managing laboratory test orders, test parameter definitions, result entry, and patient test history. It supports multiple test types, gender-specific reference ranges, and status-based workflow management.

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                     LAB/PATHOLOGY MODULE                            │
│                                                                     │
│  ┌────────────────────────────┐  ┌────────────────────────────────┐│
│  │   SUB-MODULE 1             │  │   SUB-MODULE 2                 ││
│  │   LAB TESTS                │  │   PATIENT TEST RESULTS         ││
│  │   (Master Data)            │  │   (Transactional Data)         ││
│  │                            │  │                                ││
│  │  • Define test types       │  │  • Order tests for patients    ││
│  │  • Configure parameters    │  │  • Track sample collection     ││
│  │  • Set reference ranges    │  │  • Enter test results          ││
│  │  • Manage pricing          │  │  • Verify and issue reports    ││
│  │                            │  │  • View patient history        ││
│  │  Tables: 2                 │  │  Tables: 2                     ││
│  │  APIs: 9                   │  │  APIs: 8                       ││
│  │  UI Screens: 3             │  │  UI Screens: 5                 ││
│  │                            │  │                                ││
│  │  Users: Admins,            │  │  Users: Doctors, Lab Techs,    ││
│  │         Lab Managers       │  │         Patients, Receptionists││
│  └────────────┬───────────────┘  └───────────┬────────────────────┘│
│               │                              │                     │
│               │     References/Uses          │                     │
│               └──────────────►───────────────┘                     │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘

Flow: 
1. Lab Tests defines WHAT tests are available
2. Patient Test Results uses those definitions for ACTUAL patient testing
```

### Module Structure

The Lab/Pathology module consists of **TWO main sub-modules**:

#### 1. **Lab Tests Sub-Module**
Manages the master catalog of available laboratory tests and their parameters.

**Key Features:**
- Master catalog of lab tests with categories (Hematology, Biochemistry, Endocrinology, Clinical Pathology)
- Test management (Create, Read, Update, Delete test definitions)
- Configurable test parameters with normal/reference ranges
- Gender-specific reference value support
- Test pricing and categorization
- Active/inactive test management

**Core Tables:**
- `lab_tests` - Master table of all available test types
- `test_parameters` - Individual parameters measured within each test

#### 2. **Patient Test Results Sub-Module**
Manages patient-specific test orders, result entry, and history.

**Key Features:**
- Test order creation and management
- Sample collection tracking
- Result entry with automatic flag calculation (normal/low/high/critical)
- Patient test history tracking
- Multi-user workflow (ordering doctor, lab technician, verifier)
- Status-based workflow (pending → collected → processing → completed → verified)
- Discount and pricing management

**Core Tables:**
- `patient_test_results` - Individual test orders for patients
- `test_result_values` - Actual measurement values for each parameter

### Sub-Module Interaction Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                   LAB/PATHOLOGY MODULE                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌────────────────────────────┐  ┌─────────────────────────────┐│
│  │  SUB-MODULE 1:             │  │  SUB-MODULE 2:              ││
│  │  LAB TESTS                 │  │  PATIENT TEST RESULTS       ││
│  │  (Master Data)             │  │  (Transactional Data)       ││
│  ├────────────────────────────┤  ├─────────────────────────────┤│
│  │                            │  │                             ││
│  │ ┌──────────────────────┐   │  │ ┌──────────────────────┐    ││
│  │ │   lab_tests          │   │  │ │ patient_test_results │    ││
│  │ │ ─────────────────    │   │  │ │ ──────────────────── │    ││
│  │ │ - Test definitions   │───┼──┼─│ - Test orders        │    ││
│  │ │ - Categories         │   │  │ │ - Sample tracking    │    ││
│  │ │ - Pricing            │   │  │ │ - Status workflow    │    ││
│  │ │ - Active/Inactive    │   │  │ │ - Pricing/Discount   │    ││
│  │ └──────────────────────┘   │  │ └──────────────────────┘    ││
│  │           │                │  │           │                 ││
│  │           │ 1:N            │  │           │ 1:N             ││
│  │           ▼                │  │           ▼                 ││
│  │ ┌──────────────────────┐   │  │ ┌──────────────────────┐    ││
│  │ │  test_parameters     │   │  │ │ test_result_values   │    ││
│  │ │ ──────────────────── │   │  │ │ ──────────────────── │    ││
│  │ │ - Parameter names    │───┼──┼─│ - Actual values      │    ││
│  │ │ - Units              │   │  │ │ - Flags (L/H/N/C)    │    ││
│  │ │ - Reference ranges   │   │  │ │ - Historical ranges  │    ││
│  │ │ - Gender-specific    │   │  │ │ - Notes              │    ││
│  │ └──────────────────────┘   │  │ └──────────────────────┘    ││
│  │                            │  │                             ││
│  └────────────────────────────┘  └─────────────────────────────┘│
│                                                                  │
└─────────────────────────────────────────────────────────────────┘

Workflow:
1. Admin creates test definitions in Lab Tests sub-module
2. Admin defines parameters for each test with reference ranges
3. Doctor/Receptionist creates test order using Patient Test Results sub-module
4. Lab technician enters actual values referencing parameter definitions
5. System auto-calculates flags based on reference ranges
6. Results are verified and issued to patient
```

### Current Database Statistics

| Sub-Module | Component | Count |
|------------|-----------|-------|
| Lab Tests | Total Tests Available | 12 |
| Lab Tests | Total Parameters Defined | 77 |
| Lab Tests | Test Categories | 4 (Biochemistry, Hematology, Endocrinology, Clinical Pathology) |
| Patient Test Results | Test Orders/Results | Variable (transactional) |
| Patient Test Results | Result Values Stored | Variable (transactional) |

### Sample Tests in System

| Test Name | Code | Category | Price | Parameters |
|-----------|------|----------|-------|------------|
| Complete Blood Count | CBC001 | Hematology | ₹300 | 8 |
| Liver Function Test | LFT001 | Biochemistry | ₹600 | 8 |
| Kidney Function Test | KFT001 | Biochemistry | ₹450 | 6 |
| Lipid Profile | LIPID001 | Biochemistry | ₹500 | 5 |
| Thyroid Profile | THYROID001 | Endocrinology | ₹550 | 3 |
| Urine Analysis | URINE001 | Clinical Pathology | ₹100 | 16 |
| Blood Sugar - Fasting | SUGAR001 | Biochemistry | ₹150 | 1 |
| HbA1c Test | HBA1C001 | Biochemistry | ₹400 | 1 |

---

## Database Schema

### Schema Organization by Sub-Module

The database schema is organized into two logical groups corresponding to the sub-modules:

**Sub-Module 1: Lab Tests (Master Data Tables)**
- `lab_tests` - Defines all available test types
- `test_parameters` - Defines parameters for each test with reference ranges

**Sub-Module 2: Patient Test Results (Transactional Tables)**
- `patient_test_results` - Stores individual test orders and results
- `test_result_values` - Stores actual measurement values

---

### SUB-MODULE 1: LAB TESTS TABLES

### 1. Table: `lab_tests`

**Purpose:** Master table storing all available lab test types

```sql
CREATE TABLE lab_tests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    code VARCHAR(50) NOT NULL UNIQUE,
    category VARCHAR(100),
    description TEXT,
    sample_type VARCHAR(50),
    price NUMERIC NOT NULL DEFAULT 0.00,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

**Column Definitions:**
- `id`: Unique identifier (UUID)
- `name`: Display name of the test (e.g., "Complete Blood Count")
- `code`: Unique code for the test (e.g., "CBC001")
- `category`: Test category (e.g., "Hematology", "Biochemistry", "Microbiology")
- `description`: Detailed description of the test
- `sample_type`: Type of sample required (e.g., "Blood", "Urine", "Serum")
- `price`: Base price of the test
- `is_active`: Flag to enable/disable tests
- `created_at`: Record creation timestamp
- `updated_at`: Last update timestamp

**Sample Data:**
```sql
INSERT INTO lab_tests (name, code, category, description, sample_type, price) VALUES
('Complete Blood Count', 'CBC001', 'Hematology', 'Measures different components of blood including RBC, WBC, hemoglobin, hematocrit, and platelets', 'Blood', 300.00),
('Blood Sugar - Fasting', 'SUGAR001', 'Biochemistry', 'Measures blood glucose levels after fasting', 'Blood', 150.00),
('Lipid Profile', 'LIPID001', 'Biochemistry', 'Measures cholesterol, triglycerides, HDL, and LDL', 'Serum', 500.00);
```

---

### 2. Table: `test_parameters`

**Purpose:** Defines individual parameters/components measured within each lab test with normal reference ranges

```sql
CREATE TABLE test_parameters (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    test_id UUID NOT NULL REFERENCES lab_tests(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    unit VARCHAR(50),
    min_value NUMERIC,
    max_value NUMERIC,
    gender_specific BOOLEAN DEFAULT false,
    male_min NUMERIC,
    male_max NUMERIC,
    female_min NUMERIC,
    female_max NUMERIC,
    display_order INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

**Column Definitions:**
- `id`: Unique identifier (UUID)
- `test_id`: Foreign key to lab_tests table
- `name`: Parameter name (e.g., "Hemoglobin", "WBC Count")
- `unit`: Measurement unit (e.g., "g/dL", "cells/mm³")
- `min_value`: General minimum normal value
- `max_value`: General maximum normal value
- `gender_specific`: Flag indicating if reference ranges differ by gender
- `male_min`: Minimum normal value for males (if gender_specific = true)
- `male_max`: Maximum normal value for males (if gender_specific = true)
- `female_min`: Minimum normal value for females (if gender_specific = true)
- `female_max`: Maximum normal value for females (if gender_specific = true)
- `display_order`: Order for parameter display in reports
- `is_active`: Flag to enable/disable parameters

**Sample Data:**
```sql
-- Parameters for Complete Blood Count (CBC)
INSERT INTO test_parameters (test_id, name, unit, gender_specific, male_min, male_max, female_min, female_max, display_order) VALUES
('<cbc_test_id>', 'Hemoglobin', 'g/dL', true, 13.50, 17.50, 12.00, 15.50, 1),
('<cbc_test_id>', 'WBC Count', 'cells/mm³', false, 4000, 11000, NULL, NULL, 2),
('<cbc_test_id>', 'RBC Count', 'million/mm³', true, 4.50, 5.90, 4.00, 5.20, 3),
('<cbc_test_id>', 'Platelet Count', 'lakh/mm³', false, 1.50, 4.50, NULL, NULL, 4),
('<cbc_test_id>', 'Hematocrit', '%', false, 36.00, 50.00, NULL, NULL, 5);
```

---

### SUB-MODULE 2: PATIENT TEST RESULTS TABLES

### 3. Table: `patient_test_results`

**Purpose:** Stores individual test order records for each patient

```sql
CREATE TABLE patient_test_results (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    test_id UUID NOT NULL REFERENCES lab_tests(id) ON DELETE RESTRICT,
    test_date DATE NOT NULL DEFAULT CURRENT_DATE,
    sample_collected_at TIMESTAMP,
    result_issued_at TIMESTAMP,
    price NUMERIC NOT NULL DEFAULT 0,
    discount NUMERIC DEFAULT 0,
    final_price NUMERIC,
    status VARCHAR(50) DEFAULT 'pending',
    reference_doctor_id UUID REFERENCES users(id),
    conducted_by UUID REFERENCES users(id),
    verified_by UUID REFERENCES users(id),
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

**Column Definitions:**
- `id`: Unique identifier (UUID)
- `patient_id`: Foreign key to patients table
- `test_id`: Foreign key to lab_tests table
- `test_date`: Date when test was ordered/scheduled
- `sample_collected_at`: Timestamp when sample was collected
- `result_issued_at`: Timestamp when results were finalized/issued
- `price`: Original price of the test
- `discount`: Discount amount applied
- `final_price`: Final price after discount
- `status`: Current status of the test order
  - `pending`: Test ordered, awaiting sample collection
  - `collected`: Sample collected, awaiting processing
  - `processing`: Test in progress
  - `completed`: Results ready
  - `verified`: Results verified by authorized personnel
  - `cancelled`: Test cancelled
- `reference_doctor_id`: Doctor who ordered/referred the test
- `conducted_by`: Lab technician who performed the test
- `verified_by`: Doctor/supervisor who verified the results
- `notes`: Additional notes or comments
- `created_at`: Record creation timestamp
- `updated_at`: Last update timestamp

**Sample Data:**
```sql
INSERT INTO patient_test_results (patient_id, test_id, test_date, price, discount, final_price, status, reference_doctor_id) VALUES
('<patient_id>', '<cbc_test_id>', '2026-02-16', 300.00, 30.00, 270.00, 'pending', '<doctor_id>');
```

---

### 4. Table: `test_result_values`

**Purpose:** Stores actual measurement values for each test parameter

```sql
CREATE TABLE test_result_values (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    result_id UUID NOT NULL REFERENCES patient_test_results(id) ON DELETE CASCADE,
    parameter_id UUID NOT NULL REFERENCES test_parameters(id) ON DELETE RESTRICT,
    value NUMERIC,
    text_value TEXT,
    flag VARCHAR(20) DEFAULT 'normal',
    unit VARCHAR(50),
    ref_min NUMERIC,
    ref_max NUMERIC,
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(result_id, parameter_id)
);
```

**Column Definitions:**
- `id`: Unique identifier (UUID)
- `result_id`: Foreign key to patient_test_results table
- `parameter_id`: Foreign key to test_parameters table
- `value`: Numeric measurement value
- `text_value`: Text-based result (for non-numeric tests, e.g., "Positive", "Negative")
- `flag`: Indicator flag for the result
  - `normal`: Value within normal range
  - `low`: Value below normal range
  - `high`: Value above normal range
  - `critical`: Value in critical/dangerous range
- `unit`: Unit of measurement (copied from test_parameters for historical accuracy)
- `ref_min`: Reference minimum value used during this test (for historical record)
- `ref_max`: Reference maximum value used during this test (for historical record)
- `notes`: Additional notes for this specific parameter
- `created_at`: Record creation timestamp

**Sample Data:**
```sql
INSERT INTO test_result_values (result_id, parameter_id, value, flag, unit, ref_min, ref_max) VALUES
('<result_id>', '<hemoglobin_param_id>', 14.5, 'normal', 'g/dL', 13.50, 17.50),
('<result_id>', '<wbc_param_id>', 8500, 'normal', 'cells/mm³', 4000, 11000),
('<result_id>', '<rbc_param_id>', 5.2, 'normal', 'million/mm³', 4.50, 5.90);
```

---

### Entity Relationship Diagram (ASCII)

```
┌─────────────────────────┐
│      lab_tests          │
│─────────────────────────│
│ PK: id (UUID)           │
│     name                │
│     code (UNIQUE)       │
│     category            │
│     description         │
│     sample_type         │
│     price               │
│     is_active           │
└───────────┬─────────────┘
            │ 1
            │
            │ N
┌───────────┴─────────────┐           ┌─────────────────────────┐
│   test_parameters       │           │        patients         │
│─────────────────────────│           │─────────────────────────│
│ PK: id (UUID)           │           │ PK: id (UUID)           │
│ FK: test_id             │           │     name                │
│     name                │                
│     unit                │           │     gender              │
│     min_value           │           │     date_of_birth       │
│     max_value           │           └──────────┬──────────────┘
│     gender_specific     │                      │ 1
│     male_min/max        │                      │
│     female_min/max      │                      │ N
│     display_order       │           ┌──────────┴──────────────┐
└───────────┬─────────────┘           │ patient_test_results    │
            │ 1                       │─────────────────────────│
            │                         │ PK: id (UUID)           │
            │ N                       │ FK: patient_id          │
            │            ┌────────────┤ FK: test_id             │
            │            │            │ FK: reference_doctor_id │
            │            │            │ FK: conducted_by        │
            │            │            │ FK: verified_by         │
┌───────────┴────────────┴──┐         │     test_date           │
│   test_result_values      │         │     sample_collected_at │
│───────────────────────────│         │     result_issued_at    │
│ PK: id (UUID)             │         │     price               │
│ FK: result_id             │◄────────┤     discount            │
│ FK: parameter_id          │   1:N   │     final_price         │
│     value                 │         │     status              │
│     text_value            │         │     notes               │
│     flag                  │         └─────────────────────────┘
│     unit                  │                      │ N
│     ref_min               │                      │
│     ref_max               │                      │ 1
│     notes                 │           ┌──────────┴──────────────┐
└───────────────────────────┘           │        users            │
                                        │─────────────────────────│
                                        │ PK: id (UUID)           │
                                        │     username            │
                                        │     email               │
                                        │     role                │
                                        └─────────────────────────┘

Relationships:
- lab_tests 1:N test_parameters (One test has many parameters)
- lab_tests 1:N patient_test_results (One test type can be ordered multiple times)
- patients 1:N patient_test_results (One patient can have many test orders)
- patient_test_results 1:N test_result_values (One test order has many parameter values)
- test_parameters 1:N test_result_values (One parameter definition used by many results)
- users 1:N patient_test_results (via reference_doctor_id, conducted_by, verified_by)
```

---

## API Endpoints

### Base URL
```
http://localhost:3000/api
```

### Authentication
All endpoints require authentication via JWT token in the Authorization header:
```
Authorization: Bearer <jwt_token>
```

### API Endpoints Summary

**Sub-Module 1: Lab Tests (Master Data)**
| # | Method | Endpoint | Purpose |
|---|--------|----------|---------|
| 1 | GET | `/lab-tests` | Get all lab tests (with filters) |
| 2 | GET | `/lab-tests/:id` | Get single lab test by ID |
| 3 | POST | `/lab-tests` | Create new lab test |
| 4 | PUT | `/lab-tests/:id` | Update lab test |
| 5 | DELETE | `/lab-tests/:id` | Delete lab test |
| 6 | GET | `/lab-tests/:id/parameters` | Get parameters for a test |
| 7 | POST | `/lab-tests/:id/parameters` | Add parameter to test |
| 8 | PUT | `/lab-tests/:testId/parameters/:id` | Update parameter |
| 9 | DELETE | `/lab-tests/:testId/parameters/:id` | Delete parameter |

**Sub-Module 2: Patient Test Results (Transactional)**
| # | Method | Endpoint | Purpose |
|---|--------|----------|---------|
| 10 | GET | `/test-results` | Get all test results (with filters) |
| 11 | GET | `/test-results/:id` | Get single test result with values |
| 12 | GET | `/patients/:patientId/test-results` | Get patient's test history |
| 13 | POST | `/test-results` | Create test order |
| 14 | PUT | `/test-results/:id` | Update test status/details |
| 15 | DELETE | `/test-results/:id` | Delete test result |
| 16 | POST | `/test-results/:resultId/values` | Bulk create result values |
| 17 | PUT | `/test-results/:resultId/values/:id` | Update single result value |

---

## SUB-MODULE 1: LAB TESTS APIs

This sub-module provides endpoints for managing the master catalog of lab tests and their parameters.

---

### Lab Tests Management

#### 1. Get All Lab Tests
**Endpoint:** `GET /lab-tests`

**Query Parameters:**
- `page` (optional, default: 1): Page number
- `pageSize` (optional, default: 50, max: 100): Number of items per page
- `category` (optional): Filter by category
- `is_active` (optional): Filter by active status (true/false)
- `name` (optional): Search by name (case-insensitive partial match)

**Request Example:**
```bash
GET /lab-tests?page=1&pageSize=20&category=Hematology&is_active=true&name=blood
```

**Response Example:**
```json
{
  "success": true,
  "data": {
    "data": [
      {
        "id": "3b75f990-de75-4b8d-8a2b-4141b45ca6c0",
        "name": "Complete Blood Count",
        "code": "CBC001",
        "category": "Hematology",
        "description": "Measures different components of blood including RBC, WBC, hemoglobin, hematocrit, and platelets",
        "sample_type": "Blood",
        "price": "300.00",
        "is_active": true,
        "created_at": "2025-11-20T05:06:56.711644Z",
        "updated_at": "2025-11-20T05:06:56.711644Z"
      }
    ],
    "pagination": {
      "page": 1,
      "pageSize": 20,
      "total": 1,
      "totalPages": 1
    }
  }
}
```

**Status Codes:**
- `200 OK`: Success
- `401 Unauthorized`: Missing or invalid authentication
- `500 Internal Server Error`: Server error

---

#### 2. Get Lab Test by ID
**Endpoint:** `GET /lab-tests/:id`

**Path Parameters:**
- `id`: UUID of the lab test

**Request Example:**
```bash
GET /lab-tests/3b75f990-de75-4b8d-8a2b-4141b45ca6c0
```

**Response Example:**
```json
{
  "success": true,
  "data": {
    "id": "3b75f990-de75-4b8d-8a2b-4141b45ca6c0",
    "name": "Complete Blood Count",
    "code": "CBC001",
    "category": "Hematology",
    "description": "Measures different components of blood including RBC, WBC, hemoglobin, hematocrit, and platelets",
    "sample_type": "Blood",
    "price": "300.00",
    "is_active": true,
    "created_at": "2025-11-20T05:06:56.711644Z",
    "updated_at": "2025-11-20T05:06:56.711644Z"
  }
}
```

**Status Codes:**
- `200 OK`: Success
- `404 Not Found`: Lab test not found
- `401 Unauthorized`: Missing or invalid authentication
- `500 Internal Server Error`: Server error

---

#### 3. Create Lab Test
**Endpoint:** `POST /lab-tests`

**Request Body:**
```json
{
  "name": "Liver Function Test",
  "code": "LFT001",
  "category": "Biochemistry",
  "description": "Comprehensive test to evaluate liver health",
  "sample_type": "Blood",
  "price": 450.00,
  "is_active": true
}
```

**Response Example:**
```json
{
  "success": true,
  "message": "Lab test created successfully",
  "data": {
    "id": "7c8e90f1-2345-6789-abcd-ef1234567890",
    "name": "Liver Function Test",
    "code": "LFT001",
    "category": "Biochemistry",
    "description": "Comprehensive test to evaluate liver health",
    "sample_type": "Blood",
    "price": "450.00",
    "is_active": true,
    "created_at": "2026-02-16T10:30:00.000Z",
    "updated_at": "2026-02-16T10:30:00.000Z"
  }
}
```

**Validation Rules:**
- `name`: Required, max 255 characters
- `code`: Required, unique, max 50 characters
- `category`: Optional, max 100 characters
- `description`: Optional
- `sample_type`: Optional, max 50 characters
- `price`: Required, must be >= 0
- `is_active`: Optional, boolean

**Status Codes:**
- `201 Created`: Success
- `400 Bad Request`: Validation error or duplicate code
- `401 Unauthorized`: Missing or invalid authentication
- `500 Internal Server Error`: Server error

---

#### 4. Update Lab Test
**Endpoint:** `PUT /lab-tests/:id`

**Path Parameters:**
- `id`: UUID of the lab test

**Request Body:**
```json
{
  "name": "Liver Function Test - Complete",
  "price": 500.00,
  "is_active": true
}
```

**Response Example:**
```json
{
  "success": true,
  "message": "Lab test updated successfully",
  "data": {
    "id": "7c8e90f1-2345-6789-abcd-ef1234567890",
    "name": "Liver Function Test - Complete",
    "code": "LFT001",
    "category": "Biochemistry",
    "description": "Comprehensive test to evaluate liver health",
    "sample_type": "Blood",
    "price": "500.00",
    "is_active": true,
    "created_at": "2026-02-16T10:30:00.000Z",
    "updated_at": "2026-02-16T11:45:00.000Z"
  }
}
```

**Status Codes:**
- `200 OK`: Success
- `404 Not Found`: Lab test not found
- `400 Bad Request`: Validation error
- `401 Unauthorized`: Missing or invalid authentication
- `500 Internal Server Error`: Server error

---

#### 5. Delete Lab Test
**Endpoint:** `DELETE /lab-tests/:id`

**Path Parameters:**
- `id`: UUID of the lab test

**Response Example:**
```json
{
  "success": true,
  "message": "Lab test deleted successfully"
}
```

**Status Codes:**
- `200 OK`: Success
- `404 Not Found`: Lab test not found
- `401 Unauthorized`: Missing or invalid authentication
- `500 Internal Server Error`: Server error

**Note:** Deletion will fail if there are existing test results referencing this test (ON DELETE RESTRICT constraint).

---

### Test Parameters Management

#### 6. Get Test Parameters
**Endpoint:** `GET /lab-tests/:id/parameters`

**Path Parameters:**
- `id`: UUID of the lab test

**Request Example:**
```bash
GET /lab-tests/3b75f990-de75-4b8d-8a2b-4141b45ca6c0/parameters
```

**Response Example:**
```json
{
  "success": true,
  "data": [
    {
      "id": "873c281a-69dc-4d2a-be5b-708012adc98a",
      "test_id": "3b75f990-de75-4b8d-8a2b-4141b45ca6c0",
      "name": "Hemoglobin",
      "unit": "g/dL",
      "min_value": null,
      "max_value": null,
      "gender_specific": true,
      "male_min": "13.50",
      "male_max": "17.50",
      "female_min": "12.00",
      "female_max": "15.50",
      "display_order": 1,
      "is_active": true,
      "created_at": "2025-10-31T14:40:15.923334Z"
    },
    {
      "id": "b7cb0dd6-b6a8-4944-a175-a69538dbc215",
      "test_id": "3b75f990-de75-4b8d-8a2b-4141b45ca6c0",
      "name": "WBC Count",
      "unit": "cells/mm³",
      "min_value": "4000.00",
      "max_value": "11000.00",
      "gender_specific": false,
      "male_min": null,
      "male_max": null,
      "female_min": null,
      "female_max": null,
      "display_order": 2,
      "is_active": true,
      "created_at": "2025-10-31T14:40:15.923334Z"
    }
  ]
}
```

**Status Codes:**
- `200 OK`: Success
- `404 Not Found`: Lab test not found
- `401 Unauthorized`: Missing or invalid authentication
- `500 Internal Server Error`: Server error

---

#### 7. Create Test Parameter
**Endpoint:** `POST /lab-tests/:id/parameters`

**Path Parameters:**
- `id`: UUID of the lab test

**Request Body:**
```json
{
  "name": "Blood Glucose",
  "unit": "mg/dL",
  "min_value": 70,
  "max_value": 100,
  "gender_specific": false,
  "display_order": 1,
  "is_active": true
}
```

**Request Body (Gender-Specific Example):**
```json
{
  "name": "Hemoglobin",
  "unit": "g/dL",
  "gender_specific": true,
  "male_min": 13.5,
  "male_max": 17.5,
  "female_min": 12.0,
  "female_max": 15.5,
  "display_order": 1,
  "is_active": true
}
```

**Response Example:**
```json
{
  "success": true,
  "message": "Test parameter created successfully",
  "data": {
    "id": "a1b2c3d4-5678-90ab-cdef-1234567890ab",
    "test_id": "3b75f990-de75-4b8d-8a2b-4141b45ca6c0",
    "name": "Blood Glucose",
    "unit": "mg/dL",
    "min_value": "70.00",
    "max_value": "100.00",
    "gender_specific": false,
    "male_min": null,
    "male_max": null,
    "female_min": null,
    "female_max": null,
    "display_order": 1,
    "is_active": true,
    "created_at": "2026-02-16T12:00:00.000Z"
  }
}
```

**Validation Rules:**
- `name`: Required, max 255 characters
- `unit`: Optional, max 50 characters
- `min_value`, `max_value`: Required if `gender_specific` is false
- `male_min`, `male_max`, `female_min`, `female_max`: Required if `gender_specific` is true
- `display_order`: Optional, integer
- `is_active`: Optional, boolean

**Status Codes:**
- `201 Created`: Success
- `400 Bad Request`: Validation error
- `404 Not Found`: Lab test not found
- `401 Unauthorized`: Missing or invalid authentication
- `500 Internal Server Error`: Server error

---

#### 8. Update Test Parameter
**Endpoint:** `PUT /lab-tests/:testId/parameters/:id`

**Path Parameters:**
- `testId`: UUID of the lab test
- `id`: UUID of the test parameter

**Request Body:**
```json
{
  "name": "Fasting Blood Glucose",
  "min_value": 70,
  "max_value": 100
}
```

**Response Example:**
```json
{
  "success": true,
  "message": "Test parameter updated successfully",
  "data": {
    "id": "a1b2c3d4-5678-90ab-cdef-1234567890ab",
    "test_id": "3b75f990-de75-4b8d-8a2b-4141b45ca6c0",
    "name": "Fasting Blood Glucose",
    "unit": "mg/dL",
    "min_value": "70.00",
    "max_value": "100.00",
    "gender_specific": false,
    "display_order": 1,
    "is_active": true,
    "created_at": "2026-02-16T12:00:00.000Z"
  }
}
```

**Status Codes:**
- `200 OK`: Success
- `404 Not Found`: Parameter or test not found
- `400 Bad Request`: Validation error
- `401 Unauthorized`: Missing or invalid authentication
- `500 Internal Server Error`: Server error

---

#### 9. Delete Test Parameter
**Endpoint:** `DELETE /lab-tests/:testId/parameters/:id`

**Path Parameters:**
- `testId`: UUID of the lab test
- `id`: UUID of the test parameter

**Response Example:**
```json
{
  "success": true,
  "message": "Test parameter deleted successfully"
}
```

**Status Codes:**
- `200 OK`: Success
- `404 Not Found`: Parameter not found
- `401 Unauthorized`: Missing or invalid authentication
- `500 Internal Server Error`: Server error

---

## SUB-MODULE 2: PATIENT TEST RESULTS APIs

This sub-module provides endpoints for managing patient test orders, result entry, and history.

---

### Test Results Management

#### 10. Get All Test Results
**Endpoint:** `GET /test-results`

**Query Parameters:**
- `page` (optional, default: 1): Page number
- `pageSize` (optional, default: 50, max: 100): Items per page
- `status` (optional): Filter by status (pending/collected/processing/completed/verified/cancelled)
- `test_id` (optional): Filter by test type
- `patient_id` (optional): Filter by patient
- `from_date` (optional): Filter by date range start (YYYY-MM-DD)
- `to_date` (optional): Filter by date range end (YYYY-MM-DD)

**Request Example:**
```bash
GET /test-results?page=1&pageSize=20&status=completed&from_date=2026-02-01&to_date=2026-02-16
```

**Response Example:**
```json
{
  "success": true,
  "data": {
    "data": [
      {
        "id": "result-uuid-1",
        "patient_id": "patient-uuid",
        "test_id": "test-uuid",
        "test_date": "2026-02-16",
        "sample_collected_at": "2026-02-16T09:30:00.000Z",
        "result_issued_at": "2026-02-16T14:45:00.000Z",
        "price": "300.00",
        "discount": "30.00",
        "final_price": "270.00",
        "status": "completed",
        "reference_doctor_id": "doctor-uuid",
        "conducted_by": "tech-uuid",
        "verified_by": null,
        "notes": "",
        "created_at": "2026-02-16T08:00:00.000Z",
        "updated_at": "2026-02-16T14:45:00.000Z",
        "patient": {
          "id": "patient-uuid",
          "first_name": "John",
          "last_name": "Doe",
          "date_of_birth": "1985-05-15",
          "gender": "male"
        },
        "test": {
          "id": "test-uuid",
          "name": "Complete Blood Count",
          "code": "CBC001",
          "category": "Hematology"
        },
        "reference_doctor": {
          "id": "doctor-uuid",
          "username": "dr_smith",
          "email": "dr.smith@hospital.com"
        },
        "conducted_by_user": {
          "id": "tech-uuid",
          "username": "lab_tech1",
          "email": "tech1@hospital.com"
        },
        "verified_by_user": null
      }
    ],
    "pagination": {
      "page": 1,
      "pageSize": 20,
      "total": 1,
      "totalPages": 1
    }
  }
}
```

**Status Codes:**
- `200 OK`: Success
- `401 Unauthorized`: Missing or invalid authentication
- `500 Internal Server Error`: Server error

---

#### 11. Get Test Result by ID
**Endpoint:** `GET /test-results/:id`

**Path Parameters:**
- `id`: UUID of the test result

**Request Example:**
```bash
GET /test-results/result-uuid-1
```

**Response Example:**
```json
{
  "success": true,
  "data": {
    "id": "result-uuid-1",
    "patient_id": "patient-uuid",
    "test_id": "test-uuid",
    "test_date": "2026-02-16",
    "sample_collected_at": "2026-02-16T09:30:00.000Z",
    "result_issued_at": "2026-02-16T14:45:00.000Z",
    "price": "300.00",
    "discount": "30.00",
    "final_price": "270.00",
    "status": "completed",
    "notes": "",
    "patient": {
      "id": "patient-uuid",
      "first_name": "John",
      "last_name": "Doe",
      "date_of_birth": "1985-05-15",
      "gender": "male"
    },
    "test": {
      "id": "test-uuid",
      "name": "Complete Blood Count",
      "code": "CBC001",
      "category": "Hematology",
      "sample_type": "Blood"
    },
    "reference_doctor": {
      "id": "doctor-uuid",
      "username": "dr_smith",
      "email": "dr.smith@hospital.com"
    },
    "values": [
      {
        "id": "value-uuid-1",
        "result_id": "result-uuid-1",
        "parameter_id": "param-uuid-1",
        "value": "14.50",
        "text_value": null,
        "flag": "normal",
        "unit": "g/dL",
        "ref_min": "13.50",
        "ref_max": "17.50",
        "notes": "",
        "created_at": "2026-02-16T14:30:00.000Z",
        "parameter": {
          "id": "param-uuid-1",
          "name": "Hemoglobin",
          "unit": "g/dL",
          "display_order": 1
        }
      },
      {
        "id": "value-uuid-2",
        "result_id": "result-uuid-1",
        "parameter_id": "param-uuid-2",
        "value": "8500",
        "text_value": null,
        "flag": "normal",
        "unit": "cells/mm³",
        "ref_min": "4000",
        "ref_max": "11000",
        "notes": "",
        "created_at": "2026-02-16T14:30:00.000Z",
        "parameter": {
          "id": "param-uuid-2",
          "name": "WBC Count",
          "unit": "cells/mm³",
          "display_order": 2
        }
      }
    ]
  }
}
```

**Status Codes:**
- `200 OK`: Success
- `404 Not Found`: Test result not found
- `401 Unauthorized`: Missing or invalid authentication
- `500 Internal Server Error`: Server error

---

#### 12. Get Patient Test Results
**Endpoint:** `GET /patients/:patientId/test-results`

**Path Parameters:**
- `patientId`: UUID of the patient

**Query Parameters:**
- `page` (optional, default: 1)
- `pageSize` (optional, default: 50)

**Request Example:**
```bash
GET /patients/patient-uuid/test-results?page=1&pageSize=10
```

**Response:** Same format as "Get All Test Results" but filtered by patient

**Status Codes:**
- `200 OK`: Success
- `404 Not Found`: Patient not found
- `401 Unauthorized`: Missing or invalid authentication
- `500 Internal Server Error`: Server error

---

#### 13. Create Test Result (Order Test)
**Endpoint:** `POST /test-results`

**Request Body:**
```json
{
  "patient_id": "patient-uuid",
  "test_id": "test-uuid",
  "test_date": "2026-02-16",
  "price": 300.00,
  "discount": 30.00,
  "final_price": 270.00,
  "reference_doctor_id": "doctor-uuid",
  "notes": "Patient fasting since last night"
}
```

**Response Example:**
```json
{
  "success": true,
  "message": "Test result created successfully",
  "data": {
    "id": "new-result-uuid",
    "patient_id": "patient-uuid",
    "test_id": "test-uuid",
    "test_date": "2026-02-16",
    "sample_collected_at": null,
    "result_issued_at": null,
    "price": "300.00",
    "discount": "30.00",
    "final_price": "270.00",
    "status": "pending",
    "reference_doctor_id": "doctor-uuid",
    "conducted_by": null,
    "verified_by": null,
    "notes": "Patient fasting since last night",
    "created_at": "2026-02-16T10:00:00.000Z",
    "updated_at": "2026-02-16T10:00:00.000Z"
  }
}
```

**Validation Rules:**
- `patient_id`: Required, must be valid UUID
- `test_id`: Required, must be valid UUID
- `test_date`: Required, date format
- `price`: Required, must be >= 0
- `discount`: Optional, must be >= 0
- `final_price`: Optional (auto-calculated if not provided)
- `reference_doctor_id`: Optional, must be valid UUID if provided

**Status Codes:**
- `201 Created`: Success
- `400 Bad Request`: Validation error
- `404 Not Found`: Patient or test not found
- `401 Unauthorized`: Missing or invalid authentication
- `500 Internal Server Error`: Server error

---

#### 14. Update Test Result
**Endpoint:** `PUT /test-results/:id`

**Path Parameters:**
- `id`: UUID of the test result

**Request Body:**
```json
{
  "status": "collected",
  "sample_collected_at": "2026-02-16T09:30:00.000Z",
  "conducted_by": "tech-uuid"
}
```

**Response Example:**
```json
{
  "success": true,
  "message": "Test result updated successfully",
  "data": {
    "id": "result-uuid",
    "patient_id": "patient-uuid",
    "test_id": "test-uuid",
    "status": "collected",
    "sample_collected_at": "2026-02-16T09:30:00.000Z",
    "conducted_by": "tech-uuid",
    "updated_at": "2026-02-16T09:35:00.000Z"
  }
}
```

**Common Update Scenarios:**
1. **Sample Collection:**
   ```json
   {
     "status": "collected",
     "sample_collected_at": "2026-02-16T09:30:00.000Z"
   }
   ```

2. **Start Processing:**
   ```json
   {
     "status": "processing",
     "conducted_by": "tech-uuid"
   }
   ```

3. **Complete Results:**
   ```json
   {
     "status": "completed",
     "result_issued_at": "2026-02-16T14:45:00.000Z"
   }
   ```

4. **Verify Results:**
   ```json
   {
     "status": "verified",
     "verified_by": "doctor-uuid"
   }
   ```

**Status Codes:**
- `200 OK`: Success
- `404 Not Found`: Test result not found
- `400 Bad Request`: Validation error
- `401 Unauthorized`: Missing or invalid authentication
- `500 Internal Server Error`: Server error

---

#### 15. Delete Test Result
**Endpoint:** `DELETE /test-results/:id`

**Path Parameters:**
- `id`: UUID of the test result

**Response Example:**
```json
{
  "success": true,
  "message": "Test result deleted successfully"
}
```

**Status Codes:**
- `200 OK`: Success
- `404 Not Found`: Test result not found
- `401 Unauthorized`: Missing or invalid authentication
- `500 Internal Server Error`: Server error

**Note:** Deleting a test result will cascade delete all associated test_result_values.

---

### Test Result Values Management

#### 16. Create Test Result Values (Bulk)
**Endpoint:** `POST /test-results/:resultId/values`

**Path Parameters:**
- `resultId`: UUID of the test result

**Request Body:**
```json
{
  "values": [
    {
      "parameter_id": "param-uuid-1",
      "value": 14.5
    },
    {
      "parameter_id": "param-uuid-2",
      "value": 8500
    },
    {
      "parameter_id": "param-uuid-3",
      "value": 5.2
    },
    {
      "parameter_id": "param-uuid-4",
      "text_value": "Normal",
      "notes": "Microscopic examination shows normal morphology"
    }
  ]
}
```

**Response Example:**
```json
{
  "success": true,
  "message": "Test result values created successfully",
  "data": {
    "values": [
      {
        "id": "value-uuid-1",
        "result_id": "result-uuid",
        "parameter_id": "param-uuid-1",
        "value": "14.50",
        "text_value": null,
        "flag": "normal",
        "unit": "g/dL",
        "ref_min": "13.50",
        "ref_max": "17.50",
        "notes": null,
        "created_at": "2026-02-16T14:30:00.000Z"
      },
      {
        "id": "value-uuid-2",
        "result_id": "result-uuid",
        "parameter_id": "param-uuid-2",
        "value": "8500",
        "text_value": null,
        "flag": "normal",
        "unit": "cells/mm³",
        "ref_min": "4000",
        "ref_max": "11000",
        "notes": null,
        "created_at": "2026-02-16T14:30:00.000Z"
      }
    ]
  }
}
```

**Business Logic:**
- The system automatically fetches the parameter definition
- Determines patient gender and applies gender-specific ranges if applicable
- Calculates the `flag` (normal/low/high/critical) based on value and reference range
- Stores the reference range values (ref_min, ref_max) for historical accuracy
- Copies the unit from the parameter definition

**Status Codes:**
- `201 Created`: Success
- `400 Bad Request`: Validation error
- `404 Not Found`: Test result or parameter not found
- `401 Unauthorized`: Missing or invalid authentication
- `500 Internal Server Error`: Server error

---

#### 17. Update Test Result Value
**Endpoint:** `PUT /test-results/:resultId/values/:id`

**Path Parameters:**
- `resultId`: UUID of the test result
- `id`: UUID of the test result value

**Request Body:**
```json
{
  "value": 15.2,
  "notes": "Repeat measurement confirmed"
}
```

**Response Example:**
```json
{
  "success": true,
  "message": "Test result value updated successfully",
  "data": {
    "id": "value-uuid-1",
    "result_id": "result-uuid",
    "parameter_id": "param-uuid-1",
    "value": "15.20",
    "text_value": null,
    "flag": "normal",
    "unit": "g/dL",
    "ref_min": "13.50",
    "ref_max": "17.50",
    "notes": "Repeat measurement confirmed",
    "created_at": "2026-02-16T14:30:00.000Z"
  }
}
```

**Note:** Updating the value will automatically recalculate the flag.

**Status Codes:**
- `200 OK`: Success
- `404 Not Found`: Value not found
- `400 Bad Request`: Validation error
- `401 Unauthorized`: Missing or invalid authentication
- `500 Internal Server Error`: Server error

---

### Error Response Format

All error responses follow this format:
```json
{
  "success": false,
  "message": "Error description",
  "error": "Detailed error message (in development mode)"
}
```

**Common Error Messages:**
- `"Missing or invalid authentication"`: 401 Unauthorized
- `"Resource not found"`: 404 Not Found
- `"Validation error"`: 400 Bad Request with details
- `"Internal server error"`: 500 Server Error

---

## UI/UX Components

The UI components are organized by sub-module functionality:

**Sub-Module 1: Lab Tests**
- Lab Tests Catalog/Management Screen
- Test Definition Form (Create/Edit)
- Test Parameters Configuration

**Sub-Module 2: Patient Test Results**
- Lab Dashboard (Overview)
- Test Order Creation Form
- Test Results Entry Form
- Test Results View/Display
- Patient Test History Timeline

---

## SUB-MODULE 1: LAB TESTS UI COMPONENTS

### 1. Lab Tests Catalog Screen

**Purpose:** Master screen for viewing and managing all available lab tests

**Layout:**
```
┌───────────────────────────────────────────────────────────────────┐
│  Lab Tests Catalog                       [+ Add New Test]          │
├───────────────────────────────────────────────────────────────────┤
│                                                                    │
│  Search: [_____________] 🔍    Category: [All ▼]  Status: [All ▼]│
│                                                                    │
│  ┌──────────────────────────────────────────────────────────────┐│
│  │ Test Name            │ Code    │ Category    │ Price │Actions││
│  ├──────────────────────┼─────────┼─────────────┼───────┼───────┤│
│  │ Complete Blood Count │ CBC001  │ Hematology  │ ₹300  │[Edit] ││
│  │ 8 parameters         │         │             │       │[View] ││
│  ├──────────────────────┼─────────┼─────────────┼───────┼───────┤│
│  │ Liver Function Test  │ LFT001  │ Biochemistry│ ₹600  │[Edit] ││
│  │ 8 parameters         │         │             │       │[View] ││
│  ├──────────────────────┼─────────┼─────────────┼───────┼───────┤│
│  │ Lipid Profile        │ LIPID001│ Biochemistry│ ₹500  │[Edit] ││
│  │ 5 parameters         │         │             │       │[View] ││
│  ├──────────────────────┼─────────┼─────────────┼───────┼───────┤│
│  │ Thyroid Profile      │THYROID..│ Endocrinology│₹550  │[Edit] ││
│  │ 3 parameters         │         │             │       │[View] ││
│  └──────────────────────┴─────────┴─────────────┴───────┴───────┘│
│                                                                    │
│                            [← Prev] Page 1 of 2 [Next →]          │
└───────────────────────────────────────────────────────────────────┘
```

**Key Features:**
- List all available tests with category and pricing
- Search and filter functionality
- Quick view of parameter count per test
- Edit and view actions
- Add new test button

**Interactive Elements:**
- **Add New Test:** Opens test creation form
- **Edit:** Opens test edit form with parameters
- **View:** Opens read-only view with parameters
- **Search:** Real-time search by name or code
- **Category Filter:** Filter by test category
- **Status Filter:** Show active/inactive tests

---

### 2. Test Definition Form (Create/Edit)

**Purpose:** Form for creating new tests or editing existing test definitions

**Layout:**
```
┌──────────────────────────────────────────────────────┐
│  Create New Lab Test                            [×]  │
├──────────────────────────────────────────────────────┤
│                                                       │
│  Basic Information                                   │
│  ┌────────────────────────────────────────────────┐ │
│  │ Test Name: *                                   │ │
│  │ [Complete Blood Count________________]         │ │
│  │                                                 │ │
│  │ Test Code: *                                   │ │
│  │ [CBC001_________]                              │ │
│  │                                                 │ │
│  │ Category: *                                    │ │
│  │ [Hematology ▼]                                 │ │
│  │   - Hematology                                 │ │
│  │   - Biochemistry                               │ │
│  │   - Endocrinology                              │ │
│  │   - Clinical Pathology                         │ │
│  │                                                 │ │
│  │ Sample Type:                                   │ │
│  │ [Blood ▼]                                      │ │
│  │   - Blood, Urine, Serum, Plasma, Other         │ │
│  └────────────────────────────────────────────────┘ │
│                                                       │
│  Description                                         │
│  ┌────────────────────────────────────────────────┐ │
│  │ Measures different components of blood         │ │
│  │ including RBC, WBC, hemoglobin, hematocrit,   │ │
│  │ and platelets                                  │ │
│  └────────────────────────────────────────────────┘ │
│                                                       │
│  Pricing                                             │
│  Base Price: * [300.00]                              │
│  Status: ☑ Active                                    │
│                                                       │
│                                                       │
│              [Cancel]  [Save & Configure Parameters] │
└──────────────────────────────────────────────────────┘
```

**Validation Rules:**
- Test Name: Required, max 255 characters
- Test Code: Required, unique, alphanumeric, max 50 characters
- Category: Required, from predefined list
- Price: Required, must be >= 0
- Sample Type: Optional but recommended

**Workflow:**
1. User fills in basic information
2. Clicks "Save & Configure Parameters"
3. Test is created
4. Redirects to Parameter Configuration screen

---

### 3. Test Parameters Configuration

**Purpose:** Configure parameters for a specific lab test

**Layout:**
```
┌──────────────────────────────────────────────────────────────────┐
│  Configure Parameters - Complete Blood Count (CBC001)       [×]  │
├──────────────────────────────────────────────────────────────────┤
│  Test: Complete Blood Count | Category: Hematology | Price: ₹300│
│                                                                   │
│  Parameters (8)                              [+ Add Parameter]   │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ #  │ Parameter   │ Unit    │ Range Type  │ Ref Range │ ⚙  │ │
│  ├────┼─────────────┼─────────┼─────────────┼───────────┼────┤ │
│  │ 1  │ Hemoglobin  │ g/dL    │ Gender-Spec │ M:13.5-17.5│[↕]│ │
│  │    │             │         │             │ F:12-15.5  │[✎]│ │
│  │    │             │         │             │            │[×]│ │
│  ├────┼─────────────┼─────────┼─────────────┼───────────┼────┤ │
│  │ 2  │ WBC Count   │cells/mm³│ General     │ 4000-11000│[↕]│ │
│  │    │             │         │             │            │[✎]│ │
│  │    │             │         │             │            │[×]│ │
│  ├────┼─────────────┼─────────┼─────────────┼───────────┼────┤ │
│  │ 3  │ RBC Count   │million/ │ Gender-Spec │ M:4.5-5.9 │[↕]│ │
│  │    │             │  mm³    │             │ F:4.0-5.2  │[✎]│ │
│  │    │             │         │             │            │[×]│ │
│  ├────┼─────────────┼─────────┼─────────────┼───────────┼────┤ │
│  │ 4  │ Platelet Cnt│ lakh/mm³│ General     │ 1.5-4.5   │[↕]│ │
│  │    │             │         │             │            │[✎]│ │
│  │    │             │         │             │            │[×]│ │
│  └────┴─────────────┴─────────┴─────────────┴───────────┴────┘ │
│                                                                   │
│                                    [Cancel]  [Save All Changes]  │
└──────────────────────────────────────────────────────────────────┘
```

**Add/Edit Parameter Modal:**
```
┌──────────────────────────────────────────────────────┐
│  Add Parameter                                  [×]  │
├──────────────────────────────────────────────────────┤
│                                                       │
│  Parameter Name: *                                   │
│  [Hemoglobin__________________________]              │
│                                                       │
│  Unit: *                                             │
│  [g/dL_________________]                             │
│                                                       │
│  Range Type: *                                       │
│  ○ General (same for all)                            │
│  ● Gender-Specific                                   │
│                                                       │
│  Reference Ranges:                                   │
│  ┌────────────────────────────────────────────────┐ │
│  │ Male:   Min [13.5] - Max [17.5]                │ │
│  │ Female: Min [12.0] - Max [15.5]                │ │
│  └────────────────────────────────────────────────┘ │
│                                                       │
│  Display Order: [1]                                  │
│  Status: ☑ Active                                    │
│                                                       │
│                       [Cancel]  [Add Parameter]      │
└──────────────────────────────────────────────────────┘
```

**Key Features:**
- Drag-and-drop reordering (↕ icon)
- Edit individual parameters
- Delete parameters
- Add new parameters
- Support for gender-specific and general ranges
- Display order management

**Validation:**
- Parameter name: Required, unique within test
- Unit: Required
- Reference ranges: Required (either general or gender-specific)
- If gender-specific is selected, all four values (male min/max, female min/max) required

---

## SUB-MODULE 2: PATIENT TEST RESULTS UI COMPONENTS

### 1. Lab Dashboard

**Purpose:** Main landing page for the lab module showing overview and quick actions

**Layout Components:**
```
┌─────────────────────────────────────────────────────────────────────┐
│                        Lab Dashboard                                 │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌───────────────┐  ┌───────────────┐  ┌───────────────┐          │
│  │  📋 Pending   │  │  🔬Processing │  │  ✅Completed  │          │
│  │     15        │  │     8         │  │     142       │          │
│  └───────────────┘  └───────────────┘  └───────────────┘          │
│                                                                      │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │  Quick Actions                                                │  │
│  │  [+ New Test Order]  [📊 View All Results]  [⚙️ Manage Tests]│  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                                                      │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │  Recent Test Orders                          [Filter ▼]       │  │
│  ├────┬─────────┬──────────────┬─────────┬──────────┬──────────┤  │
│  │ ID │ Patient │ Test         │ Date    │ Status   │ Actions  │  │
│  ├────┼─────────┼──────────────┼─────────┼──────────┼──────────┤  │
│  │001 │John Doe │CBC           │16/02/26 │Pending   │[View][▶] │  │
│  │002 │Jane S.  │Blood Sugar   │16/02/26 │Collected │[Enter]   │  │
│  │003 │Bob M.   │Lipid Profile │15/02/26 │Completed │[View]    │  │
│  └────┴─────────┴──────────────┴─────────┴──────────┴──────────┘  │
│                                                                      │
│                                    [←Prev] Page 1 of 10 [Next→]    │
└─────────────────────────────────────────────────────────────────────┘
```

**Key Features:**
- Statistics cards showing test counts by status
- Quick action buttons for common tasks
- Filterable table of recent test orders
- Pagination controls
- Search by patient name, test type, or ID

**Interactive Elements:**
- **New Test Order Button:** Opens test order creation modal
- **View All Results:** Navigates to full results list page
- **Manage Tests:** Opens test catalog management
- **Filter Dropdown:** Filters by status, date range, test type
- **View Action:** Opens test result details view
- **Enter/Process Action:** Opens result entry form
- **Row Click:** Quick view of order details

---

### 2. Test Order Creation Form/Modal

**Purpose:** Interface for creating a new test order for a patient

**Layout:**
```
┌──────────────────────────────────────────────────────┐
│  Create New Test Order                          [×]  │
├──────────────────────────────────────────────────────┤
│                                                       │
│  Patient Information                                 │
│  ┌────────────────────────────────────────────────┐ │
│  │ Search Patient: [____________] 🔍              │ │
│  └────────────────────────────────────────────────┘ │
│                                                       │
│  Selected: John Doe (ID: P001) | Age: 41 | Male     │
│                                                       │
│  Test Selection                                      │
│  ┌────────────────────────────────────────────────┐ │
│  │ Search Test: [____________] 🔍                 │ │
│  └────────────────────────────────────────────────┘ │
│                                                       │
│  ☑ Complete Blood Count (CBC001) - ₹300.00          │
│  ☐ Blood Sugar - Fasting (SUGAR001) - ₹150.00       │
│  ☐ Lipid Profile (LIPID001) - ₹500.00               │
│                                                       │
│  Order Details                                       │
│  Test Date: [16/02/2026 ▼]                          │
│  Reference Doctor: [Dr. Smith ▼]                     │
│                                                       │
│  Pricing                                             │
│  Base Price:     ₹300.00                             │
│  Discount (%):   [10____]                            │
│  Discount Amt:   ₹30.00                              │
│  ───────────────────────                             │
│  Final Price:    ₹270.00                             │
│                                                       │
│  Additional Notes                                    │
│  ┌────────────────────────────────────────────────┐ │
│  │                                                 │ │
│  │                                                 │ │
│  └────────────────────────────────────────────────┘ │
│                                                       │
│              [Cancel]  [Create Order]                │
└──────────────────────────────────────────────────────┘
```

**Form Fields:**
1. **Patient Search:** Autocomplete dropdown
   - Search by name, ID, or phone
   - Shows patient details on selection
   
2. **Test Selection:** Multi-select with search
   - Filterable by category
   - Shows test code and price
   - Can select multiple tests (creates multiple orders)

3. **Test Date:** Date picker (defaults to today)

4. **Reference Doctor:** Dropdown of active doctors

5. **Pricing:**
   - Auto-populated from test price
   - Discount can be percentage or fixed amount
   - Final price auto-calculated

6. **Notes:** Text area for special instructions

**Validation Rules:**
- Patient must be selected
- At least one test must be selected
- Test date cannot be in the future
- Discount cannot exceed base price
- Final price must be >= 0

**Actions:**
- **Cancel:** Closes modal without saving
- **Create Order:** Validates and creates order(s), shows success message

**Workflow:**
1. User clicks "New Test Order" button
2. Modal opens
3. User searches and selects patient
4. User searches and selects test(s)
5. User fills in order details and pricing
6. User clicks "Create Order"
7. System validates input
8. System creates patient_test_results record(s)
9. Success message shown
10. Modal closes
11. Dashboard refreshes

---

### 3. Test Results Entry Form/Modal

**Purpose:** Interface for lab technicians to enter actual test result values

**Layout:**
```
┌──────────────────────────────────────────────────────────────┐
│  Enter Test Results - CBC #001                          [×]  │
├──────────────────────────────────────────────────────────────┤
│                                                               │
│  Patient: John Doe (41y, Male) | Test Date: 16/02/2026       │
│  Test: Complete Blood Count (CBC001)                         │
│  Status: [Collected ▼] → Processing                          │
│                                                               │
│  ┌──────────────────────────────────────────────────────────┐│
│  │ Parameter Entry                                          ││
│  ├──────────────┬──────────┬──────────────┬────────┬───────┤│
│  │ Parameter    │ Value    │ Unit         │ Ref.   │ Flag  ││
│  ├──────────────┼──────────┼──────────────┼────────┼───────┤│
│  │ Hemoglobin   │[14.5___] │ g/dL         │13.5-17.5│ ✓ N   ││
│  │ WBC Count    │[8500___] │ cells/mm³    │4000-11k │ ✓ N   ││
│  │ RBC Count    │[5.2____] │ million/mm³  │4.5-5.9  │ ✓ N   ││
│  │ Platelet Cnt │[3.2____] │ lakh/mm³     │1.5-4.5  │ ✓ N   ││
│  │ Hematocrit   │[42.5___] │ %            │36-50    │ ✓ N   ││
│  │ MCV          │[85_____] │ fL           │80-100   │ ✓ N   ││
│  │ MCH          │[28_____] │ pg           │27-32    │ ✓ N   ││
│  │ MCHC         │[33_____] │ g/dL         │32-36    │ ✓ N   ││
│  └──────────────┴──────────┴──────────────┴────────┴───────┘│
│                                                               │
│  Sample Collection Time: [09:30 AM]                          │
│  Conducted By: [Lab Tech 1 ▼]                                │
│                                                               │
│  Additional Notes                                            │
│  ┌─────────────────────────────────────────────────────────┐│
│  │ Sample quality: Good                                     ││
│  │                                                           ││
│  └─────────────────────────────────────────────────────────┘│
│                                                               │
│  Auto-save: Last saved 2 minutes ago                         │
│                                                               │
│         [Save Draft] [Cancel] [Complete & Issue Results]    │
└──────────────────────────────────────────────────────────────┘
```

**Key Features:**

1. **Parameter Grid:**
   - Pre-populated with all test parameters in display order
   - Shows parameter name, input field, unit, reference range
   - Auto-calculates flag based on entered value
   - Color coding: Green (normal), Yellow (high/low), Red (critical)

2. **Flag Indicators:**
   - ✓ N: Normal (green)
   - ↓ L: Low (yellow)
   - ↑ H: High (yellow)
   - ⚠ C: Critical (red)

3. **Gender-Specific Ranges:**
   - System automatically shows correct reference range based on patient gender
   - Example: Hemoglobin shows 13.5-17.5 g/dL for males

4. **Real-time Validation:**
   - Values must be numeric (or text for special fields)
   - Out-of-range values show warning but don't prevent entry
   - Auto-calculation of flags on blur/change

5. **Auto-save:**
   - Drafts automatically saved every 2 minutes
   - User can manually save draft
   - Progress indicator shows last save time

**Actions:**
- **Save Draft:** Saves current values, keeps status as "processing"
- **Cancel:** Discards unsaved changes
- **Complete & Issue Results:** Validates all required parameters are filled, updates status to "completed", sets result_issued_at timestamp

**Workflow:**
1. Lab tech selects "Enter Results" from pending test list
2. Modal opens with parameter grid
3. Tech enters values for each parameter
4. System auto-calculates flags
5. Tech reviews any abnormal flags
6. Tech adds notes if needed
7. Tech clicks "Complete & Issue Results"
8. System validates all values entered
9. System creates test_result_values records
10. System updates test status to "completed"
11. Success message shown
12. Modal closes

---

### 4. Test Results View/Display Screen

**Purpose:** Display completed test results with formatting and interpretation

**Layout:**
```
┌───────────────────────────────────────────────────────────────┐
│  Test Result Report                      [Print] [Download PDF]│
├───────────────────────────────────────────────────────────────┤
│                                                                │
│  Hospital Name & Logo                                         │
│  Department of Pathology                                      │
│  ════════════════════════════════════════════════════════════ │
│                                                                │
│  Patient Details:                                             │
│  Name: John Doe                    Age/Sex: 41 Years / Male   │
│  Patient ID: P001                  Phone: +91-9876543210      │
│                                                                │
│  Test Details:                                                │
│  Test Name: Complete Blood Count (CBC)                        │
│  Test Code: CBC001                                            │
│  Sample Type: Blood                                           │
│                                                                │
│  Report Details:                                              │
│  Test Date: 16-Feb-2026            Sample Collected: 09:30 AM │
│  Report Date: 16-Feb-2026          Report Time: 02:45 PM      │
│                                                                │
│  Referred By: Dr. Smith            Conducted By: Lab Tech 1   │
│  ════════════════════════════════════════════════════════════ │
│                                                                │
│  TEST RESULTS                                                 │
│  ┌────────────────┬────────┬──────┬────────────────┬────────┐│
│  │ Parameter      │ Result │ Unit │ Ref. Range     │ Flag   ││
│  ├────────────────┼────────┼──────┼────────────────┼────────┤│
│  │ Hemoglobin     │  14.5  │ g/dL │ 13.5 - 17.5    │ Normal ││
│  │ WBC Count      │  8500  │cells │ 4000 - 11000   │ Normal ││
│  │ RBC Count      │  5.2   │mill. │ 4.5 - 5.9      │ Normal ││
│  │ Platelet Count │  3.2   │lakh  │ 1.5 - 4.5      │ Normal ││
│  │ Hematocrit     │  42.5  │  %   │ 36 - 50        │ Normal ││
│  │ MCV            │  85    │  fL  │ 80 - 100       │ Normal ││
│  │ MCH            │  28    │  pg  │ 27 - 32        │ Normal ││
│  │ MCHC           │  33    │ g/dL │ 32 - 36        │ Normal ││
│  └────────────────┴────────┴──────┴────────────────┴────────┘│
│                                                                │
│  Interpretation:                                              │
│  All parameters are within normal limits.                     │
│                                                                │
│  Notes:                                                       │
│  Sample quality: Good                                         │
│                                                                │
│  ════════════════════════════════════════════════════════════ │
│  Verified By: ___________________    Date: ___________        │
│  Signature                                                    │
│                                                                │
│                        [< Back to Results]  [Verify Report]   │
└───────────────────────────────────────────────────────────────┘
```

**Key Features:**

1. **Header Section:**
   - Hospital branding
   - Department information

2. **Patient & Test Info:**
   - Complete patient demographics
   - Test identification details
   - Timestamps for all key events

3. **Results Table:**
   - Clean tabular format
   - Parameters in order
   - Visual flag indicators with color coding:
     - Normal: Black text
     - Low/High: Orange/bold text
     - Critical: Red/bold text with ⚠ icon

4. **Interpretation Section:**
   - Auto-generated summary based on flags
   - "All parameters normal" or "Abnormal findings detected"
   - List of out-of-range parameters

5. **Actions:**
   - **Print:** Opens print dialog
   - **Download PDF:** Generates PDF report
   - **Verify Report:** (For authorized users) Marks report as verified

**Responsive Behavior:**
- On mobile: Single column layout
- On tablet/desktop: Full layout as shown

---

### 5. Patient Test History Timeline

**Purpose:** View all test results for a patient in chronological order

**Layout:**
```
┌──────────────────────────────────────────────────────────────┐
│  Test History - John Doe (P001)                              │
├──────────────────────────────────────────────────────────────┤
│                                                               │
│  [Filter: All Tests ▼] [Date Range: Last 6 Months ▼]        │
│                                                               │
│  ●═══════════════════════════════════════════════════        │
│  │                                                            │
│  │  16-Feb-2026  Complete Blood Count (CBC)                  │
│  │  ┌────────────────────────────────────────────────────┐   │
│  │  │ Status: Completed                                   │   │
│  │  │ All parameters normal                              │   │
│  │  │ [View Report] [Compare with Previous]              │   │
│  │  └────────────────────────────────────────────────────┘   │
│  │                                                            │
│  │  10-Jan-2026  Blood Sugar - Fasting                       │
│  │  ┌────────────────────────────────────────────────────┐   │
│  │  │ Status: Completed                                   │   │
│  │  │ Glucose: 92 mg/dL (Normal: 70-100)                 │   │
│  │  │ [View Report]                                       │   │
│  │  └────────────────────────────────────────────────────┘   │
│  │                                                            │
│  │  05-Dec-2025  Lipid Profile                               │
│  │  ┌────────────────────────────────────────────────────┐   │
│  │  │ Status: Completed ⚠ Abnormal                       │   │
│  │  │ Total Cholesterol: 245 mg/dL ↑ High               │   │
│  │  │ LDL: 165 mg/dL ↑ High                              │   │
│  │  │ [View Report]                                       │   │
│  │  └────────────────────────────────────────────────────┘   │
│  │                                                            │
│  │  20-Nov-2025  Complete Blood Count (CBC)                  │
│  │  ┌────────────────────────────────────────────────────┐   │
│  │  │ Status: Completed                                   │   │
│  │  │ All parameters normal                              │   │
│  │  │ [View Report] [Compare with Latest]                │   │
│  │  └────────────────────────────────────────────────────┘   │
│  │                                                            │
│  ●═══════════════════════════════════════════════════════    │
│                                                               │
│                              [Load More Results]              │
└──────────────────────────────────────────────────────────────┘
```

**Key Features:**

1. **Timeline View:**
   - Chronological display (newest first)
   - Visual timeline connector
   - Grouped by test date

2. **Test Cards:**
   - Test name and code
   - Status indicator
   - Quick summary of key findings
   - Abnormal values highlighted
   - Action buttons

3. **Filters:**
   - Test type filter (all/specific test)
   - Date range selector
   - Status filter (completed/all)

4. **Comparison Feature:**
   - For same test types
   - Shows trend (improving/stable/worsening)
   - Side-by-side parameter comparison

**Interactive Elements:**
- Click test card to expand full details inline
- View Report button opens full report view
- Compare buttons show trend analysis

---

### Key UI/UX Patterns

#### Color Coding System
- **Green (#10B981):** Normal values, completed status
- **Yellow/Orange (#F59E0B):** Low/high values, pending/processing status
- **Red (#EF4444):** Critical values, cancelled status
- **Blue (#3B82F6):** Informational, links
- **Gray (#6B7280):** Disabled, inactive

#### Icon System
- **📋:** Pending/queue
- **🔬:** Processing/in-progress
- **✅:** Completed/verified
- **⚠️:** Warning/abnormal/critical
- **🔍:** Search
- **📊:** Reports/analytics
- **⚙️:** Settings/configuration
- **👤:** User/patient
- **📅:** Date/calendar
- **💰:** Pricing/billing

#### Typography
- **Headers:** Bold, 18-24px
- **Body:** Regular, 14-16px
- **Labels:** Medium, 12-14px
- **Values:** Monospace for numbers

#### Responsive Breakpoints
- **Mobile (<640px):** Single column, stacked cards
- **Tablet (640-1024px):** Two columns, condensed tables
- **Desktop (>1024px):** Full layout with sidebars

---

## Business Logic

### 1. Test Order Workflow

**State Machine:**
```
    [Create Order]
          │
          ▼
     ┌─────────┐
     │ PENDING │ (Initial state after order creation)
     └─────────┘
          │
          │ Sample collection scheduled
          ▼
    ┌──────────┐
    │COLLECTED │ (Sample taken from patient)
    └──────────┘
          │
          │ Lab tech starts processing
          ▼
    ┌───────────┐
    │PROCESSING │ (Test in progress, values being entered)
    └───────────┘
          │
          │ All values entered, results finalized
          ▼
    ┌──────────┐
    │COMPLETED │ (Results ready for review)
    └──────────┘
          │
          │ Authorized person verifies
          ▼
    ┌──────────┐
    │ VERIFIED │ (Final state, can be printed/shared)
    └──────────┘

    From any state (except VERIFIED):
         │
         │ Order cancelled
         ▼
    ┌───────────┐
    │ CANCELLED │ (Terminal state)
    └───────────┘
```

**Status Transitions:**

| From State | To State | Trigger | Required Fields | Authorization |
|------------|----------|---------|----------------|---------------|
| - | PENDING | Order creation | patient_id, test_id, price | Any user with test order permission |
| PENDING | COLLECTED | Sample collection | sample_collected_at | Lab staff |
| PENDING | CANCELLED | Order cancellation | notes (reason) | Doctor or admin |
| COLLECTED | PROCESSING | Start test processing | conducted_by | Lab technician |
| COLLECTED | CANCELLED | Order cancellation | notes (reason) | Doctor or admin |
| PROCESSING | COMPLETED | Complete results entry | All parameter values, result_issued_at | Lab technician |
| PROCESSING | COLLECTED | Revert to collected | notes (reason) | Lab supervisor |
| COMPLETED | VERIFIED | Verify results | verified_by | Doctor or lab supervisor |
| COMPLETED | PROCESSING | Re-edit results | notes (reason) | Lab supervisor |
| VERIFIED | - | No further transitions | - | - |

**State Behavior:**

1. **PENDING:**
   - Order created, awaiting sample collection
   - Patient can be notified
   - Can be scheduled for future date
   - Billing can be initiated

2. **COLLECTED:**
   - Sample taken from patient
   - Sample collection timestamp recorded
   - Sample tracking begins
   - Cannot be cancelled without supervisor approval

3. **PROCESSING:**
   - Lab technician assigned
   - Test result values can be entered/edited
   - Draft auto-save enabled
   - Can save partial results

4. **COMPLETED:**
   - All parameters entered
   - Results issued timestamp set
   - Report can be printed
   - Awaiting verification

5. **VERIFIED:**
   - Final approval given
   - Report is official
   - No further edits allowed
   - Can be sent to patient/doctor

6. **CANCELLED:**
   - Order terminated
   - Reason must be documented
   - Billing may need adjustment
   - Cannot be reactivated (must create new order)

---

### 2. Validation Rules

#### Test Order Creation Validation
```javascript
// Pseudocode
validateTestOrder(order) {
  // Required field validation
  if (!order.patient_id) throw "Patient is required"
  if (!order.test_id) throw "Test is required"
  if (!order.test_date) throw "Test date is required"
  if (!order.price || order.price < 0) throw "Price must be >= 0"
  
  // Business rule validation
  if (order.test_date > today) throw "Test date cannot be in future"
  if (order.discount > order.price) throw "Discount cannot exceed price"
  
  // Reference validation
  if (!patientExists(order.patient_id)) throw "Patient not found"
  if (!testExists(order.test_id)) throw "Test not found"
  if (order.reference_doctor_id && !doctorExists(order.reference_doctor_id)) {
    throw "Doctor not found"
  }
  
  // Calculate final price if not provided
  if (!order.final_price) {
    order.final_price = order.price - (order.discount || 0)
  }
  
  // Set default status
  order.status = 'pending'
  
  return order
}
```

#### Test Result Value Entry Validation
```javascript
validateTestResultValue(value, parameter, patient) {
  // Required field validation
  if (!value.result_id) throw "Result ID is required"
  if (!value.parameter_id) throw "Parameter ID is required"
  if (!value.value && !value.text_value) {
    throw "Either numeric value or text value is required"
  }
  
  // Data type validation
  if (value.value !== null) {
    if (!isNumeric(value.value)) throw "Value must be numeric"
    if (value.value < 0) throw "Value cannot be negative"
  }
  
  // Get parameter definition
  parameter = getParameter(value.parameter_id)
  
  // Determine reference range based on gender
  let refRange = getGenderSpecificRange(parameter, patient.gender)
  
  // Store reference values for historical accuracy
  value.ref_min = refRange.min
  value.ref_max = refRange.max
  value.unit = parameter.unit
  
  // Calculate flag
  if (value.value !== null) {
    value.flag = calculateFlag(value.value, refRange.min, refRange.max)
  } else {
    value.flag = 'normal' // Default for text values
  }
  
  return value
}
```

---

### 3. Reference Range Comparison Logic

**Flag Calculation Algorithm:**
```javascript
calculateFlag(value, refMin, refMax, criticalLow = null, criticalHigh = null) {
  // Check for critical values first (if defined)
  if (criticalLow !== null && value < criticalLow) {
    return 'critical' // Critically low
  }
  if (criticalHigh !== null && value > criticalHigh) {
    return 'critical' // Critically high
  }
  
  // Check normal range
  if (value >= refMin && value <= refMax) {
    return 'normal' // Within normal range
  }
  
  // Determine if low or high
  if (value < refMin) {
    return 'low' // Below normal range
  }
  
  // value > refMax
  return 'high' // Above normal range
}
```

**Gender-Specific Range Selection:**
```javascript
getGenderSpecificRange(parameter, patientGender) {
  if (!parameter.gender_specific) {
    // Use general range
    return {
      min: parameter.min_value,
      max: parameter.max_value
    }
  }
  
  // Use gender-specific range
  if (patientGender === 'male') {
    return {
      min: parameter.male_min,
      max: parameter.male_max
    }
  } else if (patientGender === 'female') {
    return {
      min: parameter.female_min,
      max: parameter.female_max
    }
  }
  
  // Fallback to general range if gender not specified
  return {
    min: parameter.min_value,
    max: parameter.max_value
  }
}
```

**Example Calculations:**

1. **Hemoglobin for Male Patient:**
   ```javascript
   parameter = {
     name: "Hemoglobin",
     unit: "g/dL",
     gender_specific: true,
     male_min: 13.5,
     male_max: 17.5,
     female_min: 12.0,
     female_max: 15.5
   }
   
   patient = { gender: "male" }
   
   // Test Case 1: Normal value
   value = 14.5
   refRange = getGenderSpecificRange(parameter, "male") 
   // {min: 13.5, max: 17.5}
   flag = calculateFlag(14.5, 13.5, 17.5) // 'normal'
   
   // Test Case 2: Low value
   value = 12.0
   flag = calculateFlag(12.0, 13.5, 17.5) // 'low'
   
   // Test Case 3: High value
   value = 18.5
   flag = calculateFlag(18.5, 13.5, 17.5) // 'high'
   ```

2. **WBC Count (Non-Gender-Specific):**
   ```javascript
   parameter = {
     name: "WBC Count",
     unit: "cells/mm³",
     gender_specific: false,
     min_value: 4000,
     max_value: 11000
   }
   
   value = 8500
   refRange = getGenderSpecificRange(parameter, "male") 
   // {min: 4000, max: 11000}
   flag = calculateFlag(8500, 4000, 11000) // 'normal'
   ```

---

### 4. Status Transitions and State Management

**Transition Guards:**
```javascript
canTransition(currentStatus, newStatus, user) {
  const transitions = {
    'pending': {
      'collected': hasRole(user, ['lab_staff', 'admin']),
      'cancelled': hasRole(user, ['doctor', 'admin'])
    },
    'collected': {
      'processing': hasRole(user, ['lab_technician', 'admin']),
      'cancelled': hasRole(user, ['doctor''admin'])
    },
    'processing': {
      'completed': hasRole(user, ['lab_technician', 'admin']),
      'collected': hasRole(user, ['lab_supervisor', 'admin'])
    },
    'completed': {
      'verified': hasRole(user, ['doctor', 'lab_supervisor', 'admin']),
      'processing': hasRole(user, ['lab_supervisor', 'admin'])
    },
    'verified': {
      // No transitions allowed from verified
    }
  }
  
  if (!transitions[currentStatus]) return false
  if (!transitions[currentStatus][newStatus]) return false
  
  return transitions[currentStatus][newStatus]
}
```

**Automatic Timestamp Management:**
```javascript
updateTestStatus(resultId, newStatus, user) {
  const result = getTestResult(resultId)
  
  // Check if transition is allowed
  if (!canTransition(result.status, newStatus, user)) {
    throw "Unauthorized status transition"
  }
  
  // Update status
  result.status = newStatus
  
  // Set appropriate timestamps
  switch(newStatus) {
    case 'collected':
      if (!result.sample_collected_at) {
        result.sample_collected_at = now()
      }
      break
      
    case 'processing':
      if (!result.conducted_by) {
        result.conducted_by = user.id
      }
      break
      
    case 'completed':
      if (!result.result_issued_at) {
        result.result_issued_at = now()
      }
      // Validate all parameters have values
      validateAllParametersEntered(resultId)
      break
      
    case 'verified':
      result.verified_by = user.id
      // Lock results from further editing
      break
      
    case 'cancelled':
      // Require cancellation reason
      if (!result.notes) {
        throw "Cancellation reason required"
      }
      break
  }
  
  result.updated_at = now()
  
  saveTestResult(result)
  
  // Trigger notifications
  notifyStatusChange(result, newStatus)
}
```

---

### 5. Error Handling and Edge Cases

#### Duplicate Parameter Entry Prevention
```javascript
createTestResultValue(value) {
  // Check for existing value with same result_id and parameter_id
  const existing = TestResultValue.findOne({
    result_id: value.result_id,
    parameter_id: value.parameter_id
  })
  
  if (existing) {
    throw "Parameter value already exists. Use update instead."
  }
  
  return TestResultValue.create(value)
}
```

#### Missing Parameter Handling
```javascript
getTestResultWithValues(resultId) {
  const result = getTestResult(resultId)
  const test = getLabTest(result.test_id)
  const parameters = getTestParameters(test.id)
  const values = getTestResultValues(resultId)
  
  // Create a map of parameter values
  const valueMap = values.reduce((map, val) => {
    map[val.parameter_id] = val
    return map
  }, {})
  
  // Merge parameters with values, marking missing ones
  const completeParameters = parameters.map(param => ({
    ...param,
    value: valueMap[param.id] || null,
    status: valueMap[param.id] ? 'entered' : 'pending'
  }))
  
  return {
    ...result,
    parameters: completeParameters,
    completion_percentage: calculateCompletionPercentage(completeParameters)
  }
}

calculateCompletionPercentage(parameters) {
  const total = parameters.length
  const entered = parameters.filter(p => p.status === 'entered').length
  return (entered / total) * 100
}
```

#### Reference Range Change Handling
```javascript
// Store reference ranges in test_result_values for historical accuracy
// This ensures old reports show the correct ranges that were used at the time

storeTestResultValue(value, parameterId, patientGender) {
  const parameter = getParameter(parameterId)
  const refRange = getGenderSpecificRange(parameter, patientGender)
  
  // Store the reference values used for THIS test
  value.ref_min = refRange.min
  value.ref_max = refRange.max
  value.unit = parameter.unit
  
  // Even if parameter definition changes later,
  // this result will show the correct historical context
  
  return value
}
```

#### Concurrent Edit Prevention
```javascript
// Optimistic locking using updated_at timestamp
updateTestResult(id, updates, expectedUpdatedAt) {
  const current = getTestResult(id)
  
  if (current.updated_at !== expectedUpdatedAt) {
    throw "Result has been modified by another user. Please refresh and try again."
  }
  
  updates.updated_at = now()
  
  return updateResult(id, updates)
}
```

#### Value Out of Range Warnings
```javascript
// Don't prevent entry of out-of-range values, but warn user
validateAndWarnValue(value, refMin, refMax) {
  const warnings = []
  
  if (value < refMin) {
    const percentageBelow = ((refMin - value) / refMin * 100).toFixed(1)
    warnings.push(`Value is ${percentageBelow}% below normal range`)
  }
  
  if (value > refMax) {
    const percentageAbove = ((value - refMax) / refMax * 100).toFixed(1)
    warnings.push(`Value is ${percentageAbove}% above normal range`)
  }
  
  // Critical thresholds (optional)
  const criticalLow = refMin * 0.5  // 50% of minimum
  const criticalHigh = refMax * 1.5 // 150% of maximum
  
  if (value < criticalLow || value > criticalHigh) {
    warnings.push(`⚠️ CRITICAL: Value is in critical range`)
  }
  
  return {
    valid: true,  // Always allow entry
    warnings: warnings
  }
}
```

---

## Implementation Flow

### User Journey 1: Creating and Entering Test Results

**Step-by-Step Flow:**

```
┌─────────────────────────────────────────────────────────────────┐
│ STEP 1: Doctor/Receptionist Creates Test Order                  │
└─────────────────────────────────────────────────────────────────┘
1. User navigates to Lab Dashboard
2. Clicks "New Test Order" button
3. Test Order Modal opens
4. User searches for patient by name/ID
5. Selects patient from dropdown
6. Patient details auto-populate (age, gender shown)
7. User searches for test (e.g., "CBC")
8. Selects "Complete Blood Count" from list
9. Test details auto-populate (price: ₹300)
10. User enters test date (defaults to today)
11. User selects reference doctor from dropdown
12. User enters discount: 10%
13. System calculates final price: ₹270
14. User adds note: "Patient fasting since last night"
15. User clicks "Create Order"

API Call:
POST /test-results
{
  "patient_id": "patient-uuid",
  "test_id": "cbc-test-uuid",
  "test_date": "2026-02-16",
  "price": 300.00,
  "discount": 30.00,
  "final_price": 270.00,
  "reference_doctor_id": "doctor-uuid",
  "notes": "Patient fasting since last night"
}

Database Action:
INSERT INTO patient_test_results (
  id, patient_id, test_id, test_date, price, discount,
  final_price, status, reference_doctor_id, notes
) VALUES (
  gen_random_uuid(), 'patient-uuid', 'cbc-test-uuid', '2026-02-16',
  300.00, 30.00, 270.00, 'pending', 'doctor-uuid',
  'Patient fasting since last night'
)

Result:
✓ Order created with status="pending"
✓ Success message shown
✓ Modal closes
✓ Dashboard refreshes showing new pending order

┌─────────────────────────────────────────────────────────────────┐
│ STEP 2: Lab Staff Collects Sample                               │
└─────────────────────────────────────────────────────────────────┘
1. Lab staff views pending orders list
2. Identifies patient for sample collection
3. Clicks on order row
4. Quick view shows order details
5. Clicks "Collect Sample" button
6. Confirmation dialog: "Mark sample as collected for John Doe - CBC?"
7. User confirms
8. Sample collection timestamp recorded

API Call:
PUT /test-results/{id}
{
  "status": "collected",
  "sample_collected_at": "2026-02-16T09:30:00.000Z"
}

Database Action:
UPDATE patient_test_results
SET status = 'collected',
    sample_collected_at = '2026-02-16 09:30:00',
    updated_at = CURRENT_TIMESTAMP
WHERE id = 'result-uuid'

Result:
✓ Order status updated to "collected"
✓ Success message shown
✓ Order moves to "Collected" queue

┌─────────────────────────────────────────────────────────────────┐
│ STEP 3: Lab Technician Starts Processing                        │
└─────────────────────────────────────────────────────────────────┘
1. Lab technician views collected orders
2. Selects CBC order for John Doe
3. Clicks "Enter Results" button
4. Results Entry Modal opens
5. System loads test parameters for CBC

API Calls:
GET /test-results/{id}  // Get order details
GET /lab-tests/{testId}/parameters  // Get parameters for CBC

Data Fetched:
- Patient: John Doe, 41, Male
- Test: Complete Blood Count
- Parameters: Hemoglobin, WBC Count, RBC Count, Platelet Count, etc.
- Gender-specific ranges for Hemoglobin (13.5-17.5 for males)

Result:
✓ Modal shows parameter grid
✓ Empty value fields ready for entry
✓ Reference ranges displayed (gender-adjusted)

┌─────────────────────────────────────────────────────────────────┐
│ STEP 4: Technician Enters Test Values                           │
└─────────────────────────────────────────────────────────────────┘
1. Status auto-updated to "processing" on first value entry
2. Technician enters values:
   - Hemoglobin: 14.5
   - WBC Count: 8500
   - RBC Count: 5.2
   - Platelet Count: 3.2
   - Hematocrit: 42.5
   - (continues for all parameters)

3. For each value entered:
   a. System validates numeric input
   b. System calculates flag (normal/low/high/critical)
   c. Flag indicator updates in real-time
   d. Cell background color updates (green/yellow/red)

Auto-save triggers every 2 minutes (saves draft)

4. Technician reviews all values
5. Adds sample quality note
6. Selects self from "Conducted By" dropdown
7. Clicks "Complete & Issue Results"

Validation:
✓ All required parameters have values
✓ All values are numeric (or text where applicable)

API Call:
POST /test-results/{resultId}/values
{
  "values": [
    {
      "parameter_id": "hemoglobin-param-uuid",
      "value": 14.5
    },
    {
      "parameter_id": "wbc-param-uuid",
      "value": 8500
    },
    // ... all parameters
  ]
}

Business Logic Executed:
FOR EACH value:
  1. Get parameter definition
  2. Determine patient gender
  3. Get gender-specific reference range
  4. Calculate flag:
     - Hemoglobin: 14.5 in range [13.5-17.5] → 'normal'
     - WBC: 8500 in range [4000-11000] → 'normal'
  5. Store value with ref_min, ref_max, unit, flag

Database Actions:
INSERT INTO test_result_values (
  id, result_id, parameter_id, value, flag, unit, ref_min, ref_max
) VALUES
  (gen_random_uuid(), 'result-uuid', 'hemoglobin-param-uuid',
   14.5, 'normal', 'g/dL', 13.5, 17.5),
  (gen_random_uuid(), 'result-uuid', 'wbc-param-uuid',
   8500, 'normal', 'cells/mm³', 4000, 11000),
  // ... all parameters

UPDATE patient_test_results
SET status = 'completed',
    result_issued_at = CURRENT_TIMESTAMP,
    conducted_by = 'tech-user-uuid',
    updated_at = CURRENT_TIMESTAMP
WHERE id = 'result-uuid'

Result:
✓ All parameter values saved
✓ Order status updated to "completed"
✓ Result issued timestamp recorded
✓ Success message shown
✓ Modal closes
✓ Order moves to "Completed" queue

┌─────────────────────────────────────────────────────────────────┐
│ STEP 5: View Results                                            │
└─────────────────────────────────────────────────────────────────┘
1. User (doctor/patient/staff) navigates to test results
2. Clicks on completed CBC test
3. Results View screen opens

API Call:
GET /test-results/{id}

Data Retrieved:
- patient_test_results record
- Joined patient details
- Joined test details
- All test_result_values with parameter details
- Reference doctor, conducted by, verified by user details

Response Structure:
{
  "id": "result-uuid",
  "patient": { "first_name": "John", "last_name": "Doe", ... },
  "test": { "name": "Complete Blood Count", "code": "CBC001", ... },
  "test_date": "2026-02-16",
  "sample_collected_at": "2026-02-16T09:30:00Z",
  "result_issued_at": "2026-02-16T14:45:00Z",
  "status": "completed",
  "values": [
    {
      "parameter": { "name": "Hemoglobin", "display_order": 1 },
      "value": 14.5,
      "unit": "g/dL",
      "ref_min": 13.5,
      "ref_max": 17.5,
      "flag": "normal"
    },
    // ... all parameters
  ]
}

UI Rendering:
✓ Header with patient name, age, gender
✓ Test details with dates and times
✓ Results table with all parameters
✓ Color-coded flags (all green for normal)
✓ Auto-generated interpretation: "All parameters within normal limits"
✓ Print and Download PDF buttons enabled

┌─────────────────────────────────────────────────────────────────┐
│ STEP 6: Verify Results (Optional)                               │
└─────────────────────────────────────────────────────────────────┘
1. Doctor/Lab Supervisor reviews report
2. Clicks "Verify Report" button
3. Confirmation dialog appears
4. User confirms verification

API Call:
PUT /test-results/{id}
{
  "status": "verified",
  "verified_by": "doctor-uuid"
}

Database Action:
UPDATE patient_test_results
SET status = 'verified',
    verified_by = 'doctor-uuid',
    updated_at = CURRENT_TIMESTAMP
WHERE id = 'result-uuid'

Result:
✓ Report marked as verified
✓ Results locked from editing
✓ "Verified" badge shown on report
✓ Report ready for official distribution
```

---

### User Journey 2: Patient Test History Review

**Step-by-Step Flow:**

```
┌─────────────────────────────────────────────────────────────────┐
│ Doctor Reviews Patient Test History                             │
└─────────────────────────────────────────────────────────────────┘
1. Doctor opens patient profile
2. Clicks "Lab Test History" tab
3. Timeline view loads

API Call:
GET /patients/{patientId}/test-results?page=1&pageSize=20

Response:
- List of all test results for patient
- Ordered by test_date descending (newest first)
- Includes test details, status, key findings summary

UI Shows:
- Timeline with test cards chronologically ordered
- Each card shows:
  ✓ Test name and date
  ✓ Status (completed/verified)
  ✓ Quick summary of findings
  ✓ Abnormal flags highlighted

4. Doctor filters to show only CBC tests
5. Two CBC results shown: Feb 16, 2026 and Nov 20, 2025
6. Doctor clicks "Compare with Previous" on latest CBC
7. Comparison view opens showing side-by-side values

API Calls:
GET /test-results/{id1}  // Latest CBC
GET /test-results/{id2}  // Previous CBC

Comparison Logic:
FOR EACH parameter:
  - Show both values side-by-side
  - Calculate difference
  - Show trend arrow (↑/↓/→)
  - Highlight if moved out of or into normal range

Example Display:
Parameter       Feb 2026  Nov 2025  Change   Trend
Hemoglobin      14.5      14.2      +0.3     ↗ Stable
WBC Count       8500      8200      +300     ↗ Stable
RBC Count       5.2       5.1       +0.1     ↗ Stable

Interpretation:
"All parameters show stable or improving trends"

Doctor Actions:
✓ Reviews trend analysis
✓ Notes stable condition
✓ Decides on future monitoring plan
```

---

### Data Flow Diagram

```
┌──────────────┐
│   Frontend   │
│  (React UI)  │
└──────┬───────┘
       │
       │ HTTP Request (POST /test-results)
       ▼
┌──────────────────┐
│  API Gateway     │
│  (Fastify)       │
└────────┬─────────┘
         │
         │ Authentication Middleware
         ▼
┌────────────────────┐
│ Controller         │
│ (test-result.      │
│  controller.ts)    │
└────────┬───────────┘
         │
         │ Validation (Zod schema)
         │ Business Logic
         ▼
┌────────────────────────────┐
│  Database Layer            │
│  (Supabase/PostgreSQL)     │
├────────────────────────────┤
│ 1. INSERT patient_test_    │
│    results                 │
│ 2. FOR EACH value:         │
│    a. SELECT test_         │
│       parameters           │
│    b. SELECT patients      │
│       (get gender)         │
│    c. Calculate flag       │
│    d. INSERT test_result_  │
│       values               │
└────────┬───────────────────┘
         │
         │ Return created data
         ▼
┌────────────────────┐
│  Controller        │
│  Response          │
└────────┬───────────┘
         │
         │ JSON Response
         ▼
┌──────────────┐
│   Frontend   │
│  UI Update   │
└──────────────┘
```

---

### Integration Points and Dependencies

#### 1. Patient Module Integration
```javascript
// Before creating test order, verify patient exists
const patient = await getPatient(patientId)
if (!patient) throw "Patient not found"

// Use patient gender for gender-specific reference ranges
const gender = patient.gender // 'male' | 'female' | 'other'
```

#### 2. User/Staff Module Integration
```javascript
// For reference_doctor_id, conducted_by, verified_by
const user = await getUser(userId)
if (!user) throw "User not found"

// Check user role for authorization
if (!hasRole(user, ['doctor'])) {
  throw "Only doctors can verify results"
}
```

#### 3. Billing Module Integration
```javascript
// When test order created, create billing entry
createTestOrder(order) {
  const result = await createTestResult(order)
  
  // Create billing/invoice entry
  await createBillingItem({
    patient_id: order.patient_id,
    item_type: 'lab_test',
    item_id: result.id,
    description: `Lab Test: ${order.test_name}`,
    amount: order.final_price,
    status: 'pending'
  })
  
  return result
}

// When test cancelled, adjust billing
cancelTestOrder(resultId) {
  await updateTestResult(resultId, { status: 'cancelled' })
  
  await updateBillingItem({
    item_id: resultId,
    status: 'cancelled',
    amount: 0
  })
}
```

#### 4. Notification Module Integration
```javascript
// Send notifications on status changes
notifyStatusChange(result, newStatus) {
  switch(newStatus) {
    case 'pending':
      // Notify patient: "Your test has been ordered"
      notify(result.patient_id, 'test_ordered', result)
      break
      
    case 'collected':
      // Notify lab: "Sample collected for processing"
      notifyLabStaff('sample_ready', result)
      break
      
    case 'completed':
      // Notify doctor: "Test results ready for review"
      notify(result.reference_doctor_id, 'results_ready', result)
      break
      
    case 'verified':
      // Notify patient: "Your test results are ready"
      notify(result.patient_id, 'results_available', result)
      // Email/SMS with report link
      sendEmail(result.patient_id, 'test_report', result)
      break
  }
}
```

#### 5. Reporting Module Integration
```javascript
// Generate PDF report
generatePDFReport(resultId) {
  const result = await getTestResultById(resultId)
  
  const pdfData = {
    header: getHospitalHeader(),
    patient: result.patient,
    test: result.test,
    values: result.values.sort((a, b) => 
      a.parameter.display_order - b.parameter.display_order
    ),
    interpretation: generateInterpretation(result.values),
    footer: getReportFooter(result)
  }
  
  return generatePDF(pdfData)
}

generateInterpretation(values) {
  const abnormal = values.filter(v => v.flag !== 'normal')
  
  if (abnormal.length === 0) {
    return "All parameters are within normal limits."
  }
  
  return `${abnormal.length} parameter(s) outside normal range:\n` +
    abnormal.map(v => 
      `- ${v.parameter.name}: ${v.value} ${v.unit} ` +
      `(${v.flag.toUpperCase()}, Ref: ${v.ref_min}-${v.ref_max})`
    ).join('\n')
}
```

---

## Sub-Module Integration

### How the Two Sub-Modules Work Together

```
SETUP PHASE (Sub-Module 1: Lab Tests)
────────────────────────────────────────────────────────
1. Admin creates Lab Test definition
   API: POST /lab-tests
   Data: { name: "CBC", code: "CBC001", category: "Hematology", price: 300 }
   
2. Admin defines Parameters for the test
   API: POST /lab-tests/{id}/parameters
   Data: { name: "Hemoglobin", unit: "g/dL", gender_specific: true, ... }
   
3. Repeat for all tests (One-time setup or periodic updates)

↓

OPERATIONAL PHASE (Sub-Module 2: Patient Test Results)
────────────────────────────────────────────────────────
4. Doctor creates Test Order for patient
   API: POST /test-results
   Uses: test_id from Lab Tests sub-module
   
5. Lab Technician enters Result Values
   API: POST /test-results/{resultId}/values
   Uses: parameter_id from Test Parameters
   System: Auto-fetches reference ranges from Test Parameters
   System: Auto-calculates flags based on ranges
   
6. Results are displayed/verified
   API: GET /test-results/{id}
   Returns: Values with historical reference ranges
```

### Key Integration Points

1. **Test Selection in Orders:**
   - When creating a test order, dropdown lists come from `lab_tests` table
   - Only active tests are shown
   - Test price is auto-populated from `lab_tests.price`

2. **Parameter Template:**
   - When entering results, parameter list comes from `test_parameters`
   - Reference ranges are fetched from `test_parameters`
   - Gender-specific logic applied based on patient gender + parameter definition

3. **Historical Accuracy:**
   - Reference ranges are COPIED to `test_result_values` at entry time
   - Even if master ranges change later, old results show correct historical context
   - This maintains data integrity for past reports

4. **Data Consistency:**
   - `patient_test_results.test_id` → FOREIGN KEY to `lab_tests.id`
   - `test_result_values.parameter_id` → FOREIGN KEY to `test_parameters.id`
   - Cannot delete test or parameter if referenced by results (RESTRICT constraint)

### Typical Workflows

**Workflow A: Adding a New Test Type**
```
Sub-Module 1 Operations:
1. Admin → Lab Tests Catalog → [+ Add New Test]
2. Fill form: Name, Code, Category, Price
3. Click "Save & Configure Parameters"
4. Add each parameter with ranges
5. Set display order
6. Save all

Result: New test available for ordering in Sub-Module 2
```

**Workflow B: Ordering and Completing a Test**
```
Sub-Module 2 Operations:
1. Receptionist → Lab Dashboard → [+ New Test Order]
2. Select Patient → Select Test (from Sub-Module 1 catalog)
3. Set date, pricing → Create Order
4. Lab Staff → Collect Sample → Update status
5. Lab Tech → Enter Results → Fill parameter values
   (Parameters and ranges come from Sub-Module 1)
6. System auto-calculates flags
7. Doctor → Verify Results
8. Patient receives report

Data Flow:
- Test definition: Sub-Module 1 → Sub-Module 2
- Parameter definitions: Sub-Module 1 → Sub-Module 2
- Actual values: Entered in Sub-Module 2
- Results: Stored in Sub-Module 2
```

---

## Best Practices

### For Sub-Module 1 (Lab Tests)

1. **Test Codes:**
   - Use consistent naming convention (e.g., CBC001, LFT001)
   - Keep codes short but meaningful
   - Never reuse codes even after deletion

2. **Categories:**
   - Use standard categories (Hematology, Biochemistry, etc.)
   - Maintain consistency across tests
   - Add new categories sparingly

3. **Reference Ranges:**
   - Always verify with medical literature
   - Update when medical standards change
   - Document range updates for auditing
   - Use gender-specific ranges where medically appropriate

4. **Parameter Ordering:**
   - Set logical display order (most important first)
   - Group related parameters
   - Maintain consistency across similar tests

### For Sub-Module 2 (Patient Test Results)

1. **Test Ordering:**
   - Always verify patient identity
   - Check for duplicate recent orders
   - Document special instructions in notes
   - Apply discounts transparently

2. **Result Entry:**
   - Enter values promptly after testing
   - Review all abnormal flags before completion
   - Add notes for unusual findings
   - Use auto-save to prevent data loss

3. **Status Management:**
   - Update status at each workflow step
   - Don't skip states (follow: pending → collected → processing → completed)
   - Document reasons for cancellations
   - Only verified results should be released to patients

4. **Data Quality:**
   - Validate values before entry (check for decimal points, units)
   - Review critical flags immediately
   - Cross-check with previous results
   - Report and investigate impossible values

### Inter-Module Coordination

1. **Before Deleting Tests:**
   - Check if any pending orders exist
   - Mark as inactive instead of deleting
   - Communicate changes to ordering staff

2. **When Updating Ranges:**
   - Document the change and effective date
   - Notify medical staff
   - Consider impact on trending/comparison
   - Old reports maintain historical ranges

3. **Adding New Parameters:**
   - Ensure lab equipment can measure
   - Train staff on new parameters
   - Update result entry forms
   - Communicate to ordering doctors

---

## Integration Guide

### Setting Up in a New Codebase

#### 1. Database Setup

```sql
-- Step 1: Create tables in order (respecting foreign keys)

-- First, ensure patients and users tables exist
-- (They should already exist in your HMS)

-- Create lab_tests table
CREATE TABLE lab_tests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    code VARCHAR(50) NOT NULL UNIQUE,
    category VARCHAR(100),
    description TEXT,
    sample_type VARCHAR(50),
    price NUMERIC NOT NULL DEFAULT 0.00,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

COMMENT ON TABLE lab_tests IS 'Master table storing all available lab test types';

-- Create test_parameters table
CREATE TABLE test_parameters (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    test_id UUID NOT NULL REFERENCES lab_tests(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    unit VARCHAR(50),
    min_value NUMERIC,
    max_value NUMERIC,
    gender_specific BOOLEAN DEFAULT false,
    male_min NUMERIC,
    male_max NUMERIC,
    female_min NUMERIC,
    female_max NUMERIC,
    display_order INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

COMMENT ON TABLE test_parameters IS 'Defines parameters for each lab test with normal ranges';

CREATE INDEX idx_test_parameters_test_id ON test_parameters(test_id);

-- Create patient_test_results table
CREATE TABLE patient_test_results (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    test_id UUID NOT NULL REFERENCES lab_tests(id) ON DELETE RESTRICT,
    test_date DATE NOT NULL DEFAULT CURRENT_DATE,
    sample_collected_at TIMESTAMP,
    result_issued_at TIMESTAMP,
    price NUMERIC NOT NULL DEFAULT 0,
    discount NUMERIC DEFAULT 0,
    final_price NUMERIC,
    status VARCHAR(50) DEFAULT 'pending',
    reference_doctor_id UUID REFERENCES users(id),
    conducted_by UUID REFERENCES users(id),
    verified_by UUID REFERENCES users(id),
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

COMMENT ON TABLE patient_test_results IS 'Stores individual test records for each patient';

CREATE INDEX idx_patient_test_results_patient_id ON patient_test_results(patient_id);
CREATE INDEX idx_patient_test_results_test_id ON patient_test_results(test_id);
CREATE INDEX idx_patient_test_results_status ON patient_test_results(status);
CREATE INDEX idx_patient_test_results_test_date ON patient_test_results(test_date);

-- Create test_result_values table
CREATE TABLE test_result_values (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    result_id UUID NOT NULL REFERENCES patient_test_results(id) ON DELETE CASCADE,
    parameter_id UUID NOT NULL REFERENCES test_parameters(id) ON DELETE RESTRICT,
    value NUMERIC,
    text_value TEXT,
    flag VARCHAR(20) DEFAULT 'normal',
    unit VARCHAR(50),
    ref_min NUMERIC,
    ref_max NUMERIC,
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(result_id, parameter_id)
);

COMMENT ON TABLE test_result_values IS 'Stores actual test readings for each parameter';

CREATE INDEX idx_test_result_values_result_id ON test_result_values(result_id);
CREATE INDEX idx_test_result_values_parameter_id ON test_result_values(parameter_id);

-- Step 2: Insert sample data
-- (See sample data sections above for each table)

-- Step 3: Create helpful views (optional)
CREATE VIEW v_test_results_summary AS
SELECT 
    ptr.id,
    ptr.test_date,
    ptr.status,
    p.first_name || ' ' || p.last_name AS patient_name,
    p.gender AS patient_gender,
    lt.name AS test_name,
    lt.code AS test_code,
    lt.category AS test_category,
    u.username AS reference_doctor,
    ptr.final_price,
    COUNT(trv.id) AS values_entered,
    COUNT(tp.id) AS total_parameters
FROM patient_test_results ptr
JOIN patients p ON ptr.patient_id = p.id
JOIN lab_tests lt ON ptr.test_id = lt.id
LEFT JOIN users u ON ptr.reference_doctor_id = u.id
LEFT JOIN test_parameters tp ON tp.test_id = lt.id
LEFT JOIN test_result_values trv ON trv.result_id = ptr.id
GROUP BY ptr.id, p.first_name, p.last_name, p.gender, lt.name, lt.code, lt.category, u.username;
```

#### 2. Backend Implementation

**File Structure:**
```
backend/
├── src/
│   ├── controllers/
│   │   ├── lab-test.controller.ts
│   │   └── test-result.controller.ts
│   ├── routes/
│   │   ├── lab-test.routes.ts
│   │   └── test-result.routes.ts
│   ├── validators/
│   │   └── lab-test.validator.ts
│   ├── types/
│   │   └── lab-test.types.ts
│   └── services/
│       └── lab-test.service.ts (optional)
```

**Key Implementation Steps:**

1. **Install dependencies:**
   ```bash
   npm install zod  # For validation
   ```

2. **Implement types (lab-test.types.ts):**
   - Define TypeScript interfaces matching database schema
   - Create request/response types

3. **Implement validators (lab-test.validator.ts):**
   - Use Zod for input validation
   - Define schemas for create/update operations

4. **Implement controllers:**
   - lab-test.controller.ts: CRUD for tests and parameters
   - test-result.controller.ts: CRUD for results and values
   - Include flag calculation logic
   - Include gender-specific range logic

5. **Register routes:**
   ```typescript
   // In server.ts or main.ts
   import labTestRoutes from './routes/lab-test.routes'
   import testResultRoutes from './routes/test-result.routes'
   
   app.register(labTestRoutes, { prefix: '/api' })
   app.register(testResultRoutes, { prefix: '/api' })
   ```

#### 3. Frontend Implementation

**File Structure:**
```
frontend/
├── src/
│   ├── pages/
│   │   ├── LabDashboard.tsx
│   │   ├── TestOrderCreate.tsx
│   │   ├── TestResultEntry.tsx
│   │   ├── TestResultView.tsx
│   │   └── PatientTestHistory.tsx
│   ├── components/
│   │   ├── lab/
│   │   │   ├── TestOrderForm.tsx
│   │   │   ├── ParameterEntryGrid.tsx
│   │   │   ├── TestResultReport.tsx
│   │   │   └── TestHistoryTimeline.tsx
│   ├── services/
│   │   ├── labTestService.ts
│   │   └── testResultService.ts
│   ├── hooks/
│   │   ├── useLabTests.ts
│   │   └── useTestResults.ts
│   └── types/
│       └── lab.types.ts
```

**Key Implementation Steps:**

1. **Create API service layer:**
   ```typescript
   // labTestService.ts
   export const labTestService = {
     getAllTests: (params) => api.get('/lab-tests', { params }),
     getTestById: (id) => api.get(`/lab-tests/${id}`),
     createTest: (data) => api.post('/lab-tests', data),
     // ... etc
   }
   ```

2. **Create React hooks for data fetching:**
   ```typescript
   // useLabTests.ts
   export const useLabTests = (params) => {
     return useQuery(['labTests', params], () =>
       labTestService.getAllTests(params)
     )
   }
   ```

3. **Implement UI components:**
   - Follow UI/UX specifications from above
   - Use component library (Material-UI, Ant Design, etc.)
   - Implement form validation
   - Add loading states and error handling

4. **Add navigation:**
   ```typescript
   // In router configuration
   {
     path: '/lab',
     children: [
       { path: '', element: <LabDashboard /> },
       { path: 'orders/new', element: <TestOrderCreate /> },
       { path: 'results/:id', element: <TestResultView /> },
       { path: 'results/:id/enter', element: <TestResultEntry /> },
     ]
   }
   ```

#### 4. Testing Strategy

**Unit Tests:**
- Test flag calculation logic
- Test gender-specific range selection
- Test validation functions

**Integration Tests:**
- Test complete flow: create order → enter values → verify
- Test status transitions
- Test concurrent edits

**E2E Tests:**
- User journey: order creation to result viewing
- Multi-user workflow (doctor orders, tech enters, doctor verifies)

---

### Quick Start Checklist

- [ ] Database tables created
- [ ] Sample data inserted
- [ ] Backend routes implemented
- [ ] Frontend services created
- [ ] UI components built
- [ ] Authentication integrated
- [ ] Authorization checks added
- [ ] Validation implemented
- [ ] Error handling added
- [ ] Testing completed
- [ ] Documentation updated

---

## Appendix

### Common Test Types and Parameters

**Hematology:**
- Complete Blood Count (CBC)
  - Hemoglobin, WBC, RBC, Platelets, Hematocrit, MCV, MCH, MCHC
- ESR (Erythrocyte Sedimentation Rate)
- Bleeding Time, Clotting Time

**Biochemistry:**
- Blood Sugar (Fasting, Random, PP, HbA1c)
- Lipid Profile (Total Cholesterol, Triglycerides, HDL, LDL, VLDL)
- Liver Function Test (Bilirubin, SGOT, SGPT, ALP, Total Protein, Albumin)
- Kidney Function Test (Urea, Creatinine, Uric Acid)
- Electrolytes (Sodium, Potassium, Chloride)
- Thyroid Profile (T3, T4, TSH)

**Microbiology:**
- Urine Culture
- Blood Culture
- Stool Examination
- Gram Staining

**Immunology:**
- HIV Test
- Hepatitis Markers
- Dengue NS1/IgG/IgM
- Widal Test (Typhoid)

---

### Status Code Reference

| Code | Meaning | When to Use |
|------|---------|-------------|
| 200 | OK | Successful GET, PUT, DELETE |
| 201 | Created | Successful POST (resource created) |
| 400 | Bad Request | Validation error, malformed request |
| 401 | Unauthorized | Missing or invalid authentication |
| 403 | Forbidden | Authenticated but not authorized |
| 404 | Not Found | Resource doesn't exist |
| 409 | Conflict | Duplicate resource (e.g., test code exists) |
| 500 | Internal Server Error | Unexpected server error |

---

### Glossary

- **Lab Test:** A diagnostic procedure/examination (e.g., CBC, Blood Sugar)
- **Test Parameter:** Individual component measured within a test (e.g., Hemoglobin in CBC)
- **Test Order:** Request for a patient to undergo a specific lab test
- **Test Result:** The outcome/values from a completed lab test
- **Reference Range:** Normal value range for a test parameter
- **Flag:** Indicator showing if a result is normal, low, high, or critical
- **Gender-Specific Range:** Different normal ranges for males and females
- **Sample:** Biological specimen collected from patient (blood, urine, etc.)
- **Status:** Current state of a test order in the workflow
- **Verification:** Official approval of test results by authorized personnel

---

## Quick Reference Guide

### Sub-Module Cheat Sheet

| Aspect | Sub-Module 1: Lab Tests | Sub-Module 2: Patient Test Results |
|--------|-------------------------|-------------------------------------|
| **Purpose** | Define what tests are available | Track actual patient tests |
| **Data Type** | Master/Reference data | Transactional data |
| **Users** | Admins, Lab Managers | Doctors, Lab Techs, Patients |
| **Frequency** | Updated occasionally | Updated continuously |
| **Tables** | `lab_tests`, `test_parameters` | `patient_test_results`, `test_result_values` |
| **Key Operations** | Create, Update tests<br/>Define parameters | Order tests<br/>Enter results<br/>View history |
| **API Endpoints** | 9 endpoints (#1-#9) | 8 endpoints (#10-#17) |
| **UI Screens** | 3 screens (Catalog, Form, Parameters) | 5 screens (Dashboard, Order, Entry, View, History) |

### Database Quick Stats

- **Total Tables:** 4 (2 per sub-module)
- **Sample Data:** 12 tests, 77 parameters across 4 categories
- **Relationships:** 
  - lab_tests 1:N test_parameters
  - patient_test_results 1:N test_result_values
  - lab_tests 1:N patient_test_results
  - test_parameters 1:N test_result_values

### Common Tasks Quick Links

**I want to add a new test type:**
→ Use Sub-Module 1 → API #3 (POST /lab-tests) → Then API #7 (POST parameters)

**I want to order a test for a patient:**
→ Use Sub-Module 2 → API #13 (POST /test-results)

**I want to enter test results:**
→ Use Sub-Module 2 → API #16 (POST /test-results/:resultId/values)

**I want to view a patient's test history:**
→ Use Sub-Module 2 → API #12 (GET /patients/:patientId/test-results)

**I want to update reference ranges:**
→ Use Sub-Module 1 → API #8 (PUT /lab-tests/:testId/parameters/:id)

### Status Values Reference

**Test Status Flow:**
```
pending → collected → processing → completed → verified
                ↓
          cancelled (from any state)
```

**Flag Values:**
- `normal` - Within reference range
- `low` - Below reference range
- `high` - Above reference range
- `critical` - Dangerously out of range

### Important Constraints

⚠️ **Cannot delete:**
- Tests with existing orders
- Parameters with existing values

✅ **Can delete:**
- Tests with no orders (or mark inactive)
- Parameters with no values

🔒 **Immutable after verification:**
- Test result values
- Test result status (verified state)

### Integration Checklist

When implementing in a new codebase:

**Database Setup:**
- [ ] Create all 4 tables in order (lab_tests → test_parameters → patient_test_results → test_result_values)
- [ ] Set up foreign key constraints
- [ ] Create indexes for performance
- [ ] Insert sample/seed data
- [ ] Create database views (optional)

**Backend Implementation:**
- [ ] Implement 17 API endpoints
- [ ] Add authentication middleware
- [ ] Add validation (Zod schemas)
- [ ] Implement flag calculation logic
- [ ] Implement gender-specific range logic
- [ ] Add error handling
- [ ] Write unit tests

**Frontend Implementation:**
- [ ] Create 8 UI screens (3 for Sub-Module 1, 5 for Sub-Module 2)
- [ ] Implement forms with validation
- [ ] Add search/filter functionality
- [ ] Implement real-time flag calculation
- [ ] Add auto-save for result entry
- [ ] Create printable report templates
- [ ] Add loading states and error messages

**Testing:**
- [ ] Unit tests for business logic
- [ ] Integration tests for API endpoints
- [ ] E2E tests for user workflows
- [ ] Test concurrent access scenarios
- [ ] Test edge cases (missing data, invalid ranges, etc.)

**Documentation:**
- [ ] API documentation (Swagger/OpenAPI)
- [ ] User manuals for each role
- [ ] Database schema documentation
- [ ] Deployment guide

---

## Troubleshooting

### Common Issues

**Issue:** Cannot create test order - "Test not found"
- **Cause:** Test may be inactive or deleted
- **Solution:** Check `lab_tests.is_active = true` and test exists

**Issue:** Flag calculation showing "normal" for obvious abnormal values
- **Cause:** Wrong reference range, gender mismatch, or parameter misconfigured
- **Solution:** Verify parameter ranges, check patient gender, ensure gender_specific flag is set correctly

**Issue:** Cannot enter results - "Parameter not found"
- **Cause:** Parameter may have been deleted or deactivated
- **Solution:** Reactivate parameter or create new parameter definition

**Issue:** Historical reports showing different reference ranges
- **Cause:** This is correct behavior - ranges are stored at time of test
- **Solution:** This is by design for historical accuracy, no action needed

**Issue:** Cannot delete test definition
- **Cause:** Foreign key constraint - test has existing orders
- **Solution:** Mark test as inactive instead (`is_active = false`)

**Issue:** Gender-specific ranges not applying
- **Cause:** Patient gender not set or parameter not configured correctly
- **Solution:** Ensure patient.gender is set and parameter.gender_specific = true with all four range values

---

## Appendix: Sample Data

### Sample Lab Tests (12 tests across 4 categories)

**Hematology (3 tests):**
1. Complete Blood Count (CBC001) - ₹300 - 8 parameters
2. Hemoglobin Test (HB001) - ₹100 - 1 parameter
3. ESR (Not in current data)

**Biochemistry (7 tests):**
1. Blood Sugar - Fasting (SUGAR001) - ₹150 - 1 parameter
2. Blood Sugar - Random (SUGAR002) - ₹150 - 1 parameter
3. HbA1c Test (HBA1C001) - ₹400 - 1 parameter
4. Lipid Profile (LIPID001) - ₹500 - 5 parameters
5. Liver Function Test (LFT001) - ₹600 - 8 parameters
6. Kidney Function Test (KFT001) - ₹450 - 6 parameters
7. Vitamin D (VITD001) - ₹800 - 1 parameter
8. Vitamin B12 (VITB12001) - ₹700 - 1 parameter

**Endocrinology (1 test):**
1. Thyroid Profile (THYROID001) - ₹550 - 3 parameters

**Clinical Pathology (1 test):**
1. Urine Analysis (URINE001) - ₹100 - 16 parameters

### Total Parameter Count: 77

Most comprehensive test: Urine Analysis (16 parameters)
Most common setup: Single parameter tests (5 tests)
Price range: ₹100 - ₹800

---

**Document Version:** 1.0  
**Last Updated:** February 16, 2026  
**Prepared By:** GitHub Copilot  
**Target Audience:** Developers implementing Lab/Pathology module in a new codebase

---

## Summary

This document provides complete end-to-end documentation for a Lab/Pathology module with two distinct sub-modules:

1. **Lab Tests Sub-Module** - Manages master catalog of tests and parameters (Reference data)
2. **Patient Test Results Sub-Module** - Manages test orders, result entry, and patient history (Transactional data)

The module includes:
- ✅ 4 database tables with complete schema definitions
- ✅ 17 REST API endpoints with full request/response examples
- ✅ 8 UI component specifications with detailed layouts
- ✅ Complete business logic including workflow, validation, and flag calculation
- ✅ Step-by-step implementation flows and user journeys
- ✅ Integration guide with setup checklists
- ✅ Best practices and troubleshooting guide

The documentation is ready for implementation in any HMS or hospital management system.
