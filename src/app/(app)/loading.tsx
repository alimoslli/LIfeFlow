/** Shown while a screen loads: shapes that match the real layout, with a soft shimmer. */
export default function Loading() {
  return (
    <div className="mx-auto flex max-w-[640px] flex-col gap-10" aria-busy="true" aria-label="Loading">
      <div>
        <div className="lf-shimmer h-4 w-32 rounded-full" />
        <div className="lf-shimmer mt-3 h-10 w-72 max-w-full rounded-xl" />
        <div className="lf-shimmer mt-3 h-4 w-60 max-w-full rounded-full" />
        <div className="lf-shimmer mt-6 h-12 w-full rounded-full" />
      </div>
      <div className="lf-shimmer h-32 rounded-3xl" />
      <div className="flex flex-col gap-3">
        <div className="lf-shimmer h-4 w-24 rounded-full" />
        <div className="lf-shimmer h-16 rounded-2xl" />
        <div className="lf-shimmer h-16 rounded-2xl" />
      </div>
    </div>
  );
}
