import { useState } from "react";

interface FeatureRequestBarProps {
  onGeneratePlan: (prompt: string) => void;
  onGenerateCodeReview: (prompt: string) => void;
  isGeneratingPlan?: boolean;
  isGeneratingCodeReview?: boolean;
  generatingSummary?: string;
}

export function FeatureRequestBar({
  onGeneratePlan,
  onGenerateCodeReview,
  isGeneratingPlan = false,
  isGeneratingCodeReview = false,
  generatingSummary
}: FeatureRequestBarProps) {
  const [prompt, setPrompt] = useState(
    "Implement a login feature for the web app and break it into reviewable tasks."
  );

  const quickPrompts = [
    "Implement a login feature for the web app",
    "Add a SignalR notification feature",
    "Review this project for security and DRY risks",
    "Suggest the next feature for this solution"
  ];

  return (
    <section className="feature-request-bar">
      <div className="feature-request-bar__copy">
        <p className="eyebrow">Start here</p>
        <h2>What do you want to build or review?</h2>
      </div>

      <div className="assistant-quick-prompts feature-request-bar__quick-prompts">
        {quickPrompts.map((quickPrompt) => (
          <button
            type="button"
            className="badge badge--soft assistant-quick-prompts__chip"
            key={quickPrompt}
            onClick={() => setPrompt(quickPrompt)}
            disabled={isGeneratingPlan || isGeneratingCodeReview}
          >
            {quickPrompt}
          </button>
        ))}
      </div>

      <label className="prompt-box feature-request-bar__composer">
        <span>Feature request</span>
        <textarea
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          rows={2}
          disabled={isGeneratingPlan || isGeneratingCodeReview}
        />
      </label>

      <div className="button-row feature-request-bar__actions">
        <button
          type="button"
          onClick={() => onGeneratePlan(prompt)}
          disabled={isGeneratingPlan || isGeneratingCodeReview}
        >
          {isGeneratingPlan ? "Thinking..." : "Generate plan"}
        </button>
        <button
          type="button"
          className="button-secondary"
          onClick={() => onGenerateCodeReview(prompt)}
          disabled={isGeneratingPlan || isGeneratingCodeReview}
        >
          {isGeneratingCodeReview ? "Generating review..." : "Generate code review"}
        </button>
      </div>

      {isGeneratingPlan && generatingSummary ? (
        <div className="feature-request-bar__status">
          <span className="badge badge--soft">thinking</span>
          <p>{generatingSummary}</p>
        </div>
      ) : null}
    </section>
  );
}
