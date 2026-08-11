-- ============================================================
-- Migration: add height_cm and age to profiles
-- Run once in the Supabase SQL Editor for an existing project.
-- (setup.sql already includes these columns for fresh installs.)
-- ============================================================

alter table public.profiles add column if not exists height_cm numeric(5,1);
alter table public.profiles add column if not exists age int;
