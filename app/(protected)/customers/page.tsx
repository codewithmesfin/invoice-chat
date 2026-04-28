import { PageContainer } from "@/components/layout/page-header";
import { CustomersClient } from "@/components/customers/customers-client";

export default function CustomersPage() {
  return (
    <PageContainer narrow className="gap-0 px-0 pt-0 sm:px-4 sm:pt-2">
      <CustomersClient />
    </PageContainer>
  );
}
