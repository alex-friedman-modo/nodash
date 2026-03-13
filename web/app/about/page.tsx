import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export const metadata = {
  title: "About nodash — Why We Built This",
  description:
    "DoorDash takes up to 30% from NYC restaurants. nodash is a free directory of 3,000+ restaurants that deliver direct.",
};

export default function AboutPage() {
  return (
    <main className="min-h-screen bg-[var(--background)] text-[#1a1a1a]">
      <div className="max-w-2xl mx-auto px-4 py-8">
        <Link
          href="/"
          className="inline-flex items-center gap-1 text-sm text-[var(--muted)] hover:text-[#1a1a1a] mb-8"
        >
          <ArrowLeft className="w-4 h-4" /> Back to directory
        </Link>

        <h1 className="text-3xl md:text-4xl font-bold mb-8">About nodash</h1>

        <div className="prose max-w-none space-y-6 text-[#1a1a1a] leading-relaxed">
          <p className="text-lg font-medium">
            Here&apos;s a number that should piss you off: 30%.
          </p>

          <p>
            That&apos;s the cut DoorDash, Uber Eats, and Grubhub take from your neighborhood
            restaurant on every order. Not 30% of profit — 30% of the total. On a $40 order, the
            restaurant might see $28. After food costs, labor, rent? They&apos;re basically paying
            for the privilege of cooking your pad thai.
          </p>

          <p>
            And you&apos;re not saving money either. You&apos;re paying a delivery fee, a service
            fee, a &quot;small order&quot; fee, and a tip — which, by the way, sometimes
            doesn&apos;t even go to the driver.
          </p>

          <p>We built nodash because we got tired of it.</p>

          <p>
            Not tired in a vague, &quot;someone should do something&quot; way. Tired in a &quot;we
            live in New York, we order food four times a week, and we realized we were actively
            participating in a system that&apos;s bleeding our favorite restaurants dry&quot; way.
          </p>

          <p>
            So we did something pretty simple: we started checking restaurants. We asked one
            question — do you deliver direct? If the answer was yes, we wrote down how. Phone call?
            Their own website? Toast? Slice? A guy named Mike on a bicycle? Whatever it is, we
            listed it.
          </p>

          <p className="font-medium">
            Three thousand and sixty-seven restaurants later, here we are.
          </p>

          <p>
            nodash is a directory. That&apos;s it. You search by neighborhood, you find restaurants
            that deliver without a middleman, you see the delivery fee, the minimum order, and the
            phone number. Then you order however they want you to order. We don&apos;t process
            payments. We don&apos;t take a cut. We don&apos;t have an app, and we&apos;re not going
            to build one.
          </p>

          <p>
            This is not a startup. Nobody&apos;s trying to &quot;disrupt&quot; delivery. The
            restaurants already figured out delivery — they&apos;ve been doing it since before Travis
            Kalanick learned to spell &quot;independent contractor.&quot; They just need people to
            find them without going through an app that charges everyone on both sides of the
            transaction.
          </p>

          <p>
            Every restaurant on nodash is listed for free. If you run a restaurant in NYC and you
            deliver direct, you should be on here. If you&apos;re a person who eats food and lives
            in New York, you should be using this instead of giving 30% of your dinner to a company
            that&apos;s never turned a profit.
          </p>

          <p className="text-lg text-[var(--accent)] font-semibold">
            Order direct. Skip the cut. It&apos;s not complicated.
          </p>
        </div>

        <div className="mt-12 pt-8 border-t border-[var(--card-border)]">
          <h2 className="font-semibold text-lg mb-4">Get in touch</h2>
          <p className="text-[var(--muted)] text-sm mb-4">
            Run a restaurant that delivers direct?{" "}
            <a
              href="mailto:afriedman1997@gmail.com?subject=List my restaurant on nodash"
              className="text-[var(--accent)] hover:underline"
            >
              Get listed for free.
            </a>
          </p>
          <p className="text-[var(--muted)] text-sm">
            See something wrong?{" "}
            <a
              href="mailto:afriedman1997@gmail.com?subject=nodash correction"
              className="text-[var(--accent)] hover:underline"
            >
              Let us know.
            </a>
          </p>
        </div>
      </div>
    </main>
  );
}
