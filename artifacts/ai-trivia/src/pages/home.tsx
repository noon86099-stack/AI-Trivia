import { useCallback, useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  getGetTriviaQuestionQueryKey,
  useExplainTriviaAnswer,
  useGetTriviaQuestion,
  useSubmitTriviaAnswer,
} from '@workspace/api-client-react';
import type { AnswerResult, TriviaQuestion } from '@workspace/api-client-react';
import { ArrowRight, Check, CircleHelp, Lightbulb, RefreshCw, RotateCcw, Sparkles, X } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';

const STORAGE_KEY = 'ai-trivia-score-v1';
type Score = { answered: number; correct: number; streak: number; best: number };
const EMPTY: Score = { answered: 0, correct: 0, streak: 0, best: 0 };

function loadScore(): Score {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return EMPTY;
    const p = JSON.parse(raw);
    return { ...EMPTY, ...p };
  } catch {
    return EMPTY;
  }
}

function errInfo(err: unknown): { message: string; retryAfter?: number; code?: string } {
  const e = err as { data?: { error?: string; code?: string; retryAfter?: number }; message?: string } | null;
  return {
    message: e?.data?.error || e?.message || 'Something went wrong. Please try again.',
    retryAfter: e?.data?.retryAfter,
    code: e?.data?.code,
  };
}

const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];
const DIFF: Record<string, { label: string; dots: number }> = {
  easy: { label: 'Easy', dots: 1 },
  medium: { label: 'Medium', dots: 2 },
  hard: { label: 'Hard', dots: 3 },
};

function useCountdown(seconds?: number) {
  const [left, setLeft] = useState(0);
  useEffect(() => {
    if (!seconds) { setLeft(0); return; }
    setLeft(Math.ceil(seconds));
    const t = setInterval(() => setLeft((s) => (s <= 1 ? (clearInterval(t), 0) : s - 1)), 1000);
    return () => clearInterval(t);
  }, [seconds]);
  return left;
}

function ErrorPanel({ title, err, onRetry, retryLabel = 'Try again', extra, testId }: {
  title: string; err: unknown; onRetry: () => void; retryLabel?: string; extra?: React.ReactNode; testId: string;
}) {
  const info = errInfo(err);
  const left = useCountdown(info.retryAfter);
  return (
    <div role="alert" data-testid={testId} className="anim-rise rounded-2xl border-2 border-dashed border-[hsl(var(--bad)/.5)] bg-[hsl(var(--bad-soft))] p-5 text-[hsl(8_60%_24%)]">
      <p className="font-display text-lg font-semibold">{title}</p>
      <p className="mt-1 text-sm leading-relaxed">{info.message}</p>
      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onRetry}
          disabled={left > 0}
          data-testid={`${testId}-retry`}
          className="inline-flex items-center gap-2 rounded-full bg-[hsl(var(--bad))] px-4 py-2 text-sm font-semibold text-white transition-transform hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[hsl(var(--bad)/.35)] disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0"
        >
          <RotateCcw className="h-4 w-4" aria-hidden />
          {left > 0 ? `Retry in ${left}s` : retryLabel}
        </button>
        {extra}
      </div>
    </div>
  );
}

function QuestionSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading question" data-testid="status-question-loading" className="space-y-5">
      <div className="flex gap-2"><div className="shimmer h-6 w-28 rounded-full" /><div className="shimmer h-6 w-16 rounded-full" /></div>
      <div className="space-y-3"><div className="shimmer h-8 w-full rounded-lg" /><div className="shimmer h-8 w-3/4 rounded-lg" /></div>
      <div className="grid gap-3 pt-2 sm:grid-cols-2">
        {[0, 1, 2, 3].map((i) => <div key={i} className="shimmer h-16 rounded-2xl" style={{ animationDelay: `${i * 90}ms` }} />)}
      </div>
    </div>
  );
}

