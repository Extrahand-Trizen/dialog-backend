-- Phase 3: expand org-scoped roles beyond Admin/Viewer.
-- Manager = operational (templates, notification rules); Agent = messages only.
ALTER TYPE "UserRole" ADD VALUE 'MANAGER';
ALTER TYPE "UserRole" ADD VALUE 'AGENT';
