import { PageContainer } from "@/components/layout/page-header";
import { CustomerDetailClient } from "@/components/customers/customer-detail-client";

export default function CustomerDetailPage({ params }: { params: { id: string } }) {
  return (
    <PageContainer narrow className="gap-0 pt-4">
      <CustomerDetailClient customerId={params.id} />
    </PageContainer>
  );
}
