import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Search, BellRing, AlertTriangle, CheckCircle2 } from "lucide-react";

export default function Alerts() {
  return (
    <div className="p-6 md:p-10 lg:p-12 space-y-6 max-w-7xl mx-auto w-full animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
        <div>
          <h1 className="text-4xl font-extrabold tracking-tight text-gradient">System Alerts</h1>
          <p className="text-muted-foreground mt-2 text-lg">Monitor geofence breaches and device anomalies.</p>
        </div>
      </div>

      <Card className="glass mt-8 overflow-hidden border-0 shadow-2xl relative">
        <div className="mesh-gradient absolute inset-0 z-0 opacity-40 mix-blend-overlay pointer-events-none"></div>
        <CardHeader className="relative z-10 border-b border-border/40 pb-6">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div>
              <CardTitle className="text-2xl">Recent Incidents</CardTitle>
              <CardDescription className="text-base mt-1">Real-time log of security events and warnings.</CardDescription>
            </div>
            <div className="relative w-full sm:w-72">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input placeholder="Search alerts..." className="pl-9 bg-background/50 backdrop-blur-md border border-border focus:ring-2 focus:ring-primary h-11" />
            </div>
          </div>
        </CardHeader>
        <CardContent className="relative z-10 p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-muted/30 text-muted-foreground uppercase tracking-wider text-xs font-semibold">
                <tr>
                  <th className="px-6 py-4 rounded-tl-lg">Severity</th>
                  <th className="px-6 py-4">Event Context</th>
                  <th className="px-6 py-4">Timestamp</th>
                  <th className="px-6 py-4 text-right rounded-tr-lg">Resolution</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40 text-foreground/90">
                <tr className="hover:bg-accent/40 transition-colors group">
                  <td className="px-6 py-5">
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-rose-500/10 text-rose-500 border border-rose-500/20">
                      <AlertTriangle className="w-3.5 h-3.5" /> High
                    </span>
                  </td>
                  <td className="px-6 py-5 font-medium flex items-center gap-3">
                    <div className="p-2 bg-destructive/10 rounded-lg group-hover:bg-destructive/20 transition-colors">
                      <BellRing className="w-5 h-5 text-destructive" />
                    </div>
                    <div>
                      <span className="block font-semibold text-base">Geofence Exit</span>
                      <span className="text-xs text-muted-foreground">Tracker-X1 left Warehouse A</span>
                    </div>
                  </td>
                  <td className="px-6 py-5">
                    <span className="text-muted-foreground">Just now</span>
                  </td>
                  <td className="px-6 py-5 text-right">
                    <Button variant="outline" size="sm" className="gap-2 text-primary border-primary/30 hover:bg-primary/10">
                      <CheckCircle2 className="w-4 h-4" /> Acknowledge
                    </Button>
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
