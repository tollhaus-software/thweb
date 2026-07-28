# Roles and permissions

Access to parts of the application is granted through "permissions".
A user can only access some part of the application if they have the corresponding
permission.

Each user with access must be in the `users` table.

A user can have 0..N roles.

Each role then grants some permissions.

Each user can also have additional permissions defined on their users row directly.

# Currently known permissions

- families.all.read
- families.all.write
- children.all.read
- children.all.write
- fees.all.read
- fees.self.read
- hygiene.all.write
- hygiene.all.read
- memberships.all.read
- memberships.all.write
- audit.all.read

