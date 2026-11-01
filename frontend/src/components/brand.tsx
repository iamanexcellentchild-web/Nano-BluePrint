export function Brand() {
  return (
    <div className="flex items-center gap-2.5">
      <div
        className="flex size-7 -rotate-[8deg] items-center justify-center gap-0.5 rounded-lg bg-primary"
        aria-hidden="true"
      >
        <span className="h-[13px] w-[3px] rotate-[8deg] rounded-sm bg-primary-foreground" />
        <span className="h-[17px] w-[3px] rotate-[8deg] rounded-sm bg-primary-foreground" />
        <span className="h-[9px] w-[3px] rotate-[8deg] rounded-sm bg-primary-foreground" />
      </div>
      <span className="text-lg font-bold tracking-tight">blueprint</span>
    </div>
  );
}
