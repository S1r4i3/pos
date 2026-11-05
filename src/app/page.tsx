import { redirect } from "next/navigation";

// The home page simply forwards: logged-in users → dashboard,
// everyone else is sent to /login by src/proxy.ts first.
export default function Home() {
  redirect("/dashboard");
}
