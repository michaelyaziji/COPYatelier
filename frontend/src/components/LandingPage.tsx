'use client';

import { SignInButton, SignUpButton } from '@clerk/nextjs';
import { Button } from '@/components/ui/button';
import {
  Sparkles,
  PenLine,
  Users,
  MessageSquare,
  FileText,
  ArrowRight,
  CheckCircle2,
  Zap,
  RefreshCw
} from 'lucide-react';

export function LandingPage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-violet-50/50 to-white">
      {/* Header */}
      <header className="border-b border-zinc-200/50 bg-white/80 backdrop-blur-md">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-600 to-violet-500 flex items-center justify-center shadow-lg shadow-violet-500/25">
              <Sparkles className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-zinc-900">Atelier</h1>
              <p className="text-xs text-zinc-500">AI Writing Studio</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <SignInButton mode="modal">
              <Button variant="ghost" size="sm">Sign In</Button>
            </SignInButton>
            <SignUpButton mode="modal">
              <Button size="sm">Get Started Free</Button>
            </SignUpButton>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="max-w-6xl mx-auto px-6 py-20 text-center">
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-violet-100 text-violet-700 text-sm font-medium mb-6">
          <Sparkles className="h-4 w-4" />
          Your AI-powered editorial team
        </div>

        <h1 className="text-5xl font-bold text-zinc-900 mb-6 leading-tight">
          Write better with an<br />
          <span className="text-violet-600">AI editorial team</span> by your side
        </h1>

        <p className="text-xl text-zinc-600 mb-10 max-w-2xl mx-auto leading-relaxed">
          Atelier brings together AI writers and editors who collaborate to refine your documents.
          Like having a professional editorial team, but available whenever you need them.
        </p>

        <div className="flex items-center justify-center gap-4">
          <SignUpButton mode="modal">
            <Button size="lg" className="text-lg px-8 py-6">
              Start Writing Free
              <ArrowRight className="ml-2 h-5 w-5" />
            </Button>
          </SignUpButton>
          <p className="text-sm text-zinc-500">No credit card required</p>
        </div>
      </section>

      {/* How It Works */}
      <section className="bg-white border-y border-zinc-200/50 py-20">
        <div className="max-w-6xl mx-auto px-6">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold text-zinc-900 mb-4">How Atelier Works</h2>
            <p className="text-lg text-zinc-600">Three simple steps to better writing</p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {/* Step 1 */}
            <div className="relative">
              <div className="bg-violet-50 rounded-2xl p-8 h-full">
                <div className="w-12 h-12 rounded-xl bg-violet-600 text-white flex items-center justify-center text-xl font-bold mb-6">
                  1
                </div>
                <div className="flex items-center gap-3 mb-4">
                  <PenLine className="h-6 w-6 text-violet-600" />
                  <h3 className="text-xl font-semibold text-zinc-900">Describe Your Task</h3>
                </div>
                <p className="text-zinc-600 leading-relaxed">
                  Tell us what you want to write. An essay, a report, a blog post - whatever you need.
                  You can also upload reference documents for context.
                </p>
              </div>
              <ArrowRight className="hidden md:block absolute -right-4 top-1/2 -translate-y-1/2 h-8 w-8 text-zinc-300 z-10" />
            </div>

            {/* Step 2 */}
            <div className="relative">
              <div className="bg-emerald-50 rounded-2xl p-8 h-full">
                <div className="w-12 h-12 rounded-xl bg-emerald-600 text-white flex items-center justify-center text-xl font-bold mb-6">
                  2
                </div>
                <div className="flex items-center gap-3 mb-4">
                  <Users className="h-6 w-6 text-emerald-600" />
                  <h3 className="text-xl font-semibold text-zinc-900">Choose Your Team</h3>
                </div>
                <p className="text-zinc-600 leading-relaxed">
                  Pick from different AI editors - a content expert, style editor, or clarity specialist.
                  Each brings a unique perspective to improve your writing.
                </p>
              </div>
              <ArrowRight className="hidden md:block absolute -right-4 top-1/2 -translate-y-1/2 h-8 w-8 text-zinc-300 z-10" />
            </div>

            {/* Step 3 */}
            <div>
              <div className="bg-amber-50 rounded-2xl p-8 h-full">
                <div className="w-12 h-12 rounded-xl bg-amber-600 text-white flex items-center justify-center text-xl font-bold mb-6">
                  3
                </div>
                <div className="flex items-center gap-3 mb-4">
                  <MessageSquare className="h-6 w-6 text-amber-600" />
                  <h3 className="text-xl font-semibold text-zinc-900">Watch Them Collaborate</h3>
                </div>
                <p className="text-zinc-600 leading-relaxed">
                  Your AI writer creates a draft, editors provide feedback, and the writer revises.
                  Multiple rounds of refinement produce polished results.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="py-20">
        <div className="max-w-6xl mx-auto px-6">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold text-zinc-900 mb-4">Everything You Need</h2>
            <p className="text-lg text-zinc-600">Powerful features, friendly experience</p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            <FeatureCard
              icon={<Zap className="h-6 w-6" />}
              title="Real-time Streaming"
              description="Watch your document come to life as AI agents write and revise in real-time."
              color="violet"
            />
            <FeatureCard
              icon={<RefreshCw className="h-6 w-6" />}
              title="Iterative Refinement"
              description="Multiple rounds of writing and editing, just like a real editorial process."
              color="emerald"
            />
            <FeatureCard
              icon={<Users className="h-6 w-6" />}
              title="Multiple AI Models"
              description="Choose from Claude, GPT-4, and Gemini - use the best model for each role."
              color="blue"
            />
            <FeatureCard
              icon={<FileText className="h-6 w-6" />}
              title="Reference Documents"
              description="Upload PDFs, Word docs, or text files to give your AI team context."
              color="amber"
            />
            <FeatureCard
              icon={<CheckCircle2 className="h-6 w-6" />}
              title="Quality Scoring"
              description="Each revision includes self-assessment scores so you can track improvement."
              color="rose"
            />
            <FeatureCard
              icon={<PenLine className="h-6 w-6" />}
              title="Session History"
              description="All your writing sessions saved and organized for easy access."
              color="indigo"
            />
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="bg-gradient-to-br from-violet-600 to-violet-700 py-20">
        <div className="max-w-4xl mx-auto px-6 text-center">
          <h2 className="text-3xl font-bold text-white mb-4">
            Ready to write with your AI editorial team?
          </h2>
          <p className="text-xl text-violet-100 mb-10">
            Start with 20 free credits - no credit card required.
          </p>
          <SignUpButton mode="modal">
            <Button size="lg" variant="secondary" className="text-lg px-8 py-6">
              Get Started Free
              <ArrowRight className="ml-2 h-5 w-5" />
            </Button>
          </SignUpButton>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-zinc-900 text-zinc-400 py-12">
        <div className="max-w-6xl mx-auto px-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-violet-600 flex items-center justify-center">
                <Sparkles className="h-4 w-4 text-white" />
              </div>
              <span className="font-semibold text-white">Atelier</span>
            </div>
            <p className="text-sm">
              &copy; {new Date().getFullYear()} Atelier. All rights reserved.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}

function FeatureCard({
  icon,
  title,
  description,
  color
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  color: 'violet' | 'emerald' | 'blue' | 'amber' | 'rose' | 'indigo';
}) {
  const colorClasses = {
    violet: 'bg-violet-100 text-violet-600',
    emerald: 'bg-emerald-100 text-emerald-600',
    blue: 'bg-blue-100 text-blue-600',
    amber: 'bg-amber-100 text-amber-600',
    rose: 'bg-rose-100 text-rose-600',
    indigo: 'bg-indigo-100 text-indigo-600',
  };

  return (
    <div className="bg-white rounded-xl border border-zinc-200 p-6 hover:shadow-lg hover:border-zinc-300 transition-all">
      <div className={`w-12 h-12 rounded-xl ${colorClasses[color]} flex items-center justify-center mb-4`}>
        {icon}
      </div>
      <h3 className="text-lg font-semibold text-zinc-900 mb-2">{title}</h3>
      <p className="text-zinc-600">{description}</p>
    </div>
  );
}
