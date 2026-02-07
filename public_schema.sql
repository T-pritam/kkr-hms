--
-- PostgreSQL database dump
--

\restrict cTyfcbnqTpPBuk9h4ljNQv1g4I5qw5Q96Te82SSQRDtsM2P2J6IOEmMnwmzmUYX

-- Dumped from database version 17.6
-- Dumped by pg_dump version 18.1 (Ubuntu 18.1-1.pgdg24.04+2)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA public;


--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON SCHEMA public IS 'standard public schema';


--
-- Name: update_updated_at_column(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_updated_at_column() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: advances; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.advances (
    id bigint NOT NULL,
    employee_id uuid NOT NULL,
    amount numeric(10,2) NOT NULL,
    date_given date NOT NULL,
    month_year character varying(7) NOT NULL,
    remarks character varying(255),
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT advances_amount_check CHECK ((amount > (0)::numeric))
);


--
-- Name: advances_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.advances_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: advances_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.advances_id_seq OWNED BY public.advances.id;


--
-- Name: daily_ledger_closures; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.daily_ledger_closures (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    closure_date date NOT NULL,
    total_credits_cash numeric(10,2) DEFAULT 0.00,
    total_credits_upi numeric(10,2) DEFAULT 0.00,
    total_credits_other numeric(10,2) DEFAULT 0.00,
    total_credits numeric(10,2) NOT NULL,
    total_debits numeric(10,2) NOT NULL,
    net_balance numeric(10,2) NOT NULL,
    transaction_count integer DEFAULT 0,
    credit_count integer DEFAULT 0,
    debit_count integer DEFAULT 0,
    closed_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    closed_by uuid NOT NULL,
    notes text,
    opening_balance numeric(10,2) DEFAULT 0.00,
    closing_balance numeric(10,2) NOT NULL
);


--
-- Name: daily_ledger_transactions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.daily_ledger_transactions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    transaction_date date DEFAULT CURRENT_DATE NOT NULL,
    transaction_type character varying(20) NOT NULL,
    source character varying(50) NOT NULL,
    amount numeric(10,2) NOT NULL,
    payment_mode character varying(50) NOT NULL,
    reference_number character varying(100),
    patient_id uuid,
    description text NOT NULL,
    notes text,
    status character varying(20) DEFAULT 'pending'::character varying,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    created_by uuid NOT NULL,
    verified_at timestamp with time zone,
    verified_by uuid,
    CONSTRAINT daily_ledger_transactions_amount_check CHECK ((amount > (0)::numeric)),
    CONSTRAINT daily_ledger_transactions_check CHECK ((((payment_mode)::text <> 'upi'::text) OR ((reference_number IS NOT NULL) AND ((reference_number)::text <> ''::text)))),
    CONSTRAINT daily_ledger_transactions_payment_mode_check CHECK (((payment_mode)::text = ANY ((ARRAY['cash'::character varying, 'upi'::character varying, 'card'::character varying, 'bank_transfer'::character varying, 'cheque'::character varying])::text[]))),
    CONSTRAINT daily_ledger_transactions_source_check CHECK (((source)::text = ANY ((ARRAY['patient'::character varying, 'opd'::character varying, 'expense'::character varying])::text[]))),
    CONSTRAINT daily_ledger_transactions_status_check CHECK (((status)::text = ANY ((ARRAY['pending'::character varying, 'verified'::character varying, 'day_closed'::character varying])::text[]))),
    CONSTRAINT daily_ledger_transactions_transaction_type_check CHECK (((transaction_type)::text = ANY ((ARRAY['credit'::character varying, 'debit'::character varying])::text[])))
);


