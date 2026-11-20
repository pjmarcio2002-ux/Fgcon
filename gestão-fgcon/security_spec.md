# PlanaObra — Firestore Security Specification (Phase 0 TDD)

## 1. Data Invariants

1. **Single-Owner Isolation (`/dados/{userId}`)**: Every workspace document under `/dados/{userId}` belongs strictly to the authenticated, email-verified user whose `request.auth.uid == userId`. Cross-user reads (`get`), collection queries (`list`), and writes (`create`, `update`, `delete`) are forbidden.
2. **Default-Deny Catch-All**: Any path outside `/dados/{userId}` (including `/test/connection` and undeclared collections) is denied for all reads and writes.
3. **Strict Path Variable Hardening**: `{userId}` must be a string with `size() <= 128` matching `^[a-zA-Z0-9_\-]+$` on all single-document operations (`get`, `create`, `update`).
4. **Verified Identity Requirement**: All reads and writes require `request.auth != null` and `request.auth.token.email_verified == true`.
5. **Exact Schema & No Shadow Fields**: Incoming documents on `create` and `update` must contain strictly the declared keys (`ownerId`, `version`, `project`, `floors`, `rooms`, `entries`, `dayMetas`, `workers`, `attendance`, `roomHeadcounts`, `createdAt`, `updatedAt`). `project` must contain strictly its 10 declared keys with bounded string lengths, ISO-8601 `YYYY-MM-DD` date patterns, and valid `workWeekMode` enum values.
6. **Immutability & Server Timestamps**: `ownerId` must equal `request.auth.uid` on create and remain immutable on update. `createdAt` must equal `request.time` on create and remain immutable on update. `updatedAt` must equal `request.time` on both create and update.
7. **Volumetric Array & String Guards**: Every string field has an explicit `.size()` bound; every array field has an explicit `.size() <= MAX` bound and element-type check (`arr.size() == 0 || arr[0] is map`).
8. **No Collection Listing or Client Deletion**: `allow list: if false;` prevents collection enumeration; `allow delete: if false;` prevents accidental destructive removal (resets use structured updates).

---

## 2. The "Dirty Dozen" Adversarial Payloads (Must Return `PERMISSION_DENIED`)

1. **Unauthenticated Read (`get /dados/user-a`)**: `auth = null`.
2. **Cross-User PII/Workspace Read (`get /dados/user-b`)**: `auth = { uid: 'user-a', email_verified: true }`.
3. **Collection Enumeration (`list /dados`)**: `auth = { uid: 'user-a', email_verified: true }`.
4. **Email Spoofing / Unverified Token Write (`create /dados/user-a`)**: `auth = { uid: 'user-a', email_verified: false }` with valid payload.
5. **Identity Spoofing on Create (`create /dados/user-a`)**: `{ ...validPayload, ownerId: 'user-b' }`.
6. **Shadow Field Injection on Create (`create /dados/user-a`)**: `{ ...validPayload, isAdmin: true }`.
7. **Shadow Field Injection on Update (`update /dados/user-a`)**: `{ ...validPayload, role: 'superadmin' }`.
8. **Immortal Field Tampering — `ownerId` Mutation (`update /dados/user-a`)**: changing `ownerId` from `'user-a'` to `'user-c'`.
9. **Immortal Field Tampering — `createdAt` Forgery (`update /dados/user-a`)**: modifying `createdAt` to a newer timestamp.
10. **Client-Forged Server Timestamp (`update /dados/user-a`)**: sending `updatedAt` != `request.time`.
11. **Value & Resource Poisoning — Oversized String / Invalid Date (`update /dados/user-a`)**: `project.name` with 500 characters or `project.startDate: 'not-a-date'`.
12. **Array Type / Volumetric Poisoning (`update /dados/user-a`)**: `floors: ['not-a-map']` or `floors` array exceeding 100 items, or poisoned document ID (`userId` with 200 chars / invalid chars).
