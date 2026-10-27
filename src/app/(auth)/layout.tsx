export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-[1fr_1.1fr]">
      <div className="flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm">{children}</div>
      </div>
      <aside className="relative hidden overflow-hidden border-l border-border bg-surface-2 lg:block">
        <div className="absolute inset-0 flex flex-col justify-end p-14">
          <svg viewBox="0 0 400 200" className="absolute top-16 right-0 left-0 w-full text-accent opacity-[0.18]" aria-hidden>
            {Array.from({ length: 9 }, (_, i) => (
              <path key={i} d={`M0 ${150 - i * 6} C 100 ${40 + i * 9}, 200 ${180 - i * 4}, 400 ${60 + i * 8}`} fill="none" stroke="currentColor" strokeWidth="1.2" />
            ))}
          </svg>
          <p className="font-display text-[44px] leading-[1.05] font-medium tracking-tight text-text">
            Your money, school, work and time —<em className="text-accent"> in one calm place.</em>
          </p>
          <p className="mt-5 max-w-md text-[15px] text-text-2">BudgetFlow keeps your life&apos;s moving parts together, with Jarvis to answer questions, plan your week and get things done.</p>
        </div>
      </aside>
    </div>
  );
}
