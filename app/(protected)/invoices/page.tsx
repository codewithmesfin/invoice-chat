import { PageContainer } from "@/components/layout/page-header";
import { InvoicesClient } from "@/components/invoices/invoices-client";

export default function InvoicesPage() {
  return (
    <PageContainer narrow className="gap-0 px-0 pt-0 sm:px-4 sm:pt-2">
      <InvoicesClient />
    </PageContainer>
  );
}
