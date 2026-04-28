import { PageContainer } from "@/components/layout/page-header";
import { InvoiceDetailClient } from "@/components/invoices/invoice-detail-client";

export default function InvoiceDetailPage({ params }: { params: { id: string } }) {
  return (
    <PageContainer narrow className="gap-0 pt-4">
      <InvoiceDetailClient invoiceId={params.id} />
    </PageContainer>
  );
}
