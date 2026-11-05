import { signOut } from "../actions";
import { Button } from "@/components/ui/button";

export const metadata = { title: "No outlet access" };

export default function NoAccessPage() {
  return (
    <div className="space-y-4 text-center">
      <h1 className="text-xl font-semibold">No outlet assigned</h1>
      <p className="text-sm text-muted">
        Your account isn&apos;t linked to any active outlet yet. Ask the owner or manager to assign you to an outlet,
        then log in again.
      </p>
      <form action={signOut}>
        <Button type="submit" variant="secondary" className="w-full">
          Log out
        </Button>
      </form>
    </div>
  );
}