function HowItWorks() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <button type="button" data-testid="button-how-it-works" className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card/70 px-3 py-1.5 text-sm font-medium transition-colors hover:bg-card focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ring/30">
          <CircleHelp className="h-4 w-4" aria-hidden /> How it works
        </button>
      </DialogTrigger>
      <DialogContent className="rounded-3xl border-2 border-foreground/80 bg-card sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl">One question. One thing learned.</DialogTitle>
          <DialogDescription className="text-muted-foreground">A short break that leaves you a little smarter.</DialogDescription>
        </DialogHeader>
        <ol className="space-y-3 text-sm leading-relaxed">
          {[
            'A real question arrives from the Open Trivia Database, with four shuffled options.',
            'Pick one and check it. Your answer locks in and counts once.',
            'An AI tutor explains why the right answer is right, in a few friendly sentences.',
            'Your score lives only on this device. No accounts, no leaderboard.',
          ].map((t, i) => (
            <li key={i} className="flex gap-3">
              <span className="font-mono mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs text-primary-foreground">{i + 1}</span>
              <span>{t}</span>
            </li>
          ))}
        </ol>
        <p className="text-xs text-muted-foreground">Keyboard: press 1–4 to choose, Enter to check or continue.</p>
      </DialogContent>
    </Dialog>
  );
}

