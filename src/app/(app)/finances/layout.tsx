import { FinanceTabs } from "./tabs";

export default function FinancesLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <FinanceTabs />
      {children}
    </>
  );
}
