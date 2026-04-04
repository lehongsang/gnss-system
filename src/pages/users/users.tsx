import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Plus, Search, ShieldCheck } from "lucide-react";

export default function Users() {
  return (
    <div className="p-6 md:p-10 lg:p-12 space-y-6 max-w-7xl mx-auto w-full animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
        <div>
          <h1 className="text-4xl font-extrabold tracking-tight text-gradient">Users Management</h1>
          <p className="text-muted-foreground mt-2 text-lg">Administer user accounts, roles, and platform access.</p>
        </div>
        <Button className="bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg hover:shadow-primary/50 transition-all gap-2" size="lg">
          <Plus className="w-5 h-5" />
          Invite User
        </Button>
      </div>

      <Card className="glass mt-8 overflow-hidden border-0 shadow-2xl relative">
        <div className="mesh-gradient absolute inset-0 z-0 opacity-40 mix-blend-overlay pointer-events-none"></div>
        <CardHeader className="relative z-10 border-b border-border/40 pb-6">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div>
              <CardTitle className="text-2xl">Organizational Users</CardTitle>
              <CardDescription className="text-base mt-1">Review active sessions and assigned permissions.</CardDescription>
            </div>
            <div className="relative w-full sm:w-72">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input placeholder="Search users by email, name..." className="pl-9 bg-background/50 backdrop-blur-md border border-border focus:ring-2 focus:ring-primary h-11" />
            </div>
          </div>
        </CardHeader>
        <CardContent className="relative z-10 p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-muted/30 text-muted-foreground uppercase tracking-wider text-xs font-semibold">
                <tr>
                  <th className="px-6 py-4 rounded-tl-lg">User</th>
                  <th className="px-6 py-4">Role</th>
                  <th className="px-6 py-4">Status</th>
                  <th className="px-6 py-4 text-right rounded-tr-lg">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40 text-foreground/90">
                <tr className="hover:bg-accent/40 transition-colors group">
                  <td className="px-6 py-5 font-medium flex items-center gap-3">
                    <div className="w-10 h-10 bg-primary/20 flex items-center justify-center rounded-full text-primary font-bold shadow-sm">
                      AD
                    </div>
                    <div>
                      <span className="block font-semibold text-base">Admin User</span>
                      <span className="text-xs text-muted-foreground">admin@gnss.local</span>
                    </div>
                  </td>
                  <td className="px-6 py-5">
                    <div className="flex items-center gap-2">
                      <ShieldCheck className="w-4 h-4 text-primary" />
                      Super Admin
                    </div>
                  </td>
                  <td className="px-6 py-5">
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
                      Active
                    </span>
                  </td>
                  <td className="px-6 py-5 text-right">
                    <Button variant="ghost" size="sm" className="hover:bg-secondary">Edit</Button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
