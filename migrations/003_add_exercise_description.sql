-- ============================================================
-- Migration: add description (short technique cue) to program_exercises
-- Run once in the Supabase SQL Editor for an existing project.
-- (setup.sql already includes this column for fresh installs.)
-- ============================================================

alter table public.program_exercises add column if not exists description text;
