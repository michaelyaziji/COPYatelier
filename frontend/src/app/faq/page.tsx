'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Sparkles, HelpCircle, ChevronDown, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { clsx } from 'clsx';

interface FAQItem {
  question: string;
  answer: string;
  category: string;
}

const faqs: FAQItem[] = [
  // Getting Started
  {
    category: 'Getting Started',
    question: 'What is Atelier?',
    answer: 'Atelier is an AI writing studio that uses multiple AI agents working together to help you write, edit, and refine documents. Think of it as having a team of AI writers and editors collaborating on your work, each bringing different perspectives and expertise.',
  },
  {
    category: 'Getting Started',
    question: 'How do I start my first writing session?',
    answer: 'Simply enter your writing prompt or paste your existing text in the input area, choose your workflow (like "Write & Refine" or "Deep Analysis"), and click "Start Session". The AI agents will take turns working on your document, and you can watch their progress in real-time.',
  },
  {
    category: 'Getting Started',
    question: 'What are the different workflow types?',
    answer: 'Atelier offers several workflows: "Write & Refine" for creating new content with iterative improvements, "Deep Analysis" for thorough research and analysis tasks, "Quick Draft" for fast content generation, and more. Each workflow configures the AI agents differently to suit the task.',
  },

  // Agents & Models
  {
    category: 'Agents & Models',
    question: 'What are AI agents?',
    answer: 'AI agents are specialized AI assistants, each with a specific role. The Writer creates initial content, Editors review and improve it from different angles (clarity, structure, style), and the Synthesizer combines all feedback into a final polished version. They work in rounds until your document is refined.',
  },
  {
    category: 'Agents & Models',
    question: 'Can I customize which AI models to use?',
    answer: 'Yes! Click "Choose model & customize" on any agent role to select different AI models. You can mix models from Anthropic (Claude), Google (Gemini), OpenAI (GPT), and Perplexity. Different models have different strengths and credit costs.',
  },
  {
    category: 'Agents & Models',
    question: 'What is the difference between Fast, Balanced, and Deep reasoning?',
    answer: 'Fast reasoning uses efficient models for quick drafts and brainstorming. Balanced reasoning provides a good mix of quality and speed for most tasks. Deep reasoning uses the most powerful models for complex analysis and high-stakes writing, but uses more credits per task.',
  },

  // Credits & Billing
  {
    category: 'Credits & Billing',
    question: 'How do credits work?',
    answer: 'Credits are used each time AI agents process your documents. The amount depends on the model used and the length of the document. Fast models use fewer credits, while Deep reasoning models use more. You can see estimated credit usage before starting a session.',
  },
  {
    category: 'Credits & Billing',
    question: 'Do unused credits roll over?',
    answer: 'Monthly subscription credits reset each billing cycle and do not roll over. However, any credits you purchase separately (top-ups) do not expire and remain in your account until used.',
  },
  {
    category: 'Credits & Billing',
    question: 'Can I get more credits if I run out?',
    answer: 'Starter and Pro subscribers can purchase additional credit packs at any time at their plan\'s rate. Pro subscribers get better per-credit pricing. Free tier users need to upgrade to a paid plan to purchase additional credits.',
  },
  {
    category: 'Credits & Billing',
    question: 'How do I cancel my subscription?',
    answer: 'Go to Settings > Billing and click "Manage Subscription" to access your billing portal. You can cancel anytime, and you\'ll retain access until the end of your current billing period.',
  },

  // Using Atelier
  {
    category: 'Using Atelier',
    question: 'Can I stop a session in progress?',
    answer: 'Yes! Click the "Stop and Get Results" button to end a session early. Any work completed by the agents up to that point will be saved, and you\'ll only be charged for the credits used.',
  },
  {
    category: 'Using Atelier',
    question: 'What if my session gets stuck?',
    answer: 'If a session appears stuck (showing "Agents are writing..." for an extended time), use the "Reset Session" button to return to the draft state. This can happen rarely due to network issues or high server load.',
  },
  {
    category: 'Using Atelier',
    question: 'Can I upload reference documents?',
    answer: 'Yes! You can upload PDF, Word (.docx), or text files as reference materials. The AI agents will consider these documents when writing and editing, helping ensure accuracy and consistency with your source materials.',
  },
  {
    category: 'Using Atelier',
    question: 'How do I export my finished document?',
    answer: 'Click the download button on your completed document to export as Markdown. Starter and Pro subscribers can also export to Word (.docx) format. You can also email the document directly to yourself or others.',
  },

  // Account & Privacy
  {
    category: 'Account & Privacy',
    question: 'Is my writing private?',
    answer: 'Yes, your documents and sessions are private to your account. We do not share your content with other users or use it to train AI models. Your data is stored securely and can be exported or deleted at any time.',
  },
  {
    category: 'Account & Privacy',
    question: 'How do I delete my account?',
    answer: 'Go to Settings and scroll to the bottom to find the account deletion option. This will permanently remove your account and all associated data. Please note this action cannot be undone.',
  },
  {
    category: 'Account & Privacy',
    question: 'Can I export all my data?',
    answer: 'Yes, go to Settings and use the "Export Data" option to download all your sessions, documents, and account information in a portable format (GDPR compliance).',
  },
];