--
-- Name: doctors; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.doctors (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name character varying(255) NOT NULL,
    mobile character varying(20) NOT NULL,
    email character varying(255),
    designation character varying(100),
    specialist character varying(100),
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: employees; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.employees (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name character varying(255) NOT NULL,
    designation character varying(100),
    base_salary numeric(10,2),
    join_date date DEFAULT CURRENT_DATE,
    status character varying(20) DEFAULT 'Active'::character varying,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: expenses; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.expenses (
    id bigint NOT NULL,
    expense_type character varying(100) NOT NULL,
    amount numeric(10,2) NOT NULL,
    expense_date date NOT NULL,
    month_year character varying(7) NOT NULL,
    remarks character varying(255),
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT expenses_amount_check CHECK ((amount > (0)::numeric))
);


--
-- Name: expenses_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.expenses_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: expenses_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.expenses_id_seq OWNED BY public.expenses.id;


--
-- Name: patients; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.patients (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    patient_id character varying(50) NOT NULL,
    name character varying(255) NOT NULL,
    phone character varying(20),
    gender character varying(20),
    date_of_birth date,
    date_of_join date DEFAULT CURRENT_DATE,
    address text,
    referred_by character varying(255),
    emergency_contact_name character varying(255),
    emergency_contact_phone character varying(20),
    medical_history text,
    allergies text,
    current_medications text,
    status character varying(20) DEFAULT 'Active'::character varying,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: referrals; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.referrals (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    name character varying(255) NOT NULL,
    phone character varying(20),
    status character varying(20) DEFAULT 'active'::character varying,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    created_by uuid,
    updated_by uuid,
    CONSTRAINT referrals_status_check CHECK (((status)::text = ANY (ARRAY[('active'::character varying)::text, ('inactive'::character varying)::text])))
);


--
-- Name: salary_payments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.salary_payments (
    id bigint NOT NULL,
    employee_id uuid NOT NULL,
    month_year character varying(7) NOT NULL,
    base_salary numeric(10,2) NOT NULL,
    total_working_days integer DEFAULT 27 NOT NULL,
    days_present integer NOT NULL,
    total_advance numeric(10,2) DEFAULT 0.00,
    calculated_salary numeric(10,2),
    final_salary numeric(10,2),
    status character varying(20) DEFAULT 'pending'::character varying,
    settled_on date,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    ot_days integer DEFAULT 0 NOT NULL,
    CONSTRAINT salary_payments_days_present_check CHECK (((days_present >= 0) AND (days_present <= 27))),
    CONSTRAINT salary_payments_ot_days_check CHECK (((ot_days >= 0) AND (ot_days <= 3))),
    CONSTRAINT salary_payments_status_check CHECK (((status)::text = ANY (ARRAY[('pending'::character varying)::text, ('settled'::character varying)::text]))),
    CONSTRAINT salary_payments_total_working_days_check CHECK ((total_working_days > 0))
);


--
-- Name: salary_payments_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.salary_payments_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: salary_payments_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.salary_payments_id_seq OWNED BY public.salary_payments.id;


--
-- Name: users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.users (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    username character varying(255) NOT NULL,
    email character varying(255) NOT NULL,
    password_hash text NOT NULL,
    role character varying(50) NOT NULL,
    status character varying(20) DEFAULT 'ACTIVE'::character varying NOT NULL,
    needs_password_change boolean DEFAULT true,
    reset_token text,
    reset_token_expiry timestamp with time zone,
    last_login timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT users_role_check CHECK (((role)::text = ANY ((ARRAY['ADMIN'::character varying, 'DOCTOR'::character varying, 'NURSE'::character varying, 'RECEPTIONIST'::character varying])::text[]))),
    CONSTRAINT users_status_check CHECK (((status)::text = ANY ((ARRAY['ACTIVE'::character varying, 'INACTIVE'::character varying])::text[])))
);


--
-- Name: advances id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.advances ALTER COLUMN id SET DEFAULT nextval('public.advances_id_seq'::regclass);


--
-- Name: expenses id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.expenses ALTER COLUMN id SET DEFAULT nextval('public.expenses_id_seq'::regclass);


--
-- Name: salary_payments id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.salary_payments ALTER COLUMN id SET DEFAULT nextval('public.salary_payments_id_seq'::regclass);


--
-- Name: advances advances_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.advances
    ADD CONSTRAINT advances_pkey PRIMARY KEY (id);


--
-- Name: daily_ledger_closures daily_ledger_closures_closure_date_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.daily_ledger_closures
    ADD CONSTRAINT daily_ledger_closures_closure_date_key UNIQUE (closure_date);


--
-- Name: daily_ledger_closures daily_ledger_closures_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.daily_ledger_closures
    ADD CONSTRAINT daily_ledger_closures_pkey PRIMARY KEY (id);


--
-- Name: daily_ledger_transactions daily_ledger_transactions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.daily_ledger_transactions
    ADD CONSTRAINT daily_ledger_transactions_pkey PRIMARY KEY (id);


--
-- Name: doctors doctors_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.doctors
    ADD CONSTRAINT doctors_pkey PRIMARY KEY (id);


--
-- Name: employees employees_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employees
    ADD CONSTRAINT employees_pkey PRIMARY KEY (id);


--
-- Name: expenses expenses_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.expenses
    ADD CONSTRAINT expenses_pkey PRIMARY KEY (id);


--
-- Name: patients patients_patient_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.patients
    ADD CONSTRAINT patients_patient_id_key UNIQUE (patient_id);


--
-- Name: patients patients_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.patients
    ADD CONSTRAINT patients_pkey PRIMARY KEY (id);


--
-- Name: referrals referrals_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.referrals
    ADD CONSTRAINT referrals_pkey PRIMARY KEY (id);


--
-- Name: salary_payments salary_payments_employee_id_month_year_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.salary_payments
    ADD CONSTRAINT salary_payments_employee_id_month_year_key UNIQUE (employee_id, month_year);


--
-- Name: salary_payments salary_payments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.salary_payments
    ADD CONSTRAINT salary_payments_pkey PRIMARY KEY (id);


--
-- Name: users users_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_email_key UNIQUE (email);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: idx_advance_emp_month; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_advance_emp_month ON public.advances USING btree (employee_id, month_year);


--
-- Name: idx_advance_month; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_advance_month ON public.advances USING btree (month_year);


--
-- Name: idx_doctors_name; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_doctors_name ON public.doctors USING btree (name);


--
-- Name: idx_doctors_specialist; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_doctors_specialist ON public.doctors USING btree (specialist);


--
-- Name: idx_employees_designation; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_employees_designation ON public.employees USING btree (designation);


--
-- Name: idx_employees_name; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_employees_name ON public.employees USING btree (name);


--
-- Name: idx_employees_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_employees_status ON public.employees USING btree (status);


--
-- Name: idx_expense_month; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_expense_month ON public.expenses USING btree (month_year);


--
-- Name: idx_ledger_created_by; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ledger_created_by ON public.daily_ledger_transactions USING btree (created_by);


--
-- Name: idx_ledger_date_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ledger_date_status ON public.daily_ledger_transactions USING btree (transaction_date DESC, status);


--
-- Name: idx_ledger_patient; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ledger_patient ON public.daily_ledger_transactions USING btree (patient_id) WHERE (patient_id IS NOT NULL);


--
-- Name: idx_ledger_payment_mode; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ledger_payment_mode ON public.daily_ledger_transactions USING btree (payment_mode);


--
-- Name: idx_ledger_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ledger_status ON public.daily_ledger_transactions USING btree (status);


--
-- Name: idx_ledger_transaction_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ledger_transaction_date ON public.daily_ledger_transactions USING btree (transaction_date DESC);


--
-- Name: idx_ledger_type_source; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ledger_type_source ON public.daily_ledger_transactions USING btree (transaction_type, source);


--
-- Name: idx_patients_name; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_patients_name ON public.patients USING btree (name);


--
-- Name: idx_patients_patient_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_patients_patient_id ON public.patients USING btree (patient_id);


--
-- Name: idx_patients_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_patients_status ON public.patients USING btree (status);


--
-- Name: idx_referrals_name; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_referrals_name ON public.referrals USING btree (name);


--
-- Name: idx_referrals_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_referrals_status ON public.referrals USING btree (status);


--
-- Name: idx_salary_emp_month; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_salary_emp_month ON public.salary_payments USING btree (employee_id, month_year);


--
-- Name: idx_salary_month; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_salary_month ON public.salary_payments USING btree (month_year);


--
-- Name: idx_salary_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_salary_status ON public.salary_payments USING btree (status);


--
-- Name: idx_users_email; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_users_email ON public.users USING btree (email);


--
-- Name: idx_users_reset_token; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_users_reset_token ON public.users USING btree (reset_token);


--
-- Name: idx_users_role; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_users_role ON public.users USING btree (role);


--
-- Name: idx_users_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_users_status ON public.users USING btree (status);


--
-- Name: referrals update_referrals_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_referrals_updated_at BEFORE UPDATE ON public.referrals FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: users update_users_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON public.users FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: advances advances_employee_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.advances
    ADD CONSTRAINT advances_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.employees(id) ON DELETE CASCADE;


--
-- Name: daily_ledger_closures daily_ledger_closures_closed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.daily_ledger_closures
    ADD CONSTRAINT daily_ledger_closures_closed_by_fkey FOREIGN KEY (closed_by) REFERENCES public.users(id);


--
-- Name: daily_ledger_transactions daily_ledger_transactions_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.daily_ledger_transactions
    ADD CONSTRAINT daily_ledger_transactions_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: daily_ledger_transactions daily_ledger_transactions_patient_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.daily_ledger_transactions
    ADD CONSTRAINT daily_ledger_transactions_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES public.patients(id) ON DELETE SET NULL;


--
-- Name: daily_ledger_transactions daily_ledger_transactions_verified_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.daily_ledger_transactions
    ADD CONSTRAINT daily_ledger_transactions_verified_by_fkey FOREIGN KEY (verified_by) REFERENCES public.users(id);


--
-- Name: referrals referrals_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.referrals
    ADD CONSTRAINT referrals_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: referrals referrals_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.referrals
    ADD CONSTRAINT referrals_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.users(id);


--
-- Name: salary_payments salary_payments_employee_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.salary_payments
    ADD CONSTRAINT salary_payments_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.employees(id) ON DELETE CASCADE;


--
-- PostgreSQL database dump complete
--

\unrestrict cTyfcbnqTpPBuk9h4ljNQv1g4I5qw5Q96Te82SSQRDtsM2P2J6IOEmMnwmzmUYX

