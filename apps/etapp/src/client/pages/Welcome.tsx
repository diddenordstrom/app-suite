import type { ReactNode } from "react";
import type { MeResponse } from "@/shared/api";
import { Button, Card, DemoSignIn, Logo, Spinner } from "../ui";
import { ErrorNotice } from "../components/common";
import { CreateTripForm } from "../components/CreateTripForm";
import { t } from "../i18n";

export function CenterCard({ children }: { children: ReactNode }) {
  return (
    <div className="grid min-h-dvh place-items-center p-4">
      <div className="w-full max-w-sm">
        <ErrorNotice />
        <Card className="space-y-4 p-6 text-center">
          <div className="flex items-center justify-center gap-2 text-lg font-semibold"><Logo className="size-7" />Etapp</div>
          {children}
        </Card>
      </div>
    </div>
  );
}

export function LoadingScreen() {
  return <div className="grid min-h-dvh place-items-center text-muted-foreground"><Spinner className="size-6" /></div>;
}

export function ErrorScreen({ message, retry }: { message: string; retry: () => void }) {
  return (
    <CenterCard>
      <p className="text-sm text-muted-foreground">{message}</p>
      <Button className="w-full" onClick={retry}>{t("common.tryAgain")}</Button>
    </CenterCard>
  );
}

/** No trips yet: travellers need an invite; admins create their first trip. */
export function Welcome({ me }: { me: MeResponse }) {
  if (me.user)
    return (
      <CenterCard>
        <p className="text-sm text-muted-foreground">{t("welcome.createFirst")}</p>
        <CreateTripForm defaultName={me.user.name ?? ""} />
      </CenterCard>
    );
  return (
    <CenterCard>
      <p className="text-sm text-muted-foreground">{t("welcome.needInvite")}</p>
      <DemoSignIn />
      <Button variant="ghost" className="h-8 text-xs text-muted-foreground" onClick={() => (location.href = "/api/auth/login")}>{t("welcome.adminSignIn")}</Button>
    </CenterCard>
  );
}