export default function Home() {
  const queryClient = useQueryClient();
  const question = useGetTriviaQuestion({
    query: {
      queryKey: getGetTriviaQuestionQueryKey(),
      retry: false,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      staleTime: Infinity,
    },
  });
  const submit = useSubmitTriviaAnswer();
  const explain = useExplainTriviaAnswer();

  const [selected, setSelected] = useState<string | null>(null);
  const [result, setResult] = useState<AnswerResult | null>(null);
  const [score, setScore] = useState<Score>(loadScore);
  const [feedbackKey, setFeedbackKey] = useState(0);
  const counted = useRef<Set<string>>(new Set());
  const nextRef = useRef<HTMLButtonElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => { localStorage.setItem(STORAGE_KEY, JSON.stringify(score)); }, [score]);

  const isFetchingQ = question.isFetching;
  const q: TriviaQuestion | undefined = !isFetchingQ && !question.isError ? question.data : undefined;

  useEffect(() => { if (q) headingRef.current?.focus({ preventScroll: true }); }, [q?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const runExplain = useCallback((questionId: string, answerId: string) => {
    explain.mutate({ data: { questionId, answerId } });
  }, [explain.mutate]); // eslint-disable-line react-hooks/exhaustive-deps

  const check = () => {
    if (!q || !selected || result || submit.isPending) return;
    const qid = q.id; const aid = selected;
    submit.mutate({ data: { questionId: qid, answerId: aid } }, {
      onSuccess: (r) => {
        setResult(r);
        setFeedbackKey((k) => k + 1);
        if (!counted.current.has(qid)) {
          counted.current.add(qid);
          setScore((s) => {
            const streak = r.correct ? s.streak + 1 : 0;
            return { answered: s.answered + 1, correct: s.correct + (r.correct ? 1 : 0), streak, best: Math.max(s.best, streak) };
          });
        }
        runExplain(qid, aid);
      },
    });
  };

  const explanationSettled = explain.isSuccess || explain.isError;
  const canNext = !!result && explanationSettled && !explain.isPending;

  const next = () => {
    setSelected(null);
    setResult(null);
    submit.reset();
    explain.reset();
    void queryClient.refetchQueries({ queryKey: getGetTriviaQuestionQueryKey(), exact: true });
  };
  const freshQuestion = () => { next(); };

  useEffect(() => { if (canNext) nextRef.current?.focus({ preventScroll: true }); }, [canNext]);

  // Keyboard shortcuts
  const stateRef = useRef({ q, selected, result, canNext, pending: submit.isPending });
  stateRef.current = { q, selected, result, canNext, pending: submit.isPending };
  const checkRef = useRef(check); checkRef.current = check;
  const nextFnRef = useRef(next); nextFnRef.current = next;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (document.querySelector('[role="dialog"]')) return;
      const s = stateRef.current;
      if (!s.q || s.result || s.pending) {
        if (e.key === 'Enter' && s.canNext && document.activeElement === document.body) { e.preventDefault(); nextFnRef.current(); }
        return;
      }
      const n = Number(e.key);
      if (n >= 1 && n <= s.q.options.length) { setSelected(s.q.options[n - 1].id); }
      else if (e.key === 'Enter' && s.selected && (document.activeElement === document.body || document.activeElement?.getAttribute('role') === 'radio')) { e.preventDefault(); checkRef.current(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const pct = score.answered ? Math.round((score.correct / score.answered) * 1000) / 10 : 0;
  const locked = !!result || submit.isPending;
  const diff = q ? DIFF[q.difficulty] ?? DIFF.medium : null;

  return (
    <div className="min-h-[100dvh] w-full">
      <a href="#quiz" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-full focus:bg-primary focus:px-4 focus:py-2 focus:text-primary-foreground">Skip to question</a>
      <header className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-5 pt-6 sm:px-8">
        <div className="flex items-center gap-2.5">
          <span aria-hidden className="relative flex h-9 w-9 items-center justify-center rounded-xl bg-foreground text-background">
            <span className="font-display text-lg font-extrabold italic">?</span>
            <span className="absolute -right-1 -top-1 h-3 w-3 rounded-full bg-accent ring-2 ring-background" />
          </span>
          <div className="leading-none">
            <p className="font-display text-xl font-extrabold tracking-tight">AI Trivia</p>
            <p className="mt-0.5 text-xs text-muted-foreground">a daily knowledge break</p>
          </div>
        </div>
        <HowItWorks />
      </header>

      <main id="quiz" className="mx-auto grid max-w-5xl gap-6 px-5 pb-16 pt-8 sm:px-8 lg:grid-cols-[1fr_280px] lg:gap-8">
        <section aria-labelledby="question-heading" className="relative">
          <div className="relative rounded-[28px] border-2 border-foreground/85 bg-card p-5 shadow-[6px_6px_0_0_hsl(var(--foreground)/.85)] sm:p-8">
            {isFetchingQ ? (
              <QuestionSkeleton />
            ) : question.isError ? (
              <ErrorPanel title="The question didn't arrive." err={question.error} onRetry={() => void question.refetch()} retryLabel="Fetch a question" testId="error-question" />
            ) : q ? (
              <div key={q.id} className="anim-rise">
                <div className="flex flex-wrap items-center gap-2">
                  <span data-testid="text-category" className="rounded-full bg-secondary px-3 py-1 text-xs font-semibold uppercase tracking-wider text-secondary-foreground">{q.category}</span>
                  {diff && (
                    <span data-testid="text-difficulty" className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1 text-xs font-semibold">
                      <span aria-hidden className="flex gap-0.5">{[1, 2, 3].map((d) => <span key={d} className={`h-1.5 w-1.5 rounded-full ${d <= diff.dots ? 'bg-accent' : 'bg-border'}`} />)}</span>
                      {diff.label}
                    </span>
                  )}
                </div>
                <h1 id="question-heading" ref={headingRef} tabIndex={-1} data-testid="text-question" className="font-display mt-4 text-[1.6rem] font-semibold leading-[1.2] tracking-tight outline-none sm:text-[2.1rem]">
                  {q.question}
                </h1>

                <div role="radiogroup" aria-labelledby="question-heading" className="mt-6 grid gap-3 sm:grid-cols-2">
                  {q.options.map((o, i) => {
                    const isSel = selected === o.id;
                    const isCorrect = result && o.id === result.correctAnswerId;
                    const isWrongPick = result && isSel && !result.correct;
                    let tone = 'border-border bg-background/60 hover:border-foreground/60 hover:-translate-y-0.5';
                    if (isSel && !result) tone = 'border-primary bg-primary/10 -translate-y-0.5 shadow-[3px_3px_0_0_hsl(var(--primary))]';
                    if (isCorrect) tone = 'border-[hsl(var(--ok))] bg-[hsl(var(--ok-soft))] text-[hsl(162_70%_16%)] anim-pop';
                    if (isWrongPick) tone = 'border-[hsl(var(--bad))] bg-[hsl(var(--bad-soft))] text-[hsl(8_60%_24%)] anim-shake';
                    if (result && !isCorrect && !isWrongPick) tone = 'border-border bg-background/40 opacity-55';
                    return (
                      <button
                        key={o.id}
                        type="button"
                        role="radio"
                        aria-checked={isSel}
                        disabled={locked}
                        onClick={() => setSelected(o.id)}
                        data-testid={`button-option-${i}`}
                        className={`group flex min-h-[64px] items-center gap-3 rounded-2xl border-2 px-4 py-3 text-left text-[15px] font-medium transition-all duration-200 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ring/35 disabled:cursor-default ${tone}`}
                      >
                        <span aria-hidden className={`font-mono flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-sm transition-colors ${
                          isCorrect ? 'bg-[hsl(var(--ok))] text-white' : isWrongPick ? 'bg-[hsl(var(--bad))] text-white' : isSel ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground group-hover:bg-foreground group-hover:text-background'
                        }`}>
                          {isCorrect ? <Check className="h-4 w-4" /> : isWrongPick ? <X className="h-4 w-4" /> : LETTERS[i]}
                        </span>
                        <span className="flex-1">{o.text}</span>
                        {isCorrect && <span className="sr-only">(correct answer)</span>}
                        {isWrongPick && <span className="sr-only">(your answer, incorrect)</span>}
                      </button>
                    );
                  })}
                </div>

                {submit.isError && !result && (
                  <div className="mt-5">
                    <ErrorPanel
                      title="We couldn't check that answer."
                      err={submit.error}
                      onRetry={check}
                      testId="error-check"
                      extra={
                        <button type="button" onClick={freshQuestion} data-testid="button-new-question" className="inline-flex items-center gap-2 rounded-full border-2 border-[hsl(var(--bad)/.5)] px-4 py-2 text-sm font-semibold focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[hsl(var(--bad)/.3)]">
                          <RefreshCw className="h-4 w-4" aria-hidden /> Get a new question
                        </button>
                      }
                    />
                  </div>
                )}

                <div aria-live="polite" className="mt-6">
                  {result && (
                    <div key={feedbackKey} data-testid="status-feedback" className={`anim-rise flex items-start gap-3 rounded-2xl px-4 py-3 ${result.correct ? 'bg-[hsl(var(--ok))] text-white' : 'bg-foreground text-background'}`}>
                      <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/20">
                        {result.correct ? <Check className="h-4 w-4" aria-hidden /> : <X className="h-4 w-4" aria-hidden />}
                      </span>
                      <div>
                        <p className="font-display text-lg font-semibold">{result.correct ? 'Right on.' : 'Not this time.'}</p>
                        <p className="text-sm opacity-90">
                          {result.correct ? <>The answer is <strong>{result.correctAnswer}</strong>.</> : <>You picked <strong>{result.selectedAnswer}</strong>. The answer is <strong>{result.correctAnswer}</strong>.</>}
                        </p>
                      </div>
                    </div>
                  )}
                </div>

                {result && (
                  <article data-testid="card-explanation" aria-busy={explain.isPending} className="anim-rise relative mt-4 overflow-hidden rounded-2xl border-2 border-dashed border-primary/40 bg-[hsl(var(--sun)/.16)] p-5" style={{ animationDelay: '120ms' }}>
                    <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-primary">
                      <Lightbulb className="h-4 w-4" aria-hidden /> Why it's true
                    </div>
                    {explain.isPending && (
                      <div className="space-y-2" data-testid="status-explanation-loading">
                        <span className="sr-only">Writing an explanation</span>
                        <div className="shimmer h-4 w-full rounded" /><div className="shimmer h-4 w-11/12 rounded" /><div className="shimmer h-4 w-2/3 rounded" />
                      </div>
                    )}
                    {explain.isSuccess && (
                      <>
                        <p data-testid="text-explanation" className="font-display whitespace-pre-line text-[17px] leading-relaxed">{explain.data.explanation}</p>
                        <p className="mt-3 inline-flex items-center gap-1.5 font-mono text-[11px] text-muted-foreground"><Sparkles className="h-3 w-3" aria-hidden /> explained by {explain.data.model}</p>
                      </>
                    )}
                    {explain.isError && (
                      <ErrorPanel title="The explanation stalled." err={explain.error} onRetry={() => runExplain(q.id, selected ?? '')} retryLabel="Retry explanation" testId="error-explanation" />
                    )}
                  </article>
                )}

                <div className="mt-6 flex flex-col-reverse items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-xs text-muted-foreground">
                    {!result ? (selected ? 'Locked in once you check.' : 'Pick an answer (keys 1–4).') : !canNext ? 'Waiting for the explanation…' : 'Ready when you are.'}
                  </p>
                  {!result ? (
                    <button
                      type="button"
                      onClick={check}
                      disabled={!selected || submit.isPending}
                      data-testid="button-check"
                      className="inline-flex items-center justify-center gap-2 rounded-full bg-primary px-7 py-3.5 text-base font-semibold text-primary-foreground shadow-[3px_3px_0_0_hsl(var(--foreground))] transition-all hover:-translate-y-0.5 active:translate-y-0 active:shadow-none focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ring/40 disabled:cursor-not-allowed disabled:opacity-45 disabled:shadow-none disabled:hover:translate-y-0"
                    >
                      {submit.isPending ? <><span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden /> Checking</> : <>Check answer <Check className="h-4 w-4" aria-hidden /></>}
                    </button>
                  ) : (
                    <button
                      ref={nextRef}
                      type="button"
                      onClick={next}
                      disabled={!canNext}
                      data-testid="button-next"
                      className="inline-flex items-center justify-center gap-2 rounded-full bg-accent px-7 py-3.5 text-base font-semibold text-accent-foreground shadow-[3px_3px_0_0_hsl(var(--foreground))] transition-all hover:-translate-y-0.5 active:translate-y-0 active:shadow-none focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent/40 disabled:cursor-not-allowed disabled:opacity-45 disabled:shadow-none disabled:hover:translate-y-0"
                    >
                      Next question <ArrowRight className="h-4 w-4" aria-hidden />
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <ErrorPanel title="No question loaded." err={null} onRetry={() => void question.refetch()} retryLabel="Fetch a question" testId="error-empty" />
            )}
          </div>
        </section>

        <aside aria-label="Your score on this device" className="lg:pt-2">
          <div className="rounded-[24px] bg-foreground p-5 text-background">
            <p className="text-xs font-semibold uppercase tracking-wider opacity-70">This device</p>
            <div className="mt-2 flex items-baseline gap-2" aria-live="polite">
              <span key={score.correct} data-testid="text-score" className="font-display anim-pop inline-block text-5xl font-extrabold">{score.correct}</span>
              <span className="font-mono text-sm opacity-70">/ {score.answered} correct</span>
            </div>
            <div className="mt-4 h-2 overflow-hidden rounded-full bg-background/15" aria-hidden>
              <div className="h-full origin-left rounded-full bg-[hsl(var(--sun))] transition-transform duration-700" style={{ transform: `scaleX(${score.answered ? score.correct / score.answered : 0})` }} />
            </div>
            <dl className="mt-4 grid grid-cols-3 gap-2 text-center">
              {[['Accuracy', score.answered ? `${pct}%` : '—'], ['Streak', score.streak], ['Best', score.best]].map(([k, v]) => (
                <div key={k as string} className="rounded-xl bg-background/10 px-2 py-2">
                  <dt className="text-[10px] uppercase tracking-wider opacity-70">{k}</dt>
                  <dd data-testid={`text-stat-${(k as string).toLowerCase()}`} className="font-mono text-lg font-semibold">{v}</dd>
                </div>
              ))}
            </dl>
            <button
              type="button"
              onClick={() => { if (window.confirm('Reset your score on this device?')) { setScore(EMPTY); } }}
              disabled={score.answered === 0}
              data-testid="button-reset-score"
              className="mt-4 inline-flex items-center gap-1.5 text-xs font-medium opacity-70 underline-offset-4 hover:underline hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--sun))] disabled:opacity-30"
            >
              <RotateCcw className="h-3 w-3" aria-hidden /> Reset score
            </button>
          </div>
          <p className="mt-4 px-1 text-xs leading-relaxed text-muted-foreground">
            Questions from the Open Trivia Database. Explanations are AI-written and can occasionally be wrong.
          </p>
        </aside>
      </main>
    </div>
  );
}
