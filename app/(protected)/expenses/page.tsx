import { PageContainer } from "@/components/layout/page-header";
import { ExpensesClient } from "@/components/expenses/expenses-client";

export default function ExpensesPage() {
  return (
    <PageContainer narrow className="gap-0 px-0 pt-0 sm:px-4 sm:pt-2">
      <ExpensesClient />
    </PageContainer>
  );
}
