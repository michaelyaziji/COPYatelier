'use client';

import { useState } from 'react';
import { Lightbulb, X } from 'lucide-react';
import { Modal } from '@/components/ui/modal';

interface ModelGuidanceModalProps {
  className?: string;
}

export function ModelGuidanceModal({ className }: ModelGuidanceModalProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      {/* Trigger Button */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setIsOpen(true);
        }}
        className={`p-1.5 rounded-lg text-zinc-400 hover:text-amber-500 hover:bg-amber-50 transition-colors cursor-pointer ${className}`}
        aria-label="Model selection guidance"
      >
        <Lightbulb className="w-4 h-4" />
      </button>

      {/* Modal */}
      <Modal
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        title="Choosing a Model"
        size="lg"
        footer={
          <button
            onClick={() => setIsOpen(false)}
            className="px-4 py-2 text-sm font-medium text-zinc-700 hover:text-zinc-900 hover:bg-zinc-100 rounded-lg transition-colors"
          >
            Got it
          </button>
        }
      >
        <div className="space-y-5 max-h-[60vh] overflow-y-auto">
          {/* Section 1: Cost/Quality Tiers */}
          <div>
            <h3 className="text-sm font-semibold text-zinc-900 mb-3">Cost & Quality Tiers</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-200">
                    <th className="text-left py-2 pr-3 font-medium text-zinc-700">Tier</th>
                    <th className="text-left py-2 pr-3 font-medium text-zinc-700">Models</th>
                    <th className="text-left py-2 font-medium text-zinc-700">Best For</th>
                  </tr>
                </thead>
                <tbody className="text-zinc-600">
                  <tr className="border-b border-zinc-100">
                    <td className="py-2.5 pr-3 align-top">
                      <span className="inline-flex items-center gap-1 text-amber-600 font-medium">
                        $$ Premium
                      </span>
                    </td>
                    <td className="py-2.5 pr-3 align-top">
                      <span className="text-zinc-700">Claude Opus 4, Claude Sonnet 4 (Thinking), o1, Gemini 2.5 Pro, Sonar Pro, Sonar Reasoning</span>
                    </td>
                    <td className="py-2.5 align-top text-zinc-700">Writer, complex analysis, deep reasoning</td>
                  </tr>
                  <tr className="border-b border-zinc-100">
                    <td className="py-2.5 pr-3 align-top">
                      <span className="inline-flex items-center gap-1 text-emerald-600 font-medium">
                        $ Standard
                      </span>
                    </td>
                    <td className="py-2.5 pr-3 align-top">
                      <span className="text-zinc-700">Claude Sonnet 4, GPT-4o, o1 Mini, o3 Mini, Sonar</span>
                    </td>
                    <td className="py-2.5 align-top text-zinc-700">All-around default</td>
                  </tr>
                  <tr>
                    <td className="py-2.5 pr-3 align-top">
                      <span className="inline-flex items-center gap-1 text-blue-600 font-medium">
                        $ Fast
                      </span>
                    </td>
                    <td className="py-2.5 pr-3 align-top">
                      <span className="text-zinc-700">GPT-4o Mini, Gemini 2.5 Flash, Gemini 2.0 Flash</span>
                    </td>
                    <td className="py-2.5 align-top text-zinc-700">Fact Checker, simple edits, budget runs</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Section 2: Provider Characteristics */}
          <div>
            <h3 className="text-sm font-semibold text-zinc-900 mb-3">Provider Characteristics</h3>
            <ul className="space-y-2 text-sm text-zinc-700">
              <li className="flex gap-2">
                <span className="font-medium text-violet-600 shrink-0">Claude</span>
                <span className="text-zinc-600">— Known for stylish, nuanced writing. Knowledge not always current.</span>
              </li>
              <li className="flex gap-2">
                <span className="font-medium text-emerald-600 shrink-0">OpenAI</span>
                <span className="text-zinc-600">— Solid all-around, up to date. Can lean toward bullet points and lists. o1/o3 models are reasoning-focused.</span>
              </li>
              <li className="flex gap-2">
                <span className="font-medium text-blue-600 shrink-0">Gemini</span>
                <span className="text-zinc-600">— Solid all-around, up to date. Can lean toward bullet points and lists.</span>
              </li>
              <li className="flex gap-2">
                <span className="font-medium text-amber-600 shrink-0">Perplexity</span>
                <span className="text-zinc-600">— Good for fact checking and citations. Includes web search.</span>
              </li>
            </ul>
          </div>

          {/* Section 3: Quick Tip */}
          <div className="bg-violet-50 border border-violet-100 rounded-lg p-3">
            <p className="text-xs text-violet-700">
              <span className="font-medium">Quick tip:</span> For most workflows, use <span className="font-medium">$ Standard</span> models for Writer and Synthesizing Editor, <span className="font-medium">$ Fast</span> models for Fact Checker.
            </p>
          </div>
        </div>
      </Modal>
    </>
  );
}
