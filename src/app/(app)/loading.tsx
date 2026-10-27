export default function Loading() {
  return (
    <div className="animate-pulse" aria-busy="true" aria-label="Loading">
      <div className="mb-2 h-4 w-32 rounded bg-surface-3" />
      <div className="mb-8 h-9 w-72 rounded bg-surface-3" />
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1.35fr_1fr]">
        <div className="h-64 rounded-xl bg-surface-2" />
        <div className="h-64 rounded-xl bg-surface-2" />
      </div>
    </div>
  );
}
