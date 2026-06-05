import { AdminShell } from "@/components/layout/admin-shell";
import { NoteFeature } from "@/features/note";

export default function NotePage() {
  return (
    <AdminShell>
      <NoteFeature />
    </AdminShell>
  );
}
