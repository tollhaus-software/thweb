# Roles and Permissions

Access to parts of the application is granted through fine-grained **permissions**.
A user can only access an application feature or API endpoint if their effective permissions include the required permission (or the wildcard `*`).

---

## 1. Architecture Overview

1. **Permissions First**: Application handlers and UI components never hardcode checks against role names—they check granular permissions (e.g. `families.all.read`, `memberships.all.read`, `children.all.write`, `users.all.manage`).
2. **Permission Implication Hierarchy**:
   - `*` (Superadmin) implies all permissions.
   - `families.all.read` implies `families.all.restrictedread`.
   - `fees.all.read` implies `fees.self.read`.
   - `memberships.all.write` implies `memberships.all.read`.
   - `memberships.all.read` implies `memberships.self.read`.
3. **Dynamic Roles**: Roles are defined declaratively in a YAML file (`local_dev_roles.yaml` for local development, or `roles.yaml` on deployment side) and loaded via `ROLES_FILE` (falling back to built-in `default_roles.yaml`).
4. **Explicit Denials (`deny_permissions`)**: Roles can define `deny_permissions` to explicitly strip specific permissions from a user's effective permissions. This takes precedence over additive permissions (such as auto-granted parent self-service permissions), allowing educators who are also parents to retain self-service access without gaining access to fee calculation.
5. **Database Synchronization**: Upon startup, the Go backend reads `ROLES_FILE` (or falls back to built-in defaults) and performs an idempotent upsert into the PostgreSQL `roles` table.
6. **Auto-Granted Roles (`auto_grant_on`)**: Certain roles are dynamically assigned at runtime or seeded without manual user intervention.

---

## 2. Declarative Role Configuration (`local_dev_roles.yaml`)

Role definitions and auto-grant rules for local development are configured in `local_dev_roles.yaml` (mirrored in `backend/internal/roles/default_roles.yaml` as the embedded fallback):

```yaml
roles:
  - id: admin
    name: Administrator
    description: Full system access
    auto_grant_on:
      - mock_auth
    permissions:
      - "*"

  - id: viewer
    name: Viewer
    description: Read-only access
    permissions:
      - families.all.read
      - fees.self.read
      - audit.view

  - id: kiosk
    name: Kiosk
    description: Read-only dashboard access for mTLS hardware kiosk terminals
    auto_grant_on:
      - kiosk_cert
    permissions:
      - dashboard.read

  - id: restricted
    name: Restricted Parent
    description: Scoped self-service access for parents matching verified identifier emails
    auto_grant_on:
      - identifier_email
    permissions:
      - families.all.restrictedread
      - fees.self.read
      - families.self.selfservice
      - memberships.self.read
```

### Auto-Grant Triggers (`auto_grant_on`)

| Trigger | Description | Granted To |
| :--- | :--- | :--- |
| `mock_auth` | Local development mode (`ALLOW_MOCK_AUTH=true`) | Seeded to `developer@example.com` on container startup |
| `kiosk_cert` | Hardware kiosks with verified mTLS certificates | Dynamically assigned to requests with `X-Client-Verified: SUCCESS` on kiosk endpoints |
| `identifier_email` | Verified parent contact emails not in `users` table | Dynamically assigned with scoped family ID for self-service access |

---

## 3. Currently Known Permissions

| Permission | Description | Primary Consumers |
| :--- | :--- | :--- |
| `*` | Superadmin wildcard; grants access to all features and APIs | Administrators |
| `families.all.read` | View family cards, parent overview, and parent contact information | Staff, Board, Caregivers |
| `families.all.restrictedread` | Scoped read access for parents to view contact list details | Self-service parents |
| `families.all.write` | Create, edit, and delete family entities, parents, and address records | Staff, Administrators |
| `families.self.selfservice` | Scoped write/edit access for parents managing their own family info | Self-service parents |
| `children.all.read` | View child list and basic child records | Staff, Board, Caregivers |
| `children.all.write` | Create, edit, and delete children and manage historical group assignments | Caregivers, Board |
| `fees.all.read` | Global access to childcare fee calculator across all families | Treasurer, Finanzausschuss, Board |
| `fees.self.read` | Access to childcare fee calculator scoped to one's own family | Parents, Viewers |
| `hygiene.all.read` | View hygiene instruction (*Hygienebelehrung*) events | Staff, Viewers |
| `hygiene.all.write` | Log and update annual hygiene instruction events for staff | Caregivers, Management |
| `memberships.all.read` | Access the "Members" (Vereinsmitglieder) tab and view all active parent memberships | Finanzausschuss, Treasurer, Board |
| `memberships.self.read` | Scoped access for a parent to see their own family's membership status | Parents |
| `memberships.all.write` | Create, edit, and delete Förderverein memberships (implies `memberships.all.read`) | Treasurer, Board |
| `vaccination.status.manage` | View and edit vaccination compliance status (*Masernschutzgesetz*) | Authorized MGA Officers |
| `audit.view` | View change history and audit logs (entity details scoped to domain permissions) | Auditors, Viewers |
| `users.all.manage` | Admin access to manage users, assign roles, and view user permissions | Administrators |
| `provision.kiosk.cert` | Issue new mTLS client certificates for kiosk tablets | Administrators |
| `dashboard.read` | Access kiosk dashboard endpoints and live WebSocket updates | Kiosk Terminals |
| `mealplan.view` | View weekly meal plans (*Kochplan*) | Staff, Parents, Kiosks |
| `permissions.simulate` | Access the role & permissions simulator to test view and API scoping | Administrators |
