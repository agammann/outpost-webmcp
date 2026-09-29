'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  CONFIDENCE_LEVELS,
  LEVELS,
  SEVERITIES,
  type Finding,
  type WorkspaceState,
} from '@/lib/domain';
import {
  emptyWorkspace,
  parseWorkspace,
  saveFinding,
  serializeWorkspace,
} from '@/lib/storage';
import { createSeedWorkspace } from '@/lib/seed-data';

export function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  return (
    <dialog
      ref={ref}
      className="outpost-form-dialog"
      aria-label={title}
      onCancel={onClose}
    >
      <header>
        <h2>{title}</h2>
        <button type="button" onClick={onClose} aria-label="Close dialog">
          ×
        </button>
      </header>
      {children}
    </dialog>
  );
}

export function downloadBackup(state: WorkspaceState) {
  const url = URL.createObjectURL(
    new Blob([serializeWorkspace(state)], { type: 'application/json' }),
  );
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = 'outpost-workspace.json';
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function FindingEditor({
  finding,
  save,
  close,
}: {
  finding?: Finding;
  save: (input: unknown, id?: string) => void;
  close: () => void;
}) {
  const [error, setError] = useState('');
  return (
    <Modal
      title={finding ? `Edit ${finding.id}` : 'Add finding'}
      onClose={close}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          const data = new FormData(event.currentTarget);
          const get = (key: string) => {
            const value = data.get(key);
            return typeof value === 'string' ? value.trim() : '';
          };
          try {
            save(
              {
                title: get('title'),
                description: get('description'),
                component: get('component'),
                severity: get('severity'),
                exploitability: get('exploitability'),
                impact: get('impact'),
                confidence: get('confidence'),
                effortDays: Number(get('effortDays')),
                evidence: get('evidence')
                  .split('\n')
                  .map((s) => s.trim())
                  .filter(Boolean),
                reasoning: get('reasoning'),
                remediation: get('remediation'),
                tags: get('tags')
                  .split(',')
                  .map((s) => s.trim().toLowerCase())
                  .filter(Boolean),
              },
              finding?.id,
            );
            close();
          } catch (cause) {
            setError(
              cause instanceof Error
                ? cause.message
                : 'Could not save finding.',
            );
          }
        }}
      >
        <p>
          Record an existing finding from your review. Outpost organizes your
          information and plans work; it does not scan systems or verify fixes.
        </p>
        {error && <p role="alert">{error}</p>}
        <label>
          Title
          <input
            name="title"
            required
            maxLength={160}
            defaultValue={finding?.title}
          />
        </label>
        <label>
          Component
          <input
            name="component"
            required
            maxLength={120}
            defaultValue={finding?.component}
            placeholder="For example: account settings"
          />
        </label>
        <label>
          Description
          <textarea
            name="description"
            required
            maxLength={4000}
            defaultValue={finding?.description}
          />
        </label>
        <div className="outpost-form-grid">
          {[
            ['severity', 'Severity', SEVERITIES, 'medium'],
            ['exploitability', 'Exploitability', LEVELS, 'medium'],
            ['impact', 'Impact', LEVELS, 'medium'],
            ['confidence', 'Confidence', CONFIDENCE_LEVELS, 'medium'],
          ].map(([name, label, values, fallback]) => (
            <label key={String(name)}>
              {label}
              <select
                name={String(name)}
                defaultValue={finding?.[name as 'severity'] ?? String(fallback)}
              >
                {(values as readonly string[]).map((value) => (
                  <option key={value}>{value}</option>
                ))}
              </select>
            </label>
          ))}
        </div>
        <label>
          Engineering days
          <input
            name="effortDays"
            type="number"
            required
            min="0.5"
            max="60"
            step="any"
            defaultValue={finding?.effortDays ?? 1}
          />
        </label>
        <label>
          Reasoning
          <textarea
            name="reasoning"
            required
            maxLength={4000}
            defaultValue={finding?.reasoning}
          />
        </label>
        <label>
          Remediation plan
          <textarea
            name="remediation"
            required
            maxLength={4000}
            defaultValue={finding?.remediation}
          />
        </label>
        <label>
          Evidence (one reference or note per line)
          <textarea
            name="evidence"
            defaultValue={finding?.evidence.join('\n')}
          />
        </label>
        <label>
          Tags (comma separated)
          <input name="tags" defaultValue={finding?.tags.join(', ')} />
        </label>
        <button type="submit">Save finding</button>
      </form>
    </Modal>
  );
}

export function WorkspaceControls({
  state,
  commit,
  ready,
}: {
  state: WorkspaceState;
  commit: (change: (s: WorkspaceState) => WorkspaceState) => WorkspaceState;
  ready: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [message, setMessage] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const replace = (next: WorkspaceState) => {
    if (
      state.findings.length &&
      !confirm(
        'Replace this workspace? Export a backup first to keep it. Undo is available until reload.',
      )
    )
      return;
    commit(() => next);
    setMessage('Workspace saved in this browser.');
  };
  const run = (fn: () => void) => {
    try {
      fn();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Operation failed.');
    }
  };
  return (
    <section className="outpost-controls" aria-label="Workspace controls">
      <p>
        {state.example
          ? 'Fictional example — enter your own findings to start a real review.'
          : 'Private browser storage. Export a backup to move or keep your review.'}
      </p>
      <div>
        <button disabled={!ready} onClick={() => setEditing(true)}>
          Add finding
        </button>
        <button
          disabled={!ready}
          onClick={() => run(() => downloadBackup(state))}
        >
          Export backup
        </button>
        <button disabled={!ready} onClick={() => input.current?.click()}>
          Import backup
        </button>
        <button
          disabled={!ready}
          onClick={() => run(() => replace(emptyWorkspace()))}
        >
          New workspace
        </button>
        <button
          disabled={!ready}
          onClick={() => run(() => replace(createSeedWorkspace()))}
        >
          Load example
        </button>
        <button
          disabled={!ready}
          onClick={() =>
            run(() => {
              const name = prompt('Workspace name', state.name);
              if (name !== null) commit((s) => ({ ...s, name }));
            })
          }
        >
          Rename
        </button>
      </div>
      <input
        aria-label="Import workspace backup"
        ref={input}
        type="file"
        accept="application/json,.json"
        hidden
        onChange={async (e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (!file) return;
          try {
            if (file.size > 4_000_000)
              throw new Error('Backup must be smaller than 4 MB.');
            const next = parseWorkspace(await file.text());
            replace({ ...next, example: false });
          } catch (cause) {
            setMessage(
              `Import failed; current workspace kept. ${cause instanceof Error ? cause.message : ''}`,
            );
          }
        }}
      />
      {message && <output>{message}</output>}
      {editing && (
        <FindingEditor
          close={() => setEditing(false)}
          save={(data) => commit((s) => saveFinding(s, data))}
        />
      )}
    </section>
  );
}
