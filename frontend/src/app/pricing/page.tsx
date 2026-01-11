'use client';

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { SignInButton, SignedIn, SignedOut, useAuth } from '@clerk/nextjs';
import { Check, Sparkles, Zap, Crown, ArrowLeft, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { clsx } from 'clsx';
import { api } from '@/lib/api';
import { Subscription } from '@/types';

interface PricingTier {
  name: string;
  price: number;
  credits: number;
  description: string;
  features: string[];
  highlighted?: boolean;
  icon: React.ReactNode;
  ctaText: string;
}

const tiers: PricingTier[] = [
  {
    name: 'Free',
    price: 0,
    credits: 20,
    description: 'Perfect for trying out Atelier',
    icon: <Sparkles className="h-6 w-6" />,
    ctaText: 'Get Started',
    features: [
      '20 credits per month',
      'All AI models (Haiku, Sonnet, Opus)',
      'Up to 4 agents per session',
      'Basic workflow templates',
      'Export to Markdown',
    ],
  },
  {
    name: 'Starter',
    price: 15,
    credits: 150,
    description: 'For regular writers and content creators',
    icon: <Zap className="h-6 w-6" />,
    ctaText: 'Subscribe',
    highlighted: true,
    features: [
      '150 credits per month',
      'All AI models (Haiku, Sonnet, Opus)',
      'Up to 4 agents per session',
      'All workflow templates',
      'Export to Word & PDF',
      'Session history (90 days)',
      'Priority support',
    ],
  },
  {
    name: 'Pro',
    price: 30,
    credits: 500,
    description: 'For power users and teams',
    icon: <Crown className="h-6 w-6" />,
    ctaText: 'Subscribe',
    features: [
      '500 credits per month',
      'All AI models (Haiku, Sonnet, Opus)',
      'Up to 4 agents per session',
      'All workflow templates',
      'Export to all formats',
      'Unlimited session history',
      'Priority support',
      'Custom agent presets',
      'API access (coming soon)',
    ],
  },
];

const creditExamples = [
  { task: 'Short blog post (500 words)', haiku: 3, sonnet: 6, opus: 12 },
  { task: 'Long article (2,000 words)', haiku: 6, sonnet: 12, opus: 24 },
  { task: 'Book chapter (4,000 words)', haiku: 12, sonnet: 24, opus: 48 },
  { task: 'Full report (8,000 words)', haiku: 20, sonnet: 40, opus: 80 },
];

// Credit top-up packs by tier
const creditPacks = {
  starter: [
    { credits: 50, price: 5 },
    { credits: 100, price: 10 },
    { credits: 200, price: 20 },
  ],
  pro: [
    { credits: 100, price: 6 },
    { credits: 250, price: 15 },
    { credits: 500, price: 30 },
  ],
};

export default function PricingPage() {
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'yearly'>('monthly');
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [loadingTier, setLoadingTier] = useState<string | null>(null);
  const [loadingCredits, setLoadingCredits] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { isSignedIn } = useAuth();
  const searchParams = useSearchParams();

  // Check for success/canceled params
  useEffect(() => {
    const success = searchParams.get('success');
    const canceled = searchParams.get('canceled');
    const creditsSuccess = searchParams.get('credits_success');
    const creditsCanceled = searchParams.get('credits_canceled');

    if (success === 'true') {
      // Subscription successful - show a message or redirect
      setError(null);
    } else if (canceled === 'true') {
      setError('Subscription checkout was cancelled.');
    } else if (creditsSuccess === 'true') {
      setError(null);
    } else if (creditsCanceled === 'true') {
      setError('Credit purchase was cancelled.');
    }
  }, [searchParams]);

  // Fetch current subscription
  useEffect(() => {
    if (isSignedIn) {
      api.getSubscription()
        .then(setSubscription)
        .catch(() => {
          // User might not have a subscription yet
        });
    }
  }, [isSignedIn]);

  const handleSubscribe = async (tier: 'starter' | 'pro') => {
    if (!isSignedIn) return;

    setLoadingTier(tier);
    setError(null);

    try {
      const response = await api.createCheckout(tier, billingCycle === 'yearly');
      // Redirect to Stripe checkout
      window.location.href = response.checkout_url;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start checkout');
      setLoadingTier(null);
    }
  };

  const handleBuyCredits = async (credits: number) => {
    if (!isSignedIn) return;

    setLoadingCredits(credits);
    setError(null);

    try {
      const response = await api.createCreditCheckout(credits);
      // Redirect to Stripe checkout
      window.location.href = response.checkout_url;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start credit purchase');
      setLoadingCredits(null);
    }
  };

  const isCurrentTier = (tierName: string) => {
    if (!subscription) return tierName.toLowerCase() === 'free';
    return subscription.tier === tierName.toLowerCase();
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-zinc-50 to-white">
      {/* Header */}
      <header className="border-b border-zinc-200/50 bg-white/80 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <Link href="/" className="flex items-center gap-3 group">
              <ArrowLeft className="h-4 w-4 text-zinc-400 group-hover:text-zinc-600 transition-colors" />
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-600 to-violet-500 flex items-center justify-center shadow-lg shadow-violet-500/25">
                <Sparkles className="h-5 w-5 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-zinc-900">Atelier</h1>
                <p className="text-xs text-zinc-500">AI Writing Studio</p>
              </div>
            </Link>

            <div className="flex items-center gap-4">
              <SignedOut>
                <SignInButton mode="modal">
                  <Button variant="outline">Sign In</Button>
                </SignInButton>
              </SignedOut>
              <SignedIn>
                <Link href="/">
                  <Button>Go to App</Button>
                </Link>
              </SignedIn>
            </div>
          </div>
        </div>
      </header>

      {/* Error/Success Banner */}
      {error && (
        <div className="bg-red-50 border-b border-red-200">
          <div className="max-w-6xl mx-auto px-6 py-3 text-center text-red-700">
            {error}
          </div>
        </div>
      )}
      {searchParams.get('success') === 'true' && (
        <div className="bg-emerald-50 border-b border-emerald-200">
          <div className="max-w-6xl mx-auto px-6 py-3 text-center text-emerald-700">
            Subscription activated successfully! You can now access your new features.
          </div>
        </div>
      )}
      {searchParams.get('credits_success') === 'true' && (
        <div className="bg-emerald-50 border-b border-emerald-200">
          <div className="max-w-6xl mx-auto px-6 py-3 text-center text-emerald-700">
            Credits purchased successfully! Your balance has been updated.
          </div>
        </div>
      )}

      {/* Hero */}
      <div className="max-w-6xl mx-auto px-6 pt-16 pb-12 text-center">
        <h1 className="text-4xl md:text-5xl font-bold text-zinc-900 mb-4">
          Simple, transparent pricing
        </h1>
        <p className="text-xl text-zinc-600 max-w-2xl mx-auto">
          Choose the plan that fits your writing needs. All plans include access to every AI model.
        </p>

        {/* Billing Toggle */}
        <div className="mt-8 inline-flex items-center gap-3 p-1 bg-zinc-100 rounded-full">
          <button
            onClick={() => setBillingCycle('monthly')}
            className={clsx(
              'px-4 py-2 rounded-full text-sm font-medium transition-all',
              billingCycle === 'monthly'
                ? 'bg-white text-zinc-900 shadow-sm'
                : 'text-zinc-600 hover:text-zinc-900'
            )}
          >
            Monthly
          </button>
          <button
            onClick={() => setBillingCycle('yearly')}
            className={clsx(
              'px-4 py-2 rounded-full text-sm font-medium transition-all',
              billingCycle === 'yearly'
                ? 'bg-white text-zinc-900 shadow-sm'
                : 'text-zinc-600 hover:text-zinc-900'
            )}
          >
            Yearly
            <span className="ml-1.5 text-xs text-emerald-600 font-semibold">Save 20%</span>
          </button>
        </div>
      </div>

      {/* Pricing Cards */}
      <div className="max-w-6xl mx-auto px-6 pb-16">
        <div className="grid md:grid-cols-3 gap-8">
          {tiers.map((tier) => {
            const yearlyPrice = Math.round(tier.price * 12 * 0.8);
            const displayPrice = billingCycle === 'yearly' && tier.price > 0
              ? Math.round(yearlyPrice / 12)
              : tier.price;

            return (
              <div
                key={tier.name}
                className={clsx(
                  'relative rounded-2xl p-8 transition-all',
                  tier.highlighted
                    ? 'bg-gradient-to-b from-violet-600 to-violet-700 text-white shadow-xl shadow-violet-500/25 scale-105'
                    : 'bg-white border border-zinc-200 hover:border-zinc-300 hover:shadow-lg'
                )}
              >
                {tier.highlighted && (
                  <div className="absolute -top-4 left-1/2 -translate-x-1/2">
                    <span className="bg-amber-400 text-amber-900 text-xs font-bold px-3 py-1 rounded-full">
                      MOST POPULAR
                    </span>
                  </div>
                )}

                <div className={clsx(
                  'w-12 h-12 rounded-xl flex items-center justify-center mb-4',
                  tier.highlighted
                    ? 'bg-white/20'
                    : 'bg-violet-100 text-violet-600'
                )}>
                  {tier.icon}
                </div>

                <h3 className={clsx(
                  'text-xl font-bold mb-1',
                  tier.highlighted ? 'text-white' : 'text-zinc-900'
                )}>
                  {tier.name}
                </h3>

                <p className={clsx(
                  'text-sm mb-6',
                  tier.highlighted ? 'text-violet-200' : 'text-zinc-500'
                )}>
                  {tier.description}
                </p>

                <div className="mb-6">
                  <span className={clsx(
                    'text-4xl font-bold',
                    tier.highlighted ? 'text-white' : 'text-zinc-900'
                  )}>
                    ${displayPrice}
                  </span>
                  {tier.price > 0 && (
                    <span className={clsx(
                      'text-sm ml-1',
                      tier.highlighted ? 'text-violet-200' : 'text-zinc-500'
                    )}>
                      /month
                    </span>
                  )}
                  {billingCycle === 'yearly' && tier.price > 0 && (
                    <div className={clsx(
                      'text-sm mt-1',
                      tier.highlighted ? 'text-violet-200' : 'text-zinc-500'
                    )}>
                      ${yearlyPrice} billed yearly
                    </div>
                  )}
                </div>

                <div className={clsx(
                  'inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium mb-6',
                  tier.highlighted
                    ? 'bg-white/20 text-white'
                    : 'bg-violet-100 text-violet-700'
                )}>
                  <Zap className="h-4 w-4" />
                  {tier.credits} credits/month
                </div>

                <SignedOut>
                  <SignInButton mode="modal">
                    <Button
                      className={clsx(
                        'w-full mb-6',
                        tier.highlighted
                          ? 'bg-white text-violet-700 hover:bg-violet-50'
                          : ''
                      )}
                      variant={tier.highlighted ? 'primary' : 'outline'}
                      size="lg"
                    >
                      {tier.ctaText}
                    </Button>
                  </SignInButton>
                </SignedOut>

                <SignedIn>
                  <Button
                    className={clsx(
                      'w-full mb-6',
                      tier.highlighted
                        ? 'bg-white text-violet-700 hover:bg-violet-50'
                        : ''
                    )}
                    variant={tier.highlighted ? 'primary' : 'outline'}
                    size="lg"
                    disabled={isCurrentTier(tier.name) || loadingTier !== null}
                    onClick={() => {
                      if (tier.price > 0 && !isCurrentTier(tier.name)) {
                        handleSubscribe(tier.name.toLowerCase() as 'starter' | 'pro');
                      }
                    }}
                  >
                    {loadingTier === tier.name.toLowerCase() ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                        Loading...
                      </>
                    ) : isCurrentTier(tier.name) ? (
                      'Current Plan'
                    ) : tier.price === 0 ? (
                      'Free Tier'
                    ) : (
                      tier.ctaText
                    )}
                  </Button>
                </SignedIn>

                <ul className="space-y-3">
                  {tier.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-3">
                      <Check className={clsx(
                        'h-5 w-5 flex-shrink-0 mt-0.5',
                        tier.highlighted ? 'text-violet-200' : 'text-emerald-500'
                      )} />
                      <span className={clsx(
                        'text-sm',
                        tier.highlighted ? 'text-violet-100' : 'text-zinc-600'
                      )}>
                        {feature}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      </div>

      {/* Credit Top-ups Section */}
      <div className="max-w-6xl mx-auto px-6 py-16">
        <h2 className="text-2xl font-bold text-zinc-900 text-center mb-2">
          Need more credits?
        </h2>
        <p className="text-zinc-600 text-center mb-10 max-w-2xl mx-auto">
          Run out of monthly credits? Buy more at your plan&apos;s rate.
          Pro subscribers get the best per-credit pricing.
        </p>

        <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto">
          {/* Starter Top-ups */}
          <div className="bg-white rounded-2xl border border-zinc-200 p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-violet-100 flex items-center justify-center">
                <Zap className="h-5 w-5 text-violet-600" />
              </div>
              <div>
                <h3 className="font-semibold text-zinc-900">Starter Top-ups</h3>
                <p className="text-sm text-zinc-500">$0.10 per credit</p>
              </div>
            </div>
            <div className="space-y-3">
              {creditPacks.starter.map((pack) => {
                const canBuy = subscription?.tier === 'starter';
                return (
                  <button
                    key={pack.credits}
                    disabled={!canBuy || loadingCredits !== null}
                    onClick={() => canBuy && handleBuyCredits(pack.credits)}
                    className={clsx(
                      "w-full flex items-center justify-between p-3 rounded-xl border transition-all group",
                      canBuy
                        ? "border-zinc-200 hover:border-violet-300 hover:bg-violet-50 cursor-pointer"
                        : "border-zinc-100 bg-zinc-50 cursor-not-allowed opacity-60"
                    )}
                  >
                    <span className={clsx(
                      "font-medium",
                      canBuy ? "text-zinc-900 group-hover:text-violet-700" : "text-zinc-500"
                    )}>
                      {loadingCredits === pack.credits ? (
                        <span className="flex items-center gap-2">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Loading...
                        </span>
                      ) : (
                        `${pack.credits} credits`
                      )}
                    </span>
                    <span className={clsx(
                      "text-sm font-semibold",
                      canBuy ? "text-violet-600" : "text-zinc-400"
                    )}>
                      ${pack.price}
                    </span>
                  </button>
                );
              })}
            </div>
            {subscription?.tier !== 'starter' && (
              <p className="text-xs text-zinc-500 mt-3 text-center">
                {subscription?.tier === 'pro' ? 'You have Pro pricing - use Pro top-ups instead' : 'Subscribe to Starter to buy credits'}
              </p>
            )}
          </div>

          {/* Pro Top-ups */}
          <div className="bg-gradient-to-b from-violet-600 to-violet-700 rounded-2xl p-6 text-white">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center">
                <Crown className="h-5 w-5 text-white" />
              </div>
              <div>
                <h3 className="font-semibold">Pro Top-ups</h3>
                <p className="text-sm text-violet-200">$0.06 per credit (40% savings)</p>
              </div>
            </div>
            <div className="space-y-3">
              {creditPacks.pro.map((pack) => {
                const canBuy = subscription?.tier === 'pro';
                return (
                  <button
                    key={pack.credits}
                    disabled={!canBuy || loadingCredits !== null}
                    onClick={() => canBuy && handleBuyCredits(pack.credits)}
                    className={clsx(
                      "w-full flex items-center justify-between p-3 rounded-xl transition-all",
                      canBuy
                        ? "bg-white/10 hover:bg-white/20 cursor-pointer"
                        : "bg-white/5 cursor-not-allowed opacity-60"
                    )}
                  >
                    <span className="font-medium">
                      {loadingCredits === pack.credits ? (
                        <span className="flex items-center gap-2">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Loading...
                        </span>
                      ) : (
                        `${pack.credits} credits`
                      )}
                    </span>
                    <span className={clsx(
                      "text-sm font-semibold",
                      canBuy ? "text-violet-200" : "text-violet-300/50"
                    )}>
                      ${pack.price}
                    </span>
                  </button>
                );
              })}
            </div>
            {subscription?.tier !== 'pro' && (
              <p className="text-xs text-violet-200/70 mt-3 text-center">
                Subscribe to Pro to unlock these rates
              </p>
            )}
          </div>
        </div>

        <p className="text-center text-sm text-zinc-500 mt-6">
          Free tier users: upgrade to Starter or Pro to purchase additional credits.
        </p>
      </div>

      {/* Credit Usage Examples */}
      <div className="bg-zinc-50 border-t border-zinc-200">
        <div className="max-w-6xl mx-auto px-6 py-16">
          <h2 className="text-2xl font-bold text-zinc-900 text-center mb-2">
            How far do credits go?
          </h2>
          <p className="text-zinc-600 text-center mb-10 max-w-2xl mx-auto">
            Credits vary by AI model. Haiku is most economical, Opus is most powerful.
            Estimates assume 3 rounds with 4 agents.
          </p>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-zinc-200">
                  <th className="text-left py-3 px-4 text-sm font-semibold text-zinc-900">Writing Task</th>
                  <th className="text-center py-3 px-4 text-sm font-semibold text-zinc-900">
                    <span className="inline-flex items-center gap-1.5">
                      Haiku
                      <span className="text-xs font-normal text-zinc-500">(fast)</span>
                    </span>
                  </th>
                  <th className="text-center py-3 px-4 text-sm font-semibold text-zinc-900">
                    <span className="inline-flex items-center gap-1.5">
                      Sonnet
                      <span className="text-xs font-normal text-zinc-500">(balanced)</span>
                    </span>
                  </th>
                  <th className="text-center py-3 px-4 text-sm font-semibold text-zinc-900">
                    <span className="inline-flex items-center gap-1.5">
                      Opus
                      <span className="text-xs font-normal text-zinc-500">(powerful)</span>
                    </span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {creditExamples.map((example) => (
                  <tr key={example.task} className="border-b border-zinc-100">
                    <td className="py-4 px-4 text-sm text-zinc-700">{example.task}</td>
                    <td className="py-4 px-4 text-center">
                      <span className="inline-flex items-center gap-1 text-sm font-medium text-emerald-600">
                        {example.haiku} credits
                      </span>
                    </td>
                    <td className="py-4 px-4 text-center">
                      <span className="inline-flex items-center gap-1 text-sm font-medium text-violet-600">
                        {example.sonnet} credits
                      </span>
                    </td>
                    <td className="py-4 px-4 text-center">
                      <span className="inline-flex items-center gap-1 text-sm font-medium text-amber-600">
                        {example.opus} credits
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="text-center text-sm text-zinc-500 mt-6">
            Mix and match models in your workflow. Use Haiku for quick drafts, Opus for final polish.
          </p>
        </div>
      </div>

      {/* FAQ */}
      <div className="max-w-3xl mx-auto px-6 py-16">
        <h2 className="text-2xl font-bold text-zinc-900 text-center mb-10">
          Frequently Asked Questions
        </h2>

        <div className="space-y-6">
          <div>
            <h3 className="font-semibold text-zinc-900 mb-2">What happens if I run out of credits?</h3>
            <p className="text-zinc-600">
              Starter and Pro subscribers can purchase additional credit packs at their plan&apos;s rate anytime.
              Free tier users can upgrade to continue using Atelier immediately.
            </p>
          </div>

          <div>
            <h3 className="font-semibold text-zinc-900 mb-2">Do unused credits roll over?</h3>
            <p className="text-zinc-600">
              Credits reset each month and don&apos;t roll over. Use them or lose them!
            </p>
          </div>

          <div>
            <h3 className="font-semibold text-zinc-900 mb-2">Can I change plans anytime?</h3>
            <p className="text-zinc-600">
              Yes! Upgrade or downgrade at any time. When upgrading, you&apos;ll get the new credits immediately. When downgrading, the change takes effect at your next billing cycle.
            </p>
          </div>

          <div>
            <h3 className="font-semibold text-zinc-900 mb-2">Which AI model should I use?</h3>
            <p className="text-zinc-600">
              <strong>Haiku</strong> is fast and economical - great for brainstorming and quick drafts.
              <strong> Sonnet</strong> offers the best balance of quality and cost.
              <strong> Opus</strong> produces the highest quality output for important work.
            </p>
          </div>
        </div>
      </div>

      {/* CTA */}
      <div className="bg-gradient-to-r from-violet-600 to-violet-700 text-white">
        <div className="max-w-6xl mx-auto px-6 py-16 text-center">
          <h2 className="text-3xl font-bold mb-4">Ready to transform your writing?</h2>
          <p className="text-violet-200 mb-8 max-w-xl mx-auto">
            Start with 20 free credits. No credit card required.
          </p>
          <SignedOut>
            <SignInButton mode="modal">
              <Button size="lg" className="bg-white text-violet-700 hover:bg-violet-50">
                Get Started Free
              </Button>
            </SignInButton>
          </SignedOut>
          <SignedIn>
            <Link href="/">
              <Button size="lg" className="bg-white text-violet-700 hover:bg-violet-50">
                Go to App
              </Button>
            </Link>
          </SignedIn>
        </div>
      </div>

      {/* Footer */}
      <footer className="border-t border-zinc-200 bg-white">
        <div className="max-w-6xl mx-auto px-6 py-8">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-600 to-violet-500 flex items-center justify-center">
                <Sparkles className="h-4 w-4 text-white" />
              </div>
              <span className="font-semibold text-zinc-900">Atelier</span>
            </div>
            <p className="text-sm text-zinc-500">
              &copy; {new Date().getFullYear()} Atelier. All rights reserved.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
