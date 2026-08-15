import { TableDetailsOpsPage } from "@/components/owner/ops/TableDetailsOpsPage";

export default async function TableDetailsOperationsRoute({ params }: { params: Promise<{ tableId: string }> }) {
  const { tableId } = await params;
  return <TableDetailsOpsPage tableId={tableId} />;
}
