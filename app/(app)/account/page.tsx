import { requireMember } from "@/lib/session";
import { PageContainer, PageHeader, Paper } from "@/components/page";
import { UserAvatar } from "@/components/user-avatar";
import AccountForm from "./account-form";

export const metadata = { title: "Your profile" };

export default async function AccountPage() {
  const me = await requireMember();
  return (
    <PageContainer size="narrow" className="max-w-md">
      <div className="mb-4 flex justify-center"><UserAvatar id={me.userId} name={me.user.name} size="lg" className="size-16 text-xl" /></div>
      <PageHeader title={me.user.name} subtitle={`${me.user.email} · ${me.role.toLowerCase()}`} />
      <Paper className="p-6">
        <AccountForm name={me.user.name} />
      </Paper>
    </PageContainer>
  );
}

// Per-request auth + DB data; nothing to prerender.
export const instant = false;
