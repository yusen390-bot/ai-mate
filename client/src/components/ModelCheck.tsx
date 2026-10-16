import { useState } from 'react';
import type { FormEvent } from 'react';
import { api } from '../api';

type Bubble = { id: string; role: 'user' | 'assistant'; content: string };

export default function ModelCheck() {
  const [messages, setMessages] = useState<Bubble[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = input.trim();
    if (!text || busy) return;
    setInput('');
    setError(null);
    setMessages((prev) => [...prev, { id: `${Date.now()}-u`, role: 'user', content: text }]);
    setBusy(true);
    try {
      const res = await api.chat(text);
      setMessages((prev) => [...prev, { id: `${Date.now()}-a`, role: 'assistant', content: res.reply || '(空回复)' }]);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mx-auto max-w-3xl">
      <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4 text-xs text-slate-400">
        这里只做<b className="text-slate-200">模型连通性自检</b>：直接调用 OpenAI 兼容接口，不写数据库。
        产品主路径（计划 → 确认 → 执行 → 验证）在第 2、3 周接入。
      </div>

      <div className="mt-4 space-y-3">
        {messages.length === 0 && (
          <p className="rounded-xl border border-slate-800 bg-slate-900/40 p-6 text-center text-sm text-slate-500">
            发一句话测试模型是否可用，例如：你好，请用一句话自我介绍
          </p>
        )}
        {messages.map((message) => (
          <div
            key={message.id}
            className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[80%] whitespace-pre-wrap rounded-xl px-4 py-2.5 text-sm leading-relaxed ${
                message.role === 'user'
                  ? 'bg-sky-600 text-white'
                  : 'border border-slate-800 bg-slate-900 text-slate-100'
              }`}
            >
              {message.content}
            </div>
          </div>
        ))}
        {busy && <p className="text-xs text-slate-500">模型思考中…</p>}
      </div>

      {error && (
        <p className="mt-3 rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-xs text-rose-300">{error}</p>
      )}

      <form className="mt-4 flex gap-2" onSubmit={onSubmit}>
        <input
          className="flex-1 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-sky-500"
          placeholder="说点什么…"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={busy}
        />
        <button
          className="rounded-lg bg-sky-600 px-5 text-sm font-medium text-white disabled:cursor-not-allowed disabled:bg-slate-700"
          type="submit"
          disabled={busy || !input.trim()}
        >
          {busy ? '发送中…' : '发送'}
        </button>
      </form>
    </section>
  );
}