import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useWorkspace, type PanelTab } from "@/lib/store";
import { AiPanel } from "./ai-panel";
import { Inspector } from "./inspector";
import { IssuesPanel } from "./issues-panel";
import { SimulatorPanel } from "./simulator-panel";

const trigger =
  "h-10 flex-none rounded-none border-b-2 border-transparent bg-transparent px-0 text-xs font-medium text-muted-foreground shadow-none data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-primary data-[state=active]:shadow-none";
const content = "mt-0 min-h-0 flex-1 overflow-y-auto p-4 focus-visible:ring-0";

export function SidePanel() {
  const tab = useWorkspace((s) => s.tab);
  const setTab = useWorkspace((s) => s.setTab);
  const issueCount = useWorkspace((s) => s.issues.length);

  return (
    <aside className="flex min-h-0 flex-col border-t bg-card lg:border-l lg:border-t-0">
      <Tabs
        value={tab}
        onValueChange={(v) => setTab(v as PanelTab)}
        className="flex min-h-0 flex-1 flex-col"
      >
        <TabsList className="h-10 w-full justify-start gap-5 rounded-none border-b bg-transparent p-0 px-4">
          <TabsTrigger value="block" className={trigger}>
            Block
          </TabsTrigger>
          <TabsTrigger value="checks" className={trigger}>
            Checks{issueCount ? ` (${issueCount})` : ""}
          </TabsTrigger>
          <TabsTrigger value="simulate" className={trigger}>
            Simulate
          </TabsTrigger>
          <TabsTrigger value="ai" className={trigger}>
            AI
          </TabsTrigger>
        </TabsList>
        <TabsContent value="block" className={content}>
          <Inspector />
        </TabsContent>
        <TabsContent value="checks" className={content}>
          <IssuesPanel />
        </TabsContent>
        <TabsContent value="simulate" className={content}>
          <SimulatorPanel />
        </TabsContent>
        <TabsContent value="ai" className={content}>
          <AiPanel />
        </TabsContent>
      </Tabs>
    </aside>
  );
}
