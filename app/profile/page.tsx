import { Suspense } from "react";
import { ProfileClient } from "@/components/profile-client";

export default function ProfilePage() {
  return (
    <Suspense>
      <ProfileClient />
    </Suspense>
  );
}
