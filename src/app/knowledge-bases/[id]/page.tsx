import { AdminShell } from "@/components/layout/admin-shell";
import { KnowledgeBaseDetailFeature } from "@/features/knowledge-bases/components/knowledge-base-detail-feature";

export default function KnowledgeBaseDetailPage() {
  return (
    <AdminShell>
      <KnowledgeBaseDetailFeature />
    </AdminShell>
  );
}