const categories = [...new Set(faqs.map(f => f.category))];

export default function FAQPage() {
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  const filteredFaqs = faqs.filter(faq => {
    const matchesSearch = searchQuery === '' ||
      faq.question.toLowerCase().includes(searchQuery.toLowerCase()) ||
      faq.answer.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = selectedCategory === null || faq.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  const groupedFaqs = categories.reduce((acc, category) => {
    const items = filteredFaqs.filter(f => f.category === category);
    if (items.length > 0) {
      acc[category] = items;
    }
    return acc;
  }, {} as Record<string, FAQItem[]>);

  return (
    <div className="min-h-screen bg-gradient-to-b from-zinc-50 to-white">
      {/* Header */}
      <header className="border-b border-zinc-200/50 bg-white/80 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-4xl mx-auto px-6 py-4">
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

            <Link href="/">
              <Button variant="outline">Back to App</Button>
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <div className="max-w-4xl mx-auto px-6 pt-16 pb-8 text-center">
        <div className="w-16 h-16 rounded-2xl bg-violet-100 flex items-center justify-center mx-auto mb-6">
          <HelpCircle className="h-8 w-8 text-violet-600" />
        </div>
        <h1 className="text-3xl font-bold text-zinc-900 mb-4">Frequently Asked Questions</h1>
        <p className="text-lg text-zinc-600 max-w-xl mx-auto">
          Find answers to common questions about using Atelier
        </p>
      </div>

      {/* Search & Filters */}
      <div className="max-w-4xl mx-auto px-6 pb-8">
        <div className="flex flex-col sm:flex-row gap-4">
          {/* Search */}
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-zinc-400" />
            <input
              type="text"
              placeholder="Search questions..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-zinc-300 focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20 outline-none transition-all"
            />
          </div>

          {/* Category Filter */}
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={() => setSelectedCategory(null)}
              className={clsx(
                'px-3 py-2 rounded-lg text-sm font-medium transition-all',
                selectedCategory === null
                  ? 'bg-violet-100 text-violet-700'
                  : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
              )}
            >
              All
            </button>
            {categories.map(category => (
              <button
                key={category}
                onClick={() => setSelectedCategory(category)}
                className={clsx(
                  'px-3 py-2 rounded-lg text-sm font-medium transition-all',
                  selectedCategory === category
                    ? 'bg-violet-100 text-violet-700'
                    : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
                )}
              >
                {category}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* FAQ List */}
      <div className="max-w-4xl mx-auto px-6 pb-16">
        {Object.keys(groupedFaqs).length === 0 ? (
          <div className="text-center py-12">
            <p className="text-zinc-500">No questions found matching your search.</p>
          </div>
        ) : (
          <div className="space-y-8">
            {Object.entries(groupedFaqs).map(([category, items]) => (
              <div key={category}>
                <h2 className="text-lg font-semibold text-zinc-900 mb-4">{category}</h2>
                <div className="space-y-3">
                  {items.map((faq, index) => {
                    const globalIndex = faqs.indexOf(faq);
                    const isOpen = openIndex === globalIndex;

                    return (
                      <div
                        key={index}
                        className="bg-white rounded-xl border border-zinc-200 overflow-hidden"
                      >
                        <button
                          onClick={() => setOpenIndex(isOpen ? null : globalIndex)}
                          className="w-full flex items-center justify-between p-5 text-left hover:bg-zinc-50 transition-colors"
                        >
                          <span className="font-medium text-zinc-900 pr-4">{faq.question}</span>
                          <ChevronDown
                            className={clsx(
                              'h-5 w-5 text-zinc-400 flex-shrink-0 transition-transform',
                              isOpen && 'rotate-180'
                            )}
                          />
                        </button>
                        {isOpen && (
                          <div className="px-5 pb-5 pt-0">
                            <p className="text-zinc-600 leading-relaxed">{faq.answer}</p>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Still have questions? */}
        <div className="mt-12 p-8 rounded-2xl bg-gradient-to-br from-violet-50 to-violet-100/50 border border-violet-200/50 text-center">
          <h3 className="text-xl font-semibold text-zinc-900 mb-2">Still have questions?</h3>
          <p className="text-zinc-600 mb-6">
            Can&apos;t find what you&apos;re looking for? We&apos;re here to help.
          </p>
          <Link href="/contact">
            <Button>Contact Support</Button>
          </Link>
        </div>
      </div>

      {/* Footer */}
      <footer className="border-t border-zinc-200 bg-white">
        <div className="max-w-4xl mx-auto px-6 py-8">
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
