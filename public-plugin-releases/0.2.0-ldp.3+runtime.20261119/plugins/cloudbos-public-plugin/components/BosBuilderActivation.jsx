import React, { useId, useState } from 'react';
import { builderActivationPrompt } from './builder-activation.mjs';
import './BosBuilderActivation.css';

export default function BosBuilderActivation({ projectRef, connectionRoute }) {
  const id = useId();
  const [notice, setNotice] = useState('');
  const prompt = builderActivationPrompt({ projectRef, connectionRoute });
  async function copy() {
    try {
      await navigator.clipboard.writeText(prompt);
      setNotice('Prompt copied. Paste it into the Builder chat.');
    } catch {
      setNotice('Select and copy the prompt below, then paste it into the Builder chat.');
    }
  }
  return <section className="bos-builder-activation" aria-labelledby={`${id}-heading`}>
    <h2 id={`${id}-heading`}>Activate BOS in Builder</h2>
    <p>Copy this prompt and paste it into the Base44 Builder chat for this app. Use it when starting a new conversation or returning to one that has lost context.</p>
    <label htmlFor={`${id}-prompt`}>Prompt to copy</label>
    <textarea id={`${id}-prompt`} value={prompt} readOnly rows={8} />
    <button type="button" onClick={copy}>Copy activation prompt</button>
    <p role="status" aria-live="polite">{notice}</p>
    <p>Wait for Builder to confirm the BOS version, this app’s binding and current stage. Resolve any reported setup problem before asking BOS to guide a build. Copying does not activate BOS or change your saved assistance choices.</p>
  </section>;
}
