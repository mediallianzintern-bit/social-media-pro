import { useId, useRef, useState, type ReactNode } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { Card } from "@/components/ui/card";

/** The close control belongs to the content it closes, at its bottom edge. */
export function CollapsibleAnalysisCard({ title, children }: { title: string; children: ReactNode }) {
  const [open, setOpen] = useState(true);
  const id = useId();
  const expand = useRef<HTMLButtonElement>(null);
  return (
    <Card className="scroll-mt-24">
      <button
        ref={expand}
        type="button"
        hidden={open}
        aria-expanded={open}
        aria-controls={id}
        className="flex w-full items-center justify-between rounded-xl p-6 text-left font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
        onClick={() => setOpen(true)}
      >
        {title}<ChevronDown className="size-5" aria-hidden />
      </button>
      <div id={id} hidden={!open}>
        {children}
        <div className="flex justify-end px-6 pb-5">
          <button
            type="button"
            aria-label={`Collapse ${title}`}
            title={`Collapse ${title}`}
            aria-expanded={open}
            aria-controls={id}
            className="flex size-14 items-center justify-center rounded-full bg-[#fff7e9] text-[#003b59] shadow-[0_3px_16px_#00000015] transition-colors hover:bg-[#f7ecd8] focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
            onClick={() => {
              setOpen(false);
              requestAnimationFrame(() => {
                expand.current?.focus({ preventScroll: true });
                expand.current?.scrollIntoView({ block: "nearest" });
              });
            }}
          >
            <ChevronUp className="size-8" strokeWidth={1.5} aria-hidden />
          </button>
        </div>
      </div>
    </Card>
  );
}
