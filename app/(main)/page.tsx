import { redirect } from "next/navigation";

/** Show night is the primary entry — one place to go live. */
export default function Home() {
  redirect("/show");
}
