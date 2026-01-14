'use client';

import { useState, useEffect } from 'react';
import { MessageSquarePlus, X, Send, Loader2, CheckCircle, Bug, Lightbulb, HelpCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { clsx } from 'clsx';
import { api } from '@/lib/api';
import { useAuth } from '@clerk/nextjs';

type FeedbackCategory = 'bug' | 'feature' | 'question' | 'other';

interface CategoryOption {
  value: FeedbackCategory;
  label: string;
  icon: React.ReactNode;
  description: string;
}

const categories: CategoryOption[] = [
  { value: 'bug', label: 'Bug Report', icon: <Bug className="h-4 w-4" />, description: 'Something isn\'t working' },
  { value: 'feature', label: 'Feature Request', icon: <Lightbulb className="h-4 w-4" />, description: 'Suggest an improvement' },
  { value: 'question', label: 'Question', icon: <HelpCircle className="h-4 w-4" />, description: 'Need help with something' },
  { value: 'other', label: 'Other', icon: <MessageSquarePlus className="h-4 w-4" />, description: 'General feedback' },
];

export function FeedbackWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const [category, setCategory] = useState<FeedbackCategory | null>(null);
  const [message, setMessage] = useState('');
  const [email, setEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { isSignedIn } = useAuth();

  // Reset form when closing
  useEffect(() => {
    if (!isOpen) {
      // Delay reset to allow animation
      const timer = setTimeout(() => {
        if (!isOpen) {
          setCategory(null);
          setMessage('');
          setEmail('');
          setSubmitted(false);
          setError(null);
        }
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!category || !message.trim()) return;

    setIsSubmitting(true);
    setError(null);

    try {
      await api.submitFeedback({
        category,
        message: message.trim(),
        email: !isSignedIn && email ? email : undefined,
      });
      setSubmitted(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send feedback. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      {/* Floating Button */}
      <button
        onClick={() => setIsOpen(true)}
        className={clsx(
          'fixed bottom-6 right-6 z-40 flex items-center gap-2 px-4 py-3 rounded-full',
          'bg-violet-600 text-white shadow-lg shadow-violet-500/30',
          'hover:bg-violet-700 hover:shadow-xl hover:shadow-violet-500/40',
          'transition-all duration-200',
          isOpen && 'opacity-0 pointer-events-none'
        )}
      >
        <MessageSquarePlus className="h-5 w-5" />
        <span className="font-medium text-sm">Feedback</span>
      </button>

      {/* Modal Overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/20 backdrop-blur-sm"
          onClick={() => setIsOpen(false)}
        />
      )}

      {/* Modal */}
      <div
        className={clsx(
          'fixed bottom-6 right-6 z-50 w-96 max-w-[calc(100vw-3rem)]',
          'bg-white rounded-2xl shadow-2xl border border-zinc-200',
          'transform transition-all duration-200',
          isOpen
            ? 'opacity-100 translate-y-0 scale-100'
            : 'opacity-0 translate-y-4 scale-95 pointer-events-none'
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-zinc-100">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-violet-100 flex items-center justify-center">
              <MessageSquarePlus className="h-4 w-4 text-violet-600" />
            </div>
            <h3 className="font-semibold text-zinc-900">Send Feedback</h3>
          </div>
          <button
            onClick={() => setIsOpen(false)}
            className="p-1.5 rounded-lg hover:bg-zinc-100 transition-colors"
          >
            <X className="h-5 w-5 text-zinc-400" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4">
          {submitted ? (
            <div className="text-center py-6">
              <div className="w-12 h-12 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-3">
                <CheckCircle className="h-6 w-6 text-emerald-600" />
              </div>
              <h4 className="font-semibold text-zinc-900 mb-1">Thank you!</h4>
              <p className="text-sm text-zinc-600 mb-4">
                Your feedback has been sent. We appreciate you taking the time to help us improve.
              </p>
              <Button variant="outline" size="sm" onClick={() => setIsOpen(false)}>
                Close
              </Button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Category Selection */}
              {!category ? (
                <div className="space-y-2">
                  <p className="text-sm text-zinc-600 mb-3">What type of feedback do you have?</p>
                  {categories.map((cat) => (
                    <button
                      key={cat.value}
                      type="button"
                      onClick={() => setCategory(cat.value)}
                      className="w-full flex items-center gap-3 p-3 rounded-xl border border-zinc-200 hover:border-violet-300 hover:bg-violet-50 transition-all text-left group"
                    >
                      <div className="w-10 h-10 rounded-lg bg-zinc-100 group-hover:bg-violet-100 flex items-center justify-center transition-colors">
                        <span className="text-zinc-600 group-hover:text-violet-600">{cat.icon}</span>
                      </div>
                      <div>
                        <p className="font-medium text-zinc-900 text-sm">{cat.label}</p>
                        <p className="text-xs text-zinc-500">{cat.description}</p>
                      </div>
                    </button>
                  ))}
                </div>
              ) : (
                <>
                  {/* Selected Category */}
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setCategory(null)}
                      className="text-xs text-violet-600 hover:underline"
                    >
                      &larr; Change type
                    </button>
                    <span className="text-xs text-zinc-400">|</span>
                    <span className="text-xs text-zinc-600">
                      {categories.find(c => c.value === category)?.label}
                    </span>
                  </div>

                  {/* Message */}
                  <div>
                    <label htmlFor="feedback-message" className="block text-sm font-medium text-zinc-700 mb-1.5">
                      Your feedback
                    </label>
                    <textarea
                      id="feedback-message"
                      required
                      rows={4}
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                      placeholder={
                        category === 'bug' ? 'Please describe what happened and what you expected...' :
                        category === 'feature' ? 'Describe the feature you\'d like to see...' :
                        category === 'question' ? 'What would you like help with?' :
                        'Share your thoughts...'
                      }
                      className="w-full px-3 py-2 rounded-lg border border-zinc-300 focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20 outline-none transition-all resize-none text-sm"
                    />
                  </div>

                  {/* Email (only for non-signed-in users) */}
                  {!isSignedIn && (
                    <div>
                      <label htmlFor="feedback-email" className="block text-sm font-medium text-zinc-700 mb-1.5">
                        Email <span className="text-zinc-400 font-normal">(optional, for follow-up)</span>
                      </label>
                      <input
                        type="email"
                        id="feedback-email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="you@example.com"
                        className="w-full px-3 py-2 rounded-lg border border-zinc-300 focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20 outline-none transition-all text-sm"
                      />
                    </div>
                  )}

                  {/* Error */}
                  {error && (
                    <div className="p-2 rounded-lg bg-red-50 border border-red-200 text-red-700 text-xs">
                      {error}
                    </div>
                  )}

                  {/* Submit */}
                  <Button
                    type="submit"
                    className="w-full"
                    disabled={isSubmitting || !message.trim()}
                  >
                    {isSubmitting ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                        Sending...
                      </>
                    ) : (
                      <>
                        <Send className="h-4 w-4 mr-2" />
                        Send Feedback
                      </>
                    )}
                  </Button>
                </>
              )}
            </form>
          )}
        </div>
      </div>
    </>
  );
}
