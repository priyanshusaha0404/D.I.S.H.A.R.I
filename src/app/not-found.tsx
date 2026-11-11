import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-3 p-6 text-center">
      <p className="text-5xl font-extrabold text-accent">404</p>
      <p className="text-sm text-muted">This page does not exist. · এই পাতাটি নেই।</p>
      <Link href="/" className="btn-primary">D.I.S.H.A.R.I — Map · মানচিত্র</Link>
    </div>
  );
}
