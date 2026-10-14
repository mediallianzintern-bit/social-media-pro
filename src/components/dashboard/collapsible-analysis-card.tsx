import { useId, useState, type ReactNode } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { CollapseToggle } from "@/components/dashboard/collapse-toggle";

export function CollapsibleAnalysisCard({
  title,
  preview,
  children,
}: {
  title: string;
  preview: string;
  children: ReactNode;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const id = useId();
  return (
    <Card>
      <div id={id}>
        {collapsed ? (
          <>
            <CardHeader>
              <CardTitle className="text-base">{title}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="line-clamp-3 text-sm leading-relaxed">{preview}</p>
            </CardContent>
          </>
        ) : (
          children
        )}
      </div>
      <div className="flex justify-center px-6 pb-3">
        <CollapseToggle
          placement="bottom"
          collapsed={collapsed}
          onToggle={() => setCollapsed((v) => !v)}
          showLabel={`Expand ${title}`}
        />
      </div>
    </Card>
  );
}
