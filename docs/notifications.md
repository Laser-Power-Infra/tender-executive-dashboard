# Tender WhatsApp notifications

WhatsApp messages go through the notification service (`D:\laser\notification-service`):
the dashboard publishes to the RabbitMQ exchange `notifications` and the service
delivers through Evolution API, with its own retries and dedup by message `id`.

## How it works

- A scheduler calls `POST /api/notifications/whatsapp` with the external API key
  (`requireApiKey`). One call runs every type below.
- Code: `lib/whatsapp-notifications.ts` (queries and templates),
  `publishWhatsAppNotification` in `lib/queue/publisher.ts` (envelope
  `{ id, version: 1, notification_platform: "whatsapp", recipient: { to }, text }`).
- Uses `RABBITMQ_URL`. It must point at the same broker the notifier consumes.
- Outside `ENVIRONMENT=PROD` it is a dry run: nothing is published or marked, the
  response counts what would have gone out.
- Recipients: the users assigned to the tender (Prep By associations, matched to
  users by email) who are active and have a mobile number. A tender with no such
  user is skipped and tried again next run.
- After every recipient was queued, the type key is appended to the
  comma-separated `TenderMerged.notificationStatus`, so each tender gets each
  type once.
- All types need `apm = "YES"` and no pending delete. Deadline over types ignore
  tenders whose deadline is before 22 Nov 2026 IST, when this went live.

## Mobile numbers

`users.mobile` holds digits only with country code (`919876543210`); a bare
10-digit number is taken as Indian. It is required when an admin creates an
account (signup page or Users > Add user) and editable on the Users page. The
column is nullable for accounts made before it existed.

## Notification types

### 1. Deadline over, not participated

- Key: `deadline_over_not_participated_notification`
- Trigger: deadline has passed, `participated = false`, `reason` is non-empty.
- Message:
  ```
  *Deadline Over - Not Participated*

  Tender No: {referenceNo}
  Tender: {tenderBrief}
  Organization: {organization}
  Deadline: {deadline}

  Reason: {reason}
  ```

### 2. Deadline over, reason not provided

- Key: `deadline_over_reason_not_provided_notification`
- Trigger: deadline has passed, `participated` is `false` or `null`, `reason` is
  `null` or empty.
- Message:
  ```
  *Deadline Over - Reason Required*

  Tender No: {referenceNo}
  Tender: {tenderBrief}
  Organization: {organization}
  Deadline: {deadline}

  Please add the reason for not participating in the dashboard.
  ```

### 3. Catalogue missing (upcoming deadline)

- Key: `deadline_over_catalogue_missing_notification`
- Trigger: `tenderType = "GEM"`, `participated` is `null`,
  `catalogueDone = "NOT_DECIDED"`, deadline within the next 7 days.
- Message (`daysToDeadline` rounded up, minimum 1):
  ```
  *Catalogue Missing*

  Tender No: {referenceNo}
  Tender: {tenderBrief}
  Organization: {organization}
  Deadline: {deadline} (in {daysToDeadline} days)

  Please complete the catalogue before the deadline.
  ```

## Not yet rebuilt

Result declared (`deadline_over_result_notification`): deadline passed, `apm =
"YES"`, `competitors`, `ourRank`, `ourValue` all set. It used to go to one fixed
number through a self-hosted Evolution API call from this app.
