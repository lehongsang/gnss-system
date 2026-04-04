import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Plus, Search, MapPin, Activity, Cpu } from "lucide-react";

export default function Devices() {
  return (
    <div className="p-6 md:p-10 lg:p-12 space-y-6 max-w-7xl mx-auto w-full animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
        <div>
          <h1 className="text-4xl font-extrabold tracking-tight text-gradient">Device Management</h1>
          <p className="text-muted-foreground mt-2 text-lg">Detailed overview and control of your GNSS tracker fleet.</p>
        </div>
        <Button className="bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg hover:shadow-primary/50 transition-all gap-2" size="lg">
          <Plus className="w-5 h-5" />
          Register Device
        </Button>
      </div>

      <Card className="glass mt-8 overflow-hidden border-0 shadow-2xl relative">
        <div className="mesh-gradient absolute inset-0 z-0 opacity-40 mix-blend-overlay pointer-events-none"></div>
        <CardHeader className="relative z-10 border-b border-border/40 pb-6">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div>
              <CardTitle className="text-2xl">Registered Devices</CardTitle>
              <CardDescription className="text-base mt-1">Manage statuses, configuration, and telemetry data transmission.</CardDescription>
            </div>
            <div className="relative w-full sm:w-72">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input placeholder="Search devices by ID, name..." className="pl-9 bg-background/50 backdrop-blur-md border border-border focus:ring-2 focus:ring-primary h-11" />
            </div>
          </div>
        </CardHeader>
        <CardContent className="relative z-10 p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-muted/30 text-muted-foreground uppercase tracking-wider text-xs font-semibold">
                <tr>
                  <th className="px-6 py-4 rounded-tl-lg">Device Name</th>
                  <th className="px-6 py-4">Status</th>
                  <th className="px-6 py-4">Last Position</th>
                  <th className="px-6 py-4">Battery</th>
                  <th className="px-6 py-4 text-right rounded-tr-lg">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40 text-foreground/90">
                <tr className="hover:bg-accent/40 transition-colors group">
                  <td className="px-6 py-5 font-medium flex items-center gap-3">
                    <div className="p-2 bg-primary/10 rounded-lg group-hover:bg-primary/20 transition-colors">
                      <Cpu className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                      <span className="block font-semibold text-base">Tracker-X1</span>
                      <span className="text-xs text-muted-foreground">ID: dev-492-a1f</span>
                    </div>
                  </td>
                  <td className="px-6 py-5">
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
                      <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></div> Active
                    </span>
                  </td>
                  <td className="px-6 py-5">
                    <div className="flex items-center gap-2">
                       <MapPin className="w-4 h-4 text-muted-foreground" />
                       10.7626° N, 106.6601° E
                    </div>
                  </td>
                  <td className="px-6 py-5">
                    <div className="flex items-center gap-2">
                       <Activity className="w-4 h-4 text-emerald-500" />
                       87%
                    </div>
                  </td>
                  <td className="px-6 py-5 text-right">
                    <Button variant="ghost" size="sm" className="hover:bg-secondary">Details</Button>
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
