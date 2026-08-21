-- ExtraHand-only data fix: pin notification rules to the Extrahand WhatsApp phone.
--
-- DO NOT run automatically against production without operator review.
--
-- ExtraHand organizationId: be71c430-c43e-45cc-a03d-9159f37c771e
-- Target PhoneNumber id:     d8e2062a-ef47-4a19-8192-10e59d9b83a3
-- Meta Phone Number ID:      1330247070161585
-- WABA:                      1717488379965758

-- ---------------------------------------------------------------------------
-- 0) SAFETY PRECHECK — phone must belong to ExtraHand Extrahand WABA
-- ---------------------------------------------------------------------------
SELECT
  p.id AS phone_id,
  p."metaPhoneNumberId",
  p.status AS phone_status,
  p."isDefault",
  a."organizationId",
  a."metaWabaId",
  a.status AS waba_status
FROM "PhoneNumber" p
JOIN "WhatsAppAccount" a ON a.id = p."whatsAppAccountId"
WHERE p.id = 'd8e2062a-ef47-4a19-8192-10e59d9b83a3';

-- Expect exactly one row:
-- organizationId = be71c430-c43e-45cc-a03d-9159f37c771e
-- metaWabaId     = 1717488379965758
-- metaPhoneNumberId = 1330247070161585
-- phone_status   = ACTIVE

-- ---------------------------------------------------------------------------
-- 1) SELECT — rules that will change (ExtraHand, non-deleted, phoneNumberId NULL)
-- ---------------------------------------------------------------------------
SELECT
  r.id,
  r."eventKey",
  r.enabled,
  r."phoneNumberId",
  r."organizationId",
  t."metaTemplateName"
FROM "NotificationRule" r
LEFT JOIN "Template" t ON t.id = r."templateId"
WHERE r."organizationId" = 'be71c430-c43e-45cc-a03d-9159f37c771e'
  AND r."deletedAt" IS NULL
  AND r."phoneNumberId" IS NULL
ORDER BY r."eventKey";

-- ---------------------------------------------------------------------------
-- 2) UPDATE — pin to ExtraHand Extrahand phone only
-- ---------------------------------------------------------------------------
BEGIN;

UPDATE "NotificationRule" r
SET
  "phoneNumberId" = 'd8e2062a-ef47-4a19-8192-10e59d9b83a3',
  "updatedAt" = NOW()
WHERE r."organizationId" = 'be71c430-c43e-45cc-a03d-9159f37c771e'
  AND r."deletedAt" IS NULL
  AND r."phoneNumberId" IS NULL
  AND EXISTS (
    SELECT 1
    FROM "PhoneNumber" p
    JOIN "WhatsAppAccount" a ON a.id = p."whatsAppAccountId"
    WHERE p.id = 'd8e2062a-ef47-4a19-8192-10e59d9b83a3'
      AND a."organizationId" = 'be71c430-c43e-45cc-a03d-9159f37c771e'
      AND a."metaWabaId" = '1717488379965758'
      AND p."metaPhoneNumberId" = '1330247070161585'
      AND p.status = 'ACTIVE'
  );

-- ---------------------------------------------------------------------------
-- 3) VERIFY
-- ---------------------------------------------------------------------------
SELECT
  r.id,
  r."eventKey",
  r."phoneNumberId",
  p."metaPhoneNumberId",
  a."metaWabaId",
  a."organizationId"
FROM "NotificationRule" r
JOIN "PhoneNumber" p ON p.id = r."phoneNumberId"
JOIN "WhatsAppAccount" a ON a.id = p."whatsAppAccountId"
WHERE r."organizationId" = 'be71c430-c43e-45cc-a03d-9159f37c771e'
  AND r."deletedAt" IS NULL
ORDER BY r."eventKey";

-- Expect: every non-deleted ExtraHand rule has phoneNumberId = d8e2062a-...
-- and metaPhoneNumberId = 1330247070161585

-- Other orgs unchanged:
SELECT COUNT(*)::int AS other_org_rules_still_null
FROM "NotificationRule"
WHERE "organizationId" <> 'be71c430-c43e-45cc-a03d-9159f37c771e'
  AND "deletedAt" IS NULL
  AND "phoneNumberId" IS NULL;

COMMIT;
-- Use ROLLBACK instead of COMMIT if verification fails.

-- ---------------------------------------------------------------------------
-- 4) ROLLBACK (restore ExtraHand rules to default-resolver / null phone)
-- ---------------------------------------------------------------------------
-- BEGIN;
-- UPDATE "NotificationRule"
-- SET "phoneNumberId" = NULL, "updatedAt" = NOW()
-- WHERE "organizationId" = 'be71c430-c43e-45cc-a03d-9159f37c771e'
--   AND "deletedAt" IS NULL
--   AND "phoneNumberId" = 'd8e2062a-ef47-4a19-8192-10e59d9b83a3';
-- COMMIT;
