import { AdminShell } from "@/components/layout/admin-shell";
import { RagManage } from "@/features/knowledge-bases/index";

export default function KnowledgeBasesPage() {
  return (
    <AdminShell>
      <RagManage />
    </AdminShell>
  );
}
