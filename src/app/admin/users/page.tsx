import { desc } from "drizzle-orm";

import { AppShell } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { Table, Td, Th } from "@/components/ui/table";
import { adminDisconnectPlatformAction, updateUserRoleAction } from "@/lib/actions/admin";
import { requireAdmin } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { platformAccounts, users } from "@/lib/db/schema";

export default async function AdminUsersPage() {
  const session = await requireAdmin();
  const [allUsers, accounts] = await Promise.all([
    db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        phoneNumber: users.phoneNumber,
        role: users.role,
        createdAt: users.createdAt,
        lastLoginAt: users.lastLoginAt
      })
      .from(users)
      .orderBy(desc(users.createdAt)),
    db.select().from(platformAccounts)
  ]);

  return (
    <AppShell role={session.user.role}>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold">Users</h1>
          <p className="text-sm text-muted-foreground">
            Password hashes, OTPs, cookies, authorization headers, and platform tokens are not selected.
          </p>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>Registered Users</CardTitle>
            <CardDescription>Role changes and forced platform disconnects.</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <thead>
                <tr>
                  <Th>Name</Th>
                  <Th>Phone Number</Th>
                  <Th>Email</Th>
                  <Th>Role</Th>
                  <Th>Created</Th>
                  <Th>Last Login</Th>
                  <Th>Platforms</Th>
                </tr>
              </thead>
              <tbody>
                {allUsers.map((user) => {
                  const userAccounts = accounts.filter(
                    (account) => account.userId === user.id && account.status === "CONNECTED"
                  );

                  return (
                    <tr key={user.id}>
                      <Td>{user.name}</Td>
                      <Td>{user.phoneNumber}</Td>
                      <Td>{user.email}</Td>
                      <Td>
                        <form action={updateUserRoleAction} className="flex items-center gap-2">
                          <input type="hidden" name="userId" value={user.id} />
                          <Select name="role" defaultValue={user.role} className="h-9 w-28">
                            <option value="USER">USER</option>
                            <option value="ADMIN">ADMIN</option>
                          </Select>
                          <Button type="submit" variant="outline">
                            Save
                          </Button>
                        </form>
                      </Td>
                      <Td>{user.createdAt.toLocaleDateString()}</Td>
                      <Td>{user.lastLoginAt ? user.lastLoginAt.toLocaleString() : "Never"}</Td>
                      <Td>
                        <div className="flex flex-wrap gap-1">
                          {userAccounts.length === 0 ? (
                            <Badge variant="muted">None</Badge>
                          ) : (
                            userAccounts.map((account) => (
                              <form key={account.id} action={adminDisconnectPlatformAction} className="inline-flex">
                                <input type="hidden" name="userId" value={user.id} />
                                <input type="hidden" name="platform" value={account.platform} />
                                <Button type="submit" variant="outline" className="h-7 px-2 text-xs">
                                  {account.platform} ×
                                </Button>
                              </form>
                            ))
                          )}
                        </div>
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
